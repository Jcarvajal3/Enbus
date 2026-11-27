"use client";

// ─── Encomienda registrada ───────────────────────────────────────────────────
// Misma estructura que `EncomiendaRegistrada` del panel: el código en una tarjeta destacada, el
// costo estimado en una fila y debajo lo que sigue. El título y los botones los pone la página.

import type { ReactNode } from "react";
import { QRCodeSVG } from "qrcode.react";
import { ClockIcon, CopyIcon, MapPinIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { qrEncomienda } from "@/lib/artefactos.generated";
import { avisarError, avisarExito } from "@/lib/avisos";
import { formatCiudad } from "@/lib/ve.generated";
import type { EnvioRegistrado } from "./tipos";

export function PasoListo({ envio }: { envio: EnvioRegistrado }) {
  const codigo = envio.trackingId ?? "";
  const { sucursal } = envio;

  const copiar = async () => {
    if (!codigo) return;
    try {
      await navigator.clipboard.writeText(codigo);
      avisarExito("Código copiado.");
    } catch {
      avisarError("No pudimos copiar el código. Selecciónalo y cópialo a mano.");
    }
  };

  return (
    <div className="grid gap-4">
      <div className="flex flex-col gap-1 rounded-xl bg-primary-light p-6">
        <p className="text-[13px] font-medium text-foreground">
          Envío a {formatCiudad(envio.destino)} con {envio.cooperativa}
        </p>
        {codigo ? (
          <>
            <p
              aria-label={`Código de seguimiento ${codigo}`}
              className="font-mono text-3xl font-semibold tracking-wider break-all text-foreground tabular-nums select-all md:text-4xl"
            >
              {codigo}
            </p>
            <p className="text-[15px] text-foreground">
              Muestra este código o el QR en la taquilla al entregar tu paquete.
            </p>
            <div className="mt-3 flex flex-col items-start gap-4 md:flex-row md:items-center">
              <div className="rounded-md bg-white p-3">
                <QRCodeSVG
                  value={qrEncomienda({ tracking_id: envio.trackingId, id: envio.id })}
                  size={160}
                  level="M"
                  bgColor="#FFFFFF"
                  fgColor="#0F1B33"
                  marginSize={2}
                  title="Código QR de tu encomienda"
                />
              </div>
              <Button type="button" variant="outline" size="lg" onClick={copiar} className="max-md:w-full">
                <CopyIcon aria-hidden />
                Copiar código
              </Button>
            </div>
          </>
        ) : (
          <p className="text-[15px] text-foreground">
            Tu envío quedó registrado. El código de seguimiento aparece en Mis encomiendas.
          </p>
        )}
      </div>

      {envio.estimado && (
        <div className="flex items-center justify-between gap-3 rounded-xl bg-surface p-5 text-[15px]">
          <span className="text-muted-foreground">Costo estimado</span>
          <span className="font-semibold tabular-nums">{envio.estimado}</span>
        </div>
      )}

      <section aria-labelledby="envio-siguiente-titulo" className="flex flex-col gap-3 rounded-xl bg-card p-5 shadow-card">
        <h2 id="envio-siguiente-titulo" className="text-[17px] font-semibold">
          Qué sigue
        </h2>
        <ol className="flex flex-col gap-4">
          <Paso numero={1}>
            <strong className="text-[15px] font-semibold">Lleva el paquete a la taquilla.</strong>
            {sucursal ? (
              <>
                <Meta icono={<MapPinIcon aria-hidden className="size-4 shrink-0" />}>
                  {sucursal.nombre}
                  {sucursal.direccion ? ` · ${sucursal.direccion}` : ""}
                </Meta>
                {sucursal.horario && <Meta icono={<ClockIcon aria-hidden className="size-4 shrink-0" />}>{sucursal.horario}</Meta>}
              </>
            ) : (
              <Meta>
                Pregunta en la taquilla de {envio.cooperativa} en {formatCiudad(envio.origen)}.
              </Meta>
            )}
          </Paso>
          <Paso numero={2}>
            <strong className="text-[15px] font-semibold">La taquilla lo pesa y te confirma el costo.</strong>
            <Meta>El costo final lo fija la taquilla al pesar el paquete.</Meta>
          </Paso>
          <Paso numero={3}>
            {envio.modalidad === "ORIGEN" ? (
              <>
                <strong className="text-[15px] font-semibold">Paga cuando la taquilla lo confirme.</strong>
                <Meta>En la taquilla, o en línea desde Mis encomiendas con Pago Móvil, transferencia o Zelle.</Meta>
              </>
            ) : (
              <>
                <strong className="text-[15px] font-semibold">Quien recibe paga al retirar.</strong>
                <Meta>Quien recibe también puede seguir el envío con el código de seguimiento.</Meta>
              </>
            )}
          </Paso>
        </ol>
      </section>
    </div>
  );
}

function Paso({ numero, children }: { numero: number; children: ReactNode }) {
  return (
    <li className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-3.5">
      <span
        aria-hidden
        className="grid size-7 place-content-center rounded-full bg-primary text-[13px] font-semibold text-primary-foreground"
      >
        {numero}
      </span>
      <span className="flex flex-col gap-1">{children}</span>
    </li>
  );
}

function Meta({ icono, children }: { icono?: ReactNode; children: ReactNode }) {
  return (
    <span className="flex items-start gap-1.5 text-[13px] text-muted-foreground">
      {icono}
      <span className="min-w-0">{children}</span>
    </span>
  );
}
