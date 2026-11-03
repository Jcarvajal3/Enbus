"use client";

// ─── Entrega en destino (#34) ───────────────────────────────────────────────
// Pasos: 1 Cobro (solo si paga quien recibe y no hay pago aprobado) → 2 PIN
// (validado en el servidor; 10 intentos) → 3 Identidad (cédula revisada,
// obligatoria; puede retirar otra persona autorizada) → "Entregar encomienda".
// fn_entregar_encomienda vuelve a revisar todo: cobro (EB_COBRO_PENDIENTE),
// PIN (EB_PIN_INCORRECTO / EB_PIN_BLOQUEADO) y cédula (EB_CEDULA_NO_VERIFICADA).
// PIN bloqueado: el administrador lo desbloquea o entrega sin PIN con motivo;
// el taquillero ve a quién pedírselo.

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { CheckCircle, LockKey, Warning, WhatsappLogo } from "@phosphor-icons/react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { createClient } from "@/lib/supabase/client";
import { PinInput } from "./pin-input";
import { confirmarEntrega, desbloquearPin } from "@/app/cooperativas/(panel)/entrega/actions";
import {
  obtenerEstadoCobro,
  type EstadoCobroEncomienda,
} from "@/app/cooperativas/(panel)/taquilla/encomiendas/actions";
import { requireOnline } from "@/components/connectivity-banner";
import { useTasaBCV } from "@/components/tasa-bcv-provider";
import { useUser } from "@/hooks/use-user";
import { VerificarPagoDialog } from "@/components/pagos/verificar-pago-dialog";
import { CobroEncomiendaForm } from "@/components/encomiendas/pago-modal";
import { remitenteDe } from "@/components/encomiendas/detalle-sheet";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { ErrorState } from "@/components/error-state";
import { Monto } from "@/components/monto";
import { formatBs, formatUsd, usdABs } from "@/lib/dinero";
import { humanizeError, isNetworkError } from "@/lib/errores";
import { fechaVE, hoyVE } from "@/lib/fechas";
import { MODALIDAD_PAGO } from "@/lib/estados";
import { CEDULA_ERROR, CEDULA_PLACEHOLDER, cedulaValida, formatCedula, formatTelefono, telefonoWhatsApp } from "@/lib/ve";
import type { Encomienda } from "@/lib/types/encomiendas";
import { cn } from "@/lib/utils";

type EntregaEncomienda = Pick<
  Encomienda,
  | "id"
  | "tracking_id"
  | "receiver_nombre"
  | "receiver_telefono"
  | "receiver_cedula_rif"
  | "descripcion_contenido"
  | "modalidad_pago"
  | "peso_kg"
  | "costo_calculado"
  | "estado"
  | "cooperativa_id"
  | "origen_registro"
  | "remitente_nombre"
  | "remitente_cedula"
  | "remitente_telefono"
  | "sender"
> & {
  updated_at: string;
  pin_bloqueado: boolean;
  intentos_pin: number;
};

