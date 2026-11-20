"use client";

// ─── Encomienda registrada (fase de la página de nueva encomienda) ──────────
// PIN de retiro grande, costo del envío, "Enviar PIN por WhatsApp" e "Imprimir
// guía" (Bluetooth si hay impresora conectada; si no, la ventana de impresión del
// navegador). El título y el botón "Continuar" los pone la página.

import { useState } from "react";
import { Printer, WhatsappLogo } from "@phosphor-icons/react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Monto } from "@/components/monto";
import { avisarError, avisarExito, avisarInfo } from "@/lib/avisos";
import { formatCiudad } from "@/lib/ciudades";
import { formatCedula, telefonoWhatsApp } from "@/lib/ve";
import { printer } from "@/lib/printing/bluetooth";
import { MSG_VENTANA_BLOQUEADA, imprimirGuiaNavegador, printGuiaEncomienda } from "@/lib/printing/print-helpers";
import type { Encomienda, RegistroEncomiendaTaquilla } from "@/lib/types/encomiendas";

export function EncomiendaRegistrada({
  registro,
  encomienda,
  cooperativa,
}: {
  registro: RegistroEncomiendaTaquilla;
  encomienda: Encomienda;
  cooperativa: string;
}) {
  const [imprimiendo, setImprimiendo] = useState(false);
  const pin = registro.pin_retiro;
  const destinatario = encomienda.receiver_nombre;
  const wa = telefonoWhatsApp(encomienda.receiver_telefono);
  const ciudad = formatCiudad(encomienda.ciudad_destino);
  const mensaje =
    `Hola ${destinatario}, ${encomienda.remitente_nombre ? `${encomienda.remitente_nombre} te envió` : "te enviaron"} una encomienda` +
    `${cooperativa ? ` por ${cooperativa}` : ""} (${encomienda.tracking_id}) hacia ${ciudad}. ` +
    `Para retirarla presenta tu cédula ${formatCedula(encomienda.receiver_cedula_rif)} y este PIN: ${pin ?? "—"}.`;
  const enlaceWa = wa ? `https://wa.me/${wa}?text=${encodeURIComponent(mensaje)}` : null;
  const tasa =
    registro.tasa_bcv && registro.tasa_bcv_fecha ? { tasa: Number(registro.tasa_bcv), fecha: registro.tasa_bcv_fecha } : null;

  const imprimir = async () => {
    setImprimiendo(true);
    try {
      if (printer.isConnected) {
        await printGuiaEncomienda(encomienda, { pin, cooperativa });
        avisarExito("Guía enviada a la impresora.");
      } else if (!imprimirGuiaNavegador(encomienda, { pin, cooperativa })) {
        avisarError(MSG_VENTANA_BLOQUEADA);
      }
    } catch {
      // Sin Bluetooth, se imprime desde el navegador.
      if (!imprimirGuiaNavegador(encomienda, { pin, cooperativa })) {
        avisarError(MSG_VENTANA_BLOQUEADA);
      } else {
        avisarInfo("No pudimos imprimir por Bluetooth. Abrimos la impresión del navegador.");
      }
    } finally {
      setImprimiendo(false);
    }
  };

  return (
    <div className="grid gap-4">
      <div className="flex flex-col gap-1 rounded-xl bg-primary-light p-6">
        <p className="text-[13px] font-medium text-foreground">PIN de retiro</p>
        <p
          aria-label={pin ? `PIN de retiro ${pin.split("").join(" ")}` : "Sin PIN"}
          className="font-mono text-5xl font-semibold tracking-widest text-foreground tabular-nums max-md:text-center max-md:text-[clamp(2.5rem,16vw,3.5rem)]"
        >
          {pin ?? "—"}
        </p>
        <p className="text-[15px] text-foreground">
          {pin
            ? "Dáselo a quien envía. Sin el PIN y la cédula no se entrega."
            : "Por seguridad, el PIN no se conserva al recargar la página. Si no lo entregaste, quien envía lo ve en su encomienda en la app."}
        </p>
      </div>

      <div className="flex items-center justify-between gap-3 rounded-xl bg-surface p-5 text-[15px]">
        <span className="text-muted-foreground">Costo del envío</span>
        <Monto
          usd={registro.costo_usd != null ? Number(registro.costo_usd) : null}
          bs={registro.costo_bs != null ? Number(registro.costo_bs) : null}
          tasa={tasa}
          align="right"
        />
      </div>

      <div className="flex flex-col gap-3 md:flex-row md:flex-wrap max-md:*:w-full">
        {!pin ? null : enlaceWa ? (
          <a href={enlaceWa} target="_blank" rel="noreferrer" className={buttonVariants({ variant: "outline", size: "lg" })}>
            <WhatsappLogo aria-hidden />
            Enviar PIN por WhatsApp
          </a>
        ) : (
          <p className="text-[13px] text-muted-foreground">El teléfono no sirve para WhatsApp: dicta el PIN a quien envía.</p>
        )}
        <Button variant="outline" size="lg" onClick={() => void imprimir()} disabled={imprimiendo} aria-busy={imprimiendo || undefined}>
          {imprimiendo ? <Spinner size="sm" /> : <Printer aria-hidden />}
          Imprimir guía
        </Button>
      </div>
    </div>
  );
}
