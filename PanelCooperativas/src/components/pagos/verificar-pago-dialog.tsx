"use client";

// ─── Verificar un pago registrado por un cliente ────────────────────────────
// Diálogo único para la bandeja "Pagos por verificar", la taquilla de boletos,
// el embarque, el cobro y la entrega de encomiendas. Muestra lo que debe
// aparecer en la cuenta de la cooperativa frente a lo que el cliente declaró,
// y permite aprobar o rechazar (con motivo que se le envía al cliente). Al
// rechazar un pago de boletos, sus asientos quedan libres.
// Aprobar y rechazar pasan por una confirmación (ConfirmarPagoDialog) que
// resume el pago y dice qué va a pasar; el motivo del rechazo se pide ahí.
//
// `embebido`: se dibuja dentro de otro diálogo (sin Dialog propio).

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { CheckCircle, Copy, Info, Warning } from "@phosphor-icons/react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AvisoError } from "@/components/aviso-error";
import { ErrorState } from "@/components/error-state";
import { avisarExito, avisarInfo } from "@/lib/avisos";
import { formatFechaHoraVE, formatFechaVE } from "@/lib/fechas";
import { formatCedula, formatTelefono } from "@/lib/ve";
import { Monto } from "@/components/monto";
import { StatusBadge } from "@/components/status-badge";
import { requireOnline } from "@/components/connectivity-banner";
import { fechaTasaCorta, formatNumeroVE, formatUsd, type TasaRef } from "@/lib/dinero";
import { humanizeError, MSG } from "@/lib/errores";
import { cn } from "@/lib/utils";
import { conceptoDePago, formatSalidaCorta, type PagoPorVerificar } from "@/lib/types/pagos";
import { aprobarPago, obtenerPago, rechazarPago } from "@/app/cooperativas/(panel)/pagos/actions";
import {
  ConfirmarPagoDialog,
  type AccionPago,
  type ResultadoAccionPago,
} from "@/components/pagos/confirmar-pago-dialog";
import { cuentaDestino, formatEnMoneda, ROL_PAGADOR } from "@/components/pagos/formato-pago";

// `conceptoDePago` vive en lib/types/pagos (se puede usar en Server Components);
// se re-exporta aquí por comodidad para componentes de cliente.
export { conceptoDePago };

/** Error inesperado (red, servidor) en texto para el usuario. */
function mensajeExcepcion(err: unknown, accion: string) {
  if (typeof navigator !== "undefined" && !navigator.onLine) return MSG.sinRed;
  return humanizeError(err, accion);
}

export type VerificarPagoDialogProps = {
  pagoId: string;
  open: boolean;
  onOpenChange: (abierto: boolean) => void;
  onResuelto: (r: { aprobado: boolean }) => void;
  embebido?: boolean;
};

/** Comparación entre lo esperado y lo declarado por el cliente. */
function Comparacion({ pago }: { pago: PagoPorVerificar }) {
  if (pago.esperado == null || pago.declarado == null) return null;
  const dif = pago.diferencia ?? pago.declarado - pago.esperado;
  const declarado = formatEnMoneda(pago.declarado, pago.moneda);

  if (Math.abs(dif) < 0.01) {
    return (
      <p className="flex items-center gap-2 text-sm font-medium text-success-text">
        <CheckCircle weight="fill" className="size-4 shrink-0" aria-hidden />
        El monto coincide: el cliente dice que pagó {declarado}.
      </p>
    );
  }
  const falta = dif < 0;
  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded-md border px-3 py-2 text-sm",
        falta
          ? "border-warning/40 bg-warning-light text-warning-deep"
          : "border-info/40 bg-info-light text-info-deep"
      )}
    >
      {falta ? (
        <Warning weight="fill" className="mt-0.5 size-4 shrink-0" aria-hidden />
      ) : (
        <Info weight="fill" className="mt-0.5 size-4 shrink-0" aria-hidden />
      )}
      <span>
        <span className="font-medium">
          {falta ? "Faltan" : "Sobran"} {formatEnMoneda(Math.abs(dif), pago.moneda)}
        </span>
        {": "}el cliente dice que pagó {declarado}.
        {falta && " Confirma en tu banco cuánto llegó."}
      </span>
    </div>
  );
}

