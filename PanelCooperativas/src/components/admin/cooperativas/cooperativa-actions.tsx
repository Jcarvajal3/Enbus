"use client";

// ─── Acciones de la ficha de una cooperativa (AD5-09, AD5-21, AD5-36) ───────
// "Editar datos" es la principal; "Reactivar" sale como secundaria cuando está
// suspendida. Lo poco frecuente o destructivo va en "Más": Invitar
// administrador · Suspender · Desactivar (con `Prohibit`, nunca `Trash`).

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle, EnvelopeSimple, HandPalm, PencilSimple, Prohibit, UploadSimple } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { AvisoError } from "@/components/aviso-error";
import { useTasaBCV } from "@/components/tasa-bcv-provider";
import { MenuMas } from "@/components/admin/menu-mas";
import { normalizeRif, RIF_AYUDA, RIF_PLACEHOLDER } from "@/lib/rif";
import { humanizeError } from "@/lib/errores";
import { avisarExito } from "@/lib/avisos";
import { formatMoney } from "@/lib/dinero";
import {
  changeCooperativaEstado,
  inviteCooperativaAdmin,
  updateCooperativa,
} from "@/app/admin/(panel)/cooperativas/actions";
import type { CooperativaDetalle, EstadoCooperativa } from "@/lib/types/admin-cooperativas";
import { CampoComision, comisionATexto, ERROR_COMISION, leerComision } from "./campo-comision";
import { EnlaceInvitacion, ExitoDialogo } from "./create-cooperativa-dialog";

interface CooperativaActionsProps {
  cooperativa: CooperativaDetalle;
}

const LOGO_MAX_BYTES = 2 * 1024 * 1024;

function plural(n: number, uno: string, varios: string) {
  return `${n} ${n === 1 ? uno : varios}`;
}

