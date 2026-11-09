"use client";

// ─── Detalle de una encomienda en la taquilla ───────────────────────────────
// Ruta, remitente (el real en el alta presencial), destinatario, paquete, cobro
// y fotos (del cliente y de la taquilla, con URL firmada del bucket privado).
// Desde aquí se puede agregar la foto que falta, cobrar o no recibir la encomienda.

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Camera, Printer, Prohibit } from "@phosphor-icons/react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { StatusBadge, TonoBadge } from "@/components/status-badge";
import { avisarError } from "@/lib/avisos";
import type { Tono } from "@/lib/estados";
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
 * En las de la app el nombre sale de `remitente_nombre` (copia del perfil del
 * cliente al registrarla, 20261109000005): el embed `sender:profiles` llega
 * vacío al personal porque la RLS de `profiles` no le deja leer a los clientes.
 */
export function remitenteDe(
  e: Pick<Encomienda, "origen_registro" | "remitente_nombre" | "remitente_cedula" | "remitente_telefono" | "sender">
): RemitenteEncomienda {
  if (e.origen_registro === "TAQUILLA") {
    return {
      nombre: e.remitente_nombre?.trim() || "Sin nombre",
      cedula: e.remitente_cedula ?? null,
      telefono: e.remitente_telefono ?? null,
      presencial: true,
    };
  }
  return {
    nombre: e.remitente_nombre?.trim() || e.sender?.nombre_completo?.trim() || "Sin nombre",
    cedula: null,
    telefono: null,
    presencial: false,
  };
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

/** Estado de cobro en una insignia (tono de lib/estados) y, si lo hay, el rechazo del último pago. */
function describirCobro(e: Encomienda, cobro: EstadoCobroEncomienda | null): { texto: string; tono: Tono; nota?: string } {
  if (e.estado === "CANCELADA" || e.estado === "DEVUELTA") return { texto: "Sin cobro", tono: "neutro" };
  if (cobro?.aprobado) return { texto: "Pagado", tono: "exito" };
  if (!(Number(e.costo_calculado) > 0)) return { texto: "Por calcular", tono: "neutro" };
  if (cobro?.pendiente) return { texto: "Pago por verificar", tono: "pendiente" };
  if (e.modalidad_pago === "ORIGEN" && !["POR_PAGAR", "EN_RECEPCION", "PENDIENTE_DE_ESCANEO"].includes(e.estado)) {
    return { texto: "Pagado al enviar", tono: "exito" };
  }
  if (e.estado === "ENTREGADA") return { texto: "Pagado", tono: "exito" };
  const nota = cobro?.rechazado
    ? `Se rechazó el último pago reportado${cobro.rechazado.motivo ? `: ${cobro.rechazado.motivo}` : ""}.`
    : undefined;
  return {
    texto: e.modalidad_pago === "DESTINO" ? "Por cobrar al retirar" : "Por cobrar en taquilla",
    tono: cobro?.rechazado ? "peligro" : "pendiente",
    nota,
  };
}

/** Dato con su etiqueta (dl). */
function Dato({ etiqueta, children, ancho = false }: { etiqueta: string; children: React.ReactNode; ancho?: boolean }) {
  return (
    <div className={cn("flex flex-col gap-0.5", ancho && "col-span-2")}>
      <dt className="text-xs text-muted-foreground">{etiqueta}</dt>
      <dd className="font-medium">{children}</dd>
    </div>
  );
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

  if (!resultado || resultado.valor !== valor) return <Skeleton className="aspect-[4/3] w-full rounded-md" />;
  if (!resultado.url) {
    return (
      <p className="rounded-md border border-dashed border-border p-3 text-sm text-muted-foreground">
        No pudimos mostrar esta foto. Cierra y abre el detalle para intentarlo de nuevo.
      </p>
    );
  }
  return (
    <a
      href={resultado.url}
      target="_blank"
      rel="noreferrer"
      className="block aspect-[4/3] w-full overflow-hidden rounded-md border border-border bg-muted outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
    >
      {/* Entera y sin deformar, sea vertical u horizontal (la foto se guarda con su proporción). */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={resultado.url} alt={alt} className="size-full object-contain" />
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
      if (resultado === "bloqueada") avisarError(MSG_VENTANA_BLOQUEADA);
      else if (resultado === "sin-url") avisarError(errorPdf || "No pudimos obtener la guía en PDF. Intenta de nuevo.");
    } catch (err) {
      avisarError(humanizeError(err, "obtener la guía en PDF"));
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
      <SheetContent className="gap-0">
        <SheetHeader className="border-b border-border">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <SheetTitle className="font-mono">{encomienda.tracking_id}</SheetTitle>
            <StatusBadge status={encomienda.estado} dominio="encomienda" />
          </div>
          <SheetDescription>
            {formatCiudad(encomienda.ciudad_origen)} → {formatCiudad(encomienda.ciudad_destino)}
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-6 p-6">
          {(encomienda.estado !== "PENDIENTE_DE_ESCANEO" || puedeCobrar) && (
            <div className="flex flex-wrap gap-2">
              {puedeCobrar && (
                <Button onClick={onCobrar}>{encomienda.modalidad_pago === "DESTINO" ? "Cobrar ahora" : "Cobrar"}</Button>
              )}
              {encomienda.estado !== "PENDIENTE_DE_ESCANEO" && (
                <Button variant="outline" onClick={handlePrint} disabled={loadingPdf} aria-busy={loadingPdf || undefined}>
                  {loadingPdf ? <Spinner size="sm" /> : <Printer aria-hidden />}
                  Imprimir guía
                </Button>
              )}
            </div>
          )}

          <section aria-labelledby="detalle-ruta" className="flex flex-col gap-3">
            <h3 id="detalle-ruta" className="text-sm font-semibold">
              Ruta
            </h3>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              <Dato etiqueta="Origen">
                {formatCiudad(encomienda.ciudad_origen)}, {encomienda.estado_origen}
              </Dato>
              <Dato etiqueta="Destino">
                {formatCiudad(encomienda.ciudad_destino)}, {encomienda.estado_destino}
              </Dato>
              <Dato etiqueta="Registrada" ancho>
                <span className="tabular-nums">{formatFechaHoraVE(encomienda.created_at)}</span>
                {remitente.presencial ? " · en taquilla" : ""}
              </Dato>
            </dl>
          </section>

          <section aria-labelledby="detalle-personas" className="flex flex-col gap-3 border-t border-border pt-6">
            <h3 id="detalle-personas" className="text-sm font-semibold">
              Quién envía y quién recibe
            </h3>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              <Dato etiqueta="Remitente" ancho>
                {remitente.nombre}
                {(remitente.cedula || remitente.telefono) && (
                  <span className="block text-xs font-normal text-muted-foreground">
                    {[remitente.cedula ? formatCedula(remitente.cedula) : null, remitente.telefono ? formatTelefono(remitente.telefono) : null]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                )}
              </Dato>
              <Dato etiqueta="Destinatario">
                {encomienda.receiver_nombre}
                {encomienda.receiver_cedula_rif && (
                  <span className="block text-xs font-normal text-muted-foreground">{formatCedula(encomienda.receiver_cedula_rif)}</span>
                )}
              </Dato>
              <Dato etiqueta="Teléfono">{formatTelefono(encomienda.receiver_telefono)}</Dato>
            </dl>
          </section>

          <section aria-labelledby="detalle-paquete" className="flex flex-col gap-3 border-t border-border pt-6">
            <h3 id="detalle-paquete" className="text-sm font-semibold">
              Paquete y cobro
            </h3>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              <Dato etiqueta="Peso">
                <span className="tabular-nums">{encomienda.peso_kg ? `${String(encomienda.peso_kg).replace(".", ",")} kg` : "Por pesar"}</span>
              </Dato>
              <Dato etiqueta="Quién paga">{modalidad?.largo ?? "Sin definir"}</Dato>
              <Dato etiqueta="Contenido" ancho>
                {encomienda.descripcion_contenido || "Sin descripción"}
              </Dato>
              {Number(encomienda.valor_declarado) > 0 && (
                <Dato etiqueta="Valor declarado" ancho>
                  <span className="tabular-nums">{formatUsd(Number(encomienda.valor_declarado))}</span>
                </Dato>
              )}
              <Dato etiqueta="Costo del envío">
                {Number(encomienda.costo_calculado) > 0 ? (
                  <Monto usd={Number(encomienda.costo_calculado)} size="sm" />
                ) : (
                  <span className="font-normal text-muted-foreground">Por calcular</span>
                )}
              </Dato>
              <Dato etiqueta="Cobro">
                {cargandoCobro && !cobro ? (
                  <Skeleton className="h-5 w-28 rounded-full" />
                ) : errorCobro && !cobro ? null : (
                  <TonoBadge tono={estadoCobro.tono}>{estadoCobro.texto}</TonoBadge>
                )}
              </Dato>
            </dl>
            {errorCobro && !cobro && !cargandoCobro && (
              <ErrorState compacto titulo="No pudimos revisar el pago" descripcion={errorCobro} onReintentar={cargarCobro} />
            )}
            {estadoCobro.nota && <p className="text-sm text-destructive-text">{estadoCobro.nota}</p>}
            {cobro?.pendiente && (
              <Link href="/cooperativas/pagos?tipo=encomienda" className={cn(buttonVariants({ variant: "outline", size: "sm" }), "self-start")}>
                Verificar pago
              </Link>
            )}
          </section>

          <section aria-labelledby="detalle-fotos" className="flex flex-col gap-3 border-t border-border pt-6">
            <div className="flex items-center justify-between gap-2">
              <h3 id="detalle-fotos" className="text-sm font-semibold">
                Fotos del paquete
              </h3>
              {sinFoto && <TonoBadge tono="pendiente">Falta foto</TonoBadge>}
            </div>
            {encomienda.foto_evidencia_url ? (
              <div className="flex flex-col gap-1.5">
                <p className="text-xs text-muted-foreground">Foto de la taquilla</p>
                <FotoFirmada valor={encomienda.foto_evidencia_url} alt={`Foto del paquete ${encomienda.tracking_id} en la taquilla`} />
              </div>
            ) : sinFoto ? (
              <div className="flex flex-col items-start gap-3 rounded-md border border-dashed border-border p-4 text-sm">
                <p className="text-muted-foreground">
                  {encomienda.foto_omitida_motivo ? `Se omitió: ${encomienda.foto_omitida_motivo}.` : "Tómala con la guía visible."}
                </p>
                {onAgregarFoto && (
                  <Button size="sm" variant="outline" onClick={onAgregarFoto}>
                    <Camera aria-hidden />
                    Agregar foto
                  </Button>
                )}
              </div>
            ) : null}
            {encomienda.foto_cliente_path && (
              <div className="flex flex-col gap-1.5">
                <p className="text-xs text-muted-foreground">Foto que subió el cliente</p>
                <FotoFirmada valor={encomienda.foto_cliente_path} alt={`Foto del paquete ${encomienda.tracking_id} tomada por el cliente`} />
              </div>
            )}
            {!encomienda.foto_evidencia_url && !sinFoto && !encomienda.foto_cliente_path && (
              <p className="text-sm text-muted-foreground">Se toma al recibir el paquete.</p>
            )}
          </section>

          {puedeRechazar && (
            <section className="flex flex-col gap-2 border-t border-border pt-6">
              <Button variant="outline" className="self-start text-destructive-text" onClick={onRechazar}>
                <Prohibit aria-hidden />
                No recibir la encomienda
              </Button>
              <p className="text-sm text-muted-foreground">Sin ruta, contenido no permitido o mal embalado.</p>
            </section>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
