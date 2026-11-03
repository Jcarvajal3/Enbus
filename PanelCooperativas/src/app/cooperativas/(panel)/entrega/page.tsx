"use client";

// ─── Entrega ────────────────────────────────────────────────────────────────
// Escanea el código de la encomienda (o elígela en la lista) para entregarla.
// Solo se entregan las que están en la oficina de la sucursal del usuario; si
// no, se dice por qué (va en camino, ya se entregó, está en otra oficina…).

import { Suspense, useEffect, useRef, useState, useCallback, useMemo } from "react";
import { PageHeader } from "@/components/page-header";
import { ErrorState } from "@/components/error-state";
import { FilaVacia } from "@/components/fila-vacia";
import { TablaSkeleton } from "@/components/tabla-skeleton";
import { BarraFiltros } from "@/components/barra-filtros";
import { PaginacionTabla, usePaginacion } from "@/components/paginacion-tabla";
import { ScanInput } from "@/components/scan-input";
import { UltimoEscaneo, useUltimoEscaneo } from "@/components/ultimo-escaneo";
import { CeldaEnlace } from "@/components/celda-enlace";
import { StatusBadge, TonoBadge } from "@/components/status-badge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useUser } from "@/hooks/use-user";
import { useParamUrl } from "@/hooks/use-param-url";
import { createClient } from "@/lib/supabase/client";
import { useEncomiendasRealtime } from "@/hooks/use-encomiendas-realtime";
import {
  DIAS_HABILES_DEVOLUCION,
  EntregaModal,
  diasHabilesDesde,
  textoDevolucion,
} from "@/components/entrega/entrega-modal";
import { Monto } from "@/components/monto";
import { avisarError } from "@/lib/avisos";
import { humanizeError } from "@/lib/errores";
import { etiquetaEstado, retencionInfo } from "@/lib/estados";
import { formatFechaHoraCortaVE } from "@/lib/fechas";
import { formatCiudad } from "@/lib/ciudades";
import { ICONO_SECCION } from "@/lib/navigation";
import { formatTelefono } from "@/lib/ve";
import type { Encomienda } from "@/lib/types/encomiendas";
import type { EstadoVerificacion } from "@/lib/types/pagos";
import { obtenerSucursalRecepcion } from "../recepcion-destino/actions";
import { vaASucursal, type SucursalRecepcion } from "../recepcion-destino/sucursal";

const COLUMNAS = 6;

type EncomiendaEntrega = {
  id: string;
  tracking_id: string;
  receiver_nombre: string;
  receiver_telefono: string;
  receiver_cedula_rif: string;
  modalidad_pago: "ORIGEN" | "DESTINO";
  costo_calculado: number | null;
  ciudad_destino: string;
  sucursal_destino_id: string | null;
  estado: string;
  updated_at: string;
  pin_bloqueado: boolean;
  pagos: { estado_verificacion: EstadoVerificacion }[] | null;
};

const ESTADOS_ANTES_DE_SALIR = ["PENDIENTE_DE_ESCANEO", "EN_RECEPCION", "POR_PAGAR", "PAGADA"];

/** Días en la oficina (PU-32): tono de `retencionInfo`, la etiqueta son los días. */
function RetentionBadge({ dias }: { dias: number }) {
  const info = retencionInfo(dias, DIAS_HABILES_DEVOLUCION);
  return <TonoBadge tono={info.tono}>{info.etiqueta}</TonoBadge>;
}

/** Cobro para la lista, con el vocabulario de `cobro` (lib/estados). */
function CobroCelda({ e }: { e: EncomiendaEntrega }) {
  const estados = (e.pagos ?? []).map((p) => p.estado_verificacion);
  if (e.modalidad_pago === "ORIGEN" || estados.includes("APROBADO")) return <StatusBadge status="PAGADO" dominio="cobro" />;
  if (estados.includes("PENDIENTE")) return <StatusBadge status="EN_VERIFICACION" dominio="cobro" />;
  return (
    <div className="flex flex-col items-start gap-1">
      <StatusBadge status="SIN_PAGO" dominio="cobro" />
      {Number(e.costo_calculado) > 0 && <Monto usd={Number(e.costo_calculado)} size="sm" />}
    </div>
  );
}

export default function EntregaPage() {
  // useSearchParams (?q=) necesita un límite de Suspense (Next.js 16).
  return (
    <Suspense
      fallback={
        <div className="flex flex-col gap-6">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-24 w-full rounded-md" />
          <TablaSkeleton columnas={COLUMNAS} conFiltros />
        </div>
      }
    >
      <Entrega />
    </Suspense>
  );
}

