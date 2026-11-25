import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { FormularioCrearCuenta } from "@/components/pasajero/auth/formulario-crear-cuenta";
import { nextSeguro, RUTAS_PASAJERO } from "@/lib/pasajero/rutas";
import { obtenerPasajero } from "@/lib/pasajero/sesion";

export const metadata: Metadata = {
  title: "Crear cuenta",
  robots: { index: false, follow: false },
};

type Params = Record<string, string | string[] | undefined>;

export default async function CrearCuentaPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const crudo = Array.isArray(params.next) ? params.next[0] : params.next;
  const next = nextSeguro(crudo);

  const sesion = await obtenerPasajero();
  if (sesion?.esPasajero) redirect(next ?? RUTAS_PASAJERO.cuenta);

  return <FormularioCrearCuenta next={next} />;
}
