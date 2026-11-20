"use client";

// ─── Estado de la venta (reducer) ────────────────────────────────────────────
// Todo lo que se pierde al recargar y que los pasos comparten: salida elegida,
// asientos, datos de cada pasajero, error del cobro y resultado. El PASO vive en la
// URL (`usePasoEnUrl`), no aquí. Las consultas (salidas, asientos ocupados) viven
// en `use-salidas.ts` y `use-asientos-ocupados.ts`.

import { useReducer } from "react";
import type { OperacionTaquilla } from "../../../app/cooperativas/(panel)/taquilla/boletos/actions";
import type { ErrorCampoCobro } from "./cobro-taquilla-form";
import {
  PASAJERO_VACIO,
  nuevaClave,
  pasajeroValido,
  type DatosPasajero,
  type PasoVenta,
  type ViajeParaVenta,
} from "./tipos";

/** Aviso que hizo volver a un paso anterior (asiento tomado, viaje cerrado…); solo se ve en ese paso. */
export type AvisoVenta = { texto: string; paso: PasoVenta };

export type EstadoVenta = {
  /** Salida marcada en el paso 1 (tocar marca; "Continuar" confirma). */
  marcado: string | null;
  /** Salida confirmada: la de los asientos y el cobro. */
  viaje: ViajeParaVenta | null;
  asientos: string[];
  /** Solo lo que se editó; las tarjetas sin entrada están vacías. */
  pasajeros: Record<string, DatosPasajero>;
  /** Ya se intentó continuar desde "¿Quién viaja?": se muestran los errores. */
  intentoPasajeros: boolean;
  /** Sube cada vez que hay que llevar el foco al primer campo con error. */
  focoPasajeros: number;
  aviso: AvisoVenta | null;
  errorCobro: ErrorCampoCobro | null;
  enviando: boolean;
  operacion: OperacionTaquilla | null;
  /** Una por venta: reintentar con la misma no duplica; "Vender otro" la renueva. */
  idemKey: string;
};

export type AccionVenta =
  | { tipo: "MARCAR"; id: string | null }
  /** Confirma la salida. Si es otra distinta de la anterior, descarta asientos y pasajeros. */
  | { tipo: "ELEGIR_VIAJE"; viaje: ViajeParaVenta }
  | { tipo: "SET_ASIENTOS"; asientos: string[] }
  | { tipo: "QUITAR_ASIENTOS"; asientos: string[] }
  | { tipo: "EDITAR_PASAJERO"; asiento: string; campo: keyof DatosPasajero; valor: string }
  | { tipo: "INTENTAR_PASAJEROS" }
  | { tipo: "AVISO"; aviso: AvisoVenta | null }
  | { tipo: "ENVIANDO"; enviando: boolean }
  | { tipo: "ERROR_COBRO"; error: ErrorCampoCobro | null }
  | { tipo: "EXITO"; operacion: OperacionTaquilla }
  /** El viaje dejó de estar a la venta: vuelve al paso 1 sin asientos. */
  | { tipo: "VIAJE_PERDIDO"; aviso: string }
  /** "Vender otro": todo en blanco y clave nueva. */
  | { tipo: "REINICIAR" };

function estadoInicial(): EstadoVenta {
  return {
    marcado: null,
    viaje: null,
    asientos: [],
    pasajeros: {},
    intentoPasajeros: false,
    focoPasajeros: 0,
    aviso: null,
    errorCobro: null,
    enviando: false,
    operacion: null,
    idemKey: nuevaClave(),
  };
}

const porNumero = (a: string, b: string) => Number(a) - Number(b);

function soloDe(pasajeros: Record<string, DatosPasajero>, asientos: string[]) {
  const siguiente: Record<string, DatosPasajero> = {};
  for (const a of asientos) if (pasajeros[a]) siguiente[a] = pasajeros[a];
  return siguiente;
}

function reducir(estado: EstadoVenta, accion: AccionVenta): EstadoVenta {
  switch (accion.tipo) {
    case "MARCAR":
      return { ...estado, marcado: accion.id };

    case "ELEGIR_VIAJE": {
      const otra = estado.viaje?.id !== accion.viaje.id;
      return {
        ...estado,
        viaje: accion.viaje,
        marcado: accion.viaje.id,
        asientos: otra ? [] : estado.asientos,
        pasajeros: otra ? {} : estado.pasajeros,
        intentoPasajeros: otra ? false : estado.intentoPasajeros,
        errorCobro: null,
        aviso: null,
      };
    }

    case "SET_ASIENTOS": {
      const asientos = [...accion.asientos].sort(porNumero);
      return { ...estado, asientos, pasajeros: soloDe(estado.pasajeros, asientos), errorCobro: null };
    }

    case "QUITAR_ASIENTOS": {
      const asientos = estado.asientos.filter((a) => !accion.asientos.includes(a));
      return { ...estado, asientos, pasajeros: soloDe(estado.pasajeros, asientos) };
    }

    case "EDITAR_PASAJERO":
      return {
        ...estado,
        pasajeros: {
          ...estado.pasajeros,
          [accion.asiento]: { ...(estado.pasajeros[accion.asiento] ?? PASAJERO_VACIO), [accion.campo]: accion.valor },
        },
      };

    case "INTENTAR_PASAJEROS":
      return { ...estado, intentoPasajeros: true, focoPasajeros: estado.focoPasajeros + 1 };

    case "AVISO":
      return { ...estado, aviso: accion.aviso };

    case "ENVIANDO":
      return { ...estado, enviando: accion.enviando, errorCobro: accion.enviando ? null : estado.errorCobro };

    case "ERROR_COBRO":
      return { ...estado, errorCobro: accion.error };

    case "EXITO":
      return { ...estado, operacion: accion.operacion, errorCobro: null, aviso: null };

    case "VIAJE_PERDIDO":
      return {
        ...estado,
        viaje: null,
        marcado: null,
        asientos: [],
        pasajeros: {},
        intentoPasajeros: false,
        aviso: { texto: accion.aviso, paso: "salida" },
      };

    case "REINICIAR":
      return estadoInicial();
  }
}

export function useVenta() {
  const [estado, dispatch] = useReducer(reducir, undefined, estadoInicial);
  const { asientos, pasajeros, viaje } = estado;

  const totalUsd = viaje ? Number(viaje.ruta.precio_pasaje) * asientos.length : 0;
  const pasajerosValidos = asientos.length > 0 && asientos.every((a) => pasajeroValido(pasajeros[a]));
  /** Hay algo que se perdería al salir (asientos o datos escritos). */
  const hayDatos =
    asientos.length > 0 ||
    Object.values(pasajeros).some((p) => p.nombre.trim() || p.cedula.trim() || p.telefono.trim());

  return { estado, dispatch, totalUsd, pasajerosValidos, hayDatos };
}
