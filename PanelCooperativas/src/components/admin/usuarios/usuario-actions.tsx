"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Key, PaperPlaneTilt, SpinnerIcon, UserMinus, UserPlus } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { StatusBadge } from "@/components/status-badge";
import { desbloquearPIN, reenviarPIN, toggleUsuarioEstado } from "@/app/admin/(panel)/usuarios/actions";
import { humanizeError } from "@/lib/errores";
import { etiquetaRol } from "@/lib/estados";
import type { EncomiendaUsuario, Usuario } from "@/lib/types/admin-usuarios";

interface UsuarioActionsProps {
  usuarioId: string;
  nombre: string;
  role: Usuario["role"];
  isBanned: boolean;
  encomiendasEnviadas: EncomiendaUsuario[];
  encomiendasRecibidas: EncomiendaUsuario[];
}

const ESTADOS_CERRADOS = ["ENTREGADA", "CANCELADA", "DEVUELTA"];

export function UsuarioActions({
  usuarioId,
  nombre,
  role,
  isBanned,
  encomiendasEnviadas,
  encomiendasRecibidas,
}: UsuarioActionsProps) {
  const router = useRouter();
  const [estadoOpen, setEstadoOpen] = useState(false);
  const [unlockListOpen, setUnlockListOpen] = useState(false);
  const [resendListOpen, setResendListOpen] = useState(false);
  const [aDesbloquear, setADesbloquear] = useState<EncomiendaUsuario | null>(null);
  const [reenviandoId, setReenviandoId] = useState<string | null>(null);
  const reenviando = useRef(false);

  // Sin duplicados (una encomienda puede estar en enviadas y recibidas).
  const activas = Array.from(
    new Map([...encomiendasEnviadas, ...encomiendasRecibidas].map((e) => [e.id, e])).values()
  ).filter((e) => !ESTADOS_CERRADOS.includes(e.estado));

  const bloqueables = activas.filter((e) => e.pin_bloqueado || e.intentos_pin > 0);
  const conPin = activas.filter((e) => e.pin_retiro);
  const esAdmin = role === "admin_cooperativa" || role === "super_admin";

  const reenviar = async (e: EncomiendaUsuario) => {
    if (reenviando.current) return;
    reenviando.current = true;
    setReenviandoId(e.id);
    try {
      const res = await reenviarPIN(e.id);
      if (!res.success) {
        toast.error(res.error || "No pudimos reenviar el PIN. Intenta de nuevo.");
      } else if (res.enviado) {
        toast.success(res.message || "PIN reenviado.");
        setResendListOpen(false);
      } else {
        toast.warning(res.message || "No pudimos enviar el PIN. Dáselo por otro medio.");
      }
    } catch (err) {
      toast.error(humanizeError(err, "reenviar el PIN"));
    } finally {
      reenviando.current = false;
      setReenviandoId(null);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button
        variant="outline"
        onClick={() => setUnlockListOpen(true)}
        className="gap-2"
        disabled={bloqueables.length === 0}
        title={bloqueables.length === 0 ? "No tiene encomiendas con intentos fallidos de PIN." : undefined}
      >
        <Key className="h-4 w-4" aria-hidden /> Desbloquear PIN
      </Button>

      <Button
        variant="outline"
        onClick={() => setResendListOpen(true)}
        className="gap-2"
        disabled={conPin.length === 0}
        title={conPin.length === 0 ? "No tiene encomiendas activas con PIN." : undefined}
      >
        <PaperPlaneTilt className="h-4 w-4" aria-hidden /> Reenviar PIN
      </Button>

      {isBanned ? (
        <Button className="gap-2" onClick={() => setEstadoOpen(true)}>
          <UserPlus className="h-4 w-4" aria-hidden /> Reactivar cuenta
        </Button>
      ) : (
        <Button
          variant="outline"
          className="gap-2 border-destructive/40 text-destructive-text hover:bg-destructive/10"
          onClick={() => setEstadoOpen(true)}
        >
          <UserMinus className="h-4 w-4" aria-hidden /> Suspender cuenta
        </Button>
      )}

      {/* Suspender / reactivar */}
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
            toast.success(`La cuenta de ${nombre} está activa de nuevo.`);
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
                Es <strong>{etiquetaRol(role)}</strong>: al suspenderla deja de entrar al panel y su cooperativa puede
                quedarse sin quien la administre.
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
            placeholder: "Por ejemplo: pagos con referencias falsas.",
            chips: ["Pagos falsos o duplicados", "Uso indebido de la cuenta", "Lo pidió el usuario", "Otro"],
          }}
          confirmarEscribiendo={esAdmin ? nombre : undefined}
          verbo="Suspender cuenta"
          verboCargando="Suspendiendo…"
          tono="destructive"
          onConfirm={async (motivo) => {
            const res = await toggleUsuarioEstado(usuarioId, false, motivo);
            if (!res.success) return { ok: false, error: res.error };
            toast.success(`Cuenta de ${nombre} suspendida.`);
            router.refresh();
            return { ok: true };
          }}
        />
      )}

      {/* Elegir la encomienda cuyo PIN se desbloquea */}
      <Dialog open={unlockListOpen} onOpenChange={setUnlockListOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Desbloquear PIN</DialogTitle>
            <DialogDescription>
              Reinicia los intentos fallidos del PIN de retiro. Elige la encomienda.
            </DialogDescription>
          </DialogHeader>
          <ul className="divide-y rounded-lg border">
            {bloqueables.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
                <div className="min-w-0 text-sm">
                  <p className="font-mono font-semibold">{e.tracking_id}</p>
                  <p className="text-muted-foreground">
                    Para {e.receiver_nombre} · {e.intentos_pin} {e.intentos_pin === 1 ? "intento fallido" : "intentos fallidos"}
                    {e.pin_bloqueado ? " · PIN bloqueado" : ""}
                  </p>
                  <StatusBadge status={e.estado} dominio="encomienda" className="mt-1" />
                </div>
                <Button
                  size="sm"
                  onClick={() => {
                    setUnlockListOpen(false);
                    setADesbloquear(e);
                  }}
                >
                  Desbloquear
                </Button>
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={aDesbloquear !== null}
        onOpenChange={(v) => !v && setADesbloquear(null)}
        titulo={`¿Desbloquear el PIN de ${aDesbloquear?.tracking_id ?? "la encomienda"}?`}
        descripcion="Quien retira podrá intentar el PIN otra vez (hasta 10 intentos). Hazlo solo si confirmaste su identidad."
        motivo={{
          etiqueta: "Motivo",
          placeholder: "Por ejemplo: el destinatario confirmó su cédula por WhatsApp.",
          chips: ["Destinatario verificado por teléfono", "Se equivocó al escribir el PIN", "Otro"],
        }}
        verbo="Desbloquear PIN"
        verboCargando="Desbloqueando…"
        onConfirm={async (motivo) => {
          if (!aDesbloquear) return { ok: false };
          const res = await desbloquearPIN(aDesbloquear.id, motivo ?? "");
          if (!res.success) return { ok: false, error: res.error };
          toast.success(`PIN de ${aDesbloquear.tracking_id} desbloqueado.`);
          router.refresh();
          return { ok: true };
        }}
      />

      {/* Reenviar PIN */}
      <Dialog open={resendListOpen} onOpenChange={(v) => !reenviandoId && setResendListOpen(v)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Reenviar PIN de retiro</DialogTitle>
            <DialogDescription>
              Enviamos el mismo PIN por WhatsApp a quien recibe (no se genera uno nuevo). Elige la encomienda.
            </DialogDescription>
          </DialogHeader>
          <ul className="divide-y rounded-lg border">
            {conPin.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
                <div className="min-w-0 text-sm">
                  <p className="font-mono font-semibold">{e.tracking_id}</p>
                  <p className="text-muted-foreground">
                    Para {e.receiver_nombre} · {e.receiver_telefono}
                  </p>
                </div>
                <Button
                  size="sm"
                  onClick={() => reenviar(e)}
                  disabled={reenviandoId !== null}
                  aria-busy={reenviandoId === e.id || undefined}
                >
                  {reenviandoId === e.id && <SpinnerIcon className="animate-spin" aria-hidden />}
                  {reenviandoId === e.id ? "Reenviando…" : "Reenviar PIN"}
                </Button>
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>
    </div>
  );
}
