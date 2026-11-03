"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowLeft,
  Calendar,
  CheckSquare,
  HandPointing,
  Package,
  ShieldCheck,
  SpinnerIcon,
  Ticket,
  User,
  WarningCircle,
} from "@phosphor-icons/react";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { StatusBadge } from "@/components/status-badge";
import type { Incidencia } from "@/lib/types/admin-incidencias";
import { tomarCaso, resolverIncidencia, activarSeguro } from "@/app/admin/(panel)/incidencias/actions";
import { humanizeError } from "@/lib/errores";
import { formatUsd } from "@/lib/dinero";
import { formatFechaHoraVE } from "@/lib/fechas";
import { formatTelefono, telefonoWhatsApp } from "@/lib/ve";
import { codigoIncidencia, tipoConCategoria } from "./incidencias-table";

interface IncidenciaDetailProps {
  incidencia: Incidencia;
  currentUser: { id: string; nombre_completo: string };
}

const MINIMO_RESOLUCION = 10;
const CLASE_ENLACE = "text-foreground underline decoration-primary underline-offset-4";

function Dato({ icono, etiqueta, children }: { icono: React.ReactNode; etiqueta: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 text-muted-foreground" aria-hidden>
        {icono}
      </span>
      <div className="flex min-w-0 flex-col">
        <span className="text-xs font-medium text-muted-foreground">{etiqueta}</span>
        <div className="text-sm text-foreground">{children}</div>
      </div>
    </div>
  );
}

