"use client";

// ─── Mapa de asientos (taquilla) ────────────────────────────────────────────
// Asientos numerados "1".."N" en filas 2 + pasillo + 2: el mismo formato y la
// misma distribución que la app (EnBusApp/src/utils/seatLayout.ts). El bus se
// dibuja visto desde arriba, con el frente arriba: parabrisas, chofer adelante a
// la izquierda y puerta adelante a la derecha (la cabina es orientativa: la base
// de datos no guarda la distribución real), igual que `SeatSelector` de la app.
// Permite elegir varios asientos para vender una compra completa.
// Colores D24: libre blanco con borde `border-strong`; ocupado relleno
// `surface-dark` con el número en `muted-foreground`; elegido `accent-strong`.
//
// Es controlado: la página guarda la selección (`seleccion` / `onChange`) y pone la
// acción "Continuar" en su `BarraFlujo`. `ocupados` y su carga los lee la página
// (`useAsientosOcupados`).

import { useState } from "react";
import { DoorOpenIcon, SteeringWheelIcon } from "@phosphor-icons/react";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/error-state";
import { cn } from "@/lib/utils";

/** Asientos guardados con el formato antiguo del panel ("3B") → número ("10"). */
export function asientoNumerico(asiento: string): string {
  const m = /^(\d+)([A-D])$/i.exec(asiento.trim());
  if (!m) return asiento.trim();
  return String((Number(m[1]) - 1) * 4 + "ABCD".indexOf(m[2].toUpperCase()) + 1);
}

/** "14" / "14 y 15" / "3, 14 y 15" */
export function listaAsientos(asientos: string[]): string {
  const orden = [...asientos].sort((a, b) => Number(a) - Number(b));
  if (orden.length <= 1) return orden.join("");
  return `${orden.slice(0, -1).join(", ")} y ${orden[orden.length - 1]}`;
}

const CASILLA = "size-12 md:size-14";

/** Filas de 4 (2 + pasillo + 2), con huecos al final. */
export function filasDe(totalAsientos: number): (string | null)[][] {
  const resultado: (string | null)[][] = [];
  for (let numero = 1; numero <= totalAsientos; numero += 4) {
    resultado.push([0, 1, 2, 3].map((i) => (numero + i <= totalAsientos ? String(numero + i) : null)));
  }
  return resultado;
}

/** Carrocería: parabrisas, cabina (chofer y puerta), rótulos de columna, filas y parte trasera. */
function Bus({
  filas,
  casilla,
}: {
  filas: (string | null)[][];
  casilla: (asiento: string | null, idx: number) => React.ReactNode;
}) {
  return (
    <div
      className="w-full max-w-sm rounded-t-[2.5rem] rounded-b-xl bg-surface px-4 pt-4 pb-3 md:px-6 md:pt-5"
      role="group"
      aria-label="Mapa de asientos. El frente del bus está arriba."
    >
      <p className="rounded-t-3xl rounded-b-md bg-info-light px-3 py-2.5 text-center text-[13px] font-medium text-info-text">
        Frente del bus
      </p>

      {/* Cabina: chofer adelante a la izquierda, puerta adelante a la derecha. */}
      <div className="mt-4 flex items-center justify-between gap-3">
        <span
          className="flex h-11 flex-1 items-center justify-center gap-1.5 rounded-md bg-background text-[13px] text-muted-foreground"
          aria-label="Chofer, adelante a la izquierda"
        >
          <SteeringWheelIcon className="size-5" aria-hidden />
          Chofer
        </span>
        <span
          className="flex h-11 flex-1 items-center justify-center gap-1.5 rounded-md bg-primary-light text-[13px] font-semibold text-primary-text"
          aria-label="Puerta, adelante a la derecha"
        >
          <DoorOpenIcon className="size-5" aria-hidden />
          Puerta
        </span>
      </div>

      <div className="mt-4 flex flex-col gap-3">
        <div className="flex w-full items-center justify-between text-[11px] text-muted-foreground" aria-hidden>
          <div className="flex gap-2">
            <span className="w-12 text-center md:w-14">Ventana</span>
            <span className="w-12 text-center md:w-14">Pasillo</span>
          </div>
          <div className="w-6 md:w-8" />
          <div className="flex gap-2">
            <span className="w-12 text-center md:w-14">Pasillo</span>
            <span className="w-12 text-center md:w-14">Ventana</span>
          </div>
        </div>
        {filas.map((fila, filaIdx) => (
          <div key={`fila-${filaIdx}`} className="flex w-full items-center justify-between">
            <div className="flex gap-2">{fila.slice(0, 2).map((a, i) => casilla(a, filaIdx * 4 + i))}</div>
            <div className="w-6 md:w-8" aria-hidden />
            <div className="flex gap-2">{fila.slice(2, 4).map((a, i) => casilla(a, filaIdx * 4 + 2 + i))}</div>
          </div>
        ))}
      </div>

      <p className="mt-4 text-center text-[13px] text-muted-foreground">Parte trasera</p>
    </div>
  );
}

