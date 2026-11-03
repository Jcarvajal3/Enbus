"use client";

// ─── Nueva tarifa en dos pasos (#54, A-07, AD-15, AD-16) ─────────────────────
// 1 "Nueva tarifa": los valores y desde cuándo rigen (ahora o programada).
// 2 "Revisa los cambios": Antes → Después por campo y ejemplos con rutas reales
//   calculados con la fórmula de `_costo_encomienda`. Publicar o programar llama a
//   fn_publicar_tarifa (una sola operación en la base).

import { useId, useMemo, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Plus } from "@phosphor-icons/react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Field, FieldDescription, FieldError, FieldLabel, FieldSet, FieldLegend } from "@/components/ui/field";
import { AvisoError } from "@/components/aviso-error";
import { avisarExito } from "@/lib/avisos";
import { createTarifa } from "@/app/admin/(panel)/tarifas/actions";
import { humanizeError } from "@/lib/errores";
import { formatNumeroVE, formatUsd } from "@/lib/dinero";
import { fechaHoraVEaISO, hoyVE } from "@/lib/fechas";
import { formatCiudad } from "@/lib/ciudades";
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

/** true si el instante ISO es posterior a ahora (se usa al validar, no al renderizar). */
function esFuturo(iso: string): boolean {
  return new Date(iso).getTime() > Date.now();
}

/** Ahora en Venezuela (UTC-4 fijo) + 1 hora, redondeado a la hora: valor inicial de "Programar". */
function horaSugerida(): string {
  const h = (new Date(Date.now() - 4 * 3_600_000).getUTCHours() + 1) % 24;
  return `${String(h).padStart(2, "0")}:00`;
}

/** "… 3:00 a. m." → "… 3:00 a. m" para cerrar la frase con un solo punto. */
function sinPunto(texto: string): string {
  return texto.replace(/\.$/, "");
}

