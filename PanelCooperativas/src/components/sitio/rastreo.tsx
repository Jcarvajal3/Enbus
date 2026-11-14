"use client";

import { useActionState, useId } from "react";

import { rastrearEncomienda, type EstadoRastreo } from "@/app/(sitio)/acciones";
import { formatCiudad, formatFechaHoraCortaVE } from "@/lib/ve.generated";
import { ETAPAS_ENCOMIENDA, estadoEncomienda, indiceEtapa } from "@/lib/sitio/estados-publicos";
import type { EncomiendaPublica } from "@/lib/sitio/consultas";

const INICIAL: EstadoRastreo = { tipo: "inicial" };

function lugar(l: EncomiendaPublica["origen"]): string {
  return l.ciudad ? formatCiudad(l.ciudad) : l.estado ?? "—";
}

function Resultado({ e }: { e: EncomiendaPublica }) {
  const estado = estadoEncomienda(e.estado);
  const actual = indiceEtapa(e.estado);
  // Fecha de cada etapa: la del primer cambio a uno de sus estados.
  const fechaEtapa = (estados: readonly string[]) => e.historial.find((h) => estados.includes(h.estado))?.fecha;

  return (
    <div className="s-resultado" aria-live="polite">
      <span className={`s-resultado__estado s-tono-${estado.tono}`}>{estado.etiqueta}</span>
      <p className="s-resultado__ruta">
        {lugar(e.origen)} → {lugar(e.destino)}
      </p>
      <p className="s-resultado__meta s-num">
        {e.tracking_id}
        {e.cooperativa ? ` · ${e.cooperativa}` : ""}
      </p>
      {estado.ayuda && <p className="s-resultado__ayuda">{estado.ayuda}</p>}
      {actual >= 0 && (
        <ol className="s-etapas" aria-label="Etapas del envío">
          {ETAPAS_ENCOMIENDA.map((etapa, i) => {
            const fecha = i <= actual ? fechaEtapa(etapa.estados) : undefined;
            return (
              <li key={etapa.clave} data-hecha={i <= actual} aria-current={i === actual ? "step" : undefined}>
                <span>{etapa.etiqueta}</span>
                <span className="s-num">{fecha ? formatFechaHoraCortaVE(fecha) : ""}</span>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

function Aviso({ estado }: { estado: EstadoRastreo }) {
  switch (estado.tipo) {
    case "vacio":
      return <p className="s-dialogo__aviso" role="alert">Escribe el código de la guía para buscarla.</p>;
    case "formato":
      return (
        <p className="s-dialogo__aviso" role="alert">
          «{estado.codigo}» no tiene la forma de un código de EnBus. Revisa la guía: empieza por EB, seguido de dos grupos
          de números.
        </p>
      );
    case "no_encontrada":
      return (
        <p className="s-dialogo__aviso" role="alert">
          No encontramos un envío con ese código. Revisa cada número; si lo acabas de crear, puede tardar unos minutos.
        </p>
      );
    case "limite":
      return (
        <p className="s-dialogo__aviso" role="alert">
          Hiciste muchas búsquedas seguidas. Intenta de nuevo en {estado.espera}.
        </p>
      );
    case "no_disponible":
    case "error":
      return (
        <p className="s-dialogo__aviso s-dialogo__aviso--error" role="alert">
          El rastreo no está disponible en este momento. Intenta en unos minutos o revisa el envío en la app.
        </p>
      );
    default:
      return null;
  }
}

/**
 * Lo único que se puede hacer en la portada: rastrear una encomienda de verdad con el
 * código de su guía. Sin JS el formulario se envía igual (acción del servidor).
 */
export function Rastreo() {
  // `accion` es la acción del servidor tal cual: sin JS el formulario se envía igual.
  const [estado, accion, pendiente] = useActionState(rastrearEncomienda, INICIAL);
  const id = useId();
  const invalido = estado.tipo === "formato" || estado.tipo === "vacio" || estado.tipo === "no_encontrada";

  return (
    <section id="rastrear" className="s-rastreo" aria-labelledby="titulo-rastreo">
      <div className="s-marco s-rastreo__rejilla">
        <div className="s-rastreo__texto">
          <h2 id="titulo-rastreo" data-revelar>
            ¿Dónde va tu paquete?
          </h2>
          <p data-revelar style={{ ["--d" as string]: 1 }}>
            Escribe el código de la guía, el que empieza por EB. Ves en qué etapa está y por dónde pasó, sin crear
            cuenta.
          </p>
        </div>

        <form className="s-dialogo" data-ui action={accion} aria-labelledby={`${id}-titulo`} data-revelar style={{ ["--d" as string]: 2 }}>
          <p id={`${id}-titulo`} className="s-dialogo__titulo">
            Rastrear encomienda
          </p>
          <label htmlFor={`${id}-codigo`}>Código de seguimiento</label>
          <input
            id={`${id}-codigo`}
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
            aria-describedby={`${id}-ayuda`}
            aria-invalid={invalido || undefined}
          />
          <p id={`${id}-ayuda`} className="s-dialogo__ayuda">
            Está en la guía impresa y en la app.
          </p>
          <button type="submit" className="s-boton s-dialogo__boton" disabled={pendiente}>
            {pendiente ? "Buscando…" : "Rastrear"}
          </button>
          <Aviso estado={estado} />
          {estado.tipo === "encontrada" && <Resultado e={estado.encomienda} />}
        </form>
      </div>
    </section>
  );
}
