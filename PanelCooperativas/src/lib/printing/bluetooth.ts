"use client";

// ─── Impresora térmica Bluetooth (Web Bluetooth) · #53, PC-51 ────────────────
// - `pair()`: el navegador muestra el selector (requiere un clic). Se guarda el id
//   y el nombre en localStorage para reconectar al volver a abrir el panel.
// - `reconectar()`: con `navigator.bluetooth.getDevices()` (Chrome/Edge con
//   permisos guardados) busca la impresora guardada y se conecta sin selector.
// - Si la impresora se desconecta (`gattserverdisconnected`), se reintenta 3 veces
//   (a los 2 s, 5 s y 10 s) antes de darla por desconectada.
// - `suscribir` / `estadoActual` alimentan `useSyncExternalStore` (hooks/use-impresora).

const SERVICIO = "000018f0-0000-1000-8000-00805f9b34fb";
const CARACTERISTICA = "00002af1-0000-1000-8000-00805f9b34fb";
const CLAVE_ID = "bt_printer_id";
const CLAVE_NOMBRE = "bt_printer_name";
/** Esperas entre reintentos tras una desconexión. */
const REINTENTOS_MS = [2000, 5000, 10000];
/** Límite de escritura BLE por paquete. */
const TAMANO_PAQUETE = 512;

export type EstadoImpresora = "conectada" | "reconectando" | "desconectada" | "no-soportado";
export type InstantaneaImpresora = { estado: EstadoImpresora; nombre: string | null };

/** Instantánea del servidor (y del primer render del cliente): sin impresora. */
export const IMPRESORA_SERVIDOR: InstantaneaImpresora = { estado: "desconectada", nombre: null };

function leer(clave: string): string | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage.getItem(clave);
  } catch {
    return null;
  }
}

function guardar(clave: string, valor: string) {
  try {
    window.localStorage.setItem(clave, valor);
  } catch {
    // Sin almacenamiento (modo privado): la impresora sirve igual, solo no se reconecta sola.
  }
}

/** true si este navegador puede usar impresoras Bluetooth (Chrome o Edge). */
export function bluetoothSoportado(): boolean {
  return typeof navigator !== "undefined" && "bluetooth" in navigator && Boolean(navigator.bluetooth);
}

/** Mensaje claro para los errores de Web Bluetooth; null si la persona cerró el selector sin elegir. */
export function mensajeErrorImpresora(err: unknown): string | null {
  const nombre = err instanceof Error ? err.name : "";
  if (nombre === "NotFoundError" || nombre === "AbortError") return null;
  if (nombre === "NotSupportedError" || !bluetoothSoportado()) {
    return "Este navegador no puede usar impresoras Bluetooth. Usa Chrome o Edge.";
  }
  if (nombre === "SecurityError" || nombre === "NotAllowedError") {
    return "El navegador no dio permiso para usar Bluetooth. Permítelo en la configuración del sitio e intenta de nuevo.";
  }
  if (nombre === "NetworkError") {
    return "Se perdió la conexión con la impresora. Revisa que esté encendida y cerca, y conéctala de nuevo.";
  }
  return "No pudimos usar la impresora. Revisa que esté encendida y cerca, e intenta de nuevo.";
}

class BluetoothPrinter {
  private device: BluetoothDevice | null = null;
  private characteristic: BluetoothRemoteGATTCharacteristic | null = null;
  private reconectando = false;
  private temporizador: ReturnType<typeof setTimeout> | null = null;
  private oyentes = new Set<() => void>();
  private instantanea: InstantaneaImpresora | null = null;

  private alDesconectar = () => {
    this.characteristic = null;
    void this.reintentar();
  };

  // ── Estado observable ──

  /** Para `useSyncExternalStore`: avisa cada vez que cambia el estado. */
  suscribir = (oyente: () => void): (() => void) => {
    this.oyentes.add(oyente);
    return () => {
      this.oyentes.delete(oyente);
    };
  };

  /** Instantánea estable (mismo objeto mientras no cambie el estado). */
  estadoActual = (): InstantaneaImpresora => {
    const estado: EstadoImpresora = !bluetoothSoportado()
      ? "no-soportado"
      : this.isConnected
        ? "conectada"
        : this.reconectando
          ? "reconectando"
          : "desconectada";
    const nombre = this.device?.name || this.printerName;
    if (!this.instantanea || this.instantanea.estado !== estado || this.instantanea.nombre !== nombre) {
      this.instantanea = { estado, nombre };
    }
    return this.instantanea;
  };

