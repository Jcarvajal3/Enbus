"use client";

// ─── Resultado del escaneo en el embarque ───────────────────────────────────
// Diálogo con el veredicto del boleto escaneado: franja grande verde (puede
// embarcar), ámbar (revisa antes) o roja (no embarcar), los datos del viaje y
// del pasajero y la acción que corresponde (Confirmar embarque, Cobrar ahora,
// Cambiar a ese bus, Vender boleto…). También arma el resumen para el panel
// "Último escaneo" (`escaneoDeResultado`), que es el que suena.

import { useRef } from "react";
import { CheckCircle, Warning, XCircle } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { VerificarPagoDialog } from "@/components/pagos/verificar-pago-dialog";
import type { ResultadoEscaneo } from "@/components/ultimo-escaneo";
import { formatCodigoBoleto } from "@/lib/artefactos.generated";
import { formatCiudad } from "@/lib/ciudades";
import { formatDiaVE, formatFechaHoraCortaVE, formatHoraVE } from "@/lib/fechas";
import type { ResultadoEmbarque } from "@/lib/types/pagos";
import { formatCedula } from "@/lib/ve";
import { cn } from "@/lib/utils";

/** Viaje de hoy que se puede embarcar (PROGRAMADO o EN_CURSO). */
export type ViajeHoy = {
  id: string;
  fecha_hora_salida: string;
  numero_unidad: string | null;
  estado: string;
  asientos_totales: number | null;
  ruta: { ciudad_origen: string; ciudad_destino: string } | null;
};

export type Escaneo = { codigo: string; resultado: ResultadoEmbarque };

/** "Hoy · 8:00 a. m.", "Mañana · 6:00 a. m.", "Ayer · …" o "05/10 · 6:00 a. m.". */
function diaYHora(iso: string, dias: number) {
  if (dias === 0) return `Hoy · ${formatHoraVE(iso)}`;
  if (dias === 1) return `Mañana · ${formatHoraVE(iso)}`;
  if (dias === -1) return `Ayer · ${formatHoraVE(iso)}`;
  return formatFechaHoraCortaVE(iso);
}

/** "V12345678" / "v-12.345.678" -> "V-12.345.678" (para leer en voz alta en el andén). */
function cedulaLegible(cedula: string | null | undefined) {
  return cedula ? formatCedula(cedula) : null;
}

/** "Caracas → Valencia" */
export function rutaDeViaje(v: ViajeHoy) {
  return v.ruta ? `${formatCiudad(v.ruta.ciudad_origen)} → ${formatCiudad(v.ruta.ciudad_destino)}` : "Ruta";
}

/** "8:00 a. m. · Caracas → Valencia · Unidad 12" */
export function etiquetaViaje(v: ViajeHoy) {
  return `${formatHoraVE(v.fecha_hora_salida)} · ${rutaDeViaje(v)}${v.numero_unidad ? ` · Unidad ${v.numero_unidad}` : ""}`;
}

// ─── Último escaneo ─────────────────────────────────────────────────────────

const TITULO_RESULTADO: Record<string, { titulo: string; tono: ResultadoEscaneo["tono"] }> = {
  NO_ENCONTRADO: { titulo: "Boleto no encontrado", tono: "error" },
  OTRA_COOPERATIVA: { titulo: "Boleto de otra cooperativa", tono: "error" },
  OTRO_DIA: { titulo: "Boleto de otro día", tono: "error" },
  OTRO_VIAJE: { titulo: "Boleto de otro viaje", tono: "error" },
  PAGO_EN_VERIFICACION: { titulo: "Pago sin verificar", tono: "aviso" },
  RESERVA_SIN_PAGAR: { titulo: "Reserva sin pagar", tono: "aviso" },
  PAGO_RECHAZADO: { titulo: "Pago rechazado", tono: "error" },
  EXPIRADO: { titulo: "Reserva vencida", tono: "error" },
  CANCELADO: { titulo: "Boleto cancelado", tono: "error" },
  USADO: { titulo: "Ya embarcó", tono: "error" },
  VIAJE_CANCELADO: { titulo: "Viaje cancelado", tono: "error" },
};

/** "Asiento 14 · Ana Pérez" */
export function asientoYPasajero(boleto: { asiento: string; pasajero_nombre: string | null }) {
  return `Asiento ${boleto.asiento} · ${boleto.pasajero_nombre || "Sin nombre"}`;
}

/**
 * Resultado del escaneo para el panel "Último escaneo" (con sonido). Un boleto
 * válido no se registra aquí: se registra al confirmar el embarque.
 */
