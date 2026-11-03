"use client";

import Link from "next/link";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Bell, CreditCard, Envelope, IdentificationCard, Package, Phone, Ticket, User } from "@phosphor-icons/react";
import type { PagoUsuario, UsuarioDetalle } from "@/lib/types/admin-usuarios";
import { Monto } from "@/components/monto";
import { StatusBadge } from "@/components/status-badge";
import { formatFechaHoraVE, formatFechaVE } from "@/lib/fechas";
import { formatCedula, formatTelefono } from "@/lib/ve";
import { etiquetaMetodoPago, etiquetaRol } from "@/lib/estados";
import { useTasaBCVAdmin } from "@/components/admin/dashboard/use-tasa-bcv-admin";

interface UsuarioDetailTabsProps {
  usuario: UsuarioDetalle;
}

const CANAL: Record<string, string> = {
  WHATSAPP: "WhatsApp",
  PUSH: "Notificación de la app",
  SMS: "SMS",
  EMAIL: "Correo",
};

const CLASE_ENLACE = "text-foreground underline decoration-primary underline-offset-4";

/** Cédula o teléfono legibles; si no son válidos (datos viejos o 'PENDIENTE-…') se muestra el texto guardado o "Sin dato". */
function cedulaLegible(v: string | null | undefined) {
  if (!v || v.toUpperCase().startsWith("PENDIENTE")) return "Sin dato";
  const f = formatCedula(v);
  return f === "—" ? v : f;
}
function telefonoLegible(v: string | null | undefined) {
  if (!v || v.toUpperCase().startsWith("PENDIENTE")) return "Sin dato";
  const f = formatTelefono(v);
  return f === "—" ? v : f;
}

/** Pago Móvil, Transferencia, Zelle, Efectivo (glosario); los pagos digitales viejos sin método, "Pago digital". */
function metodoDePago(p: PagoUsuario) {
  if (p.metodo_tipo) return etiquetaMetodoPago(p.metodo_tipo);
  return etiquetaMetodoPago(p.tipo_pago === "EFECTIVO" ? "EFECTIVO" : "DIGITAL");
}

function Dato({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <span className="text-xs font-medium text-muted-foreground">{etiqueta}</span>
      <div className="flex items-center gap-2 text-sm font-medium text-foreground">{children}</div>
    </div>
  );
}

function Preferencia({ titulo, activa, ayuda }: { titulo: string; activa: boolean; ayuda: string }) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">{titulo}</span>
        <Badge variant={activa ? "secondary" : "outline"}>{activa ? "Activadas" : "Desactivadas"}</Badge>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">{ayuda}</p>
    </Card>
  );
}

function FilaVacia({ columnas, texto }: { columnas: number; texto: string }) {
  return (
    <TableRow className="hover:bg-transparent">
      <TableCell colSpan={columnas} className="h-24 text-center text-muted-foreground">
        {texto}
      </TableCell>
    </TableRow>
  );
}