interface EntregaModalProps {
  encomiendaId: string | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

/** Días hábiles para la devolución automática al remitente (auto_devolver_encomienda). */
export const DIAS_HABILES_DEVOLUCION = 5;

/**
 * Días hábiles (lunes a viernes, hora de Venezuela) desde una fecha ISO hasta
 * hoy, sin contar el día de inicio: espejo de `calcular_dias_habiles` (SQL).
 */
export function diasHabilesDesde(iso: string): number {
  const desde = fechaVE(iso);
  const hoy = hoyVE();
  const [y1, m1, d1] = desde.split("-").map(Number);
  const [y2, m2, d2] = hoy.split("-").map(Number);
  const dia = 86_400_000;
  let t = Date.UTC(y1, m1 - 1, d1) + dia;
  const fin = Date.UTC(y2, m2 - 1, d2);
  if (!Number.isFinite(t) || !Number.isFinite(fin)) return 0;
  let dias = 0;
  for (let i = 0; t <= fin && i < 800; i++, t += dia) {
    const semana = new Date(t).getUTCDay();
    if (semana !== 0 && semana !== 6) dias++;
  }
  return dias;
}

/** "Se devuelve al remitente en 3 días hábiles" / "…hoy". */
export function textoDevolucion(diasHabiles: number): string {
  const faltan = DIAS_HABILES_DEVOLUCION - diasHabiles;
  if (faltan <= 0) return "Se devuelve al remitente hoy";
  return `Se devuelve al remitente en ${faltan} ${faltan === 1 ? "día hábil" : "días hábiles"}`;
}

const MSG_SIN_CONEXION = "Sin conexión: esta operación necesita internet. Revisa tu conexión e intenta de nuevo.";

function mensajeExcepcion(err: unknown, accion: string) {
  if (isNetworkError(err)) return MSG_SIN_CONEXION;
  return humanizeError(err, accion);
}

/** WhatsApp de soporte de EnBus (NEXT_PUBLIC_SOPORTE_WHATSAPP), o null si no está configurado. */
function soporteWhatsApp(): { numero: string; enlace: string } | null {
  const crudo = process.env.NEXT_PUBLIC_SOPORTE_WHATSAPP ?? "";
  const digitos = telefonoWhatsApp(crudo) ?? (crudo.replace(/\D/g, "") || null);
  if (!digitos) return null;
  const legible = formatTelefono(digitos);
  return { numero: legible === "—" ? `+${digitos}` : legible, enlace: `https://wa.me/${digitos}` };
}

type Paso = "cobro" | "pin" | "identidad";

export function EntregaModal({ encomiendaId, isOpen, onClose, onSuccess }: EntregaModalProps) {
  const supabase = useMemo(() => createClient(), []);
  const tasa = useTasaBCV();
  const { user } = useUser();
  const esAdmin = user.role === "admin_cooperativa";
  const uid = useId();
  const id = (s: string) => `${uid}-${s}`;

  const [loading, setLoading] = useState(true);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [encomienda, setEncomienda] = useState<EntregaEncomienda | null>(null);
  const [cobro, setCobro] = useState<EstadoCobroEncomienda | null>(null);
  const [errorCobro, setErrorCobro] = useState<string | null>(null);

  // PIN
  const [pinValidado, setPinValidado] = useState<string | null>(null);
  const [pinBloqueado, setPinBloqueado] = useState(false);
  const [intentos, setIntentos] = useState(0);
  const [pinKey, setPinKey] = useState(0);
  const [avisoPin, setAvisoPin] = useState<string | null>(null);
  const [sinPinMotivo, setSinPinMotivo] = useState<string | null>(null);
  const [desbloquearOpen, setDesbloquearOpen] = useState(false);
  const [sinPinOpen, setSinPinOpen] = useState(false);

  // Identidad
  const [cedulaRevisada, setCedulaRevisada] = useState(false);
  const [tercero, setTercero] = useState(false);
  const [terceroNombre, setTerceroNombre] = useState("");
  const [terceroCedula, setTerceroCedula] = useState("");
  const [errores, setErrores] = useState<{ cedula?: string; nombre?: string; terceroCedula?: string; general?: string }>({});
  const [isConfirming, setIsConfirming] = useState(false);

  const cargarCobro = useCallback(async (encId: string) => {
    setErrorCobro(null);
    try {
      const res = await obtenerEstadoCobro(encId);
      if (res.success) {
        setCobro(res.data);
      } else {
        setCobro(null);
        setErrorCobro(res.error);
      }
    } catch (err) {
      setCobro(null);
      setErrorCobro(mensajeExcepcion(err, "revisar el pago de la encomienda"));
    }
  }, []);

  const cargar = useCallback(async () => {
    if (!encomiendaId) return;
    setLoading(true);
    setErrorCarga(null);
    try {
      const { data: enc, error: encError } = await supabase
        .from("encomiendas")
        .select(`
          id, tracking_id, receiver_nombre, receiver_telefono, receiver_cedula_rif,
          descripcion_contenido, modalidad_pago, peso_kg, costo_calculado, estado,
          updated_at, pin_bloqueado, intentos_pin, cooperativa_id,
          origen_registro, remitente_nombre, remitente_cedula, remitente_telefono,
          sender:profiles!sender_id(nombre_completo)
        `)
        .eq("id", encomiendaId)
        .single();
      if (encError) throw encError;

      const e = enc as unknown as EntregaEncomienda;
      setEncomienda(e);
      setPinBloqueado(Boolean(e.pin_bloqueado));
      setIntentos(e.intentos_pin || 0);
      if (e.modalidad_pago === "DESTINO") await cargarCobro(e.id);
    } catch (err) {
      setErrorCarga(mensajeExcepcion(err, "cargar los datos de la encomienda"));
    } finally {
      setLoading(false);
    }
  }, [encomiendaId, supabase, cargarCobro]);

  // Cada apertura empieza de cero.
  const cargarRef = useRef(cargar);
  useEffect(() => {
    cargarRef.current = cargar;
  }, [cargar]);
  useEffect(() => {
    if (!isOpen || !encomiendaId) return;
    /* eslint-disable react-hooks/set-state-in-effect -- reinicio del formulario al abrir */
    setEncomienda(null);
    setCobro(null);
    setErrorCobro(null);
    setPinValidado(null);
    setPinBloqueado(false);
    setIntentos(0);
    setPinKey((k) => k + 1);
    setAvisoPin(null);
    setSinPinMotivo(null);
    setCedulaRevisada(false);
    setTercero(false);
    setTerceroNombre("");
    setTerceroCedula("");
    setErrores({});
    /* eslint-enable react-hooks/set-state-in-effect */
    void cargarRef.current();
  }, [isOpen, encomiendaId]);

  const cobroEnDestino = encomienda?.modalidad_pago === "DESTINO";
  const pagoOk = !cobroEnDestino || cobro?.aprobado === true;
  const pinOk = Boolean(pinValidado) || Boolean(sinPinMotivo);
  const paso: Paso = !pagoOk ? "cobro" : !pinOk ? "pin" : "identidad";
  const pasos: { id: Paso; titulo: string }[] = [
    ...(cobroEnDestino ? [{ id: "cobro" as Paso, titulo: "Cobro" }] : []),
    { id: "pin", titulo: "PIN" },
    { id: "identidad", titulo: "Identidad" },
  ];
  const indicePaso = pasos.findIndex((p) => p.id === paso);

  const textoFaltaCobrar = () => {
    const usd = Number(encomienda?.costo_calculado ?? 0);
    return tasa
      ? `Falta cobrar el envío: ${formatBs(usdABs(usd, tasa.tasa))} (${formatUsd(usd)}). Cóbralo antes de entregar.`
      : `Falta cobrar el envío: ${formatUsd(usd)}. Cóbralo antes de entregar.`;
  };

  const volverAlPin = (aviso: string) => {
    setPinValidado(null);
    setPinKey((k) => k + 1);
    setAvisoPin(aviso);
  };

  const handleEntregar = async () => {
    if (!encomienda || isConfirming) return;
    const nuevos: typeof errores = {};
    if (!cedulaRevisada) nuevos.cedula = "Revisa la cédula de quien retira y marca la casilla.";
    if (tercero) {
      if (terceroNombre.trim().length < 3) nuevos.nombre = "Escribe el nombre y apellido de quien retira.";
      if (!cedulaValida(terceroCedula)) nuevos.terceroCedula = CEDULA_ERROR;
    }
    setErrores(nuevos);
    if (Object.keys(nuevos).length > 0) return;

    setIsConfirming(true);
    try {
      const result = await requireOnline(() =>
        confirmarEntrega({
          encomiendaId: encomienda.id,
          pin: pinValidado,
          cedulaVerificada: cedulaRevisada,
          retiraTercero: tercero,
          retiroNombre: tercero ? terceroNombre : null,
          retiroCedula: tercero ? terceroCedula : null,
          sinPinMotivo,
        })
      )();

      if (result.success) {
        const nombre = result.data.retiro_nombre || encomienda.receiver_nombre;
        toast.success(
          result.data.ya_procesado
            ? `La encomienda ${encomienda.tracking_id} ya estaba entregada.`
            : `Encomienda ${encomienda.tracking_id} entregada a ${nombre}.`
        );
        onSuccess?.();
        onClose();
        return;
      }
      switch (result.codigo) {
        case "EB_COBRO_PENDIENTE":
          toast.error(textoFaltaCobrar());
          await cargarCobro(encomienda.id);
          break;
        case "EB_PIN_INCORRECTO":
          volverAlPin("El PIN no coincide. Pídelo de nuevo a quien retira.");
          break;
        case "EB_PIN_BLOQUEADO":
          setPinBloqueado(true);
          volverAlPin(result.error);
          break;
        case "EB_CEDULA_NO_VERIFICADA":
          setErrores({ cedula: result.error });
          break;
        case "EB_ESTADO_CAMBIO":
        case "EB_NO_ENCONTRADO":
          toast.error(result.error);
          onSuccess?.();
          onClose();
          break;
        default:
          if (result.detalle?.campo === "tercero") setErrores({ general: result.error, nombre: " ", terceroCedula: " " });
          else setErrores({ general: result.error });
      }
    } catch (err) {
      setErrores({ general: mensajeExcepcion(err, "entregar la encomienda") });
    } finally {
      setIsConfirming(false);
    }
  };

  if (!isOpen) return null;

  const soporte = soporteWhatsApp();
  const remitente = encomienda ? remitenteDe(encomienda) : null;
  const diasHabiles = encomienda ? diasHabilesDesde(encomienda.updated_at) : 0;

  // ── Paso 1: cobro ──
  let seccionCobro: React.ReactNode = null;
  if (encomienda && cobroEnDestino && paso === "cobro") {
    if (errorCobro) {
      seccionCobro = (
        <ErrorState compacto titulo="No pudimos revisar el pago" descripcion={errorCobro} onReintentar={() => cargarCobro(encomienda.id)} />
      );
    } else if (cobro?.pendiente) {
      seccionCobro = (
        <VerificarPagoDialog
          embebido
          open
          pagoId={cobro.pendiente.id}
          onOpenChange={() => void cargarCobro(encomienda.id)}
          onResuelto={() => void cargarCobro(encomienda.id)}
        />
      );
    } else if (cobro) {
      seccionCobro = (
        <div className="space-y-4">
          <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100">
            <Warning size={20} weight="fill" className="mt-0.5 shrink-0" aria-hidden />
            <div className="flex flex-col gap-1">
              <span className="font-medium">
                {MODALIDAD_PAGO.DESTINO.corto}: cobra el envío antes de entregarlo.
              </span>
              {cobro.rechazado && (
                <span className="text-sm">
                  El último pago reportado se rechazó{cobro.rechazado.motivo ? `: ${cobro.rechazado.motivo}` : ""}.
                </span>
              )}
            </div>
          </div>
          <CobroEncomiendaForm
            encomienda={encomienda}
            onCobrado={() => void cargarCobro(encomienda.id)}
            onCambioExterno={() => void cargarCobro(encomienda.id)}
          />
        </div>
      );
    } else {
      seccionCobro = (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner size="sm" aria-label="Cargando" /> Revisando el pago…
        </p>
      );
    }
  }

  // ── Paso 2: PIN ──
  const seccionPin = encomienda && paso === "pin" && (
    <div className="space-y-3">
      {avisoPin && !pinBloqueado && (
        <p role="alert" className="text-center text-sm font-medium text-destructive-text">
          {avisoPin}
        </p>
      )}
      <div className="rounded-md border border-dashed bg-background p-4">
        <PinInput
          key={pinKey}
          encomiendaId={encomienda.id}
          initialIntentos={intentos}
          initialBloqueado={pinBloqueado}
          onValidado={(pin) => {
            setAvisoPin(null);
            setPinValidado(pin);
          }}
          onBlocked={() => {
            setPinBloqueado(true);
            setPinValidado(null);
          }}
        />
      </div>
      {pinBloqueado ? (
        esAdmin ? (
          <div className="space-y-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
            <p className="font-medium text-destructive-text">El PIN se bloqueó por intentos fallidos.</p>
            <p className="text-muted-foreground">
              Desbloquéalo si quien retira recuerda el PIN, o entrega sin PIN si ya confirmaste su identidad.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => setDesbloquearOpen(true)}>
                Desbloquear PIN
              </Button>
              <Button size="sm" variant="outline" onClick={() => setSinPinOpen(true)}>
                Entregar sin PIN
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
            <p className="flex items-start gap-2 text-destructive-text">
              <LockKey size={18} weight="fill" className="mt-0.5 shrink-0" aria-hidden />
              <span>
                El PIN se bloqueó por intentos fallidos. Pídele al administrador de tu cooperativa que lo desbloquee
                {soporte ? ` o que el destinatario nos escriba por WhatsApp al ${soporte.numero}` : ""}.
              </span>
            </p>
            {soporte && (
              <a
                href={soporte.enlace}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 font-medium text-foreground underline underline-offset-4"
              >
                <WhatsappLogo size={16} aria-hidden /> Abrir WhatsApp de soporte
              </a>
            )}
          </div>
        )
      ) : (
        esAdmin && (
          <p className="text-center text-xs text-muted-foreground">
            ¿Quien retira no tiene el PIN?{" "}
            <button
              type="button"
              className="font-medium text-foreground underline underline-offset-4"
              onClick={() => setSinPinOpen(true)}
            >
              Entregar sin PIN
            </button>
          </p>
        )
      )}
    </div>
  );

