"use client";

// ─── Solicitudes (AD5-02, AD5-14, AD5-25) ───────────────────────────────────
// Pestaña (`?tab=rechazadas`), búsqueda (`?q=`) y solicitud abierta (`?id=`)
// viven en la URL: un enlace a `/admin/solicitudes?id=…` cae en esa hoja y
// "Atrás" la cierra.

import { useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ClipboardText, MagnifyingGlass } from "@phosphor-icons/react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { StatusBadge } from "@/components/status-badge";
import { SectionLabel } from "@/components/section-label";
import { IconTile } from "@/components/icon-tile";
import { CeldaEnlace } from "@/components/celda-enlace";
import { EntityCard } from "@/components/entity-card";
import { ListaResponsive } from "@/components/lista-responsive";
import { FilaVacia } from "@/components/fila-vacia";
import { BarraFiltros, TabsUrl } from "@/components/barra-filtros";
import { PaginacionTabla, usePaginacion } from "@/components/paginacion-tabla";
import { useParamUrl } from "@/hooks/use-param-url";
import { useIsMobile } from "@/hooks/use-mobile";
import { RifIncompletoBadge } from "@/components/admin/cooperativas/cooperativas-table";
import { Dato, Vacio } from "@/components/admin/detalle";
import { formatFechaHoraVE, formatFechaVE } from "@/lib/fechas";
import { formatTelefono } from "@/lib/ve";
import type { CuentaSolicitud, SolicitudesAdmin, SolicitudPendiente } from "@/lib/types/admin-solicitudes";
import { SolicitudAcciones } from "./solicitud-acciones";

interface SolicitudesTableProps {
  solicitudes: SolicitudesAdmin;
}

export const ETIQUETA_CUENTA: Record<CuentaSolicitud, string> = {
  CREADA: "Ya creó su cuenta",
  INVITACION_PENDIENTE: "Invitación pendiente",
  SIN_CUENTA: "Sin cuenta",
};

function CuentaBadge({ cuenta }: { cuenta: CuentaSolicitud }) {
  return (
    <Badge variant={cuenta === "CREADA" ? "secondary" : "outline"} className="whitespace-nowrap">
      {ETIQUETA_CUENTA[cuenta]}
    </Badge>
  );
}

/** Teléfono legible; si no es venezolano válido se muestra tal cual. */
function telefonoLegible(t: string | null | undefined) {
  if (!t) return null;
  const f = formatTelefono(t);
  return f === "—" ? t : f;
}

