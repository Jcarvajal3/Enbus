"use client";

// ─── Taquilla de encomiendas ────────────────────────────────────────────────
// Orden en el mostrador: recepción (pesar) → foto del paquete → cobro (solo si
// paga quien envía). Lo mismo para el alta de un cliente sin la app
// ("Nueva encomienda (sin app)"). El contador "Pagos por verificar" se recarga
// con los cambios de la tabla `pagos` de la cooperativa (tiempo real).

import { relativeTimeFormatter, dateFormatterDayMonthTime } from "@/lib/utils";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { PageHeader } from "@/components/page-header";
import { ScanInput } from "@/components/scan-input";
import { StatusBadge } from "@/components/status-badge";
import { ErrorState } from "@/components/error-state";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button, buttonVariants } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useUser } from "@/hooks/use-user";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { Truck, Printer, Receipt, Plus } from "@phosphor-icons/react";
import Link from "next/link";
import type { Encomienda } from "@/lib/types/encomiendas";
import type { RecepcionOrigen } from "@/lib/types/pagos";
import { Spinner } from "@/components/ui/spinner";
import { obtenerPdfGuia } from "@/app/cooperativas/(panel)/taquilla/encomiendas/actions";
import { listarPagosPorVerificar } from "@/app/cooperativas/(panel)/pagos/actions";
import { RecepcionModal } from "@/components/encomiendas/recepcion-modal";
import { Pagination } from "@/components/ui/pagination";
import { PagoModal } from "@/components/encomiendas/pago-modal";
import { PhotoCaptureModal } from "@/components/encomiendas/photo-capture-modal";
import { DetalleSheet, faltaFoto, remitenteDe } from "@/components/encomiendas/detalle-sheet";
import { NuevaEncomiendaDialog } from "@/components/encomiendas/nueva-encomienda-dialog";
import { RechazarEncomiendaDialog } from "@/components/encomiendas/rechazar-encomienda-dialog";
import { Monto } from "@/components/monto";
import { useEncomiendasRealtime } from "@/hooks/use-encomiendas-realtime";
import { humanizeError } from "@/lib/errores";
import { MODALIDAD_PAGO, etiquetaEstado } from "@/lib/estados";
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

