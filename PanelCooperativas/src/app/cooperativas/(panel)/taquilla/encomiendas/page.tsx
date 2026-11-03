"use client";

// ─── Taquilla de encomiendas ────────────────────────────────────────────────
// Orden en el mostrador: recepción (pesar) → foto del paquete → cobro (solo si
// paga quien envía). Lo mismo para el alta de un cliente sin la app
// ("Nueva encomienda"). La pestaña de estado (`?estado=`, p. ej. PAGADA = "Lista
// para despacho"), la página y la encomienda abierta en su detalle
// (`?encomienda=<id>`) viven en la URL.

import { Suspense, useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { Plus, Printer } from "@phosphor-icons/react";
import { PageHeader } from "@/components/page-header";
import { ScanInput } from "@/components/scan-input";
import { UltimoEscaneo, useUltimoEscaneo } from "@/components/ultimo-escaneo";
import { CeldaEnlace } from "@/components/celda-enlace";
import { StatusBadge, TonoBadge } from "@/components/status-badge";
import { ErrorState } from "@/components/error-state";
import { FilaVacia } from "@/components/fila-vacia";
import { TablaSkeleton } from "@/components/tabla-skeleton";
import { TabsUrl } from "@/components/barra-filtros";
import { PaginacionTabla, usePaginacion } from "@/components/paginacion-tabla";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useUser } from "@/hooks/use-user";
import { useCambiarParams, useParamUrl } from "@/hooks/use-param-url";
import { createClient } from "@/lib/supabase/client";
import type { Encomienda } from "@/lib/types/encomiendas";
import type { RecepcionOrigen } from "@/lib/types/pagos";
import { obtenerPdfGuia } from "@/app/cooperativas/(panel)/taquilla/encomiendas/actions";
import { RecepcionModal } from "@/components/encomiendas/recepcion-modal";
import { PagoModal } from "@/components/encomiendas/pago-modal";
import { PhotoCaptureModal } from "@/components/encomiendas/photo-capture-modal";
import { DetalleSheet, faltaFoto, remitenteDe } from "@/components/encomiendas/detalle-sheet";
import { NuevaEncomiendaDialog } from "@/components/encomiendas/nueva-encomienda-dialog";
import { RechazarEncomiendaDialog } from "@/components/encomiendas/rechazar-encomienda-dialog";
import { Monto } from "@/components/monto";
import { useEncomiendasRealtime } from "@/hooks/use-encomiendas-realtime";
import { avisarError } from "@/lib/avisos";
import { formatCiudad } from "@/lib/ciudades";
import { humanizeError } from "@/lib/errores";
import { MODALIDAD_PAGO, etiquetaEstado } from "@/lib/estados";
import { capitalizarInicio, formatHaceTiempo } from "@/lib/fechas";
import { ICONO_SECCION } from "@/lib/navigation";
import { MSG_VENTANA_BLOQUEADA, abrirUrlAsincrona } from "@/lib/printing/print-helpers";

const SELECT_ENCOMIENDAS = `
  id, tracking_id, estado, modalidad_pago, peso_kg, costo_calculado, cooperativa_id,
  created_at, updated_at, estado_origen, ciudad_origen, estado_destino, ciudad_destino,
  sucursal_origen_id, receiver_nombre, receiver_telefono, receiver_cedula_rif,
  descripcion_contenido, valor_declarado, foto_evidencia_url, foto_cliente_path, foto_omitida_motivo,
  origen_registro, remitente_nombre, remitente_cedula, remitente_telefono,
  sender:profiles!sender_id(nombre_completo)
`;

const FILTROS = ["todas", "PENDIENTE_DE_ESCANEO", "EN_RECEPCION", "POR_PAGAR", "PAGADA"] as const;
const PESTANAS = FILTROS.map((f) => ({ valor: f, etiqueta: f === "todas" ? "Todas" : etiquetaEstado("encomienda", f) }));
const COLUMNAS = 8;

/** Qué sigue después de la foto. */
type DespuesDeFoto = "pago" | "fin";

