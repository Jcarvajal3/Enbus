"use client";

import { useMemo } from "react";
import { ciudadVE, ESTADOS_VE, formatCiudad, normalizarCiudad } from "@/lib/ciudades";
import { CampoContenedor, idsCampo, type PropsCampoComun } from "./campo-base";
import { SelectorBusqueda, type GrupoBusqueda } from "./selector-busqueda";

/** Claves que se guardan en la base (= `normalizar_localidad`): "zulia", "maracaibo". */
export interface ValorCiudad {
  estado: string;
  ciudad: string;
}

export const CIUDAD_VACIA: ValorCiudad = { estado: "", ciudad: "" };

export interface CiudadFieldProps extends Omit<PropsCampoComun, "enterKeyHint" | "autoFocus"> {
  /** Estado y ciudad como claves ("zulia", "maracaibo") o nombres ("Maracaibo"); vacío = sin elegir. */
  value: ValorCiudad | null;
  /** Emite claves; sin ciudad ("Quitar selección") emite `CIUDAD_VACIA`. */
  onChange(valor: ValorCiudad): void;
  /**
   * Restringe a estas ciudades (claves o nombres), p. ej. las de las rutas activas. Las que no
   * estén en el catálogo se ofrecen en "Otras ciudades" para que nunca quede una sin poder elegirse.
   */
  opciones?: readonly string[];
  /** Ciudades que no se ofrecen (claves o nombres), p. ej. el origen al elegir el destino. */
  excluir?: readonly string[];
  /** "Elige la ciudad" por defecto. */
  placeholder?: string;
}

/**
 * Ciudad con buscador, agrupada por estado, del catálogo único `ESTADOS_VE`. Se busca por ciudad
 * o por estado, sin tildes. Se ve como "Maracaibo, Zulia".
 */
export function CiudadField({
  id,
  label,
  value,
  onChange,
  error,
  ayuda,
  opcional,
  disabled,
  name,
  required,
  className,
  opciones,
  excluir,
  placeholder = "Elige la ciudad",
}: CiudadFieldProps) {
  const { describedBy, invalido } = idsCampo(id, error, ayuda);
  const claveCiudad = normalizarCiudad(value?.ciudad);
  const encontrada = claveCiudad ? ciudadVE(claveCiudad, value?.estado) ?? ciudadVE(claveCiudad) : null;

  const grupos = useMemo<GrupoBusqueda[]>(() => {
    const permitidas = opciones ? new Set(opciones.map(normalizarCiudad)) : null;
    const fuera = new Set((excluir ?? []).map(normalizarCiudad));
    const grupos: GrupoBusqueda[] = [];
    const conocidas = new Set<string>();
    for (const e of ESTADOS_VE) {
      const ciudades = e.ciudades.filter((c) => {
        conocidas.add(c.clave);
        return !fuera.has(c.clave) && (!permitidas || permitidas.has(c.clave));
      });
      if (ciudades.length > 0) {
        grupos.push({ id: e.clave, titulo: e.nombre, opciones: ciudades.map((c) => ({ id: c.clave, etiqueta: c.nombre })) });
      }
    }
    if (permitidas) {
      const otras = [...permitidas].filter((c) => c && !conocidas.has(c) && !fuera.has(c));
      if (otras.length > 0) {
        grupos.push({
          id: "otras",
          titulo: "Otras ciudades",
          opciones: otras.map((c) => ({ id: c, etiqueta: formatCiudad(c) })),
        });
      }
    }
    return grupos;
  }, [opciones, excluir]);

  const textoValor = claveCiudad
    ? encontrada
      ? `${encontrada.ciudad.nombre}, ${encontrada.estado.nombre}`
      : formatCiudad(claveCiudad)
    : null;

  const elegir = (clave: string) => {
    const c = ciudadVE(clave);
    onChange({ estado: c?.estado.clave ?? "", ciudad: clave });
  };

  return (
    <CampoContenedor
      id={id}
      label={label}
      opcional={opcional}
      error={error}
      ayuda={ayuda}
      disabled={disabled}
      className={className}
      ocultos={
        name ? (
          <>
            <input type="hidden" name={name} value={claveCiudad} />
            <input type="hidden" name={`${name}_estado`} value={encontrada?.estado.clave ?? normalizarCiudad(value?.estado)} />
          </>
        ) : undefined
      }
    >
      <SelectorBusqueda
        id={id}
        grupos={grupos}
        valorId={claveCiudad || null}
        textoValor={textoValor}
        placeholder={placeholder}
        titulo={label}
        placeholderBusqueda="Busca una ciudad o un estado"
        sinResultados="No encontramos esa ciudad."
        onElegir={elegir}
        onLimpiar={opcional ? () => onChange(CIUDAD_VACIA) : undefined}
        disabled={disabled}
        invalido={invalido}
        describedBy={describedBy}
        required={required}
      />
    </CampoContenedor>
  );
}
