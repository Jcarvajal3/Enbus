// ─── Carrocería del bus con sus asientos ─────────────────────────────────────
// Visto desde arriba con el frente arriba: parabrisas, chofer adelante a la izquierda,
// la puerta en la primera fila a la derecha y la fila trasera de 5, con un asiento en
// el pasillo. La distribución es la de la app
// (`distribucionAsientos`, generada desde shared/asientos.ts).
// Lo usan el selector de asientos (taquilla y pasajero) y el diagrama de ocupación.

import { Fragment } from "react";
import { DoorOpenIcon, SteeringWheelIcon } from "@phosphor-icons/react";
import { distribucionAsientos } from "@/lib/asientos.generated";
import { cn } from "@/lib/utils";

export function BusAsientos({
  totalAsientos,
  casilla,
  tamCasilla,
  grande = false,
}: {
  totalAsientos: number;
  /** Dibuja un asiento (botón, casilla de solo lectura o esqueleto) con el tamaño `tamCasilla`. */
  casilla: (asiento: string) => React.ReactNode;
  /** Clases de tamaño de cada casilla (también para los huecos y el pasillo). */
  tamCasilla: string;
  /** Pantalla de la terminal: más aire y textos más grandes. */
  grande?: boolean;
}) {
  const { filas } = distribucionAsientos(totalAsientos);
  const hueco = (clave: string) => <div key={clave} className={tamCasilla} aria-hidden />;

  return (
    <div
      className={cn(
        "w-full rounded-t-[2.5rem] rounded-b-xl bg-surface px-4 pt-4 pb-3 md:px-6 md:pt-5",
        grande ? "max-w-2xl px-8 pt-6 pb-5" : "max-w-sm"
      )}
      role="group"
      aria-label="Mapa de asientos. El frente del bus está arriba."
    >
      <p
        className={cn(
          "rounded-t-3xl rounded-b-md bg-info-light px-3 py-2.5 text-center font-medium text-info-text",
          grande ? "text-lg" : "text-[13px]"
        )}
      >
        Frente del bus
      </p>

      <div
        className={cn(
          "mx-auto mt-4 grid w-fit grid-cols-[repeat(5,auto)] items-center justify-items-center",
          grande ? "gap-x-3 gap-y-4" : "gap-x-2 gap-y-3"
        )}
      >
        {/* Cabina: chofer adelante a la izquierda. */}
        <span
          className={cn(
            "col-span-2 flex h-full w-full items-center justify-center gap-1.5 rounded-md bg-background text-muted-foreground",
            grande ? "text-[15px]" : "text-[13px]"
          )}
          aria-label="Chofer, adelante a la izquierda"
        >
          <SteeringWheelIcon className={grande ? "size-7" : "size-5"} aria-hidden />
          Chofer
        </span>
        {hueco("cabina-pasillo")}
        {hueco("cabina-der")}
        {hueco("cabina-ventana")}


        {filas.map((fila, f) => (
          <Fragment key={`fila-${f}`}>
            {fila.map((asiento, c) => {
              // Primera fila: la puerta ocupa la derecha (el asiento 3 va una fila más atrás).
              if (f === 0 && c === 3 && !asiento && !fila[4]) {
                return (
                  <span
                    key="puerta"
                    className={cn(
                      "col-span-2 flex h-full w-full items-center justify-center gap-1.5 rounded-md bg-primary-light font-semibold text-primary-text",
                      grande ? "text-[15px]" : "text-[13px]"
                    )}
                    aria-label="Puerta, adelante a la derecha"
                  >
                    <DoorOpenIcon className={grande ? "size-7" : "size-5"} aria-hidden />
                    Puerta
                  </span>
                );
              }
              if (f === 0 && c === 4 && !asiento && !fila[3]) return null;
              return asiento ? <Fragment key={asiento}>{casilla(asiento)}</Fragment> : hueco(`h-${f}-${c}`);
            })}
          </Fragment>
        ))}
      </div>

      <p className={cn("mt-4 text-center text-muted-foreground", grande ? "text-[15px]" : "text-[13px]")}>
        Parte trasera
      </p>
    </div>
  );
}
