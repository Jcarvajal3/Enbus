import Link from "next/link";

import { RUTAS_PANEL, RUTAS_SITIO } from "@/lib/sitio/urls";
import { BarraMenu } from "./barra-menu";
import estilos from "./barra.module.css";

/** Lo que hace el pasajero: comprar, enviar y rastrear. Con "/#…" sirve igual desde las demás páginas. */
export const SECCIONES = [
  { href: "/viajes", texto: "Pasajes" },
  { href: "/enviar", texto: "Encomiendas" },
  { href: "/#rastrear", texto: "Rastrear envío" },
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
