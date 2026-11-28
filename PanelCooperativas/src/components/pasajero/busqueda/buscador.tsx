"use client";

// ─── Buscador: pestañas "Pasajes" y "Encomiendas" ────────────────────────────
// Pasajes: origen ⇄ destino + fecha → /viajes. Encomiendas: origen ⇄ destino + peso → cotiza
// en línea (acción pública) y lleva a /enviar. El mismo componente sirve de hero en la portada
// y, en modo compacto (solo pasajes), de barra editable sobre los resultados. Sin JS el
// formulario también funciona: es un GET a /viajes con los mismos nombres de parámetros.

import { useId, useMemo, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowsDownUp, ArrowsLeftRight, Bus, MapPin, Package, Scales, MagnifyingGlass, Flag } from "@phosphor-icons/react";

import { cotizarEnvio, type EstadoCotizacion } from "@/app/(sitio)/acciones";
import type { CiudadesConSalidas } from "@/lib/pasajero/viajes";
import { RUTAS_PASAJERO, urlViajes } from "@/lib/pasajero/rutas";
import { hoyVE } from "@/lib/ve.generated";
import { ComboCiudad } from "./combo-ciudad";
import { ResultadoEnvio } from "./resultado-envio";
import { SelectorFecha } from "./selector-fecha";
import s from "./buscador.module.css";

type Pestana = "pasajes" | "encomiendas";

export interface BuscadorProps {
  ciudades: CiudadesConSalidas;
  /** "hero" (portada, con pestañas) o "compacto" (barra de /viajes, solo pasajes). */
  modo?: "hero" | "compacto";
  inicial?: { origen?: string; destino?: string; fecha?: string };
}

