"use client";

import { useRef, useState, useTransition, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Upload, Buildings, Lock } from "@phosphor-icons/react";
import { toast } from "sonner";
import Image from "next/image";
import { uploadLogo } from "@/app/cooperativas/(panel)/configuracion/actions";
import type { CooperativaData } from "@/lib/types/configuracion";
import { requireOnline } from "@/components/connectivity-banner";

interface DatosCooperativaTabProps {
  cooperativa: CooperativaData;
}

export function DatosCooperativaTab({ cooperativa }: DatosCooperativaTabProps) {
  const [logoUrl, setLogoUrl] = useState(cooperativa.logo_url);
  const [isPending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewUrlRef = useRef<string | null>(null);

  // Revoke any pending preview URL on unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
      }
    };
  }, []);

  function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    // Client-side preview before upload
    const previewUrl = URL.createObjectURL(file);
    previewUrlRef.current = previewUrl;
    setLogoUrl(previewUrl);

    const formData = new FormData();
    formData.append("logo", file);

    startTransition(async () => {
      try {
        const { url } = await requireOnline(() => uploadLogo(formData))();
        setLogoUrl(url);
        toast.success("Logo actualizado correctamente");
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Error al subir logo";
        toast.error(message);
        setLogoUrl(cooperativa.logo_url); // revert
      } finally {
        if (previewUrlRef.current) {
          URL.revokeObjectURL(previewUrlRef.current);
          previewUrlRef.current = null;
        }
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Buildings size={20} weight="duotone" />
          Datos de la Cooperativa
        </CardTitle>
        <CardDescription>
          Información general. Los campos marcados con <Lock size={12} className="inline mx-0.5" /> solo pueden ser modificados por el Super Admin.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Logo */}
        <div className="flex items-center gap-6">
          <div className="w-24 h-24 rounded-xl border bg-muted flex items-center justify-center overflow-hidden shrink-0">
            {logoUrl ? (
              <Image
                src={logoUrl}
                alt={`Logo ${cooperativa.nombre}`}
                width={96}
                height={96}
                className="object-contain w-full h-full"
                unoptimized
              />
            ) : (
              <Buildings size={40} className="text-muted-foreground" weight="duotone" />
            )}
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium">Logo de la Cooperativa</p>
            <p className="text-xs text-muted-foreground">PNG o JPG recomendado. Máx. 2MB.</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={isPending}
            >
              <Upload size={14} className="mr-2" />
              {isPending ? "Subiendo..." : "Cambiar Logo"}
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={handleLogoChange}
            />
          </div>
        </div>

        {/* Read-only fields */}
        <div className="grid gap-4 sm:grid-cols-2">
          <ReadOnlyField label="Nombre de la Cooperativa" value={cooperativa.nombre} locked />
          <ReadOnlyField label="RIF" value={cooperativa.rif ?? "—"} locked />
          <ReadOnlyField
            label="Comisión EnBus"
            value={cooperativa.comision_porcentaje != null ? `${cooperativa.comision_porcentaje}%` : "—"}
            locked
          />
        </div>
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function ReadOnlyField({ label, value, locked }: { label: string; value: string; locked?: boolean }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <label className="text-sm font-medium">{label}</label>
        {locked && (
          <Badge variant="secondary" className="text-xs gap-1 px-1.5 py-0">
            <Lock size={10} /> Solo Super Admin
          </Badge>
        )}
      </div>
      <p className="text-sm bg-muted px-3 py-2 rounded-md border">{value}</p>
    </div>
  );
}
