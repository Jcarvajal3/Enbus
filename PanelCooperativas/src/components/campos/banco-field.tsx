"use client";

import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { BANCOS_VE, buscarBanco, etiquetaBanco, OTRO_BANCO } from "@/lib/bancos";
import { CampoContenedor, idsCampo, type PropsCampoComun } from "./campo-base";
import { SelectorBusqueda, type GrupoBusqueda } from "./selector-busqueda";

const ID_OTRO = "__otro__";

export interface BancoFieldProps extends Omit<PropsCampoComun, "enterKeyHint" | "autoFocus"> {
  /** "0134 · Banesco" (la forma que se guarda), el nombre que escribió la persona con "Otro banco", o "". */
  value: string;
  onChange(banco: string): void;
  /** "Elige el banco" por defecto. */
  placeholder?: string;
}

/**
 * Banco con buscador por nombre, alias o código (lista única de `shared/bancos.ts`) y "Otro banco"
 * con el nombre escrito a mano. Guarda `etiquetaBanco` ("0134 · Banesco"); un nombre escrito que
 * se reconozca ("banesco") pasa a su forma con código al salir del campo.
 */
export function BancoField({
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
  placeholder = "Elige el banco",
}: BancoFieldProps) {
  const { describedBy, invalido } = idsCampo(id, error, ayuda);
  const reconocido = buscarBanco(value);
  // "Otro banco" se queda activo mientras se escribe, aunque el campo esté vacío o a medias.
  const [otro, setOtro] = useState(() => !!value.trim() && !reconocido);
  const modoOtro = otro && !(reconocido && value === etiquetaBanco(reconocido));

  const grupos = useMemo<GrupoBusqueda[]>(
    () => [
      {
        id: "bancos",
        opciones: [
          ...BANCOS_VE.map((b) => ({
            id: b.codigo,
            etiqueta: b.nombre,
            detalle: b.codigo,
            busqueda: b.alias.join(" "),
          })),
          { id: ID_OTRO, etiqueta: OTRO_BANCO },
        ],
      },
    ],
    []
  );

  const elegir = (opcion: string) => {
    if (opcion === ID_OTRO) {
      setOtro(true);
      // Si había un banco de la lista, el campo de texto empieza vacío.
      if (reconocido) onChange("");
      return;
    }
    const banco = BANCOS_VE.find((b) => b.codigo === opcion);
    setOtro(false);
    if (banco) onChange(etiquetaBanco(banco));
  };

  const textoValor = modoOtro ? OTRO_BANCO : value.trim() ? (reconocido ? etiquetaBanco(reconocido) : value) : null;
  const otroId = `${id}-otro`;

  return (
    <CampoContenedor
      id={id}
      label={label}
      opcional={opcional}
      error={error}
      ayuda={ayuda}
      disabled={disabled}
      className={className}
      ocultos={name ? <input type="hidden" name={name} value={value} /> : undefined}
    >
      <SelectorBusqueda
        id={id}
        grupos={grupos}
        valorId={modoOtro ? ID_OTRO : reconocido?.codigo ?? null}
        textoValor={textoValor}
        placeholder={placeholder}
        titulo={label}
        placeholderBusqueda="Busca por nombre o código"
        sinResultados="No encontramos ese banco. Prueba con “Otro banco”."
        onElegir={elegir}
        onLimpiar={opcional ? () => { setOtro(false); onChange(""); } : undefined}
        disabled={disabled}
        invalido={invalido}
        describedBy={describedBy}
        required={required}
      />
      {modoOtro && (
        <Input
          id={otroId}
          type="text"
          autoComplete="off"
          autoCapitalize="words"
          aria-label="Nombre del banco"
          placeholder="Ej. Banco del Pueblo"
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          onBlur={() => {
            const b = buscarBanco(value);
            if (b) {
              setOtro(false);
              onChange(etiquetaBanco(b));
            }
          }}
          aria-invalid={invalido}
          aria-describedby={describedBy}
        />
      )}
    </CampoContenedor>
  );
}
