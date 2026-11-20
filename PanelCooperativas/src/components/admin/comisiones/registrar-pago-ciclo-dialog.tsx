"use client";

import { useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Campo, FechaField } from "@/components/campos";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AvisoError } from "@/components/aviso-error";
import { Monto } from "@/components/monto";
import { marcarCicloComoPagado } from "@/app/admin/(panel)/comisiones/actions";
import { humanizeError } from "@/lib/errores";
import { avisarExito } from "@/lib/avisos";
import { formatFechaVE, hoyVE } from "@/lib/fechas";
import { etiquetaMetodoPago } from "@/lib/estados";
import type { TasaBCV } from "@/lib/types/pagos";
import { METODOS_PAGO_COMISION, type ComisionCiclo, type MetodoPagoComision } from "@/lib/types/admin-comisiones";

type CampoError = "fecha" | "metodo" | "referencia";

/** "Registrar pago" de un ciclo: método, referencia (salvo efectivo) y fecha en que pagó la cooperativa. */
export function RegistrarPagoCicloDialog({
  ciclo,
  tasa,
  onClose,
}: {
  ciclo: ComisionCiclo | null;
  tasa?: TasaBCV | null;
  onClose: () => void;
}) {
  const [guardando, setGuardando] = useState(false);
  return (
    <Dialog open={ciclo !== null} onOpenChange={(v) => !v && !guardando && onClose()}>
      <DialogContent>
        {/* key: cada ciclo empieza con el formulario limpio. */}
        {ciclo && (
          <Formulario
            key={ciclo.id}
            ciclo={ciclo}
            tasa={tasa ?? null}
            onClose={onClose}
            guardando={guardando}
            setGuardando={setGuardando}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function Formulario({
  ciclo,
  tasa,
  onClose,
  guardando,
  setGuardando,
}: {
  ciclo: ComisionCiclo;
  tasa: TasaBCV | null;
  onClose: () => void;
  guardando: boolean;
  setGuardando: (v: boolean) => void;
}) {
  const router = useRouter();
  const uid = useId();
  const [fecha, setFecha] = useState(hoyVE());
  const [metodo, setMetodo] = useState<MetodoPagoComision | "">("");
  const [referencia, setReferencia] = useState("");
  const [errorCampo, setErrorCampo] = useState<{ campo: CampoError; mensaje: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const conReferencia = metodo !== "EFECTIVO";
  const enCurso = useRef(false);

  const limpiar = () => {
    setErrorCampo(null);
    setError(null);
  };

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (enCurso.current) return;
    if (!metodo) {
      setErrorCampo({ campo: "metodo", mensaje: "Elige cómo pagó la cooperativa." });
      document.getElementById(`${uid}-metodo`)?.focus();
      return;
    }
    if (conReferencia && referencia.trim().length < 4) {
      setErrorCampo({ campo: "referencia", mensaje: "Escribe la referencia del pago (mínimo 4 caracteres)." });
      document.getElementById(`${uid}-referencia`)?.focus();
      return;
    }
    if (!fecha || fecha > hoyVE()) {
      setErrorCampo({ campo: "fecha", mensaje: "Elige la fecha en que pagó (no puede ser futura)." });
      document.getElementById(`${uid}-fecha`)?.focus();
      return;
    }
    enCurso.current = true;
    setGuardando(true);
    limpiar();
    try {
      const res = await marcarCicloComoPagado(ciclo.id, {
        fecha,
        metodo,
        referencia: conReferencia ? referencia.trim() : null,
      });
      if (!res.success) {
        const mensaje = res.error || "No pudimos registrar el pago. Intenta de nuevo.";
        if (res.campo) setErrorCampo({ campo: res.campo, mensaje });
        else setError(mensaje);
        return;
      }
      avisarExito(`Pago de ${ciclo.cooperativa_nombre} registrado.`);
      onClose();
      router.refresh();
    } catch (err) {
      setError(humanizeError(err, "registrar el pago"));
    } finally {
      enCurso.current = false;
      setGuardando(false);
    }
  };

  const errorDe = (campo: CampoError) => (errorCampo?.campo === campo ? errorCampo.mensaje : null);

  return (
    <form onSubmit={enviar} noValidate className="flex flex-col gap-6">
      <DialogHeader>
        <DialogTitle>Registrar pago</DialogTitle>
        <DialogDescription>
          {ciclo.cooperativa_nombre} · del {formatFechaVE(ciclo.periodo_inicio)} al {formatFechaVE(ciclo.periodo_fin)}
        </DialogDescription>
      </DialogHeader>

      <div className="flex items-start justify-between gap-4 rounded-md bg-surface p-4">
        <span className="text-[15px] text-muted-foreground">Comisión del ciclo</span>
        <Monto usd={ciclo.monto_comision} tasa={tasa} moneda="USD" size="md" align="right" />
      </div>

      <FieldGroup className="gap-5">
        <Field data-invalid={errorDe("metodo") ? true : undefined}>
          <FieldLabel htmlFor={`${uid}-metodo`}>Método</FieldLabel>
          <Select
            value={metodo || null}
            onValueChange={(v) => {
              setMetodo((v ?? "") as MetodoPagoComision | "");
              limpiar();
            }}
            items={Object.fromEntries(METODOS_PAGO_COMISION.map((m) => [m, etiquetaMetodoPago(m)]))}
            disabled={guardando}
          >
            <SelectTrigger
              id={`${uid}-metodo`}
              className="w-full"
              aria-invalid={errorDe("metodo") ? true : undefined}
              aria-describedby={errorDe("metodo") ? `${uid}-metodo-error` : undefined}
            >
              <SelectValue placeholder="Elige el método" />
            </SelectTrigger>
            <SelectContent>
              {METODOS_PAGO_COMISION.map((m) => (
                <SelectItem key={m} value={m}>
                  {etiquetaMetodoPago(m)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errorDe("metodo") && <FieldError id={`${uid}-metodo-error`}>{errorDe("metodo")}</FieldError>}
        </Field>

        {conReferencia && (
          <Campo
            id={`${uid}-referencia`}
            label="Referencia"
            value={referencia}
            placeholder="Ej. 00123456"
            inputMode="numeric"
            maxLength={40}
            enterKeyHint="next"
            onChange={(v) => {
              setReferencia(v);
              limpiar();
            }}
            disabled={guardando}
            error={errorDe("referencia")}
            ayuda="Número de la operación con que pagó."
          />
        )}

        <FechaField
          id={`${uid}-fecha`}
          label="Fecha del pago"
          value={fecha}
          max={hoyVE()}
          onChange={(v) => {
            setFecha(v);
            limpiar();
          }}
          disabled={guardando}
          error={errorDe("fecha")}
        />
      </FieldGroup>

      {error && <AvisoError>{error}</AvisoError>}

      <DialogFooter>
        <Button size="lg" type="button" variant="outline" onClick={onClose} disabled={guardando}>
          Cancelar
        </Button>
        <Button size="lg" type="submit" disabled={guardando} aria-busy={guardando || undefined}>
          {guardando && <Spinner size="sm" aria-hidden />}
          {guardando ? "Registrando…" : "Registrar pago"}
        </Button>
      </DialogFooter>
    </form>
  );
}
