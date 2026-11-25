import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AvisoCuentaPanel } from "@/components/pasajero/auth/aviso-cuenta-panel";
import { FormularioIngresar, type AvisoIngreso } from "@/components/pasajero/auth/formulario-ingresar";
import { nextSeguro, RUTAS_PASAJERO } from "@/lib/pasajero/rutas";
import { obtenerPasajero } from "@/lib/pasajero/sesion";

export const metadata: Metadata = {
  title: "Ingresar",
  robots: { index: false, follow: false },
};

type Params = Record<string, string | string[] | undefined>;
const primero = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function IngresarPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const next = nextSeguro(primero(params.next));
  const error = primero(params.error);

  const sesion = await obtenerPasajero();
  // Pasajero con sesión: sigue a donde iba. Una cuenta del panel NO se redirige (sería un
  // bucle con exigirPasajero): se le explica y puede cerrar sesión.
  if (sesion?.esPasajero) redirect(next ?? RUTAS_PASAJERO.cuenta);
  if (sesion) return <AvisoCuentaPanel correo={sesion.email} />;

  const aviso: AvisoIngreso = error === "google" ? "google" : error ? "enlace" : null;
  return <FormularioIngresar next={next} aviso={aviso} />;
}
