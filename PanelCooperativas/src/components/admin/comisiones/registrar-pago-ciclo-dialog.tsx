"use client";

import { useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { SpinnerIcon, WarningCircle } from "@phosphor-icons/react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { marcarCicloComoPagado } from "@/app/admin/(panel)/comisiones/actions";
import { humanizeError } from "@/lib/errores";
import { formatUsd } from "@/lib/dinero";
import { formatFechaVE, hoyVE } from "@/lib/fechas";
import { etiquetaMetodoPago } from "@/lib/estados";
import { METODOS_PAGO_COMISION, type ComisionCiclo, type MetodoPagoComision } from "@/lib/types/admin-comisiones";

/** "Registrar pago" de un ciclo: método, referencia (salvo efectivo) y fecha en que pagó la cooperativa. */
export function RegistrarPagoCicloDialog({ ciclo, onClose }: { ciclo: ComisionCiclo | null; onClose: () => void }) {
  const [guardando, setGuardando] = useState(false);
  return (
    <Dialog open={ciclo !== null} onOpenChange={(v) => !v && !guardando && onClose()}>
      <DialogContent className="sm:max-w-md">
        {/* key: cada ciclo empieza con el formulario limpio. */}
        {ciclo && <Formulario key={ciclo.id} ciclo={ciclo} onClose={onClose} guardando={guardando} setGuardando={setGuardando} />}
      </DialogContent>
    </Dialog>
  );
}

function Formulario({
  ciclo,
  onClose,
  guardando,
  setGuardando,
}: {
  ciclo: ComisionCiclo;
  onClose: () => void;
  guardando: boolean;
  setGuardando: (v: boolean) => void;
}) {
  const router = useRouter();
  const uid = useId();
  const [fecha, setFecha] = useState(hoyVE());
  const [metodo, setMetodo] = useState<MetodoPagoComision | "">("");
  const [referencia, setReferencia] = useState("");
  const [error, setError] = useState<{ campo?: "fecha" | "metodo" | "referencia"; mensaje: string } | null>(null);
  const conReferencia = metodo !== "EFECTIVO";
  const enCurso = useRef(false);

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (enCurso.current) return;
    if (!metodo) {
      setError({ campo: "metodo", mensaje: "Elige cómo pagó la cooperativa." });
      document.getElementById(`${uid}-metodo`)?.focus();
      return;
    }
    if (conReferencia && referencia.trim().length < 4) {
      setError({ campo: "referencia", mensaje: "Escribe la referencia del pago (mínimo 4 caracteres)." });
      document.getElementById(`${uid}-referencia`)?.focus();
      return;
    }
    if (!fecha || fecha > hoyVE()) {
      setError({ campo: "fecha", mensaje: "Elige la fecha en que la cooperativa pagó (no puede ser futura)." });
      document.getElementById(`${uid}-fecha`)?.focus();
      return;
    }
    enCurso.current = true;
    setGuardando(true);
    setError(null);
    try {
      const res = await marcarCicloComoPagado(ciclo.id, {
        fecha,
        metodo,
        referencia: conReferencia ? referencia.trim() : null,
      });
      if (!res.success) {
        setError({ campo: res.campo, mensaje: res.error || "No pudimos registrar el pago. Intenta de nuevo." });
        return;
      }
      toast.success(`Pago de ${ciclo.cooperativa_nombre} registrado.`);
      onClose();
      router.refresh();
    } catch (err) {
      setError({ mensaje: humanizeError(err, "registrar el pago") });
    } finally {
      enCurso.current = false;
      setGuardando(false);
    }
  };

  return (
          <form onSubmit={enviar} noValidate className="space-y-4">
            <DialogHeader>
              <DialogTitle>Registrar pago</DialogTitle>
              <DialogDescription>
                {ciclo.cooperativa_nombre} pagó la comisión de <strong>{formatUsd(ciclo.monto_comision)}</strong> del{" "}
                {formatFechaVE(ciclo.periodo_inicio)} al {formatFechaVE(ciclo.periodo_fin)}.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-2">
              <Label htmlFor={`${uid}-metodo`}>Método</Label>
              <select
                id={`${uid}-metodo`}
                value={metodo}
                autoFocus
                onChange={(e) => {
                  setMetodo(e.target.value as MetodoPagoComision | "");
                  if (error) setError(null);
                }}
                disabled={guardando}
                required
                aria-invalid={error?.campo === "metodo" || undefined}
                aria-describedby={error?.campo === "metodo" ? `${uid}-error` : undefined}
                className="h-9 w-full rounded-md border border-border-strong bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="">Elige el método</option>
                {METODOS_PAGO_COMISION.map((m) => (
                  <option key={m} value={m}>
                    {etiquetaMetodoPago(m)}
                  </option>
                ))}
              </select>
            </div>

            {conReferencia && (
              <div className="space-y-2">
                <Label htmlFor={`${uid}-referencia`}>Referencia</Label>
                <Input
                  id={`${uid}-referencia`}
                  value={referencia}
                  autoComplete="off"
                  placeholder="Por ejemplo: 00123456"
                  onChange={(e) => {
                    setReferencia(e.target.value);
                    if (error) setError(null);
                  }}
                  disabled={guardando}
                  required
                  aria-invalid={error?.campo === "referencia" || undefined}
                  aria-describedby={error?.campo === "referencia" ? `${uid}-error` : `${uid}-referencia-ayuda`}
                />
                <p id={`${uid}-referencia-ayuda`} className="text-xs text-muted-foreground">
                  Número de la operación con que pagó la cooperativa.
                </p>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor={`${uid}-fecha`}>Fecha del pago</Label>
              <Input
                id={`${uid}-fecha`}
                type="date"
                value={fecha}
                max={hoyVE()}
                onChange={(e) => {
                  setFecha(e.target.value);
                  if (error) setError(null);
                }}
                disabled={guardando}
                required
                aria-invalid={error?.campo === "fecha" || undefined}
                aria-describedby={error?.campo === "fecha" ? `${uid}-error` : undefined}
              />
            </div>

            {error && (
              <div
                id={`${uid}-error`}
                role="alert"
                className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive-light p-3 text-sm text-destructive-deep"
              >
                <WarningCircle className="mt-0.5 size-4 shrink-0" weight="fill" aria-hidden />
                <p>{error.mensaje}</p>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={onClose} disabled={guardando}>
                Cancelar
              </Button>
              <Button type="submit" disabled={guardando} aria-busy={guardando || undefined}>
                {guardando && <SpinnerIcon className="motion-safe:animate-spin" aria-hidden />}
                {guardando ? "Registrando…" : "Registrar pago"}
              </Button>
            </div>
          </form>
  );
}
