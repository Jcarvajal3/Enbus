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
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Field, FieldDescription, FieldLabel, FieldSet, FieldLegend } from "@/components/ui/field";
import { Campo, FechaField, HoraField, MontoField } from "@/components/campos";
import { AvisoError } from "@/components/aviso-error";
import { avisarExito } from "@/lib/avisos";
import { createTarifa } from "@/app/cooperativas/(panel)/tarifas/actions";
import { humanizeError } from "@/lib/errores";
import { formatNumeroVE, formatUsd, leerMonto } from "@/lib/dinero";
import { fechaHoraVEaISO, hoyVE, sumarDiasVE } from "@/lib/fechas";
import { formatCiudad } from "@/lib/ciudades";
import {
  costoEncomiendaUsd,
  DECIMALES_TARIFA,
  DIAS_MAX_PROGRAMACION,
  formatFechaProgramada,
  LIMITES_TARIFA,
  recargoPorcentaje,
  type ParametrosTarifa,
  type RouteOption,
  type Tarifa,
} from "@/lib/types/tarifas";
import { formatPesoKg } from "@/lib/peso";

type CampoTarifa = keyof ParametrosTarifa | "vigente_desde";
type Errores = Partial<Record<CampoTarifa, string>>;

const PESOS_EJEMPLO = [1, 5, 10];
const MINUTOS_EJEMPLO = 8 * 60;

/** Precio y pesos: el lector único de montos (coma decimal); NaN si no es válido. */
function leerNumero(texto: string): number {
  return leerMonto(texto) ?? NaN;
}

/** Recargo por minuto ("0,0010"): hasta los decimales que guarda la base (más no es válido: no se redondea en silencio). */
function leerFactor(texto: string): number {
  const t = texto.trim();
  const patron = new RegExp(`^\\d+([.,]\\d{1,${DECIMALES_TARIFA.factor}})?$`);
  return patron.test(t) ? Number(t.replace(",", ".")) : NaN;
}

/** Medida en cm: solo un entero. */
function leerEntero(texto: string): number {
  const t = texto.trim();
  return /^\d+$/.test(t) ? Number(t) : NaN;
}

/** 2.5 → "2,50" (monto con la máscara) para precargar el formulario con la tarifa vigente. */
function montoATexto(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "";
  return Number(n.toFixed(2)) === n ? formatNumeroVE(n) : String(n).replace(".", ",");
}

/** 0.001 → "0,001" (sin máscara de miles). */
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

/**
 * Próxima hora en punto de Venezuela: valor inicial de "Programar". Pasadas las 23:00 es la
 * medianoche de mañana (no las 00:00 de hoy, que ya quedó atrás).
 */
