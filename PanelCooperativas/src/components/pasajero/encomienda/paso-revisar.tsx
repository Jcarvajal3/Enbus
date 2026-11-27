"use client";

// ─── Paso 4: Revisa y registra ───────────────────────────────────────────────
// Una tarjeta con bloques divididos y "Editar" por bloque, como `BloqueResumen` del panel.

import type { ReactNode } from "react";
import { AvisoError } from "@/components/aviso-error";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/dinero";
import { formatPesoKg } from "@/lib/peso";
import { formatCedula, formatTelefono } from "@/lib/ve";
import { formatCiudad } from "@/lib/ve.generated";
import { MODALIDADES, type FotoElegida, type Remitente } from "./paso-detalles";
import type { ModalidadEnvio, PasoEnvio, Sucursal } from "./tipos";

interface Props {
  origen: string;
  destino: string;
  cooperativa: string;
  sucursal: Sucursal | null;
  remitente: Remitente;
  nombre: string;
  cedula: string;
  telefono: string;
  descripcion: string;
  pesoKg: number | null;
  valorUsd: number | null;
  foto: FotoElegida | null;
  modalidad: ModalidadEnvio;
  /** "Bs 12,00" ya formateado, o null si no hay estimado. */
  estimadoTexto: string | null;
  onEditar(paso: PasoEnvio): void;
  error: string | null;
}

/** Bloque del resumen con su botón "Editar" (sin `onEditar` no se puede cambiar aquí). */
function BloqueResumen({ titulo, onEditar, children }: { titulo: string; onEditar?: () => void; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 py-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[13px] text-muted-foreground">{titulo}</p>
        {onEditar && (
          <Button type="button" variant="link" size="sm" onClick={onEditar} aria-label={`Editar ${titulo.toLowerCase()}`}>
            Editar
          </Button>
        )}
      </div>
      {children}
    </div>
  );
}

export function PasoRevisar({
  origen,
  destino,
  cooperativa,
  sucursal,
  remitente,
  nombre,
  cedula,
  telefono,
  descripcion,
  pesoKg,
  valorUsd,
  foto,
  modalidad,
  estimadoTexto,
  onEditar,
  error,
}: Props) {
  const datosRemitente = [
    remitente.cedula ? `C.I. ${formatCedula(remitente.cedula)}` : null,
    remitente.telefono ? `Tel. ${formatTelefono(remitente.telefono)}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <AvisoError>
          <p className="font-medium">No pudimos registrar tu envío</p>
          <p>{error}</p>
        </AvisoError>
      )}
      <div className="flex flex-col divide-y divide-border rounded-xl bg-card px-5 shadow-card">
        <BloqueResumen titulo="Trayecto" onEditar={() => onEditar("destino")}>
          <p className="text-[17px] font-semibold">
            {formatCiudad(origen)} → {formatCiudad(destino)}
          </p>
          <p className="text-[13px] text-muted-foreground">{cooperativa}</p>
        </BloqueResumen>
        <BloqueResumen titulo="Entrega en" onEditar={() => onEditar("sucursal")}>
          <p className="text-[17px] font-semibold">{sucursal ? sucursal.nombre : `Taquilla de ${cooperativa}`}</p>
          <p className="text-[13px] text-muted-foreground">
            {sucursal
              ? [sucursal.direccion, sucursal.horario].filter(Boolean).join(" · ") || formatCiudad(origen)
              : `Pregunta en la taquilla de ${cooperativa} en ${formatCiudad(origen)}.`}
          </p>
        </BloqueResumen>
        <BloqueResumen titulo="Quien envía">
          <p className="text-[17px] font-semibold">{remitente.nombre || "Tu cuenta"}</p>
          {datosRemitente && <p className="text-[13px] text-muted-foreground">{datosRemitente}</p>}
        </BloqueResumen>
        <BloqueResumen titulo="Quien recibe" onEditar={() => onEditar("detalles")}>
          <p className="text-[17px] font-semibold">{nombre}</p>
          <p className="text-[13px] text-muted-foreground">
            {`C.I. ${formatCedula(cedula)} · Tel. ${formatTelefono(telefono)}`}
          </p>
          <p className="text-[13px] text-muted-foreground">Retira con su cédula y el PIN.</p>
        </BloqueResumen>
        <BloqueResumen titulo="Contenido" onEditar={() => onEditar("detalles")}>
          <p className="text-[17px] font-semibold">{descripcion}</p>
          <p className="text-[13px] text-muted-foreground">
            {[
              pesoKg !== null ? `${formatPesoKg(pesoKg)} kg` : "Peso sin indicar",
              valorUsd !== null ? `Valor ${formatMoney({ usd: valorUsd }).principal}` : null,
              estimadoTexto ? `Costo estimado ${estimadoTexto}` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
          {foto && (
            // Vista previa local (blob:): next/image no aplica.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={foto.url} alt="Foto del paquete" className="mt-2 size-24 rounded-md border border-border object-cover" />
          )}
        </BloqueResumen>
        <BloqueResumen titulo="¿Quién paga?" onEditar={() => onEditar("detalles")}>
          <p className="text-[17px] font-semibold">{MODALIDADES.find((m) => m.valor === modalidad)?.titulo}</p>
          <p className="text-[13px] text-muted-foreground">{MODALIDADES.find((m) => m.valor === modalidad)?.detalle}</p>
        </BloqueResumen>
      </div>
      <p className="text-[13px] text-muted-foreground">
        El costo final lo fija la taquilla al pesar el paquete: puede variar un poco del estimado.
      </p>
    </div>
  );
}
