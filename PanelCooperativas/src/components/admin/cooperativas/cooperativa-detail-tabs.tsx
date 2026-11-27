"use client";

// ─── Ficha de una cooperativa (AD5-15, AD5-18, AD5-19, AD5-34, AD5-35, SY-29) ─
// Pestañas en `?tab=` con el contador en la pestaña. Cada pestaña es su propia
// tarjeta o tabla (sin título que repita la pestaña). Estados con `StatusBadge`.

import { Bus, CreditCard, MapPin, Path, Star, User } from "@phosphor-icons/react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import type { CooperativaDetalle } from "@/lib/types/admin-cooperativas";
import { Monto } from "@/components/monto";
import { EmptyState } from "@/components/empty-state";
import { EntityCard } from "@/components/entity-card";
import { IconTile } from "@/components/icon-tile";
import { ListaResponsive } from "@/components/lista-responsive";
import { FilaVacia } from "@/components/fila-vacia";
import { StatusBadge, TonoBadge } from "@/components/status-badge";
import { useCambiarParams, useParamUrl } from "@/hooks/use-param-url";
import { useTasaBCVAdmin } from "@/components/admin/dashboard/use-tasa-bcv-admin";
import { CLASE_PESTANA, ConteoPestana, Dato, Vacio } from "@/components/admin/detalle";
import { formatDuracion, formatFechaVE } from "@/lib/fechas";
import { documentoOGuion, SIN_DATO, telefonoOGuion } from "@/lib/mostrar";
import { claveReputacion, etiquetaMetodoPago, etiquetaRol } from "@/lib/estados";
import { formatCiudad } from "@/lib/ciudades";
import { formatNumeroVE } from "@/lib/dinero";
import { TarifaVigenteCard } from "@/components/tarifas/tarifa-vigente-card";
import { HistorialTarifasTable } from "@/components/tarifas/historial-tarifas-table";
import { Calificacion, RifIncompletoBadge } from "./cooperativas-table";
import { ActividadCooperativa, ResumenActividadCards } from "./cooperativa-actividad";
import {
  PESTANAS_ACTIVIDAD,
  type ActividadPestana,
  type PestanaActividad,
  type ResumenActividad,
} from "@/lib/types/admin-cooperativa-actividad";

const PESTANAS = [
  "general",
  ...PESTANAS_ACTIVIDAD,
  "sucursales",
  "metodos",
  "rutas",
  "unidades",
  "tarifas",
  "empleados",
  "calificaciones",
] as const;
type Pestana = (typeof PESTANAS)[number];

interface CooperativaDetailTabsProps {
  cooperativa: CooperativaDetalle;
  /** Cifras de la cabecera y contadores de las pestañas de actividad. */
  resumen: ResumenActividad;
  /** Lista de la pestaña de actividad abierta (null en las demás). */
  actividad: ActividadPestana | null;
}

/** Filtros de una lista de actividad: no pasan de una pestaña a otra. */
const PARAMS_FILTRO = { estado: null, desde: null, hasta: null } as const;

/** Teléfono legible o "—" (SY-29). */
export function telefonoOVacio(v: string | null | undefined) {
  const f = telefonoOGuion(v);
  return f === SIN_DATO ? <Vacio /> : <span className="tabular-nums">{f}</span>;
}

