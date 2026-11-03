"use client";

// ─── Tasa BCV vigente (Tarifas, `#tasa-bcv`) ────────────────────────────────
// Tasa con la que se cobran en Bs los precios de referencia en USD, con el
// formulario "Cargar tasa manual" (respaldo cuando la tarea programada falla).
// El chip de la barra superior enlaza aquí.

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { PencilSimple, Warning } from "@phosphor-icons/react";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { AvisoError } from "@/components/aviso-error";
import { cn } from "@/lib/utils";
import { fechaTasaCorta, formatNumeroVE } from "@/lib/dinero";
import { fechaVE, formatFechaVE, formatHoraVE, sumarDiasVE } from "@/lib/fechas";
import { avisarExito } from "@/lib/avisos";
import { esTasaDesactualizada, type TasaBCV } from "@/lib/types/pagos";
import { registrarTasaManual } from "@/app/admin/(panel)/tarifas/actions";

interface TasaBCVCardProps {
  tasa: TasaBCV | null;
  /** Hoy en Venezuela ('YYYY-MM-DD'), calculado en el servidor. */
  hoy: string;
  className?: string;
}

type Campo = "fecha" | "tasa" | "motivo";

/** "100,81" | "100.81" | "1.234,56" -> número (NaN si no es válido). */
function leerTasa(texto: string): number {
  const limpio = texto.trim().replace(/\s/g, "");
  if (!limpio) return NaN;
  // El último separador es el decimal: "1.234,56" y "1,234.56" -> 1234.56.
  const normalizado =
    limpio.lastIndexOf(",") > limpio.lastIndexOf(".") ? limpio.replace(/\./g, "").replace(",", ".") : limpio.replace(/,/g, "");
  return /^\d+(\.\d+)?$/.test(normalizado) ? Number(normalizado) : NaN;
}

function textoActualizacion(tasa: TasaBCV, hoy: string): string | null {
  if (!tasa.actualizadaAt) return null;
  const hora = formatHoraVE(tasa.actualizadaAt);
  if (!hora) return null;
  const dia = fechaVE(tasa.actualizadaAt);
  return dia === hoy ? `actualizada ${hora}` : `actualizada el ${fechaTasaCorta(dia)} a las ${hora}`;
}

