"use client";

// ─── Generar ciclos de comisión (AD5-21, AD5-37, AD5-46) ────────────────────
// Período y cooperativa → vista previa → generar. Los errores se leen dentro
// del diálogo; el éxito cierra con "Listo".

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "@phosphor-icons/react";
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
import { Field, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AvisoError } from "@/components/aviso-error";
import { TonoBadge } from "@/components/status-badge";
import { Monto } from "@/components/monto";
import { ExitoDialogo } from "@/components/admin/cooperativas/create-cooperativa-dialog";
import { formatPorcentaje } from "@/components/admin/cooperativas/cooperativas-table";
import { humanizeError } from "@/lib/errores";
import { avisarExito } from "@/lib/avisos";
import { previewCiclosComision, generarCiclosComision } from "@/app/admin/(panel)/comisiones/actions";
import type { CicloPreview } from "@/lib/types/admin-comisiones";
import { formatFechaVE, hoyVE, sumarDiasVE } from "@/lib/fechas";
import type { TasaBCV } from "@/lib/types/pagos";
import { useTasaBCVAdmin } from "@/components/admin/dashboard/use-tasa-bcv-admin";

interface GenerarCicloDialogProps {
  cooperativas: { id: string; nombre: string; comision_porcentaje: number }[];
  /** Tasa BCV de hoy (del servidor). Si no se pasa, se consulta en el navegador. */
  tasa?: TasaBCV | null;
}

const TODAS = "all";

type Resumen = { generated: string[]; skippedOverlap: string[]; skippedZeroSales: string[] };

