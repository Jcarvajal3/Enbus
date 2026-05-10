"use client";

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
    if (!this.device.gatt) throw new Error("GATT no disponible");
    const server = await this.device.gatt.connect();
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
    if (typeof window === "undefined") return null;
    return localStorage.getItem("bt_printer_name");
  }
}

export const printer = new BluetoothPrinter();
