"use client";

// ─── Verificar un pago registrado por un cliente ────────────────────────────
// Diálogo único para la bandeja "Pagos por verificar", la taquilla de boletos,
// el embarque, el cobro y la entrega de encomiendas. Muestra lo que debe
// aparecer en la cuenta de la cooperativa frente a lo que el cliente declaró,
// y permite aprobar o rechazar (con motivo que se le envía al cliente).
//
// `embebido`: se dibuja dentro de otro diálogo (sin Dialog propio).

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { toast } from "sonner";
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
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { Monto } from "@/components/monto";
import { StatusBadge } from "@/components/status-badge";
import { requireOnline } from "@/components/connectivity-banner";
import { fechaTasaCorta, formatBs, formatNumeroVE, formatUsd, type TasaRef } from "@/lib/dinero";
import { humanizeError } from "@/lib/errores";
import { cn, dateFormatterDayMonthTime12h } from "@/lib/utils";
import {
  conceptoDePago,
  formatSalidaCorta,
  type PagadorRol,
  type PagoPorVerificar,
} from "@/lib/types/pagos";
import { aprobarPago, obtenerPago, rechazarPago } from "@/app/cooperativas/(panel)/pagos/actions";

// `conceptoDePago` vive en lib/types/pagos (se puede usar en Server Components);
// se re-exporta aquí por comodidad para componentes de cliente.
export { conceptoDePago };

const MSG_SIN_CONEXION = "Esta operación requiere conexión a internet.";

/** Error inesperado (red, servidor) en texto para el usuario. */
function mensajeExcepcion(err: unknown, accion: string) {
  if (typeof navigator !== "undefined" && !navigator.onLine) return MSG_SIN_CONEXION;
  return humanizeError(err, accion);
}

export type VerificarPagoDialogProps = {
  pagoId: string;
  open: boolean;
  onOpenChange: (abierto: boolean) => void;
  onResuelto: (r: { aprobado: boolean }) => void;
  embebido?: boolean;
};

const MOTIVOS_SUGERIDOS = [
  "La referencia no aparece en nuestra cuenta",
  "El monto recibido no coincide",
  "El pago llegó a otra cuenta",
];

const ROLES: Record<PagadorRol, string> = {
  PASAJERO: "Pasajero",
  REMITENTE: "Remitente",
  DESTINATARIO: "Destinatario",
  OTRO: "Cliente",
};

/** "2026-10-02" -> "02/10/2026" (fecha de calendario, sin zona horaria). */
function formatFechaCalendario(fecha: string | null) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(fecha ?? "");
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "—";
}

function formatEnMoneda(monto: number, moneda: "VES" | "USD") {
  return moneda === "USD" ? formatUsd(monto) : formatBs(monto);
}

/** "Pago Móvil a Banesco ••••4567 (Transportes C.A.)" / "Zelle a pagos@coop.com" */
function cuentaDestino(p: PagoPorVerificar): string {
  const titular = p.cuenta_titular ? ` (${p.cuenta_titular})` : "";
  const final = p.cuenta_final ? ` ••••${p.cuenta_final}` : "";
  switch (p.metodo_tipo) {
    case "ZELLE":
      return `Zelle a ${p.cuenta_email_zelle ?? "la cuenta de la cooperativa"}${titular}`;
    case "PAGO_MOVIL":
      return `Pago Móvil a ${p.cuenta_banco ?? "la cooperativa"}${final}${titular}`;
    case "TRANSFERENCIA_BANCARIA":
      return `Transferencia a ${p.cuenta_banco ?? "la cooperativa"}${final}${titular}`;
    case "EFECTIVO":
      return "Efectivo en taquilla";
    default:
      return "Forma de pago no indicada";
  }
}

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
        "flex items-start gap-2 rounded-xl border px-3 py-2 text-sm",
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
        {falta && " Confirma en tu banco cuánto llegó antes de aprobar."}
      </span>
    </div>
  );
}

