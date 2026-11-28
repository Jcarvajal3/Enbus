"use client";

// ─── Filtros de resultados: hora de salida y cooperativa, en pills ───────────
// Los filtros viven en la URL (`franja`, `coop`): cada pill navega a la misma búsqueda con
// los filtros nuevos. Una sola fila sobre los resultados; en móvil se desliza.

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { X } from "@phosphor-icons/react";

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

function Pill({
  activa,
  cuenta,
  titulo,
  onClick,
  children,
}: {
  activa: boolean;
  cuenta: number;
  titulo?: string;
  onClick(): void;
  children: React.ReactNode;
}) {
  // Una franja sin salidas no lleva a ningún lado; si ya está activa, se puede quitar.
  const vacia = cuenta === 0 && !activa;
  return (
    <button
      type="button"
      className={s.pill}
      aria-pressed={activa}
      disabled={vacia}
      title={titulo}
      onClick={onClick}
    >
      {children}
      <span className={`${s.cuenta} s-num`}>{cuenta}</span>
    </button>
  );
}

export function FiltrosViajes({ busqueda, cooperativas, porFranja }: Props) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const hayFiltros = busqueda.cooperativas.length > 0 || busqueda.franjas.length > 0;

  const cambiar = (cambio: Partial<Pick<ParametrosBusqueda, "cooperativas" | "franjas">>) =>
    iniciar(() => router.replace(urlBusqueda({ ...busqueda, ...cambio }), { scroll: false }));

  return (
    <div className={s.filtros} role="group" aria-label="Filtrar salidas" aria-busy={pendiente || undefined}>
      {FRANJAS.map((f) => (
        <Pill
          key={f.id}
          activa={busqueda.franjas.includes(f.id)}
          cuenta={porFranja[f.id]}
          titulo={f.rango}
          onClick={() => cambiar({ franjas: alternar(busqueda.franjas, f.id) })}
        >
          {f.etiqueta}
        </Pill>
      ))}

      {cooperativas.length > 1 && (
        <>
          <span className={s.separador} aria-hidden />
          {cooperativas.map((c) => (
            <Pill
              key={c.id}
              activa={busqueda.cooperativas.includes(c.id)}
              cuenta={c.salidas}
              onClick={() => cambiar({ cooperativas: alternar(busqueda.cooperativas, c.id) })}
            >
              {c.nombre}
            </Pill>
          ))}
        </>
      )}

      {hayFiltros && (
        <button type="button" className={s.limpiar} onClick={() => cambiar({ cooperativas: [], franjas: [] })}>
          <X aria-hidden weight="bold" />
          Quitar filtros
        </button>
      )}
    </div>
  );
}
