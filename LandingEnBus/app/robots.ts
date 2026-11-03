import type { MetadataRoute } from "next"

import { sitioUrl } from "@/lib/urls"

// Todo el sitio es público. El sitemap solo se anuncia con NEXT_PUBLIC_SITIO_URL (URL absoluta).
export default function robots(): MetadataRoute.Robots {
  const sitio = sitioUrl()
  return {
    rules: { userAgent: "*", allow: "/" },
    ...(sitio ? { sitemap: `${sitio}/sitemap.xml` } : {}),
  }
}