export function escaneoDeResultado(codigo: string, r: ResultadoEmbarque): Omit<ResultadoEscaneo, "at"> | null {
  if (r.resultado === "VALIDO") return null;
  const tipo = "boleto" in r && r.resultado === "OTRO_VIAJE" && r.dias_diferencia !== 0 ? "OTRO_DIA" : r.resultado;
  const { titulo, tono } = TITULO_RESULTADO[tipo] ?? { titulo: "No se puede embarcar", tono: "error" as const };
  return {
    codigo: formatCodigoBoleto("boleto" in r ? r.boleto.codigo_boleto : codigo),
    tono,
    titulo,
    detalle: "boleto" in r ? asientoYPasajero(r.boleto) : undefined,
  };
}

// ─── Diálogo ────────────────────────────────────────────────────────────────

type Tono = "ok" | "alerta" | "error";

/** Franja del veredicto: se lee de lejos (color + icono + texto, nunca solo el color). */
const TONOS: Record<Tono, { franja: string; icono: string; borde: string; veredicto: string; Icono: typeof CheckCircle }> = {
  ok: {
    franja: "bg-success-light text-success-deep",
    icono: "text-success-text",
    borde: "border-success/40",
    veredicto: "Puede embarcar",
    Icono: CheckCircle,
  },
  alerta: {
    franja: "bg-warning-light text-warning-deep",
    icono: "text-warning-text",
    borde: "border-warning/40",
    veredicto: "Revisa antes de embarcar",
    Icono: Warning,
  },
  error: {
    franja: "bg-destructive-light text-destructive-deep",
    icono: "text-destructive-text",
    borde: "border-destructive/40",
    veredicto: "No embarcar",
    Icono: XCircle,
  },
};

