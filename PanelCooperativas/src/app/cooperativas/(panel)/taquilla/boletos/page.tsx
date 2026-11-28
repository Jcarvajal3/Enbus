"use client";

// ─── Taquilla de boletos ────────────────────────────────────────────────────
// Venta y lista de boletos (el embarque vive en su propia sección, Embarque).
// La pestaña de estado (`?estado=`), el día (`?fecha=`), la página y el viaje
// abierto en su hoja (`?boleto=`) viven en la URL.

import { Suspense, useEffect, useState, useCallback, useMemo, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button, buttonVariants } from "@/components/ui/button";
import { useUser } from "@/hooks/use-user";
import { useCambiarParams, useParamUrl } from "@/hooks/use-param-url";
import { createClient } from "@/lib/supabase/client";
import { Plus } from "@phosphor-icons/react";
import type { Boleto, EstadoBoleto } from "@/lib/types/boletos";
import { getEstadoUiBoleto, type EstadoUiBoleto, type PagoResumen } from "@/lib/types/pagos";
import { rutaCobrar, rutaVender } from "@/components/boletos/venta/tipos";
import { BoletoSheet } from "@/components/boletos/boleto-sheet";
import { VerificarPagoDialog } from "@/components/pagos/verificar-pago-dialog";
import { Monto } from "@/components/monto";
import { CeldaEnlace } from "@/components/celda-enlace";
import { ErrorState } from "@/components/error-state";
import { EmptyState } from "@/components/empty-state";
import { EntityCard } from "@/components/entity-card";
import { ListaResponsive } from "@/components/lista-responsive";
import { IconTile, type IconTileTone } from "@/components/icon-tile";
import { TablaSkeleton } from "@/components/tabla-skeleton";
import { BarraFiltros, TabsUrl } from "@/components/barra-filtros";
import { PaginacionTabla, usePaginacion } from "@/components/paginacion-tabla";
import { avisarError } from "@/lib/avisos";
import { humanizeError } from "@/lib/errores";
import { etiquetaEstado } from "@/lib/estados";
import { formatDiaVE, formatFechaHoraCortaVE, formatHoraVE, rangoDiaVE } from "@/lib/fechas";
import { ICONO_SECCION } from "@/lib/navigation";
import { formatCiudad } from "@/lib/ciudades";
import { formatCedula } from "@/lib/ve";
import { formatCodigoBoleto } from "@/lib/artefactos.generated";

const LIMITE = 100;
const COLUMNAS = 7;

type BoletoRow = Boleto & {
  comprador?: { nombre_completo: string } | null;
  pago?: PagoResumen | PagoResumen[] | null;
};

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Pestañas de estado (PN-08): valor = estado visible del boleto. */
const PESTANAS_ESTADO: Array<{ valor: string; etiqueta: string }> = [
  { valor: "todos", etiqueta: "Todos" },
  ...(["RESERVA_SIN_PAGAR", "PAGO_EN_VERIFICACION", "PAGADO", "USADO"] as const).map((e) => ({
    valor: e,
    etiqueta: etiquetaEstado("boleto", e),
  })),
];

/** Estado guardado en la base para cada pestaña (las dos de reserva se separan por el pago). */
const ESTADO_BD: Record<string, EstadoBoleto> = {
  RESERVA_SIN_PAGAR: "RESERVADO",
  PAGO_EN_VERIFICACION: "RESERVADO",
  PAGADO: "PAGADO",
  USADO: "USADO",
};

function pagoDe(b: BoletoRow): PagoResumen | null {
  return (Array.isArray(b.pago) ? b.pago[0] : b.pago) ?? null;
}

function estadoUiDe(b: BoletoRow): EstadoUiBoleto {
  return getEstadoUiBoleto(b.estado as EstadoBoleto, pagoDe(b)?.estado_verificacion ?? null);
}

const TONO_ESTADO_UI: Partial<Record<EstadoUiBoleto, IconTileTone>> = {
  PAGADO: "success",
  USADO: "neutral",
  RESERVA_SIN_PAGAR: "warning",
  PAGO_EN_VERIFICACION: "info",
  PAGO_RECHAZADO: "danger",
};

