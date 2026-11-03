import { redirect } from "next/navigation";

// LP-09: la página pública de EnBus vive en LandingEnBus. La raíz del panel
// lleva directo al inicio de sesión de cooperativas (si ya hay sesión, el login
// la detecta y entra al panel).
export default function Home() {
  redirect("/cooperativas/login");
}
