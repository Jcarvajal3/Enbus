# Fase 6 — Hardware, Modo Offline y Polish

> **Prerrequisito**: Fases 1-5 completas (toda la funcionalidad operativa).

---

## Tarea 1: Servicio de Impresión Bluetooth (ESC/POS)

**Archivo**: `src/lib/printing/bluetooth.ts` (`"use client"` — solo browser)

### 1.1 Clase BluetoothPrinter

```typescript
class BluetoothPrinter {
  private device: BluetoothDevice | null = null;
  private characteristic: BluetoothRemoteGATTCharacteristic | null = null;

  // Emparejar impresora (requiere user gesture)
  async pair(): Promise<{ name: string; id: string }> {
    this.device = await navigator.bluetooth.requestDevice({
      filters: [{ services: ["000018f0-0000-1000-8000-00805f9b34fb"] }],
      // Alternativa genérica si no se conoce el UUID:
      // acceptAllDevices: true,
      // optionalServices: ["000018f0-0000-1000-8000-00805f9b34fb"]
    });
    await this.connect();
    // Guardar ID en localStorage para reconexión
    localStorage.setItem("bt_printer_id", this.device.id);
    localStorage.setItem("bt_printer_name", this.device.name || "Impresora");
    return { name: this.device.name || "Impresora", id: this.device.id };
  }

  // Conectar a impresora previamente emparejada
  async connect(): Promise<void> {
    if (!this.device) throw new Error("No hay impresora emparejada");
    const server = await this.device.gatt!.connect();
    const service = await server.getPrimaryService("000018f0-0000-1000-8000-00805f9b34fb");
    this.characteristic = await service.getCharacteristic("00002af1-0000-1000-8000-00805f9b34fb");
  }

  // Enviar bytes ESC/POS
  async write(data: Uint8Array): Promise<void> {
    if (!this.characteristic) throw new Error("No conectada");
    // Enviar en chunks de 512 bytes (límite BLE)
    const CHUNK_SIZE = 512;
    for (let i = 0; i < data.length; i += CHUNK_SIZE) {
      const chunk = data.slice(i, i + CHUNK_SIZE);
      await this.characteristic.writeValue(chunk);
    }
  }

  get isConnected(): boolean {
    return this.device?.gatt?.connected ?? false;
  }

  get printerName(): string | null {
    return localStorage.getItem("bt_printer_name");
  }
}

export const printer = new BluetoothPrinter();
```

### 1.2 Comandos ESC/POS para tickets

**Archivo**: `src/lib/printing/escpos.ts`

```typescript
const ESC = 0x1b;
const GS = 0x1d;

export function buildTicket(data: {
  title: string;
  lines: { label: string; value: string }[];
  qrData?: string;
  footer?: string;
}): Uint8Array {
  const encoder = new TextEncoder();
  const parts: Uint8Array[] = [];

  // Inicializar impresora
  parts.push(new Uint8Array([ESC, 0x40])); // ESC @ — Reset

  // Centrar texto
  parts.push(new Uint8Array([ESC, 0x61, 0x01])); // Center align

  // Título en negrita + doble tamaño
  parts.push(new Uint8Array([ESC, 0x45, 0x01])); // Bold on
  parts.push(new Uint8Array([GS, 0x21, 0x11]));  // Double height+width
  parts.push(encoder.encode(data.title + "\n"));
  parts.push(new Uint8Array([GS, 0x21, 0x00]));  // Normal size
  parts.push(new Uint8Array([ESC, 0x45, 0x00])); // Bold off

  // Separador
  parts.push(encoder.encode("--------------------------------\n"));

  // Alinear izquierda
  parts.push(new Uint8Array([ESC, 0x61, 0x00]));

  // Líneas clave-valor
  for (const line of data.lines) {
    parts.push(encoder.encode(`${line.label}: ${line.value}\n`));
  }

  // QR (si la impresora lo soporta)
  if (data.qrData) {
    // Comando QR genérico ESC/POS varía por impresora
    // Omitir si no es compatible — imprimir código textual como fallback
    parts.push(encoder.encode(`\nCódigo: ${data.qrData}\n`));
  }

  // Footer
  if (data.footer) {
    parts.push(new Uint8Array([ESC, 0x61, 0x01])); // Center
    parts.push(encoder.encode(`\n${data.footer}\n`));
  }

  // Avanzar papel + cortar
  parts.push(encoder.encode("\n\n\n"));
  parts.push(new Uint8Array([GS, 0x56, 0x00])); // Cut paper

  // Concatenar
  const total = parts.reduce((sum, p) => sum + p.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}
```

### 1.3 Funciones de impresión específicas

**Archivo**: `src/lib/printing/print-helpers.ts`

