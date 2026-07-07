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
import { useRouter } from "next/navigation";
import { previewCiclosComision, generarCiclosComision } from "@/app/admin/(panel)/comisiones/actions";
import { CicloPreview } from "@/lib/types/admin-comisiones";

interface GenerarCicloDialogProps {
  cooperativas: { id: string; nombre: string; comision_porcentaje: number }[];
}

export function GenerarCicloDialog({ cooperativas }: GenerarCicloDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  
  // Form states
  // Default dates: last 7 days (from 7 days ago to yesterday)
  const defaultStartDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
  const defaultEndDate = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
  
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
      toast.error("Por favor selecciona ambas fechas");
      return;
    }

    if (new Date(periodoInicio) > new Date(periodoFin)) {
      toast.error("La fecha de inicio no puede ser posterior a la fecha de fin");
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
        toast.error(res.error || "Error al calcular la previsualización");
      } else {
        setPreviews(res.previews || []);
        toast.success("Previsualización calculada correctamente");
      }
    } catch (err) {
      console.error(err);
      toast.error("Error al conectar con el servidor");
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleGenerate = async () => {
    if (!previews || previews.length === 0) return;

    // Verificar si hay al menos uno que se pueda generar
    const canGenerateAny = previews.some(p => !p.se_solapa && (p.total_boletos + p.total_encomiendas) > 0);
    if (!canGenerateAny) {
      toast.error("No hay ciclos válidos para generar en el período seleccionado (todos se solapan o no tienen ventas)");
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
        toast.error(res.error || "Ocurrió un error al generar los ciclos");
      } else {
        toast.success("Ciclos de comisiones procesados");
        setGenerationSummary(res.summary || null);
        setPreviews(null);
        router.refresh();
      }
    } catch (err) {
      console.error(err);
      toast.error("Error al conectar con el servidor");
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
        <Button className="bg-emerald-600 hover:bg-emerald-500 text-white font-medium shadow-lg shadow-emerald-900/20 gap-2">
          <Plus className="h-4 w-4" /> Generar Ciclo
        </Button>
      </DialogTrigger>

      <DialogContent className="bg-slate-950 border-slate-800 text-slate-100 max-w-2xl overflow-hidden flex flex-col max-h-[85vh]">
        <DialogHeader>
          <DialogTitle className="text-xl text-slate-100 flex items-center gap-2">
            <Calendar className="h-5 w-5 text-emerald-500" /> Generar Ciclos de Comisión
          </DialogTitle>
          <DialogDescription className="text-slate-400">
            Calcula e inicia un período de liquidación de comisiones para las ventas de boletos y encomiendas.
          </DialogDescription>
        </DialogHeader>

        {generationSummary ? (
          // Vista de resumen de generación exitosa
          <div className="space-y-6 py-4 flex-1 overflow-y-auto">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-500">
              <ShieldCheck className="h-8 w-8" />
            </div>
            <div className="space-y-2 text-center">
              <h3 className="text-lg font-medium text-slate-100">Proceso Completado</h3>
              <p className="text-sm text-slate-400">
                Se han procesado los ciclos de comisiones para el período del <strong>{periodoInicio}</strong> al <strong>{periodoFin}</strong>.
              </p>
            </div>

            <div className="space-y-3 bg-slate-900/50 border border-slate-800 p-4 rounded-lg text-sm">
              {generationSummary.generated.length > 0 && (
                <div>
                  <h4 className="font-semibold text-emerald-400 mb-1">Ciclos Generados ({generationSummary.generated.length}):</h4>
                  <p className="text-slate-300">{generationSummary.generated.join(", ")}</p>
                </div>
              )}

              {generationSummary.skippedOverlap.length > 0 && (
                <div className="pt-2 border-t border-slate-800/60">
                  <h4 className="font-semibold text-amber-400 mb-1">Omitidos por Solapamiento ({generationSummary.skippedOverlap.length}):</h4>
                  <p className="text-slate-400 text-xs">{generationSummary.skippedOverlap.join(", ")}</p>
                </div>
              )}

              {generationSummary.skippedZeroSales.length > 0 && (
                <div className="pt-2 border-t border-slate-800/60">
                  <h4 className="font-semibold text-slate-400 mb-1">Omitidos sin Ventas ({generationSummary.skippedZeroSales.length}):</h4>
                  <p className="text-slate-400 text-xs">{generationSummary.skippedZeroSales.join(", ")}</p>
                </div>
              )}
            </div>

            <DialogFooter>
              <Button 
                onClick={() => setOpen(false)}
                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white"
              >
                Entendido
              </Button>
            </DialogFooter>
          </div>
        ) : (
          // Formulario + Previsualización
          <div className="flex-1 overflow-y-auto space-y-4 pr-1 py-2">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="periodo_inicio" className="text-slate-300">Fecha Inicio</Label>
                <input
                  id="periodo_inicio"
                  type="date"
                  value={periodoInicio}
                  onChange={(e) => setPeriodoInicio(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-md px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="periodo_fin" className="text-slate-300">Fecha Fin</Label>
                <input
                  id="periodo_fin"
                  type="date"
                  value={periodoFin}
                  onChange={(e) => setPeriodoFin(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-md px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="cooperativa_id" className="text-slate-300">Cooperativa</Label>
                <select
                  id="cooperativa_id"
                  value={cooperativaId}
                  onChange={(e) => setCooperativaId(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-md px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500"
                >
                  <option value="all">Todas las cooperativas</option>
                  {cooperativas.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre} ({c.comision_porcentaje}%)
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
                className="bg-slate-800 hover:bg-slate-700 text-slate-100 gap-2"
              >
                {previewLoading ? <Spinner className="animate-spin h-4 w-4" /> : "Calcular Previsualización"}
              </Button>
            </div>

            {previews && previews.length > 0 && (
              <div className="space-y-3 pt-2">
                <div className="text-sm font-semibold text-slate-300 flex items-center gap-2">
                  Resultados del Cálculo <ArrowRight className="h-3 w-3" />
                </div>
                <div className="border border-slate-800 rounded-lg overflow-hidden max-h-60 overflow-y-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-900/80 border-b border-slate-800 text-slate-400 font-medium">
                        <th className="p-3">Cooperativa</th>
                        <th className="p-3 text-right">Boletos</th>
                        <th className="p-3 text-right">Encomiendas</th>
                        <th className="p-3 text-right">Comisión</th>
                        <th className="p-3 text-center">Estado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {previews.map((p) => {
                        const totalVentas = p.total_boletos + p.total_encomiendas;
                        return (
                          <tr key={p.cooperativa_id} className="hover:bg-slate-900/40 text-slate-200">
                            <td className="p-3 font-medium">{p.cooperativa_nombre}</td>
                            <td className="p-3 text-right text-slate-400">${p.total_boletos.toFixed(2)}</td>
                            <td className="p-3 text-right text-slate-400">${p.total_encomiendas.toFixed(2)}</td>
                            <td className="p-3 text-right font-semibold text-emerald-400">
                              ${p.monto_comision.toFixed(2)}
                              <span className="text-[10px] text-slate-500 ml-1">({p.comision_porcentaje}%)</span>
                            </td>
                            <td className="p-3 text-center">
                              {p.se_solapa ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] bg-red-950 text-red-400 border border-red-900/40">
                                  <Warning className="h-3 w-3" /> Solapado
                                </span>
                              ) : totalVentas === 0 ? (
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] bg-slate-800 text-slate-400">
                                  Sin ventas
                                </span>
                              ) : (
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] bg-emerald-950 text-emerald-400 border border-emerald-900/30">
                                  Listo
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="flex items-center gap-2 text-xs text-slate-400 bg-slate-900/30 p-2 rounded border border-slate-800/40">
                  <Warning className="h-4 w-4 text-amber-500 flex-shrink-0" />
                  <span>
                    Solo se generarán ciclos para las cooperativas con estado <strong>&quot;Listo&quot;</strong>.
                    Los ciclos solapados o sin ventas en el período serán omitidos.
                  </span>
                </div>

                <DialogFooter className="pt-2">
                  <Button 
                    onClick={() => {
                      setPreviews(null);
                      resetForm();
                    }}
                    variant="ghost" 
                    className="text-slate-400 hover:text-slate-200"
                    disabled={loading}
                  >
                    Cancelar
                  </Button>
                  <Button
                    onClick={handleGenerate}
                    disabled={loading || !previews.some(p => !p.se_solapa && (p.total_boletos + p.total_encomiendas) > 0)}
                    className="bg-emerald-600 hover:bg-emerald-500 text-white gap-2 font-medium"
                  >
                    {loading ? (
                      <>
                        <Spinner className="animate-spin h-4 w-4" /> Generando...
                      </>
                    ) : (
                      "Confirmar y Generar"
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