export function UsuarioDetailTabs({ usuario }: UsuarioDetailTabsProps) {
  // Montos en USD de referencia, con el equivalente en Bs a la tasa BCV de hoy.
  const tasa = useTasaBCVAdmin();
  const totalEncomiendas = usuario.encomiendas_enviadas.length + usuario.encomiendas_recibidas.length;

  return (
    <Tabs defaultValue="perfil" className="w-full space-y-4">
      <TabsList className="flex h-auto flex-wrap gap-1">
        <TabsTrigger value="perfil">
          <User className="mr-2 h-4 w-4" aria-hidden /> Perfil
        </TabsTrigger>
        <TabsTrigger value="encomiendas">
          <Package className="mr-2 h-4 w-4" aria-hidden /> Encomiendas ({totalEncomiendas})
        </TabsTrigger>
        <TabsTrigger value="boletos">
          <Ticket className="mr-2 h-4 w-4" aria-hidden /> Boletos ({usuario.boletos.length})
        </TabsTrigger>
        <TabsTrigger value="pagos">
          <CreditCard className="mr-2 h-4 w-4" aria-hidden /> Pagos ({usuario.pagos.length})
        </TabsTrigger>
        <TabsTrigger value="notificaciones">
          <Bell className="mr-2 h-4 w-4" aria-hidden /> Notificaciones ({usuario.notificaciones.length})
        </TabsTrigger>
      </TabsList>

      {/* 1. Perfil */}
      <TabsContent value="perfil">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl font-bold">
              <User className="h-5 w-5 text-muted-foreground" aria-hidden /> Perfil
            </CardTitle>
            <CardDescription>Datos personales y preferencias de la cuenta.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
              <Dato etiqueta="Nombre y apellido">{usuario.nombre_completo}</Dato>
              <Dato etiqueta="Correo">
                <Envelope className="h-4 w-4 text-muted-foreground" aria-hidden />
                {usuario.email || <span className="text-muted-foreground">Sin correo</span>}
              </Dato>
              <Dato etiqueta="Cédula o RIF">
                <IdentificationCard className="h-4 w-4 text-muted-foreground" aria-hidden />
                <span className="font-mono">{cedulaLegible(usuario.cedula_rif)}</span>
              </Dato>
              <Dato etiqueta="Teléfono">
                <Phone className="h-4 w-4 text-muted-foreground" aria-hidden />
                {telefonoLegible(usuario.telefono)}
              </Dato>
              <Dato etiqueta="Rol">
                <Badge variant="secondary">{etiquetaRol(usuario.role)}</Badge>
              </Dato>
              <Dato etiqueta="Cooperativa">
                {usuario.cooperativa_id && usuario.cooperativa_nombre ? (
                  <Link href={`/admin/cooperativas/${usuario.cooperativa_id}`} className={CLASE_ENLACE}>
                    {usuario.cooperativa_nombre}
                  </Link>
                ) : (
                  <span className="text-muted-foreground">Ninguna</span>
                )}
              </Dato>
              <Dato etiqueta="Notificaciones en el teléfono">
                {usuario.has_push_token ? "Teléfono registrado" : <span className="text-muted-foreground">Sin teléfono registrado</span>}
              </Dato>
              <Dato etiqueta="Fecha de registro">{formatFechaHoraVE(usuario.created_at)}</Dato>
            </div>

            <div className="border-t pt-6">
              <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold">
                <Bell className="h-4 w-4 text-muted-foreground" aria-hidden /> Preferencias de notificación
              </h3>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <Preferencia
                  titulo="Encomiendas"
                  activa={usuario.notif_encomiendas}
                  ayuda="Avisos de recepción, viaje y entrega de sus encomiendas."
                />
                <Preferencia
                  titulo="Boletos"
                  activa={usuario.notif_boletos}
                  ayuda="Avisos de compras, pagos y cambios en sus boletos."
                />
                <Preferencia
                  titulo="Recordatorios"
                  activa={usuario.notif_recordatorios}
                  ayuda="Recordatorios de viajes próximos y retiros pendientes."
                />
              </div>
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      {/* 2. Encomiendas */}
      <TabsContent value="encomiendas" className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg font-bold">
              <Package className="h-5 w-5 text-muted-foreground" aria-hidden /> Enviadas
            </CardTitle>
            <CardDescription>Encomiendas que registró como remitente.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-hidden rounded-lg border">
              <Table>
                <TableHeader className="bg-muted/50">
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Código de seguimiento</TableHead>
                    <TableHead>Destinatario</TableHead>
                    <TableHead>Cédula</TableHead>
                    <TableHead>Teléfono</TableHead>
                    <TableHead>Cooperativa</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="text-right">Costo</TableHead>
                    <TableHead className="text-right">Fecha</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {usuario.encomiendas_enviadas.length === 0 ? (
                    <FilaVacia columnas={8} texto="No ha enviado encomiendas." />
                  ) : (
                    usuario.encomiendas_enviadas.map((e) => (
                      <TableRow key={e.id}>
                        <TableCell className="py-3 font-mono text-sm font-semibold">
                          <Link href={`/admin/encomiendas?codigo=${encodeURIComponent(e.tracking_id)}`} className={CLASE_ENLACE}>
                            {e.tracking_id}
                          </Link>
                        </TableCell>
                        <TableCell className="py-3">{e.receiver_nombre}</TableCell>
                        <TableCell className="py-3 font-mono text-xs text-muted-foreground">{cedulaLegible(e.receiver_cedula_rif)}</TableCell>
                        <TableCell className="py-3 text-muted-foreground">{telefonoLegible(e.receiver_telefono)}</TableCell>
                        <TableCell className="py-3">{e.cooperativa_nombre}</TableCell>
                        <TableCell className="py-3">
                          <StatusBadge status={e.estado} dominio="encomienda" />
                          {e.pin_bloqueado && <p className="mt-1 text-xs text-destructive-text">PIN bloqueado</p>}
                        </TableCell>
                        <TableCell className="py-3 text-right font-semibold">
                          {e.costo_calculado > 0 ? (
                            <Monto usd={e.costo_calculado} tasa={tasa} moneda="USD" size="sm" align="right" />
                          ) : (
                            <span className="text-xs text-muted-foreground">Por pesar</span>
                          )}
                        </TableCell>
                        <TableCell className="py-3 text-right text-sm text-muted-foreground">{formatFechaVE(e.created_at)}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg font-bold">
              <Package className="h-5 w-5 text-muted-foreground" aria-hidden /> Recibidas
            </CardTitle>
            <CardDescription>Encomiendas que otra persona le envió.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-hidden rounded-lg border">
              <Table>
                <TableHeader className="bg-muted/50">
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Código de seguimiento</TableHead>
                    <TableHead>Remitente</TableHead>
                    <TableHead>Teléfono del remitente</TableHead>
                    <TableHead>Cooperativa</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="text-right">Costo</TableHead>
                    <TableHead className="text-right">Fecha</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {usuario.encomiendas_recibidas.length === 0 ? (
                    <FilaVacia columnas={7} texto="No ha recibido encomiendas." />
                  ) : (
                    usuario.encomiendas_recibidas.map((e) => (
                      <TableRow key={e.id}>
                        <TableCell className="py-3 font-mono text-sm font-semibold">
                          <Link href={`/admin/encomiendas?codigo=${encodeURIComponent(e.tracking_id)}`} className={CLASE_ENLACE}>
                            {e.tracking_id}
                          </Link>
                        </TableCell>
                        <TableCell className="py-3">{e.sender_nombre || "Sin dato"}</TableCell>
                        <TableCell className="py-3 text-muted-foreground">{telefonoLegible(e.sender_telefono)}</TableCell>
                        <TableCell className="py-3">{e.cooperativa_nombre}</TableCell>
                        <TableCell className="py-3">
                          <StatusBadge status={e.estado} dominio="encomienda" />
                          {e.pin_bloqueado && <p className="mt-1 text-xs text-destructive-text">PIN bloqueado</p>}
                        </TableCell>
                        <TableCell className="py-3 text-right font-semibold">
                          {e.costo_calculado > 0 ? (
                            <Monto usd={e.costo_calculado} tasa={tasa} moneda="USD" size="sm" align="right" />
                          ) : (
                            <span className="text-xs text-muted-foreground">Por pesar</span>
                          )}
                        </TableCell>
                        <TableCell className="py-3 text-right text-sm text-muted-foreground">{formatFechaVE(e.created_at)}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      {/* 3. Boletos */}
      <TabsContent value="boletos">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg font-bold">
              <Ticket className="h-5 w-5 text-muted-foreground" aria-hidden /> Boletos
            </CardTitle>
            <CardDescription>Boletos que compró o apartó.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-hidden rounded-lg border">
              <Table>
                <TableHeader className="bg-muted/50">
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Código</TableHead>
                    <TableHead>Viaje</TableHead>
                    <TableHead className="text-center">Asiento</TableHead>
                    <TableHead>Cooperativa</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="text-right">Precio</TableHead>
                    <TableHead className="text-right">Fecha de compra</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {usuario.boletos.length === 0 ? (
                    <FilaVacia columnas={7} texto="No ha comprado boletos." />
                  ) : (
                    usuario.boletos.map((b) => (
                      <TableRow key={b.id}>
                        <TableCell className="py-3 font-mono text-sm font-semibold">{b.codigo_boleto}</TableCell>
                        <TableCell className="py-3">{b.viaje_info}</TableCell>
                        <TableCell className="py-3 text-center font-semibold">{b.asiento}</TableCell>
                        <TableCell className="py-3">{b.cooperativa_nombre}</TableCell>
                        <TableCell className="py-3">
                          <StatusBadge status={b.estado} dominio="boleto" />
                        </TableCell>
                        <TableCell className="py-3 text-right font-semibold">
                          <Monto usd={b.precio} tasa={tasa} moneda="USD" size="sm" align="right" />
                        </TableCell>
                        <TableCell className="py-3 text-right text-sm text-muted-foreground">{formatFechaVE(b.created_at)}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      {/* 4. Pagos */}
      <TabsContent value="pagos">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg font-bold">
              <CreditCard className="h-5 w-5 text-muted-foreground" aria-hidden /> Pagos
            </CardTitle>
            <CardDescription>Pagos que registró por boletos o encomiendas.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-hidden rounded-lg border">
              <Table>
                <TableHeader className="bg-muted/50">
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Referencia</TableHead>
                    <TableHead>Para</TableHead>
                    <TableHead>Método</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="text-right">Monto</TableHead>
                    <TableHead className="text-right">Fecha</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {usuario.pagos.length === 0 ? (
                    <FilaVacia columnas={6} texto="No ha registrado pagos." />
                  ) : (
                    usuario.pagos.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell className="py-3 font-mono font-semibold">
                          {p.numero_referencia || <span className="font-sans font-normal text-muted-foreground">Sin referencia</span>}
                        </TableCell>
                        <TableCell className="py-3">
                          {p.encomienda_tracking_id && (
                            <span className="flex items-center gap-1.5 font-mono text-sm">
                              <Package className="h-3.5 w-3.5 text-muted-foreground" aria-hidden /> {p.encomienda_tracking_id}
                            </span>
                          )}
                          {p.boleto_codigo && (
                            <span className="flex items-center gap-1.5 font-mono text-sm">
                              <Ticket className="h-3.5 w-3.5 text-muted-foreground" aria-hidden /> {p.boleto_codigo}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="py-3">{metodoDePago(p)}</TableCell>
                        <TableCell className="py-3">
                          <StatusBadge status={p.estado_verificacion} dominio="pago" />
                          {p.estado_verificacion === "RECHAZADO" && p.motivo_rechazo && (
                            <p className="mt-1 max-w-[220px] text-xs text-muted-foreground">Motivo: {p.motivo_rechazo}</p>
                          )}
                        </TableCell>
                        <TableCell className="py-3 text-right font-semibold">
                          {p.monto_bs != null ? (
                            // Pago con Bs registrados: se muestra lo que se cobró, a la tasa de ese pago.
                            <Monto
                              usd={p.monto}
                              bs={p.monto_bs}
                              tasa={p.tasa_bcv && p.tasa_bcv_fecha ? { tasa: p.tasa_bcv, fecha: p.tasa_bcv_fecha } : null}
                              moneda={p.moneda}
                              size="sm"
                              align="right"
                            />
                          ) : (
                            // Pago anterior a la conversión a Bs: solo hay referencia en USD.
                            <Monto usd={p.monto} tasa={null} moneda="USD" size="sm" align="right" />
                          )}
                        </TableCell>
                        <TableCell className="py-3 text-right text-sm text-muted-foreground">{formatFechaVE(p.created_at)}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      {/* 5. Notificaciones */}
      <TabsContent value="notificaciones">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg font-bold">
              <Bell className="h-5 w-5 text-muted-foreground" aria-hidden /> Notificaciones enviadas
            </CardTitle>
            <CardDescription>Avisos que EnBus le envió por la app, WhatsApp, SMS o correo.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-hidden rounded-lg border">
              <Table>
                <TableHeader className="bg-muted/50">
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Título</TableHead>
                    <TableHead>Canal</TableHead>
                    <TableHead>Mensaje</TableHead>
                    <TableHead>Envío</TableHead>
                    <TableHead className="text-right">Fecha</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {usuario.notificaciones.length === 0 ? (
                    <FilaVacia columnas={5} texto="No le hemos enviado notificaciones." />
                  ) : (
                    usuario.notificaciones.map((n) => (
                      <TableRow key={n.id}>
                        <TableCell className="max-w-[200px] truncate py-3 font-semibold">{n.titulo}</TableCell>
                        <TableCell className="py-3">
                          <Badge variant="outline">{CANAL[n.canal] ?? n.canal}</Badge>
                        </TableCell>
                        <TableCell className="max-w-sm truncate py-3 text-sm" title={n.contenido}>
                          {n.contenido}
                        </TableCell>
                        <TableCell className="py-3">
                          {n.estado_envio === "ENVIADO" ? (
                            <Badge variant="secondary">Enviada</Badge>
                          ) : (
                            <Badge variant="outline" className="border-destructive/40 text-destructive-text">
                              No se envió
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="py-3 text-right text-sm text-muted-foreground">{formatFechaHoraVE(n.created_at)}</TableCell>
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
