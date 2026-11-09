"use client";

// ─── Notificaciones (tarjeta de "Impresora y lector") ───────────────────────
// Activa o desactiva los avisos push de pagos por verificar en este equipo.
// El permiso se pide solo al tocar "Activar notificaciones".

import { Bell, Info, WarningCircle } from "@phosphor-icons/react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { usePushPanel } from "@/hooks/use-push-panel";
import type { EstadoPush } from "@/components/push/push-navegador";
import { avisarError, avisarExito, avisarInfo } from "@/lib/avisos";
import { cn } from "@/lib/utils";

const TEXTO_ESTADO: Record<EstadoPush, string> = {
  cargando: "Revisando este equipo…",
  activadas: "Activadas en este equipo",
  desactivadas: "Desactivadas en este equipo",
  bloqueadas: "Bloqueadas por el navegador",
  "instalar-ios": "Primero instala el panel en la pantalla de inicio",
  "no-soportado": "Este navegador no puede recibir notificaciones",
  "sin-service-worker": "Disponibles en el panel publicado",
  "sin-configurar": "Todavía no están configuradas en el panel",
};

function PasosBloqueadas() {
  return (
    <div className="flex flex-col gap-2 rounded-md bg-warning-light p-3 text-sm text-warning-deep">
      <p className="font-medium">Para volver a permitirlas:</p>
      <ul className="flex list-disc flex-col gap-1 pl-5">
        <li>
          En la computadora: toca el ícono a la izquierda de la dirección (candado o ajustes), busca
          «Notificaciones», elige «Permitir» y recarga la página.
        </li>
        <li>En Android con el panel instalado: Ajustes del teléfono → Aplicaciones → EnBus → Notificaciones.</li>
        <li>En iPhone o iPad: Ajustes → Notificaciones → EnBus → Permitir notificaciones.</li>
      </ul>
    </div>
  );
}

function PasosIOS() {
  return (
    <div className="flex flex-col gap-2 rounded-md bg-muted/50 p-3 text-sm">
      <p className="font-medium">En iPhone y iPad (iOS 16.4 o posterior):</p>
      <ol className="flex list-decimal flex-col gap-1 pl-5 text-muted-foreground">
        <li>Abre el panel en Safari.</li>
        <li>Toca Compartir y luego «Añadir a pantalla de inicio».</li>
        <li>Abre EnBus desde el ícono nuevo, entra a «Impresora y lector» y activa las notificaciones.</li>
      </ol>
    </div>
  );
}

export function NotificacionesPushCard() {
  const { estado, ocupado, activar, desactivar, probar } = usePushPanel();

  const alActivar = async () => {
    const r = await activar();
    if (r.error) avisarError(r.error);
    else if (r.estado === "activadas") avisarExito("Listo: este equipo te avisará de los pagos por verificar.");
    else if (r.estado === "desactivadas") avisarInfo("No se activaron. Puedes intentarlo cuando quieras.");
  };

  const alDesactivar = async () => {
    const r = await desactivar();
    if (r.error) avisarError(r.error);
    else avisarInfo("Este equipo ya no recibirá notificaciones.");
  };

  const alProbar = async () => {
    const ok = await probar().catch(() => false);
    if (!ok) avisarError("No se pudo mostrar la notificación de prueba. Revisa el permiso del navegador.");
  };

  const activadas = estado === "activadas";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="size-5 text-muted-foreground" aria-hidden />
          Notificaciones
        </CardTitle>
        <CardDescription>Avisos de pagos por verificar en este equipo.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-center gap-3 rounded-md bg-muted/50 p-4" role="status" aria-live="polite">
          {estado === "cargando" ? (
            <Spinner size="sm" />
          ) : (
            <span
              className={cn(
                "size-3 shrink-0 rounded-full",
                activadas ? "bg-success" : estado === "bloqueadas" ? "bg-warning" : "bg-muted-foreground"
              )}
              aria-hidden
            />
          )}
          <p className="font-medium">{TEXTO_ESTADO[estado]}</p>
        </div>

        {estado === "desactivadas" && (
          <Button onClick={() => void alActivar()} disabled={ocupado}>
            {ocupado ? "Activando…" : "Activar notificaciones"}
          </Button>
        )}

        {activadas && (
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button variant="outline" className="flex-1" onClick={() => void alProbar()} disabled={ocupado}>
              Enviar una de prueba
            </Button>
            <Button variant="outline" className="flex-1" onClick={() => void alDesactivar()} disabled={ocupado}>
              {ocupado ? "Desactivando…" : "Desactivar"}
            </Button>
          </div>
        )}

        {estado === "bloqueadas" && <PasosBloqueadas />}
        {estado === "instalar-ios" && <PasosIOS />}
        {estado === "no-soportado" && (
          <p className="flex items-start gap-2 text-sm text-muted-foreground">
            <WarningCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
            Usa Chrome, Edge o Firefox actualizados. En iPhone o iPad hace falta iOS 16.4 o posterior y el panel
            instalado en la pantalla de inicio.
          </p>
        )}
        {estado === "sin-configurar" && (
          <p className="text-sm text-muted-foreground">Avísale a soporte de EnBus para activarlas.</p>
        )}

        <p className="flex items-start gap-2 rounded-md bg-info-light p-3 text-sm text-info-deep">
          <Info className="mt-0.5 size-4 shrink-0 text-info-text" weight="fill" aria-hidden />
          <span>
            Te avisamos cuando un cliente reporta desde la app el pago de un boleto o una encomienda. Al tocar el
            aviso se abre «Pagos por verificar». Actívalas en cada equipo donde uses el panel; en iPhone solo
            funcionan con el panel instalado en la pantalla de inicio.
          </span>
        </p>
      </CardContent>
    </Card>
  );
}