type ModalState =
  | { type: "closed" }
  | { type: "recepcion"; encomienda: Encomienda }
  | { type: "foto"; encomienda: Encomienda; luego: DespuesDeFoto }
  | { type: "pago"; encomienda: Encomienda }
  | { type: "detail"; encomienda: Encomienda }
  | { type: "nueva" }
  | { type: "rechazar"; encomienda: Encomienda };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Qué abre la fila o el escaneo, según el estado. */
function accionDe(e: Encomienda): "recepcion" | "pago" | "detail" {
  if (e.estado === "PENDIENTE_DE_ESCANEO" || e.estado === "EN_RECEPCION") return "recepcion";
  if (e.estado === "POR_PAGAR" && e.modalidad_pago === "ORIGEN") return "pago";
  return "detail";
}

const ETIQUETA_ACCION: Record<ReturnType<typeof accionDe>, string> = {
  recepcion: "Recibir encomienda",
  pago: "Cobrar encomienda",
  detail: "Ver encomienda",
};

export default function TaquillaEncomiendasPage() {
  // useSearchParams (?estado=, ?encomienda=) necesita un límite de Suspense (Next.js 16).
  return (
    <Suspense
      fallback={
        <div className="flex flex-col gap-6">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-24 w-full rounded-md" />
          <TablaSkeleton columnas={COLUMNAS} />
        </div>
      }
    >
      <TaquillaEncomiendas />
    </Suspense>
  );
}

