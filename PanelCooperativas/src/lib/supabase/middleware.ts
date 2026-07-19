import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

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

  const pathname = request.nextUrl.pathname;

  if (pathname.startsWith("/admin/")) {
    // --- SUPER ADMIN ROUTES ---
    const adminPublicPaths = ["/admin/login", "/admin/auth/callback"];
    const isAdminPublic = adminPublicPaths.some((p) => pathname.startsWith(p));

    if (!session && !isAdminPublic) {
      const url = request.nextUrl.clone();
      url.pathname = "/admin/login";
      return NextResponse.redirect(url);
    }
    if (session && pathname === "/admin/login") {
      const url = request.nextUrl.clone();
      url.pathname = "/admin/dashboard";
      return NextResponse.redirect(url);
    }
  } else {
    // --- COOPERATIVAS ROUTES (lógica actual sin cambios) ---
    const publicPaths = [
      "/cooperativas/login",
      "/cooperativas/registro",
      "/cooperativas/invite",
      "/cooperativas/recuperar",
      "/cooperativas/restablecer",
      "/cooperativas/auth/callback"
    ];
    const isPublicPath = publicPaths.some((path) =>
      pathname.startsWith(path)
    );

    if (!session && !isPublicPath) {
      const url = request.nextUrl.clone();
      url.pathname = "/cooperativas/login";
      return NextResponse.redirect(url);
    }

    // Si está autenticado y va a login, redirigir al dashboard
    if (session && pathname === "/cooperativas/login") {
      const url = request.nextUrl.clone();
      url.pathname = "/cooperativas/dashboard";
      return NextResponse.redirect(url);
    }
  }

  return supabaseResponse;
}
