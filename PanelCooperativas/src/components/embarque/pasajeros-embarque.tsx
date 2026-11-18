"use client";

// ─── Pasajeros del bus que se embarca ───────────────────────────────────────
// Solo lectura (como la hoja del viaje): asiento, pasajero, código y estado de
// embarque. Pestañas en la URL (`?ver=`): Por embarcar · Embarcados · Todos.
// Pensada para el teléfono en la puerta del bus: filas apiladas, sin tabla.

import { Card } from "@/components/ui/card";
import { EntityCard } from "@/components/entity-card";
import { ListaResponsive } from "@/components/lista-responsive";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { StatusBadge } from "@/components/status-badge";
import { TabsUrl } from "@/components/barra-filtros";
import { SectionLabel } from "@/components/section-label";
import { useParamUrl } from "@/hooks/use-param-url";
import { formatCodigoBoleto } from "@/lib/artefactos.generated";
import { formatHoraVE } from "@/lib/fechas";
import { ICONO_SECCION } from "@/lib/navigation";
import { getEstadoUiBoleto, type EstadoVerificacion } from "@/lib/types/pagos";
import type { EstadoBoleto } from "@/lib/types/boletos";
import { formatCedula } from "@/lib/ve";
import { cn } from "@/lib/utils";

export type PasajeroEmbarque = {
  id: string;
  codigo_boleto: string;
  asiento: string;
  estado: EstadoBoleto;
  embarcado_at: string | null;
  pasajero_nombre: string | null;
  pasajero_cedula: string | null;
  comprador: { nombre_completo: string; cedula_rif: string | null } | null;
  pago: { estado_verificacion: EstadoVerificacion } | { estado_verificacion: EstadoVerificacion }[] | null;
};

/** Columnas para `boletos` (mismas que la hoja del viaje). */
export const SELECT_PASAJEROS_EMBARQUE =
  "id, codigo_boleto, asiento, estado, embarcado_at, pasajero_nombre, pasajero_cedula, comprador:profiles!comprador_id(nombre_completo, cedula_rif), pago:pagos!boletos_pago_id_fkey(estado_verificacion)";

/** Boletos que ocupan asiento (cancelados y vencidos no se embarcan). */
export const ESTADOS_PASAJERO_EMBARQUE: EstadoBoleto[] = ["RESERVADO", "PAGADO", "USADO"];

export function estadoUiPasajero(b: PasajeroEmbarque) {
  const pago = Array.isArray(b.pago) ? b.pago[0] : b.pago;
  return getEstadoUiBoleto(b.estado, pago?.estado_verificacion ?? null);
}

/** Conteos del bus: embarcados de los confirmados (pagados + embarcados). */
export function conteoEmbarque(pasajeros: PasajeroEmbarque[]) {
  const confirmados = pasajeros.filter((b) => b.estado === "PAGADO" || b.estado === "USADO").length;
  const embarcados = pasajeros.filter((b) => b.estado === "USADO").length;
  const porVerificar = pasajeros.filter((b) => estadoUiPasajero(b) === "PAGO_EN_VERIFICACION").length;
  const sinPagar = pasajeros.filter((b) => ["RESERVA_SIN_PAGAR", "PAGO_RECHAZADO"].includes(estadoUiPasajero(b))).length;
  return { confirmados, embarcados, porVerificar, sinPagar };
}

const VISTAS = ["por-embarcar", "embarcados", "todos"] as const;

function datosPasajero(b: PasajeroEmbarque) {
  return {
    nombre: b.pasajero_nombre || b.comprador?.nombre_completo || "Sin nombre",
    cedula: b.pasajero_cedula || b.comprador?.cedula_rif,
    usado: b.estado === "USADO",
  };
}

function AsientoPasajero({ asiento, usado }: { asiento: string; usado: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex h-11 min-w-11 shrink-0 items-center justify-center rounded-2xl px-2 font-mono text-[15px] font-semibold tabular-nums",
        usado ? "bg-success-light text-success-text" : "bg-accent-light text-accent-strong"
      )}
    >
      <span className="sr-only">Asiento </span>
      {asiento}
    </span>
  );
}

