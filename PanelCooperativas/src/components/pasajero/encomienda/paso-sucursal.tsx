"use client";

// ─── Paso 2: ¿Dónde entregas el paquete? ─────────────────────────────────────
// Las taquillas de la cooperativa en la ciudad de origen, como opciones elegibles (igual que los
// destinos del panel). Si falta la cédula o el teléfono de la cuenta, se piden aquí mismo.

import { PerfilCompleto } from "@/components/pasajero/perfil-completo";
import { GrupoOpciones, OpcionTile } from "@/components/opcion-tile";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatTelefono } from "@/lib/ve";
import { formatCiudad } from "@/lib/ve.generated";
import type { ResultadoSucursales } from "./tipos";

interface Props {
  cooperativa: string;
  ciudad: string;
  /** null mientras carga. */
  resultado: ResultadoSucursales | null;
  sucursalId: string;
  onElegir(id: string): void;
  onReintentar(): void;
  perfilCompleto: boolean;
  cedula: string | null;
  telefono: string | null;
}

const CLASE_AVISO = "rounded-md bg-surface p-4 text-[15px] text-muted-foreground";

export function PasoSucursal({
  cooperativa,
  ciudad,
  resultado,
  sucursalId,
  onElegir,
  onReintentar,
  perfilCompleto,
  cedula,
  telefono,
}: Props) {
  return (
    <div className="flex flex-col gap-6">
      {!perfilCompleto && (
        <div className="rounded-xl bg-card p-5 shadow-card">
          <PerfilCompleto cedulaInicial={cedula} telefonoInicial={telefono} contexto="envio" />
        </div>
      )}

      <section aria-labelledby="envio-donde-titulo" className="flex flex-col gap-3">
        <h2 id="envio-donde-titulo" className="text-[17px] font-semibold">
          Taquillas de {cooperativa} en {formatCiudad(ciudad)}
        </h2>
        <p className="text-[15px] text-muted-foreground">
          Llévalo a una taquilla. Allí lo pesan, lo reciben y te confirman el costo final.
        </p>

        <div aria-live="polite" aria-busy={resultado === null || undefined}>
          {resultado === null ? (
            <div className="grid gap-2 md:grid-cols-2" role="status" aria-label="Buscando las taquillas">
              <Skeleton className="h-24 w-full rounded-xl" />
              <Skeleton className="h-24 w-full rounded-xl" />
            </div>
          ) : !resultado.ok ? (
            <div role="alert" className={`${CLASE_AVISO} flex flex-col items-start gap-3`}>
              <p>{resultado.error}</p>
              <Button type="button" variant="outline" size="sm" onClick={onReintentar}>
                Reintentar
              </Button>
            </div>
          ) : resultado.sucursales.length === 0 ? (
            <p className={CLASE_AVISO}>
              Pregunta en la taquilla de {cooperativa} en {formatCiudad(ciudad)}. Puedes continuar y registrar tu envío.
            </p>
          ) : (
            <GrupoOpciones etiqueta="Taquilla de entrega" className="grid gap-2 md:grid-cols-2">
              {resultado.sucursales.map((suc) => {
                const telefonoTaquilla = suc.telefono
                  ? formatTelefono(suc.telefono) !== "—"
                    ? formatTelefono(suc.telefono)
                    : suc.telefono
                  : null;
                const lineas = [
                  suc.direccion,
                  suc.horario,
                  telefonoTaquilla ? `Tel. ${telefonoTaquilla}` : null,
                  resultado.sucursales.length === 1 ? "Es la única taquilla de la cooperativa en esta ciudad." : null,
                ].filter(Boolean);
                return (
                  <OpcionTile
                    key={suc.id}
                    seleccionado={suc.id === sucursalId}
                    onSelect={() => onElegir(suc.id)}
                    titulo={suc.nombre}
                    detalle={
                      lineas.length > 0
                        ? lineas.map((l, i) => (
                            <span key={i} className="block">
                              {l}
                            </span>
                          ))
                        : undefined
                    }
                  />
                );
              })}
            </GrupoOpciones>
          )}
        </div>
      </section>
    </div>
  );
}
