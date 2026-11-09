"use client";

// ─── Confirmar antes de aprobar o rechazar un pago ──────────────────────────
// Segundo paso del diálogo de verificación: resume monto, método, referencia y
// cliente, y dice qué va a pasar. Evita aprobar o rechazar con un clic
// involuntario.
// - Aprobar: el foco va a "Aprobar pago" (Enter, Enter sigue siendo el atajo
//   de la taquilla; se ignora la tecla mantenida pulsada).
// - Rechazar: pide el motivo (lo verá el cliente), el foco va a "Cancelar" y
//   Enter nunca rechaza (en el motivo hace un salto de línea).
// Mientras corre no se cierra (ni con Esc) ni acepta un segundo clic; el error
// se lee dentro y solo se cierra si salió bien.

import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Warning } from "@phosphor-icons/react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { AvisoError } from "@/components/aviso-error";
import { Monto } from "@/components/monto";
import { formatUsd, type TasaRef } from "@/lib/dinero";
import { humanizeError } from "@/lib/errores";
import { formatCedula } from "@/lib/ve";
import { cn } from "@/lib/utils";
import { conceptoDePago, type PagoPorVerificar } from "@/lib/types/pagos";
import { cuentaDestino, formatEnMoneda, ROL_PAGADOR, textoAsientos } from "@/components/pagos/formato-pago";

export type AccionPago = "aprobar" | "rechazar";

/**
 * Resultado de la acción: `ok` cierra la confirmación. Con `campo: "motivo"`
 * el error se muestra bajo el motivo.
 */
export type ResultadoAccionPago = { ok: true } | { ok: false; error: string; campo?: "motivo" };

export const MOTIVOS_RECHAZO_PAGO = [
  "La referencia no aparece en nuestra cuenta",
  "El monto recibido no coincide",
  "El pago llegó a otra cuenta",
  "El capture no corresponde al pago",
];

/** El servidor guarda hasta 300 caracteres del motivo. */
const MAX_MOTIVO = 300;
const MIN_MOTIVO = 5;

export type ConfirmarPagoDialogProps = {
  /** Acción a confirmar; null = cerrado. */
  accion: AccionPago | null;
  pago: PagoPorVerificar;
  /** El viaje del boleto ya salió (se avisa al aprobar). */
  viajeSalio?: boolean;
  /** Dónde queda el foco al cerrar (p. ej. "Rechazar…" si el pago ya no se puede aprobar). */
  focoAlCerrar?: React.RefObject<HTMLElement | null>;
  onCerrar: () => void;
  onConfirmar: (accion: AccionPago, motivo?: string) => Promise<ResultadoAccionPago>;
};

export function ConfirmarPagoDialog(props: ConfirmarPagoDialogProps) {
  const { accion, onCerrar } = props;
  // Vive en la raíz: mientras corre, ni Esc ni "Cancelar" cierran la confirmación.
  const enCursoRef = useRef(false);

  return (
    <AlertDialog
      open={accion !== null}
      onOpenChange={(abierto) => {
        if (!abierto && !enCursoRef.current) onCerrar();
      }}
    >
      {/* `key`: al cambiar de acción, motivo y error empiezan vacíos. */}
      {accion && <Contenido key={accion} {...props} accion={accion} enCursoRef={enCursoRef} />}
    </AlertDialog>
  );
}

function Dato({ etiqueta, children }: { etiqueta: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[6.5rem_1fr] gap-2 py-2">
      <dt className="text-muted-foreground">{etiqueta}</dt>
      <dd className="min-w-0 break-words text-foreground">{children}</dd>
    </div>
  );
}

/** Lo que va a pasar al aprobar o rechazar, según el tipo de pago y su estado. */
function impactoDe(accion: AccionPago, pago: PagoPorVerificar, viajeSalio: boolean): string[] {
  const asientos = textoAsientos(pago.asientos);
  if (accion === "aprobar") {
    if (pago.tipo_recurso === "encomienda") {
      return [
        `La encomienda${pago.tracking_id ? ` ${pago.tracking_id}` : ""} queda pagada y su envío continúa.`,
        "Le avisaremos al cliente en la app.",
      ];
    }
    const n = pago.boleto_ids?.length ?? 1;
    const lineas = [
      `${n === 1 ? "Se emitirá 1 boleto" : `Se emitirán ${n} boletos`}${asientos ? ` (${asientos})` : ""}: el cliente recibirá su pase de abordaje en la app.`,
    ];
    if (viajeSalio) lineas.push("El viaje ya salió: avísale al pasajero.");
    return lineas;
  }

  const lineas: string[] = [];
  if (pago.tipo_recurso === "boleto") {
    lineas.push(
      pago.recurso_vencido
        ? "Los boletos ya no estaban apartados: no hay asientos que liberar."
        : `Se cancelará la reserva y ${
            pago.asientos?.includes(",") ? `los ${asientos} quedarán libres` : asientos ? `el ${asientos} quedará libre` : "sus asientos quedarán libres"
          } para la venta.`
    );
  } else {
    lineas.push(
      pago.recurso_vencido
        ? "La encomienda ya está cerrada: no cambia."
        : "La encomienda no cambia: el cliente puede registrar otro pago o pagar en la taquilla."
    );
  }
  if (pago.recurso_vencido) lineas.push("Si el dinero llegó a tu cuenta, devuélveselo al cliente.");
  lineas.push("Le avisaremos al cliente en la app con el motivo que escribas.");
  return lineas;
}

