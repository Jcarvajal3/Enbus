import type { MetadataRoute } from "next";

import { sitioUrl } from "@/lib/sitio/urls";

// Se indexan la portada, las páginas legales y el registro de cooperativas; el panel y
// el super admin no (piden sesión).
export default function robots(): MetadataRoute.Robots {
  const url = sitioUrl();
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/cooperativas/registro"],
      disallow: ["/cooperativas/", "/admin/"],
    },
    ...(url ? { sitemap: `${url}/sitemap.xml` } : {}),
  };
}
