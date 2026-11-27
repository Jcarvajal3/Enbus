import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { FlujoEnviar } from "@/components/pasajero/encomienda/flujo-enviar";
import { PASOS_CON_SESION, PASOS_ENVIO, type PasoEnvio } from "@/components/pasajero/encomienda/tipos";
import { leerMonto } from "@/lib/dinero";
import { RUTAS_PASAJERO } from "@/lib/pasajero/rutas";
import { exigirPasajero, obtenerPasajero } from "@/lib/pasajero/sesion";
import { normalizarCiudad } from "@/lib/ve.generated";
import { buscarRuta, cotizarEnvioInicial, rutasConEnvio } from "./cotizacion";

export const metadata: Metadata = {
  title: "Enviar encomienda",
  description: "Cotiza el envío de tu paquete entre ciudades de Venezuela y regístralo para llevarlo a la taquilla.",
  robots: { index: false, follow: false },
};

type Params = Record<string, string | string[] | undefined>;
const primero = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** Peso de la URL como número (`2.5` o `2,5`), o null si falta o no es válido. */
function pesoDe(v: string | undefined): number | null {
  const n = leerMonto((v ?? "").slice(0, 12));
  return n !== null && n < 10000 ? n : null;
}

/** Nombres que tenía `?paso=` antes de parecerse al panel (enlaces guardados): viejo → nuevo. */
const PASOS_VIEJOS: Record<string, PasoEnvio> = { ruta: "destino", destinatario: "detalles" };

export default async function EnviarPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const pasoCrudo = primero(params.paso);
  const paso = PASOS_ENVIO.find((p) => p === pasoCrudo) as PasoEnvio | undefined;
  const pasoViejo = pasoCrudo ? PASOS_VIEJOS[pasoCrudo] : undefined;

  const rutas = await rutasConEnvio();
  const origenIn = normalizarCiudad(primero(params.origen)?.slice(0, 60));
  const destinoIn = normalizarCiudad(primero(params.destino)?.slice(0, 60));
  const ruta = origenIn && destinoIn ? buscarRuta(rutas, origenIn, destinoIn) : null;
  const origen = ruta?.origen.ciudad ?? "";
  const destino = ruta?.destino.ciudad ?? "";
  const peso = pesoDe(primero(params.peso));
  const coop = (primero(params.coop) ?? "").slice(0, 40);

  // Enlace con un nombre de paso anterior: se lleva al nombre actual conservando la selección.
  if (pasoViejo) {
    const q = new URLSearchParams();
    if (origen) q.set("origen", origen);
    if (destino) q.set("destino", destino);
    if (peso !== null) q.set("peso", String(peso));
    if (coop) q.set("coop", coop);
    q.set("paso", pasoViejo);
    redirect(`${RUTAS_PASAJERO.enviar}?${q.toString()}`);
  }

  // Los pasos que registran el envío exigen sesión; al volver de ingresar se retoma el mismo punto.
  const requiereSesion = paso !== undefined && PASOS_CON_SESION.includes(paso);
  let pasajero: Awaited<ReturnType<typeof obtenerPasajero>>;
  if (requiereSesion) {
    const q = new URLSearchParams();
    if (origen) q.set("origen", origen);
    if (destino) q.set("destino", destino);
    if (peso !== null) q.set("peso", String(peso));
    if (coop) q.set("coop", coop);
    q.set("paso", paso);
    pasajero = await exigirPasajero(`${RUTAS_PASAJERO.enviar}?${q.toString()}`);
  } else {
    pasajero = await obtenerPasajero();
  }

  // Cotización inicial (también al recargar o al volver de iniciar sesión): sin límite por IP y con caché.
  // Siempre con 1 kg de referencia ("Desde"): el peso se escribe después, en los detalles.
  const cotizacion = ruta ? await cotizarEnvioInicial(origen, destino, null) : null;

  return (
    <FlujoEnviar
      rutas={rutas}
      inicial={{ origen, destino, peso: peso === null ? "" : String(peso).replace(".", ","), cooperativaId: coop }}
      cotizacionInicial={cotizacion}
      pasajero={
        pasajero
          ? {
              id: pasajero.id,
              nombre: pasajero.nombre,
              esPasajero: pasajero.esPasajero,
              perfilCompleto: pasajero.perfilCompleto,
              cedula: pasajero.cedula,
              telefono: pasajero.telefono,
            }
          : null
      }
    />
  );
}
