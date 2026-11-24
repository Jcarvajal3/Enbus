"use client";

import { useActionState, useId } from "react";
import { ArrowRight, Check, MagnifyingGlass } from "@phosphor-icons/react";

import { rastrearEncomienda, type EstadoRastreo } from "@/app/(sitio)/acciones";
import { formatCiudad, formatFechaHoraCortaVE } from "@/lib/ve.generated";
import { ETAPAS_ENCOMIENDA, estadoEncomienda, indiceEtapa, type TonoEstado } from "@/lib/sitio/estados-publicos";
import type { EncomiendaPublica } from "@/lib/sitio/consultas";
import estilos from "./rastreo.module.css";

const INICIAL: EstadoRastreo = { tipo: "inicial" };

const CHIP: Record<TonoEstado, string> = {
  pendiente: "s-chip--sol",
  info: "s-chip--cielo",
  exito: "s-chip--ok",
  peligro: "s-chip--coral",
  terminado: "s-chip--coral",
  neutro: "",
};

function lugar(l: EncomiendaPublica["origen"]): string {
  return l.ciudad ? formatCiudad(l.ciudad) : (l.estado ?? "—");
}

function Resultado({ e }: { e: EncomiendaPublica }) {
  const estado = estadoEncomienda(e.estado);
  const actual = indiceEtapa(e.estado);
  // Fecha de cada etapa: la del primer cambio a uno de sus estados.
  const fechaEtapa = (estados: readonly string[]) => e.historial.find((h) => estados.includes(h.estado))?.fecha;

  return (
    <div className={estilos.resultado}>
      <div className={estilos.cabeza}>
        <span className={`s-chip ${CHIP[estado.tono]} ${estilos.estado}`}>{estado.etiqueta}</span>
        <p className={`${estilos.meta} s-num`}>
          {e.tracking_id}
          {e.cooperativa ? ` · ${e.cooperativa}` : ""}
        </p>
      </div>
      <p className={estilos.ruta}>
        <span>{lugar(e.origen)}</span>
        <ArrowRight size={22} weight="bold" aria-hidden />
        <span className="sr-only">a</span>
        <span>{lugar(e.destino)}</span>
      </p>
      {estado.ayuda && <p className={estilos.explica}>{estado.ayuda}</p>}
      {actual >= 0 && (
        <ol className={estilos.etapas} aria-label="Etapas del envío">
          {ETAPAS_ENCOMIENDA.map((etapa, i) => {
            const fecha = i <= actual ? fechaEtapa(etapa.estados) : undefined;
            return (
              <li
                key={etapa.clave}
                className={estilos.etapa}
                data-hecha={i <= actual}
                aria-current={i === actual ? "step" : undefined}
              >
                <span className={estilos.punto} aria-hidden>
                  {i <= actual && <Check size={14} weight="bold" />}
                </span>
                <span className={estilos.etapaTexto}>
                  <strong>{etapa.etiqueta}</strong>
                  <span className="s-num">{fecha ? formatFechaHoraCortaVE(fecha) : ""}</span>
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

function Aviso({ estado, id }: { estado: EstadoRastreo; id: string }) {
  let texto: string | null = null;
  switch (estado.tipo) {
    case "vacio":
      texto = "Escribe el código de la guía para buscarla.";
      break;
    case "formato":
      texto = `«${estado.codigo}» no tiene la forma de un código de EnBus. Revisa la guía: empieza por EB, seguido de dos grupos de números.`;
      break;
    case "no_encontrada":
      texto = "No encontramos un envío con ese código. Revisa cada número; si lo acabas de crear, puede tardar unos minutos.";
      break;
    case "limite":
      texto = `Hiciste muchas búsquedas seguidas. Intenta de nuevo en ${estado.espera}.`;
      break;
    case "no_disponible":
    case "error":
      texto = "El rastreo no está disponible en este momento. Intenta en unos minutos o revisa el envío en la app.";
      break;
  }
  if (!texto) return null;
  return (
    <p id={id} className={estilos.aviso} role="alert">
      {texto}
    </p>
  );
}

/**
 * Rastrea una encomienda de verdad con el código de su guía. Sin JS el formulario se
 * envía igual (acción del servidor). Está pensado para ir sobre un fondo de noche.
 */
export function Rastreador() {
  // `accion` es la acción del servidor tal cual: sin JS el formulario se envía igual.
  const [estado, accion, pendiente] = useActionState(rastrearEncomienda, INICIAL);
  const id = useId();
  const invalido = estado.tipo === "formato" || estado.tipo === "vacio" || estado.tipo === "no_encontrada";
  const hayAviso = estado.tipo !== "inicial" && estado.tipo !== "encontrada";

  return (
    <div>
      <form className={estilos.forma} action={accion}>
        <label className={estilos.etiqueta} htmlFor={`${id}-codigo`}>
          Código de seguimiento
        </label>
        <div className={estilos.fila}>
          <input
            id={`${id}-codigo`}
            className={estilos.campo}
            name="codigo"
            type="text"
            inputMode="text"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            maxLength={40}
            placeholder="EB-261113-04821"
            // React reinicia el formulario tras la acción (vuelve al defaultValue): se
            // repone lo escrito para no borrarle el código a quien lo tiene que corregir.
            key={estado.entrada}
            defaultValue={estado.tipo === "encontrada" ? estado.encomienda.tracking_id : estado.entrada}
            aria-describedby={`${id}-ayuda${hayAviso ? ` ${id}-aviso` : ""}`}
            aria-invalid={invalido || undefined}
          />
          <button type="submit" className={`s-boton s-boton--sol s-boton--lg ${estilos.boton}`} disabled={pendiente}>
            <MagnifyingGlass weight="bold" aria-hidden />
            {pendiente ? "Buscando…" : "Rastrear"}
          </button>
        </div>
        <p id={`${id}-ayuda`} className={estilos.ayuda}>
          Está en la guía impresa y en la app. Ej.: EB-261113-04821
        </p>
      </form>
      <div className={estilos.zona} aria-live="polite">
        <Aviso estado={estado} id={`${id}-aviso`} />
        {estado.tipo === "encontrada" && <Resultado e={estado.encomienda} />}
      </div>
    </div>
  );
}