/** "Sale de Terminal La Bandera · Llega a Terminal de Maracaibo" (o la mitad que haya); "" si no eligió ninguno. */
function textoTerminales(ruta: { terminal_origen?: string | null; terminal_destino?: string | null }): string {
  return [
    ruta.terminal_origen ? `Sale de ${ruta.terminal_origen}` : null,
    ruta.terminal_destino ? `Llega a ${ruta.terminal_destino}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

function Estrellas({ n, className }: { n: number; className?: string }) {
  return (
    <span className="flex gap-0.5" aria-hidden>
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          weight={i < n ? "fill" : "regular"}
          className={i < n ? `text-primary-text ${className ?? ""}` : `text-muted-foreground ${className ?? ""}`}
        />
      ))}
    </span>
  );
}

export function CooperativaDetailTabs({ cooperativa, resumen, actividad }: CooperativaDetailTabsProps) {
  // Montos en USD de referencia, con el equivalente en Bs a la tasa BCV de hoy.
  const tasa = useTasaBCVAdmin();
  const [valorTab] = useParamUrl("tab", "general");
  const cambiarParams = useCambiarParams();
  const setTab = (v: string) => cambiarParams({ tab: v === "general" ? null : v, ...PARAMS_FILTRO });
  const tab: Pestana = (PESTANAS as readonly string[]).includes(valorTab) ? (valorTab as Pestana) : "general";
  const promedio = Number(cooperativa.calificacion_promedio);
  const vigente = cooperativa.tarifas.find((t) => t.estado === "VIGENTE") ?? null;
  const programada = cooperativa.tarifas.find((t) => t.estado === "PROGRAMADA") ?? null;

  return (
    <Tabs value={tab} onValueChange={(v) => setTab(String(v))} className="gap-4">
      <TabsList aria-label="Secciones de la cooperativa">
        <TabsTrigger value="general" className={CLASE_PESTANA}>General</TabsTrigger>
        <TabsTrigger value="viajes" className={CLASE_PESTANA}>
          Viajes <ConteoPestana n={resumen.viajes_total ?? 0} />
        </TabsTrigger>
        <TabsTrigger value="boletos" className={CLASE_PESTANA}>
          Boletos <ConteoPestana n={resumen.boletos_vendidos ?? 0} />
        </TabsTrigger>
        <TabsTrigger value="encomiendas" className={CLASE_PESTANA}>
          Encomiendas <ConteoPestana n={resumen.encomiendas_total ?? 0} />
        </TabsTrigger>
        <TabsTrigger value="pagos" className={CLASE_PESTANA}>
          Pagos <ConteoPestana n={resumen.pagos_total ?? 0} />
        </TabsTrigger>
        <TabsTrigger value="sucursales" className={CLASE_PESTANA}>
          Sucursales <ConteoPestana n={cooperativa.sucursales.length} />
        </TabsTrigger>
        <TabsTrigger value="metodos" className={CLASE_PESTANA}>
          Métodos de pago <ConteoPestana n={cooperativa.metodos_pago.length} />
        </TabsTrigger>
        <TabsTrigger value="rutas" className={CLASE_PESTANA}>
          Rutas <ConteoPestana n={cooperativa.rutas.length} />
        </TabsTrigger>
        <TabsTrigger value="unidades" className={CLASE_PESTANA}>
          Unidades <ConteoPestana n={cooperativa.buses.length} />
        </TabsTrigger>
        <TabsTrigger value="tarifas" className={CLASE_PESTANA}>
          Tarifas <ConteoPestana n={cooperativa.tarifas.length} />
        </TabsTrigger>
        <TabsTrigger value="empleados" className={CLASE_PESTANA}>
          Empleados <ConteoPestana n={cooperativa.empleados.length} />
        </TabsTrigger>
        <TabsTrigger value="calificaciones" className={CLASE_PESTANA}>
          Calificaciones{" "}
          <ConteoPestana n={Math.max(cooperativa.total_calificaciones ?? 0, cooperativa.calificaciones.length)} />
        </TabsTrigger>
      </TabsList>

      {/* General */}
      <TabsContent value="general" className="flex flex-col gap-4">
        <ResumenActividadCards resumen={resumen} />
        <Card>
          <CardHeader className="flex flex-row items-center gap-3">
            <Avatar className="size-12">
              <AvatarImage src={cooperativa.logo_url || ""} alt="" />
              <AvatarFallback className="bg-surface text-[13px] font-semibold text-muted-foreground">
                {cooperativa.nombre.substring(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <CardTitle>Datos de la cooperativa</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-x-6 gap-y-4 md:grid-cols-2 lg:grid-cols-3">
              <Dato etiqueta="Nombre comercial">{cooperativa.nombre}</Dato>
              <Dato etiqueta="RIF">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-mono">{cooperativa.rif}</span>
                  <RifIncompletoBadge rif={cooperativa.rif} />
                </span>
              </Dato>
              <Dato etiqueta="Representante legal">{cooperativa.representante || <Vacio />}</Dato>
              <Dato etiqueta="Correo">{cooperativa.email || <Vacio texto="Sin correo" />}</Dato>
              <Dato etiqueta="Teléfono">{telefonoOVacio(cooperativa.telefono)}</Dato>
              <Dato etiqueta="Calificación promedio">
                <Calificacion promedio={cooperativa.calificacion_promedio} total={cooperativa.total_calificaciones} />
              </Dato>
              <Dato etiqueta="Fecha de registro">
                <span className="tabular-nums">{formatFechaVE(cooperativa.created_at)}</span>
              </Dato>
              {cooperativa.mensaje_registro && (
                <Dato etiqueta="Mensaje al registrarse" className="md:col-span-2 lg:col-span-3">
                  <span className="whitespace-pre-line">{cooperativa.mensaje_registro}</span>
                </Dato>
              )}
            </dl>
          </CardContent>
        </Card>
      </TabsContent>

      {/* Actividad: viajes, boletos, encomiendas y pagos (la lista llega ya paginada del servidor) */}
      {PESTANAS_ACTIVIDAD.map((p: PestanaActividad) => (
        <TabsContent key={p} value={p}>
          {actividad?.tab === p ? <ActividadCooperativa actividad={actividad} /> : null}
        </TabsContent>
      ))}

      {/* Sucursales */}
      <TabsContent value="sucursales">
        <Card className="gap-0 overflow-hidden p-0 max-md:overflow-visible max-md:bg-transparent max-md:shadow-none">
          <ListaResponsive
            items={cooperativa.sucursales}
            clave={(suc) => suc.id}
            etiqueta="sucursales"
            vacio={
              <div className="max-md:rounded-xl max-md:bg-card max-md:shadow-card">
                <Table>
                  <TableBody>
                    <FilaVacia colSpan={5} titulo="Todavía no tiene sucursales" />
                  </TableBody>
                </Table>
              </div>
            }
            tarjeta={(suc) => (
              <EntityCard
                leading={<IconTile icon={MapPin} tone={suc.activa ? "sky" : "neutral"} />}
                title={suc.nombre}
                subtitle={`${formatCiudad(suc.ciudad)} · ${formatCiudad(suc.estado_geografico) || suc.estado_geografico}`}
                lineasSubtitulo={2}
                badge={<StatusBadge status={String(suc.activa)} dominio="recurso" />}
                meta={suc.telefono ? telefonoOVacio(suc.telefono) : undefined}
              />
            )}
            tabla={(items) => (
              <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Ubicación</TableHead>
                <TableHead className="hidden lg:table-cell">Dirección</TableHead>
                <TableHead className="hidden md:table-cell">Teléfono</TableHead>
                <TableHead>Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((suc) => (
                  <TableRow key={suc.id}>
                    <TableCell className="font-medium">{suc.nombre}</TableCell>
                    <TableCell>
                      {formatCiudad(suc.ciudad)}
                      <span className="text-muted-foreground"> · {formatCiudad(suc.estado_geografico) || suc.estado_geografico}</span>
                    </TableCell>
                    <TableCell className="hidden max-w-xs truncate text-muted-foreground lg:table-cell">
                      {suc.direccion || <Vacio />}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">{telefonoOVacio(suc.telefono)}</TableCell>
                    <TableCell>
                      <StatusBadge status={String(suc.activa)} dominio="recurso" />
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
            )}
          />
        </Card>
      </TabsContent>

      {/* Métodos de pago */}
      <TabsContent value="metodos">
        {cooperativa.metodos_pago.length === 0 ? (
          <Card>
            <EmptyState compacto icon={CreditCard} title="Todavía no tiene métodos de pago" />
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {cooperativa.metodos_pago.map((metodo) => (
              <Card key={metodo.id} size="sm">
                <CardHeader className="flex flex-row items-center justify-between gap-2">
                  <CardTitle>{etiquetaMetodoPago(metodo.tipo)}</CardTitle>
                  <StatusBadge status={String(metodo.activo)} dominio="recurso" />
                </CardHeader>
                <CardContent>
                  <dl className="flex flex-col gap-3">
                    {metodo.banco && <Dato etiqueta="Banco">{metodo.banco}</Dato>}
                    <Dato etiqueta="Titular">{metodo.titular}</Dato>
                    {metodo.numero_cuenta && (
                      <Dato etiqueta="Número de cuenta">
                        <span className="font-mono">{metodo.tipo === "PAGO_MOVIL" ? telefonoOGuion(metodo.numero_cuenta) : metodo.numero_cuenta}</span>
                      </Dato>
                    )}
                    {metodo.cedula_rif && (
                      <Dato etiqueta="Cédula o RIF">
                        <span className="font-mono">{documentoOGuion(metodo.cedula_rif)}</span>
                      </Dato>
                    )}
                    {metodo.email_zelle && <Dato etiqueta="Correo Zelle">{metodo.email_zelle}</Dato>}
                    {metodo.instrucciones && <Dato etiqueta="Instrucciones">{metodo.instrucciones}</Dato>}
                  </dl>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </TabsContent>

      {/* Rutas */}
      <TabsContent value="rutas">
        <Card className="gap-0 overflow-hidden p-0 max-md:overflow-visible max-md:bg-transparent max-md:shadow-none">
          <ListaResponsive
            items={cooperativa.rutas}
            clave={(ruta) => ruta.id}
            etiqueta="rutas"
            vacio={
              <div className="max-md:rounded-xl max-md:bg-card max-md:shadow-card">
                <Table>
                  <TableBody>
                    <FilaVacia colSpan={5} titulo="Todavía no tiene rutas" />
                  </TableBody>
                </Table>
              </div>
            }
            tarjeta={(ruta) => (
              <EntityCard
                leading={<IconTile icon={Path} tone={ruta.activa ? "sky" : "neutral"} />}
                title={`${formatCiudad(ruta.ciudad_origen)} → ${formatCiudad(ruta.ciudad_destino)}`}
                subtitle={[ruta.duracion_estimada_min ? formatDuracion(ruta.duracion_estimada_min) : "Falta la duración", textoTerminales(ruta)]
                  .filter(Boolean)
                  .join(" · ")}
                lineasSubtitulo={3}
                adorno={
                  ruta.precio_pasaje === null || ruta.precio_pasaje === undefined ? undefined : (
                    <Monto usd={Number(ruta.precio_pasaje)} tasa={tasa} moneda="USD" size="sm" align="right" />
                  )
                }
                badge={<StatusBadge status={String(ruta.activa)} dominio="recurso" />}
              />
            )}
            tabla={(items) => (
              <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Origen</TableHead>
                <TableHead>Destino</TableHead>
                <TableHead className="hidden text-right md:table-cell">Duración</TableHead>
                <TableHead className="text-right">Pasaje</TableHead>
                <TableHead>Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((ruta) => (
                  <TableRow key={ruta.id}>
                    <TableCell>
                      <span className="font-medium">{formatCiudad(ruta.ciudad_origen)}</span>
                      <span className="block text-[13px] text-muted-foreground">{formatCiudad(ruta.estado_origen) || ruta.estado_origen}</span>
                      <span className="mt-1 block text-[13px]">
                        <span className="text-muted-foreground">Sale de: </span>
                        {ruta.terminal_origen || <Vacio texto="Terminal sin indicar" />}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="font-medium">{formatCiudad(ruta.ciudad_destino)}</span>
                      <span className="block text-[13px] text-muted-foreground">{formatCiudad(ruta.estado_destino) || ruta.estado_destino}</span>
                      <span className="mt-1 block text-[13px]">
                        <span className="text-muted-foreground">Llega a: </span>
                        {ruta.terminal_destino || <Vacio texto="Terminal sin indicar" />}
                      </span>
                    </TableCell>
                    <TableCell className="hidden text-right tabular-nums md:table-cell">
                      {ruta.duracion_estimada_min ? (
                        formatDuracion(ruta.duracion_estimada_min)
                      ) : (
                        <TonoBadge tono="pendiente">Falta la duración</TonoBadge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {ruta.precio_pasaje === null || ruta.precio_pasaje === undefined ? (
                        <Vacio />
                      ) : (
                        <Monto usd={Number(ruta.precio_pasaje)} tasa={tasa} moneda="USD" size="sm" align="right" />
                      )}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={String(ruta.activa)} dominio="recurso" />
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
            )}
          />
        </Card>
      </TabsContent>

      {/* Tarifas */}
      <TabsContent value="tarifas">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <TarifaVigenteCard tarifa={vigente} programada={programada} soloLectura />
          </div>
          <div className="lg:col-span-7">
            <HistorialTarifasTable tarifas={cooperativa.tarifas} />
          </div>
        </div>
      </TabsContent>

      {/* Unidades (buses) */}
      <TabsContent value="unidades">
        <Card className="gap-0 overflow-hidden p-0 max-md:overflow-visible max-md:bg-transparent max-md:shadow-none">
          <ListaResponsive
            items={cooperativa.buses}
            clave={(bus) => bus.id}
            etiqueta="unidades"
            vacio={
              <div className="max-md:rounded-xl max-md:bg-card max-md:shadow-card">
                <Table>
                  <TableBody>
                    <FilaVacia colSpan={6} icon={Bus} titulo="Todavía no tiene unidades" />
                  </TableBody>
                </Table>
              </div>
            }
            tarjeta={(bus) => (
              <EntityCard
                leading={<IconTile icon={Bus} tone={bus.activo ? "sky" : "neutral"} />}
                title={bus.numero_unidad}
                subtitle={[bus.placa ? `Placa ${bus.placa}` : null, bus.chofer_nombre || "Sin chofer"].filter(Boolean).join(" · ")}
                lineasSubtitulo={2}
                adorno={
                  <span className="text-[15px] font-medium tabular-nums">
                    {bus.asientos}
                    <span className="text-[13px] font-normal text-muted-foreground"> asientos</span>
                  </span>
                }
                badge={<StatusBadge status={String(bus.activo)} dominio="recurso" />}
                meta={bus.viajes_proximos > 0 ? `${bus.viajes_proximos} por salir` : undefined}
              />
            )}
            tabla={(items) => (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Unidad</TableHead>
                    <TableHead className="hidden md:table-cell">Placa</TableHead>
                    <TableHead className="text-right">Asientos</TableHead>
                    <TableHead>Chofer</TableHead>
                    <TableHead className="hidden text-right lg:table-cell">Viajes por salir</TableHead>
                    <TableHead>Estado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((bus) => (
                    <TableRow key={bus.id}>
                      <TableCell className="font-medium">{bus.numero_unidad}</TableCell>
                      <TableCell className="hidden font-mono text-[13px] md:table-cell">
                        {bus.placa || <Vacio texto="Sin placa" />}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{bus.asientos}</TableCell>
                      <TableCell>
                        <span className="block">{bus.chofer_nombre || <Vacio texto="Sin chofer" />}</span>
                        {bus.chofer_telefono && (
                          <span className="block text-[13px] text-muted-foreground">{telefonoOVacio(bus.chofer_telefono)}</span>
                        )}
                      </TableCell>
                      <TableCell className="hidden text-right tabular-nums lg:table-cell">
                        {bus.viajes_proximos > 0 ? bus.viajes_proximos : <Vacio />}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={String(bus.activo)} dominio="recurso" />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          />
        </Card>
      </TabsContent>

      {/* Empleados */}
      <TabsContent value="empleados">
        <Card className="gap-0 overflow-hidden p-0 max-md:overflow-visible max-md:bg-transparent max-md:shadow-none">
          <ListaResponsive
            items={cooperativa.empleados}
            clave={(emp) => emp.id}
            etiqueta="empleados"
            vacio={
              <div className="max-md:rounded-xl max-md:bg-card max-md:shadow-card">
                <Table>
                  <TableBody>
                    <FilaVacia colSpan={5} titulo="Todavía no tiene empleados" />
                  </TableBody>
                </Table>
              </div>
            }
            tarjeta={(emp) => (
              <EntityCard
                leading={<IconTile icon={User} tone={emp.isBanned ? "danger" : "sky"} />}
                title={emp.nombre_completo}
                subtitle={emp.email || "Sin correo"}
                badge={<StatusBadge status={emp.isBanned ? "SUSPENDIDA" : "ACTIVA"} dominio="cuenta" />}
                meta={etiquetaRol(emp.role)}
              />
            )}
            tabla={(items) => (
              <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead className="hidden lg:table-cell">Cédula</TableHead>
                <TableHead className="hidden md:table-cell">Teléfono</TableHead>
                <TableHead>Rol</TableHead>
                <TableHead>Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((emp) => (
                  <TableRow key={emp.id}>
                    <TableCell>
                      <span className="block font-medium">{emp.nombre_completo}</span>
                      <span className="block text-[13px] text-muted-foreground">{emp.email || "Sin correo"}</span>
                    </TableCell>
                    <TableCell className="hidden font-mono text-[13px] lg:table-cell">{documentoOGuion(emp.cedula_rif)}</TableCell>
                    <TableCell className="hidden md:table-cell">{telefonoOVacio(emp.telefono)}</TableCell>
                    <TableCell>
                      <TonoBadge tono="neutro">{etiquetaRol(emp.role)}</TonoBadge>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={emp.isBanned ? "SUSPENDIDA" : "ACTIVA"} dominio="cuenta" />
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
            )}
          />
        </Card>
      </TabsContent>

      {/* Calificaciones */}
      <TabsContent value="calificaciones" className="flex flex-col gap-4">
        <Card>
          <CardContent className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-col gap-1">
              <span className="text-[13px] text-muted-foreground">Calificación general</span>
              <div className="flex items-center gap-3">
                <span className="text-[28px] font-semibold tracking-tight tabular-nums">
                  {cooperativa.total_calificaciones > 0 ? formatNumeroVE(promedio, 1) : "—"}
                </span>
                <div className="flex flex-col gap-0.5">
                  <Estrellas n={Math.round(promedio)} className="size-4" />
                  <span className="text-[13px] text-muted-foreground">
                    {cooperativa.total_calificaciones === 1
                      ? "1 opinión"
                      : `${formatNumeroVE(cooperativa.total_calificaciones, 0)} opiniones`}
                  </span>
                </div>
              </div>
            </div>
            <StatusBadge
              status={claveReputacion(promedio, cooperativa.total_calificaciones)}
              dominio="reputacion"
            />
          </CardContent>
        </Card>

        {cooperativa.calificaciones.length === 0 ? (
          <Card>
            <EmptyState compacto icon={Star} title="Todavía no tiene reseñas" />
          </Card>
        ) : (
          <Card className="gap-0 py-0">
            <ul className="divide-y divide-border">
              {cooperativa.calificaciones.map((cal) => (
                <li key={cal.id} className="flex flex-col gap-2 px-6 py-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <Avatar className="size-10">
                        <AvatarFallback className="bg-surface text-[13px] font-semibold text-muted-foreground">
                          {cal.usuario_nombre?.substring(0, 2).toUpperCase() || "US"}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <p className="truncate text-[15px] font-medium">{cal.usuario_nombre || "Pasajero"}</p>
                        <p className="text-[13px] text-muted-foreground tabular-nums">{formatFechaVE(cal.created_at)}</p>
                      </div>
                    </div>
                    <span className="flex items-center gap-2">
                      <Estrellas n={cal.estrellas} className="size-3.5" />
                      <span className="sr-only">{cal.estrellas} de 5 estrellas</span>
                    </span>
                  </div>
                  <p className="pl-13 text-[15px]">{cal.comentario || <Vacio texto="Sin comentario" />}</p>
                </li>
              ))}
            </ul>
            {cooperativa.calificaciones.length < (cooperativa.total_calificaciones ?? 0) && (
              <p className="border-t border-border px-6 py-3 text-[13px] text-muted-foreground">
                Se muestran las {formatNumeroVE(cooperativa.calificaciones.length, 0)} reseñas más recientes.
              </p>
            )}
          </Card>
        )}
      </TabsContent>
    </Tabs>
  );
}
