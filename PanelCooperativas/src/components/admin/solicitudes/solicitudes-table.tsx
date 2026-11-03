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
import { CeldaEnlace } from "@/components/celda-enlace";
import { FilaVacia } from "@/components/fila-vacia";
import { BarraFiltros, TabsUrl } from "@/components/barra-filtros";
import { PaginacionTabla, usePaginacion } from "@/components/paginacion-tabla";
import { useParamUrl } from "@/hooks/use-param-url";
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

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
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

      <Card className="gap-0 overflow-hidden p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Cooperativa</TableHead>
              <TableHead className="hidden lg:table-cell">Representante</TableHead>
              <TableHead>Recibida</TableHead>
              <TableHead className="hidden lg:table-cell">Cuenta</TableHead>
              {rechazadas && <TableHead className="hidden md:table-cell">Estado</TableHead>}
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtradas.length === 0 ? (
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
            ) : (
              visibles.map((sol) => (
                <TableRow key={sol.id} className="relative">
                  <CeldaEnlace onAbrir={() => abrir(sol.id)} etiqueta={`Ver la solicitud de ${sol.nombre}`}>
                    <span className="block">{sol.nombre}</span>
                    <span className="mt-0.5 flex items-center gap-1.5 font-mono text-xs font-normal text-muted-foreground">
                      {sol.rif}
                    </span>
                  </CeldaEnlace>
                  <TableCell className="hidden lg:table-cell">
                    <span className="block">{sol.representante || <Vacio />}</span>
                    <span className="block text-xs text-muted-foreground">{sol.email || "Sin correo"}</span>
                  </TableCell>
                  <TableCell className="text-muted-foreground tabular-nums">{formatFechaVE(sol.created_at)}</TableCell>
                  <TableCell className="hidden lg:table-cell">
                    <CuentaBadge cuenta={sol.cuenta} />
                  </TableCell>
                  {rechazadas && (
                    <TableCell className="hidden max-w-64 whitespace-normal md:table-cell">
                      <StatusBadge status={sol.estado} dominio="cooperativa" />
                      {sol.motivo_estado && (
                        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{sol.motivo_estado}</p>
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
              ))
            )}
          </TableBody>
        </Table>
        <PaginacionTabla pagina={pagina} paginas={paginas} onCambio={ir} />
      </Card>

      <Sheet open={seleccion !== null} onOpenChange={(open) => !open && cerrar()}>
        {seleccion && <DetalleSolicitud solicitud={seleccion} onHecho={cerrar} />}
      </Sheet>
    </div>
  );
}

function DetalleSolicitud({ solicitud, onHecho }: { solicitud: SolicitudPendiente; onHecho: () => void }) {
  const telefono = telefonoLegible(solicitud.telefono);
  return (
    <SheetContent>
      <SheetHeader className="border-b border-border">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <SheetTitle>{solicitud.nombre}</SheetTitle>
          <StatusBadge status={solicitud.estado} dominio="cooperativa" />
        </div>
        <SheetDescription>Recibida el {formatFechaHoraVE(solicitud.created_at)}</SheetDescription>
      </SheetHeader>

      <div className="flex flex-col gap-6 p-6">
        {solicitud.estado === "RECHAZADA" && (
          <dl className="flex flex-col gap-3">
            <Dato etiqueta="Motivo del rechazo">{solicitud.motivo_estado || <Vacio texto="Sin motivo registrado" />}</Dato>
            {solicitud.estado_cambiado_at && (
              <Dato etiqueta="Rechazada">{formatFechaHoraVE(solicitud.estado_cambiado_at)}</Dato>
            )}
          </dl>
        )}

        <section aria-labelledby="sol-coop" className="flex flex-col gap-3">
          <h3 id="sol-coop" className="text-sm font-semibold">Cooperativa</h3>
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

        <section aria-labelledby="sol-contacto" className="flex flex-col gap-3 border-t border-border pt-6">
          <h3 id="sol-contacto" className="text-sm font-semibold">Contacto</h3>
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
                  <span className="text-xs text-muted-foreground">Invitación enviada a {solicitud.cuenta_email}</span>
                )}
              </span>
            </Dato>
          </dl>
        </section>

        <section aria-labelledby="sol-mensaje" className="flex flex-col gap-3 border-t border-border pt-6">
          <h3 id="sol-mensaje" className="text-sm font-semibold">Mensaje de la cooperativa</h3>
          <p className="text-sm whitespace-pre-line">
            {solicitud.mensaje_registro || <Vacio texto="No dejó mensaje" />}
          </p>
        </section>
      </div>

      <SheetFooter className="border-t border-border">
        <SolicitudAcciones solicitud={solicitud} onHecho={onHecho} />
      </SheetFooter>
    </SheetContent>
  );
}
