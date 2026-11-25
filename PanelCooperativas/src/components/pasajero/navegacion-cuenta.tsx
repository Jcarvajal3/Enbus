"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Package, Ticket, UserGear } from "@phosphor-icons/react";
import { RUTAS_PASAJERO } from "@/lib/pasajero/rutas";
import estilos from "./navegacion-cuenta.module.css";

const ENLACES = [
  { href: RUTAS_PASAJERO.misBoletos, texto: "Boletos", Icono: Ticket },
  { href: RUTAS_PASAJERO.misEncomiendas, texto: "Encomiendas", Icono: Package },
  { href: RUTAS_PASAJERO.configuracion, texto: "Configuración", Icono: UserGear },
] as const;

/** Navegación del área de cuenta: pestañas horizontales en móvil, columna lateral desde 900 px. */
export function NavegacionCuenta() {
  const ruta = usePathname();

  return (
    <nav aria-label="Mi cuenta" className={estilos.nav}>
      <ul>
        {ENLACES.map(({ href, texto, Icono }) => {
          const activo = ruta === href || ruta.startsWith(`${href}/`);
          return (
            <li key={href}>
              <Link href={href} className={estilos.enlace} aria-current={activo ? "page" : undefined}>
                <Icono aria-hidden weight={activo ? "fill" : "regular"} />
                {texto}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
