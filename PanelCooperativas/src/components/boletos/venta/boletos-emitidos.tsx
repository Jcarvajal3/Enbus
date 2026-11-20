"use client";

// ─── Fase final: "Boletos emitidos" ──────────────────────────────────────────
// Resumen cobrado / recibido / vuelto, una tarjeta por boleto con su QR, "Imprimir"
// (térmica por Bluetooth o, sin ella, solo los boletos en una ventana del navegador),
// "Vender otro" (conserva día y ruta) y "Listo". Sin número de paso. Es una página
// completa (`FlujoPagina`): la usan la venta y el cobro de una reserva.

import { Suspense, lazy, useEffect, useRef, useState } from "react";
import { CheckCircleIcon, PrinterIcon } from "@phosphor-icons/react";
import { BarraFlujo, FlujoPagina } from "@/components/flujo";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { IconTile } from "@/components/icon-tile";
import { useUser } from "@/hooks/use-user";
import { avisarError, avisarExito } from "@/lib/avisos";
import { printBoleto, imprimirHtml, MSG_VENTANA_BLOQUEADA } from "@/lib/printing/print-helpers";
import { printer } from "@/lib/printing/bluetooth";
import { formatCodigoBoleto, qrBoleto } from "@/lib/artefactos.generated";
import { fechaTasaCorta, formatBs, formatUsd, usdABs } from "@/lib/dinero";
import { formatCiudad } from "@/lib/ciudades";
import { formatCedula } from "@/lib/ve";
import { cn } from "@/lib/utils";
import type { Boleto } from "@/lib/types/boletos";
import type { OperacionTaquilla } from "../../../app/cooperativas/(panel)/taquilla/boletos/actions";
import { formatSalidaVenta } from "./tipos";

// El renderizador del QR (~40 KB) solo hace falta en esta fase.
const QRCodeSVG = lazy(() => import("qrcode.react").then((m) => ({ default: m.QRCodeSVG })));

