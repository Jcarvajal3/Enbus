import type { Metadata } from "next";
import { NavegacionCuenta } from "@/components/pasajero/navegacion-cuenta";
import { RUTAS_PASAJERO } from "@/lib/pasajero/rutas";
import { exigirPasajero } from "@/lib/pasajero/sesion";
import estilos from "./cuenta.module.css";

export const metadata: Metadata = {
  title: { default: "Mi cuenta", template: "%s · Mi cuenta" },
  robots: { index: false, follow: false },
};

/**
 * Área del pasajero. El proxy ya mandó a /ingresar a quien no tiene sesión; aquí se
 * verifica el rol (una cuenta del panel recibe el aviso de /ingresar). Las páginas hijas
 * vuelven a llamar `exigirPasajero`, que es barato porque `obtenerPasajero` va cacheado.
 */
export default async function CuentaLayout({ children }: { children: React.ReactNode }) {
  const pasajero = await exigirPasajero(RUTAS_PASAJERO.cuenta);

  return (
    <div className={`s-marco ${estilos.area}`}>
      <aside className={estilos.lateral}>
        <p className={estilos.saludo}>
          <span>Mi cuenta</span>
          <strong>{pasajero.nombre || pasajero.email || "Pasajero"}</strong>
        </p>
        <NavegacionCuenta />
      </aside>
      <div className={estilos.contenido}>{children}</div>
    </div>
  );
}
