"use client";

// ─── Fecha del buscador: campo con calendario propio y atajos Hoy / Mañana ───
// Calendario accesible (cuadrícula, lunes primero) que se abre bajo el campo en escritorio y
// como hoja inferior en móvil. Trabaja con 'YYYY-MM-DD' de Venezuela, sin zona horaria.

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { CalendarBlank, CaretLeft, CaretRight } from "@phosphor-icons/react";

import { formatDiaVE, hoyVE, sumarDiasVE } from "@/lib/ve.generated";
import { DIAS_MAXIMOS } from "./utilidades";
import s from "./buscador.module.css";

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];
const DIAS_LARGO = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];
const DIAS_CORTO = ["Lu", "Ma", "Mi", "Ju", "Vi", "Sá", "Do"];

function partes(f: string): [number, number, number] {
  const [y, m, d] = f.split("-").map(Number);
  return [y, m, d];
}

/** 0 = lunes … 6 = domingo. */
function diaSemana(f: string): number {
  const [y, m, d] = partes(f);
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
}

function sumarMeses(f: string, n: number): string {
  const [y, m, d] = partes(f);
  const destino = new Date(Date.UTC(y, m - 1 + n, 1));
  const ultimo = new Date(Date.UTC(destino.getUTCFullYear(), destino.getUTCMonth() + 1, 0)).getUTCDate();
  return `${destino.toISOString().slice(0, 8)}${String(Math.min(d, ultimo)).padStart(2, "0")}`;
}

const primeroDelMes = (f: string) => `${f.slice(0, 8)}01`;

/** "miércoles 25 de noviembre" para lectores de pantalla. */
function nombreDia(f: string): string {
  const [, m, d] = partes(f);
  return `${DIAS_LARGO[diaSemana(f)]} ${d} de ${MESES[m - 1]}`;
}

function etiquetaRelativa(f: string, hoy: string): string | null {
  return f === hoy ? "Hoy" : f === sumarDiasVE(hoy, 1) ? "Mañana" : null;
}

// ─── Calendario ──────────────────────────────────────────────────────────────

