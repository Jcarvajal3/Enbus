"use client";

import { 
  Tabs, 
  TabsContent, 
  TabsList, 
  TabsTrigger 
} from "@/components/ui/tabs";
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardHeader, 
  CardTitle 
} from "@/components/ui/card";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { 
  User, 
  Envelope, 
  Phone, 
  IdentificationCard, 
  Bell, 
  Package, 
  Ticket, 
  CreditCard, 
  CheckCircle, 
  XCircle, 
  WarningCircle, 
  PaperPlaneTilt 
} from "@phosphor-icons/react";
import type { UsuarioDetalle } from "@/lib/types/admin-usuarios";

interface UsuarioDetailTabsProps {
  usuario: UsuarioDetalle;
}

export function UsuarioDetailTabs({ usuario }: UsuarioDetailTabsProps) {
  // Helper to format currency
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("es-VE", {
      style: "currency",
      currency: "USD",
    }).format(amount);
  };

  // Helper to render Encomiendas state badge
  const getEncomiendaEstadoBadge = (estado: string) => {
    switch (estado) {
      case "PENDIENTE_DE_ESCANEO":
        return <Badge variant="secondary" className="bg-slate-500/10 text-slate-400 border-slate-500/20">Pendiente Escaneo</Badge>;
      case "EN_RECEPCION":
        return <Badge className="bg-sky-500/10 text-sky-500 hover:bg-sky-500/20 border-sky-500/20">En Recepción</Badge>;
      case "POR_PAGAR":
        return <Badge className="bg-amber-500/10 text-amber-500 hover:bg-amber-500/20 border-amber-500/20">Por Pagar</Badge>;
      case "PAGADA":
        return <Badge className="bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 border-emerald-500/20">Pagada</Badge>;
      case "EN_TRANSITO":
        return <Badge className="bg-indigo-500/10 text-indigo-500 hover:bg-indigo-500/20 border-indigo-500/20">En Tránsito</Badge>;
      case "EN_OFICINA_DESTINO":
        return <Badge className="bg-purple-500/10 text-purple-500 hover:bg-purple-500/20 border-purple-500/20">En Oficina Destino</Badge>;
      case "ENTREGADA":
        return <Badge className="bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 border-emerald-500/20">Entregada</Badge>;
      case "CANCELADA":
        return <Badge className="bg-destructive/10 text-destructive hover:bg-destructive/20 border-destructive/20">Cancelada</Badge>;
      case "DEVUELTA":
        return <Badge className="bg-orange-500/10 text-orange-500 hover:bg-orange-500/20 border-orange-500/20">Devuelta</Badge>;
      default:
        return <Badge variant="outline">{estado}</Badge>;
    }
  };

  // Helper to render Boleto state badge
  const getBoletoEstadoBadge = (estado: string) => {
    switch (estado) {
      case "RESERVADO":
        return <Badge className="bg-amber-500/10 text-amber-500 hover:bg-amber-500/20 border-amber-500/20">Reservado</Badge>;
      case "PAGADO":
        return <Badge className="bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 border-emerald-500/20">Pagado</Badge>;
      case "USADO":
        return <Badge className="bg-indigo-500/10 text-indigo-500 hover:bg-indigo-500/20 border-indigo-500/20">Usado</Badge>;
      case "CANCELADO":
        return <Badge className="bg-destructive/10 text-destructive hover:bg-destructive/20 border-destructive/20">Cancelado</Badge>;
      case "EXPIRADO":
        return <Badge variant="secondary" className="bg-slate-500/10 text-slate-400 border-slate-500/20">Expirado</Badge>;
      default:
        return <Badge variant="outline">{estado}</Badge>;
    }
  };

  const getCanalBadge = (canal: string) => {
    switch (canal) {
      case "WHATSAPP":
        return <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20">WhatsApp</Badge>;
      case "PUSH":
        return <Badge className="bg-sky-500/10 text-sky-500 border-sky-500/20">Push App</Badge>;
      case "SMS":
        return <Badge className="bg-slate-500/10 text-slate-300 border-slate-500/20">SMS</Badge>;
      case "EMAIL":
        return <Badge className="bg-indigo-500/10 text-indigo-500 border-indigo-500/20">Email</Badge>;
      default:
        return <Badge variant="outline">{canal}</Badge>;
    }
  };

  return (
    <Tabs defaultValue="perfil" className="w-full space-y-4">
      <TabsList className="bg-slate-900 border border-slate-800 p-1 rounded-lg">
        <TabsTrigger value="perfil" className="data-[state=active]:bg-slate-800 data-[state=active]:text-emerald-400 text-slate-400">
          <User className="h-4 w-4 mr-2" /> Perfil
        </TabsTrigger>
        <TabsTrigger value="encomiendas" className="data-[state=active]:bg-slate-800 data-[state=active]:text-emerald-400 text-slate-400">
          <Package className="h-4 w-4 mr-2" /> Encomiendas ({usuario.encomiendas_enviadas.length + usuario.encomiendas_recibidas.length})
        </TabsTrigger>
        <TabsTrigger value="boletos" className="data-[state=active]:bg-slate-800 data-[state=active]:text-emerald-400 text-slate-400">
          <Ticket className="h-4 w-4 mr-2" /> Boletos ({usuario.boletos.length})
        </TabsTrigger>
        <TabsTrigger value="pagos" className="data-[state=active]:bg-slate-800 data-[state=active]:text-emerald-400 text-slate-400">
          <CreditCard className="h-4 w-4 mr-2" /> Pagos ({usuario.pagos.length})
        </TabsTrigger>
        <TabsTrigger value="notificaciones" className="data-[state=active]:bg-slate-800 data-[state=active]:text-emerald-400 text-slate-400">
          <Bell className="h-4 w-4 mr-2" /> Notificaciones ({usuario.notificaciones.length})
        </TabsTrigger>
      </TabsList>

      {/* TABS CONTENT */}
      
      {/* 1. PERFIL */}
      <TabsContent value="perfil">
        <Card className="bg-slate-950/40 border-slate-800 text-slate-100 backdrop-blur-md">
          <CardHeader>
            <CardTitle className="text-xl font-bold flex items-center gap-2 text-slate-200">
              <User className="h-5 w-5 text-emerald-500" /> Información del Perfil
            </CardTitle>
            <CardDescription className="text-slate-500">Datos personales del usuario y configuraciones</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <div className="space-y-1">
                <span className="text-xs text-slate-500 uppercase tracking-wider font-semibold">Nombre Completo</span>
                <p className="text-slate-200 font-medium flex items-center gap-2">
                  {usuario.nombre_completo}
                </p>
              </div>

              <div className="space-y-1">
                <span className="text-xs text-slate-500 uppercase tracking-wider font-semibold">Correo Electrónico</span>
                <p className="text-slate-200 font-medium flex items-center gap-2">
                  <Envelope className="h-4 w-4 text-slate-400" />
                  {usuario.email || <span className="text-slate-600 italic">No disponible</span>}
                </p>
              </div>

              <div className="space-y-1">
                <span className="text-xs text-slate-500 uppercase tracking-wider font-semibold">Identificación / Cédula / RIF</span>
                <p className="text-slate-200 font-medium font-mono flex items-center gap-2">
                  <IdentificationCard className="h-4 w-4 text-slate-400" />
                  {usuario.cedula_rif}
                </p>
              </div>

              <div className="space-y-1">
                <span className="text-xs text-slate-500 uppercase tracking-wider font-semibold">Teléfono</span>
                <p className="text-slate-200 font-medium flex items-center gap-2">
                  <Phone className="h-4 w-4 text-slate-400" />
                  {usuario.telefono}
                </p>
              </div>

              <div className="space-y-1">
                <span className="text-xs text-slate-500 uppercase tracking-wider font-semibold">Rol del Sistema</span>
                <div className="flex items-center gap-2 mt-1">
                  {usuario.role === "super_admin" && <Badge className="bg-amber-500/10 text-amber-500 border-amber-500/20">Super Admin</Badge>}
                  {usuario.role === "admin_cooperativa" && <Badge className="bg-indigo-500/10 text-indigo-500 border-indigo-500/20">Admin Cooperativa</Badge>}
                  {usuario.role === "taquillero" && <Badge className="bg-sky-500/10 text-sky-500 border-sky-500/20">Taquillero</Badge>}
                  {usuario.role === "user" && <Badge className="bg-slate-500/10 text-slate-400 border-slate-500/20">Cliente</Badge>}
                </div>
              </div>

              <div className="space-y-1">
                <span className="text-xs text-slate-500 uppercase tracking-wider font-semibold">Cooperativa Asociada</span>
                <p className="text-slate-200 font-medium italic">
                  {usuario.cooperativa_nombre || "Ninguna"}
                </p>
              </div>

              <div className="space-y-1 col-span-1 md:col-span-2">
                <span className="text-xs text-slate-500 uppercase tracking-wider font-semibold">Token de Notificación Push (Expo)</span>
                <p className="text-slate-400 font-mono text-xs break-all bg-slate-900/50 p-2 rounded border border-slate-800/80 mt-1">
                  {usuario.has_push_token ? (
                    <span className="text-emerald-400">✓ Dispositivo registrado para Push</span>
                  ) : (
                    <span className="text-slate-600 italic">Sin dispositivo registrado</span>
                  )}
                </p>
              </div>

              <div className="space-y-1">
                <span className="text-xs text-slate-500 uppercase tracking-wider font-semibold">Fecha de Registro</span>
                <p className="text-slate-200 font-medium">
                  {new Date(usuario.created_at).toLocaleString("es-VE")}
                </p>
              </div>
            </div>

            <div className="border-t border-slate-800 pt-6">
              <h3 className="text-sm font-semibold text-slate-300 mb-4 flex items-center gap-2">
                <Bell className="h-4 w-4 text-emerald-500" /> Preferencias de Notificación
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Card className="bg-slate-900/30 border-slate-800/60 p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Encomiendas</span>
                    {usuario.notif_encomiendas ? (
                      <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20">Activado</Badge>
                    ) : (
                      <Badge variant="outline" className="bg-slate-700/10 text-slate-500 border-slate-700/20">Desactivado</Badge>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 mt-2">Alertas sobre envíos, recepción y entregas de encomiendas.</p>
                </Card>

                <Card className="bg-slate-900/30 border-slate-800/60 p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Boletos</span>
                    {usuario.notif_boletos ? (
                      <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20">Activado</Badge>
                    ) : (
                      <Badge variant="outline" className="bg-slate-700/10 text-slate-500 border-slate-700/20">Desactivado</Badge>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 mt-2">Alertas sobre compras, reservas o cambios en boletos de viaje.</p>
                </Card>

                <Card className="bg-slate-900/30 border-slate-800/60 p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Recordatorios</span>
                    {usuario.notif_recordatorios ? (
                      <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20">Activado</Badge>
                    ) : (
                      <Badge variant="outline" className="bg-slate-700/10 text-slate-500 border-slate-700/20">Desactivado</Badge>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 mt-2">Avisos automáticos sobre viajes programados y entregas pendientes.</p>
                </Card>
              </div>
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      {/* 2. ENCOMIENDAS */}
      <TabsContent value="encomiendas" className="space-y-6">
        {/* Enviadas */}
        <Card className="bg-slate-950/40 border-slate-800 text-slate-100 backdrop-blur-md">
          <CardHeader>
            <CardTitle className="text-lg font-bold flex items-center gap-2 text-slate-200">
              <Package className="h-5 w-5 text-emerald-500" /> Encomiendas Enviadas
            </CardTitle>
            <CardDescription className="text-slate-500">Historial de encomiendas registradas por este usuario como remitente</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg border border-slate-800 overflow-hidden">
              <Table>
                <TableHeader className="bg-slate-900/40 border-slate-800">
                  <TableRow className="border-slate-800 hover:bg-transparent">
                    <TableHead className="text-slate-400">Tracking ID</TableHead>
                    <TableHead className="text-slate-400">Destinatario</TableHead>
                    <TableHead className="text-slate-400">Cédula</TableHead>
                    <TableHead className="text-slate-400">Teléfono</TableHead>
                    <TableHead className="text-slate-400">Cooperativa</TableHead>
                    <TableHead className="text-slate-400">Estado</TableHead>
                    <TableHead className="text-slate-400 text-right">Costo</TableHead>
                    <TableHead className="text-slate-400 text-right">Fecha</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {usuario.encomiendas_enviadas.length === 0 ? (
                    <TableRow className="hover:bg-transparent border-slate-800">
                      <TableCell colSpan={8} className="h-24 text-center text-slate-500">
                        No se registraron encomiendas enviadas.
                      </TableCell>
                    </TableRow>
                  ) : (
                    usuario.encomiendas_enviadas.map((e) => (
                      <TableRow key={e.id} className="border-slate-800 hover:bg-slate-900/20">
                        <TableCell className="font-semibold text-slate-200 font-mono text-sm py-3">
                          {e.tracking_id}
                        </TableCell>
                        <TableCell className="text-slate-300 py-3">{e.receiver_nombre}</TableCell>
                        <TableCell className="text-slate-400 font-mono text-xs py-3">{e.receiver_cedula_rif}</TableCell>
                        <TableCell className="text-slate-400 py-3">{e.receiver_telefono}</TableCell>
                        <TableCell className="text-slate-300 py-3">{e.cooperativa_nombre}</TableCell>
                        <TableCell className="py-3">{getEncomiendaEstadoBadge(e.estado)}</TableCell>
                        <TableCell className="text-right text-slate-200 font-semibold py-3">
                          {formatCurrency(e.costo_calculado)}
                        </TableCell>
                        <TableCell className="text-right text-slate-400 text-sm py-3">
                          {new Date(e.created_at).toLocaleDateString("es-VE")}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Recibidas */}
        <Card className="bg-slate-950/40 border-slate-800 text-slate-100 backdrop-blur-md">
          <CardHeader>
            <CardTitle className="text-lg font-bold flex items-center gap-2 text-slate-200">
              <Package className="h-5 w-5 text-indigo-500" /> Encomiendas Recibidas
            </CardTitle>
            <CardDescription className="text-slate-500">Historial de encomiendas enviadas a este usuario (remitente de destino)</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg border border-slate-800 overflow-hidden">
              <Table>
                <TableHeader className="bg-slate-900/40 border-slate-800">
                  <TableRow className="border-slate-800 hover:bg-transparent">
                    <TableHead className="text-slate-400">Tracking ID</TableHead>
                    <TableHead className="text-slate-400">Remitente</TableHead>
                    <TableHead className="text-slate-400">Teléfono Remitente</TableHead>
                    <TableHead className="text-slate-400">Cooperativa</TableHead>
                    <TableHead className="text-slate-400">Estado</TableHead>
                    <TableHead className="text-slate-400 text-right">Costo</TableHead>
                    <TableHead className="text-slate-400 text-right">Fecha</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {usuario.encomiendas_recibidas.length === 0 ? (
                    <TableRow className="hover:bg-transparent border-slate-800">
                      <TableCell colSpan={7} className="h-24 text-center text-slate-500">
                        No se registraron encomiendas recibidas.
                      </TableCell>
                    </TableRow>
                  ) : (
                    usuario.encomiendas_recibidas.map((e) => (
                      <TableRow key={e.id} className="border-slate-800 hover:bg-slate-900/20">
                        <TableCell className="font-semibold text-slate-200 font-mono text-sm py-3">
                          {e.tracking_id}
                        </TableCell>
                        <TableCell className="text-slate-300 py-3">{e.sender_nombre || "N/A"}</TableCell>
                        <TableCell className="text-slate-400 py-3">{e.sender_telefono || "N/A"}</TableCell>
                        <TableCell className="text-slate-300 py-3">{e.cooperativa_nombre}</TableCell>
                        <TableCell className="py-3">{getEncomiendaEstadoBadge(e.estado)}</TableCell>
                        <TableCell className="text-right text-slate-200 font-semibold py-3">
                          {formatCurrency(e.costo_calculado)}
                        </TableCell>
                        <TableCell className="text-right text-slate-400 text-sm py-3">
                          {new Date(e.created_at).toLocaleDateString("es-VE")}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      {/* 3. BOLETOS */}
      <TabsContent value="boletos">
        <Card className="bg-slate-950/40 border-slate-800 text-slate-100 backdrop-blur-md">
          <CardHeader>
            <CardTitle className="text-lg font-bold flex items-center gap-2 text-slate-200">
              <Ticket className="h-5 w-5 text-emerald-500" /> Historial de Boletos
            </CardTitle>
            <CardDescription className="text-slate-500">Pasajes de viaje comprados o reservados por este usuario</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg border border-slate-800 overflow-hidden">
              <Table>
                <TableHeader className="bg-slate-900/40 border-slate-800">
                  <TableRow className="border-slate-800 hover:bg-transparent">
                    <TableHead className="text-slate-400">Código Boleto</TableHead>
                    <TableHead className="text-slate-400">Información del Viaje</TableHead>
                    <TableHead className="text-slate-400">Asiento</TableHead>
                    <TableHead className="text-slate-400">Cooperativa</TableHead>
                    <TableHead className="text-slate-400">Estado</TableHead>
                    <TableHead className="text-slate-400 text-right">Precio</TableHead>
                    <TableHead className="text-slate-400 text-right">Fecha Compra</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {usuario.boletos.length === 0 ? (
                    <TableRow className="hover:bg-transparent border-slate-800">
                      <TableCell colSpan={7} className="h-24 text-center text-slate-500">
                        No se encontraron boletos comprados.
                      </TableCell>
                    </TableRow>
                  ) : (
                    usuario.boletos.map((b) => (
                      <TableRow key={b.id} className="border-slate-800 hover:bg-slate-900/20">
                        <TableCell className="font-semibold text-slate-200 font-mono text-sm py-3">
                          {b.codigo_boleto}
                        </TableCell>
                        <TableCell className="text-slate-300 py-3">{b.viaje_info}</TableCell>
                        <TableCell className="text-slate-400 py-3 font-semibold text-center">{b.asiento}</TableCell>
                        <TableCell className="text-slate-300 py-3">{b.cooperativa_nombre}</TableCell>
                        <TableCell className="py-3">{getBoletoEstadoBadge(b.estado)}</TableCell>
                        <TableCell className="text-right text-slate-200 font-semibold py-3">
                          {formatCurrency(b.precio)}
                        </TableCell>
                        <TableCell className="text-right text-slate-400 text-sm py-3">
                          {new Date(b.created_at).toLocaleDateString("es-VE")}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      {/* 4. PAGOS */}
      <TabsContent value="pagos">
        <Card className="bg-slate-950/40 border-slate-800 text-slate-100 backdrop-blur-md">
          <CardHeader>
            <CardTitle className="text-lg font-bold flex items-center gap-2 text-slate-200">
              <CreditCard className="h-5 w-5 text-emerald-500" /> Transacciones de Pago
            </CardTitle>
            <CardDescription className="text-slate-500">Pagos ejecutados para encomiendas o compra de boletos</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg border border-slate-800 overflow-hidden">
              <Table>
                <TableHeader className="bg-slate-900/40 border-slate-800">
                  <TableRow className="border-slate-800 hover:bg-transparent">
                    <TableHead className="text-slate-400">Referencia de Pago</TableHead>
                    <TableHead className="text-slate-400">Recurso Relacionado</TableHead>
                    <TableHead className="text-slate-400">Tipo de Pago</TableHead>
                    <TableHead className="text-slate-400">Estado de Verificación</TableHead>
                    <TableHead className="text-slate-400 text-right">Monto</TableHead>
                    <TableHead className="text-slate-400 text-right">Fecha</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {usuario.pagos.length === 0 ? (
                    <TableRow className="hover:bg-transparent border-slate-800">
                      <TableCell colSpan={6} className="h-24 text-center text-slate-500">
                        No se registraron pagos.
                      </TableCell>
                    </TableRow>
                  ) : (
                    usuario.pagos.map((p) => (
                      <TableRow key={p.id} className="border-slate-800 hover:bg-slate-900/20">
                        <TableCell className="font-semibold text-slate-200 py-3 font-mono">
                          {p.numero_referencia || <span className="text-slate-600 italic">Efectivo / Sin ref</span>}
                        </TableCell>
                        <TableCell className="text-slate-300 py-3">
                          {p.encomienda_tracking_id && (
                            <span className="flex items-center gap-1.5 font-mono text-sm">
                              <Package className="h-3.5 w-3.5 text-emerald-500" /> Encomienda: {p.encomienda_tracking_id}
                            </span>
                          )}
                          {p.boleto_codigo && (
                            <span className="flex items-center gap-1.5 font-mono text-sm">
                              <Ticket className="h-3.5 w-3.5 text-sky-500" /> Boleto: {p.boleto_codigo}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-slate-400 py-3">
                          <Badge variant="outline" className="border-slate-800 bg-slate-900/40 text-slate-300">
                            {p.tipo_pago === "DIGITAL" ? "Pago Móvil / Transferencia" : "Efectivo"}
                          </Badge>
                        </TableCell>
                        <TableCell className="py-3">
                          {p.verificado ? (
                            <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 gap-1"><CheckCircle className="h-3 w-3" /> Verificado</Badge>
                          ) : (
                            <Badge className="bg-amber-500/10 text-amber-500 border-amber-500/20 gap-1"><WarningCircle className="h-3 w-3" /> Por Verificar</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right text-slate-200 font-semibold py-3">
                          {formatCurrency(p.monto)}
                        </TableCell>
                        <TableCell className="text-right text-slate-400 text-sm py-3">
                          {new Date(p.created_at).toLocaleDateString("es-VE")}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      {/* 5. NOTIFICACIONES */}
      <TabsContent value="notificaciones">
        <Card className="bg-slate-950/40 border-slate-800 text-slate-100 backdrop-blur-md">
          <CardHeader>
            <CardTitle className="text-lg font-bold flex items-center gap-2 text-slate-200">
              <Bell className="h-5 w-5 text-emerald-500" /> Historial de Envío de Notificaciones
            </CardTitle>
            <CardDescription className="text-slate-500">Historial de alertas y mensajes enviados al dispositivo o teléfono del usuario</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg border border-slate-800 overflow-hidden">
              <Table>
                <TableHeader className="bg-slate-900/40 border-slate-800">
                  <TableRow className="border-slate-800 hover:bg-transparent">
                    <TableHead className="text-slate-400">Título / Tipo</TableHead>
                    <TableHead className="text-slate-400">Canal</TableHead>
                    <TableHead className="text-slate-400">Mensaje / Contenido</TableHead>
                    <TableHead className="text-slate-400">Estado de Envío</TableHead>
                    <TableHead className="text-slate-400 text-right">Fecha</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {usuario.notificaciones.length === 0 ? (
                    <TableRow className="hover:bg-transparent border-slate-800">
                      <TableCell colSpan={5} className="h-24 text-center text-slate-500">
                        No se han registrado notificaciones enviadas a este usuario.
                      </TableCell>
                    </TableRow>
                  ) : (
                    usuario.notificaciones.map((n) => (
                      <TableRow key={n.id} className="border-slate-800 hover:bg-slate-900/20">
                        <TableCell className="font-semibold text-slate-200 py-3 max-w-[200px] truncate">
                          {n.titulo}
                        </TableCell>
                        <TableCell className="py-3">{getCanalBadge(n.canal)}</TableCell>
                        <TableCell className="text-slate-300 py-3 text-sm max-w-sm truncate" title={n.contenido}>
                          {n.contenido}
                        </TableCell>
                        <TableCell className="py-3">
                          {n.estado_envio === "ENVIADO" ? (
                            <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 gap-1"><PaperPlaneTilt className="h-3 w-3" /> Enviado</Badge>
                          ) : (
                            <Badge className="bg-destructive/10 text-destructive border-destructive/20 gap-1"><XCircle className="h-3 w-3" /> Fallido</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right text-slate-400 text-sm py-3">
                          {new Date(n.created_at).toLocaleString("es-VE")}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}
