"use client";

import { useId, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  CheckCircle,
  Copy,
  Check,
  EnvelopeSimple,
  HandPalm,
  PencilSimple,
  SpinnerIcon,
  Trash,
  UploadSimple,
  WarningCircle,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { normalizeRif, RIF_AYUDA, RIF_PLACEHOLDER } from "@/lib/rif";
import { humanizeError } from "@/lib/errores";
import { formatUsd } from "@/lib/dinero";
import {
  changeCooperativaEstado,
  inviteCooperativaAdmin,
  updateCooperativa,
} from "@/app/admin/(panel)/cooperativas/actions";
import type { CooperativaDetalle, EstadoCooperativa } from "@/lib/types/admin-cooperativas";

interface CooperativaActionsProps {
  cooperativa: CooperativaDetalle;
}

const LOGO_MAX_BYTES = 2 * 1024 * 1024;

function plural(n: number, uno: string, varios: string) {
  return `${n} ${n === 1 ? uno : varios}`;
}

function ErrorEnLinea({ texto }: { texto: string }) {
  return (
    <div
      role="alert"
      className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive-text"
    >
      <WarningCircle className="mt-0.5 size-4 shrink-0" weight="fill" aria-hidden />
      <p>{texto}</p>
    </div>
  );
}

export function CooperativaActions({ cooperativa }: CooperativaActionsProps) {
  const router = useRouter();
  const uid = useId();

  // Editar
  const [editOpen, setEditOpen] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [errorEditar, setErrorEditar] = useState<string | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(cooperativa.logo_url);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Invitar
  const [inviteOpen, setInviteOpen] = useState(false);
  const [invitando, setInvitando] = useState(false);
  const [errorInvitar, setErrorInvitar] = useState<string | null>(null);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Cambios de estado
  const [confirmar, setConfirmar] = useState<"SUSPENDIDA" | "ACTIVA" | "DESACTIVADA" | null>(null);

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setErrorEditar(null);
    if (!file) return;
    if (file.size > LOGO_MAX_BYTES) {
      setErrorEditar("El logo no puede superar los 2 MB. Usa una imagen más liviana.");
      e.target.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onloadend = () => setLogoPreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleEditSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (guardando) return;
    setErrorEditar(null);
    setGuardando(true);
    try {
      const res = await updateCooperativa(cooperativa.id, new FormData(e.currentTarget));
      if (!res.success) {
        setErrorEditar(res.error || "No pudimos guardar los cambios. Intenta de nuevo.");
        return;
      }
      if (res.aviso) toast.warning(res.aviso);
      else toast.success("Cambios guardados.");
      setEditOpen(false);
      router.refresh();
    } catch (err) {
      setErrorEditar(humanizeError(err, "guardar los cambios de la cooperativa"));
    } finally {
      setGuardando(false);
    }
  };

  const handleInviteSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (invitando) return;
    setErrorInvitar(null);
    setInvitando(true);
    const email = String(new FormData(e.currentTarget).get("email") ?? "");
    try {
      const res = await inviteCooperativaAdmin(cooperativa.id, email);
      if (res.success && res.invite_link) {
        setInviteLink(`${window.location.origin}${res.invite_link}`);
      } else {
        setErrorInvitar(res.error || "No pudimos crear la invitación. Intenta de nuevo.");
      }
    } catch (err) {
      setErrorInvitar(humanizeError(err, "crear la invitación"));
    } finally {
      setInvitando(false);
    }
  };

  const copyInviteLink = async () => {
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

  const cambiarEstado = async (estado: EstadoCooperativa, motivo: string | undefined, exito: string) => {
    const res = await changeCooperativaEstado(cooperativa.id, estado, motivo);
    if (!res.success) return { ok: false, error: res.error };
    toast.success(exito);
    router.refresh();
    return { ok: true };
  };

  const isActive = cooperativa.estado === "ACTIVA";
  const isSuspended = cooperativa.estado === "SUSPENDIDA";
  const isDeactivated = cooperativa.estado === "DESACTIVADA";
  const enRevision = cooperativa.estado === "PENDIENTE" || cooperativa.estado === "RECHAZADA";

  if (isDeactivated) {
    return (
      <p className="text-sm text-muted-foreground">Esta cooperativa está desactivada y ya no puede operar en EnBus.</p>
    );
  }

  const impactoDesactivar = [
    "Deja de aparecer en la app: los pasajeros no podrán comprarle boletos ni enviar encomiendas.",
    "Sus empleados no podrán vender ni recibir desde el panel.",
    cooperativa.encomiendas_en_curso > 0
      ? `${plural(cooperativa.encomiendas_en_curso, "encomienda sigue", "encomiendas siguen")} en curso: coordina con la cooperativa su entrega o devolución.`
      : "No tiene encomiendas en curso.",
    cooperativa.ciclos_sin_pagar > 0
      ? `${plural(cooperativa.ciclos_sin_pagar, "ciclo de comisiones sin pagar", "ciclos de comisiones sin pagar")} (${formatUsd(Number(cooperativa.comisiones_pendientes ?? 0))}): seguirán pendientes en Comisiones.`
      : "No tiene comisiones pendientes.",
    "No se puede deshacer: una cooperativa desactivada no se puede reactivar.",
  ];

  return (
    <div className="flex flex-wrap items-center gap-3">
      {/* Editar */}
      <Dialog
        open={editOpen}
        onOpenChange={(v) => {
          if (guardando) return;
          setEditOpen(v);
          setErrorEditar(null);
          if (!v) setLogoPreview(cooperativa.logo_url);
        }}
      >
        <DialogTrigger asChild>
          <Button variant="outline">
            <PencilSimple className="mr-2 h-4 w-4" aria-hidden /> Editar datos
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-md">
          <form onSubmit={handleEditSubmit} noValidate className="space-y-4">
            <DialogHeader>
              <DialogTitle>Editar cooperativa</DialogTitle>
              <DialogDescription>Cambia el nombre, el RIF, la comisión o el logo.</DialogDescription>
            </DialogHeader>

            <div className="flex flex-col items-center gap-2 py-2">
              <Avatar className="h-20 w-20 border bg-muted">
                <AvatarImage src={logoPreview || ""} alt="Vista previa del logo" />
                <AvatarFallback className="bg-muted text-muted-foreground">
                  <UploadSimple className="h-8 w-8" aria-hidden />
                </AvatarFallback>
              </Avatar>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={guardando}
              >
                Cambiar logo
              </Button>
              <input
                type="file"
                name="logo"
                ref={fileInputRef}
                onChange={handleLogoChange}
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="hidden"
              />
              <p className="text-xs text-muted-foreground">JPEG, PNG, WebP o GIF de hasta 2 MB.</p>
            </div>

            <div className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor={`${uid}-nombre`}>Nombre de la cooperativa</Label>
                <Input id={`${uid}-nombre`} name="nombre" defaultValue={cooperativa.nombre} required disabled={guardando} />
              </div>
              <div className="space-y-1">
                <Label htmlFor={`${uid}-rif`}>RIF</Label>
                <Input
                  id={`${uid}-rif`}
                  name="rif"
                  defaultValue={cooperativa.rif}
                  placeholder={RIF_PLACEHOLDER}
                  required
                  disabled={guardando}
                  autoCapitalize="characters"
                  aria-describedby={`${uid}-rif-ayuda`}
                  onBlur={(e) => {
                    const normalizado = normalizeRif(e.target.value);
                    if (normalizado) e.target.value = normalizado;
                  }}
                />
                <p id={`${uid}-rif-ayuda`} className="text-xs text-muted-foreground">{RIF_AYUDA}</p>
              </div>
              <div className="space-y-1">
                <Label htmlFor={`${uid}-comision`}>Comisión de EnBus (%)</Label>
                <Input
                  id={`${uid}-comision`}
                  name="comision_porcentaje"
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  defaultValue={cooperativa.comision_porcentaje}
                  required
                  disabled={guardando}
                />
              </div>
            </div>

            {errorEditar && <ErrorEnLinea texto={errorEditar} />}

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setEditOpen(false)} disabled={guardando}>
                Cancelar
              </Button>
              <Button type="submit" disabled={guardando} aria-busy={guardando || undefined}>
                {guardando && <SpinnerIcon className="animate-spin" aria-hidden />}
                {guardando ? "Guardando…" : "Guardar cambios"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Invitar administrador */}
      <Dialog
        open={inviteOpen}
        onOpenChange={(v) => {
          if (invitando) return;
          setInviteOpen(v);
          setErrorInvitar(null);
          if (!v) setInviteLink(null);
        }}
      >
        <DialogTrigger asChild>
          <Button variant="outline">
            <EnvelopeSimple className="mr-2 h-4 w-4" aria-hidden /> Invitar administrador
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-md">
          {inviteLink ? (
            <div className="space-y-6 py-2 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-900 dark:bg-emerald-400/15 dark:text-emerald-200">
                <CheckCircle className="h-8 w-8" aria-hidden />
              </div>
              <div className="space-y-2">
                <DialogTitle className="text-xl">Invitación lista</DialogTitle>
                <DialogDescription>
                  Copia el enlace y envíaselo al administrador de {cooperativa.nombre}. Vence en 48 horas.
                </DialogDescription>
              </div>
              <div className="flex items-center gap-2 rounded-lg border bg-muted p-3">
                <span className="flex-1 truncate text-left text-sm text-foreground">{inviteLink}</span>
                <Button onClick={copyInviteLink} size="sm" variant="secondary" aria-label="Copiar enlace">
                  {copied ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
                </Button>
              </div>
              <Button onClick={() => setInviteOpen(false)} className="w-full">
                Listo
              </Button>
            </div>
          ) : (
            <form onSubmit={handleInviteSubmit} noValidate className="space-y-4">
              <DialogHeader>
                <DialogTitle>Invitar administrador</DialogTitle>
                <DialogDescription>
                  Escribe el correo de la persona que administrará {cooperativa.nombre}. Te daremos un enlace para que cree su cuenta.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-1">
                <Label htmlFor={`${uid}-email`}>Correo del administrador</Label>
                <Input
                  id={`${uid}-email`}
                  name="email"
                  type="email"
                  autoComplete="off"
                  placeholder="admin@cooperativa.com"
                  required
                  disabled={invitando}
                />
              </div>
              {errorInvitar && <ErrorEnLinea texto={errorInvitar} />}
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setInviteOpen(false)} disabled={invitando}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={invitando} aria-busy={invitando || undefined}>
                  {invitando && <SpinnerIcon className="animate-spin" aria-hidden />}
                  {invitando ? "Creando…" : "Crear invitación"}
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {enRevision && (
        <p className="text-sm text-muted-foreground">
          {cooperativa.estado === "PENDIENTE"
            ? "Su solicitud está en revisión: apruébala o recházala desde "
            : "Su solicitud fue rechazada: puedes reabrirla o descartarla desde "}
          <Link href="/admin/solicitudes" className="text-foreground underline decoration-primary underline-offset-4">
            Solicitudes
          </Link>
          .
        </p>
      )}

      {isActive && (
        <Button
          variant="outline"
          className="border-amber-600/40 text-warning-text hover:bg-amber-100 dark:hover:bg-amber-400/15"
          onClick={() => setConfirmar("SUSPENDIDA")}
        >
          <HandPalm className="mr-2 h-4 w-4" aria-hidden /> Suspender
        </Button>
      )}

      {isSuspended && (
        <Button variant="outline" onClick={() => setConfirmar("ACTIVA")}>
          <CheckCircle className="mr-2 h-4 w-4" aria-hidden /> Reactivar
        </Button>
      )}

      {!enRevision && (
        <Button
          variant="outline"
          className="border-destructive/40 text-destructive-text hover:bg-destructive/10"
          onClick={() => setConfirmar("DESACTIVADA")}
        >
          <Trash className="mr-2 h-4 w-4" aria-hidden /> Desactivar
        </Button>
      )}

      <ConfirmDialog
        open={confirmar === "SUSPENDIDA"}
        onOpenChange={(v) => !v && setConfirmar(null)}
        titulo={`¿Suspender ${cooperativa.nombre}?`}
        descripcion="La suspensión es temporal: podrás reactivarla cuando se resuelva el problema."
        impacto={[
          "No podrá vender boletos ni recibir encomiendas en la app mientras esté suspendida.",
          "Verá el motivo en su panel.",
          "Los boletos y encomiendas ya pagados se mantienen.",
        ]}
        motivo={{
          etiqueta: "Motivo de la suspensión",
          placeholder: "Por ejemplo: comisiones de dos ciclos sin pagar.",
          chips: ["Comisiones sin pagar", "Reclamos de pasajeros", "Datos sin verificar", "Otro"],
        }}
        verbo="Suspender cooperativa"
        verboCargando="Suspendiendo…"
        tono="destructive"
        onConfirm={(motivo) =>
          cambiarEstado("SUSPENDIDA", motivo, `${cooperativa.nombre} suspendida. No podrá vender en la app.`)
        }
      />

      <ConfirmDialog
        open={confirmar === "ACTIVA"}
        onOpenChange={(v) => !v && setConfirmar(null)}
        titulo={`¿Reactivar ${cooperativa.nombre}?`}
        descripcion={
          cooperativa.motivo_estado ? (
            <>
              Se suspendió por: <strong>{cooperativa.motivo_estado}</strong>. Al reactivarla volverá a vender en la app.
            </>
          ) : (
            "Al reactivarla volverá a vender en la app."
          )
        }
        verbo="Reactivar cooperativa"
        verboCargando="Reactivando…"
        onConfirm={() => cambiarEstado("ACTIVA", undefined, `${cooperativa.nombre} está activa de nuevo.`)}
      />

      <ConfirmDialog
        open={confirmar === "DESACTIVADA"}
        onOpenChange={(v) => !v && setConfirmar(null)}
        titulo={`¿Desactivar ${cooperativa.nombre} para siempre?`}
        descripcion="Si solo necesitas pausarla, usa Suspender: se puede deshacer."
        impacto={impactoDesactivar}
        motivo={{
          etiqueta: "Motivo de la desactivación",
          placeholder: "Por ejemplo: la cooperativa dejó de operar.",
          chips: ["La cooperativa dejó de operar", "Incumplimiento grave", "Solicitud de la cooperativa", "Otro"],
        }}
        confirmarEscribiendo={cooperativa.rif ? [cooperativa.nombre, cooperativa.rif] : cooperativa.nombre}
        verbo="Sí, desactivar para siempre"
        verboCargando="Desactivando…"
        tono="destructive"
        onConfirm={(motivo) =>
          cambiarEstado("DESACTIVADA", motivo, `${cooperativa.nombre} desactivada. Ya no puede operar en EnBus.`)
        }
      />
    </div>
  );
}
