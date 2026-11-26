import type { ReactNode } from "react";
import Image from "next/image";
import { Armchair, QrCode, Receipt } from "@phosphor-icons/react/dist/ssr";

import { FOTOS } from "@/components/sitio/fotos";
import estilos from "./auth.module.css";

interface Props {
  titulo: string;
  descripcion?: ReactNode;
  children: ReactNode;
  /** Enlace secundario al pie ("¿No tienes cuenta? Crea una"). */
  pie?: ReactNode;
}

const VENTAJAS = [
  { icono: Armchair, texto: "Elige tu asiento en el mapa del bus" },
  { icono: Receipt, texto: "Paga en bolívares a la tasa BCV" },
  { icono: QrCode, texto: "Tu pase QR y tus envíos, siempre a mano" },
] as const;

/**
 * Marco común de las pantallas de acceso: una hoja con el formulario (y el H1 de la página)
 * junto a un panel de marca con la foto del sitio. En móvil queda solo el formulario.
 */
export function TarjetaAuth({ titulo, descripcion, children, pie }: Props) {
  return (
    <div className={estilos.pagina}>
      <div className={estilos.marco}>
        <section className={estilos.tarjeta} aria-labelledby="auth-titulo">
          <header className={estilos.cabeza}>
            <h1 id="auth-titulo">{titulo}</h1>
            {descripcion && <p>{descripcion}</p>}
          </header>
          <div className={estilos.cuerpo}>{children}</div>
          {pie && <footer className={estilos.pie}>{pie}</footer>}
        </section>

        <aside className={estilos.lado} aria-label="EnBus">
          <Image
            src={FOTOS.llanosApure}
            alt=""
            fill
            placeholder="blur"
            sizes="(min-width: 1000px) 560px, 0px"
            className={estilos.ladoFoto}
          />
          <div className={estilos.ladoVelo} aria-hidden />
          <p className={estilos.ladoLema}>
            Tu próximo viaje empieza <em>aquí</em>
          </p>
          <ul className={estilos.ladoLista}>
            {VENTAJAS.map(({ icono: Icono, texto }) => (
              <li key={texto}>
                <Icono aria-hidden />
                {texto}
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </div>
  );
}
