"use client";

// ─── Acciones de la ficha de un usuario (AD5-10, D13) ───────────────────────
// La cabecera solo trae lo que es de la cuenta: "Reactivar cuenta" o
// "Completar baja" como principal y "Suspender cuenta" en "Más". Desbloquear y
// reenviar el PIN son de cada encomienda: van en su fila (`AccionesPinEncomienda`).

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Key, PaperPlaneTilt, UserMinus, UserPlus } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { MenuMas } from "@/components/admin/menu-mas";
import { desbloquearPIN, reenviarPIN, toggleUsuarioEstado } from "@/app/admin/(panel)/usuarios/actions";
import { humanizeError } from "@/lib/errores";
import { avisarError, avisarExito } from "@/lib/avisos";
import { etiquetaRol } from "@/lib/estados";
import { PIN_MAX_INTENTOS } from "@/lib/artefactos.generated";
import type { EncomiendaUsuario, Usuario } from "@/lib/types/admin-usuarios";
import { ConfirmDialogBaja } from "./usuarios-table";

interface UsuarioActionsProps {
  usuarioId: string;
  nombre: string;
  email?: string | null;
  /** Eliminó su cuenta desde la app y falta borrar su acceso. */
  bajaPendiente?: boolean;
  /** Cuenta eliminada desde la app (ya no se suspende ni reactiva). */
  eliminada?: boolean;
  role: Usuario["role"];
  isBanned: boolean;
}

export function UsuarioActions({
  usuarioId,
  nombre,
  email = null,
  bajaPendiente = false,
  eliminada = false,
  role,
  isBanned,
}: UsuarioActionsProps) {
  const router = useRouter();
  const [estadoOpen, setEstadoOpen] = useState(false);
  const [bajaOpen, setBajaOpen] = useState(false);
  const esAdmin = role === "admin_cooperativa" || role === "super_admin";

  if (eliminada && !bajaPendiente) return null;

  return (
    <>
      {bajaPendiente ? (
        <Button variant="outline" onClick={() => setBajaOpen(true)}>
          <UserMinus aria-hidden /> Completar baja
        </Button>
      ) : isBanned ? (
        <Button onClick={() => setEstadoOpen(true)}>
          <UserPlus aria-hidden /> Reactivar cuenta
        </Button>
      ) : (
        <MenuMas>
          <DropdownMenuItem variant="destructive" onClick={() => setEstadoOpen(true)}>
            <UserMinus aria-hidden /> Suspender cuenta
          </DropdownMenuItem>
        </MenuMas>
      )}

      <ConfirmDialogBaja
        usuario={bajaOpen ? { id: usuarioId, nombre_completo: nombre, email: email ?? undefined } : null}
        onClose={() => setBajaOpen(false)}
        onHecho={() => router.refresh()}
      />

      {isBanned ? (
        <ConfirmDialog
          open={estadoOpen}
          onOpenChange={setEstadoOpen}
          titulo={`¿Reactivar la cuenta de ${nombre}?`}
          descripcion="Podrá volver a entrar a la app o al panel de inmediato."
          verbo="Reactivar cuenta"
          verboCargando="Reactivando…"
          onConfirm={async () => {
            const res = await toggleUsuarioEstado(usuarioId, true);
            if (!res.success) return { ok: false, error: res.error };
            avisarExito(`La cuenta de ${nombre} está activa de nuevo.`);
            router.refresh();
            return { ok: true };
          }}
        />
      ) : (
        <ConfirmDialog
          open={estadoOpen}
          onOpenChange={setEstadoOpen}
          titulo={`¿Suspender la cuenta de ${nombre}?`}
          descripcion={
            esAdmin ? (
              <>
                Es <strong className="font-semibold">{etiquetaRol(role)}</strong>: deja de entrar al panel y su cooperativa
                puede quedarse sin quien la administre.
              </>
            ) : (
              "No podrá entrar a la app hasta que la reactives."
            )
          }
          impacto={[
            "Se cierra su acceso: no podrá iniciar sesión.",
            "Su historial de boletos, encomiendas y pagos se conserva.",
            "Puedes reactivarla cuando quieras.",
          ]}
          motivo={{
            etiqueta: "Motivo de la suspensión",
            placeholder: "Ej.: Pagos con referencias falsas.",
            chips: ["Pagos falsos o duplicados", "Uso indebido de la cuenta", "Lo pidió el usuario", "Otro"],
          }}
          confirmarEscribiendo={esAdmin ? nombre : undefined}
          verbo="Suspender cuenta"
          verboCargando="Suspendiendo…"
          tono="destructive"
          onConfirm={async (motivo) => {
            const res = await toggleUsuarioEstado(usuarioId, false, motivo);
            if (!res.success) return { ok: false, error: res.error };
            avisarExito(`Cuenta de ${nombre} suspendida.`);
            router.refresh();
            return { ok: true };
          }}
        />
      )}
    </>
  );
}

