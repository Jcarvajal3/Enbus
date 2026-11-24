"use client";

// ─── Actividad de una cooperativa (super admin) ─────────────────────────────
// Cifras de la cabecera y las listas de viajes, boletos, encomiendas y pagos.
// Cada lista llega paginada y filtrada desde el servidor: el estado, las fechas
// y la página viven en la URL (`?estado=&desde=&hasta=&pagina=`).

import { Bus, Coins, CreditCard, Package, Ticket } from "@phosphor-icons/react";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge, TonoBadge } from "@/components/status-badge";
import { CeldaEnlace } from "@/components/celda-enlace";
import { EntityCard } from "@/components/entity-card";
import { IconTile } from "@/components/icon-tile";
import { KpiCard } from "@/components/kpi-card";
import { ListaResponsive } from "@/components/lista-responsive";
import { FilaVacia } from "@/components/fila-vacia";
import { BarraFiltros } from "@/components/barra-filtros";
import { PaginacionTabla } from "@/components/paginacion-tabla";
import { Monto } from "@/components/monto";
import { ErrorRefrescar } from "@/components/admin/error-refrescar";
import { Vacio } from "@/components/admin/detalle";
import { useTasaBCVAdmin } from "@/components/admin/dashboard/use-tasa-bcv-admin";
import { PARAM_PAGINA, useParamUrl } from "@/hooks/use-param-url";
import {
  ESTADOS_BOLETO,
  ESTADOS_ENCOMIENDA,
  ESTADOS_PAGO,
  ESTADOS_VIAJE,
  type ActividadPestana,
  type BoletoActividad,
  type EncomiendaActividad,
  type PaginaActividad,
  type PagoActividad,
  type ResumenActividad,
  type ViajeActividad,
} from "@/lib/types/admin-cooperativa-actividad";
import { etiquetaEstado, etiquetaMetodoPago } from "@/lib/estados";
import { formatCiudad } from "@/lib/ciudades";
import { formatBs, formatNumeroVE, formatUsd } from "@/lib/dinero";
import { formatFechaHoraVE, formatFechaVE } from "@/lib/fechas";
import { formatCodigoBoleto } from "@/lib/artefactos.generated";
import { documentoOGuion } from "@/lib/mostrar";

const CARD_TABLA = "gap-0 overflow-hidden p-0 max-md:overflow-visible max-md:bg-transparent max-md:shadow-none";
const CONTENEDOR_VACIO = "max-md:rounded-xl max-md:bg-card max-md:shadow-card";

/** Un conteo o "—" si la consulta falló (nunca un 0 engañoso). */
function n(v: number | null): string {
  return v === null ? "—" : formatNumeroVE(v, 0);
}

function ruta(origen: string | null, destino: string | null): string {
  if (!origen || !destino) return "Sin datos de la ruta";
  return `${formatCiudad(origen)} → ${formatCiudad(destino)}`;
}

// ─── Cifras ─────────────────────────────────────────────────────────────────

/** Cifras clave de la cooperativa: ventas, operación y dinero verificado. */
export function ResumenActividadCards({ resumen }: { resumen: ResumenActividad }) {
  return (
    <div className="grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-5">
      <KpiCard
        title="Ingresos verificados"
        icon={Coins}
        tono="mint"
        value={resumen.ingresos_usd === null ? "—" : formatUsd(resumen.ingresos_usd)}
        detail={
          resumen.ingresos_bs ? `${formatBs(resumen.ingresos_bs)} cobrados en bolívares` : undefined
        }
        description="Pagos ya aprobados"
      />
      <KpiCard
        title="Boletos vendidos"
        icon={Ticket}
        value={n(resumen.boletos_vendidos)}
        description="Pagados o ya usados"
      />
      <KpiCard
        title="Viajes"
        icon={Bus}
        value={n(resumen.viajes_total)}
        description={resumen.viajes_proximos === null ? undefined : `${formatNumeroVE(resumen.viajes_proximos, 0)} por salir`}
      />
      <KpiCard
        title="Encomiendas"
        icon={Package}
        tono="coral"
        value={n(resumen.encomiendas_total)}
        description={
          resumen.encomiendas_en_curso === null ? undefined : `${formatNumeroVE(resumen.encomiendas_en_curso, 0)} en curso`
        }
      />
      <KpiCard
        title="Pagos"
        icon={CreditCard}
        value={n(resumen.pagos_total)}
        variant={resumen.pagos_por_verificar ? "warning" : "default"}
        description={
          resumen.pagos_por_verificar === null
            ? undefined
            : resumen.pagos_por_verificar > 0
              ? `${formatNumeroVE(resumen.pagos_por_verificar, 0)} por verificar`
              : "Todos verificados"
        }
      />
    </div>
  );
}

