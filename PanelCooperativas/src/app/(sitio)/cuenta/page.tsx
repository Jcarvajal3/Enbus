import { redirect } from "next/navigation";
import { RUTAS_PASAJERO } from "@/lib/pasajero/rutas";

export default function CuentaPage() {
  redirect(RUTAS_PASAJERO.misBoletos);
}
