"use client";

// ─── Aviso persistente del estado de la cooperativa (#38, P-08, P-15, PC-12) ─
// Siempre visible (sin botón de cerrar) mientras la cooperativa no esté ACTIVA:
// en revisión, rechazada, suspendida o desactivada, con el motivo y lo que se
// puede hacer. Sustituye al antiguo PendingApprovalBanner.

import { useId, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Clock, Prohibit, SpinnerIcon, WarningCircle, WhatsappLogo, XCircle, type Icon } from "@phosphor-icons/react";
import { AvisoError } from "@/components/aviso-error";
import { avisarExito } from "@/lib/avisos";
import { useUser } from "@/hooks/use-user";
import { requireOnline } from "@/components/connectivity-banner";
import { buttonVariants, Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { solicitarRevision } from "@/app/cooperativas/(panel)/configuracion/actions";
import { humanizeError } from "@/lib/errores";
import { telefonoWhatsApp } from "@/lib/ve";
import { cn } from "@/lib/utils";

type Tono = "aviso" | "peligro";

const ESTILOS: Record<Tono, { caja: string; boton: string }> = {
  // Tokens del sistema: texto `*-deep` sobre `*-light` (≥ 6:1 en claro y en oscuro).
  aviso: {
    caja: "border-warning/40 bg-warning-light text-warning-deep",
    boton: "border-warning/40 bg-background/70 text-warning-deep hover:bg-background hover:text-warning-deep",
  },
  peligro: {
    caja: "border-destructive/40 bg-destructive-light text-destructive-deep",
    boton: "border-destructive/40 bg-background/70 text-destructive-deep hover:bg-background hover:text-destructive-deep",
  },
};

/** Enlace de WhatsApp de soporte de EnBus, o null si NEXT_PUBLIC_SOPORTE_WHATSAPP no está configurado. */
function enlaceSoporte(texto: string): string | null {
  const crudo = process.env.NEXT_PUBLIC_SOPORTE_WHATSAPP ?? "";
  const numero = telefonoWhatsApp(crudo) ?? (crudo.replace(/\D/g, "") || null);
  return numero ? `https://wa.me/${numero}?text=${encodeURIComponent(texto)}` : null;
}

/** "Motivo." con punto final (sin duplicarlo). */
function conPunto(texto: string) {
  const t = texto.trim();
  return /[.!?…]$/.test(t) ? t : `${t}.`;
}

export function EstadoCooperativaBanner() {
  const { user } = useUser();
  const [revisionOpen, setRevisionOpen] = useState(false);

  const estado = user.cooperativa_estado;
  const motivo = user.cooperativa_motivo_estado?.trim() || null;
  const esAdmin = user.role === "admin_cooperativa";
  const cooperativa = user.cooperativa_nombre || "tu cooperativa";

  let tono: Tono;
  let icono: Icon;
  let mensaje: React.ReactNode;
  let acciones: React.ReactNode = null;

  switch (estado) {
    case "PENDIENTE":
      tono = "aviso";
      icono = Clock;
      mensaje = (
        <>
          <strong className="font-semibold">Tu cooperativa está en revisión</strong> (24 a 48 horas hábiles). Mientras
          tanto, deja tu panel listo para vender.
        </>
      );
      // Los pasos de puesta en marcha los ve el administrador en el Resumen.
      acciones = esAdmin ? (
        <Link
          href="/cooperativas/dashboard#puesta-en-marcha"
          className={cn(buttonVariants({ variant: "outline", size: "sm" }), ESTILOS.aviso.boton)}
        >
          Ver pasos
        </Link>
      ) : null;
      break;

    case "RECHAZADA":
      tono = "peligro";
      icono = XCircle;
      mensaje = (
        <>
          <strong className="font-semibold">Tu solicitud fue rechazada</strong>
          {motivo ? `: ${conPunto(motivo)}` : "."}{" "}
          {esAdmin
            ? "Corrige tus datos en Configuración y pide una nueva revisión."
            : "Avísale al administrador de tu cooperativa."}
        </>
      );
      acciones = esAdmin ? (
        <>
          <Link
            href="/cooperativas/configuracion?tab=datos"
            className={cn(buttonVariants({ variant: "outline", size: "sm" }), ESTILOS.peligro.boton)}
          >
            Corregir datos
          </Link>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className={ESTILOS.peligro.boton}
            onClick={() => setRevisionOpen(true)}
          >
            Pedir nueva revisión
          </Button>
        </>
      ) : null;
      break;

    case "SUSPENDIDA": {
      tono = "peligro";
      icono = WarningCircle;
      mensaje = (
        <>
          <strong className="font-semibold">Tu cooperativa está suspendida</strong>
          {motivo ? `: ${conPunto(motivo)}` : "."} Los pasajeros no pueden comprarte boletos en la app. Escríbenos
          para resolverlo.
        </>
      );
      const whatsapp = enlaceSoporte(`Hola, soy de ${cooperativa}. Nuestra cooperativa está suspendida y queremos resolverlo.`);
      acciones = whatsapp ? (
        <a
          href={whatsapp}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(buttonVariants({ variant: "outline", size: "sm" }), ESTILOS.peligro.boton)}
        >
          <WhatsappLogo aria-hidden />
          Escribir por WhatsApp
        </a>
      ) : null;
      break;
    }

    case "DESACTIVADA":
      tono = "peligro";
      icono = Prohibit;
      mensaje = (
        <>
          <strong className="font-semibold">Tu cooperativa fue desactivada</strong>
          {motivo ? `: ${conPunto(motivo)}` : "."} Ya no puede operar en EnBus.
        </>
      );
      break;

    default:
      // ACTIVA (o sin cooperativa): no hay nada que avisar.
      return null;
  }

  const Icono = icono;

  return (
    <>
      <div
        role="status"
        className={cn(
          "flex flex-col gap-3 border-b px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between",
          ESTILOS[tono].caja
        )}
      >
        <div className="flex items-start gap-2">
          <Icono className="mt-0.5 size-4 shrink-0" weight="fill" aria-hidden />
          <p>{mensaje}</p>
        </div>
        {acciones && <div className="flex shrink-0 flex-wrap gap-2 pl-6 sm:pl-0">{acciones}</div>}
      </div>

      {estado === "RECHAZADA" && esAdmin && (
        <PedirRevisionDialog open={revisionOpen} onOpenChange={setRevisionOpen} />
      )}
    </>
  );
}