function programacionSugerida(): { fecha: string; hora: string } {
  const hoy = hoyVE();
  const inicioDelDia = new Date(fechaHoraVEaISO(hoy, "00:00")).getTime();
  const proxima = Math.floor((Date.now() - inicioDelDia) / 3_600_000) + 1;
  return proxima >= 24
    ? { fecha: sumarDiasVE(hoy, 1), hora: "00:00" }
    : { fecha: hoy, hora: `${String(proxima).padStart(2, "0")}:00` };
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
        <Button size="lg">
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
  const [porKg, setPorKg] = useState(montoATexto(vigente?.tarifa_por_kg));
  const [factor, setFactor] = useState(aTexto(vigente?.factor_distancia_por_min));
  const [pesoMax, setPesoMax] = useState(montoATexto(vigente?.peso_max_kg));
  const [medidaMax, setMedidaMax] = useState(aTexto(vigente?.dimensiones_max_cm));
  const [cuando, setCuando] = useState<"ahora" | "programar">("ahora");
  const [sugerida] = useState(programacionSugerida);
  const [fecha, setFecha] = useState(sugerida.fecha);
  const [hora, setHora] = useState(sugerida.hora);
  const [nota, setNota] = useState("");
  const [errores, setErrores] = useState<Errores>({});
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);

  const nueva: ParametrosTarifa = {
    tarifa_por_kg: leerNumero(porKg),
    factor_distancia_por_min: leerFactor(factor),
    peso_max_kg: leerNumero(pesoMax),
    dimensiones_max_cm: leerEntero(medidaMax),
  };
  const recargo8h = Number.isFinite(nueva.factor_distancia_por_min)
    ? recargoPorcentaje(nueva.factor_distancia_por_min, MINUTOS_EJEMPLO)
    : null;
  const ejemplos = useMemo(() => rutasDeEjemplo(rutas), [rutas]);

  const limpiarError = (campo: CampoTarifa) => {
    if (errores[campo]) setErrores((e) => ({ ...e, [campo]: undefined }));
    setErrorGeneral(null);
  };

  /** Misma validación que fn_publicar_tarifa; el foco va al primer campo con error. */
  const validar = (): boolean => {
    const e: Errores = {};
    if (
      !Number.isFinite(nueva.tarifa_por_kg) ||
      nueva.tarifa_por_kg < LIMITES_TARIFA.tarifa_por_kg.min ||
      nueva.tarifa_por_kg > LIMITES_TARIFA.tarifa_por_kg.max
    ) {
      e.tarifa_por_kg = "Escribe el precio por kilo en USD, mayor que 0 (por ejemplo 2,50).";
    }
    if (
      !Number.isFinite(nueva.factor_distancia_por_min) ||
      nueva.factor_distancia_por_min < LIMITES_TARIFA.factor_distancia_por_min.min ||
      nueva.factor_distancia_por_min > LIMITES_TARIFA.factor_distancia_por_min.max
    ) {
      e.factor_distancia_por_min = `El recargo por minuto de viaje debe estar entre 0 y 1, con hasta ${DECIMALES_TARIFA.factor} decimales (por ejemplo 0,0010).`;
    }
    if (
      !Number.isFinite(nueva.peso_max_kg) ||
      nueva.peso_max_kg < LIMITES_TARIFA.peso_max_kg.min ||
      nueva.peso_max_kg > LIMITES_TARIFA.peso_max_kg.max
    ) {
      e.peso_max_kg = `El peso máximo debe estar entre ${LIMITES_TARIFA.peso_max_kg.min} y ${LIMITES_TARIFA.peso_max_kg.max} kg.`;
    }
    if (
      !Number.isInteger(nueva.dimensiones_max_cm) ||
      nueva.dimensiones_max_cm < LIMITES_TARIFA.dimensiones_max_cm.min ||
      nueva.dimensiones_max_cm > LIMITES_TARIFA.dimensiones_max_cm.max
    ) {
      e.dimensiones_max_cm = `La medida máxima debe ser un número entero entre ${LIMITES_TARIFA.dimensiones_max_cm.min} y ${LIMITES_TARIFA.dimensiones_max_cm.max} cm.`;
    }
    if (cuando === "programar") {
      if (!fecha || !hora) {
        e.vigente_desde = "Elige la fecha y la hora en que empieza a regir.";
      } else if (!esFuturo(fechaHoraVEaISO(fecha, hora))) {
        e.vigente_desde = "La fecha programada tiene que ser posterior a ahora.";
      } else if (fecha > sumarDiasVE(hoyVE(), DIAS_MAX_PROGRAMACION)) {
        e.vigente_desde = `Solo puedes programar con hasta ${DIAS_MAX_PROGRAMACION} días de anticipación.`;
      }
    }
    setErrores(e);
    const primero = (["tarifa_por_kg", "factor_distancia_por_min", "peso_max_kg", "dimensiones_max_cm", "vigente_desde"] as CampoTarifa[]).find(
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
        const campo = res.campo as CampoTarifa | undefined;
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
      { etiqueta: "Peso máximo", antes: vigente?.peso_max_kg ?? null, despues: nueva.peso_max_kg, formato: (n) => `${formatPesoKg(n)} kg` },
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
                : "Será la primera tarifa: tu cooperativa podrá cobrar encomiendas al publicarla."}
          </DialogDescription>
        </DialogHeader>

        <div className="overflow-hidden rounded-md bg-surface">
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
          <h3 id={id("ejemplos")} className="text-[17px] font-semibold">
            Ejemplos
          </h3>
          {ejemplos.length === 0 ? (
            <p className="text-[15px] text-muted-foreground">No tienes rutas activas para mostrar ejemplos.</p>
          ) : (
            ejemplos.map((r) => (
              <div key={r.id} className="overflow-hidden rounded-md bg-surface">
                <p className="px-4 py-3 text-[15px] font-medium">
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
          <p className="text-[13px] text-muted-foreground">En USD de referencia; se cobra en Bs a la tasa BCV del día.</p>
        </section>

        {nota.trim() && (
          <p className="text-[15px]">
            <span className="text-muted-foreground">Nota: </span>
            {nota.trim()}
          </p>
        )}

        {errorGeneral && <AvisoError>{errorGeneral}</AvisoError>}

        <DialogFooter className="md:justify-between">
          <Button size="lg" type="button" variant="outline" onClick={() => setPaso(1)} disabled={publicando}>
            <ArrowLeft aria-hidden /> Atrás
          </Button>
          <Button size="lg" type="button" onClick={publicar} disabled={publicando} aria-busy={publicando || undefined}>
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

  /** Lo común de cada campo del formulario: id, error y bloqueo mientras se publica. */
  const comun = (campo: CampoTarifa) => ({ id: id(campo), error: errores[campo], disabled: publicando });

  return (
    <form onSubmit={irARevision} noValidate className="flex flex-col gap-6">
      <DialogHeader>
        <Paso n={1} />
        <DialogTitle>Nueva tarifa</DialogTitle>
        <DialogDescription>Precio de las encomiendas de tu cooperativa, en USD de referencia.</DialogDescription>
      </DialogHeader>

      <div className="grid gap-5 md:grid-cols-2">
        <MontoField
          {...comun("tarifa_por_kg")}
          label="Precio por kilo (USD)"
          moneda="USD"
          value={porKg}
          onChange={(v) => {
            setPorKg(v);
            limpiarError("tarifa_por_kg");
          }}
          enterKeyHint="next"
        />
        <Campo
          {...comun("factor_distancia_por_min")}
          label="Recargo por minuto de viaje"
          inputMode="decimal"
          placeholder="Ej. 0,0010"
          value={factor}
          onChange={(v) => {
            setFactor(v);
            limpiarError("factor_distancia_por_min");
          }}
          ayuda={recargo8h === null ? "Se suma por cada minuto de viaje." : `Viaje de 8 h: +${formatNumeroVE(recargo8h, 0)} %`}
          enterKeyHint="next"
        />
        <Campo
          {...comun("peso_max_kg")}
          label="Peso máximo"
          sufijo="kg"
          inputMode="decimal"
          placeholder="Ej. 25"
          value={pesoMax}
          onChange={(v) => {
            setPesoMax(v);
            limpiarError("peso_max_kg");
          }}
          enterKeyHint="next"
        />
        <Campo
          {...comun("dimensiones_max_cm")}
          label="Medida máxima"
          sufijo="cm"
          inputMode="numeric"
          placeholder="Ej. 50"
          value={medidaMax}
          onChange={(v) => {
            setMedidaMax(v.replace(/\D/g, ""));
            limpiarError("dimensiones_max_cm");
          }}
          ayuda="El lado más largo del paquete."
          maxLength={3}
        />
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
          <div className="grid gap-4 md:grid-cols-2">
            <FechaField
              {...comun("vigente_desde")}
              label="Fecha"
              min={hoyVE()}
              max={sumarDiasVE(hoyVE(), DIAS_MAX_PROGRAMACION)}
              atajos={false}
              value={fecha}
              onChange={(v) => {
                setFecha(v);
                limpiarError("vigente_desde");
              }}
            />
            <HoraField
              id={id("hora")}
              label="Hora (Venezuela)"
              paso={300}
              value={hora}
              disabled={publicando}
              onChange={(v) => {
                setHora(v);
                limpiarError("vigente_desde");
              }}
            />
            {!errores.vigente_desde && programada && (
              <FieldDescription id={id("programar-ayuda")} className="md:col-span-2">
                Empieza a regir el {sinPunto(programada)}. Hasta entonces se cobra la vigente.
              </FieldDescription>
            )}
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
          placeholder="Ej. Ajuste por el aumento del combustible."
          value={nota}
          onChange={(e) => setNota(e.target.value)}
          disabled={publicando}
        />
      </Field>

      <DialogFooter>
        <Button size="lg" type="button" variant="outline" onClick={onCerrar} disabled={publicando}>
          Cancelar
        </Button>
        <Button size="lg" type="submit" disabled={publicando}>
          Continuar <ArrowRight aria-hidden />
        </Button>
      </DialogFooter>
    </form>
  );
}
