"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SignOut, Trash } from "@phosphor-icons/react";
import { AvisoError } from "@/components/aviso-error";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { avisarExito, avisarInfo } from "@/lib/avisos";
import { limpiarBorradoresLocales } from "@/lib/borradores";
import { RUTAS_PASAJERO } from "@/lib/pasajero/rutas";
import { cerrarSesionPasajero, eliminarMiCuenta } from "@/app/(sitio)/cuenta/configuracion/acciones";
import estilos from "./configuracion.module.css";

const MOTIVOS = ["Ya no la uso", "Tengo otra cuenta", "Problemas con la app", "Otro"] as const;
const PALABRA = "ELIMINAR";

export function CerrarSesion() {
  return (
    <section className={estilos.seccion} aria-labelledby="sesion-titulo">
      <div className={estilos.seccionCab}>
        <h2 id="sesion-titulo">Sesión</h2>
        <p>Cierra la sesión en este navegador. Tus boletos y encomiendas siguen en tu cuenta.</p>
      </div>
      <form action={cerrarSesionPasajero} onSubmit={limpiarBorradoresLocales}>
        <Button type="submit" variant="outline" size="lg">
          <SignOut aria-hidden />
          Cerrar sesión
        </Button>
      </form>
    </section>
  );
}

/** Zona de peligro: eliminar la cuenta pide un motivo opcional y escribir ELIMINAR. */
export function EliminarCuenta({ correo }: { correo: string | null }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [motivo, setMotivo] = useState<string | null>(null);
  const [confirmacion, setConfirmacion] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [conActividad, setConActividad] = useState(false);
  const [enviando, empezar] = useTransition();

  const listo = confirmacion.trim().toUpperCase() === PALABRA;

  const cerrar = () => {
    if (enviando) return;
    setAbierto(false);
    setConfirmacion("");
    setError(null);
    setConActividad(false);
  };

  const eliminar = () => {
    if (!listo || enviando) return;
    setError(null);
    setConActividad(false);
    empezar(async () => {
      try {
        const r = await eliminarMiCuenta({ motivo });
        if (!r.success) {
          setError(r.error);
          setConActividad(r.codigo === "EB_CUENTA_CON_ACTIVIDAD");
          return;
        }
        limpiarBorradoresLocales();
        if (r.data.aviso) avisarInfo(r.data.aviso);
        else avisarExito("Eliminamos tu cuenta. Gracias por usar EnBus.");
        router.replace(RUTAS_PASAJERO.inicio);
        router.refresh();
      } catch {
        setError("No pudimos eliminar tu cuenta. Revisa tu conexión e intenta de nuevo.");
      }
    });
  };

  return (
    <section className={`${estilos.seccion} ${estilos.peligro}`} aria-labelledby="baja-titulo">
      <div className={estilos.seccionCab}>
        <h2 id="baja-titulo">Eliminar mi cuenta</h2>
        <p>Esta acción no se puede deshacer.</p>
      </div>
      <ul className={estilos.lista}>
        <li>Borramos tu nombre, tu cédula, tu teléfono y tus notificaciones.</li>
        <li>
          Tus boletos y envíos anteriores se guardan sin tus datos personales, porque las cooperativas los necesitan para su contabilidad.
        </li>
        <li>Ya no podrás entrar con {correo ?? "tu correo"}. Si quieres volver a usar EnBus, crea una cuenta nueva.</li>
      </ul>
      <div className={estilos.enlaces}>
        <Button variant="destructive" size="lg" onClick={() => setAbierto(true)}>
          <Trash aria-hidden />
          Eliminar mi cuenta
        </Button>
        <Link href="/eliminar-cuenta" className="s-enlace" style={{ alignSelf: "center" }}>
          Cómo funciona
        </Link>
      </div>

      <Dialog open={abierto} onOpenChange={(a) => (a ? setAbierto(true) : cerrar())}>
        <DialogContent tamano="confirmar">
          <DialogHeader>
            <DialogTitle>¿Eliminar tu cuenta?</DialogTitle>
            <DialogDescription>
              Para continuar, escribe <strong>{PALABRA}</strong>. Primero deben terminar tus boletos por usar, pagos en verificación,
              encomiendas en curso y reembolsos pendientes.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4">
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-[15px] font-semibold text-foreground">Motivo (opcional)</legend>
              {MOTIVOS.map((m) => (
                <label key={m} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl bg-surface px-4 text-[15px] text-foreground has-checked:bg-accent-light">
                  <input
                    type="radio"
                    name="motivo-baja"
                    value={m}
                    checked={motivo === m}
                    onChange={() => setMotivo(m)}
                    disabled={enviando}
                    className="size-4 accent-accent-strong"
                  />
                  {m}
                </label>
              ))}
            </fieldset>
            <div className="flex flex-col gap-1">
              <label htmlFor="baja-confirmacion" className="text-[15px] font-semibold text-foreground">
                Escribe {PALABRA} para confirmar
              </label>
              <Input
                id="baja-confirmacion"
                value={confirmacion}
                onChange={(e) => setConfirmacion(e.target.value)}
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                disabled={enviando}
              />
            </div>
            {error && (
              <AvisoError>
                <p>{error}</p>
                {conActividad && (
                  <p className="mt-2 flex flex-wrap gap-x-4">
                    <Link href={RUTAS_PASAJERO.misBoletos} className="underline">
                      Ir a Mis boletos
                    </Link>
                    <Link href={RUTAS_PASAJERO.misEncomiendas} className="underline">
                      Ir a Mis encomiendas
                    </Link>
                  </p>
                )}
              </AvisoError>
            )}
          </div>

          <DialogFooter>
            <Button size="lg" variant="outline" onClick={cerrar} disabled={enviando}>
              Conservar mi cuenta
            </Button>
            <Button size="lg" variant="destructive" onClick={eliminar} disabled={!listo || enviando} aria-busy={enviando || undefined}>
              {enviando && <Spinner size="sm" aria-hidden />}
              Eliminar mi cuenta
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
