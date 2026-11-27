"use client";

// ─── Paso 1: ¿A dónde la envías? ─────────────────────────────────────────────
// Paralelo a `PasoDestino` del panel: origen y destino (mismos selectores de ciudad y botón de
// intercambio que la portada) y, debajo, las cooperativas que llevan encomiendas por esa ruta con
// su "Desde Bs X (1 kg)". El peso ya no se pide aquí: se escribe en "Detalles de la encomienda".

import { ArrowsDownUpIcon, ArrowsLeftRightIcon, FlagIcon, MapPinIcon, WarningCircleIcon } from "@phosphor-icons/react";
import b from "@/components/pasajero/busqueda/buscador.module.css";
import { ComboCiudad } from "@/components/pasajero/busqueda/combo-ciudad";
import { GrupoOpciones, OpcionTile } from "@/components/opcion-tile";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { formatMoney, formatNumeroVE } from "@/lib/dinero";
import { formatPesoKg } from "@/lib/peso";
import { RUTAS_PASAJERO } from "@/lib/pasajero/rutas";
import { formatCiudad, formatDuracion } from "@/lib/ve.generated";
import type { Cotizacion, OpcionEnvio, RutasEnvio } from "./tipos";

export interface ErroresDestino {
  origen?: string;
  destino?: string;
}

interface Props {
  rutas: RutasEnvio;
  origen: string;
  destino: string;
  onCambiar(cambio: { origen?: string; destino?: string }): void;
  errores: ErroresDestino;
  cotizacion: Cotizacion | null;
  cotizando: boolean;
  onReintentar(): void;
  cooperativaId: string;
  onElegir(id: string): void;
  /** La cuenta es del panel de cooperativas: no puede registrar envíos aquí. */
  avisoStaff: boolean;
}

/** Monto principal y secundario de una opción (Bs como principal, USD y tasa debajo). */
export function montoOpcion(o: OpcionEnvio, tasa: number | null, fecha: string | null) {
  return formatMoney({ usd: o.costoUsd, bs: o.costoBs, tasa: tasa && fecha ? { tasa, fecha } : null });
}

/** "Máximo 25 kg y 80 × 80 × 80 cm", con lo que se conozca. */
export function limitesOpcion(o: OpcionEnvio): string | null {
  const partes: string[] = [];
  if (o.pesoMaxKg && o.pesoMaxKg > 0) partes.push(`${formatPesoKg(o.pesoMaxKg)} kg`);
  if (o.dimensionesMaxCm && o.dimensionesMaxCm > 0) {
    partes.push(`${o.dimensionesMaxCm} × ${o.dimensionesMaxCm} × ${o.dimensionesMaxCm} cm`);
  }
  return partes.length ? `Máximo ${partes.join(" y ")}` : null;
}

const CLASE_AVISO = "rounded-md bg-surface p-4 text-[15px] text-muted-foreground";