function TaquillaEncomiendas() {
  const { user } = useUser();
  const searchParams = useSearchParams();
  const encomiendaParam = searchParams.get("encomienda");
  const cambiarParams = useCambiarParams();
  const cooperativaId = user.cooperativa_id!;
  // Stable client instance — not recreated on every render
  const supabase = useMemo(() => createClient(), []);

  const [encomiendas, setEncomiendas] = useState<Encomienda[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [estadoUrl] = useParamUrl("estado", "todas");
  const filtroEstado = (FILTROS as readonly string[]).includes(estadoUrl) ? estadoUrl : "todas";

  const [modalState, setModalState] = useState<ModalState>({ type: "closed" });
  const { ultimo, registrar } = useUltimoEscaneo();

  // `?encomienda=` sigue al detalle abierto: abrirlo lo escribe y cerrarlo lo limpia.
  const encomiendaEnUrl = useRef<string | null>(null);
  const cambiarModal = useCallback(
    (siguiente: ModalState) => {
      setModalState(siguiente);
      const id = siguiente.type === "detail" ? siguiente.encomienda.id : null;
      if (id !== encomiendaEnUrl.current) {
        encomiendaEnUrl.current = id;
        cambiarParams({ encomienda: id }, { conservarPagina: true });
      }
    },
    [cambiarParams]
  );
  const cerrarModal = useCallback(() => cambiarModal({ type: "closed" }), [cambiarModal]);

  // Número de la última carga: una respuesta vieja (otro filtro, o una recarga en tiempo
  // real que tardó más) no pisa la lista de una carga posterior.
  const cargaRef = useRef(0);
  const fetchEncomiendas = useCallback(async () => {
    const carga = ++cargaRef.current;
    setLoading(true);
    setErrorCarga(null);
    try {
      let query = supabase
        .from("encomiendas")
        .select(SELECT_ENCOMIENDAS)
        .eq("cooperativa_id", cooperativaId)
        .order("created_at", { ascending: false })
        .limit(100);

      if (filtroEstado !== "todas") {
        query = query.eq("estado", filtroEstado);
      }

      const { data, error } = await query;
      if (carga !== cargaRef.current) return;

      if (error) throw error;
      setEncomiendas(data as unknown as Encomienda[]);
    } catch (err) {
      if (carga === cargaRef.current) setErrorCarga(humanizeError(err, "cargar las encomiendas"));
    } finally {
      if (carga === cargaRef.current) setLoading(false);
    }
  }, [supabase, cooperativaId, filtroEstado]);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    fetchEncomiendas();
  }, [fetchEncomiendas]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Usar ref para el callback del realtime: evita que el canal WebSocket se
  // destruya y re-cree en cada cambio de filtro (filtroEstado).
  const fetchEncomiendasRef = useRef(fetchEncomiendas);
  useEffect(() => {
    fetchEncomiendasRef.current = fetchEncomiendas;
  }, [fetchEncomiendas]);

  // Un solo canal: cambios en `encomiendas` y en `pagos` de la cooperativa recargan la lista.
  const alCambiar = useCallback(() => void fetchEncomiendasRef.current(), []);
  useEncomiendasRealtime(cooperativaId, alCambiar);

  const handleRowClick = (encomienda: Encomienda) => {
    const accion = accionDe(encomienda);
    // EN_RECEPCION: quedó a medio recibir; se completa pesándola de nuevo.
    // Paga al retirar: se cobra en destino (el detalle permite cobrar ya si paga quien envía).
    cambiarModal({ type: accion, encomienda });
  };

  /** Código escaneado: suena y dice qué sigue; luego abre el paso que toca. */
  const alEscanear = (encomienda: Encomienda) => {
    const accion = accionDe(encomienda);
    registrar({
      codigo: encomienda.tracking_id,
      tono: "exito",
      titulo: `Encontrada · ${encomienda.tracking_id}`,
      detalle:
        accion === "recepcion"
          ? "Pésala para recibirla."
          : accion === "pago"
            ? "Falta cobrar el envío."
            : `${etiquetaEstado("encomienda", encomienda.estado)} · ${encomienda.receiver_nombre}`,
    });
    handleRowClick(encomienda);
  };

  // ?encomienda=<id> que llega desde fuera (Resumen, hoja del viaje, recarga): abre su detalle.
  useEffect(() => {
    if (!encomiendaParam) {
      encomiendaEnUrl.current = null;
      return;
    }
    if (encomiendaParam === encomiendaEnUrl.current) return;
    encomiendaEnUrl.current = encomiendaParam;
    if (!UUID_RE.test(encomiendaParam)) {
      cambiarParams({ encomienda: null }, { conservarPagina: true });
      return;
    }
    void (async () => {
      try {
        const { data, error } = await supabase
          .from("encomiendas")
          .select(SELECT_ENCOMIENDAS)
          .eq("cooperativa_id", cooperativaId)
          .eq("id", encomiendaParam)
          .maybeSingle();
        if (error) throw error;
        if (!data) {
          avisarError("No encontramos esa encomienda en tu cooperativa.");
          encomiendaEnUrl.current = null;
          cambiarParams({ encomienda: null }, { conservarPagina: true });
          return;
        }
        setModalState({ type: "detail", encomienda: data as unknown as Encomienda });
      } catch (err) {
        avisarError(humanizeError(err, "abrir la encomienda"));
      }
    })();
  }, [encomiendaParam, supabase, cooperativaId, cambiarParams]);

  /** Recibida (o registrada sin app): sigue la foto y, si paga quien envía, el cobro. */
  const pedirFoto = (encomienda: Encomienda) => {
    cambiarModal({
      type: "foto",
      encomienda,
      // Solo se cobra si sigue por pagar (un alta repetida puede venir ya pagada).
      luego: encomienda.modalidad_pago === "ORIGEN" && encomienda.estado === "POR_PAGAR" ? "pago" : "fin",
    });
  };

  const handleRecepcionOk = (encomienda: Encomienda, r: RecepcionOrigen, pesoKg: number) => {
    registrar({
      codigo: encomienda.tracking_id,
      tono: "exito",
      titulo: `Recibida · ${encomienda.tracking_id}`,
      detalle: `${pesoKg.toLocaleString("es-VE")} kg · sigue la foto del paquete`,
    });
    void fetchEncomiendas();
    pedirFoto({
      ...encomienda,
      estado: "POR_PAGAR",
      peso_kg: pesoKg,
      costo_calculado: Number(r.costo_usd),
      modalidad_pago: r.modalidad_pago ?? encomienda.modalidad_pago,
    });
  };

  const despuesDeFoto = (encomienda: Encomienda, luego: DespuesDeFoto) => {
    void fetchEncomiendas();
    if (luego === "pago") cambiarModal({ type: "pago", encomienda });
    else cerrarModal();
  };

  const { visibles, pagina, paginas, ir } = usePaginacion(encomiendas);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Taquilla de encomiendas">
        <Button onClick={() => cambiarModal({ type: "nueva" })}>
          <Plus aria-hidden />
          Nueva encomienda
        </Button>
      </PageHeader>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
        <ScanInput
          onEncomiendaFound={alEscanear}
          onError={(e) => registrar({ codigo: e.codigo, tono: "error", titulo: "No encontrada", detalle: e.mensaje })}
          cooperativaId={cooperativaId}
          disabled={modalState.type !== "closed"}
        />
        <UltimoEscaneo resultado={ultimo} />
      </div>

      <div className="flex flex-col gap-4">
        <TabsUrl param="estado" defecto="todas" opciones={PESTANAS} />

        {errorCarga && encomiendas.length > 0 && (
          <ErrorState
            compacto
            titulo="No pudimos actualizar la lista"
            descripcion={`${errorCarga} Ves los últimos datos que cargaron.`}
            onReintentar={fetchEncomiendas}
          />
        )}

        {loading && encomiendas.length === 0 ? (
          <TablaSkeleton columnas={COLUMNAS} />
        ) : (
          <Card className="gap-0 overflow-hidden p-0">
            {errorCarga && encomiendas.length === 0 ? (
              <ErrorState titulo="No pudimos cargar las encomiendas" descripcion={errorCarga} onReintentar={fetchEncomiendas} />
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Código</TableHead>
                      <TableHead className="hidden xl:table-cell">Remitente</TableHead>
                      <TableHead>Destinatario</TableHead>
                      <TableHead>Ruta</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead className="text-right">Costo</TableHead>
                      <TableHead className="hidden 2xl:table-cell">Fecha</TableHead>
                      <TableHead className="w-12 text-right">
                        <span className="sr-only">Guía</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {encomiendas.length === 0 ? (
                      <FilaVacia
                        colSpan={COLUMNAS}
                        icon={ICONO_SECCION.taquillaEncomiendas}
                        titulo={
                          filtroEstado === "todas"
                            ? "Todavía no hay encomiendas"
                            : `No hay encomiendas «${etiquetaEstado("encomienda", filtroEstado)}»`
                        }
                        accion={
                          filtroEstado === "todas" ? (
                            <Button onClick={() => cambiarModal({ type: "nueva" })}>
                              <Plus aria-hidden />
                              Nueva encomienda
                            </Button>
                          ) : undefined
                        }
                      />
                    ) : (
                      visibles.map((encomienda) => (
                        <TableRow key={encomienda.id} className="relative">
                          <CeldaEnlace
                            onAbrir={() => handleRowClick(encomienda)}
                            etiqueta={`${ETIQUETA_ACCION[accionDe(encomienda)]} ${encomienda.tracking_id}`}
                            className="font-mono text-sm"
                          >
                            {encomienda.tracking_id}
                          </CeldaEnlace>
                          <TableCell className="hidden max-w-40 truncate xl:table-cell 2xl:max-w-48" title={remitenteDe(encomienda).nombre ?? undefined}>{remitenteDe(encomienda).nombre}</TableCell>
                          <TableCell className="max-w-40 truncate 2xl:max-w-48" title={encomienda.receiver_nombre ?? undefined}>{encomienda.receiver_nombre}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                              <span className="max-w-28 truncate" title={formatCiudad(encomienda.ciudad_origen)}>
                                {formatCiudad(encomienda.ciudad_origen)}
                              </span>
                              <span aria-hidden>→</span>
                              <span className="sr-only">a</span>
                              <span className="max-w-28 truncate font-medium text-foreground" title={formatCiudad(encomienda.ciudad_destino)}>
                                {formatCiudad(encomienda.ciudad_destino)}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col items-start gap-1">
                              <StatusBadge status={encomienda.estado} dominio="encomienda" />
                              {encomienda.modalidad_pago === "DESTINO" &&
                                ["POR_PAGAR", "EN_TRANSITO", "EN_OFICINA_DESTINO"].includes(encomienda.estado) && (
                                  <span className="text-xs text-muted-foreground">{MODALIDAD_PAGO.DESTINO.corto}</span>
                                )}
                              {faltaFoto(encomienda) && <TonoBadge tono="pendiente">Falta foto</TonoBadge>}
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            {Number(encomienda.costo_calculado) > 0 ? (
                              <Monto usd={Number(encomienda.costo_calculado)} size="sm" align="right" />
                            ) : (
                              <span className="text-sm text-muted-foreground">Por calcular</span>
                            )}
                          </TableCell>
                          <TableCell className="hidden text-sm whitespace-nowrap text-muted-foreground 2xl:table-cell">
                            {capitalizarInicio(formatHaceTiempo(encomienda.created_at))}
                          </TableCell>
                          <TableCell className="text-right">
                            {encomienda.estado !== "PENDIENTE_DE_ESCANEO" && (
                              <RowPrintButton encomiendaId={encomienda.id} trackingId={encomienda.tracking_id} />
                            )}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
                <PaginacionTabla pagina={pagina} paginas={paginas} onCambio={ir} />
              </>
            )}
          </Card>
        )}
      </div>

      {modalState.type === "recepcion" && (
        <RecepcionModal
          encomienda={modalState.encomienda}
          isOpen={true}
          onClose={cerrarModal}
          onSuccess={(r, pesoKg) => handleRecepcionOk(modalState.encomienda, r, pesoKg)}
          onRechazada={() => void fetchEncomiendas()}
        />
      )}

      {modalState.type === "foto" && (
        <PhotoCaptureModal
          encomiendaId={modalState.encomienda.id}
          trackingId={modalState.encomienda.tracking_id}
          isOpen={true}
          siguiente={modalState.luego === "pago" ? "Después: cobrar el envío." : undefined}
          onListo={() => despuesDeFoto(modalState.encomienda, modalState.luego)}
          onClose={() => despuesDeFoto(modalState.encomienda, modalState.luego)}
        />
      )}

      {modalState.type === "pago" && (
        <PagoModal
          encomienda={modalState.encomienda}
          isOpen={true}
          onClose={cerrarModal}
          onSuccess={() => {
            void fetchEncomiendas();
            cerrarModal();
          }}
        />
      )}

      {modalState.type === "detail" && (
        <DetalleSheet
          encomienda={modalState.encomienda}
          isOpen={true}
          onClose={cerrarModal}
          onCobrar={() => cambiarModal({ type: "pago", encomienda: modalState.encomienda })}
          onAgregarFoto={() => cambiarModal({ type: "foto", encomienda: modalState.encomienda, luego: "fin" })}
          onRechazar={() => cambiarModal({ type: "rechazar", encomienda: modalState.encomienda })}
        />
      )}

      <NuevaEncomiendaDialog
        open={modalState.type === "nueva"}
        onOpenChange={(abierto) => {
          if (!abierto) cerrarModal();
        }}
        onRegistrada={() => void fetchEncomiendas()}
        onContinuar={pedirFoto}
      />

      <RechazarEncomiendaDialog
        encomienda={modalState.type === "rechazar" ? modalState.encomienda : null}
        open={modalState.type === "rechazar"}
        onOpenChange={(abierto) => {
          if (!abierto) cerrarModal();
        }}
        onRechazada={() => void fetchEncomiendas()}
      />
    </div>
  );
}

function RowPrintButton({ encomiendaId, trackingId }: { encomiendaId: string; trackingId: string }) {
  const [loading, setLoading] = useState(false);
  const handlePrint = async () => {
    setLoading(true);
    try {
      // La ventana se abre en el clic: abrirla tras esperar el PDF hace que el navegador la bloquee.
      let errorPdf: string | undefined;
      const resultado = await abrirUrlAsincrona(async () => {
        const res = await obtenerPdfGuia(encomiendaId);
        if (res.success && res.pdfUrl) return res.pdfUrl;
        errorPdf = res.error;
        return null;
      });
      if (resultado === "bloqueada") avisarError(MSG_VENTANA_BLOQUEADA);
      else if (resultado === "sin-url") avisarError(errorPdf || "No pudimos obtener la guía en PDF. Intenta de nuevo.");
    } catch (err) {
      avisarError(humanizeError(err, "obtener la guía en PDF"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      className="relative z-10 text-muted-foreground hover:text-foreground"
      onClick={handlePrint}
      disabled={loading}
      title="Reimprimir guía"
      aria-label={`Reimprimir la guía de ${trackingId}`}
    >
      {loading ? <Spinner size="sm" /> : <Printer aria-hidden />}
    </Button>
  );
}