const ESTADOS_CERRADOS = ["ENTREGADA", "CANCELADA", "DEVUELTA"];

/** true si la fila de la encomienda tiene alguna acción de PIN. */
export function tieneAccionPin(e: EncomiendaUsuario): boolean {
  if (ESTADOS_CERRADOS.includes(e.estado)) return false;
  return e.pin_bloqueado || e.intentos_pin > 0 || Boolean(e.pin_retiro);
}

/** "Desbloquear PIN" (con intentos fallidos) o "Reenviar PIN" (con PIN activo) en la fila de una encomienda. */
export function AccionesPinEncomienda({ encomienda: e }: { encomienda: EncomiendaUsuario }) {
  const router = useRouter();
  const [desbloquearOpen, setDesbloquearOpen] = useState(false);
  const [reenviando, setReenviando] = useState(false);
  const enCurso = useRef(false);

  if (!tieneAccionPin(e)) return null;
  const conIntentos = e.pin_bloqueado || e.intentos_pin > 0;

  const reenviar = async () => {
    if (enCurso.current) return;
    enCurso.current = true;
    setReenviando(true);
    try {
      const res = await reenviarPIN(e.id);
      if (!res.success) {
        avisarError(res.error || "No pudimos reenviar el PIN. Intenta de nuevo.");
      } else if (res.enviado) {
        if (res.fallidos && res.fallidos.length > 0) toast.warning(res.message || "PIN reenviado, pero un canal falló.");
        else avisarExito(res.message || "PIN reenviado.");
      } else {
        toast.warning(res.message || "No pudimos enviar el PIN. Dáselo por otro medio.", { closeButton: true });
      }
    } catch (err) {
      avisarError(humanizeError(err, "reenviar el PIN"));
    } finally {
      enCurso.current = false;
      setReenviando(false);
    }
  };

  return (
    <div className="relative z-10 flex items-center justify-end gap-2">
      {conIntentos ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => setDesbloquearOpen(true)}
          aria-label={`Desbloquear PIN de ${e.tracking_id}`}
        >
          <Key aria-hidden /> Desbloquear PIN
        </Button>
      ) : (
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={reenviar}
          disabled={reenviando}
          aria-busy={reenviando || undefined}
          aria-label={`Reenviar PIN de ${e.tracking_id}`}
        >
          {reenviando ? <Spinner size="sm" aria-hidden /> : <PaperPlaneTilt aria-hidden />}
          {reenviando ? "Reenviando…" : "Reenviar PIN"}
        </Button>
      )}
      {/* Con intentos fallidos y PIN activo, reenviar queda en "⋯". */}
      {conIntentos && e.pin_retiro && (
        <MenuMas enFila etiqueta={`Más acciones para ${e.tracking_id}`}>
          <DropdownMenuItem onClick={reenviar} disabled={reenviando}>
            <PaperPlaneTilt aria-hidden /> Reenviar PIN
          </DropdownMenuItem>
        </MenuMas>
      )}

      <ConfirmDialog
        open={desbloquearOpen}
        onOpenChange={setDesbloquearOpen}
        titulo={`¿Desbloquear el PIN de ${e.tracking_id}?`}
        descripcion={`Quien retira podrá intentar el PIN otra vez (hasta ${PIN_MAX_INTENTOS} intentos). Hazlo solo si confirmaste su identidad.`}
        motivo={{
          etiqueta: "Motivo",
          placeholder: "Ej.: El destinatario confirmó su cédula por WhatsApp.",
          chips: ["Destinatario verificado por teléfono", "Se equivocó al escribir el PIN", "Otro"],
        }}
        verbo="Desbloquear PIN"
        verboCargando="Desbloqueando…"
        onConfirm={async (motivo) => {
          const res = await desbloquearPIN(e.id, motivo ?? "");
          if (!res.success) return { ok: false, error: res.error };
          avisarExito(`PIN de ${e.tracking_id} desbloqueado.`);
          router.refresh();
          return { ok: true };
        }}
      />
    </div>
  );
}
