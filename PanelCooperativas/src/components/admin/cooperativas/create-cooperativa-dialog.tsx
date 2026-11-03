"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, CheckCircle, Copy, Plus, UploadSimple } from "@phosphor-icons/react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { AvisoError } from "@/components/aviso-error";
import { createCooperativa } from "@/app/admin/(panel)/cooperativas/actions";
import { normalizeRif, RIF_AYUDA, RIF_PLACEHOLDER } from "@/lib/rif";
import { humanizeError } from "@/lib/errores";
import { avisarExito } from "@/lib/avisos";
import { CampoComision, ERROR_COMISION, leerComision } from "./campo-comision";

const LOGO_MAX_BYTES = 2 * 1024 * 1024;

/** Enlace de invitación con botón de copiar (Nueva cooperativa e Invitar administrador). */
export function EnlaceInvitacion({ enlace }: { enlace: string }) {
  const [copiado, setCopiado] = useState(false);
  const [error, setError] = useState(false);
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(enlace);
      setError(false);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      setError(true);
    }
  };
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 rounded-md border border-border bg-muted p-2 pl-3">
        <span className="min-w-0 flex-1 truncate text-sm text-foreground">{enlace}</span>
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          onClick={copiar}
          aria-label={copiado ? "Enlace de invitación copiado" : "Copiar enlace de invitación"}
        >
          {copiado ? <Check aria-hidden /> : <Copy aria-hidden />}
        </Button>
      </div>
      {error && <AvisoError>No pudimos copiar el enlace. Selecciónalo y cópialo a mano.</AvisoError>}
    </div>
  );
}

/** Pantalla de éxito dentro de un diálogo: `CheckCircle` + título + "Listo" (AD5-37). */
export function ExitoDialogo({
  titulo,
  descripcion,
  children,
  onListo,
}: {
  titulo: string;
  descripcion: string;
  children?: React.ReactNode;
  onListo(): void;
}) {
  return (
    <div className="flex flex-col gap-6">
      <DialogHeader className="items-center text-center">
        <div className="flex size-12 items-center justify-center rounded-full bg-success-light">
          <CheckCircle className="size-7 text-success-text" weight="fill" aria-hidden />
        </div>
        <DialogTitle>{titulo}</DialogTitle>
        <DialogDescription>{descripcion}</DialogDescription>
      </DialogHeader>
      {children}
      <Button type="button" onClick={onListo} className="w-full">
        Listo
      </Button>
    </div>
  );
}

