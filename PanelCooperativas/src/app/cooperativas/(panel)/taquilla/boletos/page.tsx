"use client";

// ─── Taquilla de boletos ────────────────────────────────────────────────────
// Venta y lista de boletos (el embarque vive en su propia sección, Embarque).
// La pestaña de estado (`?estado=`), el día (`?fecha=`), la página y el viaje
// abierto en su hoja (`?viaje=`) viven en la URL.

import { Suspense, useEffect, useState, useCallback, useMemo, useRef } from "react";
import Link from "next/link";
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
import { VentaFlow, CobrarReservaDialog } from "@/components/boletos/venta-flow";
import { ViajeSheet } from "@/components/viajes/viaje-sheet";
import { VerificarPagoDialog } from "@/components/pagos/verificar-pago-dialog";
import { Monto } from "@/components/monto";
import { CeldaEnlace } from "@/components/celda-enlace";
import { ErrorState } from "@/components/error-state";
import { FilaVacia } from "@/components/fila-vacia";
import { TablaSkeleton } from "@/components/tabla-skeleton";
import { BarraFiltros, TabsUrl } from "@/components/barra-filtros";
import { PaginacionTabla, usePaginacion } from "@/components/paginacion-tabla";
import { humanizeError } from "@/lib/errores";
import { etiquetaEstado } from "@/lib/estados";
import { formatDiaVE, formatFechaHoraCortaVE, formatHoraVE, rangoDiaVE } from "@/lib/fechas";
import { ICONO_SECCION } from "@/lib/navigation";
import { formatCiudad } from "@/lib/ciudades";
import { formatCedula } from "@/lib/ve";
import { formatCodigoBoleto } from "@/lib/artefactos.generated";
import { cn } from "@/lib/utils";

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

// ─── Página ─────────────────────────────────────────────────────────────────