function datosFila(boleto: BoletoRow) {
  const origen = formatCiudad(boleto.viaje?.ruta?.ciudad_origen);
  const destino = formatCiudad(boleto.viaje?.ruta?.ciudad_destino);
  return {
    rutaString: origen && destino ? `${origen} → ${destino}` : "Ruta desconocida",
    salida: boleto.viaje?.fecha_hora_salida ?? null,
    nombrePasajero: boleto.pasajero_nombre || boleto.comprador?.nombre_completo || "Sin nombre",
    ui: estadoUiDe(boleto),
    pago: pagoDe(boleto),
    codigo: formatCodigoBoleto(boleto.codigo_boleto),
    viajeId: boleto.viaje?.id ?? null,
  };
}

// ─── Página ─────────────────────────────────────────────────────────────────

export default function TaquillaBoletosPage() {
  // useSearchParams (?estado=, ?fecha=, ?viaje=) necesita un límite de Suspense (Next.js 16).
  return (
    <Suspense
      fallback={
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-8">
          <Skeleton className="h-8 w-56" />
          <TablaSkeleton columnas={COLUMNAS} conFiltros />
        </div>
      }
    >
      <TaquillaBoletos />
    </Suspense>
  );
}

function TaquillaBoletos() {
  const { user } = useUser();
  const cooperativaId = user.cooperativa_id!;
  const supabase = useMemo(() => createClient(), []);

  const [boletos, setBoletos] = useState<BoletoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);

  // Filtros y viaje abierto en la URL
  const [estadoUrl] = useParamUrl("estado", "todos");
  const filtroEstado = PESTANAS_ESTADO.some((p) => p.valor === estadoUrl) ? estadoUrl : "todos";
  const [fechaUrl] = useParamUrl("fecha");
  const filtroFecha = FECHA_RE.test(fechaUrl) ? fechaUrl : "";
  const [boletoAbierto] = useParamUrl("boleto");
  const cambiarParams = useCambiarParams();
  const abrirBoleto = (id: string | null) => cambiarParams({ boleto: id }, { conservarPagina: true });

  const router = useRouter();
  const [pagoAVerificar, setPagoAVerificar] = useState<string | null>(null);

  // Última carga: una respuesta vieja (otro filtro) no pisa la de una carga posterior.
  const cargaRef = useRef(0);
  const fetchBoletos = useCallback(async () => {
    const carga = ++cargaRef.current;
    setLoading(true);
    setErrorCarga(null);
    try {
      let query = supabase
        .from("boletos")
        .select(`
          id, codigo_boleto, asiento, precio, estado, created_at, compra_id, reserva_expira_at,
          pasajero_nombre, pasajero_cedula, pasajero_telefono, embarcado_at,
          comprador:profiles!comprador_id(nombre_completo),
          viaje:viajes!viaje_id(
            id,
            fecha_hora_salida,
            numero_unidad,
            ruta:rutas!ruta_id(ciudad_origen, estado_origen, ciudad_destino, estado_destino)
          ),
          pago:pagos!boletos_pago_id_fkey(id, estado_verificacion, tipo_pago, monto, monto_bs, moneda)
        `)
        .eq("cooperativa_id", cooperativaId)
        .order("created_at", { ascending: false })
        .limit(LIMITE);

      if (filtroEstado !== "todos") {
        query = query.eq("estado", ESTADO_BD[filtroEstado]);
      }

      if (filtroFecha) {
        // Filtra por la fecha de SALIDA del viaje (no por la de venta), con el día
        // completo en hora de Venezuela.
        const { desde, hasta } = rangoDiaVE(filtroFecha);
        const { data: viajesDia, error: viajesError } = await supabase
          .from("viajes")
          .select("id")
          .eq("cooperativa_id", cooperativaId)
          .gte("fecha_hora_salida", desde)
          .lte("fecha_hora_salida", hasta);

        if (viajesError) throw viajesError;
        if (carga !== cargaRef.current) return;
        const viajeIds = (viajesDia ?? []).map((v: { id: string }) => v.id);
        if (viajeIds.length === 0) {
          setBoletos([]);
          return;
        }
        query = query.in("viaje_id", viajeIds);
      }

      const { data, error } = await query;
      if (carga !== cargaRef.current) return;
      if (error) throw error;
      let filas = data as unknown as BoletoRow[];
      // "Reserva sin pagar" y "Pago por verificar" comparten estado en la base: los separa el pago.
      if (filtroEstado === "RESERVA_SIN_PAGAR" || filtroEstado === "PAGO_EN_VERIFICACION") {
        filas = filas.filter((b) => estadoUiDe(b) === filtroEstado);
      }
      setBoletos(filas);
    } catch (err) {
      console.error(err);
      if (carga === cargaRef.current) setErrorCarga(humanizeError(err, "cargar los boletos"));
    } finally {
      if (carga === cargaRef.current) setLoading(false);
    }
  }, [supabase, cooperativaId, filtroEstado, filtroFecha]);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    void fetchBoletos();
  }, [fetchBoletos]);
  /* eslint-enable react-hooks/set-state-in-effect */

  /** Cobrar una reserva de la app: página propia, por la compra del boleto. */
  const cobrarBoleto = (boletoId: string) => {
    const compraId = boletos.find((b) => b.id === boletoId)?.compra_id;
    if (!compraId) {
      avisarError("No pudimos abrir el cobro de esta reserva. Actualiza la lista e inténtalo de nuevo.");
      return;
    }
    router.push(rutaCobrar(compraId));
  };

  const { visibles, pagina, paginas, ir } = usePaginacion(boletos);
  const hayFiltros = filtroEstado !== "todos" || Boolean(filtroFecha);

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-8">
      <PageHeader
        title="Taquilla de boletos"
        principal={
          <Link href={rutaVender()} className={buttonVariants({ size: "lg" })}>
            <Plus aria-hidden />
            Vender boletos
          </Link>
        }
        // El embarque se mudó a su propia sección: enlace discreto para quien lo buscaba aquí.
        // El enlace a Embarque solo sale en escritorio (en móvil no hay botón ni menú "Más").
        secundarias={[
          { etiqueta: "Ir a Embarque", icono: ICONO_SECCION.embarque, href: "/cooperativas/embarque", soloEscritorio: true },
        ]}
      />

      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <TabsUrl param="estado" defecto="todos" opciones={PESTANAS_ESTADO} />
          <BarraFiltros fechas={[{ param: "fecha", etiqueta: "Fecha del viaje" }]} />
        </div>

        {loading && boletos.length === 0 ? (
          <TablaSkeleton columnas={COLUMNAS} />
        ) : (
          <Card className="gap-0 overflow-hidden p-0 max-md:overflow-visible max-md:bg-transparent max-md:shadow-none">
            {errorCarga ? (
              <ErrorState titulo="No pudimos cargar los boletos" descripcion={errorCarga} onReintentar={fetchBoletos} />
            ) : (
              <>
                <ListaResponsive
                  items={visibles}
                  clave={(b) => b.id}
                  etiqueta="Boletos"
                  vacio={
                    <EmptyState
                      icon={ICONO_SECCION.taquillaBoletos}
                      title={hayFiltros ? "No hay boletos con estos filtros" : "Todavía no hay boletos"}
                      action={
                        hayFiltros ? undefined : (
                          <Link href={rutaVender()} className={buttonVariants({ variant: "outline" })}>
                            <Plus aria-hidden />
                            Vender boletos
                          </Link>
                        )
                      }
                    />
                  }
                  tabla={(items) => (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Código</TableHead>
                          <TableHead>Viaje</TableHead>
                          <TableHead>Pasajero</TableHead>
                          <TableHead>Asiento</TableHead>
                          <TableHead>Estado</TableHead>
                          <TableHead className="hidden text-right xl:table-cell">Precio</TableHead>
                          <TableHead className="text-right">Acciones</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {items.map((boleto) => {
                          const d = datosFila(boleto);
                          return (
                            <TableRow key={boleto.id} className="relative">
                              <CeldaEnlace
                                onAbrir={() => abrirBoleto(boleto.id)}
                                etiqueta={`Ver el boleto ${d.codigo}`}
                                className="font-mono text-[13px]"
                              >
                                {d.codigo}
                              </CeldaEnlace>
                              <TableCell>
                                <div className="flex flex-col">
                                  <span className="font-medium">{d.rutaString}</span>
                                  {d.salida && (
                                    <span className="text-[13px] text-muted-foreground tabular-nums">{formatFechaHoraCortaVE(d.salida)}</span>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell>
                                <div className="flex flex-col">
                                  <span>{d.nombrePasajero}</span>
                                  {boleto.pasajero_cedula && (
                                    <span className="text-[13px] text-muted-foreground">{formatCedula(boleto.pasajero_cedula)}</span>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell>
                                <Badge variant="outline" className="font-mono tabular-nums">
                                  {boleto.asiento}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <div className="flex flex-col items-start gap-1">
                                  <StatusBadge status={d.ui} dominio="boleto" />
                                  {d.ui === "RESERVA_SIN_PAGAR" && boleto.reserva_expira_at && (
                                    <span className="text-xs text-muted-foreground tabular-nums">
                                      Vence {formatHoraVE(boleto.reserva_expira_at)}
                                    </span>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell className="hidden text-right xl:table-cell">
                                <Monto usd={boleto.precio} align="right" size="sm" />
                              </TableCell>
                              <TableCell className="text-right">
                                {d.ui === "PAGO_EN_VERIFICACION" && d.pago && (
                                  <Button size="sm" variant="outline" className="relative z-10" onClick={() => setPagoAVerificar(d.pago!.id)}>
                                    Verificar pago
                                  </Button>
                                )}
                                {(d.ui === "RESERVA_SIN_PAGAR" || d.ui === "PAGO_RECHAZADO") && (
                                  <Link
                                    href={rutaCobrar(boleto.compra_id ?? "")}
                                    className={buttonVariants({ size: "sm", variant: "outline", className: "relative z-10" })}
                                  >
                                    Cobrar
                                  </Link>
                                )}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  )}
                  tarjeta={(boleto) => {
                    const d = datosFila(boleto);
                    const porVerificar = d.ui === "PAGO_EN_VERIFICACION" && d.pago;
                    const porCobrar = d.ui === "RESERVA_SIN_PAGAR" || d.ui === "PAGO_RECHAZADO";
                    return (
                      <EntityCard
                          onClick={() => abrirBoleto(boleto.id)}
                          chevron
                          leading={<IconTile icon={ICONO_SECCION.taquillaBoletos} tone={TONO_ESTADO_UI[d.ui] ?? "sky"} />}
                          title={d.rutaString}
                          subtitle={[d.nombrePasajero, d.salida ? formatFechaHoraCortaVE(d.salida) : null].filter(Boolean).join(" · ")}
                          lineasSubtitulo={2}
                          adorno={<Badge variant="outline" className="font-mono tabular-nums">{boleto.asiento}</Badge>}
                          badge={<StatusBadge status={d.ui} dominio="boleto" />}
                          meta={
                            d.ui === "RESERVA_SIN_PAGAR" && boleto.reserva_expira_at
                              ? `Vence ${formatHoraVE(boleto.reserva_expira_at)}`
                              : d.codigo
                          }
                          etiqueta={`Boleto ${d.codigo}, asiento ${boleto.asiento}, ${d.nombrePasajero}`}
                          acciones={
                            porVerificar ? (
                              <Button variant="outline" onClick={() => setPagoAVerificar(d.pago!.id)}>
                                Verificar pago
                              </Button>
                            ) : porCobrar ? (
                              <Link href={rutaCobrar(boleto.compra_id ?? "")} className={buttonVariants({ variant: "outline" })}>
                                Cobrar
                              </Link>
                            ) : undefined
                          }
                        />
                    );
                  }}
                />
                <PaginacionTabla pagina={pagina} paginas={paginas} onCambio={ir} />
              </>
            )}
          </Card>
        )}
        {!loading && boletos.length >= LIMITE && (
          <p className="text-[13px] text-muted-foreground">
            Últimos {LIMITE} boletos{filtroFecha ? ` del ${formatDiaVE(filtroFecha)}` : ""}. Filtra por fecha para ver otros.
          </p>
        )}
      </div>

      {pagoAVerificar && (
        <VerificarPagoDialog
          pagoId={pagoAVerificar}
          open
          onOpenChange={(abierto) => !abierto && setPagoAVerificar(null)}
          onResuelto={() => void fetchBoletos()}
        />
      )}

      <BoletoSheet
        boleto={boletos.find((b) => b.id === boletoAbierto) ?? null}
        onOpenChange={(abierto) => !abierto && abrirBoleto(null)}
        onVerificarPago={setPagoAVerificar}
        onCobrar={cobrarBoleto}
      />
    </div>
  );
}