function Entrega() {
  const { user } = useUser();
  const cooperativaId = user.cooperativa_id!;
  const supabase = useMemo(() => createClient(), []);

  const [encomiendas, setEncomiendas] = useState<EncomiendaEntrega[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [searchQuery] = useParamUrl("q");
  const { ultimo, registrar } = useUltimoEscaneo();

  // Sucursal donde entrega el usuario (null = toda la cooperativa), igual que Recepción en destino
  const [sucursal, setSucursal] = useState<SucursalRecepcion | null>(null);
  const [alcanceCargado, setAlcanceCargado] = useState(false);

  // Estado para el modal de entrega
  const [modalState, setModalState] = useState<{
    isOpen: boolean;
    encomiendaId: string | null;
  }>({ isOpen: false, encomiendaId: null });

  useEffect(() => {
    let isMounted = true;
    obtenerSucursalRecepcion()
      .then((res) => {
        if (!isMounted) return;
        if (res.error) avisarError(res.error);
        setSucursal(res.sucursal ?? null);
      })
      .catch((err) => {
        if (isMounted) avisarError(humanizeError(err, "cargar tu sucursal"));
      })
      .finally(() => {
        if (isMounted) setAlcanceCargado(true);
      });
    return () => {
      isMounted = false;
    };
  }, []);

  const fetchEncomiendas = useCallback(async () => {
    if (!alcanceCargado) return;
    setLoading(true);
    setErrorCarga(null);
    try {
      const { data, error } = await supabase
        .from("encomiendas")
        .select(`
          id, tracking_id, receiver_nombre, receiver_telefono,
          receiver_cedula_rif, modalidad_pago, costo_calculado,
          ciudad_destino, sucursal_destino_id,
          estado, updated_at, pin_bloqueado,
          pagos:pagos!pagos_encomienda_id_fkey(estado_verificacion)
        `)
        .eq("cooperativa_id", cooperativaId)
        .eq("estado", "EN_OFICINA_DESTINO")
        .order("updated_at", { ascending: true }); // Más antiguas primero

      if (error) throw error;
      const lista = (data as unknown as EncomiendaEntrega[]) ?? [];
      // Solo las que están en la sucursal del usuario
      setEncomiendas(sucursal ? lista.filter((e) => vaASucursal(e, sucursal)) : lista);
    } catch (err) {
      setErrorCarga(humanizeError(err, "cargar las encomiendas listas para entregar"));
    } finally {
      setLoading(false);
    }
  }, [supabase, cooperativaId, sucursal, alcanceCargado]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchEncomiendas();
  }, [fetchEncomiendas]);

  // Patrón useRef: evita que el canal WebSocket se destruya/re-cree
  // al cambiar estado interno del componente.
  const fetchEncomiendasRef = useRef(fetchEncomiendas);
  useEffect(() => {
    fetchEncomiendasRef.current = fetchEncomiendas;
  }, [fetchEncomiendas]);

  const alCambiar = useCallback(() => void fetchEncomiendasRef.current(), []);
  useEncomiendasRealtime(cooperativaId, alCambiar);

  const filteredEncomiendas = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return encomiendas;
    return encomiendas.filter(
      (e) => e.tracking_id.toLowerCase().includes(q) || e.receiver_nombre.toLowerCase().includes(q)
    );
  }, [searchQuery, encomiendas]);

  const abrirEntrega = (encomiendaId: string) => {
    setModalState({ isOpen: true, encomiendaId });
  };

  /** Código escaneado: se abre la entrega o se dice por qué no se puede (con sonido). */
  const alEscanear = (e: Encomienda) => {
    const codigo = e.tracking_id;
    if (e.estado === "EN_OFICINA_DESTINO") {
      if (sucursal && !vaASucursal(e, sucursal)) {
        registrar({
          codigo,
          tono: "error",
          titulo: `Está en la oficina de ${formatCiudad(e.ciudad_destino)}`,
          detalle: `No está en tu sucursal ${sucursal.nombre}: se retira allá.`,
        });
        return;
      }
      registrar({ codigo, tono: "exito", titulo: `Entrega de ${codigo}`, detalle: e.receiver_nombre });
      abrirEntrega(e.id);
      return;
    }
    if (e.estado === "EN_TRANSITO") {
      registrar({
        codigo,
        tono: "aviso",
        titulo: "Todavía va en camino",
        detalle: `Va hacia ${formatCiudad(e.ciudad_destino)}.`,
      });
    } else if (e.estado === "ENTREGADA") {
      const fecha = e.entregada_at ?? e.updated_at;
      registrar({
        codigo,
        tono: "aviso",
        titulo: "Ya fue entregada",
        detalle: fecha ? `El ${formatFechaHoraCortaVE(fecha)}.` : undefined,
      });
    } else if (ESTADOS_ANTES_DE_SALIR.includes(e.estado)) {
      registrar({
        codigo,
        tono: "error",
        titulo: `Todavía no sale de ${formatCiudad(e.ciudad_origen)}`,
        detalle: `Estado: ${etiquetaEstado("encomienda", e.estado)}.`,
      });
    } else {
      registrar({
        codigo,
        tono: "error",
        titulo: "No se puede entregar",
        detalle: `Esta encomienda está «${etiquetaEstado("encomienda", e.estado)}».`,
      });
    }
  };

  // Al cerrar se recarga: un cobro registrado en el modal no cambia la encomienda (no llega por realtime).
  const cerrarModal = useCallback(() => {
    void fetchEncomiendasRef.current();
    setModalState({ isOpen: false, encomiendaId: null });
  }, []);
  const entregaOk = useCallback(() => {
    void fetchEncomiendasRef.current();
    setModalState({ isOpen: false, encomiendaId: null });
  }, []);

  const { visibles, pagina, paginas, ir } = usePaginacion(filteredEncomiendas);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Entrega" />

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
        <ScanInput
          mode="encomiendas"
          cooperativaId={cooperativaId}
          onEncomiendaFound={alEscanear}
          onError={(err) => registrar({ codigo: err.codigo, tono: "error", titulo: "No encontrada", detalle: err.mensaje })}
          disabled={modalState.isOpen || !alcanceCargado}
        />
        <UltimoEscaneo resultado={ultimo} />
      </div>

      <div className="flex flex-col gap-4">
        <BarraFiltros busqueda={{ etiqueta: "Buscar", placeholder: "Código o destinatario" }} />

        {errorCarga && encomiendas.length > 0 && (
          <ErrorState compacto titulo="No pudimos actualizar la lista" descripcion={errorCarga} onReintentar={fetchEncomiendas} />
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
                      <TableHead>Destinatario</TableHead>
                      <TableHead className="hidden lg:table-cell">Teléfono</TableHead>
                      <TableHead>En la oficina</TableHead>
                      <TableHead>Cobro</TableHead>
                      <TableHead>PIN</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredEncomiendas.length === 0 ? (
                      <FilaVacia
                        colSpan={COLUMNAS}
                        icon={ICONO_SECCION.entrega}
                        titulo={searchQuery ? "No hay coincidencias" : "No hay encomiendas por entregar"}
                      />
                    ) : (
                      visibles.map((encomienda) => {
                        const dias = diasHabilesDesde(encomienda.updated_at);
                        return (
                          <TableRow key={encomienda.id} className="relative">
                            <CeldaEnlace
                              onAbrir={() => abrirEntrega(encomienda.id)}
                              etiqueta={`Entregar encomienda ${encomienda.tracking_id}`}
                              className="font-mono text-sm"
                            >
                              {encomienda.tracking_id}
                            </CeldaEnlace>
                            <TableCell className="max-w-48 truncate font-medium">{encomienda.receiver_nombre}</TableCell>
                            <TableCell className="hidden whitespace-nowrap text-muted-foreground tabular-nums lg:table-cell">
                              {formatTelefono(encomienda.receiver_telefono)}
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-col items-start gap-1">
                                <RetentionBadge dias={dias} />
                                <span className="text-xs text-muted-foreground">{textoDevolucion(dias)}</span>
                              </div>
                            </TableCell>
                            <TableCell>
                              <CobroCelda e={encomienda} />
                            </TableCell>
                            <TableCell>
                              {encomienda.pin_bloqueado ? (
                                <TonoBadge tono="peligro">Bloqueado</TonoBadge>
                              ) : (
                                <span className="text-sm text-muted-foreground">Activo</span>
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
      </div>

      <EntregaModal
        isOpen={modalState.isOpen}
        encomiendaId={modalState.encomiendaId}
        onClose={cerrarModal}
        onSuccess={entregaOk}
      />
    </div>
  );
}
