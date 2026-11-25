import Link from "next/link";

import { RUTAS_PANEL, RUTAS_SITIO } from "@/lib/sitio/urls";
import { BarraMenu } from "./barra-menu";
import estilos from "./barra.module.css";

/** Compra (Pasajes, Encomiendas) y secciones de la portada. Con "/#…" sirven igual desde las demás páginas. */
export const SECCIONES = [
  { href: "/viajes", texto: "Pasajes" },
  { href: "/enviar", texto: "Encomiendas" },
  { href: "/#salidas", texto: "Próximas salidas" },
  { href: "/#rutas", texto: "Rutas" },
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
