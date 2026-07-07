"use client";

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

interface CooperativaDetailTabsProps {
  cooperativa: CooperativaDetalle;
}

export function CooperativaDetailTabs({ cooperativa }: CooperativaDetailTabsProps) {
  
  // Format Currency
  const formatUSD = (val: number | null) => {
    if (val === null || val === undefined) return "-";
    return new Intl.NumberFormat("es-VE", {
      style: "currency",
      currency: "USD",
    }).format(val);
  };

  const getTipoPagoLabel = (tipo: string) => {
    switch (tipo) {
      case "TRANSFERENCIA_BANCARIA":
        return "Transferencia Bancaria";
      case "PAGO_MOVIL":
        return "Pago Móvil";
      case "ZELLE":
        return "Zelle";
      case "EFECTIVO":
        return "Efectivo";
      default:
        return tipo;
    }
  };

  return (    <Tabs defaultValue="general" className="w-full">
      <TabsList className="bg-muted border border-border p-1 flex flex-wrap h-auto gap-1 rounded-xl text-muted-foreground">
        <TabsTrigger value="general" className="data-[state=active]:bg-background data-[state=active]:text-foreground flex items-center gap-2 py-2 px-3 rounded-lg text-sm">
          <Info className="h-4 w-4" /> General
        </TabsTrigger>
        <TabsTrigger value="sucursales" className="data-[state=active]:bg-background data-[state=active]:text-foreground flex items-center gap-2 py-2 px-3 rounded-lg text-sm">
          <MapPin className="h-4 w-4" /> Sucursales
        </TabsTrigger>
        <TabsTrigger value="metodos" className="data-[state=active]:bg-background data-[state=active]:text-foreground flex items-center gap-2 py-2 px-3 rounded-lg text-sm">
          <CreditCard className="h-4 w-4" /> Métodos de Pago
        </TabsTrigger>
        <TabsTrigger value="rutas" className="data-[state=active]:bg-background data-[state=active]:text-foreground flex items-center gap-2 py-2 px-3 rounded-lg text-sm">
          <MapTrifold className="h-4 w-4" /> Rutas
        </TabsTrigger>
        <TabsTrigger value="empleados" className="data-[state=active]:bg-background data-[state=active]:text-foreground flex items-center gap-2 py-2 px-3 rounded-lg text-sm">
          <Users className="h-4 w-4" /> Empleados
        </TabsTrigger>
        <TabsTrigger value="calificaciones" className="data-[state=active]:bg-background data-[state=active]:text-foreground flex items-center gap-2 py-2 px-3 rounded-lg text-sm">
          <Star className="h-4 w-4" /> Calificaciones
        </TabsTrigger>
        <TabsTrigger value="balance" className="data-[state=active]:bg-background data-[state=active]:text-foreground flex items-center gap-2 py-2 px-3 rounded-lg text-sm">
          <Coins className="h-4 w-4" /> Balance
        </TabsTrigger>
      </TabsList>

      {/* Tab: General */}
      <TabsContent value="general" className="mt-4">
        <Card className="bg-card border-border text-foreground">
          <CardHeader>
            <CardTitle className="text-lg">Datos Básicos</CardTitle>
            <CardDescription className="text-muted-foreground">Información administrativa de la cooperativa.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-6 md:grid-cols-2">
            <div className="space-y-4">
              <div>
                <span className="text-sm text-muted-foreground block mb-1">Nombre Comercial</span>
                <span className="text-foreground font-medium text-base">{cooperativa.nombre}</span>
              </div>
              <div>
                <span className="text-sm text-muted-foreground block mb-1">RIF</span>
                <span className="text-foreground font-mono text-base">{cooperativa.rif}</span>
              </div>
              <div>
                <span className="text-sm text-muted-foreground block mb-1">Porcentaje de Comisión</span>
                <span className="text-foreground text-base font-semibold text-emerald-400">{cooperativa.comision_porcentaje}%</span>
              </div>
            </div>
            <div className="space-y-4">
              <div>
                <span className="text-sm text-muted-foreground block mb-1">Estado de Operatividad</span>
                <div className="mt-1">
                  {cooperativa.estado === "ACTIVA" && (
                    <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20">Operando Normalmente (Activa)</Badge>
                  )}
                  {cooperativa.estado === "SUSPENDIDA" && (
                    <Badge className="bg-amber-500/10 text-amber-500 border-amber-500/20">Suspendida temporalmente</Badge>
                  )}
                  {cooperativa.estado === "DESACTIVADA" && (
                    <Badge className="bg-rose-500/10 text-rose-500 border-rose-500/20">Desactivada (Baja permanente)</Badge>
                  )}
                </div>
              </div>
              <div>
                <span className="text-sm text-muted-foreground block mb-1">Calificación Promedio</span>
                <div className="flex items-center gap-1.5 mt-1">
                  <Star className="h-5 w-5 fill-amber-400 text-amber-400" />
                  <span className="text-lg font-bold text-foreground">{Number(cooperativa.calificacion_promedio).toFixed(1)}</span>
                  <span className="text-sm text-muted-foreground">basada en {cooperativa.total_calificaciones} calificaciones</span>
                </div>
              </div>
              <div>
                <span className="text-sm text-muted-foreground block mb-1">Fecha de Registro</span>
                <span className="text-foreground text-sm">
                  {new Date(cooperativa.created_at).toLocaleDateString("es-VE", { dateStyle: "long" })}
                </span>
              </div>
            </div>
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
                        <TableCell className="text-muted-foreground">{suc.ciudad}, {suc.estado_geografico}</TableCell>
                        <TableCell className="text-muted-foreground text-sm max-w-xs truncate">{suc.direccion}</TableCell>
                        <TableCell className="text-muted-foreground">{suc.telefono || "-"}</TableCell>
                        <TableCell className="text-right">
                          {suc.activa ? (
                            <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20">Activa</Badge>
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
            <CardTitle className="text-lg">Cuentas y Métodos de Pago ({cooperativa.metodos_pago.length})</CardTitle>
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
                          {getTipoPagoLabel(metodo.tipo)}
                        </Badge>
                        <Circle className={`h-2 w-2 fill-current ${metodo.activo ? "text-emerald-500" : "text-muted-foreground"}`} />
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
                          <span className="text-xs text-muted-foreground block">Número de Cuenta</span>
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
            <CardTitle className="text-lg">Rutas Registradas ({cooperativa.rutas.length})</CardTitle>
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
                      <TableHead className="text-muted-foreground text-right">Duración Estimada</TableHead>
                      <TableHead className="text-muted-foreground text-right">Precio Pasaje</TableHead>
                      <TableHead className="text-muted-foreground text-right">Estado</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {cooperativa.rutas.map((ruta) => (
                      <TableRow key={ruta.id} className="border-border hover:bg-muted/10">
                        <TableCell className="font-medium text-foreground">
                          {ruta.ciudad_origen} <span className="text-xs text-muted-foreground font-normal">({ruta.estado_origen})</span>
                        </TableCell>
                        <TableCell className="font-medium text-foreground">
                          {ruta.ciudad_destino} <span className="text-xs text-muted-foreground font-normal">({ruta.estado_destino})</span>
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {ruta.duracion_estimada_min >= 60 
                            ? `${Math.floor(ruta.duracion_estimada_min / 60)}h ${ruta.duracion_estimada_min % 60}min`
                            : `${ruta.duracion_estimada_min} min`
                          }
                        </TableCell>
                        <TableCell className="text-right font-semibold text-emerald-400">
                          {formatUSD(ruta.precio_pasaje)}
                        </TableCell>
                        <TableCell className="text-right">
                          {ruta.activa ? (
                            <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20">Activa</Badge>
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
            <CardTitle className="text-lg">Nómina de Empleados ({cooperativa.empleados.length})</CardTitle>
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
                      <TableHead className="text-muted-foreground">Correo Electrónico</TableHead>
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
                            <Badge className="bg-purple-500/10 text-purple-400 border-purple-500/20 font-medium">Administrador</Badge>
                          ) : (
                            <Badge className="bg-blue-500/10 text-blue-400 border-blue-500/20 font-medium">Taquillero</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {emp.isBanned ? (
                            <Badge className="bg-rose-500/10 text-rose-500 border-rose-500/20">Suspendido</Badge>
                          ) : (
                            <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20">Activo</Badge>
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
            <CardTitle className="text-lg">Calificaciones y Reseñas ({cooperativa.calificaciones.length})</CardTitle>
            <CardDescription className="text-muted-foreground">Historial de comentarios y valoraciones recibidas de los pasajeros.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            
            {/* Rating Summary Card */}
            <div className="bg-muted/30 border border-border rounded-xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="text-center sm:text-left">
                <span className="text-xs text-muted-foreground uppercase tracking-wider block font-semibold">Calificación General</span>
                <div className="flex items-center justify-center sm:justify-start gap-2 mt-1">
                  <span className="text-4xl font-extrabold text-foreground">
                    {Number(cooperativa.calificacion_promedio).toFixed(1)}
                  </span>
                  <div className="flex flex-col items-start">
                    <div className="flex gap-0.5">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Star 
                          key={i} 
                          className={`h-4 w-4 ${i < Math.round(Number(cooperativa.calificacion_promedio)) ? "fill-amber-400 text-amber-400" : "text-muted"}`} 
                        />
                      ))}
                    </div>
                    <span className="text-xs text-muted-foreground mt-0.5">{cooperativa.total_calificaciones} opiniones en total</span>
                  </div>
                </div>
              </div>

              {/* Graphical distribution mockup or indicator */}
              <div className="text-sm text-muted-foreground bg-background px-4 py-2 rounded-lg border border-border text-center sm:text-right">
                {cooperativa.calificacion_promedio >= 4.0 ? (
                  <div className="flex items-center gap-2 text-emerald-500 font-medium">
                    <ShieldCheck className="h-5 w-5" /> Reputación Excelente
                  </div>
                ) : cooperativa.calificacion_promedio >= 3.0 ? (
                  <div className="flex items-center gap-2 text-amber-500 font-medium">
                    <Warning className="h-5 w-5" /> Reputación Regular
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-rose-500 font-medium">
                    <Warning className="h-5 w-5" /> Requiere Revisión
                  </div>
                )}
                <span className="text-xs text-muted-foreground">Métrica calculada dinámicamente</span>
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
                            {new Date(cal.created_at).toLocaleDateString("es-VE")}
                          </span>
                        </div>
                      </div>
                      <div className="flex gap-0.5">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <Star 
                            key={i} 
                            className={`h-3.5 w-3.5 ${i < cal.estrellas ? "fill-amber-400 text-amber-400" : "text-muted"}`} 
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
            <CardTitle className="text-lg">Balance General de Facturación</CardTitle>
            <CardDescription className="text-muted-foreground">Estado de cuentas y liquidaciones pendientes de la cooperativa.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            
            <div className="grid gap-4 md:grid-cols-2">
              {/* Card 1: Comisión pendiente */}
              <Card className="bg-muted/30 border-border text-foreground">
                <CardContent className="pt-6">
                  <span className="text-sm text-muted-foreground block font-medium">Comisiones Pendientes del Ciclo</span>
                  <div className="mt-2 flex items-baseline gap-2">
                    <span className={`text-4xl font-extrabold tracking-tight ${cooperativa.comisiones_pendientes > 0 ? "text-rose-500" : "text-emerald-500"}`}>
                      {formatUSD(cooperativa.comisiones_pendientes)}
                    </span>
                    <span className="text-xs text-muted-foreground">USD</span>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Suma total de todas las comisiones calculadas y no pagadas hasta la fecha.
                  </p>
                </CardContent>
              </Card>

              {/* Card 2: Estatus solvencia */}
              <Card className="bg-muted/30 border-border text-foreground flex flex-col justify-center">
                <CardContent className="pt-6 space-y-2">
                  <span className="text-sm text-muted-foreground block font-medium">Estado de Solvencia</span>
                  <div className="mt-1">
                    {cooperativa.comisiones_pendientes > 0 ? (
                      <div className="space-y-1">
                        <Badge className="bg-amber-500/10 text-amber-500 border-amber-500/20 text-sm font-medium">
                          Cuentas Pendientes
                        </Badge>
                        <p className="text-xs text-muted-foreground">La cooperativa posee ciclos de comisiones pendientes por cobrar.</p>
                      </div>
                    ) : (
                      <div className="space-y-1">
                        <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 text-sm font-medium">
                          Al Día (Solvente)
                        </Badge>
                        <p className="text-xs text-muted-foreground">Todos los ciclos de comisiones facturados se encuentran liquidados.</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
            
            <p className="text-xs text-muted-foreground italic">
              * Nota: Para conciliar saldos o registrar cobros específicos, dirígete a la sección de **Comisiones** en la barra lateral de navegación.
            </p>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}