function PedirRevisionDialog({ open, onOpenChange }: { open: boolean; onOpenChange(open: boolean): void }) {
  const [enviando, setEnviando] = useState(false);
  return (
    <Dialog open={open} onOpenChange={(abierto) => !enviando && onOpenChange(abierto)}>
      {open && (
        <FormularioRevision
          enviando={enviando}
          setEnviando={setEnviando}
          onCerrar={() => onOpenChange(false)}
        />
      )}
    </Dialog>
  );
}

function FormularioRevision({
  enviando,
  setEnviando,
  onCerrar,
}: {
  enviando: boolean;
  setEnviando(v: boolean): void;
  onCerrar(): void;
}) {
  const router = useRouter();
  const uid = useId();
  const [mensaje, setMensaje] = useState("");
  const [error, setError] = useState<string | null>(null);

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    if (enviando) return;
    setError(null);
    setEnviando(true);
    try {
      const res = await requireOnline(() => solicitarRevision(mensaje))();
      if (!res.ok) {
        setError(res.error);
        return;
      }
      avisarExito(
        res.data.ya_procesado
          ? "Tu solicitud ya está en revisión. Te avisaremos por correo."
          : "Enviamos tu solicitud a revisión. Te avisaremos por correo."
      );
      setEnviando(false);
      onCerrar();
      router.refresh();
    } catch (err) {
      setError(humanizeError(err, "pedir la nueva revisión"));
    } finally {
      setEnviando(false);
    }
  };

  return (
    <DialogContent showCloseButton={!enviando}>
      <form onSubmit={enviar} noValidate className="grid gap-4">
        <DialogHeader>
          <DialogTitle>¿Pedir una nueva revisión?</DialogTitle>
          <DialogDescription>Corrige antes lo que indicaba el motivo. Respondemos en 24 a 48 horas hábiles.</DialogDescription>
        </DialogHeader>

        <div className="grid content-start gap-2">
          <Label htmlFor={`${uid}-mensaje`}>Mensaje para el equipo de EnBus (opcional)</Label>
          <Textarea
            id={`${uid}-mensaje`}
            value={mensaje}
            rows={3}
            maxLength={1000}
            disabled={enviando}
            placeholder="Ej.: Corregimos el RIF y agregamos el teléfono de contacto."
            onChange={(e) => setMensaje(e.target.value)}
          />
        </div>

        {error && <AvisoError>{error}</AvisoError>}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCerrar} disabled={enviando}>
            Cancelar
          </Button>
          <Button type="submit" disabled={enviando} aria-busy={enviando || undefined}>
            {enviando && <SpinnerIcon className="motion-safe:animate-spin" aria-hidden />}
            {enviando ? "Enviando…" : "Pedir nueva revisión"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
