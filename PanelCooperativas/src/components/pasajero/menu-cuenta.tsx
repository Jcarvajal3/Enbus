"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Buildings, CaretDown, Package, SignOut, Ticket, User, UserGear } from "@phosphor-icons/react";
import type { AuthChangeEvent, Session, User as UsuarioAuth } from "@supabase/supabase-js";
import { limpiarBorradoresLocales } from "@/lib/borradores";
import { INICIO_ADMIN } from "@/lib/admin-navigation";
import { INICIO } from "@/lib/navigation";
import { RUTAS_PASAJERO, urlIngresar } from "@/lib/pasajero/rutas";
import { createClient } from "@/lib/supabase/client";
import estilos from "./menu-cuenta.module.css";

type Usuario = { id: string; nombre: string; panel: string | null };
/** `undefined` = todavía leyendo la sesión; `null` = sin sesión. */
type Estado = Usuario | null | undefined;

/** Primer nombre para el botón ("María José Pérez" → "María"). */
function primerNombre(nombre: string) {
  return nombre.trim().split(/\s+/)[0] ?? "";
}

/**
 * Sesión del navegador para pintar la barra. Se lee en el cliente a propósito: así la
 * portada sigue siendo estática. Solo es presentación: las páginas y las acciones
 * verifican la sesión en el servidor.
 */
function useUsuario(): Estado {
  const [usuario, setUsuario] = useState<Estado>(undefined);

  useEffect(() => {
    const supabase = createClient();
    let vivo = true;

    const cargar = async (id: string | null, respaldo: string) => {
      if (!id) {
        if (vivo) setUsuario(null);
        return;
      }
      // Con la sesión ya se puede mostrar; el nombre definitivo llega con el perfil.
      if (vivo) setUsuario((p) => (p && p.id === id ? p : { id, nombre: respaldo, panel: null }));
      const { data } = await supabase.from("profiles").select("nombre_completo, role").eq("id", id).maybeSingle();
      if (!vivo || !data) return;
      const panel =
        data.role === "super_admin" ? INICIO_ADMIN : data.role === "taquillero" || data.role === "admin_cooperativa" ? INICIO : null;
      setUsuario({ id, nombre: (data.nombre_completo ?? "").trim() || respaldo, panel });
    };

    const respaldoDe = (u: UsuarioAuth): string => {
      const meta = u.user_metadata?.nombre_completo;
      return (typeof meta === "string" && meta.trim()) || u.email?.split("@")[0] || "Mi cuenta";
    };

    void supabase.auth.getSession().then(({ data }: { data: { session: Session | null } }) => {
      const u = data.session?.user;
      void cargar(u?.id ?? null, u ? respaldoDe(u) : "");
    });
    const { data: suscripcion } = supabase.auth.onAuthStateChange((evento: AuthChangeEvent, sesion: Session | null) => {
      if (evento === "TOKEN_REFRESHED") return;
      const u = sesion?.user;
      // Fuera del callback: supabase-js no admite llamadas a su cliente dentro de él.
      setTimeout(() => void cargar(u?.id ?? null, u ? respaldoDe(u) : ""), 0);
    });

    return () => {
      vivo = false;
      suscripcion.subscription.unsubscribe();
    };
  }, []);

  return usuario;
}

function useCerrarSesion() {
  const router = useRouter();
  return useCallback(async () => {
    // Lo escrito en los asistentes (nombre, cédula, teléfono) no debe quedar en la pestaña.
    limpiarBorradoresLocales();
    try {
      await createClient().auth.signOut({ scope: "local" });
    } finally {
      router.replace(RUTAS_PASAJERO.inicio);
      router.refresh();
    }
  }, [router]);
}

/**
 * Cuenta en la barra (escritorio): "Ingresar" sin sesión o un menú con el nombre. El espacio
 * está reservado desde el primer pintado para que la barra no salte al leer la sesión.
 */
