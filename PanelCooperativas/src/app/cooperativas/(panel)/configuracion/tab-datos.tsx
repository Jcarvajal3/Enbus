"use client";

import { useId, useRef, useState, useTransition, useEffect, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Upload, Buildings, Lock, WhatsappLogo, WarningCircle } from "@phosphor-icons/react";
import { toast } from "sonner";
import Image from "next/image";
import { actualizarDatosCooperativa, uploadLogo } from "@/app/cooperativas/(panel)/configuracion/actions";
import type { CooperativaData } from "@/lib/types/configuracion";
import { requireOnline } from "@/components/connectivity-banner";
import { humanizeError } from "@/lib/errores";
import { normalizeRif, RIF_AYUDA, RIF_PLACEHOLDER } from "@/lib/rif";
import { formatNumeroVE } from "@/lib/dinero";
import { telefonoWhatsApp } from "@/lib/ve";

interface DatosCooperativaTabProps {
  cooperativa: CooperativaData;
  /** Estado de la cooperativa: en PENDIENTE o RECHAZADA se pueden corregir el nombre y el RIF. */
  estado: string | null;
}

const LOGO_MAX_BYTES = 2 * 1024 * 1024;

/** Enlace de WhatsApp de soporte de EnBus, o null si no está configurado. */
function enlaceSoporte(texto: string): string | null {
  const numero = telefonoWhatsApp(process.env.NEXT_PUBLIC_SOPORTE_WHATSAPP) ??
    ((process.env.NEXT_PUBLIC_SOPORTE_WHATSAPP ?? "").replace(/\D/g, "") || null);
  return numero ? `https://wa.me/${numero}?text=${encodeURIComponent(texto)}` : null;
}