export function ResultadoEmbarqueDialog({
  escaneo,
  viajesHoy,
  viajeElegido,
  confirmando,
  revalidando,
  onCerrar,
  onConfirmar,
  onRevalidar,
  onCobrar,
  onVender,
  onCambiarBus,
}: {
  escaneo: Escaneo | null;
  viajesHoy: ViajeHoy[];
  viajeElegido: ViajeHoy | null;
  confirmando: boolean;
  revalidando: boolean;
  onCerrar: () => void;
  onConfirmar: (boletoId: string) => void;
  onRevalidar: () => void;
  onCobrar: (boletoId: string) => void;
  onVender: (viajeId: string) => void;
  onCambiarBus: (viajeId: string) => void;
}) {
  // El diálogo de verificación embebido llama a onResuelto y luego a onOpenChange(false):
  // tras resolver no se cierra todo, se vuelve a validar el boleto.
  const resueltoRef = useRef(false);
  // Acción principal (Confirmar embarque, Cobrar ahora…): Enter la activa al abrir.
  const principalRef = useRef<HTMLButtonElement>(null);
  const r = escaneo?.resultado;

  let tono: Tono = "error";
  let titulo = "";
  let cuerpo: React.ReactNode = null;
  let acciones: React.ReactNode = (
    <Button variant="outline" size="lg" onClick={onCerrar} autoFocus ref={principalRef}>
      Cerrar
    </Button>
  );

  if (r && !("boleto" in r)) {
    titulo = r.resultado === "NO_ENCONTRADO" ? "Boleto no encontrado" : "Boleto de otra cooperativa";
    cuerpo = (
      <p className="text-base">
        {r.resultado === "NO_ENCONTRADO" ? (
          <>
            No encontramos el boleto <span className="font-mono font-medium">{formatCodigoBoleto(r.codigo)}</span>. Revisa que esté
            completo o escanéalo de nuevo.
          </>
        ) : (
          <>
            El boleto <span className="font-mono font-medium">{formatCodigoBoleto(r.codigo)}</span> es de otra cooperativa. El pasajero debe
            embarcar con esa empresa.
          </>
        )}
      </p>
    );
  } else if (r && "boleto" in r) {
    const { boleto, viaje, pago } = r;
    const ruta = `${formatCiudad(viaje.origen)} → ${formatCiudad(viaje.destino)}`;
    const pasajero = [boleto.pasajero_nombre || "Sin nombre", cedulaLegible(boleto.pasajero_cedula)].filter(Boolean).join(" · ");
    const resumen = (
      <div className="flex flex-col gap-1 rounded-md bg-muted/50 p-3 text-sm">
        <p className="font-medium">
          {ruta} · {diaYHora(viaje.salida, r.dias_diferencia)}
          {viaje.unidad ? ` · Unidad ${viaje.unidad}` : ""}
        </p>
        <p>
          Asiento <strong>{boleto.asiento}</strong> · {pasajero}
        </p>
        <p className="font-mono text-xs text-muted-foreground">{formatCodigoBoleto(boleto.codigo_boleto)}</p>
      </div>
    );

    // El servidor revisa OTRO_VIAJE antes que OTRO_DIA: con un bus elegido, un boleto de
    // otro día llega como OTRO_VIAJE. Para quien embarca lo importante es que es de otro día.
    const resultado = r.resultado === "OTRO_VIAJE" && r.dias_diferencia !== 0 ? "OTRO_DIA" : r.resultado;

    switch (resultado) {
      case "VALIDO":
        tono = "ok";
        titulo = "Boleto válido";
        cuerpo = (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-4">
              <div className="flex shrink-0 flex-col items-center rounded-md border border-border px-4 py-2">
                <span className="text-xs text-muted-foreground">Asiento</span>
                <span className="text-4xl font-semibold tabular-nums">{boleto.asiento}</span>
              </div>
              <div className="flex min-w-0 flex-col gap-0.5">
                <p className="text-lg font-semibold leading-snug">{boleto.pasajero_nombre || "Sin nombre"}</p>
                {boleto.pasajero_cedula && <p className="text-base">{cedulaLegible(boleto.pasajero_cedula)}</p>}
              </div>
            </div>
            <p className="text-base font-medium">
              Sale {diaYHora(viaje.salida, r.dias_diferencia)} · {ruta}
              {viaje.unidad ? ` · Unidad ${viaje.unidad}` : ""}
            </p>
            <p className="font-mono text-xs text-muted-foreground">{formatCodigoBoleto(boleto.codigo_boleto)}</p>
          </div>
        );
        acciones = (
          <>
            <Button variant="outline" size="lg" onClick={onCerrar} disabled={confirmando}>
              No embarcar
            </Button>
            <Button size="lg" autoFocus ref={principalRef} onClick={() => onConfirmar(boleto.id)} disabled={confirmando}>
              {confirmando && <Spinner size="sm" />}
              {confirmando ? "Embarcando…" : "Confirmar embarque"}
            </Button>
          </>
        );
        break;

      case "OTRO_DIA":
        titulo = "Este boleto es para otro día";
        cuerpo = (
          <div className="flex flex-col gap-3">
            <p className="text-base font-medium">
              {r.dias_diferencia > 0
                ? `Es para el viaje de ${r.dias_diferencia === 1 ? "mañana" : `el ${formatDiaVE(viaje.salida)}`} a las ${formatHoraVE(viaje.salida)}. No lo embarques en este bus.`
                : `Era para el viaje del ${formatDiaVE(viaje.salida)} a las ${formatHoraVE(viaje.salida)}, que ya salió. No lo embarques.`}
            </p>
            {resumen}
          </div>
        );
        break;

      case "OTRO_VIAJE": {
        titulo = "Este boleto es de otro bus";
        const suBus = viajesHoy.find((v) => v.id === viaje.id);
        cuerpo = (
          <div className="flex flex-col gap-3">
            <p className="text-base font-medium">
              Es para {ruta} · {diaYHora(viaje.salida, r.dias_diferencia)}
              {viaje.unidad ? ` · Unidad ${viaje.unidad}` : ""}.
              {viajeElegido ? ` Estás embarcando ${etiquetaViaje(viajeElegido)}.` : ""} No lo embarques en este bus.
            </p>
            {resumen}
          </div>
        );
        if (suBus) {
          acciones = (
            <>
              <Button variant="outline" size="lg" onClick={onCerrar}>
                Cerrar
              </Button>
              <Button size="lg" autoFocus ref={principalRef} onClick={() => onCambiarBus(suBus.id)} disabled={revalidando}>
                Cambiar a ese bus
              </Button>
            </>
          );
        }
        break;
      }

      case "PAGO_EN_VERIFICACION":
        tono = "alerta";
        titulo = "Pago por verificar";
        cuerpo = (
          <div className="flex flex-col gap-3">
            <p className="text-sm">Compáralo con tu banco: si lo apruebas, lo embarcas de inmediato.</p>
            {resumen}
            {pago && (
              <VerificarPagoDialog
                embebido
                open
                pagoId={pago.id}
                onResuelto={() => {
                  resueltoRef.current = true;
                  onRevalidar();
                }}
                onOpenChange={(abierto) => {
                  if (abierto) return;
                  if (resueltoRef.current) {
                    resueltoRef.current = false;
                    return;
                  }
                  onCerrar();
                }}
              />
            )}
          </div>
        );
        acciones = (
          <Button variant="outline" size="lg" onClick={onCerrar}>
            Cerrar sin embarcar
          </Button>
        );
        break;

      case "RESERVA_SIN_PAGAR":
        tono = "alerta";
        titulo = "Reserva sin pagar";
        cuerpo = (
          <div className="flex flex-col gap-3">
            <p className="text-base font-medium">
              El pasajero apartó el asiento pero no ha pagado.
              {boleto.reserva_expira_at ? ` Vence a las ${formatHoraVE(boleto.reserva_expira_at)}.` : ""}
            </p>
            {resumen}
          </div>
        );
        acciones = (
          <>
            <Button variant="outline" size="lg" onClick={onCerrar}>
              No embarcar
            </Button>
            <Button size="lg" autoFocus ref={principalRef} onClick={() => onCobrar(boleto.id)}>
              Cobrar ahora
            </Button>
          </>
        );
        break;

      case "PAGO_RECHAZADO":
        titulo = "Pago rechazado";
        cuerpo = (
          <div className="flex flex-col gap-3">
            <p className="text-base font-medium">{pago?.motivo_rechazo || "La cooperativa rechazó el pago que registró el pasajero."}</p>
            <p className="text-sm text-muted-foreground">Cobra el pasaje para poder embarcarlo.</p>
            {resumen}
          </div>
        );
        acciones = (
          <>
            <Button variant="outline" size="lg" onClick={onCerrar}>
              No embarcar
            </Button>
            <Button size="lg" autoFocus ref={principalRef} onClick={() => onCobrar(boleto.id)}>
              Cobrar ahora
            </Button>
          </>
        );
        break;

      case "EXPIRADO":
        titulo = "Reserva vencida";
        cuerpo = (
          <div className="flex flex-col gap-3">
            <p className="text-base font-medium">El asiento se liberó. Si aún quiere viajar, véndele un boleto nuevo.</p>
            {resumen}
          </div>
        );
        acciones = (
          <>
            <Button variant="outline" size="lg" onClick={onCerrar}>
              Cerrar
            </Button>
            <Button size="lg" autoFocus ref={principalRef} onClick={() => onVender(viaje.id)}>
              Vender boleto
            </Button>
          </>
        );
        break;

      case "CANCELADO":
        titulo = "Boleto cancelado";
        cuerpo = (
          <div className="flex flex-col gap-3">
            <p className="text-base font-medium">
              Este boleto se canceló{boleto.updated_at ? ` el ${formatFechaHoraCortaVE(boleto.updated_at)}` : ""}. No lo embarques.
            </p>
            {boleto.motivo_cancelacion && (
              <p className="text-sm">
                <span className="text-muted-foreground">Motivo:</span> {boleto.motivo_cancelacion}
              </p>
            )}
            {resumen}
          </div>
        );
        break;

      case "USADO": {
        const cuando = boleto.embarcado_at ?? boleto.updated_at;
        titulo = "Boleto ya usado";
        cuerpo = (
          <div className="flex flex-col gap-3">
            <p className="text-base font-medium">
              Este boleto ya se usó para embarcar{cuando ? ` el ${formatFechaHoraCortaVE(cuando)}` : ""}.
            </p>
            {resumen}
          </div>
        );
        break;
      }

      case "VIAJE_CANCELADO":
        titulo = "Viaje cancelado";
        cuerpo = (
          <div className="flex flex-col gap-3">
            <p className="text-base font-medium">
              El viaje de este boleto se canceló. No lo embarques: envíalo a la taquilla para cambiar el boleto o
              devolverle el dinero.
            </p>
            {resumen}
          </div>
        );
        break;
    }
  }

  const estilo = TONOS[tono];
  const { Icono } = estilo;

  return (
    <Dialog open={!!escaneo} onOpenChange={(abierto) => !abierto && !confirmando && onCerrar()}>
      <DialogContent initialFocus={principalRef} className={cn("gap-5", estilo.borde)}>
        <DialogHeader className={cn("-mx-6 -mt-6 py-5 pr-14 pl-6", estilo.franja)}>
          <DialogTitle className="flex items-center gap-3 text-2xl leading-tight">
            <Icono weight="fill" className={cn("size-10 shrink-0", estilo.icono)} aria-hidden />
            <span className="flex min-w-0 flex-col">
              <span className="text-sm font-medium">{estilo.veredicto}</span>
              <span>{titulo}</span>
            </span>
          </DialogTitle>
          <DialogDescription className="sr-only">Resultado del escaneo del boleto</DialogDescription>
        </DialogHeader>
        {revalidando ? (
          <div className="flex flex-col gap-2" role="status" aria-label="Revisando el boleto de nuevo">
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-16 w-full rounded-md" />
          </div>
        ) : (
          cuerpo
        )}
        <DialogFooter className="sm:justify-between">{acciones}</DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