// ─── Estructura común de las listas ─────────────────────────────────────────

function opciones(estados: readonly string[], dominio: Parameters<typeof etiquetaEstado>[0]) {
  return estados.map((valor) => ({ valor, etiqueta: etiquetaEstado(dominio, valor) }));
}

function ListaPaginada<T>({
  datos,
  filtroEstados,
  filtroTitulo,
  etiquetaFechas,
  vacio,
  columnas,
  icon,
  tono = "neutral",
  clave,
  tabla,
  tarjeta,
  etiqueta,
}: {
  datos: PaginaActividad<T>;
  filtroEstados: { valor: string; etiqueta: string }[];
  filtroTitulo: string;
  etiquetaFechas: string;
  vacio: string;
  columnas: number;
  icon: React.ComponentProps<typeof FilaVacia>["icon"];
  tono?: React.ComponentProps<typeof FilaVacia>["tono"];
  clave(item: T): string;
  tabla(items: T[]): React.ReactNode;
  tarjeta(item: T): React.ReactNode;
  etiqueta: string;
}) {
  const [, setPagina] = useParamUrl(PARAM_PAGINA, "1");
  const paginas = Math.max(1, Math.ceil(datos.total / datos.porPagina));
  const pagina = Math.min(datos.pagina, paginas);
  const desde = datos.filas.length ? (pagina - 1) * datos.porPagina + 1 : 0;
  const hasta = desde ? desde + datos.filas.length - 1 : 0;

  return (
    <div className="flex flex-col gap-4">
      <BarraFiltros
        selects={[{ param: "estado", etiqueta: filtroTitulo, opciones: filtroEstados, todas: "Todos" }]}
        fechas={[
          { param: "desde", etiqueta: `${etiquetaFechas} desde` },
          { param: "hasta", etiqueta: `${etiquetaFechas} hasta` },
        ]}
      />

      {datos.error ? (
        <ErrorRefrescar titulo={`No pudimos cargar ${etiqueta.toLowerCase()}`} descripcion={datos.error} />
      ) : (
        <>
          <p className="text-[13px] text-muted-foreground tabular-nums" aria-live="polite">
            {datos.total === 0
              ? "Sin resultados"
              : `Mostrando ${formatNumeroVE(desde, 0)}–${formatNumeroVE(hasta, 0)} de ${formatNumeroVE(datos.total, 0)}`}
          </p>
          <Card className={CARD_TABLA}>
            <ListaResponsive
              items={datos.filas}
              clave={clave}
              etiqueta={etiqueta}
              vacio={
                <div className={CONTENEDOR_VACIO}>
                  <Table>
                    <TableBody>
                      <FilaVacia colSpan={columnas} icon={icon} tono={tono} titulo={vacio} />
                    </TableBody>
                  </Table>
                </div>
              }
              tarjeta={tarjeta}
              tabla={tabla}
            />
            <PaginacionTabla
              pagina={pagina}
              paginas={paginas}
              onCambio={(p) => setPagina(p <= 1 ? null : String(Math.min(p, paginas)))}
            />
          </Card>
        </>
      )}
    </div>
  );
}

// ─── Viajes ─────────────────────────────────────────────────────────────────

