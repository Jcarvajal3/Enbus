"use client";

// ─── Marcar salida y Marcar llegada (Viajes, hoja del viaje y Despacho) ──────
// Confirmaciones con `ConfirmDialog` (D3): "Marcar salida" / "Marcar llegada"
// y "Cancelar" para salir sin hacer nada (SY-25). El error se ve dentro.

import { useEffect, useId, useState } from "react";
import { ConfirmDialog, type ResultadoConfirmacion } from "@/components/confirm-dialog";
import { requireOnline } from "@/components/connectivity-banner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { asignarUnidad, completarViaje, listarBusesActivos, marcarSalidaViaje } from "@/app/cooperativas/(panel)/viajes/actions";
import { avisarExito, avisarInfo } from "@/lib/avisos";
import { formatCiudad } from "@/lib/ciudades";
import { humanizeError } from "@/lib/errores";
import { formatHoraVE } from "@/lib/fechas";
import type { BusParaViaje } from "@/lib/types/operacion";
import type { SalidaViaje } from "@/lib/types/pagos";

export type ViajeParaSalida = {
  id: string;
  origen: string;
  destino: string;
  salida: string;
  /**
   * Unidad del viaje. Con `numero_unidad` y `bus_id` en null (no `undefined`) el diálogo
   * pide la unidad antes de marcar la salida. Si no se pasan, lo decide el servidor
   * (EB_SIN_UNIDAD) y el diálogo la pide entonces.
   */
  numero_unidad?: string | null;
  bus_id?: string | null;
};

/** El viaje sin unidad conocida: los dos datos llegaron y están vacíos. */
function sinUnidadConocida(v: ViajeParaSalida | null) {
  return Boolean(v) && v!.numero_unidad !== undefined && !v!.numero_unidad && !v!.bus_id;
}

function plural(n: number, uno: string, varios: string) {
  return n === 1 ? uno : varios.replace("{n}", String(n));
}

/** "Caracas → Valencia · 2:30 p. m." */
export function identidadViaje(v: { origen: string | null | undefined; destino: string | null | undefined; salida: string }) {
  return `${formatCiudad(v.origen)} → ${formatCiudad(v.destino)} · ${formatHoraVE(v.salida)}`;
}

/**
 * Confirmación de "Marcar salida". Cierra la venta de boletos de esa salida y
 * libera las reservas sin pagar (fn_marcar_salida_viaje).
 */
export function MarcarSalidaDialog(props: {
  viaje: ViajeParaSalida | null;
  open: boolean;
  onOpenChange: (abierto: boolean) => void;
  onHecho?: (r: SalidaViaje) => void;
}) {
  // Con otro viaje, el diálogo empieza limpio (unidad y chofer elegidos, errores).
  return <MarcarSalidaContenido key={props.viaje?.id ?? "ninguno"} {...props} />;
}

/** Select de bus + chofer para salidas sin unidad: los buses se cargan al montarse. */
function ElegirUnidad({
  busId,
  chofer,
  onBus,
  onChofer,
}: {
  busId: string;
  chofer: string;
  onBus(id: string, chofer: string): void;
  onChofer(texto: string): void;
}) {
  const uid = useId();
  const [buses, setBuses] = useState<BusParaViaje[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    void (async () => {
      try {
        const r = await listarBusesActivos();
        if (!vivo) return;
        if (r.success) setBuses(r.data);
        else setError(r.error);
      } catch (err) {
        if (vivo) setError(humanizeError(err, "cargar los buses"));
      }
    })();
    return () => {
      vivo = false;
    };
  }, []);

  const opciones = (buses ?? []).map((b) => ({
    value: b.id,
    label: `${b.numero_unidad} · ${b.asientos === 1 ? "1 puesto" : `${b.asientos} puestos`}`,
  }));
  const bus = buses?.find((b) => b.id === busId) ?? null;

  return (
    <div className="grid gap-4 text-foreground">
      <p>Esta salida no tiene unidad. Elígela para poder marcar la salida.</p>
      <div className="grid gap-2">
        <Label htmlFor={`${uid}-bus`}>Unidad</Label>
        <Select
          value={busId || null}
          onValueChange={(v) => onBus(v ?? "", buses?.find((b) => b.id === v)?.chofer_nombre ?? "")}
          items={opciones}
          disabled={buses === null && !error}
        >
          <SelectTrigger id={`${uid}-bus`} className="w-full">
            <SelectValue placeholder={buses === null && !error ? "Cargando…" : "Elige la unidad"} />
          </SelectTrigger>
          <SelectContent>
            {opciones.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {error ? (
          <p role="alert" className="text-[13px] text-destructive-text">{error}</p>
        ) : buses && buses.length === 0 ? (
          <p className="text-[13px] text-muted-foreground">No hay buses activos. Pídele al administrador que registre uno.</p>
        ) : null}
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`${uid}-chofer`}>Chofer</Label>
        <Input
          id={`${uid}-chofer`}
          type="text"
          autoComplete="off"
          autoCapitalize="words"
          maxLength={80}
          value={chofer}
          disabled={!bus}
          placeholder={bus ? (bus.chofer_nombre ?? "Sin chofer") : "Primero elige la unidad"}
          onChange={(e) => onChofer(e.target.value)}
        />
      </div>
    </div>
  );
}