```typescript
export async function printGuiaEncomienda(encomienda: Encomienda) {
  const ticket = buildTicket({
    title: "GUÍA DE ENVÍO",
    lines: [
      { label: "Tracking", value: encomienda.tracking_id },
      { label: "Remitente", value: encomienda.sender?.nombre_completo || "" },
      { label: "Destinatario", value: encomienda.receiver_nombre },
      { label: "Ruta", value: `${encomienda.ciudad_origen} → ${encomienda.ciudad_destino}` },
      { label: "Peso", value: `${encomienda.peso_kg} kg` },
      { label: "Costo", value: `$${encomienda.costo_calculado}` },
    ],
    qrData: encomienda.tracking_id,
    footer: "EnBus — Envíos rápidos y seguros",
  });
  await printer.write(ticket);
}

export async function printBoleto(boleto: Boleto) {
  const ticket = buildTicket({
    title: "BOLETO DE VIAJE",
    lines: [
      { label: "Código", value: boleto.codigo_boleto },
      { label: "Pasajero", value: boleto.pasajero_nombre || "" },
      { label: "Asiento", value: boleto.asiento },
      { label: "Precio", value: `$${boleto.precio}` },
    ],
    qrData: boleto.qr_embarque_data || undefined,
    footer: "Presente este boleto al abordar",
  });
  await printer.write(ticket);
}
```

### 1.4 Fallback: window.print()

Si Web Bluetooth no está disponible (`!navigator.bluetooth`):

```typescript
export function printFallback(content: string) {
  const printWindow = window.open("", "_blank");
  if (!printWindow) return;
  printWindow.document.write(`
    <html><head><style>
      body { font-family: monospace; font-size: 12px; width: 280px; }
    </style></head><body>${content}</body></html>
  `);
  printWindow.document.close();
  printWindow.print();
  printWindow.close();
}
```

### Criterio de aceptación
- [ ] Emparejar impresora Bluetooth funciona en Chrome
- [ ] Imprimir guía de encomienda genera ticket legible
- [ ] Imprimir boleto genera ticket con QR textual
- [ ] Fallback `window.print()` funciona en navegadores sin Web Bluetooth
- [ ] Reconexión automática con device ID guardado en localStorage

---

## Tarea 2: Página de Configuración de Hardware

**Archivo**: `src/app/cooperativas/(panel)/configuracion/hardware/page.tsx`

### 2.1 Sección Impresora

```
┌──────────────────────────────────────────┐
│  🖨️ Impresora Bluetooth                  │
│                                           │
│  Estado: 🟢 Conectada — "POS-58"         │
│  (o)                                      │
│  Estado: 🔴 Desconectada                  │
│                                           │
│  [Emparejar Impresora]  [Test de Impresión]│
│                                           │
│  ℹ️ Solo compatible con Chrome.           │
│  Safari/Firefox usarán impresión estándar. │
└──────────────────────────────────────────┘
```

- "Emparejar Impresora" → `printer.pair()` (requiere click del usuario)
- "Test de Impresión" → imprimir ticket de prueba
- Mostrar nombre de impresora guardado y estado de conexión

### 2.2 Sección Escáner

```
┌──────────────────────────────────────────┐
│  📱 Escáner de Códigos                    │
│                                           │
│  Input de prueba: [________________]      │
│                                           │
│  Escanee un código para verificar que     │
│  el escáner USB funciona correctamente.   │
│  Resultado: ✅ "EB-260510-A1B2C" (12ms)  │
└──────────────────────────────────────────┘
```

- Input con autofocus + detección de velocidad de entrada
- Si >6 chars en <500ms → "✅ Escáner detectado" + mostrar código + tiempo

### Criterio de aceptación
- [ ] Botón emparejar abre selector Bluetooth del navegador
- [ ] Nombre de impresora se guarda y se muestra
- [ ] Test imprime ticket de prueba
- [ ] Test de escáner detecta entrada rápida

---

## Tarea 3: Fallback de Cámara para QR

**Archivo**: `src/components/camera-qr-scanner.tsx` (`"use client"`)

### 3.1 Instalar dependencia

```bash
npm install jsqr
```

### 3.2 Componente

```typescript
// Botón "Escanear con Cámara" (visible como alternativa al ScanInput)
// Al click → abrir Dialog con video stream
// Cada frame: extraer imageData del canvas → jsQR(imageData, w, h)
// Si detecta QR → cerrar dialog → devolver código via callback

interface CameraQRScannerProps {
  onScan: (code: string) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function CameraQRScanner({ onScan, open, onOpenChange }: CameraQRScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>();

  useEffect(() => {
    if (!open) return;
    let stream: MediaStream;

    async function start() {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      videoRef.current!.srcObject = stream;
      scanLoop();
    }

    function scanLoop() {
      const video = videoRef.current!;
      const canvas = canvasRef.current!;
      const ctx = canvas.getContext("2d")!;

      if (video.readyState === video.HAVE_ENOUGH_DATA) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, canvas.width, canvas.height);
        if (code) {
          onScan(code.data);
          onOpenChange(false);
          return;
        }
      }
      animationRef.current = requestAnimationFrame(scanLoop);
    }

    start();
    return () => {
      stream?.getTracks().forEach(t => t.stop());
      cancelAnimationFrame(animationRef.current!);
    };
  }, [open]);

  // Render: Dialog con <video> + <canvas hidden> + guía visual
}
```