export function PasoDestino({
  rutas,
  origen,
  destino,
  onCambiar,
  errores,
  cotizacion,
  cotizando,
  onReintentar,
  cooperativaId,
  onElegir,
  avisoStaff,
}: Props) {
  const destinos = rutas.destinosPorOrigen[origen] ?? [];
  const puedeInvertir = Boolean(origen && destino && rutas.destinosPorOrigen[destino]?.some((c) => c.ciudad === origen));
  const sinRutas = rutas.origenes.length === 0;

  return (
    <div className="flex flex-col gap-6">
      {sinRutas && (
        <Alert variant="warning">
          <WarningCircleIcon weight="fill" aria-hidden />
          <AlertDescription>
            Por ahora no pudimos cargar las rutas con envío de encomiendas. Intenta de nuevo en unos minutos.
          </AlertDescription>
        </Alert>
      )}

      {/* Mismo selector de ciudad y botón de intercambio que el buscador de la portada. */}
      <div className="rounded-xl bg-card p-5 shadow-card">
        <div className={b.ruta}>
          <ComboCiudad
            id="envio-origen"
            label="Origen"
            value={origen}
            onChange={(clave) => onCambiar({ origen: clave })}
            opciones={rutas.origenes.map((c) => c.ciudad).filter((c) => c !== destino)}
            placeholder="¿Desde dónde la envías?"
            icono={<MapPinIcon />}
            error={errores.origen}
            sinResultados="Todavía no enviamos desde esa ciudad."
          />
          <button
            type="button"
            className={b.intercambiar}
            onClick={() => onCambiar({ origen: destino, destino: origen })}
            aria-label="Intercambiar origen y destino"
            disabled={!puedeInvertir}
          >
            <ArrowsLeftRightIcon className={b.iconoH} aria-hidden />
            <ArrowsDownUpIcon className={b.iconoV} aria-hidden />
          </button>
          <ComboCiudad
            id="envio-destino"
            label="Destino"
            value={destino}
            onChange={(clave) => onCambiar({ destino: clave })}
            opciones={destinos.map((c) => c.ciudad).filter((c) => c !== origen)}
            placeholder={origen ? "¿A dónde va?" : "Elige primero el origen"}
            icono={<FlagIcon />}
            error={errores.destino}
            sinResultados="No enviamos hacia esa ciudad desde el origen elegido."
          />
        </div>
      </div>

      <div aria-live="polite" aria-busy={cotizando || undefined} className="flex flex-col gap-3">
        {cotizando ? (
          <p className={CLASE_AVISO} role="status">
            Buscando cooperativas…
          </p>
        ) : cotizacion ? (
          <Cooperativas
            cotizacion={cotizacion}
            origen={origen}
            destino={destino}
            cooperativaId={cooperativaId}
            onElegir={onElegir}
            onReintentar={onReintentar}
          />
        ) : (
          <p className={CLASE_AVISO}>Elige el origen y el destino para ver qué cooperativas llevan tu paquete.</p>
        )}
      </div>

      {avisoStaff && (
        <Alert variant="warning">
          <WarningCircleIcon weight="fill" aria-hidden />
          <AlertDescription>
            Esta cuenta es del panel de cooperativas. Para enviar una encomienda entra con una cuenta de pasajero.{" "}
            <a className="font-medium text-info-text underline underline-offset-4" href={`${RUTAS_PASAJERO.ingresar}?motivo=cuenta-panel`}>
              Cambiar de cuenta
            </a>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}

function Cooperativas({
  cotizacion,
  origen,
  destino,
  cooperativaId,
  onElegir,
  onReintentar,
}: {
  cotizacion: Cotizacion;
  origen: string;
  destino: string;
  cooperativaId: string;
  onElegir(id: string): void;
  onReintentar(): void;
}) {
  if (cotizacion.tipo === "limite") {
    return (
      <p className={CLASE_AVISO} role="status">
        Hiciste muchas consultas seguidas. Intenta de nuevo en {cotizacion.espera}.
      </p>
    );
  }
  if (cotizacion.tipo === "no_disponible" || cotizacion.tipo === "error") {
    return (
      <div className={`${CLASE_AVISO} flex flex-col items-start gap-3`}>
        <p>No pudimos calcular el costo en este momento.</p>
        <Button type="button" variant="outline" size="sm" onClick={onReintentar}>
          Reintentar
        </Button>
      </div>
    );
  }
  // El mensaje de un dato inválido ya se ve bajo su campo.
  if (cotizacion.tipo === "invalido") return null;
  if (cotizacion.tipo === "sin_opciones") {
    return (
      <p className={CLASE_AVISO}>
        Ninguna cooperativa lleva encomiendas de {formatCiudad(origen)} a {formatCiudad(destino)}. Prueba con otra ruta.
      </p>
    );
  }

  const { opciones, tasa, tasaFecha } = cotizacion;
  return (
    <>
      <p className="text-[15px] font-medium">
        {opciones.length === 1 ? "1 cooperativa lleva" : `${opciones.length} cooperativas llevan`} tu paquete
      </p>
      <GrupoOpciones etiqueta="Cooperativa" className="grid gap-2 md:grid-cols-2">
        {opciones.map((o) => {
          const monto = montoOpcion(o, tasa, tasaFecha);
          const limites = limitesOpcion(o);
          const extras = [
            o.calificacion !== null && o.calificacion > 0 ? `Calificación ${formatNumeroVE(o.calificacion, 1)}` : null,
            o.duracionMin !== null && o.duracionMin > 0 ? `Viaje de unas ${formatDuracion(o.duracionMin)}` : null,
          ].filter(Boolean);
          return (
            <OpcionTile
              key={o.cooperativaId}
              seleccionado={o.cooperativaId === cooperativaId}
              onSelect={() => onElegir(o.cooperativaId)}
              titulo={o.cooperativa}
              detalle={
                <>
                  Desde {monto.principal} (1 kg)
                  {limites && (
                    <>
                      <br />
                      {limites}
                    </>
                  )}
                  {extras.length > 0 && (
                    <>
                      <br />
                      {extras.join(" · ")}
                    </>
                  )}
                </>
              }
            />
          );
        })}
      </GrupoOpciones>
      <p className="text-[13px] text-muted-foreground">
        El costo final depende del peso: lo calculas en el paso de detalles y la taquilla lo confirma al pesar el paquete.
      </p>
    </>
  );
}
