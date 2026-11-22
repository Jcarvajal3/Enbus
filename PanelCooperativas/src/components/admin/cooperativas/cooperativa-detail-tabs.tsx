"use client";

// ─── Ficha de una cooperativa (AD5-15, AD5-18, AD5-19, AD5-34, AD5-35, SY-29) ─
// Pestañas en `?tab=` con el contador en la pestaña. Cada pestaña es su propia
// tarjeta o tabla (sin título que repita la pestaña). Estados con `StatusBadge`.

import { Coins, CreditCard, MapPin, Path, Receipt, Star, User } from "@phosphor-icons/react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import type { CooperativaDetalle } from "@/lib/types/admin-cooperativas";
import { Monto } from "@/components/monto";
import { KpiCard } from "@/components/kpi-card";
import { EmptyState } from "@/components/empty-state";
import { EntityCard } from "@/components/entity-card";
import { IconTile } from "@/components/icon-tile";
import { ListaResponsive } from "@/components/lista-responsive";
import { FilaVacia } from "@/components/fila-vacia";
import { StatusBadge, TonoBadge } from "@/components/status-badge";
import { useParamUrl } from "@/hooks/use-param-url";
import { useTasaBCVAdmin } from "@/components/admin/dashboard/use-tasa-bcv-admin";
import { CLASE_PESTANA, ConteoPestana, Dato, Vacio } from "@/components/admin/detalle";
import { formatDuracion, formatFechaVE } from "@/lib/fechas";
import { documentoOGuion, SIN_DATO, telefonoOGuion } from "@/lib/mostrar";
import { claveReputacion, etiquetaMetodoPago, etiquetaRol } from "@/lib/estados";
import { formatCiudad } from "@/lib/ciudades";
import { formatNumeroVE } from "@/lib/dinero";
import { TarifaVigenteCard } from "@/components/tarifas/tarifa-vigente-card";
import { HistorialTarifasTable } from "@/components/tarifas/historial-tarifas-table";
import { Calificacion, RifIncompletoBadge, formatPorcentaje } from "./cooperativas-table";

const PESTANAS = ["general", "sucursales", "metodos", "rutas", "tarifas", "empleados", "calificaciones", "balance"] as const;
type Pestana = (typeof PESTANAS)[number];

interface CooperativaDetailTabsProps {
  cooperativa: CooperativaDetalle;
}

/** Teléfono legible o "—" (SY-29). */
export function telefonoOVacio(v: string | null | undefined) {
  const f = telefonoOGuion(v);
  return f === SIN_DATO ? <Vacio /> : <span className="tabular-nums">{f}</span>;
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

export function CooperativaDetailTabs({ cooperativa }: CooperativaDetailTabsProps) {
  // Montos en USD de referencia, con el equivalente en Bs a la tasa BCV de hoy.
  const tasa = useTasaBCVAdmin();
  const [valorTab, setTab] = useParamUrl("tab", "general");
  const tab: Pestana = (PESTANAS as readonly string[]).includes(valorTab) ? (valorTab as Pestana) : "general";
  const pendiente = Number(cooperativa.comisiones_pendientes ?? 0);
  const promedio = Number(cooperativa.calificacion_promedio);
  const vigente = cooperativa.tarifas.find((t) => t.estado === "VIGENTE") ?? null;
  const programada = cooperativa.tarifas.find((t) => t.estado === "PROGRAMADA") ?? null;

  return (
    <Tabs value={tab} onValueChange={(v) => setTab(String(v))} className="gap-4">
      <TabsList aria-label="Secciones de la cooperativa">
        <TabsTrigger value="general" className={CLASE_PESTANA}>General</TabsTrigger>
        <TabsTrigger value="sucursales" className={CLASE_PESTANA}>
          Sucursales <ConteoPestana n={cooperativa.sucursales.length} />
        </TabsTrigger>
        <TabsTrigger value="metodos" className={CLASE_PESTANA}>
          Métodos de pago <ConteoPestana n={cooperativa.metodos_pago.length} />
        </TabsTrigger>
        <TabsTrigger value="rutas" className={CLASE_PESTANA}>
          Rutas <ConteoPestana n={cooperativa.rutas.length} />
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
        <TabsTrigger value="balance" className={CLASE_PESTANA}>Balance</TabsTrigger>
      </TabsList>

      {/* General */}
      <TabsContent value="general">
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
              <Dato etiqueta="Comisión de EnBus">
                <span className="tabular-nums">{formatPorcentaje(cooperativa.comision_porcentaje)}</span>
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
                subtitle={formatDuracion(ruta.duracion_estimada_min)}
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
                    </TableCell>
                    <TableCell>
                      <span className="font-medium">{formatCiudad(ruta.ciudad_destino)}</span>
                      <span className="block text-[13px] text-muted-foreground">{formatCiudad(ruta.estado_destino) || ruta.estado_destino}</span>
                    </TableCell>
                    <TableCell className="hidden text-right tabular-nums md:table-cell">
                      {formatDuracion(ruta.duracion_estimada_min)}
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

      {/* Balance */}
      <TabsContent value="balance">
        <div className="grid gap-4 md:grid-cols-2">
          <KpiCard
            title="Comisiones pendientes"
            value={<Monto usd={pendiente} tasa={tasa} moneda="USD" size="lg" />}
            icon={Coins}
            variant={pendiente > 0 ? "warning" : "default"}
            href={`/admin/comisiones?cooperativa=${cooperativa.id}&estado=pendiente`}
            accion="Ver ciclos pendientes"
          />
          <KpiCard
            title="Ciclos sin pagar"
            value={formatNumeroVE(cooperativa.ciclos_sin_pagar, 0)}
            icon={Receipt}
            variant={cooperativa.ciclos_sin_pagar >= 2 ? "warning" : "default"}
            description={cooperativa.ciclos_sin_pagar === 0 ? "Al día con EnBus" : undefined}
          />
        </div>
      </TabsContent>
    </Tabs>
  );
}