### 3.3 Integración con ScanInput

Agregar botón "📷" al lado del `ScanInput` que abre el `CameraQRScanner`.

### Criterio de aceptación
- [ ] Botón de cámara abre visor con feed en vivo
- [ ] Detecta QR automáticamente y cierra el visor
- [ ] Código detectado se pasa al callback (misma lógica que escaneo USB)
- [ ] Cámara se detiene al cerrar

---

## Tarea 4: Service Worker (Cache Offline)

**Archivo**: `public/sw.js`

### 4.1 Estrategias de cache

```javascript
const CACHE_NAME = "enbus-panel-v1";
const STATIC_ASSETS = [
  "/cooperativas/login",
  // Los assets JS/CSS se cachean automáticamente
];

// Install: pre-cachear shell de la app
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// Activate: limpiar caches viejos
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch: cache-first para assets, network-first para API
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Assets estáticos: cache-first
  if (url.pathname.match(/\.(js|css|png|svg|woff2?)$/)) {
    event.respondWith(
      caches.match(event.request).then((cached) =>
        cached || fetch(event.request).then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return response;
        })
      )
    );
    return;
  }

  // API/datos: network-first
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});
```

### 4.2 Registrar Service Worker

**Archivo**: `src/app/cooperativas/(panel)/layout.tsx` — agregar:

```typescript
useEffect(() => {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/sw.js");
  }
}, []);
```

### Criterio de aceptación
- [ ] Assets se cachean y cargan offline
- [ ] API calls fallan gracefully cuando no hay red

---

## Tarea 5: Banner de Conectividad

**Archivo**: `src/components/connectivity-banner.tsx` (`"use client"`)

### 5.1 Hook de conectividad

```typescript
export function useConnectivity() {
  const [online, setOnline] = useState(true);
  const [wasOffline, setWasOffline] = useState(false);

  useEffect(() => {
    const check = async () => {
      try {
        const res = await fetch(process.env.NEXT_PUBLIC_SUPABASE_URL + "/rest/v1/", {
          method: "HEAD",
          signal: AbortSignal.timeout(5000),
        });
        if (!online) setWasOffline(true);
        setOnline(res.ok);
      } catch {
        setOnline(false);
      }
    };

    // Eventos nativos
    window.addEventListener("online", () => check());
    window.addEventListener("offline", () => setOnline(false));

    // Poll cada 10 segundos
    const interval = setInterval(check, 10000);
    check();

    return () => {
      clearInterval(interval);
      window.removeEventListener("online", () => check());
      window.removeEventListener("offline", () => setOnline(false));
    };
  }, []);

  return { online, wasOffline, clearWasOffline: () => setWasOffline(false) };
}
```

### 5.2 Banner UI

```tsx
// Renderizar en el layout del panel, arriba de todo
export function ConnectivityBanner() {
  const { online, wasOffline, clearWasOffline } = useConnectivity();

  if (!online) {
    return (
      <div className="bg-destructive text-destructive-foreground px-4 py-2 text-center text-sm font-medium">
        ⚠️ Sin conexión a internet. Funcionalidad limitada.
      </div>
    );
  }

  if (wasOffline) {
    // Mostrar banner verde por 5 segundos, luego auto-ocultar
    setTimeout(clearWasOffline, 5000);
    return (
      <div className="bg-emerald-600 text-white px-4 py-2 text-center text-sm font-medium">
        ✓ Conexión restaurada. Sincronizando...
      </div>
    );
  }

  return null;
}
```

- Banner rojo **no se puede cerrar manualmente** (spec explícito)
- Banner verde se auto-oculta tras 5 segundos

### 5.3 Bloquear operaciones offline

Crear wrapper para Server Actions:

```typescript
export function requireOnline<T>(action: () => Promise<T>): () => Promise<T> {
  return async () => {
    if (!navigator.onLine) {
      throw new Error("Esta operación requiere conexión a internet.");
    }
    return action();
  };
}
```

O manejar en cada botón de acción: `disabled={!online}`.

### Criterio de aceptación
- [ ] Banner rojo aparece al perder conexión, no se puede cerrar
- [ ] Banner verde aparece al restaurar, se auto-oculta
- [ ] Poll cada 10 segundos detecta cambios
- [ ] Botones de escritura se deshabilitan offline

