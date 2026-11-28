import type { ReactNode } from "react";

import estilos from "./auth.module.css";

interface Props {
  titulo: string;
  descripcion?: ReactNode;
  children: ReactNode;
  /** Enlace secundario al pie ("¿No tienes cuenta? Crea una"). */
  pie?: ReactNode;
}

/**
 * Marco común de las pantallas de acceso: una hoja centrada con el formulario y el H1 de la
 * página. Sin adornos: lo único que importa aquí es entrar.
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
      </div>
    </div>
  );
}
