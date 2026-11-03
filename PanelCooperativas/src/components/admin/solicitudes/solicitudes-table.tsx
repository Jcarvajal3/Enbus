"use client";

import { useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { MagnifyingGlass } from "@phosphor-icons/react";
import { StatusBadge } from "@/components/status-badge";
import { RifIncompletoBadge } from "@/components/admin/cooperativas/cooperativas-table";
import { formatFechaHoraVE, formatFechaVE } from "@/lib/fechas";
import { formatTelefono } from "@/lib/ve";
import type { CuentaSolicitud, SolicitudesAdmin, SolicitudPendiente } from "@/lib/types/admin-solicitudes";
import { SolicitudAcciones } from "./solicitud-acciones";
import { CeldaEnlace } from "@/components/celda-enlace";

interface SolicitudesTableProps {
  solicitudes: SolicitudesAdmin;
}

type Pestana = "pendientes" | "rechazadas";

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
  const [search, setSearch] = useState("");
  const [pestana, setPestana] = useState<Pestana>("pendientes");
  const [seleccionId, setSeleccionId] = useState<string | null>(null);

  const lista = pestana === "pendientes" ? solicitudes.pendientes : solicitudes.rechazadas;
  const termino = search.trim().toLowerCase();
  const filtradas = lista.filter(
    (sol) =>
      !termino ||
      sol.nombre.toLowerCase().includes(termino) ||
      sol.rif.toLowerCase().includes(termino) ||
      (sol.representante ?? "").toLowerCase().includes(termino) ||
      (sol.email ?? "").toLowerCase().includes(termino)
  );

  const todas = [...solicitudes.pendientes, ...solicitudes.rechazadas];
  const seleccion = seleccionId ? todas.find((s) => s.id === seleccionId) ?? null : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <Tabs value={pestana} onValueChange={(v) => setPestana(v as Pestana)}>
          <TabsList aria-label="Estado de la solicitud">
            <TabsTrigger value="pendientes">En revisión ({solicitudes.pendientes.length})</TabsTrigger>
            <TabsTrigger value="rechazadas">Rechazadas ({solicitudes.rechazadas.length})</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="relative w-full max-w-md">
          <MagnifyingGlass className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            aria-label="Buscar solicitud"
            placeholder="Buscar por nombre, RIF, representante o correo"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border bg-card">
        <Table>
          <TableHeader className="border-b bg-muted/50">
            <TableRow className="hover:bg-transparent">
              <TableHead>Cooperativa</TableHead>
              <TableHead>RIF</TableHead>
              <TableHead>Representante</TableHead>
              <TableHead>Contacto</TableHead>
              <TableHead>Recibida</TableHead>
              <TableHead>Cuenta</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtradas.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={8} className="h-32 text-center text-muted-foreground">
                  {termino
                    ? "Ninguna solicitud coincide con tu búsqueda."
                    : pestana === "pendientes"
                      ? "No hay solicitudes en revisión. Cuando una cooperativa se registre, aparecerá aquí."
                      : "No hay solicitudes rechazadas."}
                </TableCell>
              </TableRow>
            ) : (
              filtradas.map((sol) => (
                <TableRow key={sol.id} className="relative">
                  <CeldaEnlace
                    onAbrir={() => setSeleccionId(sol.id)}
                    etiqueta={`Ver la solicitud de ${sol.nombre}`}
                    className="py-3 align-top"
                  >
                    {sol.nombre}
                  </CeldaEnlace>
                  <TableCell className="py-3 align-top">
                    <div className="flex flex-wrap items-center gap-1.5 text-muted-foreground">
                      <span className="font-mono text-sm">{sol.rif}</span>
                      <RifIncompletoBadge rif={sol.rif} className="relative z-10" />
                    </div>
                  </TableCell>
                  <TableCell className="py-3 align-top text-sm">
                    {sol.representante || <span className="text-muted-foreground">Sin dato</span>}
                  </TableCell>
                  <TableCell className="py-3 align-top text-sm">
                    <div className="flex flex-col">
                      <span>{sol.email || <span className="text-muted-foreground">Sin correo</span>}</span>
                      {sol.telefono && <span className="text-muted-foreground">{telefonoLegible(sol.telefono)}</span>}
                    </div>
                  </TableCell>
                  <TableCell className="py-3 align-top text-sm whitespace-nowrap text-muted-foreground">
                    {formatFechaVE(sol.created_at)}
                  </TableCell>
                  <TableCell className="py-3 align-top">
                    <CuentaBadge cuenta={sol.cuenta} />
                  </TableCell>
                  <TableCell className="max-w-[220px] py-3 align-top">
                    <StatusBadge status={sol.estado} dominio="cooperativa" />
                    {sol.estado === "RECHAZADA" && sol.motivo_estado && (
                      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{sol.motivo_estado}</p>
                    )}
                  </TableCell>
                  <TableCell className="py-3 align-top">
                    {/* Encima del enlace de la fila (relative z-10): estos botones no abren la hoja. */}
                    <div className="relative z-10 flex justify-end">
                      <SolicitudAcciones solicitud={sol} />
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Sheet open={seleccion !== null} onOpenChange={(open) => !open && setSeleccionId(null)}>
        {seleccion && <DetalleSolicitud solicitud={seleccion} onHecho={() => setSeleccionId(null)} />}
      </Sheet>
    </div>
  );
}

function Dato({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-0.5">
      <dt className="text-xs text-muted-foreground">{etiqueta}</dt>
      <dd className="text-sm text-foreground">{children}</dd>
    </div>
  );
}

function DetalleSolicitud({ solicitud, onHecho }: { solicitud: SolicitudPendiente; onHecho: () => void }) {
  const sinDato = <span className="text-muted-foreground">Sin dato</span>;
  return (
    <SheetContent className="w-full overflow-y-auto sm:max-w-md">
      <SheetHeader>
        <SheetTitle className="pr-8 text-xl">{solicitud.nombre}</SheetTitle>
        <SheetDescription render={<div />} className="flex flex-wrap items-center gap-2">
          <StatusBadge status={solicitud.estado} dominio="cooperativa" />
          <span>Recibida el {formatFechaHoraVE(solicitud.created_at)}</span>
        </SheetDescription>
      </SheetHeader>

      <div className="space-y-6 px-6 pb-6">
        {solicitud.estado === "RECHAZADA" && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm">
            <p className="font-medium text-destructive-text">Motivo del rechazo</p>
            <p className="mt-1 text-foreground">{solicitud.motivo_estado || "Sin motivo registrado."}</p>
            {solicitud.estado_cambiado_at && (
              <p className="mt-1 text-xs text-muted-foreground">
                Rechazada el {formatFechaHoraVE(solicitud.estado_cambiado_at)}
              </p>
            )}
          </div>
        )}

        <section className="space-y-3">
          <h3 className="text-sm font-semibold">Cooperativa</h3>
          <dl className="grid gap-3 rounded-lg border bg-muted/30 p-4">
            <Dato etiqueta="RIF">
              <span className="inline-flex flex-wrap items-center gap-1.5">
                <span className="font-mono">{solicitud.rif}</span>
                <RifIncompletoBadge rif={solicitud.rif} />
              </span>
            </Dato>
            <Dato etiqueta="Representante legal">{solicitud.representante || sinDato}</Dato>
            <Dato etiqueta="Dirección">{solicitud.direccion || sinDato}</Dato>
          </dl>
        </section>

        <section className="space-y-3">
          <h3 className="text-sm font-semibold">Contacto</h3>
          <dl className="grid gap-3 rounded-lg border bg-muted/30 p-4">
            <Dato etiqueta="Correo">
              {solicitud.email ? (
                <a
                  href={`mailto:${solicitud.email}`}
                  className="text-foreground underline decoration-primary underline-offset-4"
                >
                  {solicitud.email}
                </a>
              ) : (
                sinDato
              )}
            </Dato>
            <Dato etiqueta="Teléfono">{telefonoLegible(solicitud.telefono) || sinDato}</Dato>
          </dl>
        </section>

        <section className="space-y-3">
          <h3 className="text-sm font-semibold">Cuenta del administrador</h3>
          <div className="rounded-lg border bg-muted/30 p-4 text-sm">
            <CuentaBadge cuenta={solicitud.cuenta} />
            <p className="mt-2 text-muted-foreground">
              {solicitud.cuenta === "CREADA"
                ? "Ya entró al panel y puede ir configurando sucursales, rutas y métodos de pago."
                : solicitud.cuenta === "INVITACION_PENDIENTE"
                  ? `Le enviamos una invitación${solicitud.cuenta_email ? ` a ${solicitud.cuenta_email}` : ""} y todavía no crea su cuenta.`
                  : "No tiene cuenta ni invitación vigente. Al aprobarla, invítalo desde el detalle de la cooperativa."}
            </p>
          </div>
        </section>

        <section className="space-y-3">
          <h3 className="text-sm font-semibold">Mensaje de la cooperativa</h3>
          <p className="rounded-lg border bg-muted/30 p-4 text-sm whitespace-pre-line">
            {solicitud.mensaje_registro || <span className="text-muted-foreground">No dejó mensaje.</span>}
          </p>
        </section>

        <section className="space-y-3 border-t pt-4">
          <h3 className="text-sm font-semibold">Acciones</h3>
          <SolicitudAcciones solicitud={solicitud} onHecho={onHecho} conDescartar />
        </section>
      </div>
    </SheetContent>
  );
}
