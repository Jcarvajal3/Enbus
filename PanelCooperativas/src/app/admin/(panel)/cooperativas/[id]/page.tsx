export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import { fetchCooperativaById } from "@/lib/data/admin-cooperativas";
import {
  esPestanaActividad,
  fetchActividadPestana,
  fetchResumenActividad,
  leerFiltrosActividad,
} from "@/lib/data/admin-cooperativa-actividad";
import { CooperativaDetailTabs } from "@/components/admin/cooperativas/cooperativa-detail-tabs";
import { CooperativaActions } from "@/components/admin/cooperativas/cooperativa-actions";
import { SolicitudAcciones } from "@/components/admin/solicitudes/solicitud-acciones";
import { StatusBadge } from "@/components/status-badge";
import { PageHeader } from "@/components/page-header";
import { MigaObjeto } from "@/components/miga-objeto";
import { formatFechaVE } from "@/lib/fechas";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; estado?: string; desde?: string; hasta?: string; pagina?: string }>;
}

export default async function CooperativaDetailPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const { tab = "", ...filtrosUrl } = await searchParams;
  const pestana = esPestanaActividad(tab) ? tab : null;

  // La ficha, las cifras de la cabecera y, solo si hay una lista abierta, su página, en paralelo.
  const [cooperativa, resumen, actividad] = await Promise.all([
    fetchCooperativaById(id),
    fetchResumenActividad(id),
    pestana ? fetchActividadPestana(id, pestana, leerFiltrosActividad(pestana, filtrosUrl)) : null,
  ]);

  if (!cooperativa) {
    notFound();
  }

  // Una solicitud (en revisión o rechazada) se resuelve aquí mismo (AD5-01).
  const esSolicitud = cooperativa.estado === "PENDIENTE" || cooperativa.estado === "RECHAZADA";
  const motivo =
    cooperativa.motivo_estado && cooperativa.estado !== "ACTIVA" && cooperativa.estado !== "PENDIENTE"
      ? `Motivo: ${cooperativa.motivo_estado}${
          cooperativa.estado_cambiado_at ? ` · desde el ${formatFechaVE(cooperativa.estado_cambiado_at)}` : ""
        }`
      : undefined;

  return (
    <div className="flex flex-col gap-8">
      <MigaObjeto label={cooperativa.nombre} />
      <PageHeader
        title={cooperativa.nombre}
        estado={<StatusBadge status={cooperativa.estado} dominio="cooperativa" />}
        description={motivo}
      >
        {esSolicitud ? (
          <SolicitudAcciones
            solicitud={{ id: cooperativa.id, nombre: cooperativa.nombre, rif: cooperativa.rif, estado: cooperativa.estado }}
          />
        ) : (
          <CooperativaActions cooperativa={cooperativa} />
        )}
      </PageHeader>

      <CooperativaDetailTabs cooperativa={cooperativa} resumen={resumen} actividad={actividad} />
    </div>
  );
}
