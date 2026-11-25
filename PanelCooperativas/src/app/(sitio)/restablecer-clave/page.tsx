import type { Metadata } from "next";
import { FormularioRestablecer } from "@/components/pasajero/auth/formulario-restablecer";

export const metadata: Metadata = {
  title: "Nueva contraseña",
  robots: { index: false, follow: false },
};

export default function RestablecerClavePage() {
  return <FormularioRestablecer />;
}