/** "Paso 1 de 2" sobre el título del diálogo (AD5-38, D22). */
function Paso({ n }: { n: 1 | 2 }) {
  return <p className="text-xs font-medium text-muted-foreground tabular-nums">Paso {n} de 2</p>;
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
          <Plus aria-hidden /> Nueva tarifa
        </Button>
      </DialogTrigger>
      <DialogContent tamano="flujo">
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
      } else if (!esFuturo(fechaHoraVEaISO(fecha, hora))) {
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
        avisarExito(`Tarifa programada para el ${formatFechaProgramada(res.data.vigente_desde)}.`);
      } else {
        avisarExito("Tarifa publicada. Ya es la vigente.");
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
      <div className="flex flex-col gap-6">
        <DialogHeader>
          <Paso n={2} />
          <DialogTitle>Revisa los cambios</DialogTitle>
          <DialogDescription>
            {programada
              ? `Empieza a regir el ${sinPunto(programada)}. Hasta entonces se cobra la vigente.`
              : vigente
                ? "Reemplaza a la vigente al publicarla; la actual pasa a «Anterior»."
                : "Será la primera tarifa: las cooperativas podrán cobrar encomiendas al publicarla."}
          </DialogDescription>
        </DialogHeader>

        <div className="overflow-hidden rounded-md border border-border">
          <Table>
            <caption className="sr-only">Valores antes y después del cambio</caption>
            <TableHeader>
              <TableRow>
                <TableHead>Concepto</TableHead>
                <TableHead className="text-right">Antes</TableHead>
                <TableHead className="text-right">Después</TableHead>
                <TableHead className="text-right">Cambio</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filas.map((f) => (
                <TableRow key={f.etiqueta}>
                  <TableCell className="font-medium">{f.etiqueta}</TableCell>
                  <TableCell className="text-right text-muted-foreground tabular-nums">
                    {f.antes === null ? "—" : f.formato(f.antes)}
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">{f.formato(f.despues)}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {f.antes === null ? "Nuevo" : textoCambio(f.antes, f.despues)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <section aria-labelledby={id("ejemplos")} className="flex flex-col gap-3">
          <h3 id={id("ejemplos")} className="text-sm font-semibold">
            Ejemplos
          </h3>
          {ejemplos.length === 0 ? (
            <p className="text-sm text-muted-foreground">No hay rutas activas para mostrar ejemplos.</p>
          ) : (
            ejemplos.map((r) => (
              <div key={r.id} className="overflow-hidden rounded-md border border-border">
                <p className="border-b border-border bg-muted/50 px-3 py-2 text-sm font-medium">
                  {formatCiudad(r.ciudad_origen)} → {formatCiudad(r.ciudad_destino)}
                </p>
                <Table>
                  <TableHeader className="bg-transparent">
                    <TableRow>
                      <TableHead className="text-right">kg</TableHead>
                      <TableHead className="text-right">Antes</TableHead>
                      <TableHead className="text-right">Después</TableHead>
                      <TableHead className="text-right">Cambio</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {PESOS_EJEMPLO.map((kg) => {
                      const despues = costoEncomiendaUsd(kg, nueva, r.duracion_estimada_min);
                      const antes = vigente ? costoEncomiendaUsd(kg, vigente, r.duracion_estimada_min) : null;
                      const excede = kg > nueva.peso_max_kg;
                      return (
                        <TableRow key={kg}>
                          <TableCell className="text-right tabular-nums">{kg}</TableCell>
                          <TableCell className="text-right text-muted-foreground tabular-nums">
                            {antes === null ? "—" : formatUsd(antes)}
                          </TableCell>
                          {excede ? (
                            <TableCell colSpan={2} className="text-right text-warning-text">
                              Supera el peso máximo
                            </TableCell>
                          ) : (
                            <>
                              <TableCell className="text-right font-medium tabular-nums">{formatUsd(despues)}</TableCell>
                              <TableCell className="text-right tabular-nums">
                                {antes === null ? "Nuevo" : textoCambio(antes, despues)}
                              </TableCell>
                            </>
                          )}
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            ))
          )}
          <p className="text-xs text-muted-foreground">En USD de referencia; se cobra en Bs a la tasa BCV del día.</p>
        </section>

        {nota.trim() && (
          <p className="text-sm">
            <span className="text-muted-foreground">Nota: </span>
            {nota.trim()}
          </p>
        )}

        {errorGeneral && <AvisoError>{errorGeneral}</AvisoError>}

        <DialogFooter className="sm:justify-between">
          <Button type="button" variant="outline" onClick={() => setPaso(1)} disabled={publicando}>
            <ArrowLeft aria-hidden /> Atrás
          </Button>
          <Button type="button" onClick={publicar} disabled={publicando} aria-busy={publicando || undefined}>
            {publicando && <Spinner size="sm" aria-hidden />}
            {publicando
              ? programada
                ? "Programando…"
                : "Publicando…"
              : programada
                ? "Programar tarifa"
                : "Publicar tarifa"}
          </Button>
        </DialogFooter>
      </div>
    );
  }

  const campoProps = (campo: Campo, ayudaId?: string) => ({
    id: id(campo),
    "aria-invalid": errores[campo] ? true : undefined,
    "aria-describedby": errores[campo] ? id(`${campo}-error`) : ayudaId,
    disabled: publicando,
  });

  const errorCampo = (campo: Campo) =>
    errores[campo] ? <FieldError id={id(`${campo}-error`)}>{errores[campo]}</FieldError> : null;

  const campoNumero = (
    campo: Exclude<Campo, "vigente_desde">,
    etiqueta: string,
    valor: string,
    setValor: (v: string) => void,
    placeholder: string,
    ayuda?: string,
    inputMode: "decimal" | "numeric" = "decimal"
  ) => (
    <Field data-invalid={errores[campo] ? true : undefined}>
      <FieldLabel htmlFor={id(campo)}>{etiqueta}</FieldLabel>
      <Input
        {...campoProps(campo, ayuda ? id(`${campo}-ayuda`) : undefined)}
        inputMode={inputMode}
        autoComplete="off"
        placeholder={placeholder}
        value={valor}
        onChange={(e) => {
          setValor(e.target.value);
          limpiarError(campo);
        }}
        className="tabular-nums"
      />
      {errores[campo]
        ? errorCampo(campo)
        : ayuda && (
            <FieldDescription id={id(`${campo}-ayuda`)} aria-live="polite">
              {ayuda}
            </FieldDescription>
          )}
    </Field>
  );

  return (
    <form onSubmit={irARevision} noValidate className="flex flex-col gap-6">
      <DialogHeader>
        <Paso n={1} />
        <DialogTitle>Nueva tarifa</DialogTitle>
        <DialogDescription>Precio de las encomiendas para todas las cooperativas, en USD de referencia.</DialogDescription>
      </DialogHeader>

      <div className="grid gap-4 sm:grid-cols-2">
        {campoNumero("tarifa_por_kg", "Precio por kilo (USD)", porKg, setPorKg, "Ej.: 2,50")}
        {campoNumero(
          "factor_distancia_por_min",
          "Recargo por minuto de viaje",
          factor,
          setFactor,
          "Ej.: 0,0010",
          recargo8h === null ? "Se suma por cada minuto de viaje." : `Viaje de 8 h: +${formatNumeroVE(recargo8h, 0)} %`
        )}
        {campoNumero("peso_max_kg", "Peso máximo (kg)", pesoMax, setPesoMax, "Ej.: 25")}
        {campoNumero(
          "dimensiones_max_cm",
          "Medida máxima (cm)",
          medidaMax,
          setMedidaMax,
          "Ej.: 50",
          "El lado más largo del paquete.",
          "numeric"
        )}
      </div>

      <FieldSet className="gap-3">
        <FieldLegend variant="label" className="mb-0">Desde cuándo</FieldLegend>
        <Tabs
          value={cuando}
          onValueChange={(v) => {
            setCuando(v === "programar" ? "programar" : "ahora");
            limpiarError("vigente_desde");
          }}
        >
          <TabsList aria-label="Desde cuándo rige">
            <TabsTrigger value="ahora" className="flex-none" disabled={publicando}>
              Ahora
            </TabsTrigger>
            <TabsTrigger value="programar" className="flex-none" disabled={publicando}>
              Programar
            </TabsTrigger>
          </TabsList>
        </Tabs>
        {cuando === "programar" && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field data-invalid={errores.vigente_desde ? true : undefined}>
              <FieldLabel htmlFor={id("vigente_desde")}>Fecha</FieldLabel>
              <Input
                {...campoProps("vigente_desde", id("programar-ayuda"))}
                type="date"
                min={hoyVE()}
                value={fecha}
                onChange={(e) => {
                  setFecha(e.target.value);
                  limpiarError("vigente_desde");
                }}
                className="tabular-nums"
              />
            </Field>
            <Field data-invalid={errores.vigente_desde ? true : undefined}>
              <FieldLabel htmlFor={id("hora")}>Hora (Venezuela)</FieldLabel>
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
                className="tabular-nums"
              />
            </Field>
            <div className="sm:col-span-2">
              {errores.vigente_desde
                ? errorCampo("vigente_desde")
                : programada && (
                    <FieldDescription id={id("programar-ayuda")}>
                      Empieza a regir el {sinPunto(programada)}. Hasta entonces se cobra la vigente.
                    </FieldDescription>
                  )}
            </div>
          </div>
        )}
      </FieldSet>

      <Field>
        <FieldLabel htmlFor={id("nota")}>
          Nota <span className="font-normal text-muted-foreground">(opcional)</span>
        </FieldLabel>
        <Textarea
          id={id("nota")}
          rows={2}
          maxLength={300}
          placeholder="Ej.: Ajuste por el aumento del combustible."
          value={nota}
          onChange={(e) => setNota(e.target.value)}
          disabled={publicando}
        />
      </Field>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCerrar} disabled={publicando}>
          Cancelar
        </Button>
        <Button type="submit" disabled={publicando}>
          Continuar <ArrowRight aria-hidden />
        </Button>
      </DialogFooter>
    </form>
  );
}
