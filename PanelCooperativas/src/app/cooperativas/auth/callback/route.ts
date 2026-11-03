import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

/**
 * Sanitize the `next` redirect param to prevent open redirect attacks.
 * Only internal absolute paths are allowed (must start with `/` but NOT `//`).
 */
function sanitizeNext(raw: string | null, fallback: string): string {
  if (!raw) return fallback;
  // Solo rutas del panel de cooperativas. Los navegadores tratan la barra invertida como "/".
  if (raw.includes("\\") || raw.startsWith("//")) return fallback;
  if (raw === "/cooperativas" || raw.startsWith("/cooperativas/")) return raw;
  return fallback;
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = sanitizeNext(searchParams.get("next"), "/cooperativas/restablecer");

  if (code) {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(({ name, value, options }) =>
                cookieStore.set(name, value, options)
              );
            } catch {
              // Safe to ignore in route handlers if they are set downstream
            }
          },
        },
      }
    );

    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // Redirect to login if something fails
  return NextResponse.redirect(`${origin}/cooperativas/login?error=auth-callback-failed`);
}
