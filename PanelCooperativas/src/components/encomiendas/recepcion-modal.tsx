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
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "sonner";
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
  if (!ventana) toast.error(MSG_VENTANA_BLOQUEADA);
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

  const recibible = ESTADOS_RECIBIBLES.includes(encomienda.estado);
  const aMedias = encomienda.estado === "EN_RECEPCION";

  // Si la encomienda ya no se puede recibir (otro compañero la procesó), se avisa y se cierra.
  useEffect(() => {
    if (!isOpen || recibible) return;
    toast.error("Esta encomienda ya fue recibida. Actualiza la lista para ver su estado actual.");
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
        console.error("Error calculando el costo:", err);
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
    try {
      const res = await requireOnline(() => confirmarRecepcion(encomienda.id, pesoNum))();

      if (!res.success) {
        if (res.codigo === "EB_PESO_INVALIDO" || res.detalle?.campo === "peso") {
          if (typeof res.detalle?.peso_max_kg === "number") setPesoMax(res.detalle.peso_max_kg);
          setPesoError(res.error);
        } else if (res.codigo === "EB_SIN_RUTA") {
          setSinRuta(true);
        } else {
          toast.error(res.error);
        }
        return;
      }

      const recepcion = res.data;
      toast.success(
        recepcion.modalidad_pago === "DESTINO"
          ? "Encomienda recibida. Toma la foto del paquete; el envío se cobra al retirar."
          : "Encomienda recibida. Toma la foto del paquete y luego cobra el envío."
      );

      // Impresión automática de la guía por Bluetooth si hay impresora conectada (M-02).
      if (printer.isConnected) {
        try {
          await printGuiaEncomienda({
            ...encomienda,
            peso_kg: pesoNum,
            costo_calculado: Number(recepcion.costo_usd),
          });
          toast.success("Guía enviada a la impresora Bluetooth.");
        } catch (printErr) {
          console.error("Error al imprimir la guía por Bluetooth:", printErr);
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
      toast.error(humanizeError(err, "recibir la encomienda"));
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
      <DialogContent className="sm:max-w-[650px]">
        <DialogHeader>
          <DialogTitle>Recibir encomienda</DialogTitle>
          <DialogDescription>
            Revisa los datos del envío y escribe el peso. El costo se calcula con la tarifa vigente.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-6 py-2">
          {aMedias && (
            <Alert>
              <WarningCircle className="h-5 w-5" />
              <AlertTitle>Esta encomienda quedó a medio recibir</AlertTitle>
              <AlertDescription>Pésala de nuevo y confirma para terminar la recepción.</AlertDescription>
            </Alert>
          )}

          {sinRuta && (
            <Alert variant="destructive">
              <WarningCircle className="h-5 w-5" />
              <AlertTitle>Tu cooperativa no tiene una ruta activa hacia {formatCiudad(encomienda.ciudad_destino)}.</AlertTitle>
              <AlertDescription>
                <p>
                  {esAdmin
                    ? "Crea la ruta para poder recibirla, o no la recibas y le avisamos al cliente."
                    : "Pídele al administrador que cree la ruta, o no la recibas y le avisamos al cliente."}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {esAdmin && (
                    <Link href="/cooperativas/rutas" className={buttonVariants({ variant: "outline", size: "sm" })}>
                      Crear ruta
                    </Link>
                  )}
                  <Button size="sm" variant="outline" onClick={() => setRechazarOpen(true)}>
                    No recibir la encomienda
                  </Button>
                </div>
              </AlertDescription>
            </Alert>
          )}

          {/* Datos del envío */}
          <div className="grid grid-cols-2 gap-4 rounded-lg border bg-muted/40 p-4 text-sm">
            <div>
              <p className="mb-1 font-medium text-muted-foreground">Código de seguimiento</p>
              <p className="font-mono font-medium text-foreground">{encomienda.tracking_id}</p>
            </div>
            <div>
              <p className="mb-1 font-medium text-muted-foreground">Quién paga</p>
              <Badge variant="secondary">{MODALIDAD_PAGO[encomienda.modalidad_pago]?.largo ?? "Sin definir"}</Badge>
            </div>
            <div>
              <p className="mb-1 font-medium text-muted-foreground">Ruta</p>
              <p className="font-medium text-foreground">
                {formatCiudad(encomienda.ciudad_origen)} → {formatCiudad(encomienda.ciudad_destino)}
              </p>
            </div>
            <div>
              <p className="mb-1 font-medium text-muted-foreground">Remitente</p>
              <p className="font-medium text-foreground">{remitente.nombre}</p>
            </div>
            <div className="col-span-2">
              <p className="mb-1 font-medium text-muted-foreground">Destinatario</p>
              <p className="font-medium text-foreground">
                {encomienda.receiver_nombre}
                {encomienda.receiver_telefono ? ` (${formatTelefono(encomienda.receiver_telefono)})` : ""}
              </p>
            </div>
            <div className="col-span-2">
              <p className="mb-1 font-medium text-muted-foreground">Contenido declarado</p>
              <p className="text-foreground">{encomienda.descripcion_contenido || "Sin descripción"}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 items-start gap-6 sm:grid-cols-2">
            {/* Peso */}
            <div className="space-y-3">
              <label htmlFor="peso" className="text-sm leading-none font-medium">
                Peso (kg)
              </label>
              <Input
                id="peso"
                inputMode="decimal"
                autoComplete="off"
                placeholder="0,00"
                value={peso}
                autoFocus
                onChange={(e) => setPeso(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && listoParaConfirmar) void handleSubmit();
                }}
                aria-invalid={pesoError ? true : undefined}
                aria-describedby={pesoError ? "peso-error" : "peso-ayuda"}
                className={pesoError ? "border-destructive focus-visible:ring-destructive" : ""}
              />
              {pesoError ? (
                <p id="peso-error" className="text-sm font-medium text-destructive-text animate-in fade-in">
                  {pesoError}
                </p>
              ) : (
                <p id="peso-ayuda" className="text-xs text-muted-foreground">
                  {pesoMax != null ? `Máximo ${pesoMax} kg.` : "Pesa el paquete y escribe el peso en kilos."}
                </p>
              )}
            </div>

            {/* Costo */}
            <div
              aria-live="polite"
              className="flex h-full min-h-[100px] flex-col items-center justify-center rounded-lg border bg-muted/50 p-4 text-center"
            >
              <p className="mb-1 text-sm font-medium text-muted-foreground">Costo del envío</p>
              {calculating || esperandoCotizacion ? (
                <div className="mt-2">
                  <Spinner size="md" aria-label="Calculando el costo" />
                </div>
              ) : cotizacionVigente ? (
                <Monto
                  usd={Number(cotizacionVigente.costo_usd)}
                  bs={cotizacionVigente.costo_bs != null ? Number(cotizacionVigente.costo_bs) : null}
                  tasa={tasaCotizacion}
                  size="lg"
                  className="items-center text-center"
                />
              ) : errorCotizacion ? (
                <p className="mt-2 text-sm text-destructive-text">{errorCotizacion}</p>
              ) : (
                <p className="mt-2 text-sm text-muted-foreground">Escribe el peso para calcularlo</p>
              )}
            </div>
          </div>

          <Alert className="border-warning/40 bg-warning-light text-warning-deep">
            <WarningCircle className="h-5 w-5 !text-warning-deep" aria-hidden />
            <AlertTitle>Revisa el paquete</AlertTitle>
            <AlertDescription className="text-warning-deep">
              Medidas máximas de referencia: 50 × 50 × 50 cm. Míralo antes de recibirlo.
            </AlertDescription>
          </Alert>
        </div>

        <DialogFooter className="sm:justify-between">
          <Button
            variant="ghost"
            className="text-destructive-text"
            onClick={() => setRechazarOpen(true)}
            disabled={submitting}
          >
            <Prohibit className="mr-1.5 h-4 w-4" aria-hidden />
            No recibir
          </Button>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <Button variant="outline" onClick={onClose} disabled={submitting}>
              Cancelar
            </Button>
            <Button onClick={() => void handleSubmit()} disabled={!listoParaConfirmar}>
              {submitting ? (
                <>
                  <Spinner className="mr-2" size="sm" />
                  Recibiendo…
                </>
              ) : (
                "Confirmar recepción"
              )}
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
