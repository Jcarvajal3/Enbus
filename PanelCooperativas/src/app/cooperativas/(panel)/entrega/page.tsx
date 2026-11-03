"use client";

// ─── Entrega ────────────────────────────────────────────────────────────────
// Escanea el código de la encomienda (o elígela en la lista) para entregarla.
// Solo se entregan las que están en la oficina de la sucursal del usuario; si
// no, se dice por qué (va en camino, ya se entregó, está en otra oficina…).

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { ScanInput } from "@/components/scan-input";
import { UltimoEscaneo, useUltimoEscaneo } from "@/components/ultimo-escaneo";
import { CeldaEnlace } from "@/components/celda-enlace";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useUser } from "@/hooks/use-user";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { Spinner } from "@/components/ui/spinner";
import { Handshake, MagnifyingGlass, LockKey, Warning } from "@phosphor-icons/react";
import { useEncomiendasRealtime } from "@/hooks/use-encomiendas-realtime";
import {
  DIAS_HABILES_DEVOLUCION,
  EntregaModal,
  diasHabilesDesde,
  textoDevolucion,
} from "@/components/entrega/entrega-modal";
import { Monto } from "@/components/monto";
import { humanizeError } from "@/lib/errores";
import { etiquetaEstado } from "@/lib/estados";
import { formatFechaVE } from "@/lib/fechas";
import { formatCiudad } from "@/lib/ciudades";
import { formatTelefono } from "@/lib/ve";
import type { Encomienda } from "@/lib/types/encomiendas";
import type { EstadoVerificacion } from "@/lib/types/pagos";
import { obtenerSucursalRecepcion } from "../recepcion-destino/actions";
import { vaASucursal, type SucursalRecepcion } from "../recepcion-destino/sucursal";

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

function RetentionBadge({ dias }: { dias: number }) {
  const texto = `${dias} ${dias === 1 ? "día hábil" : "días hábiles"}`;
  if (dias >= DIAS_HABILES_DEVOLUCION - 1) {
    return (
      <Badge variant="secondary" className="gap-1 bg-destructive-light text-destructive-deep">
        <Warning weight="fill" className="size-3.5" aria-hidden />
        {texto}
      </Badge>
    );
  }
  if (dias >= DIAS_HABILES_DEVOLUCION - 2) {
    return (
      <Badge variant="secondary" className="bg-warning-light text-warning-deep">
        {texto}
      </Badge>
    );
  }
  return <Badge variant="outline">{texto}</Badge>;
}

/** Cobro para la lista: verde si ya está pagada; ámbar si falta cobrar o verificar. */
function CobroCelda({ e }: { e: EncomiendaEntrega }) {
  const verde = "bg-success-light text-success-deep";
  const ambar = "bg-warning-light text-warning-deep";
  const estados = (e.pagos ?? []).map((p) => p.estado_verificacion);
  if (e.modalidad_pago === "ORIGEN" || estados.includes("APROBADO")) {
    return (
      <Badge variant="secondary" className={verde}>
        Pagada
      </Badge>
    );
  }
  if (estados.includes("PENDIENTE")) {
    return (
      <Badge variant="secondary" className={ambar}>
        Pago por verificar
      </Badge>
    );
  }
  return (
    <div className="flex flex-col items-start gap-1">
      <Badge variant="secondary" className={ambar}>
        Cobrar al retirar
      </Badge>
      {Number(e.costo_calculado) > 0 && <Monto usd={Number(e.costo_calculado)} size="sm" />}
    </div>
  );
}