export function Buscador({ ciudades, modo = "hero", inicial }: BuscadorProps) {
  const router = useRouter();
  const uid = useId();
  const [pestana, setPestana] = useState<Pestana>("pasajes");
  const [origen, setOrigen] = useState(inicial?.origen ?? "");
  const [destino, setDestino] = useState(inicial?.destino ?? "");
  const [fecha, setFecha] = useState(() => inicial?.fecha || hoyVE());
  const [peso, setPeso] = useState("");
  const [errores, setErrores] = useState<{ origen?: string; destino?: string; peso?: string }>({});
  const [buscando, iniciarBusqueda] = useTransition();
  const [cotizando, iniciarCotizacion] = useTransition();
  const [cotizacion, setCotizacion] = useState<{ estado: EstadoCotizacion; origen: string; destino: string } | null>(
    null
  );

  const compacto = modo === "compacto";

  const origenes = ciudades.origenes;
  // Destinos según el origen elegido; sin origen (o sin pares conocidos), todos.
  const destinos = useMemo(
    () => (origen && ciudades.destinosPorOrigen[origen]) || ciudades.destinos,
    [origen, ciudades]
  );

  const elegirOrigen = (clave: string) => {
    setOrigen(clave);
    setErrores((e) => ({ ...e, origen: undefined }));
    // Si el destino ya no sale de ese origen, se limpia para no buscar algo imposible.
    const posibles = ciudades.destinosPorOrigen[clave];
    if (destino && (destino === clave || (posibles && !posibles.includes(destino)))) setDestino("");
    setCotizacion(null);
  };

  const elegirDestino = (clave: string) => {
    setDestino(clave);
    setErrores((e) => ({ ...e, destino: undefined }));
    setCotizacion(null);
  };

  const intercambiar = () => {
    setOrigen(destino);
    setDestino(origen);
    setErrores({});
    setCotizacion(null);
  };

  const validarRuta = () => {
    const nuevos: typeof errores = {};
    if (!origen) nuevos.origen = "Elige de dónde sales.";
    if (!destino) nuevos.destino = "Elige a dónde vas.";
    else if (destino === origen) nuevos.destino = "El destino debe ser distinto del origen.";
    return nuevos;
  };

  const buscarPasajes = (e: FormEvent<HTMLFormElement>) => {
    const nuevos = validarRuta();
    setErrores(nuevos);
    // Con errores no se envía; sin JS el GET sigue funcionando y /viajes pide completar.
    e.preventDefault();
    if (Object.keys(nuevos).length > 0) return;
    iniciarBusqueda(() => router.push(urlViajes({ origen, destino, fecha })));
  };

  const cotizar = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const nuevos = validarRuta();
    if (!peso.trim()) nuevos.peso = "Escribe el peso en kilos.";
    setErrores(nuevos);
    if (Object.keys(nuevos).length > 0) return;
    iniciarCotizacion(async () => {
      const estado = await cotizarEnvio(origen, destino, peso);
      if (estado.tipo === "invalido") setErrores((x) => ({ ...x, [estado.campo]: estado.mensaje }));
      else setCotizacion({ estado, origen, destino });
    });
  };

  const hayPestanas = !compacto;
  const enEncomiendas = hayPestanas && pestana === "encomiendas";

  const ruta = (
    <div className={s.ruta}>
      <ComboCiudad
        id={`${uid}-origen`}
        label="Origen"
        value={origen}
        onChange={elegirOrigen}
        opciones={origenes}
        placeholder="¿Desde dónde sales?"
        icono={<MapPin />}
        error={errores.origen}
        sinResultados="Todavía no hay salidas desde esa ciudad."
      />
      <button
        type="button"
        className={s.intercambiar}
        onClick={intercambiar}
        aria-label="Intercambiar origen y destino"
        disabled={!origen && !destino}
      >
        <ArrowsLeftRight className={s.iconoH} aria-hidden />
        <ArrowsDownUp className={s.iconoV} aria-hidden />
      </button>
      <ComboCiudad
        id={`${uid}-destino`}
        label="Destino"
        value={destino}
        onChange={elegirDestino}
        opciones={destinos}
        placeholder="¿A dónde vas?"
        icono={<Flag />}
        error={errores.destino}
        sinResultados="No hay salidas hacia esa ciudad desde el origen elegido."
      />
    </div>
  );

  return (
    <div className={`${s.buscador} ${compacto ? s.compacto : s.hero}`}>
      {hayPestanas && (
        <div className={s.pestanas} role="tablist" aria-label="¿Qué necesitas?">
          <button
            type="button"
            role="tab"
            id={`${uid}-tab-pasajes`}
            aria-selected={pestana === "pasajes"}
            aria-controls={`${uid}-panel`}
            tabIndex={pestana === "pasajes" ? 0 : -1}
            className={s.pestana}
            onClick={() => setPestana("pasajes")}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
                e.preventDefault();
                setPestana("encomiendas");
                document.getElementById(`${uid}-tab-encomiendas`)?.focus();
              }
            }}
          >
            <Bus aria-hidden />
            Pasajes
          </button>
          <button
            type="button"
            role="tab"
            id={`${uid}-tab-encomiendas`}
            aria-selected={pestana === "encomiendas"}
            aria-controls={`${uid}-panel`}
            tabIndex={pestana === "encomiendas" ? 0 : -1}
            data-tono="coral"
            className={s.pestana}
            onClick={() => setPestana("encomiendas")}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
                e.preventDefault();
                setPestana("pasajes");
                document.getElementById(`${uid}-tab-pasajes`)?.focus();
              }
            }}
          >
            <Package aria-hidden />
            Encomiendas
          </button>
        </div>
      )}

      <div
        id={`${uid}-panel`}
        role={hayPestanas ? "tabpanel" : undefined}
        aria-labelledby={hayPestanas ? `${uid}-tab-${pestana}` : undefined}
      >
        {!enEncomiendas ? (
          <form action={RUTAS_PASAJERO.viajes} method="get" className={s.formulario} onSubmit={buscarPasajes} noValidate>
            <input type="hidden" name="origen" value={origen} />
            <input type="hidden" name="destino" value={destino} />
            <input type="hidden" name="fecha" value={fecha} />
            {ruta}
            <div className={s.celdaFecha}>
              <SelectorFecha id={`${uid}-fecha`} value={fecha} onChange={setFecha} />
            </div>
            <div className={s.accion}>
              <button
                type="submit"
                className="s-boton s-boton--sol s-boton--lg"
                aria-busy={buscando || undefined}
                disabled={buscando}
              >
                <MagnifyingGlass aria-hidden weight="bold" />
                {buscando ? "Buscando…" : "Buscar"}
              </button>
            </div>
          </form>
        ) : (
          <>
            <form className={s.formulario} onSubmit={cotizar} noValidate>
              {ruta}
              <div className={s.celdaFecha}>
                <div className={s.campo} data-invalido={errores.peso ? "true" : undefined}>
                  <label htmlFor={`${uid}-peso`} className={s.etiqueta}>
                    Peso del paquete
                  </label>
                  <div className={s.entrada}>
                    <span className={s.icono} aria-hidden>
                      <Scales />
                    </span>
                    <input
                      id={`${uid}-peso`}
                      className={s.input}
                      type="text"
                      inputMode="decimal"
                      autoComplete="off"
                      placeholder="Ej. 2,5"
                      maxLength={8}
                      value={peso}
                      aria-invalid={errores.peso ? true : undefined}
                      aria-describedby={errores.peso ? `${uid}-peso-error` : undefined}
                      onChange={(e) => {
                        setPeso(e.target.value.replace(/[^\d.,]/g, ""));
                        setErrores((x) => ({ ...x, peso: undefined }));
                        setCotizacion(null);
                      }}
                    />
                    <span className={s.sufijo} aria-hidden>
                      kg
                    </span>
                  </div>
                  {errores.peso && (
                    <p id={`${uid}-peso-error`} role="alert" className={s.error}>
                      {errores.peso}
                    </p>
                  )}
                </div>
              </div>
              <div className={s.accion}>
                <button
                  type="submit"
                  className="s-boton s-boton--sol s-boton--lg"
                  aria-busy={cotizando || undefined}
                  disabled={cotizando}
                >
                  <Scales aria-hidden weight="bold" />
                  {cotizando ? "Cotizando…" : "Cotizar envío"}
                </button>
              </div>
            </form>
            <div aria-live="polite" className={s.resultados}>
              {cotizacion && (
                <ResultadoEnvio estado={cotizacion.estado} origen={cotizacion.origen} destino={cotizacion.destino} />
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
