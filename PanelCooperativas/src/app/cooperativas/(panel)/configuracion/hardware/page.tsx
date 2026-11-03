import { redirect } from "next/navigation";

// "Impresora y lector" ahora es una pantalla propia para ambos roles (#53, P-60):
// los enlaces y marcadores viejos llevan a la nueva.
export default function HardwareConfigPage() {
  redirect("/cooperativas/hardware");
}
