"use client";

// ─── Recepción en destino ───────────────────────────────────────────────────
// Escanea (o recibe en lote) las encomiendas que llegaron a la sucursal. Cada
// fila abre su detalle; la encomienda abierta vive en `?encomienda=`.

import { Suspense, useEffect, useRef, useState, useCallback, useMemo } from "react";
import { PageHeader } from "@/components/page-header";
import { ScanInput } from "@/components/scan-input";
import { UltimoEscaneo, useUltimoEscaneo } from "@/components/ultimo-escaneo";
import { CeldaEnlace } from "@/components/celda-enlace";
import { FilaVacia } from "@/components/fila-vacia";
import { TablaSkeleton } from "@/components/tabla-skeleton";
import { PaginacionTabla, usePaginacion } from "@/components/paginacion-tabla";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useUser } from "@/hooks/use-user";
import { useParamUrl } from "@/hooks/use-param-url";
import { createClient } from "@/lib/supabase/client";
import { useEncomiendasRealtime } from "@/hooks/use-encomiendas-realtime";
import { recibirEncomienda, obtenerSucursalRecepcion } from "./actions";
import type { Encomienda } from "@/lib/types/encomiendas";
import { RecepcionLoteModal } from "./recepcion-lote-modal";
import { requireOnline } from "@/components/connectivity-banner";
import { avisarError } from "@/lib/avisos";
import { humanizeError } from "@/lib/errores";
import { etiquetaEstado } from "@/lib/estados";
import { ErrorState } from "@/components/error-state";
import { DetalleSheet, remitenteDe } from "@/components/encomiendas/detalle-sheet";
import { formatFechaHoraCortaVE } from "@/lib/fechas";
import { formatCiudad } from "@/lib/ciudades";
import { ICONO_SECCION } from "@/lib/navigation";
import { vaASucursal, type SucursalRecepcion } from "./sucursal";

const COLUMNAS = 5;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Datos que pide el detalle de una encomienda (igual que la Taquilla de encomiendas). */
const SELECT_DETALLE = `
  id, tracking_id, estado, modalidad_pago, peso_kg, costo_calculado, cooperativa_id,
  created_at, updated_at, estado_origen, ciudad_origen, estado_destino, ciudad_destino,
  sucursal_origen_id, receiver_nombre, receiver_telefono, receiver_cedula_rif,
  descripcion_contenido, valor_declarado, foto_evidencia_url, foto_cliente_path, foto_omitida_motivo,
  origen_registro, remitente_nombre, remitente_cedula, remitente_telefono,
  sender:profiles!sender_id(nombre_completo)
`;

type ViajeData = {
  id: string;
  fecha_hora_salida: string;
  ruta: { ciudad_origen: string; ciudad_destino: string } | null;
};

type EncomiendaTransito = {
  id: string;
  tracking_id: string;
  receiver_nombre: string;
  receiver_telefono: string;
  estado_origen: string;
  ciudad_origen: string;
  ciudad_destino: string;
  sucursal_destino_id: string | null;
  estado: string;
  origen_registro?: Encomienda["origen_registro"];
  remitente_nombre?: string | null;
  remitente_cedula?: string | null;
  remitente_telefono?: string | null;
  sender?: { nombre_completo: string };
  viaje: ViajeData | null;
};

export default function RecepcionDestinoPage() {
  // useSearchParams (?encomienda=) necesita un límite de Suspense (Next.js 16).
  return (
    <Suspense
      fallback={
        <div className="flex flex-col gap-6">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-24 w-full rounded-md" />
          <TablaSkeleton columnas={COLUMNAS} />
        </div>
      }
    >
      <RecepcionDestino />
    </Suspense>
  );
}

