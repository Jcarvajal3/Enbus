import type { Metadata } from "next";

import { Barra } from "@/components/sitio/barra";
import { Pie } from "@/components/sitio/pie";
import { sitioUrl } from "@/lib/sitio/urls";
import "./sitio.css";

const url = sitioUrl();

// Sitio público (portada y páginas legales). Vive en el mismo proyecto y dominio que el
// panel (/cooperativas, /admin); comparte fuente, tokens y layout raíz, pero su estilo va
// todo bajo `.sitio` (sitio.css) para no tocar el panel.
export const metadata: Metadata = {
  ...(url ? { metadataBase: new URL(url) } : {}),
  openGraph: {
    siteName: "EnBus",
    locale: "es_VE",
    type: "website",
  },
};

export default function SitioLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="sitio">
      <Barra />
      <main id="contenido" className="s-principal" tabIndex={-1}>
        {children}
        <div className="s-final-hueco" aria-hidden />
      </main>
      <Pie />
    </div>
  );
}
