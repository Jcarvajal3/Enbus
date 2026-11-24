import { notFound } from "next/navigation";

// Modelo de comisiones en pausa: mientras EnBus opera gratis la sección no existe (ni menú ni URL).
// El código del módulo se conserva para retomarlo cuando se defina el modelo de negocio.
export default function Layout() {
  notFound();
}
