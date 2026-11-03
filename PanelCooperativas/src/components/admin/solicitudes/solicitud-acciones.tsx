"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowCounterClockwise, Check, Prohibit, X } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { MenuMas } from "@/components/admin/menu-mas";
import { descartarSolicitud, reabrirSolicitud } from "@/app/admin/(panel)/solicitudes/actions";
import { humanizeError } from "@/lib/errores";
import { avisarError, avisarExito } from "@/lib/avisos";
import type { Cooperativa } from "@/lib/types/admin-cooperativas";
import { AprobarDialog } from "./aprobar-dialog";
import { RechazarDialog } from "./rechazar-dialog";

type SolicitudBase = Pick<Cooperativa, "id" | "nombre" | "rif" | "estado">;

/** RECHAZADA → PENDIENTE. Reversible: se ejecuta directo y se confirma con un aviso. */
function ReabrirSolicitudButton({
  solicitud,
  enFila,
  onHecho,
}: {
  solicitud: SolicitudBase;
  enFila: boolean;
  onHecho?: () => void;
}) {
  const router = useRouter();
  const [cargando, setCargando] = useState(false);
  const enCurso = useRef(false);

  const reabrir = async () => {
    if (enCurso.current) return;
    enCurso.current = true;
    setCargando(true);
    try {
      const res = await reabrirSolicitud(solicitud.id);
      if (!res.success) {
        avisarError(res.error || "No pudimos reabrir la solicitud. Intenta de nuevo.");
        return;
      }
      avisarExito(`La solicitud de ${solicitud.nombre} volvió a «En revisión».`);
      onHecho?.();
      router.refresh();
    } catch (err) {
      avisarError(humanizeError(err, "reabrir la solicitud"));
    } finally {
      enCurso.current = false;
      setCargando(false);
    }
  };

  return (
    <Button
      type="button"
      size={enFila ? "sm" : "default"}
      variant={enFila ? "outline" : "default"}
      onClick={reabrir}
      disabled={cargando}
      aria-busy={cargando || undefined}
      aria-label={enFila ? `Reabrir la solicitud de ${solicitud.nombre}` : undefined}
    >
      {cargando ? <Spinner size="sm" aria-hidden /> : <ArrowCounterClockwise aria-hidden />}
      {cargando ? "Reabriendo…" : "Reabrir solicitud"}
    </Button>
  );
}

/** → DESACTIVADA. Irreversible: motivo y escribir el nombre. */
function DescartarDialog({
  solicitud,
  open,
  onOpenChange,
  onHecho,
}: {
  solicitud: SolicitudBase;
  open: boolean;
  onOpenChange(v: boolean): void;
  onHecho?: () => void;
}) {
  const router = useRouter();
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      titulo={`¿Descartar la solicitud de ${solicitud.nombre}?`}
      descripcion="Úsalo si la solicitud es falsa, está repetida o la cooperativa desistió."
      impacto={[
        "La cooperativa queda desactivada para siempre: no se puede reabrir.",
        "Su cuenta no podrá operar en EnBus.",
        "Si quiere afiliarse más adelante, tendrá que registrarse de nuevo.",
      ]}
      motivo={{
        etiqueta: "Motivo",
        placeholder: "Ej.: Solicitud repetida de otra cooperativa ya registrada.",
        chips: ["Solicitud repetida", "Datos falsos", "La cooperativa desistió", "Otro"],
      }}
      confirmarEscribiendo={solicitud.nombre}
      verbo="Descartar solicitud"
      verboCargando="Descartando…"
      tono="destructive"
      onConfirm={async (motivo) => {
        const res = await descartarSolicitud(solicitud.id, motivo ?? "");
        if (!res.success) return { ok: false, error: res.error };
        avisarExito(`Solicitud de ${solicitud.nombre} descartada.`);
        onHecho?.();
        router.refresh();
        return { ok: true };
      }}
    />
  );
}

/**
 * Acciones de una solicitud según su estado.
 * - `fila`: última columna de la tabla ("Aprobar" / "Reabrir" `outline sm` + "⋯").
 * - `cabecera`: detalle de la cooperativa y hoja de la solicitud (1 `default` + 1 `outline` + "Más").
 */
export function SolicitudAcciones({
  solicitud,
  onHecho,
  variante = "cabecera",
}: {
  solicitud: SolicitudBase;
  onHecho?: () => void;
  variante?: "fila" | "cabecera";
}) {
  const [rechazarOpen, setRechazarOpen] = useState(false);
  const [descartarOpen, setDescartarOpen] = useState(false);
  const enFila = variante === "fila";
  const rechazada = solicitud.estado === "RECHAZADA";

  return (
    <div className={enFila ? "flex items-center justify-end gap-1" : "flex flex-wrap items-center justify-end gap-2"}>
      {rechazada ? (
        <ReabrirSolicitudButton solicitud={solicitud} enFila={enFila} onHecho={onHecho} />
      ) : (
        <AprobarDialog
          cooperativaId={solicitud.id}
          nombre={solicitud.nombre}
          rif={solicitud.rif}
          onHecho={onHecho}
          trigger={
            <Button
              type="button"
              size={enFila ? "sm" : "default"}
              variant={enFila ? "outline" : "default"}
              aria-label={enFila ? `Aprobar la solicitud de ${solicitud.nombre}` : undefined}
            >
              <Check aria-hidden /> Aprobar
            </Button>
          }
        />
      )}

      {!rechazada && !enFila && (
        <Button type="button" variant="outline" onClick={() => setRechazarOpen(true)}>
          <X aria-hidden /> Rechazar
        </Button>
      )}

      <MenuMas enFila={enFila} etiqueta={`Más acciones para ${solicitud.nombre}`}>
        {!rechazada && enFila && (
          <DropdownMenuItem onClick={() => setRechazarOpen(true)}>
            <X aria-hidden /> Rechazar
          </DropdownMenuItem>
        )}
        <DropdownMenuItem variant="destructive" onClick={() => setDescartarOpen(true)}>
          <Prohibit aria-hidden /> Descartar solicitud
        </DropdownMenuItem>
      </MenuMas>

      {!rechazada && (
        <RechazarDialog
          cooperativaId={solicitud.id}
          nombre={solicitud.nombre}
          open={rechazarOpen}
          onOpenChange={setRechazarOpen}
          onHecho={onHecho}
        />
      )}
      <DescartarDialog solicitud={solicitud} open={descartarOpen} onOpenChange={setDescartarOpen} onHecho={onHecho} />
    </div>
  );
}
