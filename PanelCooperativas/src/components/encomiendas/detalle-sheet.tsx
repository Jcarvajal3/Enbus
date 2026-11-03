"use client";

// ─── Detalle de una encomienda en la taquilla ───────────────────────────────
// Ruta, remitente (el real en el alta presencial), destinatario, paquete, cobro
// y fotos (del cliente y de la taquilla, con URL firmada del bucket privado).
// Desde aquí se puede agregar la foto que falta, cobrar o no recibir la encomienda.

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Camera, Printer, Prohibit } from "@phosphor-icons/react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { StatusBadge } from "@/components/status-badge";
import { ErrorState } from "@/components/error-state";
import { Monto } from "@/components/monto";
import type { Encomienda } from "@/lib/types/encomiendas";
import { humanizeError } from "@/lib/errores";
import { MODALIDAD_PAGO } from "@/lib/estados";
import { formatFechaHoraVE } from "@/lib/fechas";
import { urlFirmadaFoto } from "@/lib/fotos";
import { formatCedula, formatTelefono } from "@/lib/ve";
import { formatUsd } from "@/lib/dinero";
import { MSG_VENTANA_BLOQUEADA, abrirUrlAsincrona } from "@/lib/printing/print-helpers";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import {
  obtenerEstadoCobro,
  obtenerPdfGuia,
  type EstadoCobroEncomienda,
} from "@/app/cooperativas/(panel)/taquilla/encomiendas/actions";
import { formatCiudad } from "@/lib/ciudades";

/** Estados en los que la taquilla todavía puede no recibir la encomienda. */
export const ESTADOS_RECHAZABLES = ["PENDIENTE_DE_ESCANEO", "EN_RECEPCION", "POR_PAGAR"];

/** Estados en los que ya debería haber foto de la taquilla. */
const ESTADOS_CON_FOTO = ["POR_PAGAR", "PAGADA", "EN_TRANSITO", "EN_OFICINA_DESTINO", "ENTREGADA"];

export type RemitenteEncomienda = { nombre: string; cedula: string | null; telefono: string | null; presencial: boolean };

/**
 * Quién envía. En el alta presencial (`origen_registro = 'TAQUILLA'`) `sender`
 * es el empleado que la registró: el remitente real está en `remitente_*`.
 */
export function remitenteDe(
  e: Pick<Encomienda, "origen_registro" | "remitente_nombre" | "remitente_cedula" | "remitente_telefono" | "sender">
): RemitenteEncomienda {
  if (e.origen_registro === "TAQUILLA") {
    return {
      nombre: e.remitente_nombre || "Sin nombre",
      cedula: e.remitente_cedula ?? null,
      telefono: e.remitente_telefono ?? null,
      presencial: true,
    };
  }
  return { nombre: e.sender?.nombre_completo || "Sin nombre", cedula: null, telefono: null, presencial: false };
}

/** true si a la encomienda le falta la foto de la taquilla. */
export function faltaFoto(e: Pick<Encomienda, "estado" | "foto_evidencia_url">): boolean {
  return !e.foto_evidencia_url && ESTADOS_CON_FOTO.includes(e.estado);
}

interface DetalleSheetProps {
  encomienda: Encomienda;
  isOpen: boolean;
  onClose: () => void;
  /** Abre el cobro en taquilla (solo se ofrece si la encomienda está por pagar). */
  onCobrar?: () => void;
  /** Abre la captura de la foto de la taquilla. */
  onAgregarFoto?: () => void;
  /** Abre "No recibir la encomienda". */
  onRechazar?: () => void;
}

type Tono = "exito" | "pendiente" | "peligro" | "neutro";

const TONOS: Record<Tono, string> = {
  exito: "border-success/40 bg-success-light text-success-deep",
  pendiente: "border-warning/40 bg-warning-light text-warning-deep",
  peligro: "border-destructive/40 bg-destructive-light text-destructive-deep",
  neutro: "border-border bg-muted/40 text-muted-foreground",
};