function Aviso({ children, tono = "ambar" }: { children: React.ReactNode; tono?: "ambar" | "rojo" }) {
  return (
    <div
      role="alert"
      className={cn(
        "flex items-start gap-2 rounded-xl border px-3 py-2 text-sm",
        tono === "rojo"
          ? "border-destructive/40 bg-destructive-light text-destructive-deep"
          : "border-warning/40 bg-warning-light text-warning-deep"
      )}
    >
      <Warning weight="fill" className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span>{children}</span>
    </div>
  );
}

function Dato({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[8.5rem_1fr] gap-2 py-1.5 text-sm">
      <dt className="text-muted-foreground">{etiqueta}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
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
  const [rechazando, setRechazando] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [errorMotivo, setErrorMotivo] = useState<string | null>(null);
  const [enviando, setEnviando] = useState<"aprobar" | "rechazar" | null>(null);
  const enviandoRef = useRef(false);
  const aprobarRef = useRef<HTMLButtonElement>(null);
  const motivoRef = useRef<HTMLTextAreaElement>(null);
  const idMotivo = useId();
  const idErrorMotivo = useId();

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
      setRechazando(false);
      setMotivo("");
      setErrorMotivo(null);
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

  // Foco en "Aprobar pago" cuando el pago termina de cargar.
  useEffect(() => {
    if (open && puedeAprobar && !rechazando) aprobarRef.current?.focus();
  }, [open, puedeAprobar, rechazando]);

  const cerrar = useCallback(() => {
    if (enviandoRef.current) return;
    onOpenChange(false);
  }, [onOpenChange]);

  const aprobar = async () => {
    if (!pago || enviandoRef.current) return;
    enviandoRef.current = true;
    setEnviando("aprobar");
    try {
      const res = await requireOnline(() => aprobarPago(pago.pago_id))();
      if (res.success) {
        if (res.data.ya_procesado) {
          toast.info("Este pago ya estaba aprobado.");
        } else {
          toast.success(
            pago.tipo_recurso === "encomienda"
              ? "Pago aprobado. El envío del cliente continúa."
              : "Pago aprobado. El cliente ya puede usar su boleto."
          );
        }
        enviandoRef.current = false;
        onResuelto({ aprobado: true });
        onOpenChange(false);
        return;
      }
      toast.error(res.error);
      if (res.codigo === "EB_PAGO_YA_RESUELTO" || res.codigo === "EB_BOLETOS_NO_ACTIVABLES") {
        await cargar();
        if (res.codigo === "EB_BOLETOS_NO_ACTIVABLES") setRechazando(true);
      }
    } catch (err) {
      toast.error(mensajeExcepcion(err, "aprobar el pago"));
    } finally {
      enviandoRef.current = false;
      setEnviando(null);
    }
  };

  const rechazar = async () => {
    if (!pago || enviandoRef.current) return;
    const texto = motivo.trim();
    if (texto.length < 5) {
      setErrorMotivo("Escribe el motivo del rechazo (mínimo 5 caracteres). El cliente lo verá.");
      motivoRef.current?.focus();
      return;
    }
    enviandoRef.current = true;
    setEnviando("rechazar");
    try {
      const res = await requireOnline(() => rechazarPago(pago.pago_id, texto))();
      if (res.success) {
        toast.success(
          res.data.ya_procesado
            ? "Este pago ya estaba rechazado."
            : "Pago rechazado. Le avisamos al cliente con el motivo."
        );
        enviandoRef.current = false;
        onResuelto({ aprobado: false });
        onOpenChange(false);
        return;
      }
      if (res.codigo === "EB_MOTIVO_REQUERIDO") {
        setErrorMotivo(res.error);
        motivoRef.current?.focus();
      } else {
        toast.error(res.error);
      }
      if (res.codigo === "EB_PAGO_YA_RESUELTO") await cargar();
    } catch (err) {
      toast.error(mensajeExcepcion(err, "rechazar el pago"));
    } finally {
      enviandoRef.current = false;
      setEnviando(null);
    }
  };

  const copiarReferencia = async () => {
    if (!pago?.numero_referencia) return;
    try {
      await navigator.clipboard.writeText(pago.numero_referencia);
      toast.success("Referencia copiada.");
    } catch {
      toast.error("No pudimos copiar la referencia. Selecciónala y cópiala a mano.");
    }
  };

  // ── Contenido ──

  const titulo = "Verificar pago";
  const descripcion = pago
    ? conceptoDePago(pago)
    : "Compara el pago con tu cuenta bancaria antes de aprobarlo.";

  let cuerpo: React.ReactNode;
  if (!pago && (cargando || !errorCarga)) {
    cuerpo = (
      <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
        <Spinner size="sm" aria-label="Cargando" /> Cargando el pago…
      </div>
    );
  } else if (errorCarga && !pago) {
    cuerpo = (
      <div className="flex flex-col items-start gap-3 py-4">
        <Aviso tono="rojo">{errorCarga}</Aviso>
        <Button variant="outline" size="sm" onClick={() => void cargar()}>
          Reintentar
        </Button>
      </div>
    );
  } else if (pago) {
    const tasaPago: TasaRef | null =
      pago.tasa_bcv && pago.tasa_bcv_fecha ? { tasa: pago.tasa_bcv, fecha: pago.tasa_bcv_fecha } : null;
    const legado = pago.monto_bs == null && pago.moneda !== "USD";
    const viajeSalio =
      pago.tipo_recurso === "boleto" && pago.viaje_salida && new Date(pago.viaje_salida).getTime() < cargadoAt;

    cuerpo = (
      <div className="flex flex-col gap-4">
        {/* Lo que debe aparecer en la cuenta */}
        <section aria-label="Monto esperado" className="rounded-2xl bg-muted/50 p-4">
          <p className="mb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Debe aparecer en tu cuenta
          </p>
          {legado ? (
            <div className="flex flex-col">
              <span className="text-2xl font-semibold tracking-tight tabular-nums">
                {formatUsd(pago.monto_usd)}
              </span>
              <span className="text-xs text-muted-foreground">
                Pago registrado antes de la conversión a Bs: referencia {formatUsd(pago.monto_usd)}.
              </span>
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
          <div className="mt-3">
            <Comparacion pago={pago} />
          </div>
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
        <dl className="divide-y divide-border/60">
          <Dato etiqueta="Pagó a">{cuentaDestino(pago)}</Dato>
          {pago.metodo_tipo !== "ZELLE" && (
            <Dato etiqueta="Banco del cliente">{pago.banco_emisor || "No indicado"}</Dato>
          )}
          <Dato etiqueta="Referencia">
            {pago.numero_referencia ? (
              <span className="inline-flex items-center gap-1">
                <span className="font-mono text-base font-medium tracking-wider">{pago.numero_referencia}</span>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => void copiarReferencia()}
                  aria-label="Copiar referencia"
                  title="Copiar referencia"
                >
                  <Copy />
                </Button>
              </span>
            ) : (
              "Sin referencia"
            )}
          </Dato>
          <Dato etiqueta="Fecha del pago">{formatFechaCalendario(pago.fecha_transaccion)}</Dato>
          {tasaPago && (
            <Dato etiqueta="Tasa usada">
              BCV {fechaTasaCorta(tasaPago.fecha)}: Bs {formatNumeroVE(tasaPago.tasa)}
            </Dato>
          )}
          <Dato etiqueta="Cliente">
            {[pago.cliente_nombre || "Sin nombre", pago.cliente_cedula, ROLES[pago.pagador_rol] ?? null]
              .filter(Boolean)
              .join(" · ")}
            {pago.cliente_telefono && (
              <span className="block text-xs text-muted-foreground">{pago.cliente_telefono}</span>
            )}
          </Dato>
          <Dato etiqueta="Registrado">{dateFormatterDayMonthTime12h.format(new Date(pago.creado_at))}</Dato>
          {!pendiente && (
            <Dato etiqueta="Estado">
              <span className="inline-flex flex-col items-start gap-1">
                <StatusBadge status={pago.estado_verificacion} />
                {pago.motivo_rechazo && (
                  <span className="text-xs text-muted-foreground">Motivo: {pago.motivo_rechazo}</span>
                )}
              </span>
            </Dato>
          )}
        </dl>

        {!pendiente && (
          <p className="text-sm text-muted-foreground">Este pago ya fue resuelto; no hay nada más que hacer.</p>
        )}

        {/* Rechazo */}
        {pendiente && rechazando && (
          <div className="flex flex-col gap-2">
            <label htmlFor={idMotivo} className="text-sm font-medium">
              Motivo del rechazo (se le enviará al cliente)
            </label>
            <div className="flex flex-wrap gap-1.5">
              {MOTIVOS_SUGERIDOS.map((m) => (
                <Button
                  key={m}
                  type="button"
                  variant={motivo === m ? "secondary" : "outline"}
                  size="xs"
                  aria-pressed={motivo === m}
                  onClick={() => {
                    setMotivo(m);
                    setErrorMotivo(null);
                  }}
                >
                  {m}
                </Button>
              ))}
            </div>
            <Textarea
              id={idMotivo}
              ref={motivoRef}
              value={motivo}
              maxLength={300}
              autoFocus
              placeholder="Ej.: La referencia no aparece en nuestra cuenta de Banesco."
              aria-invalid={errorMotivo ? true : undefined}
              aria-describedby={errorMotivo ? idErrorMotivo : undefined}
              onChange={(e) => {
                setMotivo(e.target.value);
                if (errorMotivo) setErrorMotivo(null);
              }}
            />
            {errorMotivo && (
              <p id={idErrorMotivo} className="text-sm text-destructive">
                {errorMotivo}
              </p>
            )}
          </div>
        )}
      </div>
    );
  }

  const ocupado = enviando !== null;
  const acciones = pago && pendiente ? (
    rechazando ? (
      <>
        <Button variant="outline" onClick={() => setRechazando(false)} disabled={ocupado}>
          Volver
        </Button>
        <Button variant="destructive" onClick={() => void rechazar()} disabled={ocupado}>
          {enviando === "rechazar" ? "Rechazando…" : "Rechazar y avisar al cliente"}
        </Button>
      </>
    ) : (
      <>
        <Button variant="outline" onClick={() => setRechazando(true)} disabled={ocupado}>
          Rechazar…
        </Button>
        <Button
          ref={aprobarRef}
          autoFocus={puedeAprobar}
          onClick={() => void aprobar()}
          disabled={ocupado || !puedeAprobar}
        >
          {enviando === "aprobar" ? "Aprobando…" : "Aprobar pago"}
        </Button>
      </>
    )
  ) : (
    <Button variant="outline" onClick={cerrar}>
      Cerrar
    </Button>
  );

  if (embebido) {
    if (!open) return null;
    return (
      <section aria-labelledby={`${idMotivo}-titulo`} className="flex flex-col gap-4 rounded-2xl border p-4">
        <header className="flex flex-col gap-1">
          <h3 id={`${idMotivo}-titulo`} className="font-heading text-base font-medium">
            {titulo}
          </h3>
          <p className="text-sm text-muted-foreground">{descripcion}</p>
        </header>
        {cuerpo}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">{acciones}</div>
      </section>
    );
  }

  return (
    <Dialog open={open} onOpenChange={(abierto) => (abierto ? onOpenChange(true) : cerrar())}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          <DialogDescription>{descripcion}</DialogDescription>
        </DialogHeader>
        {cuerpo}
        <DialogFooter>{acciones}</DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
