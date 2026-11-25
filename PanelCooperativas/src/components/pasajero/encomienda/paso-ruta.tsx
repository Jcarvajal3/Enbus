"use client";

import { ArrowsDownUpIcon, ArrowsLeftRightIcon, CubeIcon, FlagIcon, MapPinIcon, ScalesIcon, StarIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { ComboCiudad } from "@/components/pasajero/busqueda/combo-ciudad";
import b from "@/components/pasajero/busqueda/buscador.module.css";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { formatMoney, formatNumeroVE } from "@/lib/dinero";
import { formatPesoKg } from "@/lib/peso";
import { RUTAS_PASAJERO } from "@/lib/pasajero/rutas";
import { formatCiudad, formatDuracion } from "@/lib/ve.generated";
import s from "./enviar.module.css";
import type { Cotizacion, OpcionEnvio, RutasEnvio } from "./tipos";

export interface ErroresRuta {
  origen?: string;
  destino?: string;
  peso?: string;
}

interface Props {
  rutas: RutasEnvio;
  origen: string;
  destino: string;
  peso: string;
  onCambiar(cambio: { origen?: string; destino?: string; peso?: string }): void;
  errores: ErroresRuta;
  cotizacion: Cotizacion | null;
  cotizando: boolean;
  onCotizar(): void;
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

export function PasoRuta({
  rutas,
  origen,
  destino,
  peso,
  onCambiar,
  errores,
  cotizacion,
  cotizando,
  onCotizar,
  cooperativaId,
  onElegir,
  avisoStaff,
}: Props) {
  const destinos = rutas.destinosPorOrigen[origen] ?? [];
  const puedeInvertir = Boolean(
    origen && destino && rutas.destinosPorOrigen[destino]?.some((c) => c.ciudad === origen)
  );
  const sinRutas = rutas.origenes.length === 0;

  return (
    <div className={s.pagina}>
      {sinRutas && (
        <Alert variant="warning">
          <WarningCircleIcon weight="fill" aria-hidden />
          <AlertDescription>
            Por ahora no pudimos cargar las rutas con envío de encomiendas. Intenta de nuevo en unos minutos.
          </AlertDescription>
        </Alert>
      )}

      <form
        id="form-ruta"
        className={s.tarjeta}
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          onCotizar();
        }}
      >
        {/* Mismo selector de ciudad y botón de intercambio que el buscador de la portada. */}
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
        {/* Mismo campo de peso que la pestaña "Encomiendas" de la portada. */}
        <div className={b.campo} data-invalido={errores.peso ? "true" : undefined}>
          <label htmlFor="envio-peso" className={b.etiqueta}>
            Peso aproximado <span className={s.opcional}>(opcional)</span>
          </label>
          <div className={b.entrada}>
            <span className={b.icono} aria-hidden>
              <ScalesIcon />
            </span>
            <input
              id="envio-peso"
              className={b.input}
              type="text"
              inputMode="decimal"
              autoComplete="off"
              enterKeyHint="done"
              placeholder="Ej. 2,5"
              maxLength={8}
              value={peso}
              aria-invalid={errores.peso ? true : undefined}
              aria-describedby={errores.peso ? "envio-peso-error" : "envio-peso-ayuda"}
              onChange={(e) => onCambiar({ peso: e.target.value.replace(/[^d.,]/g, "") })}
            />
            <span className={b.sufijo} aria-hidden>
              kg
            </span>
          </div>
          {errores.peso ? (
            <p id="envio-peso-error" role="alert" className={b.error}>
              {errores.peso}
            </p>
          ) : (
            <p id="envio-peso-ayuda" className={s.apoyo}>
              Con el peso te mostramos un costo más cercano al real.
            </p>
          )}
        </div>
      </form>

      <div aria-live="polite" aria-busy={cotizando || undefined} className={s.resultados}>
        {cotizando ? (
          <p className={s.estado} role="status">
            Buscando cooperativas…
          </p>
        ) : cotizacion ? (
          <Resultados
            cotizacion={cotizacion}
            origen={origen}
            destino={destino}
            cooperativaId={cooperativaId}
            onElegir={onElegir}
            onReintentar={onCotizar}
          />
        ) : null}
      </div>

      {avisoStaff && (
        <Alert variant="warning">
          <WarningCircleIcon weight="fill" aria-hidden />
          <AlertDescription>
            Esta cuenta es del panel de cooperativas. Para enviar una encomienda entra con una cuenta de pasajero.{" "}
            <a className={s.enlace} href={`${RUTAS_PASAJERO.ingresar}?motivo=cuenta-panel`}>
              Cambiar de cuenta
            </a>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}

function Resultados({
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
      <p className={s.estado} data-tono="error" role="alert">
        Hiciste muchas cotizaciones seguidas. Intenta de nuevo en {cotizacion.espera}.
      </p>
    );
  }
  if (cotizacion.tipo === "no_disponible" || cotizacion.tipo === "error") {
    return (
      <div className={s.estado} data-tono="error" role="alert">
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
      <p className={s.estado}>
        Ninguna cooperativa lleva encomiendas de {formatCiudad(origen)} a {formatCiudad(destino)} con ese peso. Prueba
        con otra ruta u otro peso.
      </p>
    );
  }

  const { opciones, tasa, tasaFecha, pesoKg, referencia } = cotizacion;
  return (
    <>
      <h2 className={s.subtitulo} id="envio-opciones-titulo">
        {opciones.length === 1 ? "1 cooperativa lleva" : `${opciones.length} cooperativas llevan`} tu paquete de{" "}
        {formatCiudad(origen)} a {formatCiudad(destino)}
      </h2>
      <div role="radiogroup" aria-labelledby="envio-opciones-titulo" className={s.opciones}>
        {opciones.map((o) => {
          const monto = montoOpcion(o, tasa, tasaFecha);
          const limites = limitesOpcion(o);
          const elegida = o.cooperativaId === cooperativaId;
          return (
            <label key={o.cooperativaId} className={s.opcion} data-elegida={elegida || undefined}>
              <input
                type="radio"
                name="cooperativa"
                value={o.cooperativaId}
                checked={elegida}
                onChange={() => onElegir(o.cooperativaId)}
                className={s.radio}
              />
              <span className={s.opcionCuerpo}>
                <span className={s.opcionNombre}>{o.cooperativa}</span>
                <span className={s.opcionMeta}>
                  {o.calificacion !== null && o.calificacion > 0 && (
                    <span>
                      <StarIcon weight="fill" aria-hidden className={s.estrella} />
                      <span className="sr-only">Calificación </span>
                      {formatNumeroVE(o.calificacion, 1)}
                    </span>
                  )}
                  {o.duracionMin !== null && o.duracionMin > 0 && (
                    <span>Viaje de unas {formatDuracion(o.duracionMin)}</span>
                  )}
                </span>
                {limites && (
                  <span className={s.opcionMeta}>
                    <CubeIcon aria-hidden className={s.iconoMeta} />
                    {limites}
                  </span>
                )}
              </span>
              <span className={`${s.opcionPrecio} s-num`}>
                <span className={s.precioEtiqueta}>
                  {referencia ? "Desde (1 kg)" : `Estimado (${formatPesoKg(pesoKg)} kg)`}
                </span>
                <strong>{monto.principal}</strong>
                {monto.secundario && <span className={s.precioSecundario}>{monto.secundario}</span>}
              </span>
            </label>
          );
        })}
      </div>
      <p className={s.nota}>
        Es un estimado según el peso que escribiste. El costo final lo confirma la taquilla al pesar el paquete.
      </p>
    </>
  );
}
