"use client";

// ─── Filtros de resultados: cooperativa y franja horaria ─────────────────────
// Los filtros viven en la URL (`coop`, `franja`): cada cambio navega a la misma búsqueda con los
// filtros nuevos. En escritorio van en una columna lateral; en móvil, en una hoja inferior
// (`<dialog>` nativo: foco atrapado y Esc cierran sin código extra).

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Funnel, X } from "@phosphor-icons/react";

import { FRANJAS, urlBusqueda, type Franja, type ParametrosBusqueda } from "./utilidades";
import s from "./filtros-viajes.module.css";

export interface OpcionCooperativa {
  id: string;
  nombre: string;
  salidas: number;
}

interface Props {
  busqueda: ParametrosBusqueda;
  cooperativas: OpcionCooperativa[];
  /** Nº de salidas del día por franja (sin filtrar). */
  porFranja: Record<Franja, number>;
}

function alternar<T>(lista: readonly T[], valor: T): T[] {
  return lista.includes(valor) ? lista.filter((x) => x !== valor) : [...lista, valor];
}

function Contenido({
  busqueda,
  cooperativas,
  porFranja,
  alCambiar,
}: Props & { alCambiar(href: string): void }) {
  const cambiar = (cambio: Partial<Pick<ParametrosBusqueda, "cooperativas" | "franjas">>) =>
    alCambiar(urlBusqueda({ ...busqueda, ...cambio }));
  const hayFiltros = busqueda.cooperativas.length > 0 || busqueda.franjas.length > 0;

  return (
    <div className={s.contenido}>
      <fieldset className={s.grupo}>
        <legend className={s.titulo}>Hora de salida</legend>
        {FRANJAS.map((f) => (
          <label key={f.id} className={s.opcion}>
            <input
              type="checkbox"
              className={s.casilla}
              checked={busqueda.franjas.includes(f.id)}
              onChange={() => cambiar({ franjas: alternar(busqueda.franjas, f.id) })}
            />
            <span className={s.texto}>
              <span className={s.nombre}>{f.etiqueta}</span>
              <span className={s.detalle}>{f.rango}</span>
            </span>
            <span className={`${s.cuenta} s-num`}>{porFranja[f.id]}</span>
          </label>
        ))}
      </fieldset>

      {cooperativas.length > 1 && (
        <fieldset className={s.grupo}>
          <legend className={s.titulo}>Cooperativa</legend>
          {cooperativas.map((c) => (
            <label key={c.id} className={s.opcion}>
              <input
                type="checkbox"
                className={s.casilla}
                checked={busqueda.cooperativas.includes(c.id)}
                onChange={() => cambiar({ cooperativas: alternar(busqueda.cooperativas, c.id) })}
              />
              <span className={s.texto}>
                <span className={s.nombre}>{c.nombre}</span>
              </span>
              <span className={`${s.cuenta} s-num`}>{c.salidas}</span>
            </label>
          ))}
        </fieldset>
      )}

      {hayFiltros && (
        <button type="button" className={s.limpiar} onClick={() => cambiar({ cooperativas: [], franjas: [] })}>
          Quitar filtros
        </button>
      )}
    </div>
  );
}

/** Columna lateral (escritorio) y botón "Filtros" con hoja inferior (móvil). */
export function FiltrosViajes(props: Props) {
  const router = useRouter();
  const uid = useId();
  const dialogo = useRef<HTMLDialogElement>(null);
  const [, iniciar] = useTransition();
  const [abierto, setAbierto] = useState(false);
  const activos = props.busqueda.cooperativas.length + props.busqueda.franjas.length;

  const navegar = (href: string) => iniciar(() => router.replace(href, { scroll: false }));

  useEffect(() => {
    const d = dialogo.current;
    if (!d) return;
    if (abierto && !d.open) d.showModal();
    if (!abierto && d.open) d.close();
  }, [abierto]);

  return (
    <>
      <aside className={s.lateral} aria-label="Filtros">
        <h2 className={s.cabecera}>Filtrar</h2>
        <Contenido {...props} alCambiar={navegar} />
      </aside>

      <button type="button" className={s.abrir} onClick={() => setAbierto(true)} aria-haspopup="dialog">
        <Funnel aria-hidden />
        Filtros
        {activos > 0 && <span className={`${s.badge} s-num`}>{activos}</span>}
      </button>

      {/* El clic en el fondo cierra; con teclado, Esc cierra de forma nativa. */}
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions */}
      <dialog
        ref={dialogo}
        className={s.hoja}
        aria-labelledby={`${uid}-titulo`}
        onClose={() => setAbierto(false)}
        onClick={(e) => {
          // Clic en el fondo (el propio <dialog>) cierra.
          if (e.target === e.currentTarget) setAbierto(false);
        }}
      >
        <div className={s.hojaCab}>
          <h2 id={`${uid}-titulo`} className={s.hojaTitulo}>
            Filtrar salidas
          </h2>
          <button type="button" className={s.cerrar} onClick={() => setAbierto(false)} aria-label="Cerrar filtros">
            <X aria-hidden weight="bold" />
          </button>
        </div>
        <Contenido {...props} alCambiar={navegar} />
        <button type="button" className="s-boton s-boton--tinta" onClick={() => setAbierto(false)}>
          Ver resultados
        </button>
      </dialog>
    </>
  );
}