  // ── Paso 3: identidad ──
  const seccionIdentidad = encomienda && paso === "identidad" && (
    <div className="space-y-4">
      {sinPinMotivo ? (
        <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100">
          Entrega sin PIN: {sinPinMotivo}
        </p>
      ) : (
        <p className="flex items-center gap-2 text-sm font-medium text-success-text">
          <CheckCircle size={18} weight="fill" aria-hidden /> PIN correcto
        </p>
      )}

      <div className="rounded-md border bg-muted/30 p-4">
        <p className="text-sm font-semibold">Revisa la cédula de quien retira</p>
        <p className="mt-1 text-base">
          {encomienda.receiver_nombre} · <span className="font-mono">{formatCedula(encomienda.receiver_cedula_rif)}</span>
        </p>
      </div>

      <div className="flex items-center gap-3">
        <Switch id={id("tercero")} checked={tercero} onCheckedChange={(v) => setTercero(Boolean(v))} />
        <Label htmlFor={id("tercero")}>Retira otra persona autorizada</Label>
      </div>

      {tercero && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor={id("tercero-nombre")}>Nombre de quien retira</Label>
            <Input
              id={id("tercero-nombre")}
              value={terceroNombre}
              autoComplete="off"
              aria-invalid={errores.nombre ? true : undefined}
              onChange={(e) => {
                setTerceroNombre(e.target.value);
                setErrores((p) => ({ ...p, nombre: undefined }));
              }}
            />
            {errores.nombre?.trim() && <p className="text-sm text-destructive-text">{errores.nombre}</p>}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={id("tercero-cedula")}>Cédula de quien retira</Label>
            <Input
              id={id("tercero-cedula")}
              value={terceroCedula}
              placeholder={CEDULA_PLACEHOLDER}
              autoComplete="off"
              aria-invalid={errores.terceroCedula ? true : undefined}
              onChange={(e) => {
                setTerceroCedula(e.target.value);
                setErrores((p) => ({ ...p, terceroCedula: undefined }));
              }}
            />
            {errores.terceroCedula?.trim() && <p className="text-sm text-destructive-text">{errores.terceroCedula}</p>}
          </div>
        </div>
      )}

