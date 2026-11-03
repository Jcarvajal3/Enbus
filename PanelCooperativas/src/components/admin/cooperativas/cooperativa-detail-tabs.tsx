"use client";

import Link from "next/link";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { 
  Info, 
  MapPin, 
  CreditCard, 
  MapTrifold, 
  Users, 
  Star, 
  Coins,
  ShieldCheck,
  Warning,
  Circle
} from "@phosphor-icons/react";
import type { CooperativaDetalle } from "@/lib/types/admin-cooperativas";
import { Monto } from "@/components/monto";
import { formatFechaHoraVE, formatFechaVE } from "@/lib/fechas";
import { formatTelefono } from "@/lib/ve";
import { estadoInfo, etiquetaMetodoPago, etiquetaRol } from "@/lib/estados";
import { StatusBadge } from "@/components/status-badge";
import { useTasaBCVAdmin } from "@/components/admin/dashboard/use-tasa-bcv-admin";
import { Calificacion, RifIncompletoBadge, formatPorcentaje } from "./cooperativas-table";
import { useTabEnUrl } from "@/components/admin/use-tab-url";
import { formatCiudad } from "@/lib/ciudades";
import { formatDuracion } from "@/lib/fechas";
import { formatNumeroVE } from "@/lib/dinero";

const PESTANAS = ["general", "sucursales", "metodos", "rutas", "empleados", "calificaciones", "balance"] as const;
const CLASE_ACTIVA = "bg-success-light text-success-deep";

interface CooperativaDetailTabsProps {
  cooperativa: CooperativaDetalle;
}

