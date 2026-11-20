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
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { FechaField, MontoField } from "@/components/campos";
import { AvisoError } from "@/components/aviso-error";
import { cn } from "@/lib/utils";
import { DECIMALES_TASA, fechaTasaCorta, formatNumeroVE, leerMonto } from "@/lib/dinero";
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

  const tasaNueva = leerMonto(tasaTexto, { decimales: DECIMALES_TASA }) ?? NaN;
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
    <Card id="tasa-bcv" className={cn("scroll-mt-20", desactualizada && "ring-1 ring-warning/40", className)}>
      <CardHeader>
        <CardTitle>Tasa BCV</CardTitle>
        {!formAbierto && (
          <CardAction>
            <Button variant="outline" onClick={abrirFormulario}>
              <PencilSimple aria-hidden /> Cargar tasa manual
            </Button>
          </CardAction>
        )}
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        <div role="status" className="flex flex-col gap-1">
          {tasa ? (
            <>
              <p className="text-[28px] leading-tight font-semibold tracking-tight tabular-nums">
                {formatNumeroVE(tasa.tasa)} <span className="text-[15px] font-medium text-muted-foreground">Bs/USD</span>
              </p>
              <p className="text-[13px] text-muted-foreground tabular-nums">
                {formatFechaVE(tasa.fecha)} · fuente {tasa.fuente === "manual" ? "manual" : "automática"}
                {actualizacion ? ` · ${actualizacion}` : ""}
              </p>
            </>
          ) : (
            <>
              <p className="text-[15px] font-semibold">Sin tasa BCV registrada</p>
              <p className="text-[15px] text-muted-foreground">Sin tasa no se puede cobrar en bolívares. Cárgala a mano.</p>
            </>
          )}
        </div>

        {tasa && desactualizada && (
          <div className="flex items-start gap-2 rounded-md bg-warning-light p-3 text-[15px] text-warning-deep">
            <Warning weight="fill" className="mt-0.5 size-5 shrink-0 text-warning-text" aria-hidden />
            <p>No se actualiza desde el {fechaTasaCorta(tasa.fecha)}. Revisa la tarea programada o cárgala a mano.</p>
          </div>
        )}

        {formAbierto && (
          <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5 pt-2">
            <div className="flex flex-col gap-1">
              <h3 className="text-[17px] font-semibold">Cargar tasa manual</h3>
              <p className="text-[15px] text-muted-foreground">Solo si la automática falla; la manual no se sobrescribe.</p>
            </div>

            <FieldGroup className="gap-5">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <FechaField
                  id="tasa-fecha"
                  label="Fecha de vigencia"
                  value={fecha}
                  max={sumarDiasVE(hoy, 1)}
                  onChange={setFecha}
                  error={errorDe("fecha")}
                  disabled={guardando}
                />
                <MontoField
                  id="tasa-valor"
                  label="Bs por 1 USD"
                  moneda="Bs"
                  decimales={DECIMALES_TASA}
                  value={tasaTexto}
                  onChange={setTasaTexto}
                  error={errorDe("tasa")}
                  ayuda={
                    diferencia !== null && diferencia > 0.1 ? (
                      <span className="text-warning-text">
                        {formatNumeroVE(diferencia * 100, 0)} % distinta de la vigente. Revisa que sea Bs por 1 dólar.
                      </span>
                    ) : undefined
                  }
                  disabled={guardando}
                  enterKeyHint="next"
                />
              </div>

              <Field data-invalid={errorDe("motivo") ? true : undefined}>
                <FieldLabel htmlFor="tasa-motivo">Motivo</FieldLabel>
                <Textarea
                  id="tasa-motivo"
                  rows={2}
                  maxLength={500}
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

            <div className="flex flex-col-reverse gap-2 md:flex-row md:justify-end">
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
