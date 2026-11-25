"use client";

import { formatMoney, type TasaRef } from "@/lib/dinero";
import { formatCiudad } from "@/lib/ciudades";
import { formatDiaHoraVE } from "@/lib/fechas";
import type { ViajePublico } from "@/lib/pasajero/viajes";
import { listaAsientos } from "@/components/boletos/seat-selector";
import { CuentaRegresiva } from "./cuenta-regresiva";
import s from "./compra.module.css";

/** Texto del total en vivo: "Bs 1.250,00" y "≈ USD 25,00 · BCV 02/10". */
export function totalEnVivo(totalUsd: number, totalBs: number | null, tasa: TasaRef | null) {
  return formatMoney({ usd: totalUsd, bs: totalBs, tasa });
}

/** "2 asientos: 14 y 15" */
export function textoAsientos(asientos: readonly string[]) {
  if (asientos.length === 0) return "Sin asientos elegidos";
  return `${asientos.length === 1 ? "Asiento" : "Asientos"} ${listaAsientos([...asientos])}`;
}

/**
 * Cabecera fija: ruta, salida y cooperativa, con el total en vivo y la cuenta regresiva de la
 * reserva. En pantallas angostas el total vive en la barra inferior.
 */
export function ResumenViaje({
  viaje,
  asientos,
  totalUsd,
  totalBs,
  tasa,
  expiraAt,
  offsetMs,
  onVence,
}: {
  viaje: ViajePublico;
  asientos: readonly string[];
  totalUsd: number;
  totalBs: number | null;
  tasa: TasaRef | null;
  expiraAt: string | null;
  offsetMs: number;
  onVence: () => void;
}) {
  const total = asientos.length > 0 ? totalEnVivo(totalUsd, totalBs, tasa) : null;
  return (
    <section className={s.resumen} aria-label="Resumen de tu compra">
      <div className={s.resumenViaje}>
        <p className={s.resumenRuta}>
          {formatCiudad(viaje.origen)} <span aria-hidden>→</span>
          <span className="sr-only"> a </span> {formatCiudad(viaje.destino)}
        </p>
        <p className={s.resumenMeta}>
          <span className="s-num">{formatDiaHoraVE(viaje.salida)}</span> · {viaje.cooperativa.nombre}
        </p>
      </div>
      <div className={s.resumenTotal} aria-live="polite" aria-atomic="true">
        {total ? (
          <>
            <strong className="s-num" aria-label={total.accesible}>
              {total.principal}
            </strong>
            <span className="s-num">
              {textoAsientos(asientos)}
              {total.secundario ? ` · ${total.secundario}` : ""}
            </span>
          </>
        ) : (
          <span>Elige tus asientos</span>
        )}
      </div>
      {expiraAt && (
        <div className={s.resumenCuenta}>
          <CuentaRegresiva expiraAt={expiraAt} offsetMs={offsetMs} onVence={onVence} />
        </div>
      )}
    </section>
  );
}
