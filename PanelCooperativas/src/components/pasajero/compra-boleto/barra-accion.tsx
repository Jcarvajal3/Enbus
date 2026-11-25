"use client";

import { SpinnerIcon } from "@phosphor-icons/react";
import s from "./compra.module.css";

export interface AccionBarra {
  etiqueta: string;
  etiquetaCargando?: string;
  type?: "button" | "submit";
  /** `id` del <form> que envía (si el botón no está dentro de él). */
  form?: string;
  onClick?: () => void;
  deshabilitado?: boolean;
  cargando?: boolean;
}

/**
 * Barra pegada al fondo: total de la compra y la acción del paso. Con la barra, quien compra
 * desde el móvil nunca pierde de vista cuánto paga ni cómo seguir.
 */
export function BarraAccion({
  principal,
  secundario,
  accion,
}: {
  principal: string;
  secundario?: string | null;
  accion: AccionBarra;
}) {
  const { cargando = false, deshabilitado = false, type = "button" } = accion;
  return (
    <div className={s.barra} data-slot="barra-compra">
      <div className={s.barraInterior}>
        <div className={s.barraTotal} aria-live="polite" aria-atomic="true">
          <strong className="s-num">{principal}</strong>
          {secundario && <span className="s-num">{secundario}</span>}
        </div>
        <button
          // Clave por tipo y formulario: si un clic avanza al paso siguiente y este usa un botón
          // `submit`, React reutilizaría el mismo <button> y el navegador enviaría el formulario
          // recién montado. Con otra clave el botón pulsado se desmonta y el nuevo nace limpio.
          key={`${type}:${accion.form ?? ""}`}
          type={type}
          form={accion.form}
          className={`s-boton s-boton--sol s-boton--lg ${s.barraBoton}`}
          disabled={deshabilitado && !cargando}
          aria-busy={cargando || undefined}
          aria-disabled={cargando || undefined}
          onClick={(e) => {
            if (cargando) {
              e.preventDefault();
              return;
            }
            accion.onClick?.();
          }}
        >
          {cargando && <SpinnerIcon className="motion-safe:animate-spin" aria-hidden />}
          {cargando && accion.etiquetaCargando ? accion.etiquetaCargando : accion.etiqueta}
        </button>
      </div>
    </div>
  );
}