export function SolicitudesTable({ solicitudes }: SolicitudesTableProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [tab] = useParamUrl("tab", "pendientes");
  const [q] = useParamUrl("q");
  const seleccionId = searchParams.get("id");
  // La hoja abierta desde esta lista entra al historial: al cerrarla se vuelve atrás.
  const abiertaAqui = useRef(false);

  const rechazadas = tab === "rechazadas";
  const lista = rechazadas ? solicitudes.rechazadas : solicitudes.pendientes;
  const termino = q.trim().toLowerCase();
  const filtradas = lista.filter(
    (sol) =>
      !termino ||
      sol.nombre.toLowerCase().includes(termino) ||
      sol.rif.toLowerCase().includes(termino) ||
      (sol.representante ?? "").toLowerCase().includes(termino) ||
      (sol.email ?? "").toLowerCase().includes(termino)
  );
  const { visibles, pagina, paginas, ir } = usePaginacion(filtradas);

  const seleccion = seleccionId
    ? [...solicitudes.pendientes, ...solicitudes.rechazadas].find((s) => s.id === seleccionId) ?? null
    : null;

  const urlCon = (id: string | null) => {
    const p = new URLSearchParams(searchParams.toString());
    if (id) p.set("id", id);
    else p.delete("id");
    const qs = p.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  };
  const abrir = (id: string) => {
    abiertaAqui.current = true;
    router.push(urlCon(id), { scroll: false });
  };
  const cerrar = () => {
    if (abiertaAqui.current) {
      abiertaAqui.current = false;
      router.back();
    } else {
      router.replace(urlCon(null), { scroll: false });
    }
  };

  const columnas = rechazadas ? 6 : 5;
  const movil = useIsMobile();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-end md:justify-between">
        <BarraFiltros busqueda={{ etiqueta: "Buscar", placeholder: "Nombre, RIF o correo" }} />
        <TabsUrl
          param="tab"
          defecto="pendientes"
          opciones={[
            { valor: "pendientes", etiqueta: "En revisión", conteo: solicitudes.pendientes.length },
            { valor: "rechazadas", etiqueta: "Rechazadas", conteo: solicitudes.rechazadas.length },
          ]}
        />
      </div>

      <Card className="gap-0 overflow-hidden p-0 max-md:overflow-visible max-md:bg-transparent max-md:shadow-none">
        <ListaResponsive
          items={visibles}
          clave={(sol) => sol.id}
          etiqueta={rechazadas ? "Solicitudes rechazadas" : "Solicitudes en revisión"}
          vacio={
            <div className="max-md:rounded-xl max-md:bg-card max-md:shadow-card">
              <Table>
                <TableBody>
                  <FilaVacia
                colSpan={columnas}
                icon={termino ? MagnifyingGlass : ClipboardText}
                titulo={
                  termino
                    ? "Ninguna solicitud coincide con la búsqueda"
                    : rechazadas
                      ? "No hay solicitudes rechazadas"
                      : "No hay solicitudes en revisión"
                }
              />
                </TableBody>
              </Table>
            </div>
          }
          tarjeta={(sol) => (
            <EntityCard
              onClick={() => abrir(sol.id)}
              etiqueta={`Ver la solicitud de ${sol.nombre}`}
              leading={<IconTile icon={ClipboardText} tone={rechazadas ? "danger" : "warning"} />}
              title={sol.nombre}
              subtitle={sol.representante || sol.rif}
              badge={rechazadas ? <StatusBadge status={sol.estado} dominio="cooperativa" /> : <CuentaBadge cuenta={sol.cuenta} />}
              meta={formatFechaVE(sol.created_at)}
            />
          )}
          tabla={(items) => (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cooperativa</TableHead>
                  <TableHead className="hidden lg:table-cell">Representante</TableHead>
                  <TableHead className="hidden md:table-cell">Recibida</TableHead>
                  <TableHead className="hidden lg:table-cell">Cuenta</TableHead>
                  {rechazadas && <TableHead className="hidden md:table-cell">Estado</TableHead>}
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((sol) => (
                    <TableRow key={sol.id} className="relative">
                      <CeldaEnlace onAbrir={() => abrir(sol.id)} etiqueta={`Ver la solicitud de ${sol.nombre}`}>
                        <span className="flex items-center gap-3">
                        <IconTile icon={ClipboardText} tone={rechazadas ? "danger" : "warning"} size="sm" />
                        <span>
                        <span className="block">{sol.nombre}</span>
                        <span className="mt-0.5 flex items-center gap-1.5 font-mono text-[13px] font-normal text-muted-foreground">
                          {sol.rif}
                        </span>
                        </span>
                        </span>
                      </CeldaEnlace>
                      <TableCell className="hidden lg:table-cell">
                        <span className="block">{sol.representante || <Vacio />}</span>
                        <span className="block text-[13px] text-muted-foreground">{sol.email || "Sin correo"}</span>
                      </TableCell>
                      <TableCell className="hidden text-muted-foreground tabular-nums md:table-cell">{formatFechaVE(sol.created_at)}</TableCell>
                      <TableCell className="hidden lg:table-cell">
                        <CuentaBadge cuenta={sol.cuenta} />
                      </TableCell>
                      {rechazadas && (
                        <TableCell className="hidden max-w-64 whitespace-normal md:table-cell">
                          <StatusBadge status={sol.estado} dominio="cooperativa" />
                          {sol.motivo_estado && (
                            <p className="mt-1 line-clamp-2 text-[13px] text-muted-foreground">{sol.motivo_estado}</p>
                          )}
                        </TableCell>
                      )}
                      <TableCell>
                        {/* Encima del enlace de la fila (relative z-10): estos botones no abren la hoja. */}
                        <div className="relative z-10">
                          <SolicitudAcciones solicitud={sol} variante="fila" />
                        </div>
                      </TableCell>
                    </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        />
        <PaginacionTabla pagina={pagina} paginas={paginas} onCambio={ir} />
      </Card>

      <Sheet open={seleccion !== null} onOpenChange={(open) => !open && cerrar()}>
        {seleccion && <DetalleSolicitud solicitud={seleccion} onHecho={cerrar} movil={movil} />}
      </Sheet>
    </div>
  );
}

function DetalleSolicitud({
  solicitud,
  onHecho,
  movil,
}: {
  solicitud: SolicitudPendiente;
  onHecho: () => void;
  movil: boolean;
}) {
  const telefono = telefonoLegible(solicitud.telefono);
  return (
    <SheetContent side={movil ? "bottom" : "right"}>
      <SheetHeader>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <SheetTitle>{solicitud.nombre}</SheetTitle>
          <StatusBadge status={solicitud.estado} dominio="cooperativa" />
        </div>
        <SheetDescription>Recibida el {formatFechaHoraVE(solicitud.created_at)}</SheetDescription>
      </SheetHeader>

      <div className="flex flex-col gap-8 px-6 pb-6 md:p-6">
        {solicitud.estado === "RECHAZADA" && (
          <dl className="flex flex-col gap-3">
            <Dato etiqueta="Motivo del rechazo">{solicitud.motivo_estado || <Vacio texto="Sin motivo registrado" />}</Dato>
            {solicitud.estado_cambiado_at && (
              <Dato etiqueta="Rechazada">{formatFechaHoraVE(solicitud.estado_cambiado_at)}</Dato>
            )}
          </dl>
        )}

        <section className="flex flex-col gap-3">
          <SectionLabel nivel={3}>Cooperativa</SectionLabel>
          <dl className="flex flex-col gap-3">
            <Dato etiqueta="RIF">
              <span className="inline-flex flex-wrap items-center gap-1.5">
                <span className="font-mono">{solicitud.rif}</span>
                <RifIncompletoBadge rif={solicitud.rif} />
              </span>
            </Dato>
            <Dato etiqueta="Representante legal">{solicitud.representante || <Vacio />}</Dato>
            <Dato etiqueta="Dirección">{solicitud.direccion || <Vacio />}</Dato>
          </dl>
        </section>

        <section className="flex flex-col gap-3">
          <SectionLabel nivel={3}>Contacto</SectionLabel>
          <dl className="flex flex-col gap-3">
            <Dato etiqueta="Correo">
              {solicitud.email ? (
                <a
                  href={`mailto:${solicitud.email}`}
                  className="font-medium text-info-text underline-offset-4 hover:underline focus-visible:underline"
                >
                  {solicitud.email}
                </a>
              ) : (
                <Vacio texto="Sin correo" />
              )}
            </Dato>
            <Dato etiqueta="Teléfono">{telefono || <Vacio />}</Dato>
            <Dato etiqueta="Cuenta del administrador">
              <span className="flex flex-col items-start gap-1">
                <CuentaBadge cuenta={solicitud.cuenta} />
                {solicitud.cuenta === "INVITACION_PENDIENTE" && solicitud.cuenta_email && (
                  <span className="text-[13px] text-muted-foreground">Invitación enviada a {solicitud.cuenta_email}</span>
                )}
              </span>
            </Dato>
          </dl>
        </section>

        <section className="flex flex-col gap-3">
          <SectionLabel nivel={3}>Mensaje de la cooperativa</SectionLabel>
          <p className="text-[15px] whitespace-pre-line">
            {solicitud.mensaje_registro || <Vacio texto="No dejó mensaje" />}
          </p>
        </section>
      </div>

      <SheetFooter>
        <SolicitudAcciones solicitud={solicitud} onHecho={onHecho} />
      </SheetFooter>
    </SheetContent>
  );
}