export default function TaquillaEncomiendasPage() {
  const { user } = useUser();
  const cooperativaId = user.cooperativa_id!;
  // Stable client instance — not recreated on every render
  const supabase = useMemo(() => createClient(), []);

  const [encomiendas, setEncomiendas] = useState<Encomienda[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [filtroEstado, setFiltroEstado] = useState<string>("todas");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  // Pagos de encomiendas que los clientes reportaron desde la app y falta verificar.
  const [pagosPorVerificar, setPagosPorVerificar] = useState<number | null>(null);

  const [modalState, setModalState] = useState<ModalState>({ type: "closed" });
  const cerrarModal = useCallback(() => setModalState({ type: "closed" }), []);

  const fetchEncomiendas = useCallback(async () => {
    setLoading(true);
    setErrorCarga(null);
    try {
      let query = supabase
        .from("encomiendas")
        .select(SELECT_ENCOMIENDAS)
        .eq("cooperativa_id", cooperativaId)
        .order("created_at", { ascending: false })
        .limit(50);

      if (filtroEstado !== "todas") {
        query = query.eq("estado", filtroEstado);
      }

      const { data, error } = await query;

      if (error) throw error;
      setEncomiendas(data as unknown as Encomienda[]);
      setCurrentPage(1);
    } catch (err) {
      setErrorCarga(humanizeError(err, "cargar las encomiendas"));
    } finally {
      setLoading(false);
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

  const contarPagosPorVerificar = useCallback(async () => {
    try {
      const res = await listarPagosPorVerificar("encomienda");
      setPagosPorVerificar(res.success ? res.data.length : null);
    } catch {
      setPagosPorVerificar(null);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga asíncrona del contador
    void contarPagosPorVerificar();
  }, [contarPagosPorVerificar]);

  // Un solo canal: cambios en `encomiendas` y en `pagos` de la cooperativa
  // (cooperativa_id=eq.{id}) recargan la lista y el contador. Callback estable
  // para que el canal no se vuelva a crear en cada render.
  const alCambiar = useCallback(() => {
    void fetchEncomiendasRef.current();
    void contarPagosPorVerificar();
  }, [contarPagosPorVerificar]);
  useEncomiendasRealtime(cooperativaId, alCambiar);

  const handleRowClick = (encomienda: Encomienda) => {
    if (encomienda.estado === "PENDIENTE_DE_ESCANEO" || encomienda.estado === "EN_RECEPCION") {
      // EN_RECEPCION: quedó a medio recibir; se completa pesándola de nuevo.
      setModalState({ type: "recepcion", encomienda });
    } else if (encomienda.estado === "POR_PAGAR" && encomienda.modalidad_pago === "ORIGEN") {
      setModalState({ type: "pago", encomienda });
    } else {
      // Paga al retirar: se cobra en destino (el detalle permite cobrar ya si paga quien envía).
      setModalState({ type: "detail", encomienda });
    }
  };

  /** Recibida (o registrada sin app): sigue la foto y, si paga quien envía, el cobro. */
  const pedirFoto = (encomienda: Encomienda) => {
    setModalState({
      type: "foto",
      encomienda,
      // Solo se cobra si sigue por pagar (un alta repetida puede venir ya pagada).
      luego: encomienda.modalidad_pago === "ORIGEN" && encomienda.estado === "POR_PAGAR" ? "pago" : "fin",
    });
  };

  const handleRecepcionOk = (encomienda: Encomienda, r: RecepcionOrigen, pesoKg: number) => {
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
    if (luego === "pago") setModalState({ type: "pago", encomienda });
    else setModalState({ type: "closed" });
  };

  const formatDateRelative = (dateString: string) => {
    try {
      const date = new Date(dateString);
      const now = new Date();
      const diffInMs = now.getTime() - date.getTime();
      const diffInDays = Math.round(diffInMs / (1000 * 3600 * 24));

      if (diffInDays < 1) {
        const diffInHours = Math.round(diffInMs / (1000 * 3600));
        if (diffInHours < 1) {
          const diffInMinutes = Math.round(diffInMs / (1000 * 60));
          return relativeTimeFormatter.format(-diffInMinutes, "minute");
        }
        return relativeTimeFormatter.format(-diffInHours, "hour");
      }

      if (diffInDays < 7) {
        return relativeTimeFormatter.format(-diffInDays, "day");
      }

      return dateFormatterDayMonthTime.format(date);
    } catch {
      return dateString;
    }
  };

  const totalPages = Math.ceil(encomiendas.length / itemsPerPage);
  const paginatedEncomiendas = encomiendas.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  return (
    <div className="space-y-6 flex flex-col h-full animate-in fade-in duration-300">
      <PageHeader
        title="Taquilla de encomiendas"
        description="Recibe y pesa los paquetes, toma la foto y cobra el envío cuando paga quien envía."
      >
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setModalState({ type: "nueva" })}>
            <Plus className="w-4 h-4 mr-2" aria-hidden />
            Nueva encomienda (sin app)
          </Button>
          <Link
            href="/cooperativas/pagos?tipo=encomienda"
            className={buttonVariants({ variant: pagosPorVerificar ? "secondary" : "outline" })}
          >
            <Receipt className="w-4 h-4 mr-2" aria-hidden />
            Pagos por verificar{pagosPorVerificar != null ? ` (${pagosPorVerificar})` : ""}
          </Link>
          <Link href="/cooperativas/despacho" className={buttonVariants({ variant: "outline" })}>
            <Truck className="w-4 h-4 mr-2" aria-hidden />
            Ir a Despacho
          </Link>
        </div>
      </PageHeader>

      <ScanInput
        onEncomiendaFound={handleRowClick}
        cooperativaId={cooperativaId}
        disabled={modalState.type !== "closed"}
      />

      <div className="flex-1 space-y-4">
        <Tabs value={filtroEstado} onValueChange={setFiltroEstado} className="w-full">
          <TabsList className="flex-wrap">
            {FILTROS.map((f) => (
              <TabsTrigger key={f} value={f}>
                {f === "todas" ? "Todas" : etiquetaEstado("encomienda", f)}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        {errorCarga && encomiendas.length === 0 && !loading ? (
          <div className="rounded-md border bg-card">
            <ErrorState
              titulo="No pudimos cargar las encomiendas"
              descripcion={errorCarga}
              onReintentar={fetchEncomiendas}
            />
          </div>
        ) : (
          <>
            {errorCarga && (
              <ErrorState
                compacto
                titulo="No pudimos actualizar la lista"
                descripcion={`${errorCarga} Mostramos los últimos datos que cargaron.`}
                onReintentar={fetchEncomiendas}
              />
            )}
            <div className="rounded-md border bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Código</TableHead>
                    <TableHead>Remitente</TableHead>
                    <TableHead>Destinatario</TableHead>
                    <TableHead>Ruta</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="text-right">Costo</TableHead>
                    <TableHead className="text-right">Fecha</TableHead>
                    <TableHead className="w-12 text-center">
                      <span className="sr-only">Guía</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading && encomiendas.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="h-32 text-center">
                        <div className="flex items-center justify-center">
                          <Spinner size="md" />
                          <span className="ml-3 text-muted-foreground font-medium">Cargando encomiendas…</span>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : encomiendas.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="h-32 text-center text-muted-foreground">
                        {filtroEstado === "todas"
                          ? "Todavía no hay encomiendas. Escanea el código del cliente o registra una nueva."
                          : `No hay encomiendas «${etiquetaEstado("encomienda", filtroEstado)}».`}
                      </TableCell>
                    </TableRow>
                  ) : (
                    paginatedEncomiendas.map((encomienda) => (
                      <TableRow
                        key={encomienda.id}
                        className="cursor-pointer hover:bg-muted/50 transition-colors"
                        onClick={() => handleRowClick(encomienda)}
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleRowClick(encomienda);
                        }}
                      >
                        <TableCell className="font-mono font-medium text-primary-text">
                          {encomienda.tracking_id}
                        </TableCell>
                        <TableCell className="max-w-[150px] truncate">
                          {remitenteDe(encomienda).nombre}
                        </TableCell>
                        <TableCell className="max-w-[150px] truncate">{encomienda.receiver_nombre}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                            <span className="truncate max-w-[100px]" title={encomienda.ciudad_origen}>
                              {encomienda.ciudad_origen}
                            </span>
                            <span aria-hidden>→</span>
                            <span className="sr-only">a</span>
                            <span
                              className="font-medium text-foreground truncate max-w-[100px]"
                              title={encomienda.ciudad_destino}
                            >
                              {encomienda.ciudad_destino}
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
                            {faltaFoto(encomienda) && (
                              <span className="text-xs font-medium text-warning-text">Falta foto</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          {Number(encomienda.costo_calculado) > 0 ? (
                            <Monto usd={Number(encomienda.costo_calculado)} size="sm" align="right" />
                          ) : (
                            <span className="text-sm text-muted-foreground">Por pesar</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground text-sm whitespace-nowrap capitalize">
                          {formatDateRelative(encomienda.created_at)}
                        </TableCell>
                        <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                          {encomienda.estado !== "PENDIENTE_DE_ESCANEO" ? (
                            <RowPrintButton encomiendaId={encomienda.id} trackingId={encomienda.tracking_id} />
                          ) : (
                            <div className="w-8 h-8" />
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
            <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={setCurrentPage} />
          </>
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
            void contarPagosPorVerificar();
            setModalState({ type: "closed" });
          }}
        />
      )}

      {modalState.type === "detail" && (
        <DetalleSheet
          encomienda={modalState.encomienda}
          isOpen={true}
          onClose={cerrarModal}
          onCobrar={() => setModalState({ type: "pago", encomienda: modalState.encomienda })}
          onAgregarFoto={() => setModalState({ type: "foto", encomienda: modalState.encomienda, luego: "fin" })}
          onRechazar={() => setModalState({ type: "rechazar", encomienda: modalState.encomienda })}
        />
      )}

      <NuevaEncomiendaDialog
        open={modalState.type === "nueva"}
        onOpenChange={(abierto) => {
          if (!abierto) setModalState({ type: "closed" });
        }}
        onRegistrada={() => void fetchEncomiendas()}
        onContinuar={pedirFoto}
      />

      <RechazarEncomiendaDialog
        encomienda={modalState.type === "rechazar" ? modalState.encomienda : null}
        open={modalState.type === "rechazar"}
        onOpenChange={(abierto) => {
          if (!abierto) setModalState({ type: "closed" });
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
      if (resultado === "bloqueada") toast.error(MSG_VENTANA_BLOQUEADA);
      else if (resultado === "sin-url") toast.error(errorPdf || "No pudimos obtener la guía en PDF. Intenta de nuevo.");
    } catch (err) {
      toast.error(humanizeError(err, "obtener la guía en PDF"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-8 w-8 text-muted-foreground hover:text-foreground"
      onClick={handlePrint}
      disabled={loading}
      title="Reimprimir guía"
      aria-label={`Reimprimir la guía de ${trackingId}`}
    >
      {loading ? <Spinner className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" aria-hidden />}
    </Button>
  );
}
