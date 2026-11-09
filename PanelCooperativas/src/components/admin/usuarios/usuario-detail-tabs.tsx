"use client";

// ─── Ficha de un usuario (AD5-10, AD5-18, AD5-19, SY-29) ────────────────────
// Pestañas en `?tab=` con el contador en la pestaña. Las acciones del PIN van en
// la fila de cada encomienda.

import Link from "next/link";
import { Bell, CreditCard, Ticket } from "@phosphor-icons/react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import type { EncomiendaUsuario, PagoUsuario, UsuarioDetalle } from "@/lib/types/admin-usuarios";
import { MAX_FILAS_DETALLE_USUARIO, bajaPorCompletar } from "@/lib/types/admin-usuarios";
import { Monto } from "@/components/monto";
import { StatusBadge, TonoBadge } from "@/components/status-badge";
import { CeldaEnlace } from "@/components/celda-enlace";
import { FilaVacia } from "@/components/fila-vacia";
import { useParamUrl } from "@/hooks/use-param-url";
import { useTasaBCVAdmin } from "@/components/admin/dashboard/use-tasa-bcv-admin";
import { CLASE_PESTANA, ConteoPestana, Dato, TarjetaTabla, Vacio } from "@/components/admin/detalle";
import { documentoLegible, telefonoOVacio } from "@/components/admin/cooperativas/cooperativa-detail-tabs";
import { formatFechaHoraVE, formatFechaVE } from "@/lib/fechas";
import { formatNumeroVE } from "@/lib/dinero";
import { etiquetaMetodoPago, etiquetaRol } from "@/lib/estados";
import { formatCodigoBoleto } from "@/lib/artefactos.generated";
import type { Tono } from "@/lib/estados";
import { AccionesPinEncomienda, tieneAccionPin } from "./usuario-actions";

const PESTANAS = ["perfil", "encomiendas", "boletos", "pagos", "notificaciones"] as const;
type Pestana = (typeof PESTANAS)[number];

interface UsuarioDetailTabsProps {
  usuario: UsuarioDetalle;
}

const CANAL: Record<string, string> = {
  WHATSAPP: "WhatsApp",
  PUSH: "Notificación de la app",
  SMS: "SMS",
  EMAIL: "Correo",
};

const ENVIO: Record<string, { etiqueta: string; tono: Tono }> = {
  ENVIADO: { etiqueta: "Enviada", tono: "exito" },
  FALLBACK_SMS: { etiqueta: "Enviada por SMS", tono: "exito" },
  FALLIDO: { etiqueta: "No se envió", tono: "peligro" },
};

const ENLACE = "font-medium text-info-text underline-offset-4 hover:underline focus-visible:underline";

/** Pago Móvil, Transferencia, Zelle, Efectivo, Punto de venta (glosario); los pagos digitales viejos sin método, "Pago digital". */
function metodoDePago(p: PagoUsuario) {
  if (p.metodo_tipo) return etiquetaMetodoPago(p.metodo_tipo);
  return etiquetaMetodoPago(p.tipo_pago === "EFECTIVO" ? "EFECTIVO" : "DIGITAL");
}

function Preferencia({ titulo, activa }: { titulo: string; activa: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 py-3">
      <span className="text-sm">{titulo}</span>
      <TonoBadge tono={activa ? "exito" : "neutro"}>{activa ? "Activadas" : "Desactivadas"}</TonoBadge>
    </div>
  );
}

