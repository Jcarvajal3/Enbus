"use client";

import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import { CheckCircleIcon, ClockIcon, CopyIcon, MapPinIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { qrEncomienda } from "@/lib/artefactos.generated";
import { avisarError, avisarExito } from "@/lib/avisos";
import { urlEncomienda } from "@/lib/pasajero/rutas";
import { formatCiudad } from "@/lib/ve.generated";
import s from "./enviar.module.css";
import type { EnvioRegistrado } from "./tipos";

export function PasoListo({ envio, onOtra }: { envio: EnvioRegistrado; onOtra(): void }) {
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
    <div className={s.pagina}>
      <section className={`${s.tarjeta} ${s.exito}`} aria-labelledby="envio-listo-titulo">
        <p className={s.exitoEtiqueta}>
          <CheckCircleIcon weight="fill" aria-hidden className="size-5" />
          <span id="envio-listo-titulo">
            Envío a {formatCiudad(envio.destino)} con {envio.cooperativa}
          </span>
        </p>
        {codigo ? (
          <>
            <p className={s.codigoEtiqueta}>Tu código de seguimiento</p>
            <p className={`${s.codigo} s-num`}>{codigo}</p>
            <Button type="button" variant="outline" onClick={copiar}>
              <CopyIcon aria-hidden />
              Copiar código
            </Button>
            <div className={s.qr}>
              <QRCodeSVG
                value={qrEncomienda({ tracking_id: envio.trackingId, id: envio.id })}
                size={176}
                level="M"
                bgColor="#FFFFFF"
                fgColor="#0F1B33"
                marginSize={2}
                title="Código QR de tu encomienda"
              />
            </div>
            <p className={s.apoyo}>Muestra este código o el QR en la taquilla al entregar tu paquete.</p>
          </>
        ) : (
          <p className={s.apoyo}>
            Tu envío quedó registrado. El código de seguimiento aparece en Mis encomiendas.
          </p>
        )}
      </section>

      <section className={s.tarjeta} aria-labelledby="envio-siguiente-titulo">
        <h2 id="envio-siguiente-titulo" className={s.subtitulo}>
          Qué sigue
        </h2>
        <ol className={s.pasos}>
          <li>
            <span>
              <strong>Lleva el paquete a la taquilla.</strong>
              {sucursal ? (
                <>
                  <span className={s.opcionMeta}>
                    <MapPinIcon aria-hidden className={s.iconoMeta} />
                    {sucursal.nombre}
                    {sucursal.direccion ? ` · ${sucursal.direccion}` : ""}
                  </span>
                  {sucursal.horario && (
                    <span className={s.opcionMeta}>
                      <ClockIcon aria-hidden className={s.iconoMeta} />
                      {sucursal.horario}
                    </span>
                  )}
                </>
              ) : (
                <span className={s.opcionMeta}>
                  Pregunta en la taquilla de {envio.cooperativa} en {formatCiudad(envio.origen)}.
                </span>
              )}
            </span>
          </li>
          <li>
            <span>
              <strong>La taquilla lo pesa y te confirma el costo.</strong>
              {envio.estimado && <span className={s.opcionMeta}>Estimado: {envio.estimado}</span>}
            </span>
          </li>
          <li>
            <span>
              {envio.modalidad === "ORIGEN" ? (
                <>
                  <strong>Paga cuando la taquilla lo confirme.</strong>
                  <span className={s.opcionMeta}>
                    En la taquilla, o en línea desde Mis encomiendas con Pago Móvil, transferencia o Zelle.
                  </span>
                </>
              ) : (
                <>
                  <strong>Quien recibe paga al retirar.</strong>
                  <span className={s.opcionMeta}>
                    El destinatario también puede seguir el envío con el código de seguimiento.
                  </span>
                </>
              )}
            </span>
          </li>
        </ol>
      </section>

      <div className={s.accionesFinal}>
        <Link href={urlEncomienda(envio.id)} className="s-boton s-boton--sol s-boton--lg">
          Ver en Mis encomiendas
        </Link>
        <button type="button" className="s-boton s-boton--claro s-boton--lg" onClick={onOtra}>
          Enviar otra
        </button>
      </div>
    </div>
  );
}
