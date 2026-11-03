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
import type { ComisionCiclo } from "@/lib/types/admin-comisiones";

/** "Registrar pago" de un ciclo: fecha en que pagó la cooperativa y referencia. */
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
  const [referencia, setReferencia] = useState("");
  const [error, setError] = useState<string | null>(null);
  const enCurso = useRef(false);

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (enCurso.current) return;
    if (!fecha || fecha > hoyVE()) {
      setError("Elige la fecha en que la cooperativa pagó (no puede ser futura).");
      return;
    }
    if (referencia.trim().length < 4) {
      setError("Escribe la referencia del pago (mínimo 4 caracteres).");
      return;
    }
    enCurso.current = true;
    setGuardando(true);
    setError(null);
    try {
      const res = await marcarCicloComoPagado(ciclo.id, { fecha, referencia: referencia.trim() });
      if (!res.success) {
        setError(res.error || "No pudimos registrar el pago. Intenta de nuevo.");
        return;
      }
      if (res.aviso) toast.warning(res.aviso, { duration: 12000 });
      else toast.success(`Pago de ${ciclo.cooperativa_nombre} registrado.`);
      onClose();
      router.refresh();
    } catch (err) {
      setError(humanizeError(err, "registrar el pago"));
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
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor={`${uid}-referencia`}>Referencia del pago</Label>
              <Input
                id={`${uid}-referencia`}
                value={referencia}
                autoFocus
                autoComplete="off"
                placeholder="Por ejemplo: 00123456"
                onChange={(e) => {
                  setReferencia(e.target.value);
                  if (error) setError(null);
                }}
                disabled={guardando}
                required
              />
              <p className="text-xs text-muted-foreground">Número de la transferencia o Pago Móvil con que pagó la cooperativa.</p>
            </div>

            {error && (
              <div
                role="alert"
                className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive-text"
              >
                <WarningCircle className="mt-0.5 size-4 shrink-0" weight="fill" aria-hidden />
                <p>{error}</p>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={onClose} disabled={guardando}>
                Cancelar
              </Button>
              <Button type="submit" disabled={guardando} aria-busy={guardando || undefined}>
                {guardando && <SpinnerIcon className="animate-spin" aria-hidden />}
                {guardando ? "Registrando…" : "Registrar pago"}
              </Button>
            </div>
          </form>
  );
}
