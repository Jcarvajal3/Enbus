// ─── Resumen: la vista (sin consultas) ──────────────────────────────────────
// La página reúne los datos en el servidor y esta vista los dibuja.

import dynamic from "next/dynamic";
import { CheckCircle, Coins, WarningCircle, WhatsappLogo } from "@phosphor-icons/react/dist/ssr";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge, TonoBadge } from "@/components/status-badge";
import { Monto } from "@/components/monto";
import { KpiCard } from "@/components/kpi-card";
import { FilaVacia } from "@/components/fila-vacia";
import { CeldaEnlace } from "@/components/celda-enlace";
import { ChecklistPuestaEnMarcha, type ChecklistCooperativa } from "@/components/checklist-puesta-en-marcha";
import type { MontoFormateado } from "@/lib/dinero";
import { formatFechaHoraCortaVE, formatFechaVE } from "@/lib/fechas";
import { formatCiudad } from "@/lib/ciudades";
import { ICONO_SECCION } from "@/lib/navigation";
import { BandejaAtencion } from "./bandeja-atencion";
import { ErrorRecargable } from "./error-recargable";
import type { ResultadoBandeja } from "./actions";

// Gráfico con recharts cargado aparte (~280 KB menos en la carga inicial)
const ActivityChart = dynamic(
  () => import("@/components/activity-chart").then((m) => ({ default: m.ActivityChart })),
  {
    loading: () => (
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Actividad</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[250px] w-full" />
        </CardContent>
      </Card>
    ),
  }
);

export type EncomiendaReciente = {
  id: string;
  tracking_id: string;
  receiver_nombre: string | null;
  estado: string;
  created_at: string;
  ciudad_origen: string | null;
  ciudad_destino: string | null;
  origen_registro?: string | null;
  remitente_nombre?: string | null;
  sender: unknown;
};

/** Quién envía: en el alta presencial `sender_id` es el empleado; el remitente real está en `remitente_nombre`. */
function nombreRemitente(enc: EncomiendaReciente) {
  if (enc.origen_registro === "TAQUILLA" && enc.remitente_nombre) return enc.remitente_nombre;
  const embed = enc.sender;
  const sender = (Array.isArray(embed) ? embed[0] : embed) as { nombre_completo?: string | null } | null;
  return enc.remitente_nombre || sender?.nombre_completo || "Sin nombre";
}

export type DatosResumen = {
  esAdmin: boolean;
  checklist: ChecklistCooperativa | null;
  bandeja: ResultadoBandeja;
  /** "—" cuando el dato no se pudo cargar. */
  kpis: { recibidas: string; despachadas: string; boletos: string };
  /** null si la consulta de pagos falló. */
  ingresos: MontoFormateado | null;
  kpisConError: boolean;
  chartData: { date: string; encomiendas: number; boletos: number }[];
  comisionPendiente: { total: number; ciclos: number; desde: string; hasta: string } | null;
  comisionesError: boolean;
  soporte: string | null;
  encomiendasRecientes: EncomiendaReciente[];
  recientesError: boolean;
};

