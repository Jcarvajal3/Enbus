"use client";

import { useState, useRef } from "react";
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger 
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, UploadSimple, Copy, Check, ShieldCheck } from "@phosphor-icons/react";
import { createCooperativa } from "@/app/admin/(panel)/cooperativas/actions";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export function CreateCooperativaDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        toast.error("El logo no debe pesar más de 2MB");
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setLogoPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    } else {
      setLogoPreview(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    
    try {
      const res = await createCooperativa(formData);
      
      if (!res.success) {
        toast.error(res.error || "Ocurrió un error al crear la cooperativa");
        setLoading(false);
        return;
      }

      toast.success("Cooperativa creada exitosamente");
      router.refresh();

      if (res.invite_link) {
        // Build the full invitation link
        const fullLink = `${window.location.origin}${res.invite_link}`;
        setInviteLink(fullLink);
      } else {
        setOpen(false);
        resetForm();
      }
    } catch (err) {
      console.error(err);
      toast.error("Error de red o del servidor");
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = async () => {
    if (inviteLink) {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      toast.success("Enlace de invitación copiado");
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const resetForm = () => {
    setLogoPreview(null);
    setInviteLink(null);
    setCopied(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => {
      if (!loading) {
        setOpen(v);
        if (!v) resetForm();
      }
    }}>
      <DialogTrigger asChild>
        <Button className="bg-emerald-600 hover:bg-emerald-500 text-white font-medium shadow-lg shadow-emerald-900/20">
          <Plus className="mr-2 h-4 w-4" /> Nueva Cooperativa
        </Button>
      </DialogTrigger>
      
      <DialogContent className="bg-slate-950 border-slate-800 text-slate-100 max-w-md overflow-hidden">
        {inviteLink ? (
          <div className="space-y-6 py-4 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-500">
              <ShieldCheck className="h-8 w-8" />
            </div>
            <div className="space-y-2">
              <DialogTitle className="text-xl text-center text-slate-100">¡Cooperativa Creada!</DialogTitle>
              <DialogDescription className="text-slate-400 text-center">
                Se ha generado el enlace de invitación para el administrador de la cooperativa. Copia y comparte este enlace.
              </DialogDescription>
            </div>

            <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 p-3 rounded-lg">
              <span className="text-sm text-slate-300 truncate flex-1 text-left">{inviteLink}</span>
              <Button 
                onClick={copyToClipboard} 
                size="sm" 
                variant="secondary"
                className="bg-slate-800 hover:bg-slate-700 text-slate-200"
              >
                {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>

            <Button 
              onClick={() => {
                setOpen(false);
                resetForm();
              }}
              className="w-full bg-emerald-600 hover:bg-emerald-500 text-white"
            >
              Cerrar y continuar
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <DialogHeader>
              <DialogTitle className="text-slate-100 text-lg font-bold">Crear Nueva Cooperativa</DialogTitle>
              <DialogDescription className="text-slate-400">
                Registra una nueva cooperativa. Puedes generar un enlace de invitación para el administrador ahora o hacerlo más tarde.
              </DialogDescription>
            </DialogHeader>

            {/* Logo Upload Section */}
            <div className="flex flex-col items-center gap-2 py-2">
              <Avatar className="h-20 w-20 border border-slate-800 bg-slate-900">
                <AvatarImage src={logoPreview || ""} alt="Preview logo" />
                <AvatarFallback className="bg-slate-900 text-slate-500">
                  <UploadSimple className="h-8 w-8" />
                </AvatarFallback>
              </Avatar>
              <Button 
                type="button" 
                variant="outline" 
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                className="border-slate-800 text-slate-300 hover:bg-slate-900 hover:text-slate-200"
              >
                Subir Logo
              </Button>
              <input 
                type="file" 
                name="logo" 
                ref={fileInputRef} 
                onChange={handleLogoChange} 
                accept="image/*" 
                className="hidden" 
              />
            </div>

            {/* Inputs */}
            <div className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="nombre" className="text-slate-300">Nombre de la Cooperativa</Label>
                <Input 
                  id="nombre" 
                  name="nombre" 
                  placeholder="Ej: Cooperativa Expresos del Tachira" 
                  required
                  className="bg-slate-900 border-slate-800 text-slate-100 focus-visible:ring-emerald-500"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="rif" className="text-slate-300">RIF</Label>
                <Input 
                  id="rif" 
                  name="rif" 
                  placeholder="Ej: J-12345678" 
                  required
                  className="bg-slate-900 border-slate-800 text-slate-100 focus-visible:ring-emerald-500"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="comision_porcentaje" className="text-slate-300">Comisión por Transacción (%)</Label>
                <Input 
                  id="comision_porcentaje" 
                  name="comision_porcentaje" 
                  type="number" 
                  step="0.01" 
                  min="0" 
                  max="100" 
                  placeholder="Ej: 5.00" 
                  required
                  className="bg-slate-900 border-slate-800 text-slate-100 focus-visible:ring-emerald-500"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="email_admin" className="text-slate-300">
                  Email del Administrador{" "}
                  <span className="text-slate-500 font-normal text-xs">(Opcional)</span>
                </Label>
                <Input 
                  id="email_admin" 
                  name="email_admin" 
                  type="email" 
                  placeholder="Ej: admin@cooperativa.com" 
                  className="bg-slate-900 border-slate-800 text-slate-100 focus-visible:ring-emerald-500"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => setOpen(false)}
                disabled={loading}
                className="border-slate-800 text-slate-400 hover:bg-slate-900 hover:text-slate-300"
              >
                Cancelar
              </Button>
              <Button 
                type="submit" 
                disabled={loading}
                className="bg-emerald-600 hover:bg-emerald-500 text-white"
              >
                {loading ? "Creando..." : "Crear Cooperativa"}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
