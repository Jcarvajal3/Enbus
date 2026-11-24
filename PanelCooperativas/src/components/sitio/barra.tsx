import Link from "next/link";

import { RUTAS_PANEL, RUTAS_SITIO } from "@/lib/sitio/urls";
import { BarraMenu } from "./barra-menu";
import estilos from "./barra.module.css";

/** Secciones de la portada. Con "/#…" sirven igual desde las demás páginas del sitio. */
export const SECCIONES = [
  { href: "/#como-funciona", texto: "Cómo funciona" },
  { href: "/#rutas", texto: "Rutas" },
  { href: "/#encomiendas", texto: "Encomiendas" },
  { href: "/#rastrear", texto: "Rastrear envío" },
  { href: "/#preguntas", texto: "Preguntas" },
] as const;

/** Barra fija del sitio: marca, secciones, "Para cooperativas" y la descarga de la app. */
export function Barra() {
  return (
    <BarraMenu
      secciones={SECCIONES}
      cooperativas={RUTAS_SITIO.cooperativas}
      login={RUTAS_PANEL.login}
      marca={
        <Link href="/" className={estilos.marca} aria-label="EnBus, inicio">
          En<span>Bus</span>
        </Link>
      }
    />
  );
}
