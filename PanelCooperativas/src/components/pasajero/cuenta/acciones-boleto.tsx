"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarPlus, CreditCard, Printer, XCircle } from "@phosphor-icons/react";
import { AvisoError } from "@/components/aviso-error";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { AvisoTasaCambio, PagoPasajero } from "@/components/pasajero/pago";
import type { MetodoPagoPasajero } from "@/lib/pasajero/pagos-comun";
import { avisarError, avisarExito, avisarInfo } from "@/lib/avisos";
import { formatBs, formatUsd, usdABs } from "@/lib/dinero";
import { cancelarBoleto, pagarReservaBoleto } from "@/app/(sitio)/cuenta/boletos/acciones";
import { useReportePago, type TasaPago } from "./usar-pago";
import estilos from "./detalle.module.css";

const MOTIVOS = ["Cambio de planes", "Problema de salud", "Compré otro boleto", "Otro"] as const;
/** Porcentaje del pasaje que se devuelve al cancelar un boleto pagado (lo calcula el servidor). */
const TASA_REEMBOLSO = 0.95;

export interface DatosCalendario {
  uid: string;
  titulo: string;
  inicioIso: string;
  duracionMin: number;
  lugar: string;
  descripcion: string;
}

export interface PropsAccionesBoleto {
  boletoId: string;
  /** Texto corto de los asientos de la compra que se pagan juntos ("Asientos 3 y 4"). */
  asientosTexto: string;
  pagado: boolean;
  /** Reserva sin pago o con pago rechazado, aún vigente. */
  puedePagar: boolean;
  puedeCancelar: boolean;
  /** Mensaje si no se puede cancelar ("Este viaje ya salió…", "Espera la respuesta de la cooperativa"). */
  notaCancelar: string | null;
  precioUsd: number;
  tasa: TasaPago | null;
  pago: { metodos: MetodoPagoPasajero[]; totalUsd: number } | null;
  calendario: DatosCalendario | null;
}