function RecepcionDestino() {

  const { user } = useUser();
  const cooperativaId = user.cooperativa_id!;
  const supabase = useMemo(() => createClient(), []);

  const [encomiendas, setEncomiendas] = useState<EncomiendaTransito[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);

  // Sucursal donde recibe el usuario (null = toda la cooperativa)
  const [sucursal, setSucursal] = useState<SucursalRecepcion | null>(null);
  const [alcanceCargado, setAlcanceCargado] = useState(false);

  const [isLoteModalOpen, setIsLoteModalOpen] = useState(false);
  // Detalle abierto (`?encomienda=`)
  const [encomiendaAbierta, setEncomiendaAbierta] = useParamUrl("encomienda");
  const [detalle, setDetalle] = useState<Encomienda | null>(null);
  const [recibiendo, setRecibiendo] = useState(false);
  const { ultimo, registrar } = useUltimoEscaneo();

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
          estado_origen, ciudad_origen, ciudad_destino, sucursal_destino_id, estado,
          origen_registro, remitente_nombre, remitente_cedula, remitente_telefono,
          sender:profiles!sender_id(nombre_completo),
          viaje:viajes!viaje_id(
            id, fecha_hora_salida,
            ruta:rutas(ciudad_origen, ciudad_destino)
          )
        `)
        .eq("cooperativa_id", cooperativaId)
        .eq("estado", "EN_TRANSITO")
        .order("created_at", { ascending: false });

      if (error) throw error;
      const lista = (data as unknown as EncomiendaTransito[]) ?? [];
      // Solo las que vienen hacia la sucursal del usuario
      setEncomiendas(sucursal ? lista.filter((e) => vaASucursal(e, sucursal)) : lista);
    } catch (err) {
      setErrorCarga(humanizeError(err, "cargar las encomiendas en camino"));
    } finally {
      setLoading(false);
    }
  }, [supabase, cooperativaId, sucursal, alcanceCargado]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchEncomiendas();
  }, [fetchEncomiendas]);

  // Callback estable para que el canal en tiempo real no se vuelva a crear en cada render.
  const fetchRef = useRef(fetchEncomiendas);
  useEffect(() => {
    fetchRef.current = fetchEncomiendas;
  }, [fetchEncomiendas]);
  const alCambiar = useCallback(() => void fetchRef.current(), []);
  useEncomiendasRealtime(cooperativaId, alCambiar);

  // Carga la encomienda de `?encomienda=` para su detalle.
  useEffect(() => {
    // Al cerrar se conserva la última para que la hoja salga con su animación.
    if (!encomiendaAbierta) return;
    if (!UUID_RE.test(encomiendaAbierta)) {
      setEncomiendaAbierta(null);
      return;
    }
    let vigente = true;
    void (async () => {
      try {
        const { data, error } = await supabase
          .from("encomiendas")
          .select(SELECT_DETALLE)
          .eq("cooperativa_id", cooperativaId)
          .eq("id", encomiendaAbierta)
          .maybeSingle();
        if (!vigente) return;
        if (error) throw error;
        if (!data) {
          avisarError("No encontramos esa encomienda en tu cooperativa.");
          setEncomiendaAbierta(null);
          return;
        }
        setDetalle(data as unknown as Encomienda);
      } catch (err) {
        if (vigente) avisarError(humanizeError(err, "abrir la encomienda"));
      }
    })();
    return () => {
      vigente = false;
    };
  }, [encomiendaAbierta, supabase, cooperativaId, setEncomiendaAbierta]);

  const handleScanFound = async (encomienda: Encomienda) => {
    const codigo = encomienda.tracking_id;
    // Solo se reciben las que vienen en camino; si no, se dice por qué.
    if (encomienda.estado !== "EN_TRANSITO") {
      registrar(
        encomienda.estado === "EN_OFICINA_DESTINO"
          ? {
              codigo,
              tono: "aviso",
              titulo: "Ya está recibida",
              detalle: `${encomienda.receiver_nombre} · lista para retirar`,
            }
          : {
              codigo,
              tono: "error",
              titulo: "No viene en camino",
              detalle: `Está «${etiquetaEstado("encomienda", encomienda.estado)}».`,
            }
      );
      return;
    }

    // El servidor rechaza las que van a otra sucursal.
    setRecibiendo(true);
    try {
      const result = await requireOnline(() => recibirEncomienda(encomienda.id))();
      if (result.success) {
        registrar({
          codigo,
          tono: "exito",
          titulo: `Recibida · ${codigo}`,
          detalle: `${encomienda.receiver_nombre} · lista para retirar`,
        });
        void fetchEncomiendas();
      } else {
        registrar({
          codigo,
          tono: "error",
          titulo: "No se recibió",
          detalle: result.error || humanizeError(null, "recibir la encomienda"),
        });
      }
    } catch (err) {
      registrar({ codigo, tono: "error", titulo: "No se recibió", detalle: humanizeError(err, "recibir la encomienda") });
    } finally {
      setRecibiendo(false);
    }
  };

  const { visibles, pagina, paginas, ir } = usePaginacion(encomiendas);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Recepción en destino">
        <Button onClick={() => setIsLoteModalOpen(true)} disabled={!alcanceCargado}>
          <ICONO_SECCION.recepcion aria-hidden />
          Recibir lote del viaje
        </Button>
      </PageHeader>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
        <ScanInput
          onEncomiendaFound={(e) => void handleScanFound(e)}
          onError={(err) => registrar({ codigo: err.codigo, tono: "error", titulo: "No encontrada", detalle: err.mensaje })}
          cooperativaId={cooperativaId}
          mode="encomiendas"
          disabled={isLoteModalOpen || recibiendo || Boolean(encomiendaAbierta)}
        />
        <UltimoEscaneo resultado={ultimo} />
      </div>

      {loading && encomiendas.length === 0 ? (
        <TablaSkeleton columnas={COLUMNAS} />
      ) : (
        <Card className="gap-0 overflow-hidden p-0">
          {errorCarga ? (
            <ErrorState
              titulo="No pudimos cargar las encomiendas en camino"
              descripcion={errorCarga}
              onReintentar={fetchEncomiendas}
            />
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Código</TableHead>
                    <TableHead className="hidden xl:table-cell">Remitente</TableHead>
                    <TableHead>Destinatario</TableHead>
                    <TableHead>Origen</TableHead>
                    <TableHead>Viaje</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {encomiendas.length === 0 ? (
                    <FilaVacia colSpan={COLUMNAS} icon={ICONO_SECCION.recepcion} titulo="No hay encomiendas en camino" />
                  ) : (
                    visibles.map((encomienda) => (
                      <TableRow key={encomienda.id} className="relative">
                        <CeldaEnlace
                          onAbrir={() => setEncomiendaAbierta(encomienda.id)}
                          etiqueta={`Ver encomienda ${encomienda.tracking_id}`}
                          className="font-mono text-sm"
                        >
                          {encomienda.tracking_id}
                        </CeldaEnlace>
                        <TableCell className="hidden max-w-40 truncate xl:table-cell">{remitenteDe(encomienda).nombre}</TableCell>
                        <TableCell className="max-w-40 truncate">{encomienda.receiver_nombre}</TableCell>
                        <TableCell className="max-w-32 truncate">{formatCiudad(encomienda.ciudad_origen)}</TableCell>
                        <TableCell className="text-sm">
                          {encomienda.viaje ? (
                            <div className="flex flex-col">
                              <span className="font-medium text-foreground">
                                {formatCiudad(encomienda.viaje.ruta?.ciudad_origen)} → {formatCiudad(encomienda.viaje.ruta?.ciudad_destino)}
                              </span>
                              <span className="text-xs text-muted-foreground tabular-nums">
                                {formatFechaHoraCortaVE(encomienda.viaje.fecha_hora_salida)}
                              </span>
                            </div>
                          ) : (
                            <span className="text-muted-foreground">Sin viaje asignado</span>
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

      <RecepcionLoteModal
        isOpen={isLoteModalOpen}
        onClose={() => setIsLoteModalOpen(false)}
        cooperativaId={cooperativaId}
        sucursal={sucursal}
        onSuccess={fetchEncomiendas}
      />

      {detalle && (
        <DetalleSheet
          encomienda={detalle}
          isOpen={Boolean(encomiendaAbierta) && detalle.id === encomiendaAbierta}
          onClose={() => setEncomiendaAbierta(null)}
        />
      )}
    </div>
  );
}
