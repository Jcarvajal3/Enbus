"use client";

// ─── Recepción en origen: pesar la encomienda ───────────────────────────────
// La vista previa del costo y el costo definitivo los calcula el servidor
// (fn_cotizar_encomienda / fn_confirmar_recepcion_origen). Una encomienda que
// quedó a medio recibir (EN_RECEPCION) también se completa desde aquí.
// Sin ruta activa hacia el destino (EB_SIN_RUTA) el modal sigue abierto y ofrece
// "Crear ruta" (administrador) o "No recibir la encomienda".

import { useState, useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "sonner";
import { AvisoError } from "@/components/aviso-error";
import { avisarError, avisarExito } from "@/lib/avisos";
import { Prohibit, WarningCircle } from "@phosphor-icons/react";
import { createClient } from "@/lib/supabase/client";
import type { Encomienda } from "@/lib/types/encomiendas";
import type { CotizacionEncomienda, RecepcionOrigen } from "@/lib/types/pagos";
import type { TasaRef } from "@/lib/dinero";
import { codigoEB, humanizeError, parseDetalleEB } from "@/lib/errores";
import { confirmarRecepcion } from "@/app/cooperativas/(panel)/taquilla/encomiendas/actions";
import { MSG_VENTANA_BLOQUEADA, printGuiaEncomienda } from "@/lib/printing/print-helpers";
import { MODALIDAD_PAGO } from "@/lib/estados";
import { formatTelefono } from "@/lib/ve";
import { useUser } from "@/hooks/use-user";
import { remitenteDe } from "@/components/encomiendas/detalle-sheet";
import { RechazarEncomiendaDialog } from "@/components/encomiendas/rechazar-encomienda-dialog";
import { printer } from "@/lib/printing/bluetooth";
import { requireOnline } from "@/components/connectivity-banner";
import { Monto } from "@/components/monto";
import { formatCiudad } from "@/lib/ciudades";

interface RecepcionModalProps {
  encomienda: Encomienda;
  isOpen: boolean;
  onClose: () => void;
  /** Recepción confirmada (la encomienda quedó POR_PAGAR con su costo). */
  onSuccess: (r: RecepcionOrigen, pesoKg: number) => void;
  /** La taquilla decidió no recibirla (quedó CANCELADA). */
  onRechazada?: () => void;
}

const ESTADOS_RECIBIBLES = ["PENDIENTE_DE_ESCANEO", "EN_RECEPCION"];

/** "2,5" o "2.5" -> 2.5; null si no es un número. */
function parsePeso(texto: string): number | null {
  const t = texto.trim().replace(",", ".");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function tasaDe(tasa: number | null | undefined, fecha: string | null | undefined): TasaRef | null {
  return tasa && fecha ? { tasa: Number(tasa), fecha } : null;
}

/** Abre la guía en PDF; si el navegador bloquea la ventana, lo dice. */
function abrirPdf(url: string) {
  const ventana = window.open(url, "_blank");
  if (!ventana) avisarError(MSG_VENTANA_BLOQUEADA);
}

export function RecepcionModal({ encomienda, isOpen, onClose, onSuccess, onRechazada }: RecepcionModalProps) {
  const supabase = useMemo(() => createClient(), []);
  const { user } = useUser();
  const esAdmin = user.role === "admin_cooperativa";
  // La cooperativa no tiene ruta activa hacia el destino (EB_SIN_RUTA).
  const [sinRuta, setSinRuta] = useState(false);
  const [rechazarOpen, setRechazarOpen] = useState(false);

  const [peso, setPeso] = useState<string>("");
  const [pesoError, setPesoError] = useState<string>("");
  const [pesoMax, setPesoMaxEstado] = useState<number | null>(null);
  // Copia para el efecto de cotización: conocer el máximo no debe volver a cotizar.
  const pesoMaxRef = useRef<number | null>(null);
  const setPesoMax = (valor: number) => {
    pesoMaxRef.current = valor;
    setPesoMaxEstado(valor);
  };
  const [errorCotizacion, setErrorCotizacion] = useState<string | null>(null);

  const [calculating, setCalculating] = useState(false);
  const [cotizacion, setCotizacion] = useState<CotizacionEncomienda | null>(null);
  // Peso para el que se calculó `cotizacion` (no confirmar con el costo de otro peso).
  const [pesoCotizado, setPesoCotizado] = useState<number | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [errorEnvio, setErrorEnvio] = useState<string | null>(null);

  const recibible = ESTADOS_RECIBIBLES.includes(encomienda.estado);
  const aMedias = encomienda.estado === "EN_RECEPCION";

  // Si la encomienda ya no se puede recibir (otro compañero la procesó), se avisa y se cierra.
  useEffect(() => {
    if (!isOpen || recibible) return;
    avisarError("Esta encomienda ya fue recibida. Actualiza la lista para ver su estado.");
    onClose();
  }, [isOpen, recibible, onClose]);

  // Reiniciar el formulario al cerrar.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!isOpen) {
      setPeso("");
      setPesoError("");
      setCotizacion(null);
      setErrorCotizacion(null);
    }
  }, [isOpen]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const pesoNum = parsePeso(peso);

  // Vista previa del costo (servidor), con espera de 500 ms mientras se escribe.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!isOpen || !recibible) return;
    if (pesoNum == null || pesoNum <= 0) {
      setCotizacion(null);
      setPesoError(peso.trim() && pesoNum == null ? "Escribe el peso en kilos, por ejemplo 2,5." : "");
      return;
    }
    const maximo = pesoMaxRef.current;
    if (maximo != null && pesoNum > maximo) {
      setPesoError(`El peso máximo es ${maximo} kg.`);
      setCotizacion(null);
      return;
    }
    setPesoError("");

    let vigente = true;
    const timer = setTimeout(async () => {
      setCalculating(true);
      setErrorCotizacion(null);
      try {
        const { data, error } = await supabase.rpc("fn_cotizar_encomienda", {
          p_encomienda_id: encomienda.id,
          p_peso_kg: pesoNum,
        });
        if (!vigente) return;
        if (error) {
          const codigo = codigoEB(error);
          const detalle = parseDetalleEB(error);
          if (typeof detalle.peso_max_kg === "number") setPesoMax(detalle.peso_max_kg);
          setCotizacion(null);
          if (codigo === "EB_PESO_INVALIDO") {
            setPesoError(humanizeError(error, "calcular el costo"));
          } else if (codigo === "EB_SIN_RUTA") {
            setSinRuta(true);
          } else {
            setErrorCotizacion(humanizeError(error, "calcular el costo"));
          }
          return;
        }
        const c = data as CotizacionEncomienda;
        setErrorCotizacion(null);
        if (typeof c?.peso_max_kg === "number") setPesoMax(Number(c.peso_max_kg));
        setCotizacion(c && Number(c.costo_usd) > 0 ? c : null);
        setPesoCotizado(pesoNum);
      } catch (err) {
        if (!vigente) return;
        setCotizacion(null);
        setErrorCotizacion(humanizeError(err, "calcular el costo"));
      } finally {
        if (vigente) setCalculating(false);
      }
    }, 500);

    return () => {
      vigente = false;
      clearTimeout(timer);
    };
  }, [isOpen, recibible, peso, pesoNum, encomienda.id, supabase]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Solo vale la cotización del peso escrito ahora (mientras se escribe, la anterior caduca).
  const cotizacionVigente = cotizacion && pesoCotizado === pesoNum ? cotizacion : null;
  const listoParaConfirmar = !!cotizacionVigente && !pesoError && !calculating && !submitting;

  const handleSubmit = async () => {
    if (pesoNum == null || pesoNum <= 0 || !listoParaConfirmar) return;

    setSubmitting(true);
    setErrorEnvio(null);
    try {
      const res = await requireOnline(() => confirmarRecepcion(encomienda.id, pesoNum))();

      if (!res.success) {
        if (res.codigo === "EB_PESO_INVALIDO" || res.detalle?.campo === "peso") {
          if (typeof res.detalle?.peso_max_kg === "number") setPesoMax(res.detalle.peso_max_kg);
          setPesoError(res.error);
        } else if (res.codigo === "EB_SIN_RUTA") {
          setSinRuta(true);
        } else {
          setErrorEnvio(res.error);
        }
        return;
      }

      const recepcion = res.data;
      avisarExito("Encomienda recibida.");

      // Impresión automática de la guía por Bluetooth si hay impresora conectada (M-02).
      if (printer.isConnected) {
        try {
          await printGuiaEncomienda({
            ...encomienda,
            peso_kg: pesoNum,
            costo_calculado: Number(recepcion.costo_usd),
          });
          avisarExito("Guía enviada a la impresora.");
        } catch {
          // Sin Bluetooth, la guía queda en PDF (botón en el aviso).
          const pdf = res.pdfUrl;
          toast.warning("La encomienda quedó recibida, pero no se pudo imprimir la guía por Bluetooth.", {
            action: pdf ? { label: "Abrir guía en PDF", onClick: () => abrirPdf(pdf) } : undefined,
          });
        }
      } else if (res.pdfUrl) {
        const pdf = res.pdfUrl;
        // Botón en el aviso: abrir la ventana tras un clic evita que el navegador la bloquee.
        toast.info("La guía en PDF está lista.", {
          action: { label: "Imprimir guía", onClick: () => abrirPdf(pdf) },
          duration: 10000,
        });
      } else if (res.avisoGuia) {
        toast.warning(res.avisoGuia);
      }

      onSuccess(recepcion, pesoNum);
    } catch (err) {
      setErrorEnvio(humanizeError(err, "recibir la encomienda"));
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenChange = (open: boolean) => {
    if (!open && !submitting && !rechazarOpen) onClose();
  };
  const remitente = remitenteDe(encomienda);

  const tasaCotizacion = cotizacionVigente
    ? tasaDe(cotizacionVigente.tasa_bcv, cotizacionVigente.tasa_bcv_fecha)
    : null;
  const esperandoCotizacion =
    pesoNum != null && pesoNum > 0 && !pesoError && !errorCotizacion && !cotizacionVigente;

  return (
    <Dialog open={isOpen && recibible} onOpenChange={handleOpenChange}>
      <DialogContent tamano="flujo" showCloseButton={!submitting}>
        <DialogHeader>
          <DialogTitle>
            Recibir <span className="font-mono">{encomienda.tracking_id}</span>
          </DialogTitle>
          <DialogDescription>Revisa el paquete (máx. 50 × 50 × 50 cm) y escribe el peso.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-6">
          {aMedias && (
            <Alert>
              <WarningCircle aria-hidden />
              <AlertTitle>Quedó a medio recibir</AlertTitle>
              <AlertDescription>Pésala de nuevo para terminar la recepción.</AlertDescription>
            </Alert>
          )}

          {sinRuta && (
            <AvisoError>
              <div className="flex flex-col gap-3">
                <p>
                  <span className="font-semibold">Sin ruta activa hacia {formatCiudad(encomienda.ciudad_destino)}.</span>{" "}
                  {esAdmin ? "Crea la ruta o no la recibas." : "Pídele al administrador que la cree, o no la recibas."}
                </p>
                <div className="flex flex-wrap gap-2">
                  {esAdmin && (
                    <Link href="/cooperativas/rutas" className={buttonVariants({ variant: "outline", size: "sm" })}>
                      Crear ruta
                    </Link>
                  )}
                  <Button size="sm" variant="outline" onClick={() => setRechazarOpen(true)}>
                    No recibir la encomienda
                  </Button>
                </div>
              </div>
            </AvisoError>
          )}

          {/* Datos del envío */}
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-md bg-muted/50 p-4 text-sm">
            <div className="flex flex-col gap-0.5">
              <dt className="text-xs text-muted-foreground">Ruta</dt>
              <dd className="font-medium">
                {formatCiudad(encomienda.ciudad_origen)} → {formatCiudad(encomienda.ciudad_destino)}
              </dd>
            </div>
            <div className="flex flex-col gap-0.5">
              <dt className="text-xs text-muted-foreground">Quién paga</dt>
              <dd className="font-medium">{MODALIDAD_PAGO[encomienda.modalidad_pago]?.largo ?? "Sin definir"}</dd>
            </div>
            <div className="flex min-w-0 flex-col gap-0.5">
              <dt className="text-xs text-muted-foreground">Remitente</dt>
              <dd className="truncate font-medium">{remitente.nombre}</dd>
            </div>
            <div className="flex min-w-0 flex-col gap-0.5">
              <dt className="text-xs text-muted-foreground">Destinatario</dt>
              <dd className="truncate font-medium">{encomienda.receiver_nombre}</dd>
              {encomienda.receiver_telefono && (
                <dd className="text-xs text-muted-foreground tabular-nums">{formatTelefono(encomienda.receiver_telefono)}</dd>
              )}
            </div>
            <div className="col-span-2 flex flex-col gap-0.5">
              <dt className="text-xs text-muted-foreground">Contenido declarado</dt>
              <dd>{encomienda.descripcion_contenido || "Sin descripción"}</dd>
            </div>
          </dl>

          <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2">
            {/* Peso */}
            <div className="flex flex-col gap-2">
              <Label htmlFor="peso">Peso (kg)</Label>
              <Input
                id="peso"
                inputMode="decimal"
                autoComplete="off"
                placeholder="Ej. 2,5"
                value={peso}
                autoFocus
                onChange={(e) => setPeso(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && listoParaConfirmar) void handleSubmit();
                }}
                aria-invalid={pesoError ? true : undefined}
                aria-describedby={pesoError ? "peso-error" : "peso-ayuda"}
              />
              {pesoError ? (
                <p id="peso-error" className="text-sm text-destructive-text">
                  {pesoError}
                </p>
              ) : (
                <p id="peso-ayuda" className="text-sm text-muted-foreground">
                  {pesoMax != null ? `Máximo ${pesoMax} kg.` : "En kilos."}
                </p>
              )}
            </div>

            {/* Costo */}
            <div aria-live="polite" className="flex min-h-24 flex-col justify-center gap-1 rounded-md bg-muted/50 p-4">
              <p className="text-xs font-medium text-muted-foreground">Costo del envío</p>
              {calculating || esperandoCotizacion ? (
                <Skeleton className="h-7 w-36" aria-label="Calculando el costo" />
              ) : cotizacionVigente ? (
                <Monto
                  usd={Number(cotizacionVigente.costo_usd)}
                  bs={cotizacionVigente.costo_bs != null ? Number(cotizacionVigente.costo_bs) : null}
                  tasa={tasaCotizacion}
                  size="lg"
                />
              ) : errorCotizacion ? (
                <p className="text-sm text-destructive-text">{errorCotizacion}</p>
              ) : (
                <p className="text-sm text-muted-foreground">Escribe el peso para calcularlo.</p>
              )}
            </div>
          </div>

          {errorEnvio && <AvisoError>{errorEnvio}</AvisoError>}
        </div>

        <DialogFooter className="sm:justify-between">
          <Button
            variant="outline"
            className="text-destructive-text"
            onClick={() => setRechazarOpen(true)}
            disabled={submitting}
          >
            <Prohibit aria-hidden />
            No recibir
          </Button>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <Button variant="outline" onClick={onClose} disabled={submitting}>
              Cancelar
            </Button>
            <Button onClick={() => void handleSubmit()} disabled={!listoParaConfirmar} aria-busy={submitting || undefined}>
              {submitting && <Spinner size="sm" />}
              {submitting ? "Recibiendo…" : "Recibir encomienda"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>

      <RechazarEncomiendaDialog
        encomienda={encomienda}
        open={rechazarOpen}
        onOpenChange={setRechazarOpen}
        motivoSugerido={sinRuta ? "No tenemos ruta a ese destino" : undefined}
        onRechazada={() => {
          setRechazarOpen(false);
          onRechazada?.();
          onClose();
        }}
      />
    </Dialog>
  );
}
