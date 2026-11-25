"use client";

// ─── Paso final: confirmación ────────────────────────────────────────────────
// Dos finales: pago reportado (la cooperativa lo verifica) o asientos apartados para pagar en
// taquilla (30 minutos). En ambos se ven los códigos de boleto y el camino a "Mis boletos".

import Link from "next/link";
import { CheckCircleIcon, ClockIcon, MapPinIcon } from "@phosphor-icons/react";
import { formatMoney, type TasaRef } from "@/lib/dinero";
import { formatCiudad } from "@/lib/ciudades";
import { formatDiaHoraVE } from "@/lib/fechas";
import { RUTAS_PASAJERO, urlBoleto, urlViajes } from "@/lib/pasajero/rutas";
import type { ViajePublico } from "@/lib/pasajero/viajes";
import { CuentaRegresiva } from "./cuenta-regresiva";
import { ordenarAsientos, type ResultadoCompra } from "./tipos";
import s from "./compra.module.css";

export function PasoListo({
  viaje,
  resultado,
  offsetMs,
  tasa,
  onOtra,
  onSalir,
}: {
  viaje: ViajePublico;
  resultado: ResultadoCompra;
  offsetMs: number;
  tasa: TasaRef | null;
  /** Empieza otra compra en esta misma salida. */
  onOtra: () => void;
  /** Se salió de la pantalla final hacia otra página: limpia lo guardado. */
  onSalir: () => void;
}) {
  const { resumen, modo } = resultado;
  const taquilla = modo === "taquilla";
  const boletos = resumen ? [...resumen.boletos].sort((a, b) => Number(a.asiento) - Number(b.asiento)) : [];
  const asientos = ordenarAsientos(boletos.map((b) => b.asiento));
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
  const lugar = viaje.terminalOrigen ?? `${origen}`;

  return (
    <div className={s.contenido}>
      <section className={`${s.tarjeta} ${s.exito}`} aria-labelledby="compra-listo-titulo">
        <p className={s.exitoEtiqueta} data-tono={taquilla ? "espera" : undefined}>
          {taquilla ? <ClockIcon weight="fill" aria-hidden /> : <CheckCircleIcon weight="fill" aria-hidden />}
          <span id="compra-listo-titulo">
            {taquilla
              ? "Tus asientos están apartados"
              : resumen
                ? "Recibimos tu pago"
                : "Ya reportaste el pago de esta compra"}
          </span>
        </p>
        <p className={s.apoyo}>
          {origen} a {destino} · <span className="s-num">{formatDiaHoraVE(viaje.salida)}</span> · {viaje.cooperativa.nombre}
          {asientos.length > 0 && (
            <>
              {" "}
              · {asientos.length === 1 ? "asiento" : "asientos"} <span className="s-num">{asientos.join(", ")}</span>
            </>
          )}
        </p>

        {taquilla && resumen?.reservaExpiraAt && (
          <CuentaRegresiva expiraAt={resumen.reservaExpiraAt} offsetMs={offsetMs} etiqueta="Paga antes de que venza:" />
        )}

        {total && (
          <p className={`${s.apoyo} s-num`}>
            {taquilla ? "Total a pagar: " : "Total reportado: "}
            <strong>{total.principal}</strong>
            {total.secundario ? ` (${total.secundario})` : ""}
          </p>
        )}

        {boletos.length > 0 && (
          <ul className={s.boletos} aria-label="Tus boletos">
            {boletos.map((b) => (
              <li key={b.id} className={s.boleto}>
                <span className={`${s.boletoAsiento} s-num`}>
                  <span className="sr-only">Asiento </span>
                  {b.asiento}
                </span>
                <span className={s.boletoCodigo}>
                  <span>Código del boleto</span>
                  <strong className="s-num">{b.codigoBoleto}</strong>
                </span>
                <Link href={urlBoleto(b.id)} className="s-enlace" onClick={onSalir}>
                  Ver detalle
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={s.tarjeta} aria-labelledby="compra-siguiente-titulo">
        <h2 id="compra-siguiente-titulo" className={s.subtitulo}>
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
        <div className={s.acciones}>
          <Link href={RUTAS_PASAJERO.misBoletos} className="s-boton s-boton--sol s-boton--lg" onClick={onSalir}>
            Ver mis boletos
          </Link>
          <button type="button" className="s-boton s-boton--claro s-boton--lg" onClick={onOtra}>
            Comprar otro boleto
          </button>
          <Link
            href={urlViajes({ origen: viaje.origen, destino: viaje.destino })}
            className="s-boton s-boton--claro s-boton--lg"
            onClick={onSalir}
          >
            Buscar otras salidas
          </Link>
        </div>
      </section>
    </div>
  );
}