export function TasaBCVCard({ tasa, hoy, className }: TasaBCVCardProps) {
  const router = useRouter();
  const desactualizada = esTasaDesactualizada(tasa);

  const [formAbierto, setFormAbierto] = useState(false);
  const [fecha, setFecha] = useState(hoy);
  const [tasaTexto, setTasaTexto] = useState("");
  const [motivo, setMotivo] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<{ campo?: Campo; mensaje: string } | null>(null);

  const tasaNueva = leerTasa(tasaTexto);
  const diferencia =
    tasa && Number.isFinite(tasaNueva) && tasaNueva > 0 ? Math.abs(tasaNueva - tasa.tasa) / tasa.tasa : null;

  function abrirFormulario() {
    setFecha(hoy);
    setTasaTexto("");
    setMotivo("");
    setError(null);
    setFormAbierto(true);
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (guardando) return;

    // Validación rápida en el navegador (el servidor vuelve a validar).
    if (!fecha) return setError({ campo: "fecha", mensaje: "Elige la fecha de vigencia de la tasa." });
    if (fecha > sumarDiasVE(hoy, 1)) {
      return setError({ campo: "fecha", mensaje: "La fecha no puede ser posterior a mañana." });
    }
    if (!Number.isFinite(tasaNueva) || tasaNueva <= 0) {
      return setError({ campo: "tasa", mensaje: "Escribe la tasa en bolívares por 1 dólar, por ejemplo 100,81." });
    }
    if (motivo.trim().length < 5) {
      return setError({ campo: "motivo", mensaje: "Escribe por qué cargas la tasa a mano (mínimo 5 caracteres)." });
    }

    setGuardando(true);
    setError(null);
    try {
      const res = await registrarTasaManual({ fecha, tasa: tasaNueva, motivo });
      if (!res.success) {
        const campo = res.campo === "fecha" || res.campo === "tasa" || res.campo === "motivo" ? res.campo : undefined;
        setError({ campo, mensaje: res.error ?? "No pudimos guardar la tasa. Intenta de nuevo." });
        return;
      }
      const guardada = res.data ?? { fecha, tasa: tasaNueva };
      avisarExito(`Tasa BCV del ${fechaTasaCorta(guardada.fecha)} guardada: ${formatNumeroVE(guardada.tasa)} Bs/USD.`);
      setFormAbierto(false);
      router.refresh();
    } catch {
      setError({ mensaje: "No pudimos conectarnos. Revisa tu conexión e intenta de nuevo." });
    } finally {
      setGuardando(false);
    }
  }

  const actualizacion = tasa ? textoActualizacion(tasa, hoy) : null;
  const errorDe = (campo: Campo) => (error?.campo === campo ? error.mensaje : null);

  return (
    <Card id="tasa-bcv" className={cn("scroll-mt-20", desactualizada && "border-warning/50", className)}>
      <CardHeader>
        <CardTitle>Tasa BCV</CardTitle>
        {!formAbierto && (
          <CardAction>
            <Button variant="outline" size="sm" onClick={abrirFormulario}>
              <PencilSimple aria-hidden /> Cargar tasa manual
            </Button>
          </CardAction>
        )}
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        <div role="status" className="flex flex-col gap-1">
          {tasa ? (
            <>
              <p className="text-2xl font-semibold tracking-tight tabular-nums">
                {formatNumeroVE(tasa.tasa)} <span className="text-base font-medium text-muted-foreground">Bs/USD</span>
              </p>
              <p className="text-xs text-muted-foreground tabular-nums">
                {formatFechaVE(tasa.fecha)} · fuente {tasa.fuente === "manual" ? "manual" : "automática"}
                {actualizacion ? ` · ${actualizacion}` : ""}
              </p>
            </>
          ) : (
            <>
              <p className="text-base font-semibold">Sin tasa BCV registrada</p>
              <p className="text-sm text-muted-foreground">Sin tasa no se puede cobrar en bolívares. Cárgala a mano.</p>
            </>
          )}
        </div>

        {tasa && desactualizada && (
          <div className="flex items-start gap-2 rounded-md bg-warning-light p-3 text-sm text-warning-deep">
            <Warning weight="fill" className="mt-0.5 size-4 shrink-0 text-warning-text" aria-hidden />
            <p>No se actualiza desde el {fechaTasaCorta(tasa.fecha)}. Revisa la tarea programada o cárgala a mano.</p>
          </div>
        )}

        {formAbierto && (
          <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4 border-t border-border pt-4">
            <div className="flex flex-col gap-1">
              <h3 className="text-sm font-semibold">Cargar tasa manual</h3>
              <p className="text-sm text-muted-foreground">Solo si la automática falla; la manual no se sobrescribe.</p>
            </div>

            <FieldGroup className="gap-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field data-invalid={errorDe("fecha") ? true : undefined}>
                  <FieldLabel htmlFor="tasa-fecha">Fecha de vigencia</FieldLabel>
                  <Input
                    id="tasa-fecha"
                    type="date"
                    value={fecha}
                    max={sumarDiasVE(hoy, 1)}
                    onChange={(e) => setFecha(e.target.value)}
                    aria-invalid={errorDe("fecha") ? true : undefined}
                    aria-describedby={errorDe("fecha") ? "tasa-fecha-error" : undefined}
                    disabled={guardando}
                    className="tabular-nums"
                  />
                  {errorDe("fecha") && <FieldError id="tasa-fecha-error">{errorDe("fecha")}</FieldError>}
                </Field>
                <Field data-invalid={errorDe("tasa") ? true : undefined}>
                  <FieldLabel htmlFor="tasa-valor">Bs por 1 USD</FieldLabel>
                  <Input
                    id="tasa-valor"
                    inputMode="decimal"
                    autoComplete="off"
                    placeholder="Ej. 100,81"
                    value={tasaTexto}
                    onChange={(e) => setTasaTexto(e.target.value)}
                    aria-invalid={errorDe("tasa") ? true : undefined}
                    aria-describedby="tasa-valor-ayuda"
                    disabled={guardando}
                    className="tabular-nums"
                  />
                  {errorDe("tasa") ? (
                    <FieldError id="tasa-valor-ayuda">{errorDe("tasa")}</FieldError>
                  ) : diferencia !== null && diferencia > 0.1 ? (
                    <FieldDescription id="tasa-valor-ayuda" className="text-warning-text">
                      {formatNumeroVE(diferencia * 100, 0)} % distinta de la vigente. Revisa que sea Bs por 1 dólar.
                    </FieldDescription>
                  ) : null}
                </Field>
              </div>

              <Field data-invalid={errorDe("motivo") ? true : undefined}>
                <FieldLabel htmlFor="tasa-motivo">Motivo</FieldLabel>
                <Textarea
                  id="tasa-motivo"
                  rows={2}
                  placeholder="Ej. La tarea automática no actualizó la tasa de hoy."
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  aria-invalid={errorDe("motivo") ? true : undefined}
                  aria-describedby={errorDe("motivo") ? "tasa-motivo-error" : undefined}
                  disabled={guardando}
                />
                {errorDe("motivo") && <FieldError id="tasa-motivo-error">{errorDe("motivo")}</FieldError>}
              </Field>
            </FieldGroup>

            {error && !error.campo && <AvisoError>{error.mensaje}</AvisoError>}

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" onClick={() => setFormAbierto(false)} disabled={guardando}>
                Cancelar
              </Button>
              <Button type="submit" disabled={guardando} aria-busy={guardando || undefined}>
                {guardando && <Spinner size="sm" aria-hidden />}
                {guardando ? "Guardando…" : "Guardar tasa"}
              </Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