function Calendario({
  value,
  hoy,
  max,
  onElegir,
  id,
}: {
  value: string;
  hoy: string;
  max: string;
  onElegir(f: string): void;
  id: string;
}) {
  const inicial = value && value >= hoy && value <= max ? value : hoy;
  const [foco, setFoco] = useState(inicial);
  const [mes, setMes] = useState(primeroDelMes(inicial));
  const botonFoco = useRef<HTMLButtonElement | null>(null);
  const enfocar = useRef(true);

  useEffect(() => {
    if (enfocar.current) botonFoco.current?.focus();
    enfocar.current = true;
  }, [foco, mes]);

  const acotar = (f: string) => (f < hoy ? hoy : f > max ? max : f);
  const irA = (f: string, conFoco: boolean) => {
    const destino = acotar(f);
    enfocar.current = conFoco;
    setFoco(destino);
    setMes(primeroDelMes(destino));
  };

  const alTeclear = (e: KeyboardEvent<HTMLDivElement>) => {
    let destino: string | null = null;
    switch (e.key) {
      case "ArrowLeft": destino = sumarDiasVE(foco, -1); break;
      case "ArrowRight": destino = sumarDiasVE(foco, 1); break;
      case "ArrowUp": destino = sumarDiasVE(foco, -7); break;
      case "ArrowDown": destino = sumarDiasVE(foco, 7); break;
      case "Home": destino = sumarDiasVE(foco, -diaSemana(foco)); break;
      case "End": destino = sumarDiasVE(foco, 6 - diaSemana(foco)); break;
      case "PageUp": destino = sumarMeses(foco, -1); break;
      case "PageDown": destino = sumarMeses(foco, 1); break;
      default: return;
    }
    e.preventDefault();
    irA(destino, true);
  };

  const [anio, nMes] = partes(mes);
  const diasMes = new Date(Date.UTC(anio, nMes, 0)).getUTCDate();
  const celdas: (string | null)[] = [
    ...Array<null>(diaSemana(mes)).fill(null),
    ...Array.from({ length: diasMes }, (_, i) => `${mes.slice(0, 8)}${String(i + 1).padStart(2, "0")}`),
  ];
  while (celdas.length % 7 !== 0) celdas.push(null);
  const semanas = Array.from({ length: celdas.length / 7 }, (_, i) => celdas.slice(i * 7, i * 7 + 7));
  const focoVisible = foco.startsWith(mes.slice(0, 7)) ? foco : mes.slice(0, 8) + "01";
  const tituloId = `${id}-mes`;

  return (
    <div className={s.cal}>
      <div className={s.calCab}>
        <button
          type="button"
          className={s.calNav}
          aria-label="Mes anterior"
          disabled={sumarDiasVE(mes, -1) < hoy}
          onClick={() => irA(sumarMeses(foco, -1), false)}
        >
          <CaretLeft aria-hidden weight="bold" />
        </button>
        <h2 id={tituloId} aria-live="polite" className={s.calTitulo}>
          {MESES[nMes - 1]} {anio}
        </h2>
        <button
          type="button"
          className={s.calNav}
          aria-label="Mes siguiente"
          disabled={sumarMeses(mes, 1) > max}
          onClick={() => irA(sumarMeses(foco, 1), false)}
        >
          <CaretRight aria-hidden weight="bold" />
        </button>
      </div>

      {/* Las teclas llegan desde el día enfocado (los botones); la cuadrícula solo las recoge. */}
      {/* eslint-disable-next-line jsx-a11y/interactive-supports-focus */}
      <div role="grid" aria-labelledby={tituloId} onKeyDown={alTeclear} className={s.calRejilla}>
        <div role="row" className={s.calFila}>
          {DIAS_CORTO.map((corto, i) => (
            <div key={corto} role="columnheader" className={s.calDiaSemana}>
              <span aria-hidden>{corto}</span>
              <span className="sr-only">{DIAS_LARGO[i]}</span>
            </div>
          ))}
        </div>
        {semanas.map((semana, i) => (
          <div key={i} role="row" className={s.calFila}>
            {semana.map((f, c) => {
              if (!f) return <div key={c} role="gridcell" aria-hidden />;
              const bloqueado = f < hoy || f > max;
              const esFoco = f === focoVisible;
              return (
                <div key={f} role="gridcell" aria-selected={f === value} className={s.calCelda}>
                  <button
                    ref={esFoco ? botonFoco : undefined}
                    type="button"
                    className={s.calDia}
                    data-hoy={f === hoy || undefined}
                    data-elegido={f === value || undefined}
                    disabled={bloqueado}
                    tabIndex={esFoco ? 0 : -1}
                    aria-label={`${nombreDia(f)}${f === hoy ? ", hoy" : ""}`}
                    onClick={() => onElegir(f)}
                  >
                    {Number(f.slice(8))}
                  </button>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Atajos ──────────────────────────────────────────────────────────────────

/** Chips "Hoy" y "Mañana". */
export function AtajosFecha({ value, onChange }: { value: string; onChange(f: string): void }) {
  const hoy = hoyVE();
  const manana = sumarDiasVE(hoy, 1);
  return (
    <div className={s.atajos} role="group" aria-label="Atajos de fecha">
      {[
        { f: hoy, texto: "Hoy" },
        { f: manana, texto: "Mañana" },
      ].map(({ f, texto }) => (
        <button
          key={f}
          type="button"
          className={s.chip}
          aria-pressed={value === f}
          onClick={() => onChange(f)}
        >
          {texto}
        </button>
      ))}
    </div>
  );
}

// ─── Campo ───────────────────────────────────────────────────────────────────

export function SelectorFecha({
  id,
  value,
  onChange,
}: {
  id: string;
  value: string;
  onChange(fecha: string): void;
}) {
  const hoy = hoyVE();
  const max = sumarDiasVE(hoy, DIAS_MAXIMOS);
  const [abierto, setAbierto] = useState(false);
  const raiz = useRef<HTMLDivElement>(null);
  const disparador = useRef<HTMLButtonElement>(null);
  const dialogoId = useId();

  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: PointerEvent) => {
      if (raiz.current && !raiz.current.contains(e.target as Node)) setAbierto(false);
    };
    const tecla = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") {
        setAbierto(false);
        disparador.current?.focus();
      }
    };
    document.addEventListener("pointerdown", fuera);
    document.addEventListener("keydown", tecla);
    return () => {
      document.removeEventListener("pointerdown", fuera);
      document.removeEventListener("keydown", tecla);
    };
  }, [abierto]);

  const relativa = value ? etiquetaRelativa(value, hoy) : null;

  return (
    <div className={s.campo} ref={raiz}>
      <label htmlFor={id} className={s.etiqueta}>
        Fecha
      </label>
      <div className={s.entrada}>
        <button
          ref={disparador}
          id={id}
          type="button"
          className={s.disparador}
          aria-haspopup="dialog"
          aria-expanded={abierto}
          aria-controls={abierto ? dialogoId : undefined}
          onClick={() => setAbierto((a) => !a)}
        >
          <span className={s.icono} aria-hidden>
            <CalendarBlank />
          </span>
          <span className={s.disparadorTexto}>
            {value ? formatDiaVE(value) : "Elige la fecha"}
            {relativa && <span className={s.disparadorRel}> · {relativa}</span>}
          </span>
        </button>
      </div>

      {abierto && (
        <>
          <button type="button" tabIndex={-1} aria-hidden className={s.telon} onClick={() => setAbierto(false)} />
          <div id={dialogoId} role="dialog" aria-label="Elige la fecha de salida" className={s.popover}>
            <Calendario
              id={`${id}-cal`}
              value={value}
              hoy={hoy}
              max={max}
              onElegir={(f) => {
                onChange(f);
                setAbierto(false);
                disparador.current?.focus();
              }}
            />
            <button type="button" className={s.cerrarHoja} onClick={() => setAbierto(false)}>
              Cerrar
            </button>
          </div>
        </>
      )}
    </div>
  );
}