function Contenido({
  accion,
  pago,
  viajeSalio = false,
  focoAlCerrar,
  onCerrar,
  onConfirmar,
  enCursoRef,
}: Omit<ConfirmarPagoDialogProps, "accion"> & {
  accion: AccionPago;
  enCursoRef: React.RefObject<boolean>;
}) {
  const uid = useId();
  const id = (s: string) => `${uid}-${s}`;
  const cancelarRef = useRef<HTMLButtonElement>(null);
  const confirmarRef = useRef<HTMLButtonElement>(null);
  const motivoRef = useRef<HTMLTextAreaElement>(null);
  const [enCurso, setEnCurso] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [errorMotivo, setErrorMotivo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const rechazar = accion === "rechazar";
  const cliente = pago.cliente_nombre || "Sin nombre";
  const legado = pago.monto_bs == null && pago.moneda !== "USD";
  const tasa: TasaRef | null =
    pago.tasa_bcv && pago.tasa_bcv_fecha ? { tasa: Number(pago.tasa_bcv), fecha: pago.tasa_bcv_fecha } : null;
  const dif =
    pago.esperado != null && pago.declarado != null ? (pago.diferencia ?? pago.declarado - pago.esperado) : null;
  const faltaDinero = dif != null && dif <= -0.01;

  const confirmar = async () => {
    if (enCursoRef.current) return; // sin doble clic
    const texto = motivo.trim();
    if (rechazar && texto.length < MIN_MOTIVO) {
      setErrorMotivo(`Escribe el motivo del rechazo (mínimo ${MIN_MOTIVO} caracteres). El cliente lo verá.`);
      motivoRef.current?.focus();
      return;
    }
    enCursoRef.current = true;
    setEnCurso(true);
    setError(null);
    try {
      const res = await onConfirmar(accion, rechazar ? texto : undefined);
      if (res.ok) {
        enCursoRef.current = false;
        onCerrar();
        return;
      }
      if (res.campo === "motivo") {
        setErrorMotivo(res.error);
        motivoRef.current?.focus();
      } else {
        setError(res.error);
      }
    } catch (err) {
      setError(humanizeError(err, rechazar ? "rechazar el pago" : "aprobar el pago"));
    } finally {
      enCursoRef.current = false;
      setEnCurso(false);
    }
  };

  // Enter mantenido pulsado (repetición del teclado) no confirma: hace falta soltar y volver a pulsar.
  const ignorarRepeticion = (e: KeyboardEvent) => {
    if (e.key === "Enter" && e.repeat) e.preventDefault();
  };

  const impacto = impactoDe(accion, pago, viajeSalio);

  return (
    <AlertDialogContent
      initialFocus={rechazar ? cancelarRef : confirmarRef}
      finalFocus={focoAlCerrar ?? true}
      onKeyDownCapture={ignorarRepeticion}
    >
      <AlertDialogHeader>
        <AlertDialogTitle>{rechazar ? `¿Rechazar el pago de ${cliente}?` : `¿Aprobar el pago de ${cliente}?`}</AlertDialogTitle>
        <AlertDialogDescription>
          {rechazar
            ? "No se puede deshacer."
            : "Apruébalo solo si ya lo ves en tu cuenta. No se puede deshacer."}
        </AlertDialogDescription>
      </AlertDialogHeader>

      {/* Resumen del pago */}
      <dl aria-label="Resumen del pago" className="divide-y divide-border rounded-md border border-border px-3 text-sm">
        <Dato etiqueta="Monto">
          {legado ? (
            <span className="font-medium tabular-nums">{formatUsd(pago.monto_usd)}</span>
          ) : (
            <Monto usd={pago.monto_usd} bs={pago.monto_bs} tasa={tasa} moneda={pago.moneda} size="sm" />
          )}
          {pago.declarado != null && dif != null && Math.abs(dif) >= 0.01 && (
            <span className={cn("block text-xs", faltaDinero ? "text-warning-text" : "text-muted-foreground")}>
              El cliente dice que pagó {formatEnMoneda(pago.declarado, pago.moneda)}
            </span>
          )}
        </Dato>
        <Dato etiqueta="Método">
          {cuentaDestino(pago)}
          {pago.metodo_tipo !== "ZELLE" && pago.banco_emisor && (
            <span className="block text-xs text-muted-foreground">Desde {pago.banco_emisor}</span>
          )}
        </Dato>
        <Dato etiqueta="Referencia">
          {pago.numero_referencia ? (
            <span className="font-mono font-medium">{pago.numero_referencia}</span>
          ) : (
            "Sin referencia"
          )}
        </Dato>
        <Dato etiqueta="Cliente">
          {[cliente, pago.cliente_cedula ? formatCedula(pago.cliente_cedula) : null, ROL_PAGADOR[pago.pagador_rol] ?? null]
            .filter(Boolean)
            .join(" · ")}
        </Dato>
        <Dato etiqueta="Concepto">{conceptoDePago(pago)}</Dato>
      </dl>

      {/* Avisos que conviene releer antes de aprobar */}
      {!rechazar && (faltaDinero || pago.referencia_repetida) && (
        <Alert variant="warning">
          <Warning weight="fill" aria-hidden />
          <AlertDescription>
            {faltaDinero && (
              <span className="block">
                Faltan {formatEnMoneda(Math.abs(dif!), pago.moneda)} según lo que declaró el cliente.
              </span>
            )}
            {pago.referencia_repetida && (
              <span className="block">Esta referencia ya aparece en otro pago de tu cooperativa.</span>
            )}
          </AlertDescription>
        </Alert>
      )}

      <div className="rounded-md border border-border bg-muted/50 p-4 text-sm">
        <p className="mb-2 font-semibold">Qué va a pasar</p>
        <ul className="list-disc space-y-1.5 pl-5 text-foreground">
          {impacto.map((linea) => (
            <li key={linea}>{linea}</li>
          ))}
        </ul>
      </div>

      {rechazar && (
        <div className="grid content-start gap-2">
          <Label htmlFor={id("motivo")}>Motivo del rechazo (lo verá el cliente)</Label>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Motivos frecuentes">
            {MOTIVOS_RECHAZO_PAGO.map((m) => {
              const activo = motivo === m;
              return (
                <Button
                  key={m}
                  type="button"
                  variant="outline"
                  size="xs"
                  aria-pressed={activo}
                  disabled={enCurso}
                  className={cn(
                    activo &&
                      "border-accent-strong bg-accent-strong text-accent-strong-foreground hover:bg-accent-strong hover:text-accent-strong-foreground"
                  )}
                  onClick={() => {
                    setMotivo(m);
                    setErrorMotivo(null);
                  }}
                >
                  {m}
                </Button>
              );
            })}
          </div>
          <Textarea
            id={id("motivo")}
            ref={motivoRef}
            value={motivo}
            rows={3}
            maxLength={MAX_MOTIVO}
            disabled={enCurso}
            placeholder="Ej.: La referencia no aparece en nuestra cuenta de Banesco."
            aria-invalid={errorMotivo ? true : undefined}
            aria-describedby={errorMotivo ? id("motivo-error") : id("motivo-ayuda")}
            onChange={(e) => {
              setMotivo(e.target.value);
              if (errorMotivo) setErrorMotivo(null);
            }}
          />
          {errorMotivo ? (
            <p id={id("motivo-error")} className="text-sm text-destructive-text">
              {errorMotivo}
            </p>
          ) : (
            <p id={id("motivo-ayuda")} className="text-sm text-muted-foreground">
              Obligatorio · mínimo {MIN_MOTIVO} caracteres.
            </p>
          )}
        </div>
      )}

      {error && <AvisoError>{error}</AvisoError>}

      <AlertDialogFooter>
        <Button ref={cancelarRef} type="button" variant="outline" disabled={enCurso} onClick={onCerrar}>
          Cancelar
        </Button>
        <Button
          ref={confirmarRef}
          type="button"
          variant={rechazar ? "destructive" : "default"}
          disabled={enCurso}
          aria-busy={enCurso || undefined}
          onClick={() => void confirmar()}
        >
          {enCurso && <Spinner size="sm" aria-hidden />}
          {enCurso ? (rechazar ? "Rechazando…" : "Aprobando…") : rechazar ? "Rechazar pago" : "Aprobar pago"}
        </Button>
      </AlertDialogFooter>
    </AlertDialogContent>
  );
}