export default function TaquillaBoletosPage() {
  // useSearchParams (?estado=, ?fecha=, ?viaje=) necesita un límite de Suspense (Next.js 16).
  return (
    <Suspense
      fallback={
        <div className="flex flex-col gap-6">
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
  const [viajeAbierto] = useParamUrl("viaje");
  const cambiarParams = useCambiarParams();
  const abrirViaje = (id: string | null) => cambiarParams({ viaje: id }, { conservarPagina: true });

  const [showVentaFlow, setShowVentaFlow] = useState(false);
  const [ventaViajeInicial, setVentaViajeInicial] = useState<string | null>(null);
  const [pagoAVerificar, setPagoAVerificar] = useState<string | null>(null);
  const [reservaACobrar, setReservaACobrar] = useState<string | null>(null);

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
          pasajero_nombre, pasajero_cedula,
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

  const abrirVenta = (viajeId: string | null = null) => {
    setVentaViajeInicial(viajeId);
    setShowVentaFlow(true);
  };

  const { visibles, pagina, paginas, ir } = usePaginacion(boletos);
  const hayFiltros = filtroEstado !== "todos" || Boolean(filtroFecha);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Taquilla de boletos">
        {/* El embarque se mudó a su propia sección: enlace discreto para quien lo buscaba aquí. */}
        <Link href="/cooperativas/embarque" className={buttonVariants({ variant: "ghost" })}>
          <ICONO_SECCION.embarque aria-hidden />
          Ir a Embarque
        </Link>
        <Button onClick={() => abrirVenta()}>
          <ICONO_SECCION.taquillaBoletos aria-hidden />
          Vender boletos
        </Button>
      </PageHeader>

      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <TabsUrl param="estado" defecto="todos" opciones={PESTANAS_ESTADO} />
          <BarraFiltros fechas={[{ param: "fecha", etiqueta: "Fecha del viaje" }]} />
        </div>

        {loading && boletos.length === 0 ? (
          <TablaSkeleton columnas={COLUMNAS} />
        ) : (
          <Card className="gap-0 overflow-hidden p-0">
            {errorCarga ? (
              <ErrorState titulo="No pudimos cargar los boletos" descripcion={errorCarga} onReintentar={fetchBoletos} />
            ) : (
              <>
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
                    {boletos.length === 0 ? (
                      <FilaVacia
                        colSpan={COLUMNAS}
                        icon={ICONO_SECCION.taquillaBoletos}
                        titulo={hayFiltros ? "No hay boletos con estos filtros" : "Todavía no hay boletos"}
                        accion={
                          hayFiltros ? undefined : (
                            <Button onClick={() => abrirVenta()}>
                              <Plus aria-hidden />
                              Vender boletos
                            </Button>
                          )
                        }
                      />
                    ) : (
                      visibles.map((boleto) => {
                        const origen = formatCiudad(boleto.viaje?.ruta?.ciudad_origen);
                        const destino = formatCiudad(boleto.viaje?.ruta?.ciudad_destino);
                        const rutaString = origen && destino ? `${origen} → ${destino}` : "Ruta desconocida";
                        const salida = boleto.viaje?.fecha_hora_salida ?? null;
                        const nombrePasajero = boleto.pasajero_nombre || boleto.comprador?.nombre_completo || "Sin nombre";
                        const ui = estadoUiDe(boleto);
                        const pago = pagoDe(boleto);
                        const codigo = formatCodigoBoleto(boleto.codigo_boleto);
                        const viajeId = boleto.viaje?.id ?? null;

                        return (
                          <TableRow key={boleto.id} className={cn(viajeId && "relative")}>
                            {viajeId ? (
                              <CeldaEnlace
                                onAbrir={() => abrirViaje(viajeId)}
                                etiqueta={`Ver el viaje del boleto ${codigo}`}
                                className="font-mono text-sm"
                              >
                                {codigo}
                              </CeldaEnlace>
                            ) : (
                              <TableCell className="font-mono text-sm text-foreground">{codigo}</TableCell>
                            )}
                            <TableCell>
                              <div className="flex flex-col">
                                <span className="font-medium">{rutaString}</span>
                                {salida && (
                                  <span className="text-xs text-muted-foreground tabular-nums">{formatFechaHoraCortaVE(salida)}</span>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-col">
                                <span>{nombrePasajero}</span>
                                {boleto.pasajero_cedula && (
                                  <span className="text-xs text-muted-foreground">{formatCedula(boleto.pasajero_cedula)}</span>
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
                                <StatusBadge status={ui} dominio="boleto" />
                                {ui === "RESERVA_SIN_PAGAR" && boleto.reserva_expira_at && (
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
                              {ui === "PAGO_EN_VERIFICACION" && pago && (
                                <Button size="sm" variant="outline" className="relative z-10" onClick={() => setPagoAVerificar(pago.id)}>
                                  Verificar pago
                                </Button>
                              )}
                              {(ui === "RESERVA_SIN_PAGAR" || ui === "PAGO_RECHAZADO") && (
                                <Button size="sm" variant="outline" className="relative z-10" onClick={() => setReservaACobrar(boleto.id)}>
                                  Cobrar
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
                <PaginacionTabla pagina={pagina} paginas={paginas} onCambio={ir} />
              </>
            )}
          </Card>
        )}
        {!loading && boletos.length >= LIMITE && (
          <p className="text-sm text-muted-foreground">
            Últimos {LIMITE} boletos{filtroFecha ? ` del ${formatDiaVE(filtroFecha)}` : ""}. Filtra por fecha para ver otros.
          </p>
        )}
      </div>

      <VentaFlow
        isOpen={showVentaFlow}
        viajeIdInicial={ventaViajeInicial}
        onClose={() => {
          setShowVentaFlow(false);
          setVentaViajeInicial(null);
          void fetchBoletos();
        }}
      />

      <CobrarReservaDialog
        boletoId={reservaACobrar}
        open={!!reservaACobrar}
        onOpenChange={(abierto) => !abierto && setReservaACobrar(null)}
        onCobrado={() => void fetchBoletos()}
      />

      {pagoAVerificar && (
        <VerificarPagoDialog
          pagoId={pagoAVerificar}
          open
          onOpenChange={(abierto) => !abierto && setPagoAVerificar(null)}
          onResuelto={() => void fetchBoletos()}
        />
      )}

      <ViajeSheet
        viajeId={viajeAbierto || null}
        onOpenChange={(abierto) => !abierto && abrirViaje(null)}
        onCambio={() => void fetchBoletos()}
      />
    </div>
  );
}