export function GenerarCicloDialog({ cooperativas, tasa: tasaServidor }: GenerarCicloDialogProps) {
  const router = useRouter();
  const tasa = useTasaBCVAdmin(tasaServidor);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Por defecto, los últimos 7 días completos (de hace 7 días a ayer), en el día de Venezuela.
  const hoy = hoyVE();
  const inicioPorDefecto = sumarDiasVE(hoy, -7);
  const finPorDefecto = sumarDiasVE(hoy, -1);

  const [periodoInicio, setPeriodoInicio] = useState(inicioPorDefecto);
  const [periodoFin, setPeriodoFin] = useState(finPorDefecto);
  const [cooperativaId, setCooperativaId] = useState(TODAS);
  const [previews, setPreviews] = useState<CicloPreview[] | null>(null);
  const [resumen, setResumen] = useState<Resumen | null>(null);

  const ocupado = loading || previewLoading;
  const generables = previews?.filter((p) => !p.se_solapa && p.total_boletos + p.total_encomiendas > 0) ?? [];

  const resetForm = () => {
    setPeriodoInicio(inicioPorDefecto);
    setPeriodoFin(finPorDefecto);
    setCooperativaId(TODAS);
    setPreviews(null);
    setResumen(null);
    setError(null);
  };

  /** Cambiar un dato invalida la vista previa: hay que recalcularla antes de generar. */
  const cambiar = (fn: () => void) => {
    fn();
    setPreviews(null);
    setError(null);
  };

  const handlePreview = async () => {
    if (!periodoInicio || !periodoFin) {
      setError("Elige las fechas de inicio y fin.");
      return;
    }
    if (periodoInicio > periodoFin) {
      setError("La fecha de inicio no puede ser posterior a la de fin.");
      return;
    }
    setPreviewLoading(true);
    setPreviews(null);
    setError(null);
    try {
      const res = await previewCiclosComision({
        periodo_inicio: periodoInicio,
        periodo_fin: periodoFin,
        cooperativa_id: cooperativaId,
      });
      if (!res.success) setError(res.error || "No pudimos calcular la vista previa. Intenta de nuevo.");
      else setPreviews(res.previews || []);
    } catch (err) {
      setError(humanizeError(err, "calcular la vista previa"));
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleGenerate = async () => {
    if (loading || generables.length === 0) return;
    setLoading(true);
    setError(null);
    try {
      const res = await generarCiclosComision({
        periodo_inicio: periodoInicio,
        periodo_fin: periodoFin,
        cooperativa_id: cooperativaId,
      });
      if (!res.success) {
        setError(res.error || "No pudimos generar los ciclos. Intenta de nuevo.");
      } else {
        avisarExito("Ciclos de comisiones generados.");
        setResumen(res.summary || { generated: [], skippedOverlap: [], skippedZeroSales: [] });
        setPreviews(null);
        router.refresh();
      }
    } catch (err) {
      setError(humanizeError(err, "generar los ciclos"));
    } finally {
      setLoading(false);
    }
  };

  const itemsCooperativa: Record<string, string> = {
    [TODAS]: "Todas",
    ...Object.fromEntries(
      cooperativas.map((c) => [c.id, `${c.nombre} (${formatPorcentaje(c.comision_porcentaje)})`])
    ),
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (ocupado) return;
        setOpen(v);
        if (!v) resetForm();
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <Plus aria-hidden /> Generar ciclo
        </Button>
      </DialogTrigger>

      <DialogContent tamano="flujo">
        {resumen ? (
          <ExitoDialogo
            titulo="Ciclos procesados"
            descripcion={`Del ${formatFechaVE(periodoInicio)} al ${formatFechaVE(periodoFin)}.`}
            onListo={() => {
              // setOpen directo no pasa por onOpenChange: se limpia aquí para no reabrir en este resumen.
              setOpen(false);
              resetForm();
            }}
          >
            <dl className="flex flex-col gap-4 rounded-md bg-muted p-4 text-sm">
              {resumen.generated.length > 0 && (
                <div className="flex flex-col gap-1">
                  <dt className="font-medium">Generados ({resumen.generated.length})</dt>
                  <dd className="text-muted-foreground">{resumen.generated.join(", ")}</dd>
                </div>
              )}
              {resumen.skippedOverlap.length > 0 && (
                <div className="flex flex-col gap-1">
                  <dt className="font-medium">Ya tenían ciclo en esas fechas ({resumen.skippedOverlap.length})</dt>
                  <dd className="text-muted-foreground">{resumen.skippedOverlap.join(", ")}</dd>
                </div>
              )}
              {resumen.skippedZeroSales.length > 0 && (
                <div className="flex flex-col gap-1">
                  <dt className="font-medium">Sin ventas ({resumen.skippedZeroSales.length})</dt>
                  <dd className="text-muted-foreground">{resumen.skippedZeroSales.join(", ")}</dd>
                </div>
              )}
            </dl>
          </ExitoDialogo>
        ) : (
          <div className="flex flex-col gap-6">
            <DialogHeader>
              <DialogTitle>Generar ciclos de comisión</DialogTitle>
              <DialogDescription>Comisión de cada cooperativa por sus ventas en un período.</DialogDescription>
            </DialogHeader>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Field>
                <FieldLabel htmlFor="periodo_inicio">Desde</FieldLabel>
                <Input
                  id="periodo_inicio"
                  type="date"
                  value={periodoInicio}
                  max={periodoFin || undefined}
                  disabled={ocupado}
                  onChange={(e) => cambiar(() => setPeriodoInicio(e.target.value))}
                  className="tabular-nums"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="periodo_fin">Hasta</FieldLabel>
                <Input
                  id="periodo_fin"
                  type="date"
                  value={periodoFin}
                  min={periodoInicio || undefined}
                  disabled={ocupado}
                  onChange={(e) => cambiar(() => setPeriodoFin(e.target.value))}
                  className="tabular-nums"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="cooperativa_id">Cooperativa</FieldLabel>
                <Select
                  value={cooperativaId}
                  onValueChange={(v) => cambiar(() => setCooperativaId(v ? String(v) : TODAS))}
                  items={itemsCooperativa}
                  disabled={ocupado}
                >
                  <SelectTrigger id="cooperativa_id" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={TODAS}>Todas</SelectItem>
                    {cooperativas.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {itemsCooperativa[c.id]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>

            {previews && previews.length === 0 && (
              <p role="status" className="text-sm text-muted-foreground">
                No hay cooperativas activas para calcular en ese período.
              </p>
            )}

            {previews && previews.length > 0 && (
              <section aria-labelledby="vista-previa" className="flex flex-col gap-3">
                <h3 id="vista-previa" className="text-sm font-semibold">
                  Vista previa
                </h3>
                <div className="max-h-72 overflow-y-auto rounded-md border border-border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Cooperativa</TableHead>
                        <TableHead className="text-right">Boletos</TableHead>
                        <TableHead className="text-right">Encomiendas</TableHead>
                        <TableHead className="text-right">Comisión</TableHead>
                        <TableHead>Resultado</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {previews.map((p) => {
                        const sinVentas = p.total_boletos + p.total_encomiendas === 0;
                        return (
                          <TableRow key={p.cooperativa_id}>
                            <TableCell className="font-medium">
                              {p.cooperativa_nombre}
                              <span className="block text-xs font-normal text-muted-foreground tabular-nums">
                                {formatPorcentaje(p.comision_porcentaje)}
                              </span>
                            </TableCell>
                            <TableCell className="text-right">
                              <Monto usd={p.total_boletos} tasa={tasa} moneda="USD" size="sm" align="right" />
                            </TableCell>
                            <TableCell className="text-right">
                              <Monto usd={p.total_encomiendas} tasa={tasa} moneda="USD" size="sm" align="right" />
                            </TableCell>
                            <TableCell className="text-right">
                              <Monto usd={p.monto_comision} tasa={tasa} moneda="USD" size="sm" align="right" />
                            </TableCell>
                            <TableCell>
                              {p.se_solapa ? (
                                <TonoBadge tono="peligro">Ya tiene ciclo</TonoBadge>
                              ) : sinVentas ? (
                                <TonoBadge tono="neutro">Sin ventas</TonoBadge>
                              ) : (
                                <TonoBadge tono="exito">Se generará</TonoBadge>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
                <p className="text-xs text-muted-foreground">
                  Solo se generan los marcados «Se generará». Si cambias las fechas, vuelve a calcular.
                </p>
              </section>
            )}

            {error && <AvisoError>{error}</AvisoError>}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setOpen(false);
                  resetForm();
                }}
                disabled={ocupado}
              >
                Cancelar
              </Button>
              {previews && previews.length > 0 ? (
                <Button
                  type="button"
                  onClick={handleGenerate}
                  disabled={loading || generables.length === 0}
                  aria-busy={loading || undefined}
                >
                  {loading && <Spinner size="sm" aria-hidden />}
                  {loading
                    ? "Generando…"
                    : generables.length === 0
                      ? "Generar ciclos"
                      : generables.length === 1
                      ? "Generar 1 ciclo"
                      : `Generar ${generables.length} ciclos`}
                </Button>
              ) : (
                <Button type="button" onClick={handlePreview} disabled={ocupado} aria-busy={previewLoading || undefined}>
                  {previewLoading && <Spinner size="sm" aria-hidden />}
                  {previewLoading ? "Calculando…" : "Ver vista previa"}
                </Button>
              )}
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