/** Estado de cobro en palabras, a partir del estado logístico y de los pagos. */
function describirCobro(e: Encomienda, cobro: EstadoCobroEncomienda | null): { texto: string; tono: Tono } {
  if (e.estado === "CANCELADA" || e.estado === "DEVUELTA") return { texto: "No aplica: el envío se cerró.", tono: "neutro" };
  if (cobro?.aprobado) return { texto: "Pagado.", tono: "exito" };
  if (!(Number(e.costo_calculado) > 0)) {
    return { texto: "El costo se calcula al recibir y pesar el paquete.", tono: "neutro" };
  }
  if (cobro?.pendiente) {
    return { texto: "El cliente reportó un pago desde la app: falta verificarlo.", tono: "pendiente" };
  }
  if (e.modalidad_pago === "ORIGEN" && !["POR_PAGAR", "EN_RECEPCION", "PENDIENTE_DE_ESCANEO"].includes(e.estado)) {
    return { texto: "Pagado al enviar.", tono: "exito" };
  }
  if (e.estado === "ENTREGADA") return { texto: "Pagado.", tono: "exito" };
  const rechazo = cobro?.rechazado
    ? ` El último pago reportado se rechazó${cobro.rechazado.motivo ? `: ${cobro.rechazado.motivo}` : ""}.`
    : "";
  return e.modalidad_pago === "DESTINO"
    ? { texto: `Por cobrar al retirar en destino.${rechazo}`, tono: cobro?.rechazado ? "peligro" : "pendiente" }
    : { texto: `Por cobrar en esta taquilla.${rechazo}`, tono: cobro?.rechazado ? "peligro" : "pendiente" };
}

/** Foto del bucket privado mostrada con URL firmada (1 hora). */
function FotoFirmada({ valor, alt }: { valor: string; alt: string }) {
  const supabase = useMemo(() => createClient(), []);
  // Resultado ligado al valor que lo produjo: si cambia el valor, vuelve a "cargando".
  const [resultado, setResultado] = useState<{ valor: string; url: string | null } | null>(null);

  useEffect(() => {
    let vigente = true;
    void urlFirmadaFoto(supabase, valor).then((url) => {
      if (vigente) setResultado({ valor, url });
    });
    return () => {
      vigente = false;
    };
  }, [supabase, valor]);

  if (!resultado || resultado.valor !== valor) return <Skeleton className="aspect-video w-full rounded-md" />;
  if (!resultado.url) {
    return (
      <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
        No pudimos mostrar esta foto. Cierra y abre el detalle para intentarlo de nuevo.
      </p>
    );
  }
  return (
    <a href={resultado.url} target="_blank" rel="noreferrer" className="block aspect-video w-full overflow-hidden rounded-md border">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={resultado.url} alt={alt} className="h-full w-full object-cover" />
    </a>
  );
}