function Leyenda() {
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
      <span className="flex items-center gap-2">
        <span className="size-4 rounded-xs border border-border-strong bg-background" aria-hidden />
        Libre
      </span>
      <span className="flex items-center gap-2">
        <span className="size-4 rounded-xs bg-surface-dark" aria-hidden />
        Ocupado
      </span>
      <span className="flex items-center gap-2">
        <span className="size-4 rounded-xs bg-accent-strong" aria-hidden />
        Elegido
      </span>
    </div>
  );
}

interface SeatSelectorProps {
  totalAsientos: number;
  /** Asientos ocupados del viaje; `null` mientras se leen (el mapa queda bloqueado). */
  ocupados: ReadonlySet<string> | null;
  /** Asientos elegidos (controlado). */
  seleccion: string[];
  onChange: (asientos: string[]) => void;
  /** No se pudieron leer los ocupados: aviso + "Reintentar" (sin ellos no se sabe qué está libre). */
  error?: string | null;
  onReintentar?: () => void | Promise<void>;
  /** Máximo de asientos por venta (el servidor acepta hasta 10). */
  maxSeleccion?: number;
  /** Se está cobrando: el mapa queda bloqueado. */
  bloqueado?: boolean;
}

export function SeatSelector({
  totalAsientos,
  ocupados,
  seleccion,
  onChange,
  error = null,
  onReintentar,
  maxSeleccion = 10,
  bloqueado = false,
}: SeatSelectorProps) {
  const [limiteAlcanzado, setLimiteAlcanzado] = useState(false);
  const filas = filasDe(totalAsientos);

  if (error) {
    return (
      <ErrorState
        compacto
        titulo="No pudimos cargar los asientos"
        descripcion={error}
        onReintentar={onReintentar ?? (() => {})}
      />
    );
  }

  if (ocupados === null) {
    return (
      <div className="flex flex-col items-center gap-5" role="status" aria-label="Cargando los asientos">
        <Skeleton className="h-4 w-48" />
        <Bus
          filas={filas}
          casilla={(a, idx) =>
            a ? <Skeleton key={a} className={cn(CASILLA, "rounded-sm")} /> : <div key={`vacio-${idx}`} className={CASILLA} />
          }
        />
      </div>
    );
  }

  const libres = Math.max(totalAsientos - ocupados.size, 0);

  const alternar = (asiento: string) => {
    if (bloqueado || ocupados.has(asiento)) return;
    if (seleccion.includes(asiento)) {
      setLimiteAlcanzado(false);
      onChange(seleccion.filter((a) => a !== asiento));
      return;
    }
    if (seleccion.length >= maxSeleccion) {
      setLimiteAlcanzado(true);
      return;
    }
    setLimiteAlcanzado(false);
    onChange([...seleccion, asiento].sort((a, b) => Number(a) - Number(b)));
  };

  const casilla = (asiento: string | null, idx: number) => {
    if (!asiento) return <div key={`vacio-${idx}`} className={CASILLA} />;
    const ocupado = ocupados.has(asiento);
    const elegido = seleccion.includes(asiento);
    return (
      <button
        key={asiento}
        type="button"
        disabled={ocupado || bloqueado}
        aria-pressed={elegido}
        aria-label={`Asiento ${asiento}, ${ocupado ? "ocupado" : elegido ? "elegido" : "libre"}`}
        onClick={() => alternar(asiento)}
        className={cn(
          CASILLA,
          "relative flex items-center justify-center rounded-sm border text-[15px] font-semibold tabular-nums transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
          ocupado && "cursor-not-allowed border-transparent bg-surface-dark text-muted-foreground",
          !ocupado && !elegido && "border-border-strong bg-background text-foreground hover:bg-muted",
          !ocupado && !elegido && bloqueado && "cursor-not-allowed opacity-50 hover:bg-background",
          elegido && "border-accent-strong bg-accent-strong text-accent-strong-foreground shadow-sun"
        )}
      >
        {asiento}
        {/* Respaldo: queda detrás de quien mira al frente del bus. */}
        <span
          aria-hidden
          className={cn(
            "absolute inset-x-3 bottom-1 h-0.5 rounded-full bg-current",
            elegido ? "opacity-50" : "opacity-20"
          )}
        />
      </button>
    );
  };

  return (
    <div className="flex flex-col items-center gap-5">
      <div className="flex flex-col items-center gap-2 text-[13px] text-muted-foreground">
        <Leyenda />
        <p className="tabular-nums">
          {libres} libres de {totalAsientos} · máx. {maxSeleccion} por venta
        </p>
      </div>

      {limiteAlcanzado && (
        <p
          role="alert"
          className="w-full max-w-sm rounded-md bg-warning-light px-4 py-3 text-[13px] text-warning-text"
        >
          Puedes vender hasta {maxSeleccion} asientos por compra.
        </p>
      )}

      <Bus filas={filas} casilla={casilla} />
    </div>
  );
}
