import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Cierra la sesión y vuelve al login del panel de administración. Lo usa la
 * pantalla "Sin acceso" (cuenta que no es de super admin): sin esto, el login
 * con sesión abierta redirige al resumen y el resumen al login, en bucle.
 * Solo POST: un enlace o una imagen de otro sitio no pueden cerrar la sesión.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut();
  if (error) console.error("[admin/auth/salir]", error);
  // 303: el navegador sigue con GET al login.
  return NextResponse.redirect(new URL("/admin/login", request.url), 303);
}
