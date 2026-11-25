"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { List, X } from "@phosphor-icons/react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

import { CuentaMenuMovil, MenuCuenta } from "@/components/pasajero/menu-cuenta";
import { RUTAS_PANEL } from "@/lib/sitio/urls";
import estilos from "./barra.module.css";

interface Props {
  marca: ReactNode;
  secciones: readonly { href: string; texto: string }[];
  cooperativas: string;
  login: string;
}

const ESCRITORIO = "(min-width: 1180px)";

/**
 * Barra del sitio. Sin JS los enlaces quedan visibles en una fila bajo la marca. Con JS
 * (`data-js`), en móvil y tablet se colapsan en un panel a pantalla completa con foco,
 * Escape y bloqueo de scroll gestionados.
 */
export function BarraMenu({ marca, secciones, cooperativas, login }: Props) {
  const enCooperativas = usePathname() === cooperativas;
  const [abierto, setAbierto] = useState(false);
  const [scroll, setScroll] = useState(false);
  const [js, setJs] = useState(false);
  const boton = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  const cerrar = useCallback((devolverFoco: boolean) => {
    setAbierto(false);
    if (devolverFoco) boton.current?.focus();
  }, []);

  useEffect(() => {
    const alScroll = () => setScroll(window.scrollY > 8);
    // Tras montar: marca que hay JS y lee el scroll inicial.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setJs(true);
    alScroll();
    window.addEventListener("scroll", alScroll, { passive: true });
    return () => window.removeEventListener("scroll", alScroll);
  }, []);

  // Cierra al pasar a escritorio.
  useEffect(() => {
    const mq = window.matchMedia(ESCRITORIO);
    const alCambiar = () => {
      if (mq.matches) setAbierto(false);
    };
    mq.addEventListener("change", alCambiar);
    return () => mq.removeEventListener("change", alCambiar);
  }, []);

  // Escape, bloqueo del scroll y foco al primer enlace.
  useEffect(() => {
    if (!abierto) return;
    const previo = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panel.current?.querySelector<HTMLElement>("a")?.focus();
    const alTecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") cerrar(true);
    };
    document.addEventListener("keydown", alTecla);
    return () => {
      document.body.style.overflow = previo;
      document.removeEventListener("keydown", alTecla);
    };
  }, [abierto, cerrar]);

  return (
    <header
      className={estilos.barra}
      data-scroll={scroll ? "true" : undefined}
      data-js={js ? "true" : undefined}
      data-abierto={abierto ? "true" : undefined}
    >
      <a href="#contenido" className="s-salto">
        Saltar al contenido
      </a>
      <div className={`s-marco ${estilos.fila}`}>
        {marca}

        <nav aria-label="Secciones" className={estilos.centro}>
          <ul>
            {secciones.map((s) => (
              <li key={s.href}>
                <Link href={s.href} className={estilos.enlace}>
                  {s.texto}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className={estilos.derecha}>
          {/* En /cooperativas la acción de la barra es la de esa página (registrarse), no la app. */}
          {enCooperativas ? (
            <>
              <Link href="/" className={`${estilos.enlace} ${estilos.coop}`}>
                Para pasajeros
              </Link>
              <Link href={RUTAS_PANEL.registro} className="s-boton s-boton--sol s-boton--sm" onClick={() => cerrar(false)}>
                Registrar cooperativa
              </Link>
            </>
          ) : (
            <>
              <Link href={cooperativas} className={`${estilos.enlace} ${estilos.coop}`}>
                Para cooperativas
              </Link>
              <Link href="/#descargar" className="s-boton s-boton--sol s-boton--sm" onClick={() => cerrar(false)}>
                Descargar app
              </Link>
            </>
          )}
          <MenuCuenta />
          <button
            ref={boton}
            type="button"
            className={estilos.hamburguesa}
            aria-expanded={abierto}
            aria-controls="menu-movil"
            aria-label={abierto ? "Cerrar menú" : "Abrir menú"}
            onClick={() => setAbierto((v) => !v)}
          >
            {abierto ? <X size={24} aria-hidden /> : <List size={24} aria-hidden />}
          </button>
        </div>
      </div>

      {/* Móvil: con JS solo existe abierto; sin JS se ve como una fila de enlaces. */}
      <div id="menu-movil" ref={panel} className={estilos.panel} hidden={js && !abierto ? true : undefined}>
        <nav aria-label="Menú móvil" className={estilos.panelNav}>
          <ul>
            {secciones.map((s) => (
              <li key={s.href}>
                <Link href={s.href} className={estilos.panelEnlace} onClick={() => cerrar(false)}>
                  {s.texto}
                </Link>
              </li>
            ))}
          </ul>
          <div className={estilos.panelCuenta}>
            <CuentaMenuMovil alNavegar={() => cerrar(false)} />
          </div>
          <div className={estilos.panelPie}>
            <Link href={cooperativas} className={estilos.panelEnlace} onClick={() => cerrar(false)}>
              Para cooperativas
            </Link>
            <Link href={login} className={estilos.panelEnlace} onClick={() => cerrar(false)}>
              Entrar al panel
            </Link>
          </div>
        </nav>
      </div>
    </header>
  );
}