export function CreateCooperativaDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [rifError, setRifError] = useState<string | null>(null);
  const [comision, setComision] = useState("10");
  const [comisionError, setComisionError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetForm = () => {
    setLogoPreview(null);
    setInviteLink(null);
    setRifError(null);
    setComision("10");
    setComisionError(null);
    setError(null);
  };

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setError(null);
    if (!file) {
      setLogoPreview(null);
      return;
    }
    if (file.size > LOGO_MAX_BYTES) {
      setError("El logo pesa más de 2 MB. Elige una imagen más liviana (PNG, JPG o WebP).");
      // El archivo rechazado no viaja con el formulario.
      e.target.value = "";
      setLogoPreview(null);
      return;
    }
    const reader = new FileReader();
    reader.onloadend = () => setLogoPreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (loading) return;
    setRifError(null);
    setError(null);
    if (!Number.isFinite(leerComision(comision))) {
      setComisionError(ERROR_COMISION);
      return;
    }
    setLoading(true);
    const formData = new FormData(e.currentTarget);
    try {
      const res = await createCooperativa(formData);
      if (!res.success) {
        // Error del RIF junto al campo; el resto, dentro del diálogo.
        if (res.campo === "rif") {
          setRifError(res.error || "Revisa el RIF.");
          document.getElementById("rif")?.focus();
        } else {
          setError(res.error || "No pudimos crear la cooperativa. Intenta de nuevo.");
        }
        return;
      }
      if (res.aviso) toast.warning(res.aviso, { closeButton: true });
      else avisarExito("Cooperativa creada.");
      router.refresh();
      if (res.invite_link) {
        setInviteLink(`${window.location.origin}${res.invite_link}`);
      } else {
        setOpen(false);
        resetForm();
      }
    } catch (err) {
      setError(humanizeError(err, "crear la cooperativa"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (loading) return;
        setOpen(v);
        if (!v) resetForm();
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <Plus aria-hidden /> Nueva cooperativa
        </Button>
      </DialogTrigger>

      <DialogContent>
        {inviteLink ? (
          <ExitoDialogo
            titulo="Cooperativa creada"
            descripcion="Envía este enlace al administrador para que cree su cuenta. Vence en 48 horas."
            onListo={() => {
              setOpen(false);
              resetForm();
            }}
          >
            <EnlaceInvitacion enlace={inviteLink} />
          </ExitoDialogo>
        ) : (
          <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-6">
            <DialogHeader>
              <DialogTitle>Nueva cooperativa</DialogTitle>
              <DialogDescription>Queda activa al crearla. Con el correo del administrador, te damos su invitación.</DialogDescription>
            </DialogHeader>

            <div className="flex items-center gap-4">
              <Avatar className="size-16 border border-border bg-muted">
                <AvatarImage src={logoPreview || ""} alt="Vista previa del logo" />
                <AvatarFallback className="bg-muted text-muted-foreground">
                  <UploadSimple className="size-6" aria-hidden />
                </AvatarFallback>
              </Avatar>
              <div className="flex flex-col items-start gap-1">
                <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={loading}>
                  Subir logo
                </Button>
                <p className="text-xs text-muted-foreground">JPEG, PNG, WebP o GIF de hasta 2 MB.</p>
              </div>
              <input
                type="file"
                name="logo"
                ref={fileInputRef}
                onChange={handleLogoChange}
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="hidden"
                aria-label="Logo de la cooperativa"
              />
            </div>

            <FieldGroup className="gap-4">
              <Field>
                <FieldLabel htmlFor="nombre">Nombre de la cooperativa</FieldLabel>
                <Input id="nombre" name="nombre" placeholder="Ej. Expresos del Táchira" required disabled={loading} />
              </Field>

              <Field data-invalid={rifError ? true : undefined}>
                <FieldLabel htmlFor="rif">RIF</FieldLabel>
                <Input
                  id="rif"
                  name="rif"
                  placeholder={`Ej. ${RIF_PLACEHOLDER}`}
                  required
                  disabled={loading}
                  autoCapitalize="characters"
                  aria-invalid={rifError ? true : undefined}
                  aria-describedby="rif-ayuda"
                  onBlur={(e) => {
                    const normalizado = normalizeRif(e.target.value);
                    if (normalizado) e.target.value = normalizado;
                  }}
                  onChange={() => rifError && setRifError(null)}
                />
                {rifError ? (
                  <FieldError id="rif-ayuda">{rifError}</FieldError>
                ) : (
                  <FieldDescription id="rif-ayuda">{RIF_AYUDA}</FieldDescription>
                )}
              </Field>

              <CampoComision
                valor={comision}
                name="comision_porcentaje"
                disabled={loading}
                error={comisionError}
                onCambio={(v) => {
                  setComision(v);
                  setComisionError(null);
                }}
              />

              <Field>
                <FieldLabel htmlFor="email_admin">
                  Correo del administrador <span className="font-normal text-muted-foreground">(opcional)</span>
                </FieldLabel>
                <Input id="email_admin" name="email_admin" type="email" placeholder="Ej. admin@cooperativa.com" disabled={loading} />
              </Field>
            </FieldGroup>

            {error && <AvisoError>{error}</AvisoError>}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={loading}>
                Cancelar
              </Button>
              <Button type="submit" disabled={loading} aria-busy={loading || undefined}>
                {loading && <Spinner size="sm" aria-hidden />}
                {loading ? "Creando…" : "Crear cooperativa"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
