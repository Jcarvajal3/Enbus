"use client";

// ─── Pantalla final: confirmación ────────────────────────────────────────────
// Como `BoletosEmitidos` del panel: icono de estado, total y una tarjeta por boleto (código, ruta, salida,
// asiento y pasajero). Dos finales: pago reportado (la cooperativa lo verifica) o asientos apartados para
// pagar en taquilla (30 minutos, con cuenta regresiva). Sin QR: el boleto aún no está confirmado; el QR
// aparece en "Mis boletos" cuando la cooperativa verifica el pago. Las acciones ("Ver mis boletos",
// "Otra compra") van en la `BarraFlujo` de la página.

import Link from "next/link";
import { CheckCircleIcon, ClockIcon, MapPinIcon } from "@phosphor-icons/react";
import { IconTile } from "@/components/icon-tile";
import { Card } from "@/components/ui/card";
import type { DatosPasajero } from "@/components/boletos/venta/tipos";
import { formatMoney, type TasaRef } from "@/lib/dinero";
import { formatCiudad } from "@/lib/ciudades";
import { formatDiaHoraVE } from "@/lib/fechas";
import { urlBoleto, urlViajes } from "@/lib/pasajero/rutas";
import type { ViajePublico } from "@/lib/pasajero/viajes";
import { formatCedula } from "@/lib/ve";
import { CuentaRegresiva } from "./cuenta-regresiva";
import type { ResultadoCompra } from "./tipos";
import s from "./compra.module.css";

export function PasoListo({
  viaje,
  resultado,
  offsetMs,
  tasa,
  pasajeros,
  onSalir,
}: {
  viaje: ViajePublico;
  resultado: ResultadoCompra;
  offsetMs: number;
  tasa: TasaRef | null;
  /** Datos de quien viaja por asiento (solo si siguen en memoria: tras recargar no están). */
  pasajeros: Record<string, DatosPasajero>;
  /** Se salió de la pantalla final hacia otra página: limpia lo guardado. */
  onSalir: () => void;
}) {
  const { resumen, modo } = resultado;
  const taquilla = modo === "taquilla";
  const boletos = resumen ? [...resumen.boletos].sort((a, b) => Number(a.asiento) - Number(b.asiento)) : [];
  const total =
    resumen && resumen.totalUsd !== null
      ? formatMoney({
          usd: resumen.totalUsd,
          bs: resumen.pago?.montoBs ?? resumen.totalBs,
          tasa: resumen.tasa && resumen.tasaFecha ? { tasa: resumen.tasa, fecha: resumen.tasaFecha } : tasa,
        })
      : null;
  const origen = formatCiudad(viaje.origen);
  const destino = formatCiudad(viaje.destino);
  const lugar = viaje.terminalOrigen ?? origen;
  const cantidad = boletos.length;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col items-center gap-2 text-center">
        <IconTile icon={taquilla ? ClockIcon : CheckCircleIcon} tone={taquilla ? "warning" : "success"} size="lg" />
        <p className="font-heading text-[22px] font-semibold tracking-tight" role="status">
          {taquilla
            ? cantidad === 1
              ? "Tu asiento está apartado"
              : "Tus asientos están apartados"
            : resumen
              ? "Recibimos tu pago"
              : "Ya reportaste el pago de esta compra"}
        </p>
      </div>

      {taquilla && resumen?.reservaExpiraAt && (
        <CuentaRegresiva expiraAt={resumen.reservaExpiraAt} offsetMs={offsetMs} etiqueta="Paga antes de que venza:" />
      )}

      {total && (
        <div className="flex flex-col gap-1 rounded-md bg-surface p-5" aria-live="polite">
          <p className="text-[13px] text-muted-foreground">{taquilla ? "Total a pagar" : "Total reportado"}</p>
          <p className="text-[22px] leading-tight font-semibold tracking-tight tabular-nums" aria-label={total.accesible}>
            {total.principal}
          </p>
          {total.secundario && <p className="text-[13px] text-muted-foreground tabular-nums">{total.secundario}</p>}
        </div>
      )}

      {boletos.length > 0 && (
        <ul className="grid gap-3 md:grid-cols-2" aria-label="Tus boletos">
          {boletos.map((b) => {
            const p = pasajeros[b.asiento];
            return (
              <li key={b.id} className="flex flex-col gap-2 rounded-md bg-surface p-4">
                <p className="text-[13px] font-medium text-muted-foreground">Boleto de viaje</p>
                <p className="text-[15px] font-semibold">{viaje.cooperativa.nombre}</p>
                <p className="font-mono text-lg font-semibold text-foreground">{b.codigoBoleto}</p>
                <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[15px]">
                  <dt className="text-muted-foreground">Ruta</dt>
                  <dd>
                    {origen} → {destino}
                  </dd>
                  <dt className="text-muted-foreground">Salida</dt>
                  <dd className="tabular-nums">{formatDiaHoraVE(viaje.salida)}</dd>
                  <dt className="text-muted-foreground">Asiento</dt>
                  <dd className="font-semibold">{b.asiento}</dd>
                  {p?.nombre && (
                    <>
                      <dt className="text-muted-foreground">Pasajero</dt>
                      <dd>{p.nombre}</dd>
                    </>
                  )}
                  {p?.cedula && (
                    <>
                      <dt className="text-muted-foreground">Cédula</dt>
                      <dd>{formatCedula(p.cedula)}</dd>
                    </>
                  )}
                </dl>
                <Link href={urlBoleto(b.id)} className="s-enlace self-start" onClick={onSalir}>
                  Ver detalle
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <Card className="gap-3 p-5 py-5" role="region" aria-labelledby="compra-siguiente-titulo">
        <h2 id="compra-siguiente-titulo" className="text-[17px] font-semibold">
          Qué sigue
        </h2>
        {taquilla ? (
          <ol className={s.pasosSiguientes}>
            <li>
              <strong>Paga en la taquilla de {viaje.cooperativa.nombre}.</strong>{" "}
              <span>
                <MapPinIcon aria-hidden className="inline size-4 align-text-bottom" /> {lugar}. Indica el código de tu
                boleto.
              </span>
            </li>
            <li>
              <strong>No esperes al último minuto.</strong> Si la reserva vence sin pago, los asientos se liberan.
            </li>
            <li>
              <strong>¿Prefieres pagar en línea?</strong> Puedes hacerlo desde Mis boletos mientras la reserva siga
              vigente.
            </li>
          </ol>
        ) : (
          <ol className={s.pasosSiguientes}>
            <li>
              <strong>La cooperativa verifica tu pago.</strong> Mientras tanto, tu boleto queda en revisión.
            </li>
            <li>
              <strong>Te avisamos cuando esté confirmado.</strong> Verás el código QR en Mis boletos.
            </li>
            <li>
              <strong>El día del viaje,</strong> muestra el QR de tu boleto al abordar.
            </li>
          </ol>
        )}
      </Card>

      <Link
        href={urlViajes({ origen: viaje.origen, destino: viaje.destino })}
        className="s-enlace self-start"
        onClick={onSalir}
      >
        Buscar otras salidas
      </Link>
    </div>
  );
}
