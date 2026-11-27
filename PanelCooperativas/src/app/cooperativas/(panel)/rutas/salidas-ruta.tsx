"use client";

import { useId, useState, useTransition } from "react";
import { ArrowCounterClockwise, PencilSimple, Plus, X } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { AvisoError } from "@/components/aviso-error";
import { requireOnline } from "@/components/connectivity-banner";
import { Campo, HoraField } from "@/components/campos";
import { avisarError, avisarExito } from "@/lib/avisos";
import { humanizeError } from "@/lib/errores";
import { formatFechaCalendario, formatHoraVE, hoyVE } from "@/lib/fechas";
import type { Horario, ResultadoHorario, SalidaConservada } from "@/lib/types/horarios";
import { cn } from "@/lib/utils";
import { DIAS_SEMANA } from "../viajes/salidas";
import { cambiarEstadoHorario, guardarHorario, type ResultadoGuardarHorario } from "./horarios-actions";

const CAPACIDAD_MAX = 80;
const TODOS_LOS_DIAS = [1, 2, 3, 4, 5, 6, 0];
const LUN_A_VIE = [1, 2, 3, 4, 5];

/** "Lun a Vie", "Todos los días" o "Lun, Mié, Sáb" (semana empezando en lunes). */
export function textoDias(dias: number[]): string {
  const elegidos = DIAS_SEMANA.filter((d) => dias.includes(d.dow));
  if (elegidos.length === 7) return "Todos los días";
  if (elegidos.length === 5 && LUN_A_VIE.every((d) => dias.includes(d))) return "Lun a Vie";
  return elegidos.map((d) => d.corto).join(", ");
}

/** Una línea por salida activa: "8:00 a. m. · Lun a Vie", ordenadas por hora. */
export function resumenSalidas(horarios: Horario[]): string[] {
  return horarios
    .filter((h) => h.activo)
    .sort((a, b) => a.hora_salida.localeCompare(b.hora_salida))
    .map((h) => `${formatHoraVE(h.hora_salida)} · ${textoDias(h.dias)}`);
}

/** Mensaje de éxito tras crear, editar, quitar o reactivar una salida. */
function mensajeResultado(r: ResultadoHorario, base: string): string {
  const partes: string[] = [];
  if (r.creadas > 0) {
    const salidas = r.creadas === 1 ? "creó 1 salida" : `crearon ${r.creadas} salidas`;
    partes.push(r.hasta ? `Se ${salidas} hasta el ${formatFechaCalendario(r.hasta)}.` : `Se ${salidas}.`);
  }
  if (r.quitadas > 0) {
    partes.push(r.quitadas === 1 ? "Se quitó 1 salida sin pasajeros." : `Se quitaron ${r.quitadas} salidas sin pasajeros.`);
  }
  if (r.movidas > 0) {
    partes.push(r.movidas === 1 ? "1 salida pasó a la hora nueva." : `${r.movidas} salidas pasaron a la hora nueva.`);
  }
  if (r.sin_unidad_por_choque > 0) {
    partes.push(
      r.sin_unidad_por_choque === 1
        ? "1 salida quedó sin unidad porque ese bus ya tenía otro viaje a esa hora: asígnala en Viajes."
        : `${r.sin_unidad_por_choque} salidas quedaron sin unidad porque esos buses ya tenían otro viaje a esa hora: asígnalas en Viajes.`
    );
  }
  return partes.length > 0 ? `${base} ${partes.join(" ")}` : base;
}

type Editor = { id?: string; hora: string; dias: number[]; capacidad: string; desde: string; hasta: string };
type CampoSalida = "hora" | "capacidad" | "dias";

/**
 * Salidas fijas de una ruta (hora + días + asientos). Cada cambio se guarda al instante;
 * la base crea los viajes de los próximos 30 días. Sin <form> propio: vive dentro del de la ruta.
 */
