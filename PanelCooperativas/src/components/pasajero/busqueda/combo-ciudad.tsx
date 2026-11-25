"use client";

// ─── Ciudad con autocompletado (combobox del buscador) ───────────────────────
// Escribes y filtra sin tildes ni mayúsculas; ↑/↓ mueven, Enter elige, Esc cierra.
// Solo ofrece las ciudades que le pasan (las que tienen salidas). El foco se queda en el
// campo y la opción activa se anuncia con `aria-activedescendant`.

import { useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

import { ciudadVE, formatCiudad, normalizarCiudad } from "@/lib/ve.generated";
import s from "./buscador.module.css";

export interface ComboCiudadProps {
  id: string;
  label: string;
  /** Clave de ciudad ("puerto_la_cruz") o "". */
  value: string;
  onChange(clave: string): void;
  /** Claves de las ciudades que se ofrecen. */
  opciones: readonly string[];
  placeholder: string;
  icono: ReactNode;
  /** Mensaje de error bajo el campo (ya en español). */
  error?: string | null;
  /** Texto cuando no hay opciones que coincidan. */
  sinResultados?: string;
}

function plano(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function ComboCiudad({
  id,
  label,
  value,
  onChange,
  opciones,
  placeholder,
  icono,
  error,
  sinResultados = "No hay salidas desde o hacia esa ciudad.",
}: ComboCiudadProps) {
  const listaId = useId();
  const [abierto, setAbierto] = useState(false);
  // Texto que se está escribiendo; null = se muestra la ciudad elegida.
  const [texto, setTexto] = useState<string | null>(null);
  const [activa, setActiva] = useState(0);
  const refInput = useRef<HTMLInputElement>(null);

  const catalogo = useMemo(
    () =>
      opciones.map((clave) => ({
        clave,
        nombre: formatCiudad(clave),
        estado: ciudadVE(clave)?.estado.nombre ?? "",
      })),
    [opciones]
  );

  const visibles = useMemo(() => {
    const q = plano(texto ?? "");
    if (!q) return catalogo;
    const palabras = q.split(" ");
    return catalogo.filter((c) => {
      const pajar = `${plano(c.nombre)} ${plano(c.estado)}`;
      return palabras.every((p) => pajar.includes(p));
    });
  }, [catalogo, texto]);

  const activaEfectiva = Math.min(activa, Math.max(visibles.length - 1, 0));
  const idOpcion = (i: number) => `${listaId}-${i}`;
  const mostrado = texto ?? (value ? formatCiudad(value) : "");

  const abrir = () => {
    setAbierto(true);
    const i = visibles.findIndex((c) => c.clave === value);
    setActiva(Math.max(i, 0));
  };

  const elegir = (clave: string) => {
    onChange(clave);
    setTexto(null);
    setAbierto(false);
  };

  const cerrar = () => {
    // Si lo escrito coincide con una sola ciudad, se toma; si no, vuelve a la elegida.
    if (texto !== null && visibles.length === 1 && plano(texto)) {
      onChange(visibles[0].clave);
    } else if (texto !== null) {
      const exacta = catalogo.find((c) => normalizarCiudad(c.nombre) === normalizarCiudad(texto));
      if (exacta) onChange(exacta.clave);
    }
    setTexto(null);
    setAbierto(false);
  };

  const alTeclear = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!abierto) return abrir();
      if (visibles.length) setActiva((activaEfectiva + 1) % visibles.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (!abierto) return abrir();
      if (visibles.length) setActiva((activaEfectiva - 1 + visibles.length) % visibles.length);
    } else if (e.key === "Enter") {
      if (abierto && visibles[activaEfectiva]) {
        e.preventDefault();
        elegir(visibles[activaEfectiva].clave);
      }
    } else if (e.key === "Escape") {
      if (abierto) {
        e.preventDefault();
        setTexto(null);
        setAbierto(false);
      }
    }
  };

  const errorId = `${id}-error`;
  return (
    <div className={s.campo} data-invalido={error ? "true" : undefined}>
      <label htmlFor={id} className={s.etiqueta}>
        {label}
      </label>
      <div className={s.entrada}>
        <span className={s.icono} aria-hidden>
          {icono}
        </span>
        <input
          ref={refInput}
          id={id}
          type="text"
          role="combobox"
          aria-expanded={abierto}
          aria-controls={listaId}
          aria-autocomplete="list"
          aria-activedescendant={abierto && visibles.length > 0 ? idOpcion(activaEfectiva) : undefined}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="next"
          placeholder={placeholder}
          value={mostrado}
          className={s.input}
          onFocus={(e) => {
            e.currentTarget.select();
            abrir();
          }}
          onClick={() => !abierto && abrir()}
          onChange={(e) => {
            setTexto(e.target.value);
            setActiva(0);
            setAbierto(true);
          }}
          onKeyDown={alTeclear}
          onBlur={cerrar}
        />
      </div>

      {/* El `onMouseDown` evita que el campo pierda el foco antes de registrar el clic. */}
      {abierto && (
        <ul
          id={listaId}
          role="listbox"
          aria-label={label}
          className={s.lista}
          onMouseDown={(e) => e.preventDefault()}
        >
          {visibles.map((c, i) => (
            // El foco se queda en el campo (aria-activedescendant): la opción no se enfoca ni escucha teclas.
            // eslint-disable-next-line jsx-a11y/click-events-have-key-events
            <li
              key={c.clave}
              id={idOpcion(i)}
              role="option"
              aria-selected={c.clave === value}
              data-activa={i === activaEfectiva || undefined}
              className={s.opcion}
              onClick={() => elegir(c.clave)}
              onMouseMove={() => i !== activaEfectiva && setActiva(i)}
            >
              <span className={s.opcionNombre}>{c.nombre}</span>
              {c.estado && <span className={s.opcionEstado}>{c.estado}</span>}
            </li>
          ))}
          {visibles.length === 0 && <li className={s.sinResultados}>{sinResultados}</li>}
        </ul>
      )}
      <p role="status" aria-live="polite" className="sr-only">
        {abierto ? (visibles.length === 0 ? sinResultados : `${visibles.length} ciudades`) : ""}
      </p>
      {error && (
        <p id={errorId} role="alert" className={s.error}>
          {error}
        </p>
      )}
    </div>
  );
}
