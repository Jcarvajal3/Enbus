"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Printer, Scan, CheckCircle, WarningCircle, Info, ArrowLeft } from "@phosphor-icons/react";
import { printer } from "@/lib/printing/bluetooth";
import { buildTicket } from "@/lib/printing/escpos";
import { humanizeError } from "@/lib/errores";
import { formatFechaHoraVE } from "@/lib/fechas";
import { toast } from "sonner";

/** Mensaje claro para los errores de Web Bluetooth (nunca el texto técnico del navegador). */
function errorImpresora(err: unknown, accion: string): string | null {
  const nombre = err instanceof Error ? err.name : "";
  // La persona cerró el selector de dispositivos sin elegir: no es un error.
  if (nombre === "NotFoundError" || nombre === "AbortError") return null;
  if (nombre === "NotSupportedError" || (typeof navigator !== "undefined" && !("bluetooth" in navigator))) {
    return "Este navegador no puede conectarse a impresoras Bluetooth. Usa Chrome o Edge en una computadora o en Android.";
  }
  if (nombre === "SecurityError" || nombre === "NotAllowedError") {
    return "El navegador no dio permiso para usar Bluetooth. Permítelo en la configuración del sitio e intenta de nuevo.";
  }
  if (nombre === "NetworkError") {
    return "Se perdió la conexión con la impresora. Revisa que esté encendida y cerca, y emparéjala de nuevo.";
  }
  return humanizeError(err, accion);
}

export default function HardwareConfigPage() {
  const [printerConnected, setPrinterConnected] = useState(() => printer.isConnected);
  const [printerName, setPrinterName] = useState<string | null>(() => printer.printerName);
  const [emparejando, setEmparejando] = useState(false);
  const [imprimiendo, setImprimiendo] = useState(false);

  // Lector de códigos
  const [scanResult, setScanResult] = useState<{ code: string; time: number } | null>(null);
  const [scanValue, setScanValue] = useState("");
  const startTimeRef = useRef<number>(0);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    };
  }, []);

  const handlePairPrinter = async () => {
    setEmparejando(true);
    try {
      const { name } = await printer.pair();
      setPrinterName(name);
      setPrinterConnected(true);
      toast.success("Impresora conectada.");
    } catch (err: unknown) {
      const mensaje = errorImpresora(err, "conectar la impresora");
      if (mensaje) toast.error(mensaje);
    } finally {
      setEmparejando(false);
    }
  };

  const handleTestPrint = async () => {
    setImprimiendo(true);
    try {
      const ticket = buildTicket({
        title: "PRUEBA DE IMPRESIÓN",
        lines: [
          { label: "Fecha", value: formatFechaHoraVE(new Date()) },
          { label: "Estado", value: "OK" },
        ],
        footer: "Impresión de prueba - EnBus",
      });
      await printer.write(ticket);
      toast.success("Enviamos el ticket de prueba a la impresora.");
    } catch (err: unknown) {
      toast.error(errorImpresora(err, "imprimir el ticket de prueba") ?? "No se imprimió el ticket de prueba.");
      setPrinterConnected(false);
    } finally {
      setImprimiendo(false);
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
          setScanValue("");
        } else {
          // Escrito a mano: no cuenta como lector
          setScanResult(null);
        }
      }
    }, 50);
  };

  return (
    <div className="flex flex-col gap-6 max-w-4xl mx-auto w-full">
      <div>
        <Link
          href="/cooperativas/configuracion"
          className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          <ArrowLeft size={14} aria-hidden />
          Configuración
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">Impresora y lector</h1>
        <p className="text-muted-foreground mt-1">
          Conecta la impresora de tickets y prueba el lector de códigos de esta computadora.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Impresora */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Printer size={24} weight="duotone" aria-hidden />
              Impresora Bluetooth
            </CardTitle>
            <CardDescription>
              Impresora térmica compatible con ESC/POS.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg border" role="status">
              <div className="flex items-center gap-3">
                <div
                  className={`w-3 h-3 rounded-full ${printerConnected ? "bg-emerald-600" : "bg-muted-foreground"}`}
                  aria-hidden
                />
                <div>
                  <p className="font-medium">{printerConnected ? "Conectada" : "Sin conectar"}</p>
                  {printerName && <p className="text-sm text-muted-foreground">{printerName}</p>}
                </div>
              </div>
              {printerConnected ? (
                <Badge variant="secondary" className="bg-emerald-100 text-emerald-900 dark:bg-emerald-400/15 dark:text-emerald-200">
                  Lista
                </Badge>
              ) : (
                <Badge variant="outline">Sin conectar</Badge>
              )}
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <Button onClick={handlePairPrinter} className="flex-1" disabled={emparejando}>
                {emparejando ? "Buscando impresoras…" : printerConnected ? "Cambiar impresora" : "Emparejar impresora"}
              </Button>
              <Button
                onClick={handleTestPrint}
                variant="outline"
                disabled={!printerConnected || imprimiendo}
                className="flex-1"
              >
                {imprimiendo ? "Imprimiendo…" : "Imprimir prueba"}
              </Button>
            </div>

            <div className="flex items-start gap-2 rounded-md bg-blue-100 p-3 text-sm text-blue-900 dark:bg-blue-400/15 dark:text-blue-200">
              <Info size={20} className="shrink-0 mt-0.5" aria-hidden />
              <p>
                Funciona en Chrome y Edge. En Safari y Firefox los tickets salen por la ventana de impresión del sistema.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Lector */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Scan size={24} weight="duotone" aria-hidden />
              Lector de códigos
            </CardTitle>
            <CardDescription>
              Prueba el lector USB o Bluetooth antes de empezar a vender.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="prueba-lector">Campo de prueba</Label>
              <Input
                id="prueba-lector"
                autoFocus
                placeholder="Haz clic aquí y escanea un código"
                value={scanValue}
                onChange={handleScanInput}
                className="font-mono text-lg py-6"
              />
            </div>

            <div className="p-4 bg-muted/50 rounded-lg border min-h-[100px] flex flex-col justify-center" role="status">
              {scanResult ? (
                <div className="flex items-center gap-3 text-success-text">
                  <CheckCircle size={28} weight="fill" aria-hidden />
                  <div>
                    <p className="font-semibold">El lector funciona</p>
                    <p className="text-sm font-mono mt-1 text-foreground">
                      Código: {scanResult.code} <span className="text-muted-foreground">({scanResult.time} ms)</span>
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3 text-muted-foreground">
                  <WarningCircle size={28} weight="duotone" aria-hidden />
                  <p className="text-sm">
                    Escanea un código para comprobar que el lector funciona. Solo cuentan las lecturas rápidas (menos de
                    medio segundo).
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
