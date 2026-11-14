import type { MetadataRoute } from "next";

import { RUTAS_LEGALES, RUTAS_PANEL, sitioUrl } from "@/lib/sitio/urls";

// Sin NEXT_PUBLIC_SITIO_URL no hay URLs absolutas que publicar: el sitemap queda vacío.
export default function sitemap(): MetadataRoute.Sitemap {
  const url = sitioUrl();
  if (!url) return [];
  return [
    { url: `${url}/`, changeFrequency: "daily", priority: 1 },
    { url: `${url}${RUTAS_PANEL.registro}`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${url}${RUTAS_LEGALES.terminos}`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${url}${RUTAS_LEGALES.privacidad}`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${url}${RUTAS_LEGALES.eliminarCuenta}`, changeFrequency: "yearly", priority: 0.3 },
  ];
}
