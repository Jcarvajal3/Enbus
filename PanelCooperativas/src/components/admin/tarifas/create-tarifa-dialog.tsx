"use client";

// ─── Nueva tarifa en dos pasos (#54, A-07, AD-15, AD-16) ─────────────────────
// 1 "Nueva tarifa": los valores y desde cuándo rigen (ahora o programada).
// 2 "Revisa los cambios": Antes → Después por campo y ejemplos con rutas reales
//   calculados con la fórmula de `_costo_encomienda`. Publicar o programar llama a
//   fn_publicar_tarifa (una sola operación en la base).

import { useId, useMemo, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowLeft,
  ArrowRight,
  CalendarBlank,
  CurrencyDollar,
  NotePencil,
  Plus,
  Ruler,
  Scales,
  SpinnerIcon,
  Timer,
  WarningCircle,
} from "@phosphor-icons/react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createTarifa } from "@/app/admin/(panel)/tarifas/actions";
import { humanizeError } from "@/lib/errores";
import { formatNumeroVE, formatUsd } from "@/lib/dinero";
import { fechaHoraVEaISO, hoyVE } from "@/lib/fechas";
import { formatCiudad } from "@/lib/ciudades";
import { cn } from "@/lib/utils";
import {
  costoEncomiendaUsd,
  formatFechaProgramada,
  recargoPorcentaje,
  type ParametrosTarifa,
  type RouteOption,
  type Tarifa,
} from "@/lib/types/admin-tarifas";

type Campo = keyof ParametrosTarifa | "vigente_desde";
type Errores = Partial<Record<Campo, string>>;

const PESOS_EJEMPLO = [1, 5, 10];
const MINUTOS_EJEMPLO = 8 * 60;

/** "2,50" | "2.50" | "1.234,5" → número (NaN si no es válido). */
function leerDecimal(texto: string): number {
  const limpio = texto.trim().replace(/\s/g, "");
  if (!limpio) return NaN;
  const normalizado =
    limpio.lastIndexOf(",") > limpio.lastIndexOf(".")
      ? limpio.replace(/\./g, "").replace(",", ".")
      : limpio.replace(/,/g, "");
  return /^\d+(\.\d+)?$/.test(normalizado) ? Number(normalizado) : NaN;
}

/** 2.5 → "2,5" para precargar el formulario con la tarifa vigente. */
function aTexto(n: number | null | undefined): string {
  return n === null || n === undefined || !Number.isFinite(n) ? "" : String(n).replace(".", ",");
}

/** "+14,7 %", "−3,0 %", "Sin cambio". */
function textoCambio(antes: number, despues: number): string {
  if (antes === despues) return "Sin cambio";
  if (antes === 0) return "Nuevo";
  const pct = ((despues - antes) / antes) * 100;
  const abs = formatNumeroVE(Math.abs(pct), 1);
  if (abs === "0,0") return "Sin cambio";
  return `${pct > 0 ? "+" : "−"}${abs} %`;
}

/** Hasta 3 rutas distintas (origen → destino) repartidas por duración: corta, media y larga. */
function rutasDeEjemplo(rutas: RouteOption[]): RouteOption[] {
  const unicas = new Map<string, RouteOption>();
  for (const r of rutas) {
    const clave = `${formatCiudad(r.ciudad_origen)}→${formatCiudad(r.ciudad_destino)}`;
    if (!unicas.has(clave) && Number(r.duracion_estimada_min) > 0) unicas.set(clave, r);
  }
  const ordenadas = [...unicas.values()].sort((a, b) => a.duracion_estimada_min - b.duracion_estimada_min);
  if (ordenadas.length <= 3) return ordenadas;
  return [ordenadas[0], ordenadas[Math.floor(ordenadas.length / 2)], ordenadas[ordenadas.length - 1]];
}

/** Ahora en Venezuela + 1 hora, redondeado a la hora: valor inicial de "Programar". */
function horaSugerida(): string {
  const partes = new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Caracas",
    hour: "2-digit",
    hourCycle: "h23",
  }).format(new Date());
  const h = (Number(partes) + 1) % 24;
  return `${String(h).padStart(2, "0")}:00`;
}

interface CreateTarifaDialogProps {
  /** Tarifa vigente: precarga el formulario y es el "Antes" de la revisión. */
  vigente: Tarifa | null;
  /** Rutas activas para los ejemplos de la revisión. */
  rutas: RouteOption[];
}