export function DetalleSheet({ encomienda, isOpen, onClose, onCobrar, onAgregarFoto, onRechazar }: DetalleSheetProps) {
  const [loadingPdf, setLoadingPdf] = useState(false);
  const [cobro, setCobro] = useState<EstadoCobroEncomienda | null>(null);
  const [errorCobro, setErrorCobro] = useState<string | null>(null);
  const [cargandoCobro, setCargandoCobro] = useState(false);

  const cargarCobro = useCallback(async () => {
    setCargandoCobro(true);
    setErrorCobro(null);
    try {
      const res = await obtenerEstadoCobro(encomienda.id);
      if (res.success) {
        setCobro(res.data);
      } else {
        setCobro(null);
        setErrorCobro(res.error);
      }
    } catch (err) {
      setCobro(null);
      setErrorCobro(humanizeError(err, "revisar el pago de la encomienda"));
    } finally {
      setCargandoCobro(false);
    }
  }, [encomienda.id]);

  useEffect(() => {
    if (!isOpen) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga asíncrona al abrir
    void cargarCobro();
  }, [isOpen, cargarCobro]);

  const handlePrint = async () => {
    setLoadingPdf(true);
    try {
      // La ventana se abre en el clic: abrirla tras esperar el PDF hace que el navegador la bloquee.
      let errorPdf: string | undefined;
      const resultado = await abrirUrlAsincrona(async () => {
        const res = await obtenerPdfGuia(encomienda.id);
        if (res.success && res.pdfUrl) return res.pdfUrl;
        errorPdf = res.error;
        return null;
      });
      if (resultado === "bloqueada") toast.error(MSG_VENTANA_BLOQUEADA);
      else if (resultado === "sin-url") toast.error(errorPdf || "No pudimos obtener la guía en PDF. Intenta de nuevo.");
    } catch (err) {
      toast.error(humanizeError(err, "obtener la guía en PDF"));
    } finally {
      setLoadingPdf(false);
    }
  };

  const estadoCobro = describirCobro(encomienda, cobro);
  const puedeCobrar = encomienda.estado === "POR_PAGAR" && !cobro?.aprobado && !cobro?.pendiente && !!onCobrar;
  // Con un pago aprobado o por verificar el servidor no deja rechazarla (EB_PAGO_YA_REGISTRADO).
  const puedeRechazar =
    ESTADOS_RECHAZABLES.includes(encomienda.estado) && !cobro?.aprobado && !cobro?.pendiente && !!onRechazar;
  const remitente = remitenteDe(encomienda);
  const sinFoto = faltaFoto(encomienda);
  const modalidad = MODALIDAD_PAGO[encomienda.modalidad_pago];

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader className="mb-6">
          <SheetTitle className="flex items-center justify-between gap-2 text-xl">
            Detalle de la encomienda
            <StatusBadge status={encomienda.estado} dominio="encomienda" />
          </SheetTitle>
          <SheetDescription className="flex items-center justify-between gap-2">
            <span>
              Código: <span className="font-mono text-foreground">{encomienda.tracking_id}</span>
            </span>
            {encomienda.estado !== "PENDIENTE_DE_ESCANEO" && (
              <Button variant="outline" size="sm" className="h-8 shrink-0" onClick={handlePrint} disabled={loadingPdf}>
                {loadingPdf ? (
                  <Spinner className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Printer className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                )}
                Imprimir guía
              </Button>
            )}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-6">
          <section className="space-y-3 rounded-lg border bg-muted/30 p-4">
            <h4 className="text-sm font-semibold">Ruta</h4>
            <div className="grid grid-cols-2 gap-x-2 gap-y-4 text-sm">
              <div>
                <p className="mb-1 text-muted-foreground">Origen</p>
                <p className="font-medium">
                  {formatCiudad(encomienda.ciudad_origen)}, {encomienda.estado_origen}
                </p>
              </div>
              <div>
                <p className="mb-1 text-muted-foreground">Destino</p>
                <p className="font-medium">
                  {formatCiudad(encomienda.ciudad_destino)}, {encomienda.estado_destino}
                </p>
              </div>
              <div className="col-span-2">
                <p className="mb-1 text-muted-foreground">Registrada</p>
                <p className="font-medium">
                  {formatFechaHoraVE(encomienda.created_at)}
                  {remitente.presencial ? " · en taquilla (cliente sin la app)" : ""}
                </p>
              </div>
            </div>
          </section>

          <section className="space-y-3 rounded-lg border bg-muted/30 p-4">
            <h4 className="text-sm font-semibold">Quién envía y quién recibe</h4>
            <div className="grid gap-y-4 text-sm">
              <div>
                <p className="mb-1 text-muted-foreground">Remitente</p>
                <p className="font-medium">{remitente.nombre}</p>
                {(remitente.cedula || remitente.telefono) && (
                  <p className="text-xs text-muted-foreground">
                    {[remitente.cedula ? formatCedula(remitente.cedula) : null, remitente.telefono ? formatTelefono(remitente.telefono) : null]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <p className="mb-1 text-muted-foreground">Destinatario</p>
                  <p className="font-medium">{encomienda.receiver_nombre}</p>
                  {encomienda.receiver_cedula_rif && (
                    <p className="text-xs text-muted-foreground">{formatCedula(encomienda.receiver_cedula_rif)}</p>
                  )}
                </div>
                <div>
                  <p className="mb-1 text-muted-foreground">Teléfono</p>
                  <p className="font-medium">{formatTelefono(encomienda.receiver_telefono)}</p>
                </div>
              </div>
            </div>
          </section>

          <section className="space-y-3 rounded-lg border bg-muted/30 p-4">
            <h4 className="text-sm font-semibold">Paquete y cobro</h4>
            <div className="grid grid-cols-2 gap-y-4 text-sm">
              <div>
                <p className="mb-1 text-muted-foreground">Peso</p>
                <p className="font-medium">{encomienda.peso_kg ? `${encomienda.peso_kg} kg` : "Por pesar"}</p>
              </div>
              <div>
                <p className="mb-1 text-muted-foreground">Quién paga</p>
                <p className="font-medium">{modalidad?.largo ?? "Sin definir"}</p>
              </div>
              <div className="col-span-2">
                <p className="mb-1 text-muted-foreground">Contenido</p>
                <p className="font-medium">{encomienda.descripcion_contenido || "Sin descripción"}</p>
              </div>
              {Number(encomienda.valor_declarado) > 0 && (
                <div className="col-span-2">
                  <p className="mb-1 text-muted-foreground">Valor declarado</p>
                  <p className="font-medium">{formatUsd(Number(encomienda.valor_declarado))}</p>
                </div>
              )}
              <div className="col-span-2 flex items-center justify-between border-t pt-3">
                <span className="font-medium text-muted-foreground">Costo del envío</span>
                {Number(encomienda.costo_calculado) > 0 ? (
                  <Monto usd={Number(encomienda.costo_calculado)} align="right" />
                ) : (
                  <span className="text-muted-foreground">Por calcular</span>
                )}
              </div>
              <div className="col-span-2">
                <p className="mb-1 text-muted-foreground">Estado del cobro</p>
                {cargandoCobro && !cobro ? (
                  <p className="flex items-center gap-2 text-muted-foreground">
                    <Spinner size="sm" aria-label="Cargando" /> Revisando pagos…
                  </p>
                ) : errorCobro && !cobro ? (
                  <ErrorState compacto titulo="No pudimos revisar el pago" descripcion={errorCobro} onReintentar={cargarCobro} />
                ) : (
                  <p className={cn("rounded-lg border px-3 py-2", TONOS[estadoCobro.tono])}>{estadoCobro.texto}</p>
                )}
                {cobro?.pendiente && (
                  <Link
                    href="/cooperativas/pagos?tipo=encomienda"
                    className={cn(buttonVariants({ variant: "outline", size: "sm" }), "mt-2")}
                  >
                    Verificar en Pagos por verificar
                  </Link>
                )}
                {puedeCobrar && (
                  <Button size="sm" className="mt-2" onClick={onCobrar}>
                    {encomienda.modalidad_pago === "DESTINO" ? "Cobrar ahora (paga quien envía)" : "Cobrar"}
                  </Button>
                )}
              </div>
            </div>
          </section>

          <section className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-sm font-semibold">Fotos del paquete</h4>
              {sinFoto && (
                <Badge variant="secondary" className="bg-warning-light text-warning-deep">
                  Falta foto
                </Badge>
              )}
            </div>
            {encomienda.foto_evidencia_url ? (
              <div className="space-y-1.5">
                <p className="text-xs text-muted-foreground">Foto de la taquilla</p>
                <FotoFirmada valor={encomienda.foto_evidencia_url} alt={`Foto del paquete ${encomienda.tracking_id} en la taquilla`} />
              </div>
            ) : sinFoto ? (
              <div className="space-y-2 rounded-lg border border-dashed p-3 text-sm">
                <p className="text-muted-foreground">
                  {encomienda.foto_omitida_motivo
                    ? `La foto se omitió: ${encomienda.foto_omitida_motivo}. Tómala cuando puedas.`
                    : "Todavía no hay foto del paquete. Tómala con la guía visible."}
                </p>
                {onAgregarFoto && (
                  <Button size="sm" variant="outline" onClick={onAgregarFoto}>
                    <Camera className="mr-1.5 h-4 w-4" aria-hidden />
                    Agregar foto
                  </Button>
                )}
              </div>
            ) : null}
            {encomienda.foto_cliente_path && (
              <div className="space-y-1.5">
                <p className="text-xs text-muted-foreground">Foto que subió el cliente</p>
                <FotoFirmada valor={encomienda.foto_cliente_path} alt={`Foto del paquete ${encomienda.tracking_id} tomada por el cliente`} />
              </div>
            )}
            {!encomienda.foto_evidencia_url && !sinFoto && !encomienda.foto_cliente_path && (
              <p className="text-sm text-muted-foreground">La foto se toma al recibir el paquete en la taquilla.</p>
            )}
          </section>

          {puedeRechazar && (
            <section className="border-t pt-4">
              <Button variant="outline" className="w-full text-destructive-text" onClick={onRechazar}>
                <Prohibit className="mr-1.5 h-4 w-4" aria-hidden />
                No recibir la encomienda
              </Button>
              <p className="mt-2 text-xs text-muted-foreground">
                Para un paquete sin ruta, con contenido no permitido o mal embalado. Se le avisa al cliente.
              </p>
            </section>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