      <div className="space-y-1">
        <div className="flex items-start gap-3">
          <Checkbox
            id={id("cedula")}
            checked={cedulaRevisada}
            aria-invalid={errores.cedula ? true : undefined}
            onCheckedChange={(v) => {
              setCedulaRevisada(v === true);
              setErrores((p) => ({ ...p, cedula: undefined }));
            }}
          />
          <Label htmlFor={id("cedula")} className="leading-snug">
            {tercero
              ? "Revisé la cédula de quien retira y coincide con los datos de arriba"
              : "Revisé la cédula y coincide"}
          </Label>
        </div>
        {errores.cedula && <p className="text-sm text-destructive-text">{errores.cedula}</p>}
      </div>
    </div>
  );

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && !isConfirming && !desbloquearOpen && !sinPinOpen && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
        {loading && !encomienda ? (
          <div className="flex h-[360px] flex-col items-center justify-center">
            <DialogTitle className="sr-only">Cargando la encomienda</DialogTitle>
            <Spinner size="lg" />
            <span className="mt-4 font-medium text-muted-foreground">Cargando la encomienda…</span>
          </div>
        ) : errorCarga && !encomienda ? (
          <>
            <DialogTitle className="sr-only">No pudimos cargar la encomienda</DialogTitle>
            <ErrorState titulo="No pudimos cargar la encomienda" descripcion={errorCarga} onReintentar={cargar} />
          </>
        ) : encomienda ? (
          <>
            <DialogHeader>
              <DialogTitle className="text-xl">
                Entregar <span className="font-mono tracking-wider">{encomienda.tracking_id}</span>
              </DialogTitle>
              <DialogDescription>
                {encomienda.descripcion_contenido || "Sin descripción"} · {encomienda.peso_kg || 0} kg ·{" "}
                {diasHabiles} {diasHabiles === 1 ? "día hábil" : "días hábiles"} en la oficina
              </DialogDescription>
            </DialogHeader>

            <ol className="flex flex-wrap items-center gap-2 text-xs" aria-label="Pasos de la entrega">
              {pasos.map((p, i) => (
                <li
                  key={p.id}
                  aria-current={p.id === paso ? "step" : undefined}
                  className={cn(
                    "flex items-center gap-1.5 rounded-full border px-2.5 py-1",
                    p.id === paso
                      ? "border-foreground bg-foreground text-background"
                      : i < indicePaso
                        ? "text-success-text"
                        : "text-muted-foreground"
                  )}
                >
                  {i < indicePaso ? <CheckCircle size={14} weight="fill" aria-hidden /> : <span className="font-semibold">{i + 1}</span>}
                  {p.titulo}
                </li>
              ))}
            </ol>

            <div className="grid grid-cols-1 gap-3 rounded-md border bg-muted/20 p-4 text-sm sm:grid-cols-2">
              <div>
                <span className="block text-xs text-muted-foreground">Destinatario</span>
                <span className="font-medium">{encomienda.receiver_nombre}</span>
                <span className="block text-xs text-muted-foreground">
                  {formatCedula(encomienda.receiver_cedula_rif)} · {formatTelefono(encomienda.receiver_telefono)}
                </span>
              </div>
              <div>
                <span className="block text-xs text-muted-foreground">Remitente</span>
                <span className="font-medium">{remitente?.nombre}</span>
              </div>
              <div>
                <span className="block text-xs text-muted-foreground">Cobro</span>
                {pagoOk ? (
                  <span className="font-medium text-success-text">
                    {cobroEnDestino ? "Pagada" : "Pagada al enviar"}
                  </span>
                ) : (
                  <div className="font-medium text-warning-text">
                    Cobrar al retirar
                    {Number(encomienda.costo_calculado) > 0 && (
                      <Monto usd={Number(encomienda.costo_calculado)} size="sm" className="block" />
                    )}
                  </div>
                )}
              </div>
              <div>
                <span className="block text-xs text-muted-foreground">En la oficina</span>
                <span className="font-medium">{textoDevolucion(diasHabiles)}</span>
              </div>
            </div>

            <div className="space-y-4">
              {seccionCobro}
              {seccionPin}
              {seccionIdentidad}
            </div>

            {errores.general && (
              <p role="alert" className="text-sm text-destructive-text">
                {errores.general}
              </p>
            )}

            <DialogFooter className="mt-2 border-t pt-4">
              {paso === "cobro" && (
                <p className="mr-auto self-center text-sm text-muted-foreground">Cobra el envío para seguir con el PIN.</p>
              )}
              <Button variant="ghost" onClick={onClose} disabled={isConfirming}>
                Cancelar
              </Button>
              <Button
                disabled={paso !== "identidad" || isConfirming}
                className="gap-2"
                onClick={() => void handleEntregar()}
                aria-busy={isConfirming || undefined}
              >
                {isConfirming ? <Spinner className="h-4 w-4" /> : <CheckCircle size={18} weight="bold" aria-hidden />}
                {isConfirming ? "Entregando…" : "Entregar encomienda"}
              </Button>
            </DialogFooter>

            <ConfirmDialog
              open={desbloquearOpen}
              onOpenChange={setDesbloquearOpen}
              titulo={`¿Desbloquear el PIN de ${encomienda.tracking_id}?`}
              descripcion="Hazlo solo si confirmaste que quien retira es el destinatario o una persona autorizada."
              impacto={[
                "Los intentos fallidos vuelven a cero y se puede escribir el PIN de nuevo.",
                "Queda registrado quién lo desbloqueó y por qué.",
              ]}
              motivo={{
                etiqueta: "¿Por qué lo desbloqueas?",
                minimo: 5,
                chips: ["El destinatario confirmó su identidad", "Se equivocó al escribir el PIN", "Otro"],
              }}
              verbo="Desbloquear PIN"
              verboCargando="Desbloqueando…"
              onConfirm={async (motivo) => {
                try {
                  const res = await requireOnline(() => desbloquearPin(encomienda.id, motivo ?? ""))();
                  if (!res.success) return { ok: false, error: res.error };
                  setPinBloqueado(false);
                  setIntentos(0);
                  setAvisoPin(null);
                  setPinKey((k) => k + 1);
                  toast.success("PIN desbloqueado. Pídele el PIN a quien retira.");
                  return { ok: true };
                } catch (err) {
                  return { ok: false, error: mensajeExcepcion(err, "desbloquear el PIN") };
                }
              }}
            />

            <ConfirmDialog
              open={sinPinOpen}
              onOpenChange={setSinPinOpen}
              titulo="¿Entregar sin PIN?"
              descripcion="Solo si revisaste la cédula de quien retira y estás seguro de que puede recibirla."
              impacto={[
                "La entrega queda registrada a tu nombre con este motivo.",
                "En el siguiente paso confirmas la cédula de quien retira.",
              ]}
              motivo={{
                etiqueta: "¿Por qué entregas sin PIN?",
                minimo: 10,
                chips: ["El destinatario perdió el PIN", "El PIN se bloqueó y el destinatario está presente", "Otro"],
              }}
              verbo="Continuar sin PIN"
              onConfirm={async (motivo) => {
                setSinPinMotivo((motivo ?? "").trim());
                setAvisoPin(null);
                return { ok: true };
              }}
            />
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
