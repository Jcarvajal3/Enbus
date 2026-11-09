"use client";

// ─── Pasajeros del bus que se embarca ───────────────────────────────────────
// Solo lectura (como la hoja del viaje): asiento, pasajero, código y estado de
// embarque. Pestañas en la URL (`?ver=`): Por embarcar · Embarcados · Todos.
// Pensada para el teléfono en la puerta del bus: filas apiladas, sin tabla.

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { StatusBadge } from "@/components/status-badge";
import { TabsUrl } from "@/components/barra-filtros";
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
    <section aria-labelledby="embarque-pasajeros" className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 id="embarque-pasajeros" className="text-lg font-semibold tracking-tight">
          Pasajeros del bus
        </h2>
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

      <Card className="gap-0 overflow-hidden p-0">
        {error ? (
          <ErrorState compacto titulo="No pudimos cargar los pasajeros" descripcion={error} onReintentar={onReintentar} />
        ) : cargando && pasajeros.length === 0 ? (
          <div className="flex flex-col gap-2 p-4" role="status" aria-label="Cargando los pasajeros">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-14 w-full rounded-md" />
            ))}
          </div>
        ) : visibles.length === 0 ? (
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
        ) : (
          <ul className="divide-y divide-border">
            {visibles.map((b) => {
              const nombre = b.pasajero_nombre || b.comprador?.nombre_completo || "Sin nombre";
              const cedula = b.pasajero_cedula || b.comprador?.cedula_rif;
              const usado = b.estado === "USADO";
              return (
                <li key={b.id} className={cn("flex items-center gap-3 px-4 py-3", usado && "bg-muted/40")}>
                  <Badge variant="outline" className="h-9 min-w-11 shrink-0 justify-center font-mono text-base tabular-nums">
                    {b.asiento}
                  </Badge>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate font-medium">{nombre}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {cedula ? `${formatCedula(cedula)} · ` : ""}
                      <span className="font-mono">{formatCodigoBoleto(b.codigo_boleto)}</span>
                    </span>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <StatusBadge status={estadoUiPasajero(b)} dominio="boleto" />
                    {usado && b.embarcado_at && (
                      <span className="text-xs text-muted-foreground tabular-nums">{formatHoraVE(b.embarcado_at)}</span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </section>
  );
}