export function CooperativaActions({ cooperativa }: CooperativaActionsProps) {
  const router = useRouter();
  const tasa = useTasaBCV();

  const [editOpen, setEditOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [confirmar, setConfirmar] = useState<"SUSPENDIDA" | "ACTIVA" | "DESACTIVADA" | null>(null);

  const cambiarEstado = async (estado: EstadoCooperativa, motivo: string | undefined, exito: string) => {
    const res = await changeCooperativaEstado(cooperativa.id, estado, motivo);
    if (!res.success) return { ok: false, error: res.error };
    avisarExito(exito);
    router.refresh();
    return { ok: true };
  };

  if (cooperativa.estado === "DESACTIVADA") return null;
  const activa = cooperativa.estado === "ACTIVA";
  const suspendida = cooperativa.estado === "SUSPENDIDA";

  const pendiente = Number(cooperativa.comisiones_pendientes ?? 0);
  const montoPendiente = formatMoney({ usd: pendiente, tasa, moneda: "USD" });
  const impactoDesactivar = [
    "Deja de aparecer en la app: los pasajeros no podrán comprarle boletos ni enviar encomiendas.",
    "Sus empleados no podrán vender ni recibir desde el panel.",
    cooperativa.encomiendas_en_curso > 0
      ? `${plural(cooperativa.encomiendas_en_curso, "encomienda sigue", "encomiendas siguen")} en curso: coordina su entrega o devolución.`
      : "No tiene encomiendas en curso.",
    cooperativa.ciclos_sin_pagar > 0
      ? `${plural(cooperativa.ciclos_sin_pagar, "ciclo de comisiones sin pagar", "ciclos de comisiones sin pagar")} (${montoPendiente.principal}${montoPendiente.secundario ? `, ${montoPendiente.secundario}` : ""}): seguirán pendientes en Comisiones.`
      : "No tiene comisiones pendientes.",
    "No se puede deshacer: una cooperativa desactivada no se puede reactivar.",
  ];

  return (
    <>
      <Button onClick={() => setEditOpen(true)}>
        <PencilSimple aria-hidden /> Editar datos
      </Button>
      {suspendida && (
        <Button variant="outline" onClick={() => setConfirmar("ACTIVA")}>
          <CheckCircle aria-hidden /> Reactivar
        </Button>
      )}
      <MenuMas>
        <DropdownMenuItem onClick={() => setInviteOpen(true)}>
          <EnvelopeSimple aria-hidden /> Invitar administrador
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {activa && (
          <DropdownMenuItem variant="destructive" onClick={() => setConfirmar("SUSPENDIDA")}>
            <HandPalm aria-hidden /> Suspender cooperativa
          </DropdownMenuItem>
        )}
        <DropdownMenuItem variant="destructive" onClick={() => setConfirmar("DESACTIVADA")}>
          <Prohibit aria-hidden /> Desactivar cooperativa
        </DropdownMenuItem>
      </MenuMas>

      <EditarDialog cooperativa={cooperativa} open={editOpen} onOpenChange={setEditOpen} />
      <InvitarDialog cooperativa={cooperativa} open={inviteOpen} onOpenChange={setInviteOpen} />

      <ConfirmDialog
        open={confirmar === "SUSPENDIDA"}
        onOpenChange={(v) => !v && setConfirmar(null)}
        titulo={`¿Suspender ${cooperativa.nombre}?`}
        descripcion="Es temporal: podrás reactivarla cuando se resuelva el problema."
        impacto={[
          "No podrá vender boletos ni recibir encomiendas en la app mientras esté suspendida.",
          "Verá el motivo en su panel.",
          "Los boletos y encomiendas ya pagados se mantienen.",
        ]}
        motivo={{
          etiqueta: "Motivo de la suspensión",
          placeholder: "Ej. Comisiones de dos ciclos sin pagar.",
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
              Se suspendió por: <strong className="font-semibold">{cooperativa.motivo_estado}</strong>. Al reactivarla volverá a
              vender en la app.
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
        descripcion="Si solo necesitas pausarla, suspéndela: eso se puede deshacer."
        impacto={impactoDesactivar}
        motivo={{
          etiqueta: "Motivo de la desactivación",
          placeholder: "Ej. La cooperativa dejó de operar.",
          chips: ["La cooperativa dejó de operar", "Incumplimiento grave", "Solicitud de la cooperativa", "Otro"],
        }}
        confirmarEscribiendo={cooperativa.rif ? [cooperativa.nombre, cooperativa.rif] : cooperativa.nombre}
        verbo="Desactivar cooperativa"
        verboCargando="Desactivando…"
        tono="destructive"
        onConfirm={(motivo) =>
          cambiarEstado("DESACTIVADA", motivo, `${cooperativa.nombre} desactivada. Ya no puede operar en EnBus.`)
        }
      />
    </>
  );
}

function EditarDialog({
  cooperativa,
  open,
  onOpenChange,
}: {
  cooperativa: CooperativaDetalle;
  open: boolean;
  onOpenChange(v: boolean): void;
}) {
  const router = useRouter();
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [comision, setComision] = useState(comisionATexto(cooperativa.comision_porcentaje));
  const [comisionError, setComisionError] = useState<string | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(cooperativa.logo_url);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const cambiarAbierto = (v: boolean) => {
    if (guardando) return;
    onOpenChange(v);
    setError(null);
    setComisionError(null);
    if (!v) {
      setLogoPreview(cooperativa.logo_url);
      setComision(comisionATexto(cooperativa.comision_porcentaje));
    }
  };

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setError(null);
    if (!file) return;
    if (file.size > LOGO_MAX_BYTES) {
      setError("El logo no puede superar los 2 MB. Usa una imagen más liviana.");
      e.target.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onloadend = () => setLogoPreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (guardando) return;
    setError(null);
    if (!Number.isFinite(leerComision(comision))) {
      setComisionError(ERROR_COMISION);
      return;
    }
    setGuardando(true);
    try {
      const res = await updateCooperativa(cooperativa.id, new FormData(e.currentTarget));
      if (!res.success) {
        setError(res.error || "No pudimos guardar los cambios. Intenta de nuevo.");
        return;
      }
      if (res.aviso) toast.warning(res.aviso, { closeButton: true });
      else avisarExito("Cambios guardados.");
      onOpenChange(false);
      router.refresh();
    } catch (err) {
      setError(humanizeError(err, "guardar los cambios de la cooperativa"));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={cambiarAbierto}>
      <DialogContent>
        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-6">
          <DialogHeader>
            <DialogTitle>Editar cooperativa</DialogTitle>
            <DialogDescription>Nombre, RIF, comisión y logo.</DialogDescription>
          </DialogHeader>

          <div className="flex items-center gap-4">
            <Avatar className="size-16 border border-border bg-muted">
              <AvatarImage src={logoPreview || ""} alt="Vista previa del logo" />
              <AvatarFallback className="bg-muted text-muted-foreground">
                <UploadSimple className="size-6" aria-hidden />
              </AvatarFallback>
            </Avatar>
            <div className="flex flex-col items-start gap-1">
              <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={guardando}>
                Cambiar logo
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
              <FieldLabel htmlFor="editar-nombre">Nombre de la cooperativa</FieldLabel>
              <Input id="editar-nombre" name="nombre" defaultValue={cooperativa.nombre} required disabled={guardando} />
            </Field>
            <Field>
              <FieldLabel htmlFor="editar-rif">RIF</FieldLabel>
              <Input
                id="editar-rif"
                name="rif"
                defaultValue={cooperativa.rif}
                placeholder={`Ej. ${RIF_PLACEHOLDER}`}
                required
                disabled={guardando}
                autoCapitalize="characters"
                aria-describedby="editar-rif-ayuda"
                onBlur={(e) => {
                  const normalizado = normalizeRif(e.target.value);
                  if (normalizado) e.target.value = normalizado;
                }}
              />
              <FieldDescription id="editar-rif-ayuda">{RIF_AYUDA}</FieldDescription>
            </Field>
            <CampoComision
              valor={comision}
              name="comision_porcentaje"
              disabled={guardando}
              error={comisionError}
              onCambio={(v) => {
                setComision(v);
                setComisionError(null);
              }}
            />
          </FieldGroup>

          {error && <AvisoError>{error}</AvisoError>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => cambiarAbierto(false)} disabled={guardando}>
              Cancelar
            </Button>
            <Button type="submit" disabled={guardando} aria-busy={guardando || undefined}>
              {guardando && <Spinner size="sm" aria-hidden />}
              {guardando ? "Guardando…" : "Guardar cambios"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function InvitarDialog({
  cooperativa,
  open,
  onOpenChange,
}: {
  cooperativa: CooperativaDetalle;
  open: boolean;
  onOpenChange(v: boolean): void;
}) {
  const [invitando, setInvitando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inviteLink, setInviteLink] = useState<string | null>(null);

  const cambiarAbierto = (v: boolean) => {
    if (invitando) return;
    onOpenChange(v);
    setError(null);
    if (!v) setInviteLink(null);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (invitando) return;
    setError(null);
    setInvitando(true);
    const email = String(new FormData(e.currentTarget).get("email") ?? "");
    try {
      const res = await inviteCooperativaAdmin(cooperativa.id, email);
      if (res.success && res.invite_link) setInviteLink(`${window.location.origin}${res.invite_link}`);
      else setError(res.error || "No pudimos crear la invitación. Intenta de nuevo.");
    } catch (err) {
      setError(humanizeError(err, "crear la invitación"));
    } finally {
      setInvitando(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={cambiarAbierto}>
      <DialogContent>
        {inviteLink ? (
          <ExitoDialogo
            titulo="Invitación lista"
            descripcion={`Envía el enlace al administrador de ${cooperativa.nombre}. Vence en 48 horas.`}
            onListo={() => cambiarAbierto(false)}
          >
            <EnlaceInvitacion enlace={inviteLink} />
          </ExitoDialogo>
        ) : (
          <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-6">
            <DialogHeader>
              <DialogTitle>Invitar administrador</DialogTitle>
              <DialogDescription>Te damos un enlace para que cree su cuenta en {cooperativa.nombre}.</DialogDescription>
            </DialogHeader>
            <Field>
              <FieldLabel htmlFor="invitar-email">Correo</FieldLabel>
              <Input
                id="invitar-email"
                name="email"
                type="email"
                autoComplete="off"
                placeholder="Ej. admin@cooperativa.com"
                required
                disabled={invitando}
              />
            </Field>
            {error && <AvisoError>{error}</AvisoError>}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => cambiarAbierto(false)} disabled={invitando}>
                Cancelar
              </Button>
              <Button type="submit" disabled={invitando} aria-busy={invitando || undefined}>
                {invitando && <Spinner size="sm" aria-hidden />}
                {invitando ? "Creando…" : "Crear invitación"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
