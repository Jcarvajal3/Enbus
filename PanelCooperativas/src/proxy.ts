import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export default async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    "/cooperativas/:path*",
    "/admin/:path*",
    // Sitio del pasajero: renueva la sesión; /cuenta y /comprar la exigen.
    "/cuenta/:path*",
    "/comprar/:path*",
    "/enviar/:path*",
    "/ingresar",
    "/crear-cuenta",
    "/recuperar-clave",
    "/restablecer-clave",
    "/auth/:path*",
  ],
};