export function ResumenVista({
  esAdmin,
  checklist,
  bandeja,
  kpis,
  ingresos,
  kpisConError,
  chartData,
  comisionPendiente,
  comisionesError,
  soporte,
  encomiendasRecientes,
  recientesError,
}: DatosResumen) {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Resumen" />

      {checklist && <ChecklistPuestaEnMarcha checklist={checklist} />}

      <BandejaAtencion inicial={bandeja} />

      <section aria-labelledby="hoy-titulo" className="flex flex-col gap-3">
        <h2 id="hoy-titulo" className="text-lg font-semibold">
          Hoy
        </h2>
        {kpisConError && <ErrorRecargable titulo="No pudimos cargar algunos datos de hoy" />}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard title="Encomiendas recibidas" value={kpis.recibidas} icon={ICONO_SECCION.taquillaEncomiendas} />
          <KpiCard title="Encomiendas despachadas" value={kpis.despachadas} icon={ICONO_SECCION.despacho} />
          <KpiCard title="Boletos vendidos" value={kpis.boletos} icon={ICONO_SECCION.taquillaBoletos} />
          <KpiCard
            title="Ingresos verificados"
            value={ingresos ? <span aria-label={ingresos.accesible}>{ingresos.principal}</span> : "—"}
            detail={ingresos?.secundario ?? null}
            icon={Coins}
          />
        </div>
      </section>

      {esAdmin && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <ActivityChart data={chartData} />

          <Card>
            <CardHeader>
              <CardTitle
                className={comisionPendiente && !comisionesError ? "flex items-center gap-2 text-warning-text" : undefined}
              >
                {comisionPendiente && !comisionesError && (
                  <WarningCircle className="size-5 shrink-0" weight="fill" aria-hidden />
                )}
                {comisionPendiente && !comisionesError ? "Comisión pendiente con EnBus" : "Comisión con EnBus"}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {comisionesError ? (
                <ErrorRecargable titulo="No pudimos cargar tus comisiones" />
              ) : comisionPendiente ? (
                <>
                  <Monto usd={comisionPendiente.total} size="lg" />
                  <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground tabular-nums">
                    {comisionPendiente.ciclos > 1 && (
                      <TonoBadge tono="pendiente">{`${comisionPendiente.ciclos} ciclos sin pagar`}</TonoBadge>
                    )}
                    <span>
                      {formatFechaVE(comisionPendiente.desde)} – {formatFechaVE(comisionPendiente.hasta)}
                    </span>
                  </div>
                  {soporte && (
                    <a
                      href={`https://wa.me/${soporte}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 text-sm font-medium text-info-text underline-offset-4 hover:underline focus-visible:underline"
                    >
                      <WhatsappLogo className="size-4" aria-hidden />
                      ¿Dudas para pagarla? Escríbenos
                    </a>
                  )}
                </>
              ) : (
                <p className="flex items-center gap-2 text-sm font-medium text-success-text">
                  <CheckCircle className="size-5 shrink-0" weight="fill" aria-hidden />
                  Sin comisiones pendientes
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      <section aria-labelledby="recientes-titulo" className="flex flex-col gap-3">
        <h2 id="recientes-titulo" className="text-lg font-semibold">
          Encomiendas recientes
        </h2>
        {recientesError ? (
          <ErrorRecargable titulo="No pudimos cargar las encomiendas recientes" />
        ) : (
          <Card className="gap-0 overflow-hidden p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Código</TableHead>
                  <TableHead className="hidden lg:table-cell">Remitente</TableHead>
                  <TableHead>Destinatario</TableHead>
                  <TableHead className="hidden lg:table-cell">Ruta</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Fecha</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {encomiendasRecientes.length > 0 ? (
                  encomiendasRecientes.map((enc) => (
                    <TableRow key={enc.id ?? enc.tracking_id} className="relative">
                      <CeldaEnlace
                        href={`/cooperativas/taquilla/encomiendas?encomienda=${encodeURIComponent(enc.id)}`}
                        etiqueta={`Ver encomienda ${enc.tracking_id}`}
                        className="font-mono text-sm text-foreground"
                      >
                        {enc.tracking_id}
                      </CeldaEnlace>
                      <TableCell className="hidden lg:table-cell">{nombreRemitente(enc)}</TableCell>
                      <TableCell>{enc.receiver_nombre}</TableCell>
                      <TableCell className="hidden lg:table-cell">
                        {formatCiudad(enc.ciudad_origen)} → {formatCiudad(enc.ciudad_destino)}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={enc.estado} dominio="encomienda" />
                      </TableCell>
                      <TableCell className="tabular-nums">{formatFechaHoraCortaVE(enc.created_at)}</TableCell>
                    </TableRow>
                  ))
                ) : (
                  <FilaVacia colSpan={6} icon={ICONO_SECCION.taquillaEncomiendas} titulo="Todavía no hay encomiendas" />
                )}
              </TableBody>
            </Table>
          </Card>
        )}
      </section>
    </div>
  );
}
