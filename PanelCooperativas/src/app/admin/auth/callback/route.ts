import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

/**
 * Sanitize the `next` redirect param to prevent open redirect attacks.
 * Only internal absolute paths are allowed (must start with `/` but NOT `//`).
 */
function sanitizeNext(raw: string | null, fallback: string): string {
  if (!raw) return fallback;
  // Block protocol-relative URLs (//evil.com) and anything that isn't a path
  if (raw.startsWith("/") && !raw.startsWith("//")) return raw;
  return fallback;
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  // Sanitize to prevent open redirect attacks
  const next = sanitizeNext(searchParams.get("next"), "/admin/dashboard");

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

    const { error, data } = await supabase.auth.exchangeCodeForSession(code);
    if (!error && data.session) {
      // Role verification — only super_admin may access /admin/*
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", data.session.user.id)
        .single();

      if (profile?.role !== "super_admin") {
        // Sign out the non-admin user and reject access
        await supabase.auth.signOut();
        return NextResponse.redirect(`${origin}/admin/login?error=access-denied`);
      }

      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // Redirect to login if something fails
  return NextResponse.redirect(`${origin}/admin/login?error=auth-callback-failed`);
}
