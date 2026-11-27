"use client";

import { useId, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { AvisoError } from "@/components/aviso-error";
import { requireOnline } from "@/components/connectivity-banner";
import { ErrorState } from "@/components/error-state";
import { AvisoConservadas } from "@/components/horarios/aviso-conservadas";
import { Campo, FechaField } from "@/components/campos";
import { avisarError, avisarExito } from "@/lib/avisos";
import { humanizeError } from "@/lib/errores";
import { hoyVE } from "@/lib/fechas";
import type { DiaNoLaborable, SalidaConservada } from "@/lib/types/horarios";
import { cn } from "@/lib/utils";
import { borrarDiaNoLaborable, guardarDiaNoLaborable } from "./actions";

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

/** Feriados nacionales fijos (se repiten cada año). Cada cooperativa elige cuáles: muchas trabajan en feriados. */
const FERIADOS_NACIONALES = [
  { mmdd: "01-01", nombre: "Año Nuevo" },
  { mmdd: "04-19", nombre: "Declaración de la Independencia" },
  { mmdd: "05-01", nombre: "Día del Trabajador" },
  { mmdd: "06-24", nombre: "Batalla de Carabobo" },
  { mmdd: "07-05", nombre: "Día de la Independencia" },
  { mmdd: "07-24", nombre: "Natalicio del Libertador" },
  { mmdd: "10-12", nombre: "Día de la Resistencia Indígena" },
  { mmdd: "12-24", nombre: "Nochebuena" },
  { mmdd: "12-25", nombre: "Navidad" },
  { mmdd: "12-31", nombre: "Fin de Año" },
] as const;

/** "1 de enero" (sin año). */
function diaYMes(fecha: string): string {
  const [, m, d] = fecha.split("-").map(Number);
  return `${d} de ${MESES[m - 1]}`;
}

/** "1 de enero" si se repite cada año; "1 de enero de 2027" si es una fecha concreta. */
function textoFecha(d: Pick<DiaNoLaborable, "fecha" | "cada_anio">): string {
  return d.cada_anio ? diaYMes(d.fecha) : `${diaYMes(d.fecha)} de ${d.fecha.slice(0, 4)}`;
}

/** Clave para ordenar: las anuales por mes y día; las concretas por su fecha, tras las anuales del mismo día. */
function claveOrden(d: DiaNoLaborable): string {
  return d.cada_anio ? `${d.fecha.slice(5)}-0` : `${d.fecha.slice(5)}-1-${d.fecha.slice(0, 4)}`;
}

function mensajeSalidas(quitadas: number): string {
  if (quitadas === 0) return "";
  return quitadas === 1 ? " Se quitó 1 salida sin pasajeros." : ` Se quitaron ${quitadas} salidas sin pasajeros.`;
}

export function NoLaborablesTab({ dias, errorCarga }: { dias: DiaNoLaborable[]; errorCarga: string | null }) {
  const router = useRouter();
  const uid = useId();
  const [isPending, startTransition] = useTransition();
  /** Acción en curso: "agregar", "atajo-MM-DD" o el id del día que se quita. */
  const [ocupado, setOcupado] = useState<string | null>(null);

  const [fecha, setFecha] = useState("");
  const [nombre, setNombre] = useState("");
  const [cadaAnio, setCadaAnio] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [campoError, setCampoError] = useState<"fecha" | "nombre" | null>(null);
  const [conservadas, setConservadas] = useState<SalidaConservada[]>([]);

  const ordenados = useMemo(() => [...dias].sort((a, b) => claveOrden(a).localeCompare(claveOrden(b))), [dias]);
  const anualPorDia = useMemo(
    () => new Map(dias.filter((d) => d.cada_anio).map((d) => [d.fecha.slice(5), d])),
    [dias]
  );

  function agregar(entrada: { fecha: string; nombre: string; cadaAnio: boolean }, clave: string, alTerminar?: () => void) {
    setFormError(null);
    setCampoError(null);
    setOcupado(clave);
    startTransition(async () => {
      try {
        const res = await requireOnline(() => guardarDiaNoLaborable(entrada))();
        if (!res.ok) {
          if (clave === "agregar") {
            setFormError(res.error);
            setCampoError(res.campo === "fecha" || res.campo === "nombre" ? res.campo : null);
          } else {
            avisarError(res.error);
          }
          return;
        }
        avisarExito(`Listo: no se crearán salidas ese día.${mensajeSalidas(res.data.quitadas)}`);
        setConservadas(res.data.conservadas);
        alTerminar?.();
      } catch (err) {
        const mensaje = humanizeError(err, "agregar el día no laborable");
        if (clave === "agregar") setFormError(mensaje);
        else avisarError(mensaje);
      } finally {
        setOcupado(null);
      }
    });
  }

  function agregarDesdeFormulario() {
    if (!fecha) {
      setFormError("Elige la fecha.");
      setCampoError("fecha");
      document.getElementById(`${uid}-fecha`)?.focus();
      return;
    }
    agregar({ fecha, nombre, cadaAnio }, "agregar", () => {
      setFecha("");
      setNombre("");
      setCadaAnio(false);
    });
  }

  function quitar(d: DiaNoLaborable) {
    setOcupado(d.id);
    startTransition(async () => {
      try {
        const res = await requireOnline(() => borrarDiaNoLaborable(d.id))();
        if (!res.ok) {
          avisarError(res.error);
          return;
        }
        const n = res.data.creadas;
        avisarExito(
          n > 0
            ? `Día quitado. Se ${n === 1 ? "creó 1 salida" : `crearon ${n} salidas`} de tus horarios.`
            : "Día quitado."
        );
      } catch (err) {
        avisarError(humanizeError(err, "quitar el día no laborable"));
      } finally {
        setOcupado(null);
      }
    });
  }

  function alternarFeriado(f: (typeof FERIADOS_NACIONALES)[number]) {
    const existente = anualPorDia.get(f.mmdd);
    if (existente) quitar(existente);
    else agregar({ fecha: `${hoyVE().slice(0, 4)}-${f.mmdd}`, nombre: f.nombre, cadaAnio: true }, `atajo-${f.mmdd}`);
  }

  if (errorCarga) {
    return (
      <Card className="p-0">
        <ErrorState titulo="No pudimos cargar los días no laborables" descripcion={errorCarga} onReintentar={() => router.refresh()} />
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <AvisoConservadas conservadas={conservadas} onCerrar={() => setConservadas([])} />

      <Card>
        <CardHeader>
          <CardTitle>Días no laborables</CardTitle>
          <CardDescription>
            En estos días no se crean salidas de tus horarios. Los viajes extra no se ven afectados.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-8">
          <section aria-labelledby={`${uid}-feriados`} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <h3 id={`${uid}-feriados`} className="text-[15px] font-semibold">
                Feriados nacionales
              </h3>
              <p className="text-[13px] text-muted-foreground">
                Marca los que no trabajas. Muchas cooperativas salen en feriados: deja sin marcar los que sí.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {FERIADOS_NACIONALES.map((f) => {
                const marcado = anualPorDia.has(f.mmdd);
                const enCurso = ocupado === `atajo-${f.mmdd}` || (marcado && ocupado === anualPorDia.get(f.mmdd)?.id);
                return (
                  <button
                    key={f.mmdd}
                    type="button"
                    aria-pressed={marcado}
                    disabled={isPending}
                    onClick={() => alternarFeriado(f)}
                    className={cn(
                      "inline-flex min-h-11 items-center gap-2 rounded-full border px-4 py-1.5 text-left text-[14px] font-medium transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none disabled:opacity-60 md:min-h-10",
                      marcado
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-background text-foreground hover:bg-muted"
                    )}
                  >
                    {enCurso && <Spinner size="sm" aria-hidden />}
                    <span className="tabular-nums">{diaYMes(`2000-${f.mmdd}`)}</span>
                    <span className={cn("hidden sm:inline", marcado ? "opacity-90" : "text-muted-foreground")}>· {f.nombre}</span>
                    <span className="sr-only sm:hidden">{f.nombre}</span>
                  </button>
                );
              })}
            </div>
          </section>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              agregarDesdeFormulario();
            }}
            noValidate
            className="flex flex-col gap-4"
            aria-labelledby={`${uid}-otro`}
          >
            <h3 id={`${uid}-otro`} className="text-[15px] font-semibold">
              Agregar otro día
            </h3>
            {formError && campoError === null && <AvisoError>{formError}</AvisoError>}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <FechaField
                id={`${uid}-fecha`}
                label="Fecha"
                required
                value={fecha}
                min={cadaAnio ? undefined : hoyVE()}
                onChange={(v) => {
                  setFecha(v);
                  setFormError(null);
                  setCampoError(null);
                }}
                error={campoError === "fecha" ? formError : null}
              />
              <Campo
                id={`${uid}-nombre`}
                name="nombre"
                label="Nombre"
                opcional
                maxLength={60}
                placeholder="Ej. Aniversario de la cooperativa"
                enterKeyHint="done"
                value={nombre}
                onChange={(v) => {
                  setNombre(v);
                  if (campoError === "nombre") {
                    setFormError(null);
                    setCampoError(null);
                  }
                }}
                error={campoError === "nombre" ? formError : null}
              />
            </div>
            <div className="flex items-center justify-between gap-4 rounded-md bg-surface p-4">
              <div className="flex flex-col gap-0.5">
                <Label htmlFor={`${uid}-cada-anio`}>Se repite cada año</Label>
                <p className="text-[13px] text-muted-foreground">Cuenta el mismo día y mes todos los años.</p>
              </div>
              <Switch id={`${uid}-cada-anio`} checked={cadaAnio} onCheckedChange={setCadaAnio} />
            </div>
            <div>
              <Button type="submit" size="lg" className="max-md:w-full" disabled={isPending} aria-busy={ocupado === "agregar" || undefined}>
                {ocupado === "agregar" ? <Spinner size="sm" aria-hidden /> : <Plus aria-hidden />}
                {ocupado === "agregar" ? "Agregando…" : "Agregar día"}
              </Button>
            </div>
          </form>

          <section aria-labelledby={`${uid}-lista`} className="flex flex-col gap-3">
            <h3 id={`${uid}-lista`} className="text-[15px] font-semibold">
              Tus días no laborables
            </h3>
            {ordenados.length === 0 ? (
              <p className="text-[15px] text-muted-foreground">
                Todavía no tienes ninguno: tus horarios generan salidas todos los días que les toquen.
              </p>
            ) : (
              <ul role="list" className="flex flex-col divide-y divide-border rounded-xl border border-border">
                {ordenados.map((d) => (
                  <li key={d.id} className="flex items-center gap-3 px-4 py-3">
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="text-[15px] font-medium text-foreground">{textoFecha(d)}</span>
                      {d.nombre && <span className="truncate text-[13px] text-muted-foreground">{d.nombre}</span>}
                    </div>
                    {d.cada_anio && <Badge variant="secondary">Cada año</Badge>}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      disabled={isPending}
                      onClick={() => quitar(d)}
                      aria-label={`Quitar ${textoFecha(d)}${d.nombre ? `, ${d.nombre}` : ""}`}
                      className="text-destructive-text hover:text-destructive-text"
                    >
                      {ocupado === d.id ? <Spinner size="sm" /> : <Trash aria-hidden />}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </CardContent>
      </Card>
    </div>
  );
}
