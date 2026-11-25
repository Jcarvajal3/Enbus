"use client";

import { useState } from "react";
import { Switch } from "@/components/ui/switch";
import { avisarError, avisarExito } from "@/lib/avisos";
import { guardarNotificacion, type ClaveNotificacion } from "@/app/(sitio)/cuenta/configuracion/acciones";
import estilos from "./configuracion.module.css";

type Valores = Record<ClaveNotificacion, boolean>;

const OPCIONES: { clave: ClaveNotificacion; titulo: string; detalle: string }[] = [
  { clave: "notif_boletos", titulo: "Boletos", detalle: "Confirmación de tu pago, cambios y cancelaciones." },
  { clave: "notif_encomiendas", titulo: "Encomiendas", detalle: "Cuando tu paquete se recibe, sale, llega o se entrega." },
  { clave: "notif_recordatorios", titulo: "Recordatorios", detalle: "Aviso antes de tu viaje y cuando vence una reserva." },
];

/** Interruptores de avisos: cada cambio se guarda al instante y se revierte si falla. */
export function Notificaciones({ inicial }: { inicial: Valores }) {
  const [valores, setValores] = useState<Valores>(inicial);
  const [guardando, setGuardando] = useState<ClaveNotificacion | null>(null);

  const cambiar = async (clave: ClaveNotificacion, valor: boolean) => {
    if (guardando) return;
    setValores((v) => ({ ...v, [clave]: valor }));
    setGuardando(clave);
    try {
      const r = await guardarNotificacion({ clave, valor });
      if (!r.success) {
        setValores((v) => ({ ...v, [clave]: !valor }));
        avisarError(r.error);
        return;
      }
      avisarExito(valor ? "Activamos este aviso." : "Desactivamos este aviso.");
    } catch {
      setValores((v) => ({ ...v, [clave]: !valor }));
      avisarError("No pudimos guardar tu preferencia. Revisa tu conexión e intenta de nuevo.");
    } finally {
      setGuardando(null);
    }
  };

  return (
    <section className={estilos.seccion} aria-labelledby="notif-titulo">
      <div className={estilos.seccionCab}>
        <h2 id="notif-titulo">Notificaciones</h2>
        <p>Elige qué avisos quieres recibir. Se guardan al instante.</p>
      </div>
      <ul className={estilos.interruptores}>
        {OPCIONES.map((o) => (
          <li key={o.clave} className={estilos.interruptor}>
            <span className={estilos.interruptorTexto}>
              <strong id={`${o.clave}-t`}>{o.titulo}</strong>
              <span id={`${o.clave}-d`}>{o.detalle}</span>
            </span>
            <Switch
              checked={valores[o.clave]}
              onCheckedChange={(v) => void cambiar(o.clave, v)}
              disabled={guardando !== null}
              aria-labelledby={`${o.clave}-t`}
              aria-describedby={`${o.clave}-d`}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
