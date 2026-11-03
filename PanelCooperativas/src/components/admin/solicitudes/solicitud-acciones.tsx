"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowCounterClockwise, SpinnerIcon, Trash } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { descartarSolicitud, reabrirSolicitud } from "@/app/admin/(panel)/solicitudes/actions";
import { humanizeError } from "@/lib/errores";
import type { SolicitudPendiente } from "@/lib/types/admin-solicitudes";
import { AprobarDialog } from "./aprobar-dialog";
import { RechazarDialog } from "./rechazar-dialog";

/** RECHAZADA → PENDIENTE. Reversible: se ejecuta directo y se confirma con un aviso. */
export function ReabrirSolicitudButton({ cooperativaId, nombre, onHecho }: { cooperativaId: string; nombre: string; onHecho?: () => void }) {
  const router = useRouter();
  const [cargando, setCargando] = useState(false);
  const enCurso = useRef(false);

  const reabrir = async () => {
    if (enCurso.current) return;
    enCurso.current = true;
    setCargando(true);
    try {
      const res = await reabrirSolicitud(cooperativaId);
      if (!res.success) {
        toast.error(res.error || "No pudimos reabrir la solicitud. Intenta de nuevo.");
        return;
      }
      toast.success(`La solicitud de ${nombre} volvió a «En revisión».`);
      onHecho?.();
      router.refresh();
    } catch (err) {
      toast.error(humanizeError(err, "reabrir la solicitud"));
    } finally {
      enCurso.current = false;
      setCargando(false);
    }
  };

  return (
    <Button size="sm" variant="outline" className="gap-1.5" onClick={reabrir} disabled={cargando} aria-busy={cargando || undefined}>
      {cargando ? <SpinnerIcon className="size-4 animate-spin" aria-hidden /> : <ArrowCounterClockwise className="size-4" aria-hidden />}
      {cargando ? "Reabriendo…" : "Reabrir solicitud"}
    </Button>
  );
}

/** → DESACTIVADA. Irreversible: motivo y escribir el nombre. */
export function DescartarSolicitudButton({ cooperativaId, nombre, onHecho }: { cooperativaId: string; nombre: string; onHecho?: () => void }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        className="gap-1.5 border-destructive/40 text-destructive-text hover:bg-destructive/10"
        onClick={() => setOpen(true)}
      >
        <Trash className="size-4" aria-hidden /> Descartar solicitud
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        titulo={`¿Descartar la solicitud de ${nombre}?`}
        descripcion="Úsalo solo si la solicitud es falsa, está repetida o la cooperativa ya no quiere afiliarse."
        impacto={[
          "La cooperativa queda desactivada para siempre: no se puede reabrir.",
          "Su cuenta no podrá operar en EnBus.",
          "Si quiere afiliarse más adelante, tendrá que registrarse de nuevo.",
        ]}
        motivo={{
          etiqueta: "Motivo",
          placeholder: "Por ejemplo: solicitud repetida de otra cooperativa ya registrada.",
          chips: ["Solicitud repetida", "Datos falsos", "La cooperativa desistió", "Otro"],
        }}
        confirmarEscribiendo={nombre}
        verbo="Descartar solicitud"
        verboCargando="Descartando…"
        tono="destructive"
        onConfirm={async (motivo) => {
          const res = await descartarSolicitud(cooperativaId, motivo ?? "");
          if (!res.success) return { ok: false, error: res.error };
          toast.success(`Solicitud de ${nombre} descartada.`);
          onHecho?.();
          router.refresh();
          return { ok: true };
        }}
      />
    </>
  );
}

/** Acciones según el estado de la solicitud (fila de la tabla y hoja lateral). */
export function SolicitudAcciones({
  solicitud,
  onHecho,
  conDescartar = false,
}: {
  solicitud: SolicitudPendiente;
  onHecho?: () => void;
  /** En la hoja lateral, una solicitud en revisión también se puede descartar. */
  conDescartar?: boolean;
}) {
  if (solicitud.estado === "RECHAZADA") {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <ReabrirSolicitudButton cooperativaId={solicitud.id} nombre={solicitud.nombre} onHecho={onHecho} />
        <DescartarSolicitudButton cooperativaId={solicitud.id} nombre={solicitud.nombre} onHecho={onHecho} />
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <AprobarDialog cooperativaId={solicitud.id} nombre={solicitud.nombre} rif={solicitud.rif} onHecho={onHecho} />
      <RechazarDialog cooperativaId={solicitud.id} nombre={solicitud.nombre} onHecho={onHecho} />
      {conDescartar && (
        <DescartarSolicitudButton cooperativaId={solicitud.id} nombre={solicitud.nombre} onHecho={onHecho} />
      )}
    </div>
  );
}