function TablaEncomiendas({
  lista,
  tipo,
  tasa,
}: {
  lista: EncomiendaUsuario[];
  tipo: "enviadas" | "recibidas";
  tasa: ReturnType<typeof useTasaBCVAdmin>;
}) {
  const conAcciones = lista.some(tieneAccionPin);
  const columnas = 6 + (conAcciones ? 1 : 0);
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Código de seguimiento</TableHead>
          <TableHead className="hidden md:table-cell">{tipo === "enviadas" ? "Destinatario" : "Remitente"}</TableHead>
          <TableHead className="hidden 2xl:table-cell">Cooperativa</TableHead>
          <TableHead>Estado</TableHead>
          <TableHead className="hidden text-right sm:table-cell">Costo</TableHead>
          <TableHead className="hidden 2xl:table-cell">Fecha</TableHead>
          {conAcciones && <TableHead className="text-right">Acciones</TableHead>}
        </TableRow>
      </TableHeader>
      <TableBody>
        {lista.length === 0 ? (
          <FilaVacia colSpan={columnas} titulo={tipo === "enviadas" ? "No ha enviado encomiendas" : "No ha recibido encomiendas"} />
        ) : (
          lista.map((e) => (
            <TableRow key={e.id} className="relative">
              <CeldaEnlace
                href={`/admin/encomiendas?codigo=${encodeURIComponent(e.tracking_id)}`}
                etiqueta={`Ver encomienda ${e.tracking_id}`}
                className="font-mono text-sm"
              >
                {e.tracking_id}
              </CeldaEnlace>
              <TableCell className="hidden md:table-cell">
                {tipo === "enviadas" ? (
                  <>
                    <span className="block">{e.receiver_nombre}</span>
                    <span className="block text-xs text-muted-foreground tabular-nums">
                      {documentoLegible(e.receiver_cedula_rif)} · {telefonoOVacio(e.receiver_telefono)}
                    </span>
                  </>
                ) : (
                  <>
                    <span className="block">{e.sender_nombre || <Vacio />}</span>
                    <span className="block text-xs text-muted-foreground">{telefonoOVacio(e.sender_telefono)}</span>
                  </>
                )}
              </TableCell>
              <TableCell className="hidden 2xl:table-cell">{e.cooperativa_nombre}</TableCell>
              <TableCell>
                <span className="flex flex-wrap items-center gap-1.5">
                  <StatusBadge status={e.estado} dominio="encomienda" />
                  {e.pin_bloqueado && <TonoBadge tono="peligro">PIN bloqueado</TonoBadge>}
                </span>
              </TableCell>
              <TableCell className="hidden text-right sm:table-cell">
                {e.costo_calculado > 0 ? (
                  <Monto usd={e.costo_calculado} tasa={tasa} moneda="USD" size="sm" align="right" />
                ) : (
                  <Vacio texto="Por calcular" />
                )}
              </TableCell>
              <TableCell className="hidden text-muted-foreground tabular-nums 2xl:table-cell">{formatFechaVE(e.created_at)}</TableCell>
              {conAcciones && (
                <TableCell>
                  <AccionesPinEncomienda encomienda={e} />
                </TableCell>
              )}
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
}

export function UsuarioDetailTabs({ usuario }: UsuarioDetailTabsProps) {
  // Montos en USD de referencia, con el equivalente en Bs a la tasa BCV de hoy.
  const tasa = useTasaBCVAdmin();
  const [valorTab, setTab] = useParamUrl("tab", "perfil");
  const tab: Pestana = (PESTANAS as readonly string[]).includes(valorTab) ? (valorTab as Pestana) : "perfil";
  // Contadores con el total real; cada lista trae solo los movimientos más recientes.
  const { totales } = usuario;
  const totalEncomiendas = totales.encomiendas_enviadas + totales.encomiendas_recibidas;
  // Cada lista trae solo los movimientos más recientes: se avisa si hay más.
  const recortada =
    totales.encomiendas_enviadas > usuario.encomiendas_enviadas.length ||
    totales.encomiendas_recibidas > usuario.encomiendas_recibidas.length ||
    totales.boletos > usuario.boletos.length ||
    totales.pagos > usuario.pagos.length ||
    totales.notificaciones > usuario.notificaciones.length;

  return (
    <Tabs value={tab} onValueChange={(v) => setTab(String(v))} className="gap-4">
      <TabsList aria-label="Secciones del usuario">
        <TabsTrigger value="perfil" className={CLASE_PESTANA}>Perfil</TabsTrigger>
        <TabsTrigger value="encomiendas" className={CLASE_PESTANA}>
          Encomiendas <ConteoPestana n={totalEncomiendas} />
        </TabsTrigger>
        <TabsTrigger value="boletos" className={CLASE_PESTANA}>
          Boletos <ConteoPestana n={totales.boletos} />
        </TabsTrigger>
        <TabsTrigger value="pagos" className={CLASE_PESTANA}>
          Pagos <ConteoPestana n={totales.pagos} />
        </TabsTrigger>
        <TabsTrigger value="notificaciones" className={CLASE_PESTANA}>
          Notificaciones <ConteoPestana n={totales.notificaciones} />
        </TabsTrigger>
      </TabsList>
      {recortada && (
        <p className="text-sm text-muted-foreground">
          Cada lista muestra los {formatNumeroVE(MAX_FILAS_DETALLE_USUARIO, 0)} movimientos más recientes.
        </p>
      )}

      {/* Perfil */}
      <TabsContent value="perfil">
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Datos de la cuenta</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
                <Dato etiqueta="Nombre y apellido">{usuario.nombre_completo}</Dato>
                <Dato etiqueta="Correo">{usuario.email || <Vacio texto="Sin correo" />}</Dato>
                <Dato etiqueta="Cédula">
                  <span className="font-mono">{documentoLegible(usuario.cedula_rif)}</span>
                </Dato>
                <Dato etiqueta="Teléfono">{telefonoOVacio(usuario.telefono)}</Dato>
                <Dato etiqueta="Rol">
                  <Badge variant="secondary">{etiquetaRol(usuario.role)}</Badge>
                </Dato>
                <Dato etiqueta="Cooperativa">
                  {usuario.cooperativa_id && usuario.cooperativa_nombre ? (
                    <Link href={`/admin/cooperativas/${usuario.cooperativa_id}`} className={ENLACE}>
                      {usuario.cooperativa_nombre}
                    </Link>
                  ) : (
                    <Vacio />
                  )}
                </Dato>
                <Dato etiqueta="Notificaciones en el teléfono">
                  {usuario.has_push_token ? "Teléfono registrado" : <Vacio texto="Sin teléfono registrado" />}
                </Dato>
                <Dato etiqueta="Registro">
                  <span className="tabular-nums">{formatFechaHoraVE(usuario.created_at)}</span>
                </Dato>
                {usuario.eliminada_at && (
                  <>
                    <Dato etiqueta="Eliminó su cuenta">
                      <span className="tabular-nums">{formatFechaHoraVE(usuario.eliminada_at)}</span>
                    </Dato>
                    <Dato etiqueta="Acceso">
                      {bajaPorCompletar(usuario) ? (
                        <TonoBadge tono="pendiente">Baja por completar</TonoBadge>
                      ) : usuario.baja?.auth_eliminada_at ? (
                        <span className="tabular-nums">Borrado el {formatFechaHoraVE(usuario.baja.auth_eliminada_at)}</span>
                      ) : (
                        <Vacio />
                      )}
                    </Dato>
                    {usuario.baja?.motivo && (
                      <Dato etiqueta="Motivo de la baja" className="sm:col-span-2">
                        {usuario.baja.motivo}
                      </Dato>
                    )}
                  </>
                )}
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Avisos que recibe</CardTitle>
            </CardHeader>
            <CardContent className="divide-y divide-border py-0">
              <Preferencia titulo="Boletos" activa={usuario.notif_boletos} />
              <Preferencia titulo="Encomiendas" activa={usuario.notif_encomiendas} />
              <Preferencia titulo="Recordatorios" activa={usuario.notif_recordatorios} />
            </CardContent>
          </Card>
        </div>
      </TabsContent>

      {/* Encomiendas */}
      <TabsContent value="encomiendas" className="flex flex-col gap-4">
        <TarjetaTabla titulo="Enviadas">
          <TablaEncomiendas lista={usuario.encomiendas_enviadas} tipo="enviadas" tasa={tasa} />
        </TarjetaTabla>
        <TarjetaTabla titulo="Recibidas">
          <TablaEncomiendas lista={usuario.encomiendas_recibidas} tipo="recibidas" tasa={tasa} />
        </TarjetaTabla>
      </TabsContent>

      {/* Boletos */}
      <TabsContent value="boletos">
        <Card className="gap-0 overflow-hidden p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Código</TableHead>
                <TableHead className="hidden md:table-cell">Viaje</TableHead>
                <TableHead>Asiento</TableHead>
                <TableHead className="hidden lg:table-cell">Cooperativa</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="hidden text-right sm:table-cell">Precio</TableHead>
                <TableHead className="hidden md:table-cell">Compra</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {usuario.boletos.length === 0 ? (
                <FilaVacia colSpan={7} icon={Ticket} titulo="No ha comprado boletos" />
              ) : (
                usuario.boletos.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell className="font-mono text-sm text-foreground">{formatCodigoBoleto(b.codigo_boleto)}</TableCell>
                    <TableCell className="hidden max-w-64 truncate md:table-cell">{b.viaje_info}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="font-mono">{b.asiento}</Badge>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">{b.cooperativa_nombre}</TableCell>
                    <TableCell>
                      <StatusBadge status={b.estado} dominio="boleto" />
                    </TableCell>
                    <TableCell className="hidden text-right sm:table-cell">
                      <Monto usd={b.precio} tasa={tasa} moneda="USD" size="sm" align="right" />
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground tabular-nums md:table-cell">{formatFechaVE(b.created_at)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </Card>
      </TabsContent>

      {/* Pagos */}
      <TabsContent value="pagos">
        <Card className="gap-0 overflow-hidden p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Referencia</TableHead>
                <TableHead>Para</TableHead>
                <TableHead className="hidden md:table-cell">Método</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Monto</TableHead>
                <TableHead className="hidden md:table-cell">Fecha</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {usuario.pagos.length === 0 ? (
                <FilaVacia colSpan={6} icon={CreditCard} titulo="No ha registrado pagos" />
              ) : (
                usuario.pagos.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-mono text-sm">
                      {p.numero_referencia || <span className="font-sans text-muted-foreground">Sin referencia</span>}
                    </TableCell>
                    <TableCell>
                      {p.encomienda_tracking_id && (
                        <>
                          <span className="block font-mono text-sm">{p.encomienda_tracking_id}</span>
                          <span className="block text-xs text-muted-foreground">Encomienda</span>
                        </>
                      )}
                      {p.boleto_codigo && (
                        <>
                          <span className="block font-mono text-sm">{formatCodigoBoleto(p.boleto_codigo)}</span>
                          <span className="block text-xs text-muted-foreground">Boleto</span>
                        </>
                      )}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">{metodoDePago(p)}</TableCell>
                    <TableCell className="whitespace-normal">
                      <StatusBadge status={p.estado_verificacion} dominio="pago" />
                      {p.estado_verificacion === "RECHAZADO" && p.motivo_rechazo && (
                        <p className="mt-1 max-w-56 text-xs text-muted-foreground">{p.motivo_rechazo}</p>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {p.monto_bs != null ? (
                        // Pago con Bs registrados: lo que se cobró, a la tasa de ese pago.
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
                    <TableCell className="hidden text-muted-foreground tabular-nums md:table-cell">{formatFechaVE(p.created_at)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </Card>
      </TabsContent>

      {/* Notificaciones */}
      <TabsContent value="notificaciones">
        <Card className="gap-0 overflow-hidden p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Aviso</TableHead>
                <TableHead className="hidden md:table-cell">Canal</TableHead>
                <TableHead>Envío</TableHead>
                <TableHead className="hidden md:table-cell">Fecha</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {usuario.notificaciones.length === 0 ? (
                <FilaVacia colSpan={4} icon={Bell} titulo="No le hemos enviado avisos" />
              ) : (
                usuario.notificaciones.map((n) => {
                  const envio = ENVIO[n.estado_envio] ?? { etiqueta: "En cola", tono: "pendiente" as Tono };
                  return (
                    <TableRow key={n.id}>
                      <TableCell className="max-w-md">
                        <span className="block truncate font-medium">{n.titulo}</span>
                        <span className="block truncate text-xs text-muted-foreground" title={n.contenido}>
                          {n.contenido}
                        </span>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">{CANAL[n.canal] ?? n.canal}</TableCell>
                      <TableCell>
                        <TonoBadge tono={envio.tono}>{envio.etiqueta}</TonoBadge>
                      </TableCell>
                      <TableCell className="hidden text-muted-foreground tabular-nums md:table-cell">
                        {formatFechaHoraVE(n.created_at)}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </Card>
      </TabsContent>
    </Tabs>
  );
}