export function MenuCuenta() {
  const usuario = useUsuario();
  const cerrarSesion = useCerrarSesion();
  const [abierto, setAbierto] = useState(false);
  const raiz = useRef<HTMLDivElement>(null);
  const boton = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  // Escape y clic fuera cierran; Escape devuelve el foco al botón.
  useEffect(() => {
    if (!abierto) return;
    const alTecla = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setAbierto(false);
      boton.current?.focus();
    };
    const alClic = (e: PointerEvent) => {
      if (raiz.current && !raiz.current.contains(e.target as Node)) setAbierto(false);
    };
    document.addEventListener("keydown", alTecla);
    document.addEventListener("pointerdown", alClic);
    return () => {
      document.removeEventListener("keydown", alTecla);
      document.removeEventListener("pointerdown", alClic);
    };
  }, [abierto]);

  return (
    <div ref={raiz} className={estilos.raiz}>
      {usuario === undefined && (
        <>
          <span className={estilos.reserva} aria-hidden />
          <noscript>
            <Link href={urlIngresar()} className={estilos.ingresar}>
              Ingresar
            </Link>
          </noscript>
        </>
      )}

      {usuario === null && (
        <Link href={urlIngresar()} className={estilos.ingresar}>
          <User aria-hidden />
          Ingresar
        </Link>
      )}

      {usuario && (
        <>
          <button
            ref={boton}
            type="button"
            className={estilos.boton}
            aria-expanded={abierto}
            aria-controls={menuId}
            onClick={() => setAbierto((v) => !v)}
          >
            <span className={estilos.inicial} aria-hidden>
              {primerNombre(usuario.nombre).charAt(0).toUpperCase() || <User />}
            </span>
            <span className={estilos.nombre}>{primerNombre(usuario.nombre)}</span>
            <CaretDown aria-hidden className={estilos.flecha} />
          </button>
          {abierto && (
            <div id={menuId} className={estilos.menu}>
              <p className={estilos.titulo}>{usuario.nombre}</p>
              <ul>
                {usuario.panel ? (
                  <li>
                    <Link href={usuario.panel} className={estilos.item} onClick={() => setAbierto(false)}>
                      <Buildings aria-hidden />
                      Ir al panel
                    </Link>
                  </li>
                ) : (
                  <>
                    <li>
                      <Link href={RUTAS_PASAJERO.misBoletos} className={estilos.item} onClick={() => setAbierto(false)}>
                        <Ticket aria-hidden />
                        Mis boletos
                      </Link>
                    </li>
                    <li>
                      <Link href={RUTAS_PASAJERO.misEncomiendas} className={estilos.item} onClick={() => setAbierto(false)}>
                        <Package aria-hidden />
                        Mis encomiendas
                      </Link>
                    </li>
                    <li>
                      <Link href={RUTAS_PASAJERO.configuracion} className={estilos.item} onClick={() => setAbierto(false)}>
                        <UserGear aria-hidden />
                        Configuración
                      </Link>
                    </li>
                  </>
                )}
                <li>
                  <button
                    type="button"
                    className={estilos.item}
                    onClick={() => {
                      setAbierto(false);
                      void cerrarSesion();
                    }}
                  >
                    <SignOut aria-hidden />
                    Cerrar sesión
                  </button>
                </li>
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** Cuenta dentro del panel del menú móvil: los mismos destinos como filas grandes. */
export function CuentaMenuMovil({ alNavegar }: { alNavegar: () => void }) {
  const usuario = useUsuario();
  const cerrarSesion = useCerrarSesion();

  if (usuario === undefined) return null;

  if (usuario === null) {
    return (
      <Link href={urlIngresar()} className={estilos.filaMovil} onClick={alNavegar}>
        Ingresar
      </Link>
    );
  }

  return (
    <>
      {usuario.panel ? (
        <Link href={usuario.panel} className={estilos.filaMovil} onClick={alNavegar}>
          Ir al panel
        </Link>
      ) : (
        <>
          <Link href={RUTAS_PASAJERO.misBoletos} className={estilos.filaMovil} onClick={alNavegar}>
            Mis boletos
          </Link>
          <Link href={RUTAS_PASAJERO.misEncomiendas} className={estilos.filaMovil} onClick={alNavegar}>
            Mis encomiendas
          </Link>
          <Link href={RUTAS_PASAJERO.configuracion} className={estilos.filaMovil} onClick={alNavegar}>
            Configuración
          </Link>
        </>
      )}
      <button
        type="button"
        className={estilos.filaMovil}
        onClick={() => {
          alNavegar();
          void cerrarSesion();
        }}
      >
        Cerrar sesión
      </button>
    </>
  );
}
