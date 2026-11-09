import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { INICIO } from "@/lib/navigation";

// ─── Redirecciones de entrada (proxy.ts) ─────────────────────────────────────
// Solo se exige sesión. El ROL (y la cooperativa) lo comprueba cada layout con el
// perfil, y cada server action / RPC de nuevo. Para que nunca haya un bucle (PN-01),
// aquí no se redirige "del login al panel" con sesión: con una sesión sin acceso al
// panel (pasajero, cuenta sin cooperativa, super admin en /cooperativas o empleado en
// /admin) eso creaba un bucle login → panel → login. Lo decide la página de login con
// el perfil; los layouts mandan a quien no tiene acceso al login con `?motivo=…`, y el
// login cierra la sesión y explica el motivo.

/** Rutas del panel de cooperativas que se ven sin sesión. */
const PUBLICAS_COOPERATIVAS = [
  "/cooperativas/login",
  "/cooperativas/registro",
  "/cooperativas/invite",
  "/cooperativas/recuperar",
  "/cooperativas/restablecer",
  "/cooperativas/auth/callback",
];

/** Rutas del super admin que se ven sin sesión. */
const PUBLICAS_ADMIN = ["/admin/login", "/admin/auth/callback"];

/** Mismas secciones que `exigirRolPanel(["admin_cooperativa"])` protege en sus páginas. */
const SOLO_ADMIN_COOPERATIVA = ["/cooperativas/rutas", "/cooperativas/buses", "/cooperativas/empleados", "/cooperativas/configuracion"];

/** true si `pathname` es `ruta` o una subruta suya ("/cooperativas/login" no incluye "/cooperativas/loginx"). */
function dentroDe(pathname: string, ruta: string) {
  return pathname === ruta || pathname.startsWith(`${ruta}/`);
}

/** Redirección sin arrastrar la query que conserva las cookies de sesión renovadas en esta misma petición. */
function redirigir(request: NextRequest, respuesta: NextResponse, pathname: string) {
  const url = request.nextUrl.clone();
  url.pathname = pathname;
  url.search = "";
  const redireccion = NextResponse.redirect(url);
  respuesta.cookies.getAll().forEach((cookie) => redireccion.cookies.set(cookie));
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

  // getClaims() renueva el token si venció (igual que getSession) y además VERIFICA
  // la firma del JWT con las claves públicas del proyecto (ES256, en caché global):
  // una cookie alterada o vencida no cuenta como sesión. Sin llamada de red por petición.
  let uid: string | null = null;
  try {
    const { data } = await supabase.auth.getClaims();
    uid = typeof data?.claims?.sub === "string" ? data.claims.sub : null;
  } catch (err) {
    console.error("[proxy] No se pudo verificar la sesión:", err);
  }
  const autenticado = uid !== null;

  const pathname = request.nextUrl.pathname;

  if (dentroDe(pathname, "/admin")) {
    const publica = PUBLICAS_ADMIN.some((p) => dentroDe(pathname, p));
    if (!autenticado && !publica) return redirigir(request, supabaseResponse, "/admin/login");
  } else {
    const publica = PUBLICAS_COOPERATIVAS.some((p) => dentroDe(pathname, p));
    if (!autenticado && !publica) return redirigir(request, supabaseResponse, "/cooperativas/login");

    // Secciones solo del administrador de la cooperativa: el taquillero que llega por URL
    // vuelve al inicio antes de renderizar (redirigir durante el render con el shell ya
    // montado daba "Rendered more hooks" en desarrollo). Solo para estas rutas se lee el
    // rol. Es comodidad de navegación: la página (exigirRolPanel) y las actions/RPC
    // siguen siendo las que autorizan.
    if (
      uid &&
      !dentroDe(pathname, "/cooperativas/configuracion/hardware") && // redirige a Impresora y lector (ambos roles)
      SOLO_ADMIN_COOPERATIVA.some((p) => dentroDe(pathname, p))
    ) {
      const { data: perfil } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", uid)
        .maybeSingle();
      if (perfil?.role === "taquillero") return redirigir(request, supabaseResponse, INICIO);
    }
  }

  return supabaseResponse;
}