function dosDigitos(n: number) {
  return String(n).padStart(2, "0");
}
function fechaIcs(ms: number) {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}${dosDigitos(d.getUTCMonth() + 1)}${dosDigitos(d.getUTCDate())}T${dosDigitos(d.getUTCHours())}${dosDigitos(d.getUTCMinutes())}${dosDigitos(d.getUTCSeconds())}Z`;
}
function textoIcs(t: string) {
  return t.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

function descargarIcs(c: DatosCalendario) {
  const inicio = Date.parse(c.inicioIso);
  if (Number.isNaN(inicio)) return avisarError("No pudimos leer la hora de salida.");
  const fin = inicio + Math.max(30, c.duracionMin || 60) * 60_000;
  const lineas = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//EnBus//Boleto//ES",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${c.uid}@enbus`,
    `DTSTAMP:${fechaIcs(Date.now())}`,
    `DTSTART:${fechaIcs(inicio)}`,
    `DTEND:${fechaIcs(fin)}`,
    `SUMMARY:${textoIcs(c.titulo)}`,
    `LOCATION:${textoIcs(c.lugar)}`,
    `DESCRIPTION:${textoIcs(c.descripcion)}`,
    "BEGIN:VALARM",
    "TRIGGER:-PT2H",
    "ACTION:DISPLAY",
    "DESCRIPTION:Tu viaje sale pronto. Llega 30 minutos antes con tu cédula.",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  const blob = new Blob([lineas.join("\r\n")], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "viaje-enbus.ics";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Botones del detalle de un boleto y los diálogos de pago y cancelación. */
export function AccionesBoleto(props: PropsAccionesBoleto) {
  const { boletoId, pagado, puedePagar, puedeCancelar, notaCancelar, calendario } = props;
  const [pagando, setPagando] = useState(false);
  const [cancelando, setCancelando] = useState(false);

  return (
    <>
      <div className={estilos.acciones} data-no-imprimir>
        {puedePagar && props.pago && (
          <Button size="lg" onClick={() => setPagando(true)}>
            <CreditCard aria-hidden weight="fill" />
            Pagar reserva
          </Button>
        )}
        {pagado && (
          <Button size="lg" variant="outline" onClick={() => window.print()}>
            <Printer aria-hidden />
            Imprimir
          </Button>
        )}
        {calendario && (
          <Button size="lg" variant="outline" onClick={() => descargarIcs(calendario)}>
            <CalendarPlus aria-hidden />
            Añadir al calendario
          </Button>
        )}
        {puedeCancelar && (
          <Button size="lg" variant="outline" onClick={() => setCancelando(true)}>
            <XCircle aria-hidden />
            {pagado ? "Cancelar boleto" : "Cancelar reserva"}
          </Button>
        )}
      </div>
      {notaCancelar && (
        <p data-no-imprimir style={{ fontSize: "var(--t-small)" }}>
          {notaCancelar}
        </p>
      )}

      {pagando && props.pago && (
        <DialogoPago
          boletoId={boletoId}
          asientosTexto={props.asientosTexto}
          metodos={props.pago.metodos}
          totalUsd={props.pago.totalUsd}
          tasa={props.tasa}
          onCerrar={() => setPagando(false)}
        />
      )}
      {cancelando && (
        <DialogoCancelar
          boletoId={boletoId}
          pagado={pagado}
          precioUsd={props.precioUsd}
          tasa={props.tasa}
          onCerrar={() => setCancelando(false)}
        />
      )}
    </>
  );
}

// ─── Pagar la reserva ────────────────────────────────────────────────────────

function DialogoPago({
  boletoId,
  asientosTexto,
  metodos,
  totalUsd,
  tasa: tasaInicial,
  onCerrar,
}: {
  boletoId: string;
  asientosTexto: string;
  metodos: MetodoPagoPasajero[];
  totalUsd: number;
  tasa: TasaPago | null;
  onCerrar(): void;
}) {
  const router = useRouter();
  const pago = useReportePago({
    tasaInicial,
    enviar: (entrada) => pagarReservaBoleto({ ...entrada, boletoId }),
    onListo: (repetido) => {
      avisarExito(
        repetido
          ? "Ya habíamos registrado este pago. La cooperativa lo está revisando."
          : "Registramos tu pago. La cooperativa lo revisará y te avisaremos."
      );
      onCerrar();
      router.refresh();
    },
    onDesactualizado: (mensaje) => {
      avisarError(mensaje);
      onCerrar();
      router.refresh();
    },
  });

  return (
    <Dialog open onOpenChange={(abierto) => !abierto && !pago.enviando && onCerrar()}>
      <DialogContent tamano="flujo" movil="pantalla">
        <DialogHeader>
          <DialogTitle>Pagar tu reserva</DialogTitle>
          <DialogDescription>
            {asientosTexto}. Paga con una de las cuentas de la cooperativa y reporta el pago aquí.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4 overflow-y-auto">
          {pago.aviso && (
            <AvisoTasaCambio
              totalBs={pago.aviso.totalBs}
              totalUsd={pago.aviso.totalUsd}
              tasa={pago.aviso.tasa}
              tasaFecha={pago.aviso.tasaFecha}
              onConfirmar={pago.confirmarTasa}
              onCancelar={pago.descartarAviso}
            />
          )}
          <PagoPasajero
            metodos={metodos}
            totalUsd={totalUsd}
            tasa={pago.tasa}
            totalBs={pago.totalBs}
            enviando={pago.enviando}
            error={pago.aviso ? null : pago.error}
            onEnviar={pago.aviso ? () => undefined : pago.enviarDatos}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Cancelar ────────────────────────────────────────────────────────────────

function DialogoCancelar({
  boletoId,
  pagado,
  precioUsd,
  tasa,
  onCerrar,
}: {
  boletoId: string;
  pagado: boolean;
  precioUsd: number;
  tasa: TasaPago | null;
  onCerrar(): void;
}) {
  const router = useRouter();
  const [motivo, setMotivo] = useState<string | null>(null);
  const [otro, setOtro] = useState("");
  const [errorMotivo, setErrorMotivo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [enviando, empezar] = useTransition();

  const reembolsoUsd = Math.round(precioUsd * TASA_REEMBOLSO * 100) / 100;
  const textoReembolso = tasa
    ? `Te devolveremos ${formatBs(usdABs(reembolsoUsd, tasa.tasa))} (95 % del pasaje; ≈ ${formatUsd(reembolsoUsd)}).`
    : `Te devolveremos ${formatUsd(reembolsoUsd)} (95 % del pasaje) en bolívares.`;

  const confirmar = () => {
    if (enviando) return;
    let texto: string | null = null;
    if (pagado) {
      if (!motivo) return setErrorMotivo("Elige el motivo de la cancelación.");
      texto = motivo === "Otro" ? otro.trim() : motivo;
      if (motivo === "Otro" && texto.length < 3) return setErrorMotivo("Cuéntanos brevemente el motivo.");
    }
    setErrorMotivo(null);
    setError(null);
    empezar(async () => {
      try {
        const r = await cancelarBoleto({ boletoId, motivo: texto });
        if (!r.success) {
          if (r.codigo === "EB_PAGO_EN_VERIFICACION" || r.codigo === "EB_ESTADO_CAMBIO" || r.codigo === "EB_VIAJE_YA_SALIO") {
            avisarError(r.error);
            onCerrar();
            router.refresh();
            return;
          }
          if (r.detalle?.campo === "motivo") setErrorMotivo(r.error);
          else setError(`No pudimos cancelar. ${r.error}`);
          return;
        }
        const { reembolsoUsd: usd, reembolsoBsEstimado: bs } = r.data;
        if (usd != null) {
          avisarExito(
            `Boleto cancelado. Te devolveremos ${bs != null ? `${formatBs(bs)} (≈ ${formatUsd(usd)})` : formatUsd(usd)}; te avisaremos cuando la cooperativa registre el reembolso.`
          );
        } else {
          avisarInfo("Reserva cancelada. El asiento quedó libre.");
        }
        onCerrar();
        router.refresh();
      } catch {
        setError("No pudimos cancelar. Revisa tu conexión e intenta de nuevo.");
      }
    });
  };

  return (
    <Dialog open onOpenChange={(abierto) => !abierto && !enviando && onCerrar()}>
      <DialogContent tamano="confirmar">
        <DialogHeader>
          <DialogTitle>{pagado ? "¿Cancelar este boleto?" : "¿Cancelar esta reserva?"}</DialogTitle>
          <DialogDescription>
            {pagado
              ? "El asiento quedará libre y el QR dejará de servir."
              : "El asiento quedará libre. Como no habías pagado, no tiene costo."}
          </DialogDescription>
        </DialogHeader>

        {pagado && (
          <div className="flex flex-col gap-3">
            <p className="rounded-xl bg-surface p-4 text-[15px] text-foreground">
              {textoReembolso} La cooperativa lo envía en 1 a 2 días hábiles, por el mismo medio con que pagaste.
            </p>
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-[15px] font-semibold text-foreground">Motivo</legend>
              {MOTIVOS.map((m) => (
                <label key={m} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl bg-surface px-4 text-[15px] text-foreground has-checked:bg-accent-light">
                  <input
                    type="radio"
                    name="motivo-cancelacion"
                    value={m}
                    checked={motivo === m}
                    onChange={() => {
                      setMotivo(m);
                      setErrorMotivo(null);
                    }}
                    className="size-4 accent-accent-strong"
                  />
                  {m}
                </label>
              ))}
            </fieldset>
            {motivo === "Otro" && (
              <div className="flex flex-col gap-1">
                <label htmlFor="motivo-otro" className="text-[15px] font-semibold text-foreground">
                  Cuéntanos el motivo
                </label>
                <Textarea
                  id="motivo-otro"
                  value={otro}
                  maxLength={300}
                  onChange={(e) => setOtro(e.target.value)}
                  aria-invalid={errorMotivo ? true : undefined}
                  aria-describedby={errorMotivo ? "motivo-error" : undefined}
                />
              </div>
            )}
            {errorMotivo && (
              <p id="motivo-error" role="alert" className="text-[14px] text-destructive-text">
                {errorMotivo}
              </p>
            )}
          </div>
        )}

        {error && <AvisoError>{error}</AvisoError>}

        <DialogFooter>
          <Button size="lg" variant="outline" onClick={onCerrar} disabled={enviando}>
            No cancelar
          </Button>
          <Button size="lg" variant="destructive" onClick={confirmar} disabled={enviando} aria-busy={enviando || undefined}>
            {enviando && <Spinner size="sm" aria-hidden />}
            {pagado ? "Cancelar boleto" : "Cancelar reserva"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
