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
import { normalizeRif, RIF_AYUDA, RIF_PLACEHOLDER } from "@/lib/rif";
import { humanizeError } from "@/lib/errores";

export function CreateCooperativaDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [rifError, setRifError] = useState<string | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        toast.error("El logo pesa más de 2 MB. Elige una imagen más liviana (PNG, JPG o WebP).");
        // Limpiar el input para que el archivo rechazado no se envíe con el formulario
        e.target.value = "";
        setLogoPreview(null);
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
    if (loading) return;
    setLoading(true);
    setRifError(null);

    const formData = new FormData(e.currentTarget);

    try {
      const res = await createCooperativa(formData);

      if (!res.success) {
        // Error del RIF: se muestra junto al campo; el resto, por toast
        if (res.campo === "rif") {
          setRifError(res.error || "Revisa el RIF.");
          document.getElementById("rif")?.focus();
        } else {
          toast.error(res.error || "No pudimos crear la cooperativa. Intenta de nuevo.");
        }
        setLoading(false);
        return;
      }

      if (res.aviso) toast.warning(res.aviso);
      else toast.success("Cooperativa creada.");
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
      toast.error(humanizeError(err, "crear la cooperativa"));
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = async () => {
    if (!inviteLink) return;
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      toast.success("Enlace copiado.");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("No pudimos copiar el enlace. Selecciónalo y cópialo a mano.");
    }
  };

  const resetForm = () => {
    setLogoPreview(null);
    setInviteLink(null);
    setCopied(false);
    setRifError(null);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => {
      if (!loading) {
        setOpen(v);
        if (!v) resetForm();
      }
    }}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" /> Nueva cooperativa
        </Button>
      </DialogTrigger>
      
      <DialogContent className="max-w-md overflow-hidden">
        {inviteLink ? (
          <div className="space-y-6 py-4 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-success-light text-success-deep">
              <ShieldCheck className="h-8 w-8" />
            </div>
            <div className="space-y-2">
              <DialogTitle className="text-xl text-center text-foreground">Cooperativa creada</DialogTitle>
              <DialogDescription className="text-muted-foreground text-center">
                Copia este enlace y envíaselo al administrador para que cree su cuenta. Vence en 48 horas.
              </DialogDescription>
            </div>

            <div className="flex items-center gap-2 bg-muted border border-border p-3 rounded-lg">
              <span className="text-sm text-foreground truncate flex-1 text-left">{inviteLink}</span>
              <Button 
                onClick={copyToClipboard} 
                size="sm" 
                variant="secondary"
                aria-label={copied ? "Enlace de invitación copiado" : "Copiar enlace de invitación"}
              >
                {copied ? <Check className="h-4 w-4 text-success-text" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
              </Button>
            </div>

            <Button 
              onClick={() => {
                setOpen(false);
                resetForm();
              }}
              className="w-full"
            >
              Listo
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <DialogHeader>
              <DialogTitle className="text-lg font-bold">Nueva cooperativa</DialogTitle>
              <DialogDescription className="text-muted-foreground">
                Queda activa de inmediato. Si escribes el correo del administrador, te daremos su enlace de invitación.
              </DialogDescription>
            </DialogHeader>

            {/* Logo Upload Section */}
            <div className="flex flex-col items-center gap-2 py-2">
              <Avatar className="h-20 w-20 border border-border bg-muted">
                <AvatarImage src={logoPreview || ""} alt="Preview logo" />
                <AvatarFallback className="bg-muted text-muted-foreground">
                  <UploadSimple className="h-8 w-8" />
                </AvatarFallback>
              </Avatar>
              <Button 
                type="button" 
                variant="outline" 
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                
              >
                Subir logo
              </Button>
              <input 
                type="file" 
                name="logo" 
                ref={fileInputRef} 
                onChange={handleLogoChange} 
                accept="image/jpeg,image/png,image/webp,image/gif" 
                className="hidden" 
              />
            </div>

            {/* Inputs */}
            <div className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="nombre">Nombre de la cooperativa</Label>
                <Input 
                  id="nombre" 
                  name="nombre" 
                  placeholder="Ej: Expresos del Táchira" 
                  required
                  className="bg-background"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="rif">RIF</Label>
                <Input
                  id="rif"
                  name="rif"
                  placeholder={`Ej: ${RIF_PLACEHOLDER}`}
                  required
                  autoCapitalize="characters"
                  aria-invalid={rifError ? true : undefined}
                  aria-describedby={rifError ? "rif-error rif-ayuda" : "rif-ayuda"}
                  onBlur={(e) => {
                    const normalizado = normalizeRif(e.target.value);
                    if (normalizado) e.target.value = normalizado;
                  }}
                  onChange={() => rifError && setRifError(null)}
                  className="bg-background"
                />
                {rifError && (
                  <p id="rif-error" role="alert" className="text-xs text-destructive-text">{rifError}</p>
                )}
                <p id="rif-ayuda" className="text-xs text-muted-foreground">{RIF_AYUDA}</p>
              </div>

              <div className="space-y-1">
                <Label htmlFor="comision_porcentaje">Comisión de EnBus (%)</Label>
                <Input 
                  id="comision_porcentaje" 
                  name="comision_porcentaje" 
                  type="number" 
                  step="0.01" 
                  min="0" 
                  max="100" 
                  placeholder="Ej: 5.00" 
                  required
                  className="bg-background"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="email_admin">
                  Correo del administrador{" "}
                  <span className="text-muted-foreground font-normal text-xs">(Opcional)</span>
                </Label>
                <Input 
                  id="email_admin" 
                  name="email_admin" 
                  type="email" 
                  placeholder="Ej: admin@cooperativa.com" 
                  className="bg-background"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => setOpen(false)}
                disabled={loading}
                
              >
                Cancelar
              </Button>
              <Button 
                type="submit" 
                disabled={loading}

              >
                {loading ? "Creando…" : "Crear cooperativa"}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