export function IncidenciaDetail({ incidencia, currentUser }: IncidenciaDetailProps) {
  const router = useRouter();
  const [tomando, setTomando] = useState(false);
  const [resolviendo, setResolviendo] = useState(false);
  const enCurso = useRef(false);
  const [resolucionText, setResolucionText] = useState("");
  const [errorResolucion, setErrorResolucion] = useState<string | null>(null);
  const [showResolveForm, setShowResolveForm] = useState(false);
  const [seguroOpen, setSeguroOpen] = useState(false);

  const ocupado = tomando || resolviendo;

  const handleTomarCaso = async () => {
    if (enCurso.current) return;
    enCurso.current = true;
    setTomando(true);
    try {
      const res = await tomarCaso(incidencia.id);
      if (res.success) {
        toast.success("Tomaste esta incidencia. Ahora aparece «En proceso» a tu nombre.");
        router.refresh();
      } else {
        toast.error(res.error || "No pudimos tomar la incidencia. Intenta de nuevo.");
      }
    } catch (err) {
      toast.error(humanizeError(err, "tomar la incidencia"));
    } finally {
      enCurso.current = false;
      setTomando(false);
    }
  };

  const handleResolverIncidencia = async (e: React.FormEvent) => {
    e.preventDefault();
    if (enCurso.current) return;
    if (resolucionText.trim().length < MINIMO_RESOLUCION) {
      setErrorResolucion(`Cuenta cómo se resolvió (mínimo ${MINIMO_RESOLUCION} caracteres).`);
      return;
    }
    enCurso.current = true;
    setResolviendo(true);
    setErrorResolucion(null);
    try {
      const formData = new FormData();
      formData.append("resolucion", resolucionText.trim());
      const res = await resolverIncidencia(incidencia.id, formData);
      if (res.success) {
        toast.success("Incidencia resuelta.");
        setShowResolveForm(false);
        setResolucionText("");
        router.refresh();
      } else {
        setErrorResolucion(res.error || "No pudimos resolver la incidencia. Intenta de nuevo.");
      }
    } catch (err) {
      setErrorResolucion(humanizeError(err, "resolver la incidencia"));
    } finally {
      enCurso.current = false;
      setResolviendo(false);
    }
  };

  const valorDeclarado = incidencia.encomienda?.valor_declarado ? Number(incidencia.encomienda.valor_declarado) : 0;
  // Spec: cobertura = 3× valor declarado
  const montoSeguro = valorDeclarado * 3;

  const reportante = incidencia.reportado_por_profile;
  const telefono = reportante?.telefono ? formatTelefono(reportante.telefono) : "—";
  const whatsapp = telefonoWhatsApp(reportante?.telefono);
  const codigo = codigoIncidencia(incidencia.id);

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/incidencias"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden /> Volver a incidencias
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader className="border-b pb-5">
              <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                <div className="space-y-1">
                  <span className="font-mono text-xs text-muted-foreground">{codigo}</span>
                  <CardTitle className="text-xl font-semibold">{tipoConCategoria(incidencia)}</CardTitle>
                </div>
                <StatusBadge status={incidencia.estado} dominio="incidencia" className="w-fit" />
              </div>
            </CardHeader>
            <CardContent className="space-y-6 pt-6">
              <div className="space-y-2">
                <span className="text-sm font-medium text-muted-foreground">Qué pasó</span>
                <p className="rounded-lg border bg-muted/40 p-4 text-sm leading-relaxed whitespace-pre-line text-foreground">
                  {incidencia.descripcion}
                </p>
              </div>

              {incidencia.estado === "RESUELTA" && (
                <div className="space-y-2">
                  <span className="flex items-center gap-1.5 text-sm font-medium text-success-text">
                    <CheckSquare className="h-4 w-4" aria-hidden />
                    Cómo se resolvió
                  </span>
                  <div className="rounded-lg border border-emerald-600/30 bg-emerald-50 p-4 text-sm leading-relaxed text-emerald-950 dark:bg-emerald-400/10 dark:text-emerald-100">
                    {incidencia.resolucion || "Se resolvió sin detalles."}
                  </div>
                </div>
              )}

              {showResolveForm && (
                <form onSubmit={handleResolverIncidencia} noValidate className="space-y-4 border-t pt-6">
                  <div className="space-y-1.5">
                    <Label htmlFor="resolucion">Cómo se resolvió</Label>
                    <Textarea
                      id="resolucion"
                      rows={4}
                      autoFocus
                      placeholder="Por ejemplo: se contactó al pasajero y la cooperativa le devolvió el pago por Pago Móvil."
                      value={resolucionText}
                      onChange={(e) => {
                        setResolucionText(e.target.value);
                        if (errorResolucion) setErrorResolucion(null);
                      }}
                      aria-invalid={errorResolucion ? true : undefined}
                      aria-describedby={errorResolucion ? "resolucion-error" : "resolucion-ayuda"}
                      disabled={resolviendo}
                    />
                    {errorResolucion ? (
                      <p id="resolucion-error" role="alert" className="flex items-start gap-1.5 text-sm text-destructive-text">
                        <WarningCircle className="mt-0.5 size-4 shrink-0" weight="fill" aria-hidden />
                        {errorResolucion}
                      </p>
                    ) : (
                      <p id="resolucion-ayuda" className="text-xs text-muted-foreground">
                        Quien reportó no ve este texto; queda en el historial de EnBus.
                      </p>
                    )}
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setShowResolveForm(false);
                        setResolucionText("");
                        setErrorResolucion(null);
                      }}
                      disabled={resolviendo}
                    >
                      Cancelar
                    </Button>
                    <Button type="submit" size="sm" disabled={resolviendo} aria-busy={resolviendo || undefined}>
                      {resolviendo && <SpinnerIcon className="animate-spin" aria-hidden />}
                      {resolviendo ? "Guardando…" : "Marcar como resuelta"}
                    </Button>
                  </div>
                </form>
              )}
            </CardContent>

            {!showResolveForm && incidencia.estado !== "RESUELTA" && (
              <CardFooter className="flex flex-wrap justify-end gap-3 border-t bg-muted/30 pt-5">
                {incidencia.tipo === "PERDIDA" && incidencia.encomienda && (
                  <Button
                    variant="outline"
                    className="gap-1.5 border-destructive/40 text-destructive-text hover:bg-destructive/10"
                    onClick={() => setSeguroOpen(true)}
                    disabled={ocupado}
                  >
                    <ShieldCheck className="h-4 w-4" aria-hidden />
                    Activar seguro ({formatUsd(montoSeguro)})
                  </Button>
                )}

                {incidencia.estado === "ABIERTA" && (
                  <Button onClick={handleTomarCaso} className="gap-1.5" disabled={ocupado} aria-busy={tomando || undefined}>
                    {tomando ? (
                      <SpinnerIcon className="h-4 w-4 animate-spin" aria-hidden />
                    ) : (
                      <HandPointing className="h-4 w-4" aria-hidden />
                    )}
                    {tomando ? "Tomando…" : "Tomar caso"}
                  </Button>
                )}

                {incidencia.estado === "EN_PROCESO" && (
                  <Button
                    onClick={() => {
                      setShowResolveForm(true);
                      setResolucionText("");
                    }}
                    className="gap-1.5"
                    disabled={ocupado}
                  >
                    <CheckSquare className="h-4 w-4" aria-hidden />
                    Resolver caso
                  </Button>
                )}
              </CardFooter>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold">Información del caso</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Dato icono={<User className="h-4 w-4" />} etiqueta="Reportada por">
                {incidencia.reportado_por && reportante ? (
                  <Link href={`/admin/usuarios/${incidencia.reportado_por}`} className={CLASE_ENLACE}>
                    {reportante.nombre_completo}
                  </Link>
                ) : (
                  "Sistema (automática)"
                )}
              </Dato>

              {reportante && (
                <Dato icono={<User className="h-4 w-4" />} etiqueta="Contacto">
                  <div className="flex flex-col gap-0.5">
                    {reportante.email && (
                      <a href={`mailto:${reportante.email}?subject=${encodeURIComponent(`Tu reporte ${codigo} en EnBus`)}`} className={CLASE_ENLACE}>
                        {reportante.email}
                      </a>
                    )}
                    {whatsapp ? (
                      <a
                        href={`https://wa.me/${whatsapp}?text=${encodeURIComponent(`Hola ${reportante.nombre_completo}, te escribimos de EnBus por tu reporte ${codigo}.`)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={CLASE_ENLACE}
                      >
                        {telefono} · WhatsApp
                      </a>
                    ) : (
                      <span className="text-muted-foreground">Sin teléfono válido</span>
                    )}
                  </div>
                </Dato>
              )}

              <Dato icono={<Calendar className="h-4 w-4" />} etiqueta="Fecha del reporte">
                {formatFechaHoraVE(incidencia.created_at)}
              </Dato>

              {incidencia.estado !== "ABIERTA" && (
                <Dato
                  icono={<User className="h-4 w-4" />}
                  etiqueta={incidencia.estado === "EN_PROCESO" ? "La atiende" : "La resolvió"}
                >
                  <span className="font-medium">
                    {incidencia.resuelta_por_profile?.nombre_completo ||
                      (incidencia.resuelta_por === currentUser.id ? currentUser.nombre_completo : "Administrador EnBus")}
                  </span>
                </Dato>
              )}
            </CardContent>
          </Card>

          {incidencia.boleto && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                  <Ticket className="h-4 w-4 text-muted-foreground" aria-hidden />
                  Boleto relacionado
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Dato icono={<Ticket className="h-4 w-4" />} etiqueta="Código">
                  <span className="font-mono font-semibold">{incidencia.boleto.codigo_boleto}</span>
                </Dato>
                {incidencia.boleto.asiento && (
                  <Dato icono={<Ticket className="h-4 w-4" />} etiqueta="Asiento">
                    {incidencia.boleto.asiento}
                  </Dato>
                )}
                <Dato icono={<Ticket className="h-4 w-4" />} etiqueta="Estado">
                  <StatusBadge status={incidencia.boleto.estado} dominio="boleto" />
                </Dato>
              </CardContent>
            </Card>
          )}

          {incidencia.encomienda && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                  <Package className="h-4 w-4 text-muted-foreground" aria-hidden />
                  Encomienda relacionada
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Dato icono={<Package className="h-4 w-4" />} etiqueta="Código de seguimiento">
                  <Link
                    href={`/admin/encomiendas?codigo=${encodeURIComponent(incidencia.encomienda.tracking_id)}`}
                    className={`${CLASE_ENLACE} font-mono font-semibold`}
                  >
                    {incidencia.encomienda.tracking_id}
                  </Link>
                </Dato>
                <Dato icono={<Package className="h-4 w-4" />} etiqueta="Contenido declarado">
                  {incidencia.encomienda.descripcion_contenido || "Sin descripción."}
                </Dato>
                <Dato icono={<Package className="h-4 w-4" />} etiqueta="Valor declarado">
                  <span className="font-semibold">{formatUsd(valorDeclarado)}</span>
                </Dato>
                <Dato icono={<Package className="h-4 w-4" />} etiqueta="Estado del envío">
                  <StatusBadge status={incidencia.encomienda.estado} dominio="encomienda" />
                </Dato>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={seguroOpen}
        onOpenChange={setSeguroOpen}
        titulo="¿Activar el seguro de esta encomienda?"
        descripcion={
          <>
            Se aprueba un reembolso de <strong>{formatUsd(montoSeguro)}</strong> (3 veces el valor declarado de{" "}
            {formatUsd(valorDeclarado)}) y la incidencia queda resuelta.
          </>
        }
        impacto={[
          "La incidencia pasa a «Resuelta» con el monto del seguro en la resolución.",
          "No se puede deshacer desde el panel.",
        ]}
        verbo="Activar seguro"
        verboCargando="Activando…"
        tono="destructive"
        onConfirm={async () => {
          const res = await activarSeguro(incidencia.id);
          if (!res.success) return { ok: false, error: res.error };
          toast.success("Seguro activado. La incidencia quedó resuelta.");
          router.refresh();
          return { ok: true };
        }}
      />
    </div>
  );
}
