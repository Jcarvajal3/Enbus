"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { 
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { 
  PencilSimple, 
  HandPalm, 
  CheckCircle, 
  Trash, 
  EnvelopeSimple, 
  Copy, 
  Check, 
  UploadSimple 
} from "@phosphor-icons/react";
import { 
  updateCooperativa, 
  changeCooperativaEstado, 
  inviteCooperativaAdmin 
} from "@/app/admin/(panel)/cooperativas/actions";
import { toast } from "sonner";
import type { Cooperativa, EstadoCooperativa } from "@/lib/types/admin-cooperativas";

interface CooperativaActionsProps {
  cooperativa: Cooperativa;
}

export function CooperativaActions({ cooperativa }: CooperativaActionsProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  // Edit State
  const [editOpen, setEditOpen] = useState(false);
  const [logoPreview, setLogoPreview] = useState<string | null>(cooperativa.logo_url);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Invite State
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setLogoPreview(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handleEditSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    const formData = new FormData(e.currentTarget);

    try {
      const res = await updateCooperativa(cooperativa.id, formData);
      if (res.success) {
        toast.success("Cooperativa actualizada correctamente");
        setEditOpen(false);
        router.refresh();
      } else {
        toast.error(res.error || "Error al actualizar la cooperativa");
      }
    } catch {
      toast.error("Error al actualizar la cooperativa");
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = async (nuevoEstado: EstadoCooperativa) => {
    setLoading(true);
    try {
      const res = await changeCooperativaEstado(cooperativa.id, nuevoEstado);
      if (res.success) {
        toast.success(`Estado cambiado a ${nuevoEstado.toLowerCase()}`);
        router.refresh();
      } else {
        toast.error(res.error || "Error al cambiar el estado");
      }
    } catch {
      toast.error("Error de comunicación con el servidor");
    } finally {
      setLoading(false);
    }
  };

  const handleInviteSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    const formData = new FormData(e.currentTarget);
    const email = formData.get("email") as string;

    try {
      const res = await inviteCooperativaAdmin(cooperativa.id, email);
      if (res.success && res.invite_link) {
        setInviteLink(`${window.location.origin}${res.invite_link}`);
        toast.success("Invitación creada");
      } else {
        toast.error(res.error || "Error al enviar la invitación");
      }
    } catch {
      toast.error("Error al enviar la invitación");
    } finally {
      setLoading(false);
    }
  };

  const copyInviteLink = async () => {
    if (inviteLink) {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      toast.success("Enlace de invitación copiado");
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const isActive = cooperativa.estado === "ACTIVA";
  const isSuspended = cooperativa.estado === "SUSPENDIDA";
  const isDeactivated = cooperativa.estado === "DESACTIVADA";

  if (isDeactivated) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-sm text-slate-500 italic">Esta cooperativa ha sido desactivada permanentemente.</span>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      {/* Botón: Editar */}
      <Dialog open={editOpen} onOpenChange={(v) => { if (!loading) { setEditOpen(v); if (!v) setLogoPreview(cooperativa.logo_url); } }}>
        <DialogTrigger asChild>
          <Button variant="outline" className="border-slate-800 text-slate-200 hover:bg-slate-900">
            <PencilSimple className="mr-2 h-4 w-4" /> Editar Datos
          </Button>
        </DialogTrigger>
        <DialogContent className="bg-slate-950 border-slate-800 text-slate-100 max-w-md">
          <form onSubmit={handleEditSubmit} className="space-y-4">
            <DialogHeader>
              <DialogTitle className="text-slate-100 text-lg font-bold">Editar Cooperativa</DialogTitle>
              <DialogDescription className="text-slate-400">Modifica los datos generales de la cooperativa.</DialogDescription>
            </DialogHeader>

            <div className="flex flex-col items-center gap-2 py-2">
              <Avatar className="h-20 w-20 border border-slate-800 bg-slate-900">
                <AvatarImage src={logoPreview || ""} alt="Logo preview" />
                <AvatarFallback className="bg-slate-900 text-slate-500">
                  <UploadSimple className="h-8 w-8" />
                </AvatarFallback>
              </Avatar>
              <Button 
                type="button" 
                variant="outline" 
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                className="border-slate-800 text-slate-300 hover:bg-slate-900"
              >
                Cambiar Logo
              </Button>
              <input type="file" name="logo" ref={fileInputRef} onChange={handleLogoChange} accept="image/*" className="hidden" />
            </div>

            <div className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="nombre" className="text-slate-300">Nombre de la Cooperativa</Label>
                <Input id="nombre" name="nombre" defaultValue={cooperativa.nombre} required className="bg-slate-900 border-slate-800 text-slate-100" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="rif" className="text-slate-300">RIF</Label>
                <Input id="rif" name="rif" defaultValue={cooperativa.rif} required className="bg-slate-900 border-slate-800 text-slate-100" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="comision_porcentaje" className="text-slate-300">Comisión por Transacción (%)</Label>
                <Input id="comision_porcentaje" name="comision_porcentaje" type="number" step="0.01" min="0" max="100" defaultValue={cooperativa.comision_porcentaje} required className="bg-slate-900 border-slate-800 text-slate-100" />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button type="button" variant="outline" onClick={() => setEditOpen(false)} disabled={loading} className="border-slate-800 text-slate-400 hover:bg-slate-900">Cancelar</Button>
              <Button type="submit" disabled={loading} className="bg-emerald-600 hover:bg-emerald-500 text-white">{loading ? "Guardando..." : "Guardar Cambios"}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Botón: Invitar Administrador */}
      <Dialog open={inviteOpen} onOpenChange={(v) => { if (!loading) { setInviteOpen(v); if (!v) setInviteLink(null); } }}>
        <DialogTrigger asChild>
          <Button variant="outline" className="border-slate-800 text-slate-200 hover:bg-slate-900">
            <EnvelopeSimple className="mr-2 h-4 w-4" /> Invitar Administrador
          </Button>
        </DialogTrigger>
        <DialogContent className="bg-slate-950 border-slate-800 text-slate-100 max-w-md">
          {inviteLink ? (
            <div className="space-y-6 py-4 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-500">
                <CheckCircle className="h-8 w-8" />
              </div>
              <div className="space-y-2">
                <DialogTitle className="text-xl text-slate-100">Invitación Generada</DialogTitle>
                <DialogDescription className="text-slate-400">
                  Copia y comparte este enlace con el nuevo administrador de la cooperativa.
                </DialogDescription>
              </div>
              <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 p-3 rounded-lg">
                <span className="text-sm text-slate-300 truncate flex-1 text-left">{inviteLink}</span>
                <Button onClick={copyInviteLink} size="sm" variant="secondary" className="bg-slate-800 text-slate-200 hover:bg-slate-700">
                  {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
              <Button onClick={() => setInviteOpen(false)} className="w-full bg-emerald-600 hover:bg-emerald-500 text-white">Cerrar</Button>
            </div>
          ) : (
            <form onSubmit={handleInviteSubmit} className="space-y-4">
              <DialogHeader>
                <DialogTitle className="text-slate-100">Invitar Administrador</DialogTitle>
                <DialogDescription className="text-slate-400">
                  Introduce el correo electrónico para invitar a un nuevo administrador a {cooperativa.nombre}.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-1">
                <Label htmlFor="email" className="text-slate-300">Correo Electrónico</Label>
                <Input id="email" name="email" type="email" placeholder="admin@cooperativa.com" required className="bg-slate-900 border-slate-800 text-slate-100" />
              </div>
              <div className="flex justify-end gap-2 pt-4">
                <Button type="button" variant="outline" onClick={() => setInviteOpen(false)} className="border-slate-800 text-slate-400 hover:bg-slate-900">Cancelar</Button>
                <Button type="submit" disabled={loading} className="bg-emerald-600 hover:bg-emerald-500 text-white">Generar Invitación</Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Botón: Suspender o Reactivar */}
      {isActive && (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline" className="border-amber-900/30 text-amber-500 hover:bg-amber-950/20 hover:text-amber-400">
              <HandPalm className="mr-2 h-4 w-4" /> Suspender
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent className="bg-slate-950 border-slate-800 text-slate-100">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-slate-100">¿Suspender Cooperativa?</AlertDialogTitle>
              <AlertDialogDescription className="text-slate-400">
                Al suspender a la cooperativa **{cooperativa.nombre}**, no podrá realizar nuevas ventas de boletos o despachar encomiendas de manera temporal.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="border-slate-800 text-slate-400 hover:bg-slate-900 hover:text-slate-300">Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={() => handleStatusChange("SUSPENDIDA")} className="bg-amber-600 hover:bg-amber-500 text-white">
                Suspender Temporalmente
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {isSuspended && (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline" className="border-emerald-900/30 text-emerald-500 hover:bg-emerald-950/20 hover:text-emerald-400">
              <CheckCircle className="mr-2 h-4 w-4" /> Reactivar
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent className="bg-slate-950 border-slate-800 text-slate-100">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-slate-100">¿Reactivar Cooperativa?</AlertDialogTitle>
              <AlertDialogDescription className="text-slate-400">
                Esto restaurará por completo el acceso y operatividad de la cooperativa **{cooperativa.nombre}**.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="border-slate-800 text-slate-400 hover:bg-slate-900 hover:text-slate-300">Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={() => handleStatusChange("ACTIVA")} className="bg-emerald-600 hover:bg-emerald-500 text-white">
                Reactivar Cooperativa
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {/* Botón: Desactivar */}
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="destructive" className="bg-rose-950/40 border border-rose-900/50 text-rose-400 hover:bg-rose-950/80">
            <Trash className="mr-2 h-4 w-4" /> Desactivar
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent className="bg-slate-950 border-slate-800 text-slate-100">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-slate-100 text-rose-500 font-bold">⚠️ ADVERTENCIA CRÍTICA</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              ¿Estás seguro de que deseas desactivar a **{cooperativa.nombre}**? 
              <span className="block mt-2 font-semibold text-rose-400">Esta acción es irreversible y permanente. La cooperativa no podrá reactivarse ni operar en la plataforma.</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-slate-800 text-slate-400 hover:bg-slate-900 hover:text-slate-300">Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => handleStatusChange("DESACTIVADA")} className="bg-rose-600 hover:bg-rose-500 text-white">
              Desactivar Permanentemente
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
