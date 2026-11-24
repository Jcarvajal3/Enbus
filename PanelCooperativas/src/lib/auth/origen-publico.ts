import { sitioUrl } from "@/lib/sitio/urls";

/**
 * Origen público al que se redirige tras autenticar (callbacks de Supabase Auth).
 *
 * Detrás de un proxy, `request.url` trae el origen interno (p. ej. localhost:3000).
 * Solo se acepta `x-forwarded-host` si coincide con el host del sitio configurado en
 * `NEXT_PUBLIC_SITIO_URL`: así una cabecera manipulada nunca puede mandar la sesión a
 * otro dominio. Sin esa variable (o en desarrollo) se usa el origen de la solicitud.
 */
export function resolverOrigenPublico(request: Request, origenSolicitud: string): string {
  if (process.env.NODE_ENV === "development") return origenSolicitud;

  const configurado = sitioUrl();
  if (!configurado) return origenSolicitud;

  const hostReenviado = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim().toLowerCase();
  if (!hostReenviado) return origenSolicitud;

  try {
    const permitido = new URL(configurado);
    return hostReenviado === permitido.host.toLowerCase() ? permitido.origin : origenSolicitud;
  } catch {
    return origenSolicitud;
  }
}
