import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { INICIO } from "@/lib/navigation";
import { INICIO_ADMIN } from "@/lib/admin-navigation";

// ─── Redirecciones de entrada (proxy.ts) ─────────────────────────────────────
// Solo mira si hay sesión; el rol lo comprueban los layouts de cada zona. Para que
// nunca haya un bucle (PN-01), los layouts mandan a quien no tiene acceso al login
// con `?motivo=…` y aquí ese login NO se redirige aunque haya sesión: el login
// cierra la sesión y explica el motivo.

const COOPERATIVAS_PUBLICAS = [
  "/cooperativas/login",
  "/cooperativas/registro",
  "/cooperativas/invite",
  "/cooperativas/recuperar",
  "/cooperativas/restablecer",
  "/cooperativas/auth/callback",
];
const ADMIN_PUBLICAS = ["/admin/login", "/admin/auth/callback"];
/** Mismas secciones que `exigirRolPanel(["admin_cooperativa"])` protege en sus páginas. */
const SOLO_ADMIN_COOPERATIVA = ["/cooperativas/rutas", "/cooperativas/empleados", "/cooperativas/configuracion"];

/** Redirige sin arrastrar la query y conservando las cookies que getSession() haya renovado. */
function redirigir(request: NextRequest, pathname: string, respuesta: NextResponse) {
  const url = request.nextUrl.clone();
  url.pathname = pathname;
  url.search = "";
  const redireccion = NextResponse.redirect(url);
  respuesta.cookies.getAll().forEach((c) => redireccion.cookies.set(c));
  return redireccion;
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // getSession() reads the JWT from HttpOnly cookies — NO network call.
  // Only contacts Supabase when the access token is expired (to refresh).
  // Safe because: 1) cookies are HttpOnly 2) JWT is HMAC-signed 3) can't be tampered client-side
  const { data: { session } } = await supabase.auth.getSession();

  const { pathname, searchParams } = request.nextUrl;
  const conMotivo = searchParams.has("motivo");

  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    // --- ADMINISTRACIÓN ---
    const esPublica = ADMIN_PUBLICAS.some((p) => pathname.startsWith(p));
    if (!session && !esPublica) return redirigir(request, "/admin/login", supabaseResponse);
    if (session && pathname === "/admin/login" && !conMotivo) return redirigir(request, INICIO_ADMIN, supabaseResponse);
  } else {
    // --- COOPERATIVAS ---
    const esPublica = COOPERATIVAS_PUBLICAS.some((p) => pathname.startsWith(p));
    if (!session && !esPublica) return redirigir(request, "/cooperativas/login", supabaseResponse);
    // Con sesión, el login lleva al inicio; si el rol no es de cooperativa, el layout lo
    // devuelve con `?motivo=sin-acceso` (o al admin) y esa vuelta ya no se redirige.
    if (session && pathname === "/cooperativas/login" && !conMotivo) return redirigir(request, INICIO, supabaseResponse);
    // Secciones solo del administrador de la cooperativa: el taquillero que llega por URL
    // vuelve al inicio antes de renderizar (redirigir durante el render con el shell ya
    // montado daba "Rendered more hooks" en desarrollo). Solo para estas rutas se lee el rol.
    if (
      session &&
      !pathname.startsWith("/cooperativas/configuracion/hardware") && // redirige a Impresora y lector (ambos roles)
      SOLO_ADMIN_COOPERATIVA.some((p) => pathname === p || pathname.startsWith(`${p}/`))
    ) {
      const { data: perfil } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", session.user.id)
        .maybeSingle();
      if (perfil?.role === "taquillero") return redirigir(request, INICIO, supabaseResponse);
    }
  }

  return supabaseResponse;
}
