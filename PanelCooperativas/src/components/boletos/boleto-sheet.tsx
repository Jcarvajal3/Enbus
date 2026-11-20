"use client";

// ─── Hoja del boleto (Taquilla de boletos) ───────────────────────────────────
// Al tocar un boleto se ven sus datos: pasajero, asiento, estado, pago y el viaje,
// con un enlace al detalle del viaje en Viajes. Recibe el boleto ya cargado en la lista.

import { useState } from "react";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { StatusBadge } from "@/components/status-badge";
import { Monto } from "@/components/monto";
import { ICONO_SECCION } from "@/lib/navigation";
import { formatCiudad } from "@/lib/ciudades";
import { formatCodigoBoleto } from "@/lib/artefactos.generated";
import { formatCedula } from "@/lib/ve";
import { formatFechaHoraCortaVE, formatHoraVE } from "@/lib/fechas";
import { getEstadoUiBoleto, type PagoResumen } from "@/lib/types/pagos";
import type { Boleto, EstadoBoleto } from "@/lib/types/boletos";

export type BoletoParaHoja = Boleto & {
  comprador?: { nombre_completo: string } | null;
  pago?: PagoResumen | PagoResumen[] | null;
};

function Dato({ etiqueta, children, ancho }: { etiqueta: string; children: React.ReactNode; ancho?: boolean }) {
  return (
    <div className={ancho ? "col-span-2 flex flex-col gap-0.5" : "flex flex-col gap-0.5"}>
      <dt className="text-[13px] text-muted-foreground">{etiqueta}</dt>
      <dd className="font-medium">{children}</dd>
    </div>
  );
}

export function BoletoSheet({
  boleto,
  onOpenChange,
  onVerificarPago,
  onCobrar,
}: {
  boleto: BoletoParaHoja | null;
  onOpenChange(o: boolean): void;
  onVerificarPago(pagoId: string): void;
  onCobrar(boletoId: string): void;
}) {
  // Se conserva el último boleto mientras la hoja se cierra (sin parpadeo).
  const [mostrado, setMostrado] = useState<BoletoParaHoja | null>(boleto);
  if (boleto && boleto !== mostrado) setMostrado(boleto);
  const b = boleto ?? mostrado;

  const pago = b ? ((Array.isArray(b.pago) ? b.pago[0] : b.pago) ?? null) : null;
  const ui = b ? getEstadoUiBoleto(b.estado as EstadoBoleto, pago?.estado_verificacion ?? null) : null;
  const nombre = b ? b.pasajero_nombre || b.comprador?.nombre_completo || "Sin nombre" : "";
  const ruta = b?.viaje
    ? `${formatCiudad(b.viaje.ruta?.ciudad_origen)} → ${formatCiudad(b.viaje.ruta?.ciudad_destino)}`
    : "Ruta desconocida";

  return (
    <Sheet open={boleto !== null} onOpenChange={onOpenChange}>
      <SheetContent className="gap-0">
        <SheetHeader className="border-b border-border">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <SheetTitle className="font-mono">{b ? formatCodigoBoleto(b.codigo_boleto) : "Boleto"}</SheetTitle>
            {ui && <StatusBadge status={ui} dominio="boleto" />}
          </div>
          <SheetDescription>{b ? `Asiento ${b.asiento} · ${nombre}` : "Cargando el boleto"}</SheetDescription>
        </SheetHeader>

        {b && ui && (
          <div className="flex flex-col gap-6 p-6">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-4 rounded-md bg-surface p-5 text-[15px]">
              <Dato etiqueta="Pasajero" ancho>
                {nombre}
              </Dato>
              <Dato etiqueta="Cédula">{b.pasajero_cedula ? formatCedula(b.pasajero_cedula) : "—"}</Dato>
              <Dato etiqueta="Teléfono">{b.pasajero_telefono || "—"}</Dato>
              <Dato etiqueta="Asiento">
                <span className="font-mono tabular-nums">{b.asiento}</span>
              </Dato>
              <Dato etiqueta="Precio">
                <Monto usd={b.precio} size="sm" />
              </Dato>
              <Dato etiqueta="Vendido">
                <span className="tabular-nums">{formatFechaHoraCortaVE(b.created_at)}</span>
              </Dato>
              {ui === "RESERVA_SIN_PAGAR" && b.reserva_expira_at && (
                <Dato etiqueta="La reserva vence">
                  <span className="tabular-nums">{formatHoraVE(b.reserva_expira_at)}</span>
                </Dato>
              )}
              {b.estado === "USADO" && b.embarcado_at && (
                <Dato etiqueta="Embarcó">
                  <span className="tabular-nums">{formatFechaHoraCortaVE(b.embarcado_at)}</span>
                </Dato>
              )}
              <Dato etiqueta="Viaje" ancho>
                {ruta}
                {b.viaje && (
                  <span className="block text-[13px] font-normal text-muted-foreground tabular-nums">
                    {formatFechaHoraCortaVE(b.viaje.fecha_hora_salida)}
                    {b.viaje.numero_unidad ? ` · Unidad ${b.viaje.numero_unidad}` : ""}
                  </span>
                )}
              </Dato>
            </dl>

            <div className="flex flex-col gap-2 max-md:*:w-full md:flex-row md:flex-wrap md:items-center">
              {ui === "PAGO_EN_VERIFICACION" && pago && (
                <Button size="lg" onClick={() => onVerificarPago(pago.id)}>
                  Verificar pago
                </Button>
              )}
              {(ui === "RESERVA_SIN_PAGAR" || ui === "PAGO_RECHAZADO") && (
                <Button size="lg" onClick={() => onCobrar(b.id)}>
                  Cobrar
                </Button>
              )}
              {b.viaje && (
                <Link
                  href={`/cooperativas/viajes?viaje=${b.viaje.id}`}
                  className={buttonVariants({ variant: "outline", size: "lg" })}
                >
                  <ICONO_SECCION.viajes aria-hidden />
                  Ver viaje
                </Link>
              )}
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
