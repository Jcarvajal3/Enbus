"use client";

// ─── Ficha de una cooperativa (AD5-15, AD5-18, AD5-19, AD5-34, AD5-35, SY-29) ─
// Pestañas en `?tab=` con el contador en la pestaña. Cada pestaña es su propia
// tarjeta o tabla (sin título que repita la pestaña). Estados con `StatusBadge`.

import { Coins, CreditCard, Receipt, Star } from "@phosphor-icons/react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import type { CooperativaDetalle } from "@/lib/types/admin-cooperativas";
import { Monto } from "@/components/monto";
import { KpiCard } from "@/components/kpi-card";
import { EmptyState } from "@/components/empty-state";
import { FilaVacia } from "@/components/fila-vacia";
import { StatusBadge } from "@/components/status-badge";
import { useParamUrl } from "@/hooks/use-param-url";
import { useTasaBCVAdmin } from "@/components/admin/dashboard/use-tasa-bcv-admin";
import { CLASE_PESTANA, ConteoPestana, Dato, Vacio } from "@/components/admin/detalle";
import { formatDuracion, formatFechaVE } from "@/lib/fechas";
import { formatCedula, formatTelefono } from "@/lib/ve";
import { isValidRif, normalizeRif } from "@/lib/rif";
import { claveReputacion, etiquetaMetodoPago, etiquetaRol } from "@/lib/estados";
import { formatCiudad } from "@/lib/ciudades";
import { formatNumeroVE } from "@/lib/dinero";
import { Calificacion, RifIncompletoBadge, formatPorcentaje } from "./cooperativas-table";

const PESTANAS = ["general", "sucursales", "metodos", "rutas", "empleados", "calificaciones", "balance"] as const;
type Pestana = (typeof PESTANAS)[number];

interface CooperativaDetailTabsProps {
  cooperativa: CooperativaDetalle;
}

/** Teléfono legible o "—" (SY-29). */
export function telefonoOVacio(v: string | null | undefined) {
  const f = v ? formatTelefono(v) : "—";
  return f === "—" ? <Vacio /> : <span className="tabular-nums">{f}</span>;
}

/** Cédula ("V-30.000.001") o RIF ("J-12345678-9") legibles; si no se reconocen, el texto guardado. */
export function documentoLegible(v: string | null | undefined): string {
  if (!v || v.toUpperCase().startsWith("PENDIENTE")) return "—";
  if (/^[JGC]/i.test(v.trim()) && isValidRif(v)) return normalizeRif(v) ?? v;
  const c = formatCedula(v);
  return c === "—" ? v : c;
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
            <Avatar className="size-10 border border-border">
              <AvatarImage src={cooperativa.logo_url || ""} alt="" />
              <AvatarFallback className="bg-muted text-xs font-semibold text-muted-foreground">
                {cooperativa.nombre.substring(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <CardTitle>Datos de la cooperativa</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
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
                <Dato etiqueta="Mensaje al registrarse" className="sm:col-span-2 lg:col-span-3">
                  <span className="whitespace-pre-line">{cooperativa.mensaje_registro}</span>
                </Dato>
              )}
            </dl>
          </CardContent>
        </Card>
      </TabsContent>

      {/* Sucursales */}
      <TabsContent value="sucursales">
        <Card className="gap-0 overflow-hidden p-0">
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
              {cooperativa.sucursales.length === 0 ? (
                <FilaVacia colSpan={5} titulo="Todavía no tiene sucursales" />
              ) : (
                cooperativa.sucursales.map((suc) => (
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
                ))
              )}
            </TableBody>
          </Table>
        </Card>
      </TabsContent>

      {/* Métodos de pago */}
      <TabsContent value="metodos">
        {cooperativa.metodos_pago.length === 0 ? (
          <Card>
            <EmptyState compacto icon={CreditCard} title="Todavía no tiene métodos de pago" />
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
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
                        <span className="font-mono">{metodo.numero_cuenta}</span>
                      </Dato>
                    )}
                    {metodo.cedula_rif && (
                      <Dato etiqueta="Cédula o RIF">
                        <span className="font-mono">{documentoLegible(metodo.cedula_rif)}</span>
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
        <Card className="gap-0 overflow-hidden p-0">
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
              {cooperativa.rutas.length === 0 ? (
                <FilaVacia colSpan={5} titulo="Todavía no tiene rutas" />
              ) : (
                cooperativa.rutas.map((ruta) => (
                  <TableRow key={ruta.id}>
                    <TableCell>
                      <span className="font-medium">{formatCiudad(ruta.ciudad_origen)}</span>
                      <span className="block text-xs text-muted-foreground">{formatCiudad(ruta.estado_origen) || ruta.estado_origen}</span>
                    </TableCell>
                    <TableCell>
                      <span className="font-medium">{formatCiudad(ruta.ciudad_destino)}</span>
                      <span className="block text-xs text-muted-foreground">{formatCiudad(ruta.estado_destino) || ruta.estado_destino}</span>
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
                ))
              )}
            </TableBody>
          </Table>
        </Card>
      </TabsContent>

      {/* Empleados */}
      <TabsContent value="empleados">
        <Card className="gap-0 overflow-hidden p-0">
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
              {cooperativa.empleados.length === 0 ? (
                <FilaVacia colSpan={5} titulo="Todavía no tiene empleados" />
              ) : (
                cooperativa.empleados.map((emp) => (
                  <TableRow key={emp.id}>
                    <TableCell>
                      <span className="block font-medium">{emp.nombre_completo}</span>
                      <span className="block text-xs text-muted-foreground">{emp.email || "Sin correo"}</span>
                    </TableCell>
                    <TableCell className="hidden font-mono text-sm lg:table-cell">{documentoLegible(emp.cedula_rif)}</TableCell>
                    <TableCell className="hidden md:table-cell">{telefonoOVacio(emp.telefono)}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{etiquetaRol(emp.role)}</Badge>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={emp.isBanned ? "SUSPENDIDA" : "ACTIVA"} dominio="cuenta" />
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </Card>
      </TabsContent>

      {/* Calificaciones */}
      <TabsContent value="calificaciones" className="flex flex-col gap-4">
        <Card>
          <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Calificación general</span>
              <div className="flex items-center gap-3">
                <span className="text-2xl font-semibold tracking-tight tabular-nums">
                  {cooperativa.total_calificaciones > 0 ? formatNumeroVE(promedio, 1) : "—"}
                </span>
                <div className="flex flex-col gap-0.5">
                  <Estrellas n={Math.round(promedio)} className="size-4" />
                  <span className="text-xs text-muted-foreground">
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
                      <Avatar className="size-8 border border-border">
                        <AvatarFallback className="bg-muted text-xs font-semibold text-muted-foreground">
                          {cal.usuario_nombre?.substring(0, 2).toUpperCase() || "US"}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{cal.usuario_nombre || "Pasajero"}</p>
                        <p className="text-xs text-muted-foreground tabular-nums">{formatFechaVE(cal.created_at)}</p>
                      </div>
                    </div>
                    <span className="flex items-center gap-2">
                      <Estrellas n={cal.estrellas} className="size-3.5" />
                      <span className="sr-only">{cal.estrellas} de 5 estrellas</span>
                    </span>
                  </div>
                  <p className="pl-11 text-sm">{cal.comentario || <Vacio texto="Sin comentario" />}</p>
                </li>
              ))}
            </ul>
            {cooperativa.calificaciones.length < (cooperativa.total_calificaciones ?? 0) && (
              <p className="border-t border-border px-6 py-3 text-xs text-muted-foreground">
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