---

## Tarea 6: Configuración de Cooperativa

**Archivo**: `src/app/cooperativas/(panel)/configuracion/page.tsx`

### 6.1 Secciones (usar `Tabs` de shadcn)

**Tab 1: Datos de la Cooperativa** (solo admin)
- Nombre (read-only, solo Super Admin puede cambiar)
- RIF (read-only)
- Logo: preview + botón "Cambiar Logo" → upload a `logos-cooperativas` bucket
- Comisión %: read-only (definida por Super Admin)

**Tab 2: Métodos de Pago** (solo admin)
- Reutilizar la página existente de métodos de pago
- Tabla CRUD de `metodos_pago_cooperativa`
- Formulario: tipo (select), banco, titular, número cuenta, cédula/RIF, email zelle, instrucciones
- Toggle activo/inactivo por método

**Tab 3: Sucursales** (solo admin)
- Tabla CRUD de `sucursales`
- Formulario: nombre, estado geográfico, ciudad, dirección, teléfono
- Toggle activa/inactiva

**Tab 4: Hardware** → link a `/cooperativas/configuracion/hardware` (Tarea 2)

### Criterio de aceptación
- [ ] Admin puede subir/cambiar logo
- [ ] CRUD de métodos de pago funcional
- [ ] CRUD de sucursales funcional
- [ ] Taquillero no puede acceder a configuración

---

## Tarea 7: PWA Manifest

**Archivo**: `public/manifest.json`

```json
{
  "name": "EnBus — Panel de Cooperativas",
  "short_name": "EnBus Panel",
  "description": "Panel de gestión operativa para cooperativas de transporte",
  "start_url": "/cooperativas/dashboard",
  "display": "standalone",
  "background_color": "#09090b",
  "theme_color": "#09090b",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

Agregar en `src/app/layout.tsx`:
```html
<link rel="manifest" href="/manifest.json" />
<meta name="theme-color" content="#09090b" />
```

### Criterio de aceptación
- [ ] Chrome muestra opción "Instalar aplicación"
- [ ] App instalada abre en modo standalone (sin barra de URL)
- [ ] Iconos se muestran correctamente

---

## Tarea 8: Polish Final

### 8.1 Error Boundaries

Crear `src/app/cooperativas/(panel)/error.tsx`:
```tsx
"use client";
export default function Error({ error, reset }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-20">
      <h2 className="text-xl font-bold">Algo salió mal</h2>
      <p className="text-muted-foreground">{error.message}</p>
      <Button onClick={reset}>Reintentar</Button>
    </div>
  );
}
```

### 8.2 Loading States

Crear `src/app/cooperativas/(panel)/loading.tsx`:
```tsx
export default function Loading() {
  return <div className="flex flex-col gap-4 p-6">
    <Skeleton className="h-8 w-48" />
    <Skeleton className="h-64 w-full" />
  </div>;
}
```

### 8.3 Not Found

Crear `src/app/cooperativas/(panel)/not-found.tsx` con diseño consistente.

### 8.4 Responsive final

- Sidebar colapsable en pantallas < 768px
- Tablas con scroll horizontal en mobile
- Modales full-screen en mobile (`Dialog` con `className="sm:max-w-lg"`)

### 8.5 Performance

- Prefetch de rutas frecuentes: `<Link prefetch>` en sidebar
- Optimistic updates en cambios de estado
- Debounce en campos de búsqueda (300ms)

### Criterio de aceptación
- [ ] Errores no crashean la app — se muestra UI de error con retry
- [ ] Loading states con skeletons en todas las páginas
- [ ] Responsive funcional en mobile y tablet
- [ ] Navegación fluida sin loading innecesarios

---

## Resumen de Archivos

| Archivo | Tarea |
|---|---|
| `lib/printing/bluetooth.ts` | 1 |
| `lib/printing/escpos.ts` | 1 |
| `lib/printing/print-helpers.ts` | 1 |
| `(panel)/configuracion/hardware/page.tsx` | 2 |
| `components/camera-qr-scanner.tsx` | 3 |
| `public/sw.js` | 4 |
| `components/connectivity-banner.tsx` | 5 |
| `(panel)/configuracion/page.tsx` | 6 |
| `public/manifest.json` | 7 |
| `(panel)/error.tsx`, `loading.tsx`, `not-found.tsx` | 8 |

## Orden de Ejecución

```
Tarea 7 (PWA manifest) → Tarea 5 (Banner conectividad)
→ Tarea 4 (Service Worker) → Tarea 1 (Bluetooth printer)
→ Tarea 2 (Config hardware) → Tarea 3 (Cámara QR)
→ Tarea 6 (Config cooperativa) → Tarea 8 (Polish)
```