function PestanaViajes({ datos }: { datos: PaginaActividad<ViajeActividad> }) {
  const ocupados = (v: ViajeActividad) => Math.max(0, v.asientos_totales - v.asientos_disponibles);
  return (
    <ListaPaginada
      datos={datos}
      filtroEstados={opciones(ESTADOS_VIAJE, "viaje")}
      filtroTitulo="Estado del viaje"
      etiquetaFechas="Salida"
      vacio="No hay viajes con estos filtros"
      columnas={5}
      icon={Bus}
      etiqueta="Viajes"
      clave={(v) => v.id}
      tarjeta={(v) => (
        <EntityCard
          leading={<IconTile icon={Bus} tone="sky" />}
          title={ruta(v.ciudad_origen, v.ciudad_destino)}
          subtitle={[v.numero_unidad, v.nombre_chofer].filter(Boolean).join(" · ") || "Sin unidad asignada"}
          lineasSubtitulo={2}
          adorno={
            <span className="text-[15px] font-medium tabular-nums">
              {ocupados(v)}/{v.asientos_totales}
              <span className="sr-only"> asientos ocupados</span>
            </span>
          }
          badge={<StatusBadge status={v.estado} dominio="viaje" />}
          meta={formatFechaHoraVE(v.salida)}
        />
      )}
      tabla={(items) => (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Ruta</TableHead>
              <TableHead>Salida</TableHead>
              <TableHead className="hidden lg:table-cell">Unidad y chofer</TableHead>
              <TableHead className="text-right">Asientos ocupados</TableHead>
              <TableHead>Estado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((v) => (
              <TableRow key={v.id}>
                <TableCell className="font-medium">{ruta(v.ciudad_origen, v.ciudad_destino)}</TableCell>
                <TableCell className="tabular-nums">{formatFechaHoraVE(v.salida)}</TableCell>
                <TableCell className="hidden lg:table-cell">
                  <span className="block">{v.numero_unidad || <Vacio texto="Sin unidad" />}</span>
                  <span className="block text-[13px] text-muted-foreground">{v.nombre_chofer || "Sin chofer"}</span>
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {ocupados(v)} <span className="text-muted-foreground">de {v.asientos_totales}</span>
                </TableCell>
                <TableCell>
                  <StatusBadge status={v.estado} dominio="viaje" />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    />
  );
}

// ─── Boletos ────────────────────────────────────────────────────────────────

function PestanaBoletos({ datos }: { datos: PaginaActividad<BoletoActividad> }) {
  const tasa = useTasaBCVAdmin();
  return (
    <ListaPaginada
      datos={datos}
      filtroEstados={opciones(ESTADOS_BOLETO, "boleto")}
      filtroTitulo="Estado del boleto"
      etiquetaFechas="Compra"
      vacio="No hay boletos con estos filtros"
      columnas={6}
      icon={Ticket}
      etiqueta="Boletos"
      clave={(b) => b.id}
      tarjeta={(b) => (
        <EntityCard
          leading={<IconTile icon={Ticket} tone="sky" />}
          title={formatCodigoBoleto(b.codigo_boleto)}
          subtitle={`${b.pasajero_nombre || "Pasajero sin nombre"} · ${ruta(b.ciudad_origen, b.ciudad_destino)}`}
          lineasSubtitulo={2}
          adorno={<Monto usd={b.precio} tasa={tasa} moneda="USD" size="sm" align="right" />}
          badge={<StatusBadge status={b.estado} dominio="boleto" />}
          meta={`Asiento ${b.asiento}`}
        />
      )}
      tabla={(items) => (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Código</TableHead>
              <TableHead>Pasajero</TableHead>
              <TableHead className="hidden lg:table-cell">Viaje</TableHead>
              <TableHead>Asiento</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="text-right">Precio</TableHead>
              <TableHead className="hidden xl:table-cell">Compra</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((b) => (
              <TableRow key={b.id}>
                <TableCell className="font-mono text-[15px] text-foreground">{formatCodigoBoleto(b.codigo_boleto)}</TableCell>
                <TableCell>
                  <span className="block">{b.pasajero_nombre || <Vacio texto="Sin nombre" />}</span>
                  <span className="block font-mono text-[13px] text-muted-foreground">{documentoOGuion(b.pasajero_cedula)}</span>
                </TableCell>
                <TableCell className="hidden lg:table-cell">
                  <span className="block">{ruta(b.ciudad_origen, b.ciudad_destino)}</span>
                  {b.salida && <span className="block text-[13px] text-muted-foreground tabular-nums">{formatFechaHoraVE(b.salida)}</span>}
                </TableCell>
                <TableCell>
                  <TonoBadge tono="neutro" className="font-mono">{b.asiento}</TonoBadge>
                </TableCell>
                <TableCell>
                  <StatusBadge status={b.estado} dominio="boleto" />
                </TableCell>
                <TableCell className="text-right">
                  <Monto usd={b.precio} tasa={tasa} moneda="USD" size="sm" align="right" />
                </TableCell>
                <TableCell className="hidden text-muted-foreground tabular-nums xl:table-cell">{formatFechaVE(b.created_at)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    />
  );
}

// ─── Encomiendas ────────────────────────────────────────────────────────────

function PestanaEncomiendas({ datos }: { datos: PaginaActividad<EncomiendaActividad> }) {
  const tasa = useTasaBCVAdmin();
  const hrefDe = (e: EncomiendaActividad) => `/admin/encomiendas?codigo=${encodeURIComponent(e.tracking_id)}`;
  return (
    <ListaPaginada
      datos={datos}
      filtroEstados={opciones(ESTADOS_ENCOMIENDA, "encomienda")}
      filtroTitulo="Estado de la encomienda"
      etiquetaFechas="Registro"
      vacio="No hay encomiendas con estos filtros"
      columnas={6}
      icon={Package}
      tono="coral"
      etiqueta="Encomiendas"
      clave={(e) => e.id}
      tarjeta={(e) => (
        <EntityCard
          href={hrefDe(e)}
          etiqueta={`Ver encomienda ${e.tracking_id}`}
          leading={<IconTile icon={Package} tone="coral" />}
          title={e.tracking_id}
          subtitle={`${formatCiudad(e.ciudad_origen)} → ${formatCiudad(e.ciudad_destino)}`}
          adorno={
            e.costo && e.costo > 0 ? <Monto usd={e.costo} tasa={tasa} moneda="USD" size="sm" align="right" /> : undefined
          }
          badge={
            <span className="flex flex-wrap items-center gap-1.5">
              <StatusBadge status={e.estado} dominio="encomienda" />
              {e.pin_bloqueado && <TonoBadge tono="peligro">PIN bloqueado</TonoBadge>}
            </span>
          }
          meta={formatFechaVE(e.created_at)}
        />
      )}
      tabla={(items) => (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Código de seguimiento</TableHead>
              <TableHead>Ruta</TableHead>
              <TableHead className="hidden lg:table-cell">Remitente y destinatario</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="text-right">Costo</TableHead>
              <TableHead className="hidden xl:table-cell">Registro</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((e) => (
              <TableRow key={e.id} className="relative">
                <CeldaEnlace href={hrefDe(e)} etiqueta={`Ver encomienda ${e.tracking_id}`} className="font-mono text-[15px]">
                  {e.tracking_id}
                </CeldaEnlace>
                <TableCell>
                  {formatCiudad(e.ciudad_origen)} → {formatCiudad(e.ciudad_destino)}
                </TableCell>
                <TableCell className="hidden lg:table-cell">
                  <span className="block">{e.remitente || <Vacio texto="Sin dato" />}</span>
                  <span className="block text-[13px] text-muted-foreground">para {e.destinatario}</span>
                </TableCell>
                <TableCell>
                  <span className="flex flex-wrap items-center gap-1.5">
                    <StatusBadge status={e.estado} dominio="encomienda" />
                    {e.pin_bloqueado && <TonoBadge tono="peligro">PIN bloqueado</TonoBadge>}
                  </span>
                </TableCell>
                <TableCell className="text-right">
                  {e.costo && e.costo > 0 ? (
                    <Monto usd={e.costo} tasa={tasa} moneda="USD" size="sm" align="right" />
                  ) : (
                    <Vacio texto="Por calcular" />
                  )}
                </TableCell>
                <TableCell className="hidden text-muted-foreground tabular-nums xl:table-cell">{formatFechaVE(e.created_at)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    />
  );
}

// ─── Pagos ──────────────────────────────────────────────────────────────────

/** Pago Móvil, Transferencia, Zelle, Efectivo, Punto de venta; los digitales viejos sin método, "Pago digital". */
function metodoDe(p: PagoActividad): string {
  if (p.metodo_tipo) return etiquetaMetodoPago(p.metodo_tipo);
  return etiquetaMetodoPago(p.tipo_pago === "EFECTIVO" ? "EFECTIVO" : "DIGITAL");
}

function MontoPago({ p }: { p: PagoActividad }) {
  return p.monto_bs != null ? (
    <Monto
      usd={p.monto}
      bs={p.monto_bs}
      tasa={p.tasa_bcv && p.tasa_bcv_fecha ? { tasa: p.tasa_bcv, fecha: p.tasa_bcv_fecha } : null}
      moneda={p.moneda}
      size="sm"
      align="right"
    />
  ) : (
    // Anterior a la conversión a Bs: solo hay referencia en USD.
    <Monto usd={p.monto} tasa={null} moneda="USD" size="sm" align="right" />
  );
}

function PestanaPagos({ datos }: { datos: PaginaActividad<PagoActividad> }) {
  const paraQue = (p: PagoActividad) =>
    p.encomienda_tracking_id
      ? `Encomienda ${p.encomienda_tracking_id}`
      : p.boleto_codigo
        ? `Boleto ${formatCodigoBoleto(p.boleto_codigo)}`
        : "Pago";
  return (
    <ListaPaginada
      datos={datos}
      filtroEstados={opciones(ESTADOS_PAGO, "pago")}
      filtroTitulo="Estado del pago"
      etiquetaFechas="Registro"
      vacio="No hay pagos con estos filtros"
      columnas={6}
      icon={CreditCard}
      etiqueta="Pagos"
      clave={(p) => p.id}
      tarjeta={(p) => (
        <EntityCard
          leading={<IconTile icon={CreditCard} tone="mint" />}
          title={p.numero_referencia || "Sin referencia"}
          subtitle={`${paraQue(p)} · ${metodoDe(p)}`}
          lineasSubtitulo={2}
          adorno={<MontoPago p={p} />}
          badge={<StatusBadge status={p.estado_verificacion} dominio="pago" />}
          meta={formatFechaVE(p.created_at)}
        />
      )}
      tabla={(items) => (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Referencia</TableHead>
              <TableHead>Para</TableHead>
              <TableHead className="hidden md:table-cell">Método</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="text-right">Monto</TableHead>
              <TableHead className="hidden xl:table-cell">Registro</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="font-mono text-[15px]">
                  {p.numero_referencia || <span className="font-sans text-muted-foreground">Sin referencia</span>}
                </TableCell>
                <TableCell>
                  {p.encomienda_tracking_id && (
                    <>
                      <span className="block font-mono text-[15px]">{p.encomienda_tracking_id}</span>
                      <span className="block text-[13px] text-muted-foreground">Encomienda</span>
                    </>
                  )}
                  {p.boleto_codigo && (
                    <>
                      <span className="block font-mono text-[15px]">{formatCodigoBoleto(p.boleto_codigo)}</span>
                      <span className="block text-[13px] text-muted-foreground">Boleto</span>
                    </>
                  )}
                </TableCell>
                <TableCell className="hidden md:table-cell">{metodoDe(p)}</TableCell>
                <TableCell>
                  <StatusBadge status={p.estado_verificacion} dominio="pago" />
                </TableCell>
                <TableCell className="text-right">
                  <MontoPago p={p} />
                </TableCell>
                <TableCell className="hidden text-muted-foreground tabular-nums xl:table-cell">{formatFechaVE(p.created_at)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    />
  );
}

// ─── Entrada ────────────────────────────────────────────────────────────────

/** La lista de la pestaña abierta (la página solo carga esa). */
export function ActividadCooperativa({ actividad }: { actividad: ActividadPestana }) {
  switch (actividad.tab) {
    case "viajes":
      return <PestanaViajes datos={actividad.datos} />;
    case "boletos":
      return <PestanaBoletos datos={actividad.datos} />;
    case "encomiendas":
      return <PestanaEncomiendas datos={actividad.datos} />;
    case "pagos":
      return <PestanaPagos datos={actividad.datos} />;
  }
}