export function PasajerosEmbarque({
  pasajeros,
  cargando,
  error,
  onReintentar,
}: {
  pasajeros: PasajeroEmbarque[];
  cargando: boolean;
  error: string | null;
  onReintentar: () => void;
}) {
  const [verUrl] = useParamUrl("ver", "por-embarcar");
  const ver = (VISTAS as readonly string[]).includes(verUrl) ? verUrl : "por-embarcar";

  const porEmbarcar = pasajeros.filter((b) => b.estado !== "USADO");
  const embarcados = pasajeros.filter((b) => b.estado === "USADO");
  const visibles = ver === "por-embarcar" ? porEmbarcar : ver === "embarcados" ? embarcados : pasajeros;

  return (
    <section aria-label="Pasajeros del bus" className="flex flex-col gap-4">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <SectionLabel>Pasajeros del bus</SectionLabel>
        <TabsUrl
          param="ver"
          defecto="por-embarcar"
          opciones={[
            { valor: "por-embarcar", etiqueta: "Por embarcar", conteo: porEmbarcar.length },
            { valor: "embarcados", etiqueta: "Embarcados", conteo: embarcados.length },
            { valor: "todos", etiqueta: "Todos", conteo: pasajeros.length },
          ]}
        />
      </div>

      {error || (cargando && pasajeros.length === 0) || visibles.length === 0 ? (
        <Card className="gap-0 p-0">
          {error ? (
            <ErrorState compacto titulo="No pudimos cargar los pasajeros" descripcion={error} onReintentar={onReintentar} />
          ) : cargando && pasajeros.length === 0 ? (
            <div className="flex flex-col gap-2 p-5" role="status" aria-label="Cargando los pasajeros">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-14 w-full rounded-md" />
              ))}
            </div>
          ) : (
            <EmptyState
              compacto
              icon={ICONO_SECCION.embarque}
              title={
                pasajeros.length === 0
                  ? "Este bus todavía no tiene pasajeros"
                  : ver === "por-embarcar"
                    ? "Ya embarcaron todos"
                    : "Nadie ha embarcado todavía"
              }
            />
          )}
        </Card>
      ) : (
        <ListaResponsive
          items={visibles}
          clave={(b) => b.id}
          etiqueta="Pasajeros del bus"
          tabla={(items) => (
            <Card className="gap-0 p-0">
              <ul className="divide-y divide-border">
                {items.map((b) => {
                  const { nombre, cedula, usado } = datosPasajero(b);
                  return (
                    <li key={b.id} className={cn("flex items-center gap-3 px-4 py-3", usado && "bg-surface")}>
                      <AsientoPasajero asiento={b.asiento} usado={usado} />
                      <div className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate font-medium">{nombre}</span>
                        <span className="truncate text-[13px] text-muted-foreground">
                          {cedula ? `${formatCedula(cedula)} · ` : ""}
                          <span className="font-mono">{formatCodigoBoleto(b.codigo_boleto)}</span>
                        </span>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <StatusBadge status={estadoUiPasajero(b)} dominio="boleto" />
                        {usado && b.embarcado_at && (
                          <span className="text-[13px] text-muted-foreground tabular-nums">{formatHoraVE(b.embarcado_at)}</span>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}
          tarjeta={(b) => {
            const { nombre, cedula, usado } = datosPasajero(b);
            return (
              <EntityCard
                leading={<AsientoPasajero asiento={b.asiento} usado={usado} />}
                title={nombre}
                subtitle={cedula ? formatCedula(cedula) : undefined}
                badge={<StatusBadge status={estadoUiPasajero(b)} dominio="boleto" />}
                meta={
                  usado && b.embarcado_at
                    ? `Embarcó ${formatHoraVE(b.embarcado_at)}`
                    : formatCodigoBoleto(b.codigo_boleto)
                }
                etiqueta={`Asiento ${b.asiento}, ${nombre}`}
                className={cn(usado && "bg-surface")}
              />
            );
          }}
        />
      )}
    </section>
  );
}
