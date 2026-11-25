import type { Metadata } from "next";
import { CambiarClave } from "@/components/pasajero/cuenta/clave";
import { DatosPersonales } from "@/components/pasajero/cuenta/datos-personales";
import { Notificaciones } from "@/components/pasajero/cuenta/notificaciones";
import { CerrarSesion, EliminarCuenta } from "@/components/pasajero/cuenta/sesion-y-baja";
import { ErrorCarga } from "@/components/pasajero/cuenta/piezas";
import estilos from "@/components/pasajero/cuenta/cuenta-ui.module.css";
import { RUTAS_PASAJERO } from "@/lib/pasajero/rutas";
import { exigirPasajero } from "@/lib/pasajero/sesion";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Configuración" };

interface FilaPerfil {
  notif_boletos: boolean | null;
  notif_encomiendas: boolean | null;
  notif_recordatorios: boolean | null;
}

export default async function ConfiguracionPage() {
  const pasajero = await exigirPasajero(RUTAS_PASAJERO.configuracion);
  const supabase = await createClient();

  const [{ data: perfil, error }, { data: usuario }] = await Promise.all([
    supabase
      .from("profiles")
      .select("notif_boletos, notif_encomiendas, notif_recordatorios")
      .eq("id", pasajero.id)
      .maybeSingle<FilaPerfil>(),
    supabase.auth.getUser(),
  ]);

  if (error) {
    console.error("[configuracion] No se pudo leer el perfil:", error.code, error.message);
    return (
      <div className={estilos.pagina}>
        <ErrorCarga href={RUTAS_PASAJERO.configuracion} que="tu configuración" />
      </div>
    );
  }

  // ¿Tiene contraseña? Sin datos del proveedor se asume que sí (pedir la actual es lo prudente).
  const user = usuario?.user;
  const meta = user?.app_metadata ?? {};
  const proveedores = [
    ...(Array.isArray(meta.providers) ? (meta.providers as unknown[]) : []),
    ...(typeof meta.provider === "string" ? [meta.provider] : []),
    ...(user?.identities ?? []).map((i) => i.provider),
  ].filter((p): p is string => typeof p === "string");
  const tieneClave = proveedores.length === 0 || proveedores.includes("email");

  return (
    <div className={estilos.pagina}>
      <header className={estilos.cabecera}>
        <div>
          <h1>Configuración</h1>
          <p>Tus datos, avisos y seguridad.</p>
        </div>
      </header>

      <DatosPersonales
        nombre={pasajero.nombre}
        cedula={pasajero.cedula ?? ""}
        telefono={pasajero.telefono ?? ""}
        correo={pasajero.email}
      />
      <Notificaciones
        inicial={{
          notif_boletos: perfil?.notif_boletos ?? true,
          notif_encomiendas: perfil?.notif_encomiendas ?? true,
          notif_recordatorios: perfil?.notif_recordatorios ?? true,
        }}
      />
      <CambiarClave tieneClave={tieneClave} />
      <CerrarSesion />
      <EliminarCuenta correo={pasajero.email} />
    </div>
  );
}
