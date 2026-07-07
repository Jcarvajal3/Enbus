"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { 
  Key, 
  PaperPlaneTilt, 
  UserMinus, 
  UserPlus, 
  CircleNotch 
} from "@phosphor-icons/react";
import { 
  desbloquearPIN, 
  reenviarPIN, 
  toggleUsuarioEstado 
} from "@/app/admin/(panel)/usuarios/actions";
import type { EncomiendaUsuario } from "@/lib/types/admin-usuarios";

interface UsuarioActionsProps {
  usuarioId: string;
  isBanned: boolean;
  encomiendasEnviadas: EncomiendaUsuario[];
  encomiendasRecibidas: EncomiendaUsuario[];
}

export function UsuarioActions({ 
  usuarioId, 
  isBanned, 
  encomiendasEnviadas, 
  encomiendasRecibidas 
}: UsuarioActionsProps) {
  const [isPending, startTransition] = useTransition();

  // Dialog States
  const [showBanAlert, setShowBanAlert] = useState(false);
  const [showUnlockDialog, setShowUnlockDialog] = useState(false);
  const [showResendDialog, setShowResendDialog] = useState(false);

  // Form selections
  const [selectedUnlockId, setSelectedUnlockId] = useState<string>("");
  const [selectedResendId, setSelectedResendId] = useState<string>("");

  // Filter encomiendas
  const activeEncomiendas = [...encomiendasEnviadas, ...encomiendasRecibidas].filter(
    (e) => !["ENTREGADA", "CANCELADA", "DEVUELTA"].includes(e.estado)
  );

  const lockableEncomiendas = activeEncomiendas.filter(
    (e) => e.pin_bloqueado || e.intentos_pin > 0
  );

  const sendableEncomiendas = activeEncomiendas.filter(
    (e) => e.pin_retiro
  );

  // Handlers
  const handleToggleBan = () => {
    startTransition(async () => {
      try {
        const res = await toggleUsuarioEstado(usuarioId, isBanned);
        if (res.success) {
          toast.success(isBanned ? "Usuario reactivado correctamente" : "Usuario suspendido correctamente");
          setShowBanAlert(false);
        } else {
          toast.error(res.error || "Ocurrió un error al cambiar el estado del usuario");
        }
      } catch (err) {
        console.error("Error toggling ban state:", err);
        toast.error("Error de comunicación con el servidor");
      }
    });
  };

  const handleUnlockPin = () => {
    if (!selectedUnlockId) {
      toast.warning("Selecciona una encomienda para desbloquear");
      return;
    }
    startTransition(async () => {
      try {
        const res = await desbloquearPIN(selectedUnlockId);
        if (res.success) {
          toast.success("PIN de encomienda desbloqueado correctamente");
          setShowUnlockDialog(false);
          setSelectedUnlockId("");
        } else {
          toast.error(res.error || "Ocurrió un error al desbloquear el PIN");
        }
      } catch (err) {
        console.error("Error unlocking PIN:", err);
        toast.error("Error de comunicación con el servidor");
      }
    });
  };

  const handleResendPin = () => {
    if (!selectedResendId) {
      toast.warning("Selecciona una encomienda para reenviar el PIN");
      return;
    }
    startTransition(async () => {
      try {
        const res = await reenviarPIN(selectedResendId);
        if (res.success) {
          toast.success(res.message || "PIN reenviado correctamente");
          setShowResendDialog(false);
          setSelectedResendId("");
        } else {
          toast.error(res.error || "Ocurrió un error al reenviar el PIN");
        }
      } catch (err) {
        console.error("Error resending PIN:", err);
        toast.error("Error de comunicación con el servidor");
      }
    });
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      {/* Action 1: Unlock PIN (Only show button if user has locked/failed active packages) */}
      <Button
        variant="outline"
        onClick={() => setShowUnlockDialog(true)}
        className="bg-slate-900 border-slate-800 text-amber-500 hover:bg-slate-800 hover:text-amber-400 gap-2"
        disabled={lockableEncomiendas.length === 0}
        title={lockableEncomiendas.length === 0 ? "No hay encomiendas bloqueadas para este usuario" : ""}
      >
        <Key className="h-4 w-4" /> Desbloquear PIN
      </Button>

      {/* Action 2: Resend PIN (Only show if user has active packages) */}
      <Button
        variant="outline"
        onClick={() => setShowResendDialog(true)}
        className="bg-slate-900 border-slate-800 text-sky-400 hover:bg-slate-800 hover:text-sky-300 gap-2"
        disabled={sendableEncomiendas.length === 0}
        title={sendableEncomiendas.length === 0 ? "No hay encomiendas activas para reenviar PIN" : ""}
      >
        <PaperPlaneTilt className="h-4 w-4" /> Reenviar PIN
      </Button>

      {/* Action 3: Toggle Ban (Suspender/Reactivar) */}
      <Button
        variant={isBanned ? "default" : "destructive"}
        onClick={() => setShowBanAlert(true)}
        className={isBanned ? "bg-emerald-600 hover:bg-emerald-500 text-white gap-2" : "gap-2"}
      >
        {isBanned ? (
          <>
            <UserPlus className="h-4 w-4" /> Reactivar Cuenta
          </>
        ) : (
          <>
            <UserMinus className="h-4 w-4" /> Suspender Cuenta
          </>
        )}
      </Button>

      {/* DIALOGS */}

      {/* 1. Toggle Ban AlertDialog */}
      <AlertDialog open={showBanAlert} onOpenChange={setShowBanAlert}>
        <AlertDialogContent className="bg-slate-950 border-slate-800 text-slate-100">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-slate-200">
              {isBanned ? "¿Reactivar cuenta de usuario?" : "¿Suspender cuenta de usuario?"}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400 text-sm">
              {isBanned
                ? "Esta acción restablecerá de inmediato el acceso del usuario al sistema y a su aplicación móvil."
                : "Esta acción suspenderá temporalmente el acceso del usuario. No podrá iniciar sesión en la aplicación. Su historial de encomiendas y boletos permanecerá intacto para resguardar la integridad referencial."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-slate-900 hover:bg-slate-800 text-slate-300 border-slate-800" disabled={isPending}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleToggleBan}
              className={isBanned ? "bg-emerald-600 hover:bg-emerald-500 text-white" : "bg-destructive hover:bg-destructive/80 text-white"}
              disabled={isPending}
            >
              {isPending ? (
                <CircleNotch className="h-4 w-4 animate-spin mr-2" />
              ) : null}
              {isBanned ? "Reactivar" : "Suspender"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 2. Unlock PIN Dialog */}
      <Dialog open={showUnlockDialog} onOpenChange={setShowUnlockDialog}>
        <DialogContent className="bg-slate-950 border-slate-800 text-slate-100">
          <DialogHeader>
            <DialogTitle className="text-slate-200">Desbloquear PIN de Encomienda</DialogTitle>
            <DialogDescription className="text-slate-400">
              Reinicia los intentos fallidos de PIN de retiro. Seleccione la encomienda afectada:
            </DialogDescription>
          </DialogHeader>

          <div className="py-4">
            <Select value={selectedUnlockId} onValueChange={(val) => setSelectedUnlockId(val ?? "")}>
              <SelectTrigger className="w-full bg-slate-900 border-slate-800 text-slate-200">
                <SelectValue placeholder="Seleccionar Encomienda" />
              </SelectTrigger>
              <SelectContent className="bg-slate-900 border-slate-800 text-slate-200">
                {lockableEncomiendas.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.tracking_id} - Dest: {e.receiver_nombre} ({e.intentos_pin} intentos) {e.pin_bloqueado ? "[BLOQUEADA]" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowUnlockDialog(false)}
              className="bg-slate-900 hover:bg-slate-800 text-slate-300 border-slate-800"
              disabled={isPending}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleUnlockPin}
              className="bg-amber-600 hover:bg-amber-500 text-white"
              disabled={!selectedUnlockId || isPending}
            >
              {isPending && <CircleNotch className="h-4 w-4 animate-spin mr-2" />}
              Desbloquear
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 3. Resend PIN Dialog */}
      <Dialog open={showResendDialog} onOpenChange={setShowResendDialog}>
        <DialogContent className="bg-slate-950 border-slate-800 text-slate-100">
          <DialogHeader>
            <DialogTitle className="text-slate-200">Reenviar PIN de Retiro</DialogTitle>
            <DialogDescription className="text-slate-400">
              Reenvía el PIN original del paquete por WhatsApp y notificaciones Push. Seleccione la encomienda:
            </DialogDescription>
          </DialogHeader>

          <div className="py-4">
            <Select value={selectedResendId} onValueChange={(val) => setSelectedResendId(val ?? "")}>
              <SelectTrigger className="w-full bg-slate-900 border-slate-800 text-slate-200">
                <SelectValue placeholder="Seleccionar Encomienda" />
              </SelectTrigger>
              <SelectContent className="bg-slate-900 border-slate-800 text-slate-200">
                {sendableEncomiendas.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.tracking_id} - Para: {e.receiver_nombre} ({e.receiver_telefono})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowResendDialog(false)}
              className="bg-slate-900 hover:bg-slate-800 text-slate-300 border-slate-800"
              disabled={isPending}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleResendPin}
              className="bg-sky-600 hover:bg-sky-500 text-white"
              disabled={!selectedResendId || isPending}
            >
              {isPending && <CircleNotch className="h-4 w-4 animate-spin mr-2" />}
              Reenviar PIN
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
