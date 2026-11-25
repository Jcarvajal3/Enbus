"use client";

import { ClockIcon, MapPinIcon, PhoneIcon } from "@phosphor-icons/react";
import { PerfilCompleto } from "@/components/pasajero/perfil-completo";
import { Button } from "@/components/ui/button";
import { formatTelefono } from "@/lib/ve";
import { formatCiudad } from "@/lib/ve.generated";
import s from "./enviar.module.css";
import type { ResultadoSucursales, Sucursal } from "./tipos";

interface Props {
  cooperativa: string;
  ciudad: string;
  /** null mientras carga. */
  resultado: ResultadoSucursales | null;
  sucursalId: string;
  onElegir(id: string): void;
  onReintentar(): void;
  perfilCompleto: boolean;
  cedula: string | null;
  telefono: string | null;
}

export function PasoSucursal({
  cooperativa,
  ciudad,
  resultado,
  sucursalId,
  onElegir,
  onReintentar,
  perfilCompleto,
  cedula,
  telefono,
}: Props) {
  return (
    <div className={s.pagina}>
      {!perfilCompleto && (
        <div className={s.tarjeta}>
          <PerfilCompleto cedulaInicial={cedula} telefonoInicial={telefono} contexto="envio" />
        </div>
      )}

      <section aria-labelledby="envio-donde-titulo" className={s.seccion}>
        <h2 id="envio-donde-titulo" className={s.subtitulo}>
          Dónde entregar tu paquete en {formatCiudad(ciudad)}
        </h2>
        <p className={s.apoyo}>
          Llévalo a una taquilla de {cooperativa}. Allí lo pesan, lo reciben y te confirman el costo final.
        </p>

        <div aria-live="polite" aria-busy={resultado === null || undefined}>
          {resultado === null ? (
            <div className={s.estado} role="status">
              Buscando las taquillas…
            </div>
          ) : !resultado.ok ? (
            <div className={s.estado} data-tono="error" role="alert">
              <p>{resultado.error}</p>
              <Button type="button" variant="outline" size="sm" onClick={onReintentar}>
                Reintentar
              </Button>
            </div>
          ) : resultado.sucursales.length === 0 ? (
            <p className={s.estado}>
              Pregunta en la taquilla de {cooperativa} en {formatCiudad(ciudad)}. Puedes continuar y registrar tu envío.
            </p>
          ) : (
            <div role="radiogroup" aria-labelledby="envio-donde-titulo" className={s.opciones}>
              {resultado.sucursales.map((suc) => (
                <TarjetaSucursal
                  key={suc.id}
                  sucursal={suc}
                  elegida={suc.id === sucursalId}
                  unica={resultado.sucursales.length === 1}
                  onElegir={onElegir}
                />
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function TarjetaSucursal({
  sucursal,
  elegida,
  unica,
  onElegir,
}: {
  sucursal: Sucursal;
  elegida: boolean;
  unica: boolean;
  onElegir(id: string): void;
}) {
  return (
    <label className={s.opcion} data-elegida={elegida || undefined}>
      <input
        type="radio"
        name="sucursal"
        value={sucursal.id}
        checked={elegida}
        onChange={() => onElegir(sucursal.id)}
        className={s.radio}
      />
      <span className={s.opcionCuerpo}>
        <span className={s.opcionNombre}>{sucursal.nombre}</span>
        {sucursal.direccion && (
          <span className={s.opcionMeta}>
            <MapPinIcon aria-hidden className={s.iconoMeta} />
            {sucursal.direccion}
          </span>
        )}
        {sucursal.horario && (
          <span className={s.opcionMeta}>
            <ClockIcon aria-hidden className={s.iconoMeta} />
            {sucursal.horario}
          </span>
        )}
        {sucursal.telefono && (
          <span className={s.opcionMeta}>
            <PhoneIcon aria-hidden className={s.iconoMeta} />
            {formatTelefono(sucursal.telefono) !== "—" ? formatTelefono(sucursal.telefono) : sucursal.telefono}
          </span>
        )}
        {unica && <span className={s.opcionMeta}>Es la única taquilla de la cooperativa en esta ciudad.</span>}
      </span>
    </label>
  );
}
