"use client";

// ─── Calendario de un mes (interno de FechaField) ────────────────────────────
// Cuadrícula accesible (role="grid"), lunes primero, en español. Trabaja con fechas
// 'YYYY-MM-DD' de calendario (sin zona horaria): la comparación de textos ISO es la de fechas.
// Teclado: ←/→ día, ↑/↓ semana, Inicio/Fin lunes/domingo, RePág/AvPág mes (con Mayús, año).

import { useEffect, useRef, useState, type KeyboardEvent, type RefObject } from "react";
import { CaretLeftIcon, CaretRightIcon } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];
const DIAS_LARGO = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];
const DIAS_CORTO = ["Lu", "Ma", "Mi", "Ju", "Vi", "Sá", "Do"];

const FECHA_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export const esFechaISO = (f: string | null | undefined): f is string => !!f && FECHA_RE.test(f);

function partes(f: string): [number, number, number] {
  const m = FECHA_RE.exec(f)!;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function armar(y: number, m: number, d: number): string {
  return new Date(Date.UTC(y, m - 1, d)).toISOString().slice(0, 10);
}

const sumarDias = (f: string, n: number) => {
  const [y, m, d] = partes(f);
  return armar(y, m, d + n);
};

/** Suma meses conservando el día (o el último del mes si no existe). */
function sumarMeses(f: string, n: number): string {
  const [y, m, d] = partes(f);
  const destino = new Date(Date.UTC(y, m - 1 + n, 1));
  const ultimo = new Date(Date.UTC(destino.getUTCFullYear(), destino.getUTCMonth() + 1, 0)).getUTCDate();
  return armar(destino.getUTCFullYear(), destino.getUTCMonth() + 1, Math.min(d, ultimo));
}

/** 0 = lunes … 6 = domingo. */
function diaSemana(f: string): number {
  const [y, m, d] = partes(f);
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
}

const primeroDelMes = (f: string) => `${f.slice(0, 8)}01`;

/** "martes, 3 de noviembre de 2026" */
export function nombreLargoFecha(f: string): string {
  const [y, m, d] = partes(f);
  return `${DIAS_LARGO[diaSemana(f)]}, ${d} de ${MESES[m - 1]} de ${y}`;
}

export interface CalendarioProps {
  /** Fecha elegida ('YYYY-MM-DD') o "". */
  value: string;
  /** Hoy en Venezuela: se marca y es el punto de partida si no hay valor. */
  hoy: string;
  min?: string;
  max?: string;
  /** Días con punto (y los únicos elegibles si `soloActivos`). */
  diasActivos?: ReadonlySet<string>;
  soloActivos?: boolean;
  /** Frase para lectores de pantalla y leyenda de los días con punto. */
  leyendaActivos: string;
  onElegir(fecha: string): void;
  /** Recibe el botón del día enfocable para darle el foco al abrir. */
  refFoco?: RefObject<HTMLButtonElement | null>;
  id: string;
}

export function Calendario({
  value,
  hoy,
  min,
  max,
  diasActivos,
  soloActivos,
  leyendaActivos,
  onElegir,
  refFoco,
  id,
}: CalendarioProps) {
  const inicial = (() => {
    const base = esFechaISO(value) ? value : hoy;
    if (min && base < min) return min;
    if (max && base > max) return max;
    return base;
  })();
  const [foco, setFoco] = useState(inicial);
  const [mes, setMes] = useState(primeroDelMes(inicial));
  const botonFoco = useRef<HTMLButtonElement | null>(null);
  const hayQueEnfocar = useRef(false);

  useEffect(() => {
    if (hayQueEnfocar.current) {
      hayQueEnfocar.current = false;
      botonFoco.current?.focus();
    }
  }, [foco, mes]);

  const deshabilitado = (f: string) =>
    (!!min && f < min) || (!!max && f > max) || (!!soloActivos && !!diasActivos && !diasActivos.has(f));

  const acotar = (f: string) => (min && f < min ? min : max && f > max ? max : f);

  const irA = (f: string, enfocar: boolean) => {
    const destino = acotar(f);
    hayQueEnfocar.current = enfocar;
    setFoco(destino);
    setMes(primeroDelMes(destino));
  };

  const alTeclear = (e: KeyboardEvent<HTMLDivElement>) => {
    let destino: string | null = null;
    switch (e.key) {
      case "ArrowLeft": destino = sumarDias(foco, -1); break;
      case "ArrowRight": destino = sumarDias(foco, 1); break;
      case "ArrowUp": destino = sumarDias(foco, -7); break;
      case "ArrowDown": destino = sumarDias(foco, 7); break;
      case "Home": destino = sumarDias(foco, -diaSemana(foco)); break;
      case "End": destino = sumarDias(foco, 6 - diaSemana(foco)); break;
      case "PageUp": destino = sumarMeses(foco, e.shiftKey ? -12 : -1); break;
      case "PageDown": destino = sumarMeses(foco, e.shiftKey ? 12 : 1); break;
      default: return;
    }
    e.preventDefault();
    irA(destino, true);
  };

  const [anio, nMes] = partes(mes);
  const huecos = diaSemana(mes);
  const diasMes = new Date(Date.UTC(anio, nMes, 0)).getUTCDate();
  const celdas: (string | null)[] = [
    ...Array<null>(huecos).fill(null),
    ...Array.from({ length: diasMes }, (_, i) => armar(anio, nMes, i + 1)),
  ];
  while (celdas.length % 7 !== 0) celdas.push(null);
  const semanas = Array.from({ length: celdas.length / 7 }, (_, i) => celdas.slice(i * 7, i * 7 + 7));

  const anteriorBloqueado = !!min && sumarDias(mes, -1) < min;
  const siguienteBloqueado = !!max && sumarMeses(mes, 1) > max;
  const tituloId = `${id}-mes`;
  // El foco rueda por el día enfocado; si ese día no está en el mes visible (se cambió de mes
  // con los botones), el primer día elegible del mes.
  const focoVisible = foco.startsWith(mes.slice(0, 7)) ? foco : mes;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <button
          type="button"
          aria-label="Mes anterior"
          disabled={anteriorBloqueado}
          onClick={() => irA(sumarMeses(foco, -1), false)}
          className="flex size-10 items-center justify-center rounded-full outline-none hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-accent-strong/30 disabled:pointer-events-none disabled:opacity-30"
        >
          <CaretLeftIcon aria-hidden className="size-4" />
        </button>
        <h2 id={tituloId} aria-live="polite" className="text-[15px] font-semibold capitalize">
          {MESES[nMes - 1]} {anio}
        </h2>
        <button
          type="button"
          aria-label="Mes siguiente"
          disabled={siguienteBloqueado}
          onClick={() => irA(sumarMeses(foco, 1), false)}
          className="flex size-10 items-center justify-center rounded-full outline-none hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-accent-strong/30 disabled:pointer-events-none disabled:opacity-30"
        >
          <CaretRightIcon aria-hidden className="size-4" />
        </button>
      </div>

      {/* Las teclas llegan desde el día enfocado (los botones); la cuadrícula solo las recoge. */}
      {/* eslint-disable-next-line jsx-a11y/interactive-supports-focus */}
      <div role="grid" aria-labelledby={tituloId} onKeyDown={alTeclear} className="flex flex-col">
        <div role="row" className="grid grid-cols-7">
          {DIAS_CORTO.map((corto, i) => (
            <div key={corto} role="columnheader" className="py-1 text-center text-xs font-medium text-muted-foreground">
              <span aria-hidden>{corto}</span>
              <span className="sr-only">{DIAS_LARGO[i]}</span>
            </div>
          ))}
        </div>
        {semanas.map((semana, s) => (
          <div key={s} role="row" className="grid grid-cols-7">
            {semana.map((f, c) => {
              if (!f) return <div key={c} role="gridcell" aria-hidden />;
              const elegida = f === value;
              const activo = !!diasActivos?.has(f);
              const bloqueado = deshabilitado(f);
              const esFoco = f === focoVisible;
              return (
                <div key={f} role="gridcell" aria-selected={elegida} className="flex justify-center">
                  <button
                    type="button"
                    ref={(el) => {
                      if (esFoco) {
                        botonFoco.current = el;
                        if (refFoco) refFoco.current = el;
                      }
                    }}
                    tabIndex={esFoco ? 0 : -1}
                    aria-disabled={bloqueado || undefined}
                    aria-current={f === hoy ? "date" : undefined}
                    aria-label={`${nombreLargoFecha(f)}${f === hoy ? ", hoy" : ""}${activo ? `, ${leyendaActivos}` : ""}`}
                    onClick={() => {
                      if (!bloqueado) onElegir(f);
                    }}
                    onFocus={() => setFoco(f)}
                    className={cn(
                      "relative flex size-10 items-center justify-center rounded-full text-[15px] tabular-nums outline-none transition-colors",
                      "focus-visible:ring-[3px] focus-visible:ring-accent-strong/40",
                      elegida
                        ? "bg-accent-strong font-semibold text-accent-strong-foreground"
                        : bloqueado
                          ? "cursor-not-allowed text-muted-foreground/50"
                          : "hover:bg-muted",
                      f === hoy && !elegida && "font-semibold ring-1 ring-accent-strong/60"
                    )}
                  >
                    {Number(f.slice(8))}
                    {activo && (
                      <span
                        aria-hidden
                        className={cn(
                          "absolute bottom-1 size-1 rounded-full",
                          elegida ? "bg-accent-strong-foreground" : "bg-accent-strong"
                        )}
                      />
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {diasActivos && diasActivos.size > 0 && (
        <p className="flex items-center gap-2 pt-1 text-xs text-muted-foreground">
          <span aria-hidden className="size-1.5 rounded-full bg-accent-strong" />
          {leyendaActivos}
        </p>
      )}
    </div>
  );
}