export function DatosCooperativaTab({ cooperativa, estado }: DatosCooperativaTabProps) {
  const router = useRouter();
  const uid = useId();
  const [logoUrl, setLogoUrl] = useState(cooperativa.logo_url);
  const [isPending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewUrlRef = useRef<string | null>(null);

  const editable = estado === "PENDIENTE" || estado === "RECHAZADA";
  const [nombre, setNombre] = useState(cooperativa.nombre);
  const [rif, setRif] = useState(cooperativa.rif ?? "");
  const [guardando, setGuardando] = useState(false);
  const [errorCampo, setErrorCampo] = useState<{ campo?: string; mensaje: string } | null>(null);

  // Revoca la vista previa pendiente al desmontar
  useEffect(() => {
    return () => {
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
      }
    };
  }, []);

  function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // permite volver a elegir el mismo archivo
    if (!file) return;
    if (file.size > LOGO_MAX_BYTES) {
      toast.error("La imagen pesa más de 2 MB. Usa una más liviana.");
      return;
    }

    // Vista previa antes de subir
    const previewUrl = URL.createObjectURL(file);
    previewUrlRef.current = previewUrl;
    setLogoUrl(previewUrl);

    const formData = new FormData();
    formData.append("logo", file);

    startTransition(async () => {
      try {
        const res = await requireOnline(() => uploadLogo(formData))();
        if (res.ok) {
          setLogoUrl(res.data.url);
          toast.success("Logo actualizado.");
        } else {
          toast.error(res.error);
          setLogoUrl(cooperativa.logo_url); // se revierte
        }
      } catch (err: unknown) {
        toast.error(humanizeError(err, "subir el logo"));
        setLogoUrl(cooperativa.logo_url);
      } finally {
        if (previewUrlRef.current) {
          URL.revokeObjectURL(previewUrlRef.current);
          previewUrlRef.current = null;
        }
      }
    });
  }

  async function guardarDatos(e: FormEvent) {
    e.preventDefault();
    if (guardando) return;
    setErrorCampo(null);
    if (nombre.trim().length < 3) {
      setErrorCampo({ campo: "nombre", mensaje: "Escribe el nombre de la cooperativa (mínimo 3 caracteres)." });
      return;
    }
    if (!normalizeRif(rif)) {
      setErrorCampo({ campo: "rif", mensaje: RIF_AYUDA });
      return;
    }
    setGuardando(true);
    try {
      const res = await requireOnline(() => actualizarDatosCooperativa({ nombre, rif }))();
      if (!res.ok) {
        setErrorCampo({ campo: res.campo, mensaje: res.error });
        return;
      }
      setNombre(res.data.nombre);
      setRif(res.data.rif);
      toast.success("Datos guardados.");
      router.refresh();
    } catch (err) {
      setErrorCampo({ mensaje: humanizeError(err, "guardar los datos de la cooperativa") });
    } finally {
      setGuardando(false);
    }
  }

  const soporte = enlaceSoporte(
    `Hola, soy administrador de ${cooperativa.nombre} (RIF ${cooperativa.rif ?? "sin RIF"}) y necesito cambiar el nombre o el RIF de la cooperativa.`
  );
  const cambiado = nombre.trim() !== cooperativa.nombre || (normalizeRif(rif) ?? rif) !== (cooperativa.rif ?? "");

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Buildings size={20} weight="duotone" aria-hidden />
          Datos de la cooperativa
        </CardTitle>
        <CardDescription>
          {editable
            ? "Mientras revisamos tu solicitud puedes corregir el nombre y el RIF."
            : "Estos datos los ven los pasajeros en la app y en sus boletos."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Logo */}
        <div className="flex items-center gap-6">
          <div className="w-24 h-24 rounded-xl border bg-muted flex items-center justify-center overflow-hidden shrink-0">
            {logoUrl ? (
              <Image
                src={logoUrl}
                alt={`Logo de ${cooperativa.nombre}`}
                width={96}
                height={96}
                className="object-contain w-full h-full"
                unoptimized
              />
            ) : (
              <Buildings size={40} className="text-muted-foreground" weight="duotone" aria-hidden />
            )}
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium">Logo de la cooperativa</p>
            <p className="text-xs text-muted-foreground">PNG, JPG o WebP de hasta 2 MB.</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={isPending}
            >
              <Upload size={14} className="mr-2" aria-hidden />
              {isPending ? "Subiendo…" : "Cambiar logo"}
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              aria-label="Elegir imagen del logo"
              onChange={handleLogoChange}
            />
          </div>
        </div>

        {editable ? (
          <form onSubmit={guardarDatos} noValidate className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor={`${uid}-nombre`}>Nombre de la cooperativa</Label>
                <Input
                  id={`${uid}-nombre`}
                  value={nombre}
                  disabled={guardando}
                  autoComplete="organization"
                  aria-invalid={errorCampo?.campo === "nombre" ? true : undefined}
                  onChange={(e) => setNombre(e.target.value)}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor={`${uid}-rif`}>RIF</Label>
                <Input
                  id={`${uid}-rif`}
                  value={rif}
                  placeholder={RIF_PLACEHOLDER}
                  autoCapitalize="characters"
                  disabled={guardando}
                  aria-invalid={errorCampo?.campo === "rif" ? true : undefined}
                  aria-describedby={`${uid}-rif-ayuda`}
                  onChange={(e) => setRif(e.target.value)}
                  onBlur={() => setRif((actual) => normalizeRif(actual) ?? actual)}
                />
                <p id={`${uid}-rif-ayuda`} className="text-xs text-muted-foreground">
                  Ejemplo: {RIF_PLACEHOLDER}
                </p>
              </div>
            </div>
            {errorCampo && (
              <div
                role="alert"
                className="flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive-light p-3 text-sm text-destructive-deep"
              >
                <WarningCircle className="mt-0.5 size-4 shrink-0" weight="fill" aria-hidden />
                <p>{errorCampo.mensaje}</p>
              </div>
            )}
            <Button type="submit" disabled={guardando || !cambiado}>
              {guardando ? "Guardando…" : "Guardar cambios"}
            </Button>
          </form>
        ) : (
          <div className="space-y-3">
            <div className="grid gap-4 sm:grid-cols-2">
              <ReadOnlyField label="Nombre de la cooperativa" value={cooperativa.nombre} />
              <ReadOnlyField label="RIF" value={cooperativa.rif ?? "—"} />
            </div>
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
              <Lock size={14} aria-hidden />
              Para cambiar el nombre o el RIF, escríbenos.
              {soporte && (
                <a
                  href={soporte}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 font-medium text-foreground underline decoration-primary underline-offset-4"
                >
                  <WhatsappLogo size={14} weight="fill" aria-hidden />
                  Escribir por WhatsApp
                </a>
              )}
            </p>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <ReadOnlyField
            label="Comisión de EnBus"
            value={
              cooperativa.comision_porcentaje == null || (editable && Number(cooperativa.comision_porcentaje) === 0)
                ? "La define EnBus al aprobar tu solicitud"
                : `${formatNumeroVE(Number(cooperativa.comision_porcentaje))} % por venta`
            }
            ayuda="La define el equipo de EnBus."
          />
        </div>
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function ReadOnlyField({ label, value, ayuda }: { label: string; value: string; ayuda?: string }) {
  return (
    <div className="space-y-1.5">
      <p className="text-sm font-medium">{label}</p>
      <p className="text-sm bg-muted px-3 py-2 rounded-md border">{value}</p>
      {ayuda && <p className="text-xs text-muted-foreground">{ayuda}</p>}
    </div>
  );
}