export function SalidasRuta({
  rutaId,
  rutaActiva,
  horarios,
  capacidadDefecto,
  onConservadas,
}: {
  rutaId: string;
  rutaActiva: boolean;
  horarios: Horario[];
  capacidadDefecto: number;
  onConservadas(conservadas: SalidaConservada[]): void;
}) {
  const uid = useId();
  const [isPending, startTransition] = useTransition();
  const [editor, setEditor] = useState<Editor | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [campoError, setCampoError] = useState<CampoSalida | null>(null);
  const [cambiandoId, setCambiandoId] = useState<string | null>(null);

  const ordenados = [...horarios].sort((a, b) => a.hora_salida.localeCompare(b.hora_salida));
  const activos = ordenados.filter((h) => h.activo);
  const inactivos = ordenados.filter((h) => !h.activo);

  function limpiarError(campo?: CampoSalida) {
    if (campo === undefined || campoError === campo) {
      setError(null);
      setCampoError(null);
    }
  }

  function nueva() {
    setEditor({ hora: "", dias: LUN_A_VIE, capacidad: String(capacidadDefecto), desde: hoyVE(), hasta: "" });
    limpiarError();
  }

  function editar(h: Horario) {
    setEditor({
      id: h.id,
      hora: h.hora_salida.slice(0, 5),
      dias: h.dias,
      capacidad: String(h.capacidad),
      desde: h.vigente_desde,
      hasta: h.vigente_hasta ?? "",
    });
    limpiarError();
  }

  function fallar(mensaje: string, campo?: CampoSalida) {
    setError(mensaje);
    setCampoError(campo ?? null);
    if (campo) document.getElementById(`${uid}-${campo}`)?.focus();
  }

  /** Avisa el éxito y pasa las salidas conservadas; si falló, devuelve el fallo. */
  function recibir(res: ResultadoGuardarHorario, base: string) {
    if (res.error !== undefined) return res;
    avisarExito(mensajeResultado(res.data, base));
    onConservadas(res.data.conservadas);
    return null;
  }

  function guardar() {
    if (!editor || isPending) return;
    limpiarError();
    const n = Number(editor.capacidad);
    if (!editor.hora) return fallar("Elige la hora de salida.", "hora");
    if (editor.dias.length === 0) return fallar("Elige al menos un día de la semana.", "dias");
    if (!Number.isInteger(n) || n < 1 || n > CAPACIDAD_MAX) {
      return fallar(`Los asientos deben estar entre 1 y ${CAPACIDAD_MAX}.`, "capacidad");
    }
    const e = editor;
    startTransition(async () => {
      try {
        const res = await requireOnline(() =>
          guardarHorario({ id: e.id, rutaId, hora: e.hora, dias: e.dias, capacidad: n, desde: e.desde, hasta: e.hasta })
        )();
        const fallo = recibir(res, e.id ? "Salida actualizada." : "Salida agregada.");
        if (fallo) {
          const campo = fallo.campo === "hora" || fallo.campo === "capacidad" || fallo.campo === "dias" ? fallo.campo : undefined;
          fallar(fallo.error, campo);
        } else {
          setEditor(null);
        }
      } catch (err) {
        setError(humanizeError(err, "guardar la salida"));
      }
    });
  }

  function cambiarEstado(h: Horario, activo: boolean) {
    setCambiandoId(h.id);
    startTransition(async () => {
      try {
        const res = await requireOnline(() => cambiarEstadoHorario(h.id, activo))();
        const fallo = recibir(res, activo ? "Salida reactivada." : "Salida quitada.");
        if (fallo) avisarError(fallo.error);
        else if (editor?.id === h.id) setEditor(null);
      } catch (err) {
        avisarError(humanizeError(err, activo ? "reactivar la salida" : "quitar la salida"));
      } finally {
        setCambiandoId(null);
      }
    });
  }

  function alternarDia(dow: number) {
    setEditor((e) => (e ? { ...e, dias: e.dias.includes(dow) ? e.dias.filter((d) => d !== dow) : [...e.dias, dow] } : e));
    limpiarError("dias");
  }

  const fila = (h: Horario) => (
    <li
      key={h.id}
      className={cn(
        "flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2",
        !h.activo && "text-muted-foreground"
      )}
    >
      <span className="min-w-0 text-[15px]">
        <span className="font-semibold tabular-nums">{formatHoraVE(h.hora_salida)}</span>
        <span className="text-muted-foreground">
          {" · "}
          {textoDias(h.dias)}
          {" · "}
          {h.capacidad} asientos
        </span>
      </span>
      <span className="flex shrink-0 gap-1">
        {h.activo ? (
          <>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => editar(h)}
              disabled={isPending}
              aria-label={`Editar la salida de las ${formatHoraVE(h.hora_salida)}`}
            >
              <PencilSimple aria-hidden />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => cambiarEstado(h, false)}
              disabled={isPending}
              aria-label={`Quitar la salida de las ${formatHoraVE(h.hora_salida)}`}
            >
              {cambiandoId === h.id ? <Spinner size="sm" /> : <X aria-hidden />}
            </Button>
          </>
        ) : (
          <Button type="button" variant="ghost" size="sm" onClick={() => cambiarEstado(h, true)} disabled={isPending}>
            {cambiandoId === h.id ? <Spinner size="sm" /> : <ArrowCounterClockwise aria-hidden />}
            Reactivar
          </Button>
        )}
      </span>
    </li>
  );

  return (
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <fieldset
      className="grid gap-3"
      // Enter dentro de una salida la guarda; nunca debe guardar la ruta entera.
      onKeyDown={(e) => {
        if (e.key === "Enter" && (e.target as HTMLElement).tagName === "INPUT") {
          e.preventDefault();
          guardar();
        }
      }}
    >
      <legend className="mb-1 text-[13px] font-medium text-foreground">Salidas</legend>
      <p className="text-[13px] text-muted-foreground">
        Los viajes de estas salidas se crean solos para los próximos 30 días, sin contar los días no laborables. La
        unidad se elige luego en Viajes.
      </p>
      {!rutaActiva && (
        <p className="rounded-md bg-warning-light p-3 text-[13px] text-warning-deep">
          La ruta está inactiva: los viajes no se crearán hasta que la actives.
        </p>
      )}

      {activos.length === 0 && !editor && <p className="text-[13px] text-muted-foreground">Sin salidas fijas todavía.</p>}
      {activos.length > 0 && <ul className="grid gap-2">{activos.map(fila)}</ul>}

      {editor ? (
        <div className="grid gap-4 rounded-md bg-surface p-4">
          <p className="text-[15px] font-semibold">{editor.id ? "Editar salida" : "Nueva salida"}</p>
          {error && campoError === null && <AvisoError>{error}</AvisoError>}
          <HoraField
            id={`${uid}-hora`}
            label="Hora de salida"
            required
            value={editor.hora}
            onChange={(v) => {
              setEditor({ ...editor, hora: v });
              limpiarError("hora");
            }}
            error={campoError === "hora" ? error : null}
            disabled={isPending}
          />
          <div id={`${uid}-dias`} tabIndex={-1} className="grid gap-2 outline-none">
            <span className="text-[13px] font-medium text-foreground">Días</span>
            <div className="flex flex-wrap gap-2">
              {DIAS_SEMANA.map((d) => {
                const activo = editor.dias.includes(d.dow);
                return (
                  <button
                    key={d.valor}
                    type="button"
                    aria-pressed={activo}
                    aria-label={d.nombre}
                    disabled={isPending}
                    onClick={() => alternarDia(d.dow)}
                    className={cn(
                      "inline-flex h-11 min-w-11 flex-1 items-center justify-center rounded-full border px-2 text-[15px] font-semibold transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none md:h-10 md:flex-none",
                      activo
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-background text-foreground hover:bg-muted",
                      campoError === "dias" && !activo && "border-destructive"
                    )}
                  >
                    {d.valor}
                  </button>
                );
              })}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setEditor({ ...editor, dias: LUN_A_VIE });
                  limpiarError("dias");
                }}
              >
                Lun a Vie
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setEditor({ ...editor, dias: TODOS_LOS_DIAS });
                  limpiarError("dias");
                }}
              >
                Todos
              </Button>
            </div>
            {campoError === "dias" && error && (
              <p role="alert" className="text-[13px] text-destructive-text">
                {error}
              </p>
            )}
          </div>
          <Campo
            id={`${uid}-capacidad`}
            name="capacidad_salida"
            label="Asientos"
            inputMode="numeric"
            maxLength={String(CAPACIDAD_MAX).length}
            required
            value={editor.capacidad}
            onChange={(v) => {
              setEditor({ ...editor, capacidad: v.replace(/\D/g, "") });
              limpiarError("capacidad");
            }}
            error={campoError === "capacidad" ? error : null}
            disabled={isPending}
            ayuda={`Tu unidad más común tiene ${capacidadDefecto}.`}
          />
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setEditor(null)} disabled={isPending}>
              Cancelar
            </Button>
            <Button type="button" size="sm" onClick={guardar} disabled={isPending} aria-busy={isPending || undefined}>
              {isPending && <Spinner size="sm" aria-hidden />}
              {isPending ? "Guardando…" : "Guardar salida"}
            </Button>
          </div>
        </div>
      ) : (
        <div>
          <Button type="button" variant="outline" size="sm" onClick={nueva} disabled={isPending}>
            <Plus aria-hidden />
            Agregar salida
          </Button>
        </div>
      )}

      {inactivos.length > 0 && (
        <details className="text-[13px]">
          <summary className="cursor-pointer text-muted-foreground">Salidas quitadas ({inactivos.length})</summary>
          <ul className="mt-2 grid gap-2">{inactivos.map(fila)}</ul>
        </details>
      )}
    </fieldset>
  );
}
