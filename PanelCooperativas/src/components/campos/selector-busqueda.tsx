"use client";

// ─── Selector con búsqueda (base de CiudadField y BancoField) ────────────────
// Botón con aspecto de campo que abre una lista con buscador (popover en escritorio, hoja en
// móvil). Patrón combobox: el foco se queda en el buscador y la opción activa se anuncia con
// `aria-activedescendant`; ↑/↓ mueven, Enter elige, Esc cierra. Sin tildes ni mayúsculas.

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { CaretDownIcon, CheckIcon, MagnifyingGlassIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CLASE_BOTON_CAMPO, CLASE_BOTON_CAMPO_VACIO, SuperficieCampo } from "./superficie-campo";

export interface OpcionBusqueda {
  id: string;
  etiqueta: string;
  /** Texto secundario a la derecha (código del banco). */
  detalle?: string;
  /** Texto extra por el que también se encuentra (alias). */
  busqueda?: string;
}

export interface GrupoBusqueda {
  id: string;
  /** Sin título = lista plana. El título también es buscable ("Zulia" muestra sus ciudades). */
  titulo?: string;
  opciones: readonly OpcionBusqueda[];
}

/** Minúsculas, sin tildes y con espacios simples. */
export function plano(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Cada palabra de la consulta debe aparecer en el texto de la opción o en el título de su grupo. */
export function filtrarGrupos(grupos: readonly GrupoBusqueda[], consulta: string): GrupoBusqueda[] {
  const palabras = plano(consulta).split(" ").filter(Boolean);
  if (palabras.length === 0) return grupos.filter((g) => g.opciones.length > 0).map((g) => ({ ...g }));
  const resultado: GrupoBusqueda[] = [];
  for (const g of grupos) {
    const titulo = g.titulo ? plano(g.titulo) : "";
    const opciones = g.opciones.filter((o) => {
      const pajar = `${plano(o.etiqueta)} ${plano(o.detalle ?? "")} ${plano(o.busqueda ?? "")} ${titulo}`;
      return palabras.every((p) => pajar.includes(p));
    });
    if (opciones.length > 0) resultado.push({ ...g, opciones });
  }
  return resultado;
}

export interface SelectorBusquedaProps {
  /** `id` del botón (la etiqueta del campo apunta a él). */
  id: string;
  grupos: readonly GrupoBusqueda[];
  /** `id` de la opción elegida. */
  valorId: string | null;
  /** Texto del botón cuando hay valor ("Mérida, Mérida"); si es null, se muestra `placeholder`. */
  textoValor: string | null;
  placeholder: string;
  /** Título de la hoja y nombre de la lista. */
  titulo: string;
  placeholderBusqueda: string;
  /** Texto cuando la búsqueda no encuentra nada. */
  sinResultados: string;
  onElegir(id: string): void;
  disabled?: boolean;
  invalido?: true;
  describedBy?: string;
  required?: boolean;
  /** Si se pasa y hay valor, aparece "Quitar selección" al pie. */
  onLimpiar?: () => void;
  /** Contenido propio al pie de la lista (p. ej. una nota). */
  pie?: ReactNode;
}

export function SelectorBusqueda({
  id,
  grupos,
  valorId,
  textoValor,
  placeholder,
  titulo,
  placeholderBusqueda,
  sinResultados,
  onElegir,
  disabled,
  invalido,
  describedBy,
  required,
  onLimpiar,
  pie,
}: SelectorBusquedaProps) {
  const [abierto, setAbierto] = useState(false);
  const [consulta, setConsulta] = useState("");
  const [activa, setActiva] = useState(0);
  const refBusqueda = useRef<HTMLInputElement>(null);
  const listaId = useId();

  const visibles = useMemo(() => filtrarGrupos(grupos, consulta), [grupos, consulta]);
  const planas = useMemo(() => visibles.flatMap((g) => g.opciones), [visibles]);
  const idOpcion = (i: number) => `${listaId}-op-${i}`;
  const activaEfectiva = Math.min(activa, Math.max(planas.length - 1, 0));

  const cambiarAbierto = (abrir: boolean) => {
    setAbierto(abrir);
    if (abrir) {
      // Abre sobre la opción elegida (si la hay) y con la búsqueda vacía.
      setConsulta("");
      const i = valorId ? grupos.flatMap((g) => g.opciones).findIndex((o) => o.id === valorId) : -1;
      setActiva(Math.max(i, 0));
    }
  };

  // La opción activa siempre a la vista al navegar con el teclado.
  useEffect(() => {
    if (!abierto) return;
    document.getElementById(`${listaId}-op-${activaEfectiva}`)?.scrollIntoView({ block: "nearest" });
  }, [abierto, activaEfectiva, listaId]);

  const elegir = (opcionId: string) => {
    onElegir(opcionId);
    setAbierto(false);
  };

  const alTeclear = (e: KeyboardEvent<HTMLInputElement>) => {
    if (planas.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiva((activaEfectiva + 1) % planas.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiva((activaEfectiva - 1 + planas.length) % planas.length);
    } else if (e.key === "PageDown") {
      e.preventDefault();
      setActiva(Math.min(activaEfectiva + 8, planas.length - 1));
    } else if (e.key === "PageUp") {
      e.preventDefault();
      setActiva(Math.max(activaEfectiva - 8, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const o = planas[activaEfectiva];
      if (o) elegir(o.id);
    }
  };

  // Índice plano de la primera opción de cada grupo (para el id de cada opción).
  const inicios = visibles.reduce<number[]>((acc, g, i) => [...acc, i === 0 ? 0 : acc[i - 1] + visibles[i - 1].opciones.length], []);

  return (
    <SuperficieCampo
      abierto={abierto}
      onAbiertoChange={cambiarAbierto}
      titulo={titulo}
      focoInicial={refBusqueda}
      disparador={
        // aria-invalid / aria-required en el botón: lo leen los lectores de pantalla y el estilo depende de él.
        // eslint-disable-next-line jsx-a11y/role-supports-aria-props
        <button
          id={id}
          type="button"
          disabled={disabled}
          aria-invalid={invalido}
          aria-describedby={describedBy}
          aria-required={required || undefined}
          className={cn(CLASE_BOTON_CAMPO, !textoValor && CLASE_BOTON_CAMPO_VACIO)}
        >
          <span className={cn("min-w-0 flex-1 truncate", !textoValor && "font-normal")}>{textoValor ?? placeholder}</span>
          <CaretDownIcon aria-hidden className="size-4 text-muted-foreground" />
        </button>
      }
    >
      <div className="flex flex-col gap-2">
        <div className="relative">
          <MagnifyingGlassIcon
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <input
            ref={refBusqueda}
            type="text"
            role="combobox"
            aria-expanded
            aria-controls={listaId}
            aria-autocomplete="list"
            aria-activedescendant={planas.length > 0 ? idOpcion(activaEfectiva) : undefined}
            aria-label={placeholderBusqueda}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="go"
            placeholder={placeholderBusqueda}
            value={consulta}
            onChange={(e) => {
              setConsulta(e.target.value);
              setActiva(0);
            }}
            onKeyDown={alTeclear}
            className="h-11 w-full rounded-md border border-input-border bg-background pr-4 pl-10 text-base outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-accent-strong focus-visible:ring-[3px] focus-visible:ring-accent-strong/20 md:text-[15px]"
          />
        </div>

        <div
          id={listaId}
          role="listbox"
          aria-label={titulo}
          className="max-h-[min(20rem,50dvh)] overflow-y-auto overscroll-contain"
        >
          {visibles.map((g, gi) => {
            const tituloId = `${listaId}-g-${g.id}`;
            return (
              <div key={g.id} role="group" aria-labelledby={g.titulo ? tituloId : undefined}>
                {g.titulo ? (
                  <div
                    id={tituloId}
                    className="sticky top-0 z-10 bg-popover px-3 pt-2 pb-1 text-xs font-medium text-muted-foreground"
                  >
                    {g.titulo}
                  </div>
                ) : null}
                {g.opciones.map((o, oi) => {
                  const i = inicios[gi] + oi;
                  const elegida = o.id === valorId;
                  return (
                    // El foco se queda en el buscador (aria-activedescendant): la opción no se enfoca ni escucha teclas.
                    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/interactive-supports-focus
                    <div
                      key={o.id}
                      id={idOpcion(i)}
                      role="option"
                      aria-selected={elegida}
                      onClick={() => elegir(o.id)}
                      onMouseMove={() => activaEfectiva !== i && setActiva(i)}
                      className={cn(
                        "flex min-h-11 cursor-default items-center gap-2 rounded-xl px-3 py-2 text-[15px] select-none",
                        i === activaEfectiva && "bg-muted",
                        elegida && "font-medium"
                      )}
                    >
                      <span className="min-w-0 flex-1">{o.etiqueta}</span>
                      {o.detalle ? (
                        <span className="text-[13px] text-muted-foreground tabular-nums">{o.detalle}</span>
                      ) : null}
                      {elegida ? <CheckIcon aria-hidden weight="bold" className="size-4 shrink-0 text-accent-strong" /> : null}
                    </div>
                  );
                })}
              </div>
            );
          })}
          {planas.length === 0 && (
            <p className="px-3 py-6 text-center text-[15px] text-muted-foreground">{sinResultados}</p>
          )}
        </div>

        <p role="status" aria-live="polite" className="sr-only">
          {planas.length === 0 ? sinResultados : `${planas.length} ${planas.length === 1 ? "resultado" : "resultados"}`}
        </p>

        {pie}
        {onLimpiar && valorId ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="self-start"
            onClick={() => {
              onLimpiar();
              setAbierto(false);
            }}
          >
            Quitar selección
          </Button>
        ) : null}
      </div>
    </SuperficieCampo>
  );
}
