"use client";

// ─── Tasa BCV vigente (super admin) ─────────────────────────────────────────
// Muestra la tasa con la que se cobran en Bs los precios de referencia en USD.
// En Tarifas incluye el formulario "Cargar tasa manual" (respaldo cuando la
// tarea programada falla); en el dashboard solo el estado y un enlace.

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CurrencyCircleDollar, Warning, PencilSimple } from "@phosphor-icons/react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { fechaTasaCorta, formatNumeroVE } from "@/lib/dinero";
import { fechaVE, formatFechaVE, formatHoraVE, sumarDiasVE } from "@/lib/fechas";
import { esTasaDesactualizada, type TasaBCV } from "@/lib/types/pagos";
import { registrarTasaManual } from "@/app/admin/(panel)/tarifas/actions";

interface TasaBCVCardProps {
  tasa: TasaBCV | null;
  /** Hoy en Venezuela ('YYYY-MM-DD'), calculado en el servidor. */
  hoy: string;
  /** "completa": con formulario de carga manual (Tarifas). "resumen": solo estado (dashboard). */
  variante?: "completa" | "resumen";
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

export function TasaBCVCard({ tasa, hoy, variante = "completa", className }: TasaBCVCardProps) {
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
    tasa && Number.isFinite(tasaNueva) && tasaNueva > 0
      ? Math.abs(tasaNueva - tasa.tasa) / tasa.tasa
      : null;

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
      return setError({
        campo: "tasa",
        mensaje: "Escribe la tasa en bolívares por 1 dólar, por ejemplo 100,81.",
      });
    }
    if (motivo.trim().length < 5) {
      return setError({
        campo: "motivo",
        mensaje: "Escribe por qué cargas la tasa a mano (mínimo 5 caracteres).",
      });
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
      toast.success(
        `Tasa BCV del ${fechaTasaCorta(guardada.fecha)} guardada: ${formatNumeroVE(guardada.tasa)} Bs/USD.`
      );
      setFormAbierto(false);
      router.refresh();
    } catch {
      setError({ mensaje: "No pudimos conectarnos. Revisa tu conexión e intenta de nuevo." });
    } finally {
      setGuardando(false);
    }
  }

  const actualizacion = tasa ? textoActualizacion(tasa, hoy) : null;

  return (
    <Card
      id="tasa-bcv"
      className={cn(
        "transition-all duration-200",
        desactualizada && "border-amber-500/40 bg-amber-500/5",
        className
      )}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <div
              className={cn(
                "flex size-7 items-center justify-center rounded",
                desactualizada ? "bg-amber-100 text-amber-900 dark:bg-amber-400/15 dark:text-amber-200" : "bg-primary/15 text-primary-text"
              )}
            >
              <CurrencyCircleDollar className="size-4" />
            </div>
            <div>
              <CardTitle className="text-lg font-bold tracking-tight">Tasa BCV</CardTitle>
              <CardDescription className="text-xs">
                Los precios se fijan en USD y se cobran en bolívares a esta tasa.
              </CardDescription>
            </div>
          </div>
          {variante === "completa" && !formAbierto && (
            <Button variant="outline" size="sm" onClick={abrirFormulario} className="shrink-0 gap-1.5">
              <PencilSimple className="size-3.5" /> Cargar tasa manual
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div role="status" className="space-y-1">
          {tasa ? (
            <>
              <p className="text-sm text-muted-foreground">Tasa BCV vigente</p>
              <p className="text-2xl font-semibold tracking-tight tabular-nums">
                {formatNumeroVE(tasa.tasa)} <span className="text-base font-medium text-muted-foreground">Bs/USD</span>
              </p>
              <p className="text-xs text-muted-foreground">
                {formatFechaVE(tasa.fecha)} · fuente {tasa.fuente === "manual" ? "manual" : "automática"}
                {actualizacion ? ` · ${actualizacion}` : ""}
              </p>
            </>
          ) : (
            <>
              <p className="text-base font-semibold">Sin tasa BCV registrada</p>
              <p className="text-xs text-muted-foreground">
                Las cooperativas no pueden cobrar en bolívares hasta que haya una tasa. Cárgala a mano si la
                tarea automática aún no la trajo.
              </p>
            </>
          )}
        </div>

        {tasa && desactualizada && (
          <div className="flex gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-950 dark:text-amber-100">
            <Warning weight="fill" className="size-4 shrink-0 text-warning-text" aria-hidden />
            <p>
              La tasa no se actualiza desde el {fechaTasaCorta(tasa.fecha)}. Revisa la tarea programada o cárgala a
              mano.
            </p>
          </div>
        )}

        {variante === "resumen" && (desactualizada || !tasa) && (
          <Link href="/admin/tarifas#tasa-bcv" className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-1.5")}>
            <PencilSimple className="size-3.5" /> Cargar tasa manual
          </Link>
        )}

        {variante === "completa" && formAbierto && (
          <form onSubmit={handleSubmit} noValidate className="space-y-3 rounded-xl border bg-muted/30 p-4">
            <div>
              <p className="text-sm font-semibold">Cargar tasa manual</p>
              <p className="text-xs text-muted-foreground">
                Úsala solo si la tasa automática falla; la manual no se sobrescribe.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="tasa-fecha" className="text-xs">Fecha de vigencia</Label>
                <Input
                  id="tasa-fecha"
                  type="date"
                  value={fecha}
                  max={sumarDiasVE(hoy, 1)}
                  onChange={(e) => setFecha(e.target.value)}
                  aria-invalid={error?.campo === "fecha" || undefined}
                  aria-describedby={error?.campo === "fecha" ? "tasa-error" : undefined}
                  disabled={guardando}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="tasa-valor" className="text-xs">Tasa (Bs por 1 USD)</Label>
                <Input
                  id="tasa-valor"
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="Ej: 100,81"
                  value={tasaTexto}
                  onChange={(e) => setTasaTexto(e.target.value)}
                  aria-invalid={error?.campo === "tasa" || undefined}
                  aria-describedby={
                    error?.campo === "tasa"
                      ? "tasa-error"
                      : diferencia !== null && diferencia > 0.1
                        ? "tasa-ayuda"
                        : undefined
                  }
                  disabled={guardando}
                  className="tabular-nums"
                />
              </div>
            </div>

            {diferencia !== null && diferencia > 0.1 && (
              <p id="tasa-ayuda" className="text-xs text-warning-text">
                Esta tasa es {formatNumeroVE(diferencia * 100, 0)} % distinta de la vigente (
                {formatNumeroVE(tasa?.tasa ?? 0)} Bs/USD). Revisa que esté en bolívares por 1 dólar.
              </p>
            )}

            <div className="space-y-1">
              <Label htmlFor="tasa-motivo" className="text-xs">Motivo</Label>
              <Textarea
                id="tasa-motivo"
                placeholder="Ej: La tarea automática no actualizó la tasa de hoy."
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                aria-invalid={error?.campo === "motivo" || undefined}
                aria-describedby={error?.campo === "motivo" ? "tasa-error" : undefined}
                disabled={guardando}
                className="min-h-12 text-sm"
              />
            </div>

            {error && (
              <p id="tasa-error" role="alert" className="text-xs font-medium text-destructive-text">
                {error.mensaje}
              </p>
            )}

            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => setFormAbierto(false)} disabled={guardando}>
                Cancelar
              </Button>
              <Button type="submit" size="sm" disabled={guardando}>
                {guardando ? "Guardando…" : "Guardar tasa"}
              </Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
