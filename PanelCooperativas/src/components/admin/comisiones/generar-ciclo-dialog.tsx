"use client";

import { useState } from "react";
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger,
  DialogFooter
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Plus, Spinner, ShieldCheck, Warning, Calendar, ArrowRight } from "@phosphor-icons/react";
import { toast } from "sonner";
import { humanizeError } from "@/lib/errores";
import { useRouter } from "next/navigation";
import { previewCiclosComision, generarCiclosComision } from "@/app/admin/(panel)/comisiones/actions";
import { CicloPreview } from "@/lib/types/admin-comisiones";
import { formatFechaVE, hoyVE, sumarDiasVE } from "@/lib/fechas";
import { Monto } from "@/components/monto";
import type { TasaBCV } from "@/lib/types/pagos";
import { useTasaBCVAdmin } from "@/components/admin/dashboard/use-tasa-bcv-admin";

interface GenerarCicloDialogProps {
  cooperativas: { id: string; nombre: string; comision_porcentaje: number }[];
  /** Tasa BCV de hoy (del servidor). Si no se pasa, se consulta en el navegador. */
  tasa?: TasaBCV | null;
}

export function GenerarCicloDialog({ cooperativas, tasa: tasaServidor }: GenerarCicloDialogProps) {
  const router = useRouter();
  const tasa = useTasaBCVAdmin(tasaServidor);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  
  // Form states
  // Default dates: last 7 days (from 7 days ago to yesterday), contados en el día de Venezuela
  const hoy = hoyVE();
  const defaultStartDate = sumarDiasVE(hoy, -7);
  const defaultEndDate = sumarDiasVE(hoy, -1);
  
  const [periodoInicio, setPeriodoInicio] = useState(defaultStartDate);
  const [periodoFin, setPeriodoFin] = useState(defaultEndDate);
  const [cooperativaId, setCooperativaId] = useState("all");

  const [previews, setPreviews] = useState<CicloPreview[] | null>(null);
  const [generationSummary, setGenerationSummary] = useState<{
    generated: string[];
    skippedOverlap: string[];
    skippedZeroSales: string[];
  } | null>(null);

  const handlePreview = async () => {
    if (!periodoInicio || !periodoFin) {
      toast.error("Elige las fechas de inicio y fin.");
      return;
    }

    if (new Date(periodoInicio) > new Date(periodoFin)) {
      toast.error("La fecha de inicio no puede ser posterior a la fecha de fin.");
      return;
    }

    setPreviewLoading(true);
    setPreviews(null);
    setGenerationSummary(null);

    try {
      const res = await previewCiclosComision({
        periodo_inicio: periodoInicio,
        periodo_fin: periodoFin,
        cooperativa_id: cooperativaId
      });

      if (!res.success) {
        toast.error(res.error || "No pudimos calcular la vista previa. Intenta de nuevo.");
      } else {
        setPreviews(res.previews || []);
        
      }
    } catch (err) {
      toast.error(humanizeError(err, "calcular la vista previa"));
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleGenerate = async () => {
    if (loading || !previews || previews.length === 0) return;

    // Verificar si hay al menos uno que se pueda generar
    const canGenerateAny = previews.some(p => !p.se_solapa && (p.total_boletos + p.total_encomiendas) > 0);
    if (!canGenerateAny) {
      toast.error("No hay ciclos para generar: todas las cooperativas ya tienen ciclo en esas fechas o no vendieron.");
      return;
    }

    setLoading(true);
    try {
      const res = await generarCiclosComision({
        periodo_inicio: periodoInicio,
        periodo_fin: periodoFin,
        cooperativa_id: cooperativaId
      });

      if (!res.success) {
        toast.error(res.error || "No pudimos generar los ciclos. Intenta de nuevo.");
      } else {
        toast.success("Ciclos de comisiones generados.");
        setGenerationSummary(res.summary || null);
        setPreviews(null);
        router.refresh();
      }
    } catch (err) {
      toast.error(humanizeError(err, "generar los ciclos"));
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setPeriodoInicio(defaultStartDate);
    setPeriodoFin(defaultEndDate);
    setCooperativaId("all");
    setPreviews(null);
    setGenerationSummary(null);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => {
      if (!loading && !previewLoading) {
        setOpen(v);
        if (!v) resetForm();
      }
    }}>
      <DialogTrigger asChild>
        <Button className="gap-2">
          <Plus className="h-4 w-4" /> Generar ciclo
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-2xl overflow-hidden flex flex-col max-h-[85vh]">
        <DialogHeader>
          <DialogTitle className="text-xl text-foreground flex items-center gap-2">
            <Calendar className="h-5 w-5 text-success-text" /> Generar ciclos de comisión
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Calcula la comisión de cada cooperativa por sus ventas de boletos y encomiendas en un período.
          </DialogDescription>
        </DialogHeader>

        {generationSummary ? (
          // Vista de resumen de generación exitosa
          <div className="space-y-6 py-4 flex-1 overflow-y-auto">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-900 dark:bg-emerald-400/15 dark:text-emerald-200">
              <ShieldCheck className="h-8 w-8" />
            </div>
            <div className="space-y-2 text-center">
              <h3 className="text-lg font-medium text-foreground">Ciclos procesados</h3>
              <p className="text-sm text-muted-foreground">
                Procesamos los ciclos del período del <strong>{formatFechaVE(periodoInicio)}</strong> al <strong>{formatFechaVE(periodoFin)}</strong>.
              </p>
            </div>

            <div className="space-y-3 bg-muted/50 border border-border p-4 rounded-lg text-sm">
              {generationSummary.generated.length > 0 && (
                <div>
                  <h4 className="font-semibold text-success-text mb-1">Ciclos generados ({generationSummary.generated.length}):</h4>
                  <p>{generationSummary.generated.join(", ")}</p>
                </div>
              )}

              {generationSummary.skippedOverlap.length > 0 && (
                <div className="pt-2 border-t border-border/60">
                  <h4 className="font-semibold text-warning-text mb-1">Omitidos porque ya hay un ciclo en esas fechas ({generationSummary.skippedOverlap.length}):</h4>
                  <p className="text-muted-foreground text-xs">{generationSummary.skippedOverlap.join(", ")}</p>
                </div>
              )}

              {generationSummary.skippedZeroSales.length > 0 && (
                <div className="pt-2 border-t border-border/60">
                  <h4 className="font-semibold text-muted-foreground mb-1">Omitidos por no tener ventas ({generationSummary.skippedZeroSales.length}):</h4>
                  <p className="text-muted-foreground text-xs">{generationSummary.skippedZeroSales.join(", ")}</p>
                </div>
              )}
            </div>

            <DialogFooter>
              <Button
                onClick={() => {
                  // setOpen directo no pasa por onOpenChange: limpiar aquí para que al reabrir no se vea este resumen.
                  setOpen(false);
                  resetForm();
                }}
                className="w-full"
              >
                Entendido
              </Button>
            </DialogFooter>
          </div>
        ) : (
          // Formulario + vista previa
          <div className="flex-1 overflow-y-auto space-y-4 pr-1 py-2">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="periodo_inicio">Desde</Label>
                <input
                  id="periodo_inicio"
                  type="date"
                  value={periodoInicio}
                  onChange={(e) => {
                    setPeriodoInicio(e.target.value);
                    // Cambiar el período invalida la vista previa: hay que recalcularla antes de generar
                    setPreviews(null);
                  }}
                  className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="periodo_fin">Hasta</Label>
                <input
                  id="periodo_fin"
                  type="date"
                  value={periodoFin}
                  onChange={(e) => {
                    setPeriodoFin(e.target.value);
                    setPreviews(null);
                  }}
                  className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="cooperativa_id">Cooperativa</Label>
                <select
                  id="cooperativa_id"
                  value={cooperativaId}
                  onChange={(e) => {
                    setCooperativaId(e.target.value);
                    setPreviews(null);
                  }}
                  className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="all">Todas las cooperativas</option>
                  {cooperativas.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre} ({c.comision_porcentaje} %)
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex justify-end pt-1">
              <Button 
                onClick={handlePreview} 
                disabled={previewLoading || loading}
                variant="secondary"
                className="gap-2"
              >
                {previewLoading ? (
                  <>
                    <Spinner className="animate-spin h-4 w-4" aria-hidden /> Calculando…
                  </>
                ) : (
                  "Ver vista previa"
                )}
              </Button>
            </div>

            {previews && previews.length === 0 && (
              <p role="status" className="rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground">
                No hay cooperativas activas para calcular en ese período.
              </p>
            )}

            {previews && previews.length > 0 && (
              <div className="space-y-3 pt-2">
                <div className="text-sm font-semibold text-foreground flex items-center gap-2">
                  Vista previa <ArrowRight className="h-3 w-3" aria-hidden />
                </div>
                <p className="text-sm text-muted-foreground">
                  Período previsualizado: del <strong className="text-foreground">{formatFechaVE(periodoInicio)}</strong> al{" "}
                  <strong className="text-foreground">{formatFechaVE(periodoFin)}</strong>. Si cambias las fechas, vuelve a calcular.
                </p>
                <div className="border border-border rounded-lg overflow-hidden max-h-60 overflow-y-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-muted/80 border-b border-border text-muted-foreground font-medium">
                        <th className="p-3">Cooperativa</th>
                        <th className="p-3 text-right">Boletos (USD)</th>
                        <th className="p-3 text-right">Encomiendas (USD)</th>
                        <th className="p-3 text-right">Comisión (USD)</th>
                        <th className="p-3 text-center">Estado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {previews.map((p) => {
                        const totalVentas = p.total_boletos + p.total_encomiendas;
                        return (
                          <tr key={p.cooperativa_id} className="hover:bg-muted/40 text-foreground">
                            <td className="p-3 font-medium">{p.cooperativa_nombre}</td>
                            <td className="p-3 text-right text-muted-foreground"><Monto usd={p.total_boletos} tasa={tasa} moneda="USD" size="sm" align="right" /></td>
                            <td className="p-3 text-right text-muted-foreground"><Monto usd={p.total_encomiendas} tasa={tasa} moneda="USD" size="sm" align="right" /></td>
                            <td className="p-3 text-right font-semibold text-foreground">
                              <Monto usd={p.monto_comision} tasa={tasa} moneda="USD" size="sm" align="right" />
                              <span className="text-xs text-muted-foreground ml-1">({p.comision_porcentaje} %)</span>
                            </td>
                            <td className="p-3 text-center">
                              {p.se_solapa ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-red-100 text-red-900 dark:bg-red-400/15 dark:text-red-200">
                                  <Warning className="h-3 w-3" /> Ya tiene ciclo
                                </span>
                              ) : totalVentas === 0 ? (
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-muted text-muted-foreground">
                                  Sin ventas
                                </span>
                              ) : (
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-emerald-100 text-emerald-900 dark:bg-emerald-400/15 dark:text-emerald-200">
                                  Se generará
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/30 p-2 rounded border border-border/40">
                  <Warning className="h-4 w-4 text-warning-text flex-shrink-0" aria-hidden />
                  <span>
                    Solo se generan los ciclos marcados «Se generará».
                    Se omiten las cooperativas que ya tienen un ciclo en esas fechas o que no vendieron.
                  </span>
                </div>

                <DialogFooter className="pt-2">
                  <Button 
                    onClick={() => {
                      setPreviews(null);
                      resetForm();
                    }}
                    variant="ghost" 
                    className="text-muted-foreground hover:text-foreground"
                    disabled={loading}
                  >
                    Cancelar
                  </Button>
                  <Button
                    onClick={handleGenerate}
                    disabled={loading || !previews.some(p => !p.se_solapa && (p.total_boletos + p.total_encomiendas) > 0)}
                    className="gap-2 font-medium"
                  >
                    {loading ? (
                      <>
                        <Spinner className="animate-spin h-4 w-4" /> Generando…
                      </>
                    ) : (
                      "Generar ciclos"
                    )}
                  </Button>
                </DialogFooter>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