  private avisar() {
    for (const oyente of this.oyentes) oyente();
  }

  private usar(device: BluetoothDevice) {
    if (this.device && this.device !== device) {
      this.device.removeEventListener("gattserverdisconnected", this.alDesconectar);
    }
    this.device = device;
    device.removeEventListener("gattserverdisconnected", this.alDesconectar);
    device.addEventListener("gattserverdisconnected", this.alDesconectar);
  }

  // ── Conexión ──

  /** Emparejar una impresora (requiere un clic de la persona). */
  async pair(): Promise<{ name: string; id: string }> {
    const device = await navigator.bluetooth.requestDevice({ filters: [{ services: [SERVICIO] }] });
    this.cancelarReintentos();
    this.usar(device);
    await this.connect();
    guardar(CLAVE_ID, device.id);
    guardar(CLAVE_NOMBRE, device.name || "Impresora");
    this.avisar();
    return { name: device.name || "Impresora", id: device.id };
  }

  /** Conectar a la impresora ya emparejada en esta sesión. */
  async connect(): Promise<void> {
    if (!this.device) throw new Error("No hay impresora emparejada");
    if (!this.device.gatt) throw new Error("GATT no disponible");
    const server = await this.device.gatt.connect();
    const service = await server.getPrimaryService(SERVICIO);
    this.characteristic = await service.getCharacteristic(CARACTERISTICA);
    this.avisar();
  }

  /**
   * Reconecta la impresora guardada sin abrir el selector. Devuelve true si quedó
   * conectada. Sin `getDevices()` (permisos no persistentes) devuelve false.
   */
  async reconectar(): Promise<boolean> {
    if (this.isConnected) return true;
    if (!bluetoothSoportado() || this.reconectando) return false;
    this.cancelarReintentos();
    this.reconectando = true;
    this.avisar();
    try {
      if (!this.device) {
        const idGuardado = leer(CLAVE_ID);
        const bt = navigator.bluetooth;
        if (!idGuardado || typeof bt.getDevices !== "function") return false;
        const dispositivos = await bt.getDevices();
        const guardado = dispositivos.find((d) => d.id === idGuardado);
        if (!guardado) return false;
        this.usar(guardado);
      }
      await this.connect();
      return true;
    } catch {
      // Apagada o lejos: queda "Sin conectar" y se puede conectar con el botón.
      this.characteristic = null;
      return false;
    } finally {
      this.reconectando = false;
      this.avisar();
    }
  }

  private cancelarReintentos() {
    if (this.temporizador) clearTimeout(this.temporizador);
    this.temporizador = null;
  }

  /** Tras una desconexión: 3 intentos (2 s, 5 s, 10 s). */
  private async reintentar(intento = 0): Promise<void> {
    this.cancelarReintentos();
    if (!this.device || this.isConnected) {
      this.avisar();
      return;
    }
    if (intento >= REINTENTOS_MS.length) {
      this.reconectando = false;
      this.avisar();
      return;
    }
    this.reconectando = true;
    this.avisar();
    this.temporizador = setTimeout(() => {
      this.temporizador = null;
      this.connect()
        .then(() => {
          this.reconectando = false;
          this.avisar();
        })
        .catch(() => {
          void this.reintentar(intento + 1);
        });
    }, REINTENTOS_MS[intento]);
  }

  /** Enviar bytes ESC/POS (en paquetes de 512 bytes). Si se cayó la conexión, intenta reconectar una vez. */
  async write(data: Uint8Array): Promise<void> {
    if (!this.characteristic && this.device) {
      this.cancelarReintentos();
      await this.connect();
    }
    if (!this.characteristic) throw new Error("No conectada");
    for (let i = 0; i < data.length; i += TAMANO_PAQUETE) {
      // Copia en un ArrayBuffer propio: writeValue no acepta vistas sobre SharedArrayBuffer.
      await this.characteristic.writeValue(data.slice(i, i + TAMANO_PAQUETE));
    }
  }

  get isConnected(): boolean {
    return Boolean(this.characteristic) && (this.device?.gatt?.connected ?? false);
  }

  /** Nombre de la impresora guardada en este equipo (aunque no esté conectada). */
  get printerName(): string | null {
    return leer(CLAVE_NOMBRE);
  }
}

export const printer = new BluetoothPrinter();