function MarcarSalidaContenido({
  viaje,
  open,
  onOpenChange,
  onHecho,
}: {
  viaje: ViajeParaSalida | null;
  open: boolean;
  onOpenChange: (abierto: boolean) => void;
  onHecho?: (r: SalidaViaje) => void;
}) {
  const [busId, setBusId] = useState("");
  const [chofer, setChofer] = useState("");
  // El servidor dijo EB_SIN_UNIDAD aunque no lo sabíamos de antemano.
  const [faltaUnidad, setFaltaUnidad] = useState(false);
  const pedirUnidad = sinUnidadConocida(viaje) || faltaUnidad;

  const confirmar = async (): Promise<ResultadoConfirmacion> => {
    if (!viaje) return { ok: false, error: "No encontramos el viaje. Actualiza la página." };
    try {
      if (pedirUnidad) {
        if (!busId) return { ok: false, error: "Elige la unidad que hace esta salida." };
        const a = await requireOnline(() => asignarUnidad({ viajeId: viaje.id, busId, nombreChofer: chofer }))();
        if (!a.success) return { ok: false, error: a.error };
      }
      const res = await requireOnline(() => marcarSalidaViaje(viaje.id))();
      if (!res.success) {
        if (res.codigo === "EB_SIN_UNIDAD") setFaltaUnidad(true);
        return { ok: false, error: res.error };
      }
      if (res.data.ya_procesado) {
        avisarInfo("Este viaje ya estaba marcado como salido.");
      } else {
        const r = res.data.reservas_liberadas ?? 0;
        const p = res.data.pagos_en_verificacion ?? 0;
        const liberadas = r > 0 ? ` ${plural(r, "Se liberó 1 reserva sin pagar.", "Se liberaron {n} reservas sin pagar.")}` : "";
        const pendientes = p > 0 ? ` ${plural(p, "Queda 1 pago por verificar.", "Quedan {n} pagos por verificar.")}` : "";
        avisarExito(`Salida registrada.${liberadas}${pendientes}`);
      }
      onHecho?.(res.data);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: humanizeError(err, "marcar la salida del viaje") };
    }
  };

  return (
    <ConfirmDialog
      open={open && viaje !== null}
      onOpenChange={onOpenChange}
      titulo={viaje ? `¿Ya salió el bus ${identidadViaje(viaje)}?` : "¿Ya salió el bus?"}
      descripcion={
        pedirUnidad ? (
          <ElegirUnidad
            busId={busId}
            chofer={chofer}
            onBus={(id, choferBus) => {
              setBusId(id);
              setChofer(choferBus);
            }}
            onChofer={setChofer}
          />
        ) : undefined
      }
      impacto={["Se cierra la venta de boletos de esta salida.", "Se liberan las reservas sin pagar."]}
      verbo="Marcar salida"
      verboCargando="Registrando…"
      onConfirm={confirmar}
    />
  );
}

/** Confirmación de "Marcar llegada" (viaje EN_CURSO → COMPLETADO). */
export function MarcarLlegadaDialog({
  viaje,
  open,
  onOpenChange,
  onHecho,
}: {
  viaje: ViajeParaSalida | null;
  open: boolean;
  onOpenChange: (abierto: boolean) => void;
  onHecho?: () => void;
}) {
  const confirmar = async (): Promise<ResultadoConfirmacion> => {
    if (!viaje) return { ok: false, error: "No encontramos el viaje. Actualiza la página." };
    try {
      const res = await requireOnline(() => completarViaje(viaje.id))();
      if (!res.success) return { ok: false, error: res.error };
      if (res.data.ya_procesado) {
        avisarInfo("Este viaje ya estaba completado.");
      } else {
        const n = res.data.no_embarcados ?? 0;
        avisarExito(
          n > 0 ? `Viaje completado. ${plural(n, "1 pasajero no embarcó.", "{n} pasajeros no embarcaron.")}` : "Viaje completado."
        );
      }
      onHecho?.();
      return { ok: true };
    } catch (err) {
      return { ok: false, error: humanizeError(err, "marcar la llegada del viaje") };
    }
  };

  return (
    <ConfirmDialog
      open={open && viaje !== null}
      onOpenChange={onOpenChange}
      titulo={viaje ? `¿Ya llegó el bus ${identidadViaje(viaje)}?` : "¿Ya llegó el bus?"}
      impacto={["El viaje queda como «Completado».", "Los pasajeros que no embarcaron quedan registrados."]}
      verbo="Marcar llegada"
      verboCargando="Registrando…"
      onConfirm={confirmar}
    />
  );
}