function Aviso({ children, tono = "ambar" }: { children: React.ReactNode; tono?: "ambar" | "rojo" }) {
  if (tono === "rojo") return <AvisoError>{children}</AvisoError>;
  return (
    <Alert variant="warning">
      <Warning weight="fill" aria-hidden />
      <AlertDescription>{children}</AlertDescription>
    </Alert>
  );
}

function Dato({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[8.5rem_1fr] gap-2 py-2 text-sm">
      <dt className="text-muted-foreground">{etiqueta}</dt>
      <dd className="min-w-0 break-words text-foreground">{children}</dd>
    </div>
  );
}

export function VerificarPagoDialog({
  pagoId,
  open,
  onOpenChange,
  onResuelto,
  embebido = false,
}: VerificarPagoDialogProps) {
  const [pagoCargado, setPago] = useState<PagoPorVerificar | null>(null);
  // Nunca mostrar (ni aprobar) un pago anterior mientras se carga otro `pagoId`.
  const pago = pagoCargado && pagoCargado.pago_id === pagoId ? pagoCargado : null;
  const [cargando, setCargando] = useState(false);
  // Momento de la última carga (para "el viaje ya salió" sin leer el reloj durante el render).
  const [cargadoAt, setCargadoAt] = useState(0);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  // Confirmación abierta (aprobar o rechazar); null = ninguna.
  const [confirmando, setConfirmando] = useState<AccionPago | null>(null);
  const [enviando, setEnviando] = useState<AccionPago | null>(null);
  // Error que deja el pago en otro estado (ya resuelto, boletos vencidos) o al copiar:
  // se lee dentro del diálogo (§2.3), nunca como toast. Los demás errores se leen en la confirmación.
  const [errorAccion, setErrorAccion] = useState<string | null>(null);
  const enviandoRef = useRef(false);
  const aprobarRef = useRef<HTMLButtonElement>(null);
  const rechazarRef = useRef<HTMLButtonElement>(null);
  const idTitulo = useId();

  // Solo la última petición actualiza el estado (evita respuestas cruzadas al cambiar de pago).
  const peticionRef = useRef(0);
  const cargar = useCallback(async () => {
    const n = ++peticionRef.current;
    setCargando(true);
    setErrorCarga(null);
    try {
      const res = await obtenerPago(pagoId);
      if (n !== peticionRef.current) return;
      if (res.success) {
        setPago(res.data);
        setCargadoAt(Date.now());
      } else {
        setErrorCarga(res.error);
      }
    } catch (err) {
      if (n !== peticionRef.current) return;
      setErrorCarga(mensajeExcepcion(err, "cargar el pago"));
    } finally {
      if (n === peticionRef.current) setCargando(false);
    }
  }, [pagoId]);

  // Cada vez que se abre (o cambia el pago) se recarga desde el servidor.
  useEffect(() => {
    if (!open || !pagoId) return;
    const reiniciarYCargar = async () => {
      setPago(null);
      setConfirmando(null);
      setErrorAccion(null);
      await cargar();
    };
    void reiniciarYCargar();
    const peticiones = peticionRef; // el objeto ref es estable; no es un nodo del DOM
    return () => {
      peticiones.current++; // descarta la respuesta pendiente al cerrar
    };
  }, [open, pagoId, cargar]);

  const pendiente = pago?.estado_verificacion === "PENDIENTE";
  const puedeAprobar = pendiente && !pago?.recurso_vencido;
  const viajeSalio =
    pago?.tipo_recurso === "boleto" && !!pago.viaje_salida && new Date(pago.viaje_salida).getTime() < cargadoAt;

  // Foco al terminar de cargar: "Aprobar pago…" (Enter abre la confirmación y otro Enter aprueba).
  // Si ya no se puede aprobar (boletos vencidos, envío cerrado), en "Rechazar…": su confirmación
  // abre con el foco en "Cancelar", así que Enter nunca rechaza por accidente.
  // Al cerrar una confirmación el foco vuelve al botón que la abrió (o a "Rechazar…", ver `focoAlCerrar`).
  useEffect(() => {
    if (!open || !pendiente) return;
    (puedeAprobar ? aprobarRef : rechazarRef).current?.focus();
  }, [open, pendiente, puedeAprobar]);

  const cerrar = useCallback(() => {
    if (enviandoRef.current) return;
    onOpenChange(false);
  }, [onOpenChange]);

  const pedirConfirmacion = (accion: AccionPago) => {
    if (!pago || enviandoRef.current) return;
    if (accion === "aprobar" && !puedeAprobar) return;
    setErrorAccion(null);
    setConfirmando(accion);
  };

  /** Se llama desde la confirmación; sus errores se leen dentro de ella. */
  const ejecutar = async (accion: AccionPago, motivo?: string): Promise<ResultadoAccionPago> => {
    if (!pago) return { ok: false, error: "No encontramos este pago. Ciérralo y vuelve a abrirlo." };
    if (enviandoRef.current) return { ok: false, error: "Ya estamos procesando este pago. Espera un momento." };
    enviandoRef.current = true;
    setEnviando(accion);
    try {
      if (accion === "aprobar") {
        const res = await requireOnline(() => aprobarPago(pago.pago_id))();
        if (res.success) {
          if (res.data.ya_procesado) {
            avisarInfo("Este pago ya estaba aprobado.");
          } else {
            avisarExito(
              pago.tipo_recurso === "encomienda"
                ? "Pago aprobado. El envío del cliente continúa."
                : "Pago aprobado. El cliente ya puede usar su boleto."
            );
          }
          enviandoRef.current = false;
          onResuelto({ aprobado: true });
          onOpenChange(false);
          return { ok: true };
        }
        if (res.codigo === "EB_PAGO_YA_RESUELTO" || res.codigo === "EB_BOLETOS_NO_ACTIVABLES") {
          // El pago cambió: se cierra la confirmación y el aviso se lee en el diálogo, ya recargado
          // (con boletos vencidos, el foco pasa a "Rechazar…").
          setErrorAccion(res.error);
          await cargar();
          return { ok: true };
        }
        return { ok: false, error: res.error };
      }

      const res = await requireOnline(() => rechazarPago(pago.pago_id, motivo ?? ""))();
      if (res.success) {
        avisarExito(
          res.data.ya_procesado
            ? "Este pago ya estaba rechazado."
            : res.data.boletos_liberados
              ? "Pago rechazado. Los asientos quedaron libres y le avisamos al cliente."
              : "Pago rechazado. Le avisamos al cliente con el motivo."
        );
        enviandoRef.current = false;
        onResuelto({ aprobado: false });
        onOpenChange(false);
        return { ok: true };
      }
      if (res.codigo === "EB_MOTIVO_REQUERIDO") return { ok: false, error: res.error, campo: "motivo" };
      if (res.codigo === "EB_PAGO_YA_RESUELTO") {
        setErrorAccion(res.error);
        await cargar();
        return { ok: true };
      }
      return { ok: false, error: res.error };
    } catch (err) {
      return { ok: false, error: mensajeExcepcion(err, accion === "aprobar" ? "aprobar el pago" : "rechazar el pago") };
    } finally {
      enviandoRef.current = false;
      setEnviando(null);
    }
  };

  const copiarReferencia = async () => {
    if (!pago?.numero_referencia) return;
    try {
      await navigator.clipboard.writeText(pago.numero_referencia);
      avisarExito("Referencia copiada.");
    } catch {
      setErrorAccion("No pudimos copiar la referencia. Selecciónala y cópiala a mano.");
    }
  };

  // ── Contenido ──

  const titulo = "Verificar pago";
  const descripcion = pago ? conceptoDePago(pago) : "Compáralo con tu banco antes de aprobar.";

  let cuerpo: React.ReactNode;
  if (!pago && (cargando || !errorCarga)) {
    cuerpo = (
      <div role="status" aria-label="Cargando" className="flex flex-col gap-4">
        <div className="flex flex-col gap-2 rounded-md bg-muted/50 p-4" aria-hidden>
          <Skeleton className="h-3.5 w-40" />
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-3.5 w-32" />
        </div>
        <div className="flex flex-col gap-3" aria-hidden>
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="grid grid-cols-[8.5rem_1fr] gap-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-40" />
            </div>
          ))}
        </div>
      </div>
    );
  } else if (errorCarga && !pago) {
    cuerpo = <ErrorState compacto titulo="No pudimos cargar el pago" descripcion={errorCarga} onReintentar={cargar} />;
  } else if (pago) {
    const tasaPago: TasaRef | null =
      pago.tasa_bcv && pago.tasa_bcv_fecha ? { tasa: pago.tasa_bcv, fecha: pago.tasa_bcv_fecha } : null;
    const legado = pago.monto_bs == null && pago.moneda !== "USD";

    cuerpo = (
      <div className="flex flex-col gap-4">
        {/* Lo que debe aparecer en la cuenta */}
        <section aria-label="Monto esperado" className="flex flex-col gap-1 rounded-md bg-muted/50 p-4">
          <p className="text-xs font-medium text-muted-foreground">Debe aparecer en tu cuenta</p>
          {legado ? (
            <div className="flex flex-col">
              <span className="text-2xl font-semibold tracking-tight tabular-nums">
                {formatUsd(pago.monto_usd)}
              </span>
              <span className="text-xs text-muted-foreground">Registrado antes de la conversión a Bs.</span>
            </div>
          ) : (
            <Monto
              usd={pago.monto_usd}
              bs={pago.monto_bs}
              tasa={tasaPago}
              moneda={pago.moneda}
              size="lg"
            />
          )}
          {pago.esperado != null && pago.declarado != null && (
            <div className="mt-2">
              <Comparacion pago={pago} />
            </div>
          )}
        </section>

        {/* Avisos */}
        {(pago.referencia_repetida || pago.recurso_vencido || viajeSalio) && (
          <div className="flex flex-col gap-2">
            {pago.recurso_vencido && (
              <Aviso tono="rojo">
                {pago.tipo_recurso === "encomienda"
                  ? "Esta encomienda ya se canceló o se devolvió. Recházalo con el motivo y devuelve el dinero."
                  : "Los boletos de este pago ya vencieron o se cancelaron. Recházalo con el motivo y devuelve el dinero."}
              </Aviso>
            )}
            {pago.referencia_repetida && (
              <Aviso>Esta referencia ya aparece en otro pago de tu cooperativa. Revísala antes de aprobar.</Aviso>
            )}
            {viajeSalio && !pago.recurso_vencido && (
              <Aviso>El viaje ya salió ({formatSalidaCorta(pago.viaje_salida!)}). Si apruebas, avísale al pasajero.</Aviso>
            )}
          </div>
        )}

        {/* Datos del pago */}
        <dl className="divide-y divide-border">
          <Dato etiqueta="Pagó a">{cuentaDestino(pago)}</Dato>
          {pago.metodo_tipo !== "ZELLE" && pago.metodo_tipo !== "PUNTO_DE_VENTA" && pago.metodo_tipo !== "EFECTIVO" && (
            <Dato etiqueta="Banco del cliente">{pago.banco_emisor || "No indicado"}</Dato>
          )}
          <Dato etiqueta="Referencia">
            {pago.numero_referencia ? (
              <span className="inline-flex items-center gap-1">
                <span className="font-mono text-base font-medium">{pago.numero_referencia}</span>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => void copiarReferencia()}
                  aria-label="Copiar referencia"
                  title="Copiar referencia"
                >
                  <Copy aria-hidden />
                </Button>
              </span>
            ) : (
              "Sin referencia"
            )}
          </Dato>
          <Dato etiqueta="Fecha del pago">{pago.fecha_transaccion ? formatFechaVE(pago.fecha_transaccion) : "—"}</Dato>
          {tasaPago && (
            <Dato etiqueta="Tasa usada">
              BCV {fechaTasaCorta(tasaPago.fecha)}: Bs {formatNumeroVE(tasaPago.tasa)}
            </Dato>
          )}
          <Dato etiqueta="Cliente">
            {[
              pago.cliente_nombre || "Sin nombre",
              pago.cliente_cedula ? formatCedula(pago.cliente_cedula) : null,
              ROL_PAGADOR[pago.pagador_rol] ?? null,
            ]
              .filter(Boolean)
              .join(" · ")}
            {pago.cliente_telefono && (
              <span className="block text-xs text-muted-foreground tabular-nums">{formatTelefono(pago.cliente_telefono)}</span>
            )}
          </Dato>
          <Dato etiqueta="Registrado">{formatFechaHoraVE(pago.creado_at)}</Dato>
          {!pendiente && (
            <Dato etiqueta="Estado">
              <span className="inline-flex flex-col items-start gap-1">
                <StatusBadge status={pago.estado_verificacion} dominio="pago" />
                {pago.motivo_rechazo && (
                  <span className="text-xs text-muted-foreground">Motivo: {pago.motivo_rechazo}</span>
                )}
              </span>
            </Dato>
          )}
        </dl>

        {/* Capture del pago */}
        {pago.comprobante_path ? (
          <section aria-label="Capture del pago" className="flex flex-col gap-2">
            <p className="text-sm font-medium text-foreground">Capture del pago</p>
            {pago.comprobante_url ? (
              <a
                href={pago.comprobante_url}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Abrir el capture en otra pestaña"
                className="block overflow-hidden rounded-md border border-border bg-muted/50 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={pago.comprobante_url} alt="Capture del pago que envió el cliente" className="max-h-72 w-full object-contain" />
              </a>
            ) : (
              <p className="text-sm text-muted-foreground">No pudimos cargar el capture. Vuelve a abrir este pago.</p>
            )}
          </section>
        ) : (
          pendiente &&
          pago.metodo_tipo === "PAGO_MOVIL" && (
            <Aviso>Este pago no trae capture: se registró antes de que fuera obligatorio. Compáralo con tu banco.</Aviso>
          )
        )}

        {errorAccion && <AvisoError>{errorAccion}</AvisoError>}
      </div>
    );
  }

  // Mientras una confirmación está abierta o corre, los botones de aquí no responden (sin doble clic).
  const ocupado = enviando !== null || confirmando !== null;
  const acciones = pago && pendiente ? (
    <>
      <Button
        ref={rechazarRef}
        // Si ya no se puede aprobar, rechazar es la única salida: tono destructivo.
        variant={puedeAprobar ? "outline" : "destructive"}
        onClick={() => pedirConfirmacion("rechazar")}
        disabled={ocupado}
      >
        Rechazar…
      </Button>
      <Button
        ref={aprobarRef}
        autoFocus={puedeAprobar}
        onClick={() => pedirConfirmacion("aprobar")}
        disabled={ocupado || !puedeAprobar}
      >
        Aprobar pago…
      </Button>
    </>
  ) : (
    <Button variant="outline" onClick={cerrar}>
      Cerrar
    </Button>
  );

  // Dentro del diálogo (o de la sección embebida) para que cuente como diálogo anidado.
  const confirmacion = pago && pendiente && (
    <ConfirmarPagoDialog
      accion={confirmando}
      pago={pago}
      viajeSalio={viajeSalio}
      // Si el pago dejó de poder aprobarse ("Aprobar" queda deshabilitado), el foco va a "Rechazar…".
      focoAlCerrar={puedeAprobar ? undefined : rechazarRef}
      onCerrar={() => setConfirmando(null)}
      onConfirmar={ejecutar}
    />
  );

  if (embebido) {
    if (!open) return null;
    return (
      <section aria-labelledby={idTitulo} className="flex flex-col gap-4 rounded-md border border-border p-4">
        <header className="flex flex-col gap-1">
          <h3 id={idTitulo} className="text-base font-semibold text-foreground">
            {titulo}
          </h3>
          <p className="text-sm text-muted-foreground">{descripcion}</p>
        </header>
        {cuerpo}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">{acciones}</div>
        {confirmacion}
      </section>
    );
  }

  return (
    <Dialog open={open} onOpenChange={(abierto) => (abierto ? onOpenChange(true) : cerrar())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          <DialogDescription>{descripcion}</DialogDescription>
        </DialogHeader>
        {cuerpo}
        <DialogFooter>{acciones}</DialogFooter>
        {confirmacion}
      </DialogContent>
    </Dialog>
  );
}