export function CreateTarifaDialog({ vigente, rutas }: CreateTarifaDialogProps) {
  const [open, setOpen] = useState(false);
  const [publicando, setPublicando] = useState(false);

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!publicando) setOpen(v);
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <Plus className="size-4" aria-hidden /> Nueva tarifa
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-xl">
        {/* Se monta al abrir: cada vez empieza desde la tarifa vigente. */}
        {open && (
          <Formulario
            vigente={vigente}
            rutas={rutas}
            publicando={publicando}
            setPublicando={setPublicando}
            onCerrar={() => setOpen(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function Formulario({
  vigente,
  rutas,
  publicando,
  setPublicando,
  onCerrar,
}: CreateTarifaDialogProps & { publicando: boolean; setPublicando(v: boolean): void; onCerrar(): void }) {
  const router = useRouter();
  const uid = useId();
  const id = (s: string) => `${uid}-${s}`;
  const enCurso = useRef(false);

  const [paso, setPaso] = useState<1 | 2>(1);
  const [porKg, setPorKg] = useState(aTexto(vigente?.tarifa_por_kg));
  const [factor, setFactor] = useState(aTexto(vigente?.factor_distancia_por_min));
  const [pesoMax, setPesoMax] = useState(aTexto(vigente?.peso_max_kg));
  const [medidaMax, setMedidaMax] = useState(aTexto(vigente?.dimensiones_max_cm));
  const [cuando, setCuando] = useState<"ahora" | "programar">("ahora");
  const [fecha, setFecha] = useState(hoyVE());
  const [hora, setHora] = useState(horaSugerida);
  const [nota, setNota] = useState("");
  const [errores, setErrores] = useState<Errores>({});
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);

  const nueva: ParametrosTarifa = {
    tarifa_por_kg: leerDecimal(porKg),
    factor_distancia_por_min: leerDecimal(factor),
    peso_max_kg: leerDecimal(pesoMax),
    dimensiones_max_cm: leerDecimal(medidaMax),
  };
  const recargo8h = Number.isFinite(nueva.factor_distancia_por_min)
    ? recargoPorcentaje(nueva.factor_distancia_por_min, MINUTOS_EJEMPLO)
    : null;
  const ejemplos = useMemo(() => rutasDeEjemplo(rutas), [rutas]);

  const limpiarError = (campo: Campo) => {
    if (errores[campo]) setErrores((e) => ({ ...e, [campo]: undefined }));
    setErrorGeneral(null);
  };

  /** Misma validación que fn_publicar_tarifa; el foco va al primer campo con error. */
  const validar = (): boolean => {
    const e: Errores = {};
    if (!Number.isFinite(nueva.tarifa_por_kg) || nueva.tarifa_por_kg <= 0 || nueva.tarifa_por_kg > 1000) {
      e.tarifa_por_kg = "Escribe el precio por kilo en USD, mayor que 0 (por ejemplo 2,50).";
    }
    if (!Number.isFinite(nueva.factor_distancia_por_min) || nueva.factor_distancia_por_min < 0 || nueva.factor_distancia_por_min > 1) {
      e.factor_distancia_por_min = "El recargo por minuto de viaje debe estar entre 0 y 1 (por ejemplo 0,0010).";
    }
    if (!Number.isFinite(nueva.peso_max_kg) || nueva.peso_max_kg < 1 || nueva.peso_max_kg > 100) {
      e.peso_max_kg = "El peso máximo debe estar entre 1 y 100 kg.";
    }
    if (!Number.isInteger(nueva.dimensiones_max_cm) || nueva.dimensiones_max_cm < 10 || nueva.dimensiones_max_cm > 300) {
      e.dimensiones_max_cm = "La medida máxima debe ser un número entero entre 10 y 300 cm.";
    }
    if (cuando === "programar") {
      if (!fecha || !hora) {
        e.vigente_desde = "Elige la fecha y la hora en que empieza a regir.";
      } else if (new Date(fechaHoraVEaISO(fecha, hora)).getTime() <= Date.now()) {
        e.vigente_desde = "La fecha programada tiene que ser posterior a ahora.";
      }
    }
    setErrores(e);
    const primero = (["tarifa_por_kg", "factor_distancia_por_min", "peso_max_kg", "dimensiones_max_cm", "vigente_desde"] as Campo[]).find(
      (c) => e[c]
    );
    if (primero) document.getElementById(id(primero))?.focus();
    return !primero;
  };

  const irARevision = (ev: FormEvent) => {
    ev.preventDefault();
    if (validar()) setPaso(2);
  };

  const publicar = async () => {
    if (enCurso.current) return;
    enCurso.current = true;
    setPublicando(true);
    setErrorGeneral(null);
    try {
      const res = await createTarifa({
        ...nueva,
        programar: cuando === "programar" ? { fecha, hora } : null,
        nota: nota.trim() || null,
      });
      if (!res.success) {
        const campo = res.campo as Campo | undefined;
        if (campo && ["tarifa_por_kg", "factor_distancia_por_min", "peso_max_kg", "dimensiones_max_cm", "vigente_desde"].includes(campo)) {
          setErrores({ [campo]: res.error });
          setPaso(1);
        } else {
          setErrorGeneral(res.error || "No pudimos publicar la tarifa. Intenta de nuevo.");
        }
        return;
      }
      if (res.data?.estado === "PROGRAMADA") {
        toast.success(`Tarifa programada para el ${formatFechaProgramada(res.data.vigente_desde)}.`);
      } else {
        toast.success("Tarifa publicada. Ya es la vigente.");
      }
      onCerrar();
      router.refresh();
    } catch (err) {
      setErrorGeneral(humanizeError(err, "publicar la tarifa"));
    } finally {
      enCurso.current = false;
      setPublicando(false);
    }
  };

  const programada = cuando === "programar" && fecha && hora ? formatFechaProgramada(fechaHoraVEaISO(fecha, hora)) : null;

  if (paso === 2) {
    const filas: Array<{ etiqueta: string; antes: number | null; despues: number; formato(n: number): string }> = [
      { etiqueta: "Precio por kilo", antes: vigente?.tarifa_por_kg ?? null, despues: nueva.tarifa_por_kg, formato: formatUsd },
      {
        etiqueta: "Recargo por minuto de viaje",
        antes: vigente?.factor_distancia_por_min ?? null,
        despues: nueva.factor_distancia_por_min,
        formato: (n) => formatNumeroVE(n, 4),
      },
      { etiqueta: "Peso máximo", antes: vigente?.peso_max_kg ?? null, despues: nueva.peso_max_kg, formato: (n) => `${formatNumeroVE(n, 1)} kg` },
      {
        etiqueta: "Medida máxima",
        antes: vigente?.dimensiones_max_cm ?? null,
        despues: nueva.dimensiones_max_cm,
        formato: (n) => `${formatNumeroVE(n, 0)} cm`,
      },
    ];

    return (
      <div className="space-y-5">
        <DialogHeader>
          <DialogTitle>Revisa los cambios</DialogTitle>
          <DialogDescription>
            {programada
              ? `La tarifa nueva empieza a regir el ${programada}. Hasta entonces se sigue cobrando la vigente.`
              : vigente
                ? "La tarifa nueva reemplaza a la vigente en cuanto la publiques; la actual pasa a «Anterior»."
                : "Esta será la primera tarifa: las cooperativas podrán cotizar y cobrar encomiendas en cuanto la publiques."}
          </DialogDescription>
        </DialogHeader>

        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <caption className="sr-only">Valores antes y después del cambio</caption>
            <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
              <tr>
                <th scope="col" className="p-2.5 font-medium">Concepto</th>
                <th scope="col" className="p-2.5 font-medium">Antes</th>
                <th scope="col" className="p-2.5 font-medium">Después</th>
                <th scope="col" className="p-2.5 text-right font-medium">Cambio</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filas.map((f) => (
                <tr key={f.etiqueta}>
                  <th scope="row" className="p-2.5 text-left font-medium">{f.etiqueta}</th>
                  <td className="p-2.5 tabular-nums text-muted-foreground">{f.antes === null ? "—" : f.formato(f.antes)}</td>
                  <td className="p-2.5 font-semibold tabular-nums">{f.formato(f.despues)}</td>
                  <td className="p-2.5 text-right tabular-nums">{f.antes === null ? "Nuevo" : textoCambio(f.antes, f.despues)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <section aria-labelledby={id("ejemplos")} className="space-y-2">
          <h3 id={id("ejemplos")} className="text-sm font-semibold">Ejemplos</h3>
          {ejemplos.length === 0 ? (
            <p className="text-xs text-muted-foreground">No hay rutas activas para mostrar ejemplos.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {ejemplos.map((r) => {
                const ruta = `${formatCiudad(r.ciudad_origen)} → ${formatCiudad(r.ciudad_destino)}`;
                return (
                  <li key={r.id} className="rounded-lg border bg-muted/30 p-3">
                    <p className="font-medium">{ruta}</p>
                    <ul className="mt-1 space-y-0.5 text-xs tabular-nums text-foreground">
                      {PESOS_EJEMPLO.map((kg) => {
                        const despues = costoEncomiendaUsd(kg, nueva, r.duracion_estimada_min);
                        const antes = vigente ? costoEncomiendaUsd(kg, vigente, r.duracion_estimada_min) : null;
                        const excede = kg > nueva.peso_max_kg;
                        return (
                          <li key={kg}>
                            {`${ruta}, ${kg} kg: `}
                            {excede ? (
                              <span className="text-warning-text">supera el peso máximo nuevo ({formatNumeroVE(nueva.peso_max_kg, 1)} kg)</span>
                            ) : antes === null ? (
                              formatUsd(despues)
                            ) : (
                              `${formatUsd(antes)} → ${formatUsd(despues)} (${textoCambio(antes, despues)})`
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="text-xs text-muted-foreground">
            Precios de referencia en USD; el cliente paga en bolívares a la tasa BCV del día.
          </p>
        </section>

        {nota.trim() && (
          <p className="text-sm">
            <span className="text-muted-foreground">Nota: </span>
            {nota.trim()}
          </p>
        )}

        {errorGeneral && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive-light p-3 text-sm text-destructive-deep"
          >
            <WarningCircle className="mt-0.5 size-4 shrink-0" weight="fill" aria-hidden />
            <p>{errorGeneral}</p>
          </div>
        )}

        <div className="flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:justify-between">
          <Button type="button" variant="outline" onClick={() => setPaso(1)} disabled={publicando}>
            <ArrowLeft className="size-4" aria-hidden /> Volver a editar
          </Button>
          <Button type="button" onClick={publicar} disabled={publicando} aria-busy={publicando || undefined} autoFocus>
            {publicando && <SpinnerIcon className="motion-safe:animate-spin" aria-hidden />}
            {publicando
              ? programada
                ? "Programando…"
                : "Publicando…"
              : programada
                ? "Programar tarifa"
                : "Publicar tarifa"}
          </Button>
        </div>
      </div>
    );
  }

  const campoProps = (campo: Campo, ayudaId?: string) => ({
    id: id(campo),
    "aria-invalid": errores[campo] ? true : undefined,
    "aria-describedby": errores[campo] ? id(`${campo}-error`) : ayudaId,
    disabled: publicando,
  });

  const ErrorCampo = ({ campo }: { campo: Campo }) =>
    errores[campo] ? (
      <p id={id(`${campo}-error`)} className="text-xs font-medium text-destructive-text">
        {errores[campo]}
      </p>
    ) : null;

  return (
    <form onSubmit={irARevision} noValidate className="space-y-5">
      <DialogHeader>
        <DialogTitle>Nueva tarifa</DialogTitle>
        <DialogDescription>
          Precio de las encomiendas para todas las cooperativas, en USD de referencia. En el siguiente paso verás cómo
          cambian los precios antes de publicarla.
        </DialogDescription>
      </DialogHeader>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={id("tarifa_por_kg")} className="flex items-center gap-1.5">
            <CurrencyDollar className="size-4 text-muted-foreground" aria-hidden /> Precio por kilo (USD)
          </Label>
          <Input
            {...campoProps("tarifa_por_kg")}
            inputMode="decimal"
            autoComplete="off"
            placeholder="Ej: 2,50"
            value={porKg}
            onChange={(e) => {
              setPorKg(e.target.value);
              limpiarError("tarifa_por_kg");
            }}
            className="tabular-nums"
          />
          <ErrorCampo campo="tarifa_por_kg" />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={id("factor_distancia_por_min")} className="flex items-center gap-1.5">
            <Timer className="size-4 text-muted-foreground" aria-hidden /> Recargo por minuto de viaje
          </Label>
          <Input
            {...campoProps("factor_distancia_por_min", id("factor-ayuda"))}
            inputMode="decimal"
            autoComplete="off"
            placeholder="Ej: 0,0010"
            value={factor}
            onChange={(e) => {
              setFactor(e.target.value);
              limpiarError("factor_distancia_por_min");
            }}
            className="tabular-nums"
          />
          {errores.factor_distancia_por_min ? (
            <ErrorCampo campo="factor_distancia_por_min" />
          ) : (
            <p id={id("factor-ayuda")} className="text-xs text-muted-foreground" aria-live="polite">
              {recargo8h === null
                ? "Se suma al precio base por cada minuto que dura el viaje."
                : `Para un viaje de 8 h: +${formatNumeroVE(recargo8h, 0)} %`}
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={id("peso_max_kg")} className="flex items-center gap-1.5">
            <Scales className="size-4 text-muted-foreground" aria-hidden /> Peso máximo (kg)
          </Label>
          <Input
            {...campoProps("peso_max_kg")}
            inputMode="decimal"
            autoComplete="off"
            placeholder="Ej: 25"
            value={pesoMax}
            onChange={(e) => {
              setPesoMax(e.target.value);
              limpiarError("peso_max_kg");
            }}
            className="tabular-nums"
          />
          <ErrorCampo campo="peso_max_kg" />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={id("dimensiones_max_cm")} className="flex items-center gap-1.5">
            <Ruler className="size-4 text-muted-foreground" aria-hidden /> Medida máxima (cm)
          </Label>
          <Input
            {...campoProps("dimensiones_max_cm", id("medida-ayuda"))}
            inputMode="numeric"
            autoComplete="off"
            placeholder="Ej: 50"
            value={medidaMax}
            onChange={(e) => {
              setMedidaMax(e.target.value);
              limpiarError("dimensiones_max_cm");
            }}
            className="tabular-nums"
          />
          {errores.dimensiones_max_cm ? (
            <ErrorCampo campo="dimensiones_max_cm" />
          ) : (
            <p id={id("medida-ayuda")} className="text-xs text-muted-foreground">
              El lado más largo del paquete.
            </p>
          )}
        </div>
      </div>

      <fieldset className="space-y-2">
        <legend className="mb-1 flex items-center gap-1.5 text-sm font-medium">
          <CalendarBlank className="size-4 text-muted-foreground" aria-hidden /> ¿Desde cuándo?
        </legend>
        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name={id("cuando")}
              value="ahora"
              checked={cuando === "ahora"}
              onChange={() => {
                setCuando("ahora");
                limpiarError("vigente_desde");
              }}
              disabled={publicando}
              className="size-4 accent-primary"
            />
            Ahora
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name={id("cuando")}
              value="programar"
              checked={cuando === "programar"}
              onChange={() => setCuando("programar")}
              disabled={publicando}
              className="size-4 accent-primary"
            />
            Programar
          </label>
        </div>
        {cuando === "programar" && (
          <div className="grid gap-3 rounded-lg border bg-muted/30 p-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor={id("vigente_desde")}>Fecha</Label>
              <Input
                {...campoProps("vigente_desde", id("programar-ayuda"))}
                type="date"
                min={hoyVE()}
                value={fecha}
                onChange={(e) => {
                  setFecha(e.target.value);
                  limpiarError("vigente_desde");
                }}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={id("hora")}>Hora (Venezuela)</Label>
              <Input
                id={id("hora")}
                type="time"
                step={300}
                value={hora}
                aria-invalid={errores.vigente_desde ? true : undefined}
                aria-describedby={errores.vigente_desde ? id("vigente_desde-error") : id("programar-ayuda")}
                disabled={publicando}
                onChange={(e) => {
                  setHora(e.target.value);
                  limpiarError("vigente_desde");
                }}
              />
            </div>
            <div className="sm:col-span-2">
              {errores.vigente_desde ? (
                <ErrorCampo campo="vigente_desde" />
              ) : (
                <p id={id("programar-ayuda")} className="text-xs text-muted-foreground">
                  {programada
                    ? `Empieza a regir el ${programada}. Hasta entonces se cobra la vigente.`
                    : "Elige la fecha y la hora."}
                </p>
              )}
            </div>
          </div>
        )}
      </fieldset>

      <div className="space-y-1.5">
        <Label htmlFor={id("nota")} className="flex items-center gap-1.5">
          <NotePencil className="size-4 text-muted-foreground" aria-hidden /> Nota (opcional)
        </Label>
        <Textarea
          id={id("nota")}
          rows={2}
          maxLength={300}
          placeholder="Por ejemplo: ajuste por el aumento del combustible."
          value={nota}
          onChange={(e) => setNota(e.target.value)}
          disabled={publicando}
        />
      </div>

      <div className={cn("flex justify-end gap-2 border-t pt-4")}>
        <Button type="button" variant="outline" onClick={onCerrar} disabled={publicando}>
          Cancelar
        </Button>
        <Button type="submit" disabled={publicando}>
          Revisar los cambios <ArrowRight className="size-4" aria-hidden />
        </Button>
      </div>
    </form>
  );
}
