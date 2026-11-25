"use client";

import type { ReactNode } from "react";
import { WarningCircleIcon } from "@phosphor-icons/react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { formatPesoKg } from "@/lib/peso";
import { formatCedula, formatTelefono } from "@/lib/ve";
import { formatCiudad } from "@/lib/ve.generated";
import { formatUsd } from "@/lib/dinero";
import s from "./enviar.module.css";
import type { FotoElegida } from "./paso-destinatario";
import type { ModalidadEnvio, PasoEnvio, Sucursal } from "./tipos";

interface Props {
  origen: string;
  destino: string;
  cooperativa: string;
  sucursal: Sucursal | null;
  nombre: string;
  cedula: string;
  telefono: string;
  descripcion: string;
  pesoKg: number | null;
  valorUsd: number | null;
  foto: FotoElegida | null;
  modalidad: ModalidadEnvio;
  /** "Bs 12,00 ≈ USD 0,30", o null si no se escribió peso. */
  estimado: { principal: string; secundario: string | null } | null;
  onEditar(paso: PasoEnvio): void;
  error: string | null;
  deshabilitado: boolean;
}

function Seccion({
  titulo,
  editar,
  etiquetaEditar,
  children,
}: {
  titulo: string;
  editar: () => void;
  etiquetaEditar: string;
  children: ReactNode;
}) {
  return (
    <section className={s.tarjeta}>
      <div className={s.seccionCabeza}>
        <h2 className={s.subtitulo}>{titulo}</h2>
        <Button type="button" variant="ghost" size="sm" onClick={editar} aria-label={etiquetaEditar}>
          Editar
        </Button>
      </div>
      <dl className={s.resumen}>{children}</dl>
    </section>
  );
}

function Dato({ etiqueta, children }: { etiqueta: string; children: ReactNode }) {
  return (
    <div className={s.dato}>
      <dt>{etiqueta}</dt>
      <dd>{children}</dd>
    </div>
  );
}

export function PasoRevisar({
  origen,
  destino,
  cooperativa,
  sucursal,
  nombre,
  cedula,
  telefono,
  descripcion,
  pesoKg,
  valorUsd,
  foto,
  modalidad,
  estimado,
  onEditar,
  error,
  deshabilitado,
}: Props) {
  return (
    <div className={s.pagina} aria-busy={deshabilitado || undefined}>
      {error && (
        <Alert variant="destructive">
          <WarningCircleIcon weight="fill" aria-hidden />
          <AlertTitle>No pudimos registrar tu envío</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Seccion titulo="Ruta" editar={() => onEditar("ruta")} etiquetaEditar="Editar la ruta y la cooperativa">
        <Dato etiqueta="Trayecto">
          {formatCiudad(origen)} → {formatCiudad(destino)}
        </Dato>
        <Dato etiqueta="Cooperativa">{cooperativa}</Dato>
        {estimado && (
          <Dato etiqueta="Costo estimado">
            <span className="s-num">
              <strong>{estimado.principal}</strong>
              {estimado.secundario && <span className={s.precioSecundario}> {estimado.secundario}</span>}
            </span>
            <span className={s.opcionMeta}>Lo confirma la taquilla al pesar el paquete.</span>
          </Dato>
        )}
      </Seccion>

      <Seccion titulo="Entrega" editar={() => onEditar("sucursal")} etiquetaEditar="Editar la taquilla de entrega">
        {sucursal ? (
          <>
            <Dato etiqueta="Taquilla">{sucursal.nombre}</Dato>
            {sucursal.direccion && <Dato etiqueta="Dirección">{sucursal.direccion}</Dato>}
            {sucursal.horario && <Dato etiqueta="Horario">{sucursal.horario}</Dato>}
          </>
        ) : (
          <Dato etiqueta="Taquilla">Pregunta en la taquilla de {cooperativa}</Dato>
        )}
      </Seccion>

      <Seccion titulo="Quién recibe" editar={() => onEditar("destinatario")} etiquetaEditar="Editar los datos de quien recibe">
        <Dato etiqueta="Nombre">{nombre}</Dato>
        <Dato etiqueta="Cédula o RIF">
          <span className="s-num">{formatCedula(cedula)}</span>
        </Dato>
        <Dato etiqueta="Teléfono">
          <span className="s-num">{formatTelefono(telefono)}</span>
        </Dato>
      </Seccion>

      <Seccion titulo="Contenido y pago" editar={() => onEditar("destinatario")} etiquetaEditar="Editar el contenido y el pago">
        <Dato etiqueta="Contenido">{descripcion}</Dato>
        {pesoKg !== null && (
          <Dato etiqueta="Peso aproximado">
            <span className="s-num">{formatPesoKg(pesoKg)} kg</span>
          </Dato>
        )}
        {valorUsd !== null && (
          <Dato etiqueta="Valor declarado">
            <span className="s-num">{formatUsd(valorUsd)}</span>
          </Dato>
        )}
        <Dato etiqueta="Quién paga">
          {modalidad === "ORIGEN" ? "Pago yo, al entregar el paquete" : "Paga quien recibe, al retirarlo"}
        </Dato>
        {foto && (
          <Dato etiqueta="Foto">
            {/* Vista previa local (blob:): next/image no aplica. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={foto.url} alt="Foto del paquete" className={s.fotoMiniatura} />
          </Dato>
        )}
      </Seccion>
    </div>
  );
}
