import { formatMoney, type TasaRef } from "@/lib/dinero";
import { formatCiudad } from "@/lib/ciudades";
import { formatDiaHoraVE } from "@/lib/fechas";
import type { ViajePublico } from "@/lib/pasajero/viajes";

/** Texto del total en vivo: "Bs 1.250,00" y "≈ USD 25,00 · BCV 02/10". */
export function totalEnVivo(totalUsd: number, totalBs: number | null, tasa: TasaRef | null) {
  return formatMoney({ usd: totalUsd, bs: totalBs, tasa });
}

/** Línea de apoyo bajo el título (`descripcion` de `FlujoPagina`): "Caracas → Valencia · vie 28 nov, 8:00 a. m. · Cooperativa". */
export function descripcionViaje(viaje: ViajePublico) {
  return `${formatCiudad(viaje.origen)} → ${formatCiudad(viaje.destino)} · ${formatDiaHoraVE(viaje.salida)} · ${viaje.cooperativa.nombre}`;
}

/** Total para `BarraFlujo`: principal grande y, apagado, solo "≈ USD 15,00" (sin el sufijo de la tasa). */
export function totalParaBarra(total: ReturnType<typeof totalEnVivo>) {
  return {
    valor: total.principal,
    secundario: total.secundario ? total.secundario.split(" · ")[0] : undefined,
    accesible: total.accesible,
  };
}