export default function EntregaPage() {
  const { user } = useUser();
  const cooperativaId = user.cooperativa_id!;
  const supabase = useMemo(() => createClient(), []);

  const [encomiendas, setEncomiendas] = useState<EncomiendaEntrega[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
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
        if (res.error) toast.error(res.error);
        setSucursal(res.sucursal ?? null);
      })
      .catch((err) => {
        if (isMounted) toast.error(humanizeError(err, "cargar tu sucursal"));
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
    const q = searchQuery.toLowerCase();
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
      registrar({ codigo, tono: "exito", titulo: `Abriendo la entrega de ${codigo}`, detalle: e.receiver_nombre });
      abrirEntrega(e.id);
      return;
    }
    if (e.estado === "EN_TRANSITO") {
      registrar({
        codigo,
        tono: "aviso",
        titulo: "Todavía va en camino",
        detalle: `Va hacia ${formatCiudad(e.ciudad_destino)}. Recíbela en «Recepción en destino» cuando llegue.`,
      });
    } else if (e.estado === "ENTREGADA") {
      const fecha = e.entregada_at ?? e.updated_at;
      registrar({
        codigo,
        tono: "aviso",
        titulo: "Ya fue entregada",
        detalle: fecha
          ? `El ${formatFechaVE(fecha, { day: "2-digit", month: "2-digit", hour: "numeric", minute: "2-digit" })}.`
          : undefined,
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

  const descripcion = sucursal
    ? `Encomiendas en tu sucursal ${sucursal.nombre} (${formatCiudad(sucursal.ciudad)}) listas para entregar. Escanea el código o elige una en la lista.`
    : "Encomiendas en la oficina listas para entregar. Escanea el código o elige una en la lista.";

  return (
    <div className="space-y-6 flex flex-col h-full animate-in fade-in duration-300">
      <PageHeader title="Entrega" description={descripcion} />

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

      <div className="relative max-w-md">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <MagnifyingGlass size={20} className="text-muted-foreground" aria-hidden />
        </div>
        <Input
          type="text"
          placeholder="Filtrar por código o nombre de quien recibe…"
          aria-label="Filtrar por código o nombre de quien recibe"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10 shadow-sm"
        />
      </div>

      <div className="flex-1 rounded-md border bg-card overflow-hidden flex flex-col">
        {loading && encomiendas.length === 0 ? (
          <div className="flex flex-col items-center justify-center flex-1 h-64">
            <Spinner size="md" />
            <span className="ml-3 mt-4 text-muted-foreground font-medium">Cargando encomiendas…</span>
          </div>
        ) : errorCarga && encomiendas.length === 0 ? (
          <ErrorState titulo="No pudimos cargar las encomiendas" descripcion={errorCarga} onReintentar={fetchEncomiendas} />
        ) : filteredEncomiendas.length === 0 ? (
          <div className="flex-1">
            <EmptyState
              icon={Handshake}
              title={searchQuery ? "No hay coincidencias" : "Oficina al día"}
              description={
                searchQuery
                  ? "Revisa el código o el nombre e intenta de nuevo."
                  : "No hay encomiendas en la oficina pendientes de entrega."
              }
            />
          </div>
        ) : (
          <div className="overflow-auto flex-1">
            {errorCarga && (
              <div className="p-3">
                <ErrorState
                  compacto
                  titulo="No pudimos actualizar la lista"
                  descripcion={errorCarga}
                  onReintentar={fetchEncomiendas}
                />
              </div>
            )}
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Código</TableHead>
                  <TableHead>Destinatario</TableHead>
                  <TableHead>Teléfono</TableHead>
                  <TableHead>En la oficina</TableHead>
                  <TableHead>Cobro</TableHead>
                  <TableHead>PIN</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredEncomiendas.map((encomienda) => {
                  const dias = diasHabilesDesde(encomienda.updated_at);
                  return (
                    <TableRow key={encomienda.id} className="relative hover:bg-muted/50 transition-colors">
                      <CeldaEnlace
                        onAbrir={() => abrirEntrega(encomienda.id)}
                        etiqueta={`Entregar encomienda ${encomienda.tracking_id}`}
                        className="font-mono"
                      >
                        <span className="text-primary-text">{encomienda.tracking_id}</span>
                      </CeldaEnlace>
                      <TableCell className="max-w-[200px] truncate font-medium">{encomienda.receiver_nombre}</TableCell>
                      <TableCell className="text-muted-foreground whitespace-nowrap">
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
                          <div className="flex items-center gap-1.5 text-destructive-text font-medium text-sm">
                            <LockKey size={16} weight="bold" aria-hidden />
                            Bloqueado
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-sm">Activo</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
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
