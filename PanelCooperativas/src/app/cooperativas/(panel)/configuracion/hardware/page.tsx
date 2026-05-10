"use client";

import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Printer, Scan, CheckCircle, WarningCircle, Info } from "@phosphor-icons/react";
import { printer } from "@/lib/printing/bluetooth";
import { buildTicket } from "@/lib/printing/escpos";
import { toast } from "sonner";

export default function HardwareConfigPage() {
  const [printerConnected, setPrinterConnected] = useState(false);
  const [printerName, setPrinterName] = useState<string | null>(null);
  
  // Scanner state
  const [scanResult, setScanResult] = useState<{ code: string; time: number } | null>(null);
  const [scanValue, setScanValue] = useState("");
  const startTimeRef = useRef<number>(0);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    // Check initial printer state
    setPrinterName(printer.printerName);
    setPrinterConnected(printer.isConnected);
    // Cleanup timeout on unmount
    return () => {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    };
  }, []);

  const handlePairPrinter = async () => {
    try {
      const { name } = await printer.pair();
      setPrinterName(name);
      setPrinterConnected(true);
      toast.success("Impresora conectada exitosamente");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Error desconocido";
      toast.error("Error al conectar impresora: " + message);
    }
  };

  const handleTestPrint = async () => {
    try {
      const ticket = buildTicket({
        title: "TEST DE IMPRESIÓN",
        lines: [
          { label: "Fecha", value: new Date().toLocaleString() },
          { label: "Estado", value: "OK" },
        ],
        footer: "Impresión de prueba - EnBus",
      });
      await printer.write(ticket);
      toast.success("Ticket de prueba enviado");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Error desconocido";
      toast.error("Error al imprimir: " + message);
      setPrinterConnected(false);
    }
  };

  const handleScanInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setScanValue(value);
    
    if (value.length === 1) {
      startTimeRef.current = performance.now();
    }

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    typingTimeoutRef.current = setTimeout(() => {
      if (value.length > 6) {
        const timeElapsed = performance.now() - startTimeRef.current;
        if (timeElapsed < 500) {
          setScanResult({ code: value, time: Math.round(timeElapsed) });
          setScanValue(""); // controlled clear
        } else {
          // Teclado manual, ignorar
          setScanResult(null);
        }
      }
    }, 50);
  };

  return (
    <div className="flex flex-col gap-6 max-w-4xl mx-auto w-full p-4 md:p-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Configuración de Hardware</h1>
        <p className="text-muted-foreground mt-2">
          Gestione los dispositivos externos conectados a esta estación de trabajo.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Printer Config */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Printer size={24} weight="duotone" />
              Impresora Bluetooth
            </CardTitle>
            <CardDescription>
              Conecte una impresora térmica compatible con ESC/POS
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg border">
              <div className="flex items-center gap-3">
                <div className={`w-3 h-3 rounded-full ${printerConnected ? 'bg-emerald-500' : 'bg-destructive'}`} />
                <div>
                  <p className="font-medium">{printerConnected ? 'Conectada' : 'Desconectada'}</p>
                  {printerName && <p className="text-sm text-muted-foreground">{printerName}</p>}
                </div>
              </div>
              {printerConnected ? (
                <Badge variant="default" className="bg-emerald-500 hover:bg-emerald-600">Online</Badge>
              ) : (
                <Badge variant="destructive">Offline</Badge>
              )}
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <Button onClick={handlePairPrinter} className="flex-1">
                Emparejar Impresora
              </Button>
              <Button onClick={handleTestPrint} variant="secondary" disabled={!printerConnected} className="flex-1">
                Test de Impresión
              </Button>
            </div>

            <div className="flex items-start gap-2 text-sm text-muted-foreground bg-blue-500/10 p-3 rounded-md text-blue-600 dark:text-blue-400">
              <Info size={20} className="shrink-0 mt-0.5" />
              <p>
                Solo compatible con Chrome y Edge. Safari y Firefox usarán la ventana de impresión estándar del sistema operativo.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Scanner Config */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Scan size={24} weight="duotone" />
              Escáner de Códigos
            </CardTitle>
            <CardDescription>
              Verifique el funcionamiento del lector de códigos USB/Bluetooth
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <label className="text-sm font-medium">Input de prueba</label>
              <Input 
                autoFocus
                placeholder="Haga clic aquí y escanee un código..."
                value={scanValue}
                onChange={handleScanInput}
                className="font-mono text-lg py-6"
              />
            </div>

            <div className="p-4 bg-muted/50 rounded-lg border min-h-[100px] flex flex-col justify-center">
              {scanResult ? (
                <div className="flex items-center gap-3 text-emerald-600 dark:text-emerald-400">
                  <CheckCircle size={28} weight="fill" />
                  <div>
                    <p className="font-semibold">¡Escáner detectado!</p>
                    <p className="text-sm font-mono mt-1">
                      Código: {scanResult.code} <span className="text-muted-foreground">({scanResult.time}ms)</span>
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3 text-muted-foreground">
                  <WarningCircle size={28} weight="duotone" />
                  <p className="text-sm">
                    Escanee un código para verificar que el lector funciona correctamente. El sistema detecta entradas rápidas ({'<'} 500ms).
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