export function BoletosEmitidos({
  operacion,
  trayecto,
  unidad,
  onListo,
  onVenderOtro,
}: {
  operacion: OperacionTaquilla;
  /** Ciudades del viaje tal como vienen de la ruta. */
  trayecto: { origen: string; destino: string } | null;
  unidad?: string | null;
  onListo: () => void;
  /** Solo en la venta: empieza otra con el mismo día y ruta. */
  onVenderOtro?: () => void;
}) {
  const { user } = useUser();
  const cooperativa = user?.cooperativa_nombre ?? "";
  const origen = formatCiudad(trayecto?.origen);
  const destino = formatCiudad(trayecto?.destino);
  const ruta = origen && destino ? `${origen} → ${destino}` : "";
  const [imprimiendo, setImprimiendo] = useState(false);
  // Al llegar a esta fase se ve desde arriba (el cobro quedó abajo del todo).
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, []);
  const ticketsRef = useRef<HTMLDivElement>(null);
  const { cobro } = operacion;
  const cantidad = operacion.impresion.length;
  const precioDe = (codigo: string) =>
    operacion.boletos.find((b) => b.codigo_boleto === codigo)?.precio_usd ??
    (cobro.total_usd ?? 0) / Math.max(cantidad, 1);
  const salida = operacion.salida ? formatSalidaVenta(operacion.salida) : "";
  const enUsd = cobro.moneda === "USD";
  const fmt = (n: number) => (enUsd ? formatUsd(n) : formatBs(n));

  /**
   * Sin impresora térmica: solo los boletos (con su QR) en una ventana aparte.
   * Si el navegador bloquea la ventana se avisa; nunca se imprime la página entera.
   */
  const imprimirEnNavegador = () => {
    const html = ticketsRef.current?.innerHTML;
    if (!html || !imprimirHtml("Boletos", html)) {
      avisarError(MSG_VENTANA_BLOQUEADA);
    }
  };

  const viajeTicket =
    origen && destino && operacion.salida
      ? { cooperativa, origen, destino, salida: operacion.salida, unidad: unidad ?? null }
      : undefined;

  const imprimir = async () => {
    if (!printer.isConnected) {
      imprimirEnNavegador();
      return;
    }
    setImprimiendo(true);
    try {
      for (const b of operacion.impresion) {
        await printBoleto(
          {
            codigo_boleto: b.codigo_boleto,
            pasajero_nombre: b.pasajero,
            pasajero_cedula: b.cedula,
            asiento: b.asiento,
            precio: precioDe(b.codigo_boleto),
            qr_embarque_data: qrBoleto({ codigo_boleto: b.codigo_boleto, qr_embarque_data: b.qr }),
          } as Boleto,
          {
            monto_usd: precioDe(b.codigo_boleto),
            monto_bs: null,
            tasa: cobro.tasa ?? null,
            tasa_fecha: cobro.tasa_fecha ?? null,
            moneda: cobro.moneda,
          },
          viajeTicket
        );
      }
      avisarExito(cantidad === 1 ? "Boleto enviado a la impresora." : `${cantidad} boletos enviados a la impresora.`);
    } catch {
      // Sin Bluetooth se imprime desde el navegador (el aviso de bloqueo sale de imprimirEnNavegador).
      imprimirEnNavegador();
    } finally {
      setImprimiendo(false);
    }
  };

  return (
    <FlujoPagina
      titulo="Boletos emitidos"
      descripcion={`${ruta}${ruta && salida ? " · " : ""}${salida}` || undefined}
      barra={
        <BarraFlujo
          principal={{
            etiqueta: (
              <>
                <PrinterIcon aria-hidden />
                {cantidad === 1 ? "Imprimir boleto" : `Imprimir ${cantidad} boletos`}
              </>
            ),
            onClick: () => void imprimir(),
            cargando: imprimiendo,
            etiquetaCargando: "Imprimiendo…",
          }}
          secundaria={{ etiqueta: "Listo", onClick: onListo }}
        />
      }
    >
      <div className="flex flex-col gap-5">
        <div className="flex flex-col items-center gap-2 text-center">
          <IconTile icon={CheckCircleIcon} tone="success" size="lg" />
          <p className="font-heading text-[22px] font-semibold tracking-tight" role="status">
            {cantidad === 1 ? "Boleto emitido" : `${cantidad} boletos emitidos`}
          </p>
        </div>

        <div className="grid gap-3 rounded-md bg-surface p-5 md:grid-cols-3" aria-live="polite">
          <div>
            <p className="text-[13px] text-muted-foreground">Cobrado</p>
            <p className="font-semibold tabular-nums">{fmt(cobro.esperado)}</p>
            {cobro.total_usd != null && !enUsd && (
              <p className="text-[13px] text-muted-foreground">
                ≈ {formatUsd(cobro.total_usd)}
                {cobro.tasa_fecha ? ` · BCV ${fechaTasaCorta(cobro.tasa_fecha)}` : ""}
              </p>
            )}
          </div>
          <div>
            <p className="text-[13px] text-muted-foreground">Recibido</p>
            <p className="font-semibold tabular-nums">{fmt(cobro.recibido)}</p>
          </div>
          <div>
            <p className="text-[13px] text-muted-foreground">Vuelto</p>
            <p className={cn("font-semibold tabular-nums", cobro.vuelto > 0 && "text-[28px] leading-tight tracking-tight")}>
              {fmt(cobro.vuelto)}
            </p>
          </div>
        </div>
        {operacion.repetido && (
          <p className="text-[13px] text-muted-foreground" role="status">
            Esta venta ya estaba registrada: no se cobró dos veces.
          </p>
        )}

        <div ref={ticketsRef} className="grid gap-3 md:grid-cols-2">
          {operacion.impresion.map((b) => (
            <article key={b.codigo_boleto} className="flex flex-col gap-2 rounded-md bg-surface p-4">
              <p className="text-[13px] font-medium text-muted-foreground">Boleto de viaje</p>
              {cooperativa && <p className="text-[15px] font-semibold">{cooperativa}</p>}
              <p className="font-mono text-lg font-semibold text-foreground">{formatCodigoBoleto(b.codigo_boleto)}</p>
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[15px]">
                <dt className="text-muted-foreground">Ruta</dt>
                <dd>{ruta}</dd>
                {salida && (
                  <>
                    <dt className="text-muted-foreground">Salida</dt>
                    <dd>
                      {salida}
                      {unidad ? ` · Unidad ${unidad}` : ""}
                    </dd>
                  </>
                )}
                <dt className="text-muted-foreground">Asiento</dt>
                <dd className="font-semibold">{b.asiento}</dd>
                <dt className="text-muted-foreground">Pasajero</dt>
                <dd>{b.pasajero ?? "—"}</dd>
                {b.cedula && (
                  <>
                    <dt className="text-muted-foreground">Cédula</dt>
                    <dd>{formatCedula(b.cedula)}</dd>
                  </>
                )}
                <dt className="text-muted-foreground">Precio</dt>
                <dd>
                  {cobro.tasa && !enUsd
                    ? `${formatBs(usdABs(precioDe(b.codigo_boleto), cobro.tasa))} (${formatUsd(precioDe(b.codigo_boleto))})`
                    : formatUsd(precioDe(b.codigo_boleto))}
                </dd>
              </dl>
              <div className="flex justify-center rounded-sm bg-white p-2">
                <Suspense fallback={<Skeleton className="size-[120px]" />}>
                  <QRCodeSVG value={qrBoleto({ codigo_boleto: b.codigo_boleto, qr_embarque_data: b.qr })} size={120} />
                </Suspense>
              </div>
            </article>
          ))}
        </div>

        {onVenderOtro && (
          <Button type="button" variant="outline" size="lg" className="self-start max-md:w-full" onClick={onVenderOtro}>
            Vender otro
          </Button>
        )}
      </div>
    </FlujoPagina>
  );
}