export function CooperativaDetailTabs({ cooperativa }: CooperativaDetailTabsProps) {
  
  // Montos en USD de referencia, con el equivalente en Bs a la tasa BCV de hoy.
  const tasa = useTasaBCVAdmin();
  const [tab, setTab] = useTabEnUrl(PESTANAS, "general");

  return (
    <Tabs value={tab} onValueChange={(v) => setTab(String(v))} className="w-full">
      <TabsList className="flex h-auto max-w-full flex-wrap gap-1 rounded-xl border p-1">
        <TabsTrigger value="general" className="flex items-center gap-2 px-3 py-2 text-sm">
          <Info className="h-4 w-4" aria-hidden /> General
        </TabsTrigger>
        <TabsTrigger value="sucursales" className="flex items-center gap-2 px-3 py-2 text-sm">
          <MapPin className="h-4 w-4" aria-hidden /> Sucursales
        </TabsTrigger>
        <TabsTrigger value="metodos" className="flex items-center gap-2 px-3 py-2 text-sm">
          <CreditCard className="h-4 w-4" aria-hidden /> Métodos de pago
        </TabsTrigger>
        <TabsTrigger value="rutas" className="flex items-center gap-2 px-3 py-2 text-sm">
          <MapTrifold className="h-4 w-4" aria-hidden /> Rutas
        </TabsTrigger>
        <TabsTrigger value="empleados" className="flex items-center gap-2 px-3 py-2 text-sm">
          <Users className="h-4 w-4" aria-hidden /> Empleados
        </TabsTrigger>
        <TabsTrigger value="calificaciones" className="flex items-center gap-2 px-3 py-2 text-sm">
          <Star className="h-4 w-4" aria-hidden /> Calificaciones
        </TabsTrigger>
        <TabsTrigger value="balance" className="flex items-center gap-2 px-3 py-2 text-sm">
          <Coins className="h-4 w-4" aria-hidden /> Balance
        </TabsTrigger>
      </TabsList>

      {/* Tab: General */}
      <TabsContent value="general" className="mt-4">
        <Card className="bg-card border-border text-foreground">
          <CardHeader>
            <CardTitle className="text-lg">Datos básicos</CardTitle>
            <CardDescription className="text-muted-foreground">Información administrativa de la cooperativa.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-6 md:grid-cols-2">
            <div className="space-y-4">
              <div>
                <span className="text-sm text-muted-foreground block mb-1">Nombre comercial</span>
                <span className="text-foreground font-medium text-base">{cooperativa.nombre}</span>
              </div>
              <div>
                <span className="text-sm text-muted-foreground block mb-1">RIF</span>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-foreground font-mono text-base">{cooperativa.rif}</span>
                  <RifIncompletoBadge rif={cooperativa.rif} />
                </div>
              </div>
              <div>
                <span className="text-sm text-muted-foreground block mb-1">Comisión de EnBus</span>
                <span className="text-base font-semibold text-foreground">{formatPorcentaje(cooperativa.comision_porcentaje)}</span>
              </div>
              <div>
                <span className="text-sm text-muted-foreground block mb-1">Representante legal</span>
                <span className="text-foreground text-sm">{cooperativa.representante || "Sin dato"}</span>
              </div>
              <div>
                <span className="text-sm text-muted-foreground block mb-1">Contacto</span>
                <span className="text-foreground text-sm block">{cooperativa.email || "Sin correo"}</span>
                {cooperativa.telefono && (
                  <span className="text-muted-foreground text-sm block">
                    {formatTelefono(cooperativa.telefono) === "—" ? cooperativa.telefono : formatTelefono(cooperativa.telefono)}
                  </span>
                )}
              </div>
            </div>
            <div className="space-y-4">
              <div>
                <span className="text-sm text-muted-foreground block mb-1">Estado</span>
                <div className="mt-1 space-y-1">
                  <StatusBadge status={cooperativa.estado} dominio="cooperativa" />
                  <p className="text-xs text-muted-foreground">{estadoInfo("cooperativa", cooperativa.estado).ayuda}</p>
                  {cooperativa.motivo_estado && (
                    <p className="text-sm text-foreground">
                      <span className="text-muted-foreground">Motivo: </span>
                      {cooperativa.motivo_estado}
                    </p>
                  )}
                  {cooperativa.estado_cambiado_at && (
                    <p className="text-xs text-muted-foreground">
                      Desde el {formatFechaHoraVE(cooperativa.estado_cambiado_at)}
                    </p>
                  )}
                </div>
              </div>
              <div>
                <span className="text-sm text-muted-foreground block mb-1">Calificación promedio</span>
                <div className="mt-1">
                  <Calificacion promedio={cooperativa.calificacion_promedio} total={cooperativa.total_calificaciones} />
                </div>
              </div>
              <div>
                <span className="text-sm text-muted-foreground block mb-1">Fecha de registro</span>
                <span className="text-foreground text-sm">
                  {formatFechaVE(cooperativa.created_at, { dateStyle: "long" })}
                </span>
              </div>
            </div>
            {cooperativa.mensaje_registro && (
              <div className="md:col-span-2">
                <span className="text-sm text-muted-foreground block mb-1">Mensaje al registrarse</span>
                <p className="whitespace-pre-line rounded-lg border bg-muted/30 p-3 text-sm text-foreground">
                  {cooperativa.mensaje_registro}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </TabsContent>

      {/* Tab: Sucursales */}
      <TabsContent value="sucursales" className="mt-4">
        <Card className="bg-card border-border text-foreground">
          <CardHeader>
            <CardTitle className="text-lg">Sucursales ({cooperativa.sucursales.length})</CardTitle>
            <CardDescription className="text-muted-foreground">Puntos de carga, recepción y taquillas habilitadas.</CardDescription>
          </CardHeader>
          <CardContent>
            {cooperativa.sucursales.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">La cooperativa aún no tiene sucursales registradas.</p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-border">
                <Table>
                  <TableHeader className="bg-muted/40 border-border">
                    <TableRow className="border-border hover:bg-transparent">
                      <TableHead className="text-muted-foreground">Nombre</TableHead>
                      <TableHead className="text-muted-foreground">Ubicación</TableHead>
                      <TableHead className="text-muted-foreground">Dirección</TableHead>
                      <TableHead className="text-muted-foreground">Teléfono</TableHead>
                      <TableHead className="text-muted-foreground text-right">Estado</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {cooperativa.sucursales.map((suc) => (
                      <TableRow key={suc.id} className="border-border hover:bg-muted/10">
                        <TableCell className="font-medium text-foreground">{suc.nombre}</TableCell>
                        <TableCell className="text-muted-foreground">{formatCiudad(suc.ciudad)}, {suc.estado_geografico}</TableCell>
                        <TableCell className="text-muted-foreground text-sm max-w-xs truncate">{suc.direccion}</TableCell>
                        <TableCell className="text-muted-foreground">{suc.telefono || "-"}</TableCell>
                        <TableCell className="text-right">
                          {suc.activa ? (
                            <Badge variant="secondary" className={CLASE_ACTIVA}>Activa</Badge>
                          ) : (
                            <Badge variant="secondary" className="bg-muted text-muted-foreground border-border">Inactiva</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </TabsContent>

      {/* Tab: Métodos de Pago */}
      <TabsContent value="metodos" className="mt-4">
        <Card className="bg-card border-border text-foreground">
          <CardHeader>
            <CardTitle className="text-lg">Cuentas y métodos de pago ({cooperativa.metodos_pago.length})</CardTitle>
            <CardDescription className="text-muted-foreground">Métodos habilitados para compras digitales y recepción de transferencias.</CardDescription>
          </CardHeader>
          <CardContent>
            {cooperativa.metodos_pago.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">No hay métodos de pago registrados para esta cooperativa.</p>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {cooperativa.metodos_pago.map((metodo) => (
                  <Card key={metodo.id} className="bg-muted/40 border-border text-foreground flex flex-col justify-between">
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <Badge className="bg-muted border-border text-muted-foreground font-medium">
                          {etiquetaMetodoPago(metodo.tipo)}
                        </Badge>
                        <span className="flex items-center gap-1 text-xs text-muted-foreground"><Circle weight="fill" aria-hidden className={`h-2 w-2 ${metodo.activo ? "text-success-text" : "text-muted-foreground"}`} />{metodo.activo ? "Activo" : "Inactivo"}</span>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm text-muted-foreground pb-4">
                      {metodo.banco && (
                        <div>
                          <span className="text-xs text-muted-foreground block">Banco</span>
                          <span className="font-medium text-foreground">{metodo.banco}</span>
                        </div>
                      )}
                      <div>
                        <span className="text-xs text-muted-foreground block">Titular</span>
                        <span className="font-medium text-foreground">{metodo.titular}</span>
                      </div>
                      {metodo.numero_cuenta && (
                        <div>
                          <span className="text-xs text-muted-foreground block">Número de cuenta</span>
                          <span className="font-mono text-muted-foreground">{metodo.numero_cuenta}</span>
                        </div>
                      )}
                      {metodo.cedula_rif && (
                        <div>
                          <span className="text-xs text-muted-foreground block">Cédula / RIF</span>
                          <span className="font-mono text-muted-foreground">{metodo.cedula_rif}</span>
                        </div>
                      )}
                      {metodo.email_zelle && (
                        <div>
                          <span className="text-xs text-muted-foreground block">Correo Zelle</span>
                          <span className="text-foreground">{metodo.email_zelle}</span>
                        </div>
                      )}
                      {metodo.instrucciones && (
                        <div className="mt-2 text-xs text-muted-foreground bg-background p-2 rounded border border-border">
                          <span className="text-muted-foreground block font-semibold mb-1">Instrucciones:</span>
                          {metodo.instrucciones}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </TabsContent>

      {/* Tab: Rutas */}
      <TabsContent value="rutas" className="mt-4">
        <Card className="bg-card border-border text-foreground">
          <CardHeader>
            <CardTitle className="text-lg">Rutas registradas ({cooperativa.rutas.length})</CardTitle>
            <CardDescription className="text-muted-foreground">Destinos y tarifas configurados para viajes y encomiendas.</CardDescription>
          </CardHeader>
          <CardContent>
            {cooperativa.rutas.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">La cooperativa no cuenta con rutas creadas.</p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-border">
                <Table>
                  <TableHeader className="bg-muted/40 border-border">
                    <TableRow className="border-border hover:bg-transparent">
                      <TableHead className="text-muted-foreground">Origen</TableHead>
                      <TableHead className="text-muted-foreground">Destino</TableHead>
                      <TableHead className="text-muted-foreground text-right">Duración estimada</TableHead>
                      <TableHead className="text-muted-foreground text-right">Precio del pasaje (USD)</TableHead>
                      <TableHead className="text-muted-foreground text-right">Estado</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {cooperativa.rutas.map((ruta) => (
                      <TableRow key={ruta.id} className="border-border hover:bg-muted/10">
                        <TableCell className="font-medium text-foreground">
                          {formatCiudad(ruta.ciudad_origen)} <span className="text-xs text-muted-foreground font-normal">({ruta.estado_origen})</span>
                        </TableCell>
                        <TableCell className="font-medium text-foreground">
                          {formatCiudad(ruta.ciudad_destino)} <span className="text-xs text-muted-foreground font-normal">({ruta.estado_destino})</span>
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {formatDuracion(ruta.duracion_estimada_min)}
                        </TableCell>
                        <TableCell className="text-right font-semibold">
                          {ruta.precio_pasaje === null || ruta.precio_pasaje === undefined ? "—" : <Monto usd={Number(ruta.precio_pasaje)} tasa={tasa} moneda="USD" size="sm" align="right" />}
                        </TableCell>
                        <TableCell className="text-right">
                          {ruta.activa ? (
                            <Badge variant="secondary" className={CLASE_ACTIVA}>Activa</Badge>
                          ) : (
                            <Badge variant="secondary" className="bg-muted text-muted-foreground border-border">Inactiva</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </TabsContent>

      {/* Tab: Empleados */}
      <TabsContent value="empleados" className="mt-4">
        <Card className="bg-card border-border text-foreground">
          <CardHeader>
            <CardTitle className="text-lg">Empleados ({cooperativa.empleados.length})</CardTitle>
            <CardDescription className="text-muted-foreground">Administradores y taquilleros con acceso al sistema.</CardDescription>
          </CardHeader>
          <CardContent>
            {cooperativa.empleados.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">No hay empleados vinculados a esta cooperativa.</p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-border">
                <Table>
                  <TableHeader className="bg-muted/40 border-border">
                    <TableRow className="border-border hover:bg-transparent">
                      <TableHead className="text-muted-foreground">Nombre</TableHead>
                      <TableHead className="text-muted-foreground">Correo</TableHead>
                      <TableHead className="text-muted-foreground">Cédula / RIF</TableHead>
                      <TableHead className="text-muted-foreground">Teléfono</TableHead>
                      <TableHead className="text-muted-foreground">Rol</TableHead>
                      <TableHead className="text-muted-foreground text-right">Estado</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {cooperativa.empleados.map((emp) => (
                      <TableRow key={emp.id} className="border-border hover:bg-muted/10">
                        <TableCell className="font-medium text-foreground">{emp.nombre_completo}</TableCell>
                        <TableCell className="text-muted-foreground">{emp.email || "Sin email registrado"}</TableCell>
                        <TableCell className="text-muted-foreground font-mono text-sm">{emp.cedula_rif}</TableCell>
                        <TableCell className="text-muted-foreground">{emp.telefono}</TableCell>
                        <TableCell className="py-2">
                          {emp.role === "admin_cooperativa" ? (
                            <Badge variant="secondary" className="bg-primary/15 text-foreground font-medium">{etiquetaRol(emp.role)}</Badge>
                          ) : (
                            <Badge variant="secondary" className="bg-info-light text-info-deep font-medium">{etiquetaRol(emp.role)}</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {emp.isBanned ? (
                            <Badge variant="secondary" className="bg-destructive-light text-destructive-deep">Bloqueado</Badge>
                          ) : (
                            <Badge variant="secondary" className={CLASE_ACTIVA}>Activo</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </TabsContent>

      {/* Tab: Calificaciones */}
      <TabsContent value="calificaciones" className="mt-4">
        <Card className="bg-card border-border text-foreground">
          <CardHeader>
            <CardTitle className="text-lg">Calificaciones y reseñas ({Math.max(cooperativa.total_calificaciones ?? 0, cooperativa.calificaciones.length)})</CardTitle>
            <CardDescription className="text-muted-foreground">
              Historial de comentarios y valoraciones recibidas de los pasajeros
              {cooperativa.calificaciones.length < (cooperativa.total_calificaciones ?? 0) ? ` (se muestran las ${cooperativa.calificaciones.length} más recientes)` : ""}.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            
            {/* Rating Summary Card */}
            <div className="bg-muted/30 border border-border rounded-xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="text-center sm:text-left">
                <span className="text-xs text-muted-foreground uppercase tracking-wider block font-semibold">Calificación General</span>
                <div className="flex items-center justify-center sm:justify-start gap-2 mt-1">
                  <span className="text-4xl font-extrabold text-foreground">
                    {cooperativa.total_calificaciones > 0 ? formatNumeroVE(Number(cooperativa.calificacion_promedio), 1) : "—"}
                  </span>
                  <div className="flex flex-col items-start">
                    <div className="flex gap-0.5">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Star 
                          key={i} 
                          weight={i < Math.round(Number(cooperativa.calificacion_promedio)) ? "fill" : "regular"}
                          aria-hidden
                          className={`h-4 w-4 ${i < Math.round(Number(cooperativa.calificacion_promedio)) ? "text-primary-text" : "text-muted-foreground"}`} 
                        />
                      ))}
                    </div>
                    <span className="text-xs text-muted-foreground mt-0.5">{cooperativa.total_calificaciones > 0 ? `${cooperativa.total_calificaciones} opiniones en total` : "Sin calificaciones"}</span>
                  </div>
                </div>
              </div>

              {/* Graphical distribution mockup or indicator */}
              <div className="text-sm text-muted-foreground bg-background px-4 py-2 rounded-lg border border-border text-center sm:text-right">
                {cooperativa.total_calificaciones === 0 ? (
                  <div className="font-medium text-foreground">Todavía no la califican</div>
                ) : cooperativa.calificacion_promedio >= 4.0 ? (
                  <div className="flex items-center gap-2 text-success-text font-medium">
                    <ShieldCheck className="h-5 w-5" /> Reputación excelente
                  </div>
                ) : cooperativa.calificacion_promedio >= 3.0 ? (
                  <div className="flex items-center gap-2 text-warning-text font-medium">
                    <Warning className="h-5 w-5" /> Reputación regular
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-destructive-text font-medium">
                    <Warning className="h-5 w-5" /> Requiere revisión
                  </div>
                )}
                <span className="text-xs text-muted-foreground">Según el promedio de calificaciones</span>
              </div>
            </div>

            {/* Individual Reviews */}
            {cooperativa.calificaciones.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">Aún no se han recibido reseñas de esta cooperativa.</p>
            ) : (
              <div className="space-y-4">
                {cooperativa.calificaciones.map((cal) => (
                  <div key={cal.id} className="border border-border/80 rounded-xl p-4 bg-muted/10 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Avatar className="h-8 w-8 border border-border bg-muted">
                          <AvatarFallback className="text-xs font-semibold text-muted-foreground bg-muted">
                            {cal.usuario_nombre?.substring(0, 2).toUpperCase() || "US"}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <span className="text-sm font-semibold text-foreground block leading-tight">{cal.usuario_nombre}</span>
                          <span className="text-xs text-muted-foreground">
                            {formatFechaVE(cal.created_at)}
                          </span>
                        </div>
                      </div>
                      <div className="flex gap-0.5">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <Star 
                            key={i} 
                            weight={i < cal.estrellas ? "fill" : "regular"}
                            aria-hidden
                            className={`h-3.5 w-3.5 ${i < cal.estrellas ? "text-primary-text" : "text-muted-foreground"}`} 
                          />
                        ))}
                      </div>
                    </div>
                    {cal.comentario ? (
                      <p className="text-sm text-muted-foreground pl-10 italic">&quot;{cal.comentario}&quot;</p>
                    ) : (
                      <p className="text-sm text-muted-foreground pl-10 italic">Sin comentarios adicionales</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </TabsContent>

      {/* Tab: Balance */}
      <TabsContent value="balance" className="mt-4">
        <Card className="bg-card border-border text-foreground">
          <CardHeader>
            <CardTitle className="text-lg">Balance de comisiones</CardTitle>
            <CardDescription className="text-muted-foreground">Estado de cuentas y liquidaciones pendientes de la cooperativa.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            
            <div className="grid gap-4 md:grid-cols-2">
              {/* Card 1: Comisión pendiente */}
              <Card className="bg-muted/30 border-border text-foreground">
                <CardContent className="pt-6">
                  <span className="text-sm text-muted-foreground block font-medium">Comisiones pendientes</span>
                  <div className="mt-2">
                    <Monto
                      usd={Number(cooperativa.comisiones_pendientes ?? 0)}
                      tasa={tasa}
                      moneda="USD"
                      size="lg"
                      className={cooperativa.comisiones_pendientes > 0 ? "text-warning-text" : "text-success-text"}
                    />
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Suma de las comisiones calculadas y no pagadas hasta la fecha, en USD de referencia. La cooperativa
                    las paga en bolívares a la tasa BCV del día del pago.
                  </p>
                </CardContent>
              </Card>

              {/* Card 2: Estatus solvencia */}
              <Card className="bg-muted/30 border-border text-foreground flex flex-col justify-center">
                <CardContent className="pt-6 space-y-2">
                  <span className="text-sm text-muted-foreground block font-medium">Estado de pago</span>
                  <div className="mt-1">
                    {cooperativa.comisiones_pendientes > 0 ? (
                      <div className="space-y-1">
                        <Badge variant="secondary" className="bg-warning-light text-warning-deep text-sm font-medium">
                          Con comisiones pendientes
                        </Badge>
                        <p className="text-xs text-muted-foreground">Tiene ciclos de comisiones sin pagar. Regístralos en Comisiones cuando pague.</p>
                      </div>
                    ) : (
                      <div className="space-y-1">
                        <Badge variant="secondary" className="bg-success-light text-success-deep text-sm font-medium">
                          Al día
                        </Badge>
                        <p className="text-xs text-muted-foreground">Todos sus ciclos de comisiones están pagados.</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
            
            <p className="text-xs text-muted-foreground">
              Para registrar el pago de un ciclo, ve a <Link href="/admin/comisiones" className="text-foreground underline decoration-primary underline-offset-4">Comisiones</Link>.
            </p>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}
