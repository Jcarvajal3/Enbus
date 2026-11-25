import type { Metadata } from "next";
import { FormularioRecuperar } from "@/components/pasajero/auth/formulario-recuperar";

export const metadata: Metadata = {
  title: "Recuperar contraseña",
  robots: { index: false, follow: false },
};

export default async function RecuperarClavePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { error } = await searchParams;
  return <FormularioRecuperar vencido={Boolean(error)} />;
}
