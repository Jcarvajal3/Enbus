"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { XCircle } from "@phosphor-icons/react";
import { AvisoError } from "@/components/aviso-error";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { AvisoTasaCambio, PagoPasajero } from "@/components/pasajero/pago";
import type { MetodoPagoPasajero } from "@/lib/pasajero/pagos-comun";
import { avisarError, avisarExito } from "@/lib/avisos";
import { cancelarEnvio, pagarEnvio } from "@/app/(sitio)/cuenta/encomiendas/acciones";
import { useReportePago, type TasaPago } from "./usar-pago";
import detalle from "./detalle.module.css";

/** Formulario para pagar el envío. `opcional`: paga quien recibe y el remitente decide si lo paga él. */
export function PagarEnvio({
  encomiendaId,
  metodos,
  totalUsd,
  tasa: tasaInicial,
  opcional,
}: {
  encomiendaId: string;
  metodos: MetodoPagoPasajero[];
  totalUsd: number;
  tasa: TasaPago | null;
  opcional: boolean;
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(!opcional);
  const pago = useReportePago({
    tasaInicial,
    enviar: (entrada) => pagarEnvio({ ...entrada, encomiendaId }),
    onListo: (repetido) => {
      avisarExito(
        repetido
          ? "Ya habíamos registrado este pago. La cooperativa lo está revisando."
          : "Registramos tu pago. La cooperativa lo revisará y te avisaremos."
      );
      setAbierto(!opcional);
      router.refresh();
    },
    onDesactualizado: (mensaje) => {
      avisarError(mensaje);
      router.refresh();
    },
  });

  if (!abierto) {
    return (
      <Button variant="outline" size="lg" onClick={() => setAbierto(true)}>
        Prefiero pagarlo yo
      </Button>
    );
  }

  return (
    <div className={detalle.pagoCaja}>
      {pago.aviso && (
        <AvisoTasaCambio
          totalBs={pago.aviso.totalBs}
          totalUsd={pago.aviso.totalUsd}
          tasa={pago.aviso.tasa}
          tasaFecha={pago.aviso.tasaFecha}
          onConfirmar={pago.confirmarTasa}
          onCancelar={pago.descartarAviso}
        />
      )}
      <PagoPasajero
        metodos={metodos}
        totalUsd={totalUsd}
        tasa={pago.tasa}
        totalBs={pago.totalBs}
        enviando={pago.enviando}
        error={pago.aviso ? null : pago.error}
        onEnviar={pago.aviso ? () => undefined : pago.enviarDatos}
      />
      {opcional && (
        <Button variant="ghost" onClick={() => setAbierto(false)} disabled={pago.enviando}>
          Paga quien recibe
        </Button>
      )}
    </div>
  );
}

/** Cancelar un envío que aún no llegó a la taquilla. */
export function CancelarEnvio({ encomiendaId }: { encomiendaId: string }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enviando, empezar] = useTransition();

  const confirmar = () => {
    if (enviando) return;
    setError(null);
    empezar(async () => {
      try {
        const r = await cancelarEnvio({ encomiendaId });
        if (!r.success) {
          if (r.codigo === "EB_ESTADO_CAMBIO") {
            avisarError(r.error);
            setAbierto(false);
            router.refresh();
            return;
          }
          setError(r.error);
          return;
        }
        avisarExito("Cancelamos tu envío.");
        setAbierto(false);
        router.refresh();
      } catch {
        setError("No pudimos cancelar el envío. Revisa tu conexión e intenta de nuevo.");
      }
    });
  };

  return (
    <>
      <div className={detalle.acciones} data-no-imprimir>
        <Button variant="outline" size="lg" onClick={() => setAbierto(true)}>
          <XCircle aria-hidden />
          Cancelar envío
        </Button>
      </div>
      <Dialog open={abierto} onOpenChange={(a) => !enviando && setAbierto(a)}>
        <DialogContent tamano="confirmar">
          <DialogHeader>
            <DialogTitle>¿Cancelar este envío?</DialogTitle>
            <DialogDescription>El código QR dejará de servir en la taquilla.</DialogDescription>
          </DialogHeader>
          {error && <AvisoError>{error}</AvisoError>}
          <DialogFooter>
            <Button size="lg" variant="outline" onClick={() => setAbierto(false)} disabled={enviando}>
              No cancelar
            </Button>
            <Button size="lg" variant="destructive" onClick={confirmar} disabled={enviando} aria-busy={enviando || undefined}>
              {enviando && <Spinner size="sm" aria-hidden />}
              Cancelar envío
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
