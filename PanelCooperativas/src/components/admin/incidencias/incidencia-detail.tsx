"use client";

// ─── Detalle de una incidencia (AD5-07, AD5-08, AD5-22, AD5-33) ─────────────
// H1 = código ("INC-1A2B3C"); estado y prioridad junto al título; acciones en
// la cabecera como en Cooperativa y Usuario. "Resolver caso" abre un diálogo.

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckSquare, HandPointing, Package, ShieldCheck, Ticket } from "@phosphor-icons/react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { AvisoError } from "@/components/aviso-error";
import { StatusBadge } from "@/components/status-badge";
import { PageHeader } from "@/components/page-header";
import { MigaObjeto } from "@/components/miga-objeto";
import { Monto } from "@/components/monto";
import { Dato, Vacio } from "@/components/admin/detalle";
import { codigoIncidencia, type Incidencia } from "@/lib/types/admin-incidencias";
import { tomarCaso, resolverIncidencia, activarSeguro } from "@/app/admin/(panel)/incidencias/actions";
import { humanizeError } from "@/lib/errores";
import { avisarError, avisarExito } from "@/lib/avisos";
import { formatFechaHoraVE } from "@/lib/fechas";
import { formatTelefono, telefonoWhatsApp } from "@/lib/ve";
import { etiquetaRol } from "@/lib/estados";
import { formatCodigoBoleto } from "@/lib/artefactos.generated";
import { PrioridadBadge, tipoConCategoria } from "./incidencias-table";

interface IncidenciaDetailProps {
  incidencia: Incidencia;
  currentUser: { id: string; nombre_completo: string };
}

const MINIMO_RESOLUCION = 10;
const ENLACE = "font-medium text-info-text underline-offset-4 hover:underline focus-visible:underline";

export function IncidenciaDetail({ incidencia, currentUser }: IncidenciaDetailProps) {
  const router = useRouter();
  const [tomando, setTomando] = useState(false);
  const [resolverOpen, setResolverOpen] = useState(false);
  const [seguroOpen, setSeguroOpen] = useState(false);
  const enCurso = useRef(false);

  const handleTomarCaso = async () => {
    if (enCurso.current) return;
    enCurso.current = true;
    setTomando(true);
    try {
      const res = await tomarCaso(incidencia.id);
      if (res.success) {
        avisarExito("Tomaste esta incidencia. Ahora está «En proceso» a tu nombre.");
        router.refresh();
      } else {
        avisarError(res.error || "No pudimos tomar la incidencia. Intenta de nuevo.");
      }
    } catch (err) {
      avisarError(humanizeError(err, "tomar la incidencia"));
    } finally {
      enCurso.current = false;
      setTomando(false);
    }
  };

  const valorDeclarado = incidencia.encomienda?.valor_declarado ? Number(incidencia.encomienda.valor_declarado) : 0;
  // Spec: cobertura = 3× valor declarado
  const montoSeguro = valorDeclarado * 3;
  const esPerdida = incidencia.tipo === "PERDIDA" && Boolean(incidencia.encomienda);
  const puedeActivarSeguro = esPerdida && incidencia.estado === "EN_PROCESO" && valorDeclarado > 0;
  const seguroSinValor = esPerdida && valorDeclarado <= 0;

  const reportante = incidencia.reportado_por_profile;
  const telefono = reportante?.telefono ? formatTelefono(reportante.telefono) : "—";
  const whatsapp = telefonoWhatsApp(reportante?.telefono);
  const codigo = codigoIncidencia(incidencia.id);

  return (
    <div className="flex flex-col gap-6">
      <MigaObjeto label={codigo} />
      <PageHeader
        title={codigo}
        estado={
          <>
            <StatusBadge status={incidencia.estado} dominio="incidencia" />
            <PrioridadBadge incidencia={incidencia} />
          </>
        }
        description={tipoConCategoria(incidencia)}
      >
        {incidencia.estado === "ABIERTA" && (
          <Button onClick={handleTomarCaso} disabled={tomando} aria-busy={tomando || undefined}>
            {tomando ? <Spinner size="sm" aria-hidden /> : <HandPointing aria-hidden />}
            {tomando ? "Tomando…" : "Tomar caso"}
          </Button>
        )}
        {incidencia.estado === "EN_PROCESO" && (
          <Button onClick={() => setResolverOpen(true)}>
            <CheckSquare aria-hidden /> Resolver caso
          </Button>
        )}
        {/* Seguro (AD-20): solo con el caso tomado y un valor declarado mayor que 0. */}
        {puedeActivarSeguro && (
          <Button variant="outline" onClick={() => setSeguroOpen(true)}>
            <ShieldCheck aria-hidden /> Activar seguro
          </Button>
        )}
      </PageHeader>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Qué pasó</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <p className="text-sm leading-relaxed whitespace-pre-line">{incidencia.descripcion}</p>
              {seguroSinValor && incidencia.estado !== "RESUELTA" && (
                <p className="text-sm text-muted-foreground">
                  La encomienda no declaró valor: el seguro no aplica. Anota la compensación en la resolución.
                </p>
              )}
              {esPerdida && !seguroSinValor && incidencia.estado === "ABIERTA" && (
                <p className="text-sm text-muted-foreground">Toma el caso para activar el seguro.</p>
              )}
            </CardContent>
          </Card>

          {incidencia.estado === "RESUELTA" && (
            <Card>
              <CardHeader>
                <CardTitle>Cómo se resolvió</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm leading-relaxed whitespace-pre-line">
                  {incidencia.resolucion || <Vacio texto="Se resolvió sin detalles" />}
                </p>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Caso</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="flex flex-col gap-4">
                <Dato etiqueta="Reportada por">
                  {incidencia.reportado_por && reportante ? (
                    <Link href={`/admin/usuarios/${incidencia.reportado_por}`} className={ENLACE}>
                      {reportante.nombre_completo}
                    </Link>
                  ) : (
                    "Sistema (automática)"
                  )}
                </Dato>
                {reportante && (
                  <Dato etiqueta="Contacto">
                    <span className="flex flex-col gap-0.5">
                      {reportante.email && (
                        <a
                          href={`mailto:${reportante.email}?subject=${encodeURIComponent(`Tu reporte ${codigo} en EnBus`)}`}
                          className={ENLACE}
                        >
                          {reportante.email}
                        </a>
                      )}
                      {whatsapp ? (
                        <a
                          href={`https://wa.me/${whatsapp}?text=${encodeURIComponent(`Hola ${reportante.nombre_completo}, te escribimos de EnBus por tu reporte ${codigo}.`)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={ENLACE}
                        >
                          {telefono} · WhatsApp
                        </a>
                      ) : (
                        <Vacio texto="Sin teléfono válido" />
                      )}
                    </span>
                  </Dato>
                )}
                <Dato etiqueta="Fecha del reporte">
                  <span className="tabular-nums">{formatFechaHoraVE(incidencia.created_at)}</span>
                </Dato>
                {incidencia.estado !== "ABIERTA" && (
                  <Dato etiqueta={incidencia.estado === "EN_PROCESO" ? "La atiende" : "La resolvió"}>
                    {incidencia.resuelta_por_profile?.nombre_completo ||
                      (incidencia.resuelta_por === currentUser.id ? currentUser.nombre_completo : etiquetaRol("super_admin"))}
                  </Dato>
                )}
              </dl>
            </CardContent>
          </Card>

          {incidencia.boleto && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Ticket className="size-5 text-muted-foreground" aria-hidden /> Boleto
                </CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="flex flex-col gap-4">
                  <Dato etiqueta="Código">
                    <span className="font-mono">{formatCodigoBoleto(incidencia.boleto.codigo_boleto)}</span>
                  </Dato>
                  {incidencia.boleto.asiento && <Dato etiqueta="Asiento">{incidencia.boleto.asiento}</Dato>}
                  <Dato etiqueta="Estado">
                    <StatusBadge status={incidencia.boleto.estado} dominio="boleto" />
                  </Dato>
                </dl>
              </CardContent>
            </Card>
          )}

          {incidencia.encomienda && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Package className="size-5 text-muted-foreground" aria-hidden /> Encomienda
                </CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="flex flex-col gap-4">
                  <Dato etiqueta="Código de seguimiento">
                    <Link
                      href={`/admin/encomiendas?codigo=${encodeURIComponent(incidencia.encomienda.tracking_id)}`}
                      className={`${ENLACE} font-mono`}
                    >
                      {incidencia.encomienda.tracking_id}
                    </Link>
                  </Dato>
                  <Dato etiqueta="Contenido declarado">
                    {incidencia.encomienda.descripcion_contenido || <Vacio texto="Sin descripción" />}
                  </Dato>
                  <Dato etiqueta="Valor declarado">
                    {valorDeclarado > 0 ? <Monto usd={valorDeclarado} moneda="USD" size="sm" /> : <Vacio texto="Sin valor declarado" />}
                  </Dato>
                  <Dato etiqueta="Estado">
                    <StatusBadge status={incidencia.encomienda.estado} dominio="encomienda" />
                  </Dato>
                </dl>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <ResolverDialog incidenciaId={incidencia.id} open={resolverOpen} onOpenChange={setResolverOpen} />

      <ConfirmDialog
        open={seguroOpen}
        onOpenChange={setSeguroOpen}
        titulo="¿Activar el seguro de esta encomienda?"
        descripcion={
          <span className="flex flex-col gap-3">
            <span>Se aprueba un reembolso de 3 veces el valor declarado y la incidencia queda resuelta.</span>
            <span className="flex items-start justify-between gap-4 rounded-md bg-muted p-3 text-foreground">
              <span className="text-sm">Reembolso</span>
              <Monto usd={montoSeguro} moneda="USD" size="md" align="right" />
            </span>
          </span>
        }
        impacto={["La incidencia pasa a «Resuelta» con el monto del seguro en la resolución.", "No se puede deshacer."]}
        verbo="Activar seguro"
        verboCargando="Activando…"
        tono="destructive"
        onConfirm={async () => {
          const res = await activarSeguro(incidencia.id);
          if (!res.success) return { ok: false, error: res.error };
          avisarExito("Seguro activado. La incidencia quedó resuelta.");
          router.refresh();
          return { ok: true };
        }}
      />
    </div>
  );
}

function ResolverDialog({
  incidenciaId,
  open,
  onOpenChange,
}: {
  incidenciaId: string;
  open: boolean;
  onOpenChange(v: boolean): void;
}) {
  const router = useRouter();
  const [texto, setTexto] = useState("");
  const [errorCampo, setErrorCampo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const cambiarAbierto = (v: boolean) => {
    if (guardando) return;
    onOpenChange(v);
    if (!v) {
      setTexto("");
      setErrorCampo(null);
      setError(null);
    }
  };

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (guardando) return;
    if (texto.trim().length < MINIMO_RESOLUCION) {
      setErrorCampo(`Cuenta cómo se resolvió (mínimo ${MINIMO_RESOLUCION} caracteres).`);
      return;
    }
    setGuardando(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("resolucion", texto.trim());
      const res = await resolverIncidencia(incidenciaId, formData);
      if (!res.success) {
        setError(res.error || "No pudimos resolver la incidencia. Intenta de nuevo.");
        return;
      }
      avisarExito("Incidencia resuelta.");
      setGuardando(false);
      cambiarAbierto(false);
      router.refresh();
    } catch (err) {
      setError(humanizeError(err, "resolver la incidencia"));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={cambiarAbierto}>
      <DialogContent>
        <form onSubmit={enviar} noValidate className="flex flex-col gap-6">
          <DialogHeader>
            <DialogTitle>Resolver caso</DialogTitle>
            <DialogDescription>Queda en el historial de EnBus; quien reportó no lo ve.</DialogDescription>
          </DialogHeader>
          <Field data-invalid={errorCampo ? true : undefined}>
            <FieldLabel htmlFor="resolucion">Cómo se resolvió</FieldLabel>
            <Textarea
              id="resolucion"
              rows={4}
              autoFocus
              placeholder="Ej.: La cooperativa devolvió el pago por Pago Móvil."
              value={texto}
              onChange={(e) => {
                setTexto(e.target.value);
                setErrorCampo(null);
                setError(null);
              }}
              aria-invalid={errorCampo ? true : undefined}
              aria-describedby="resolucion-ayuda"
              disabled={guardando}
            />
            {errorCampo ? (
              <FieldError id="resolucion-ayuda">{errorCampo}</FieldError>
            ) : (
              <FieldDescription id="resolucion-ayuda">Mínimo {MINIMO_RESOLUCION} caracteres.</FieldDescription>
            )}
          </Field>
          {error && <AvisoError>{error}</AvisoError>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => cambiarAbierto(false)} disabled={guardando}>
              Cancelar
            </Button>
            <Button type="submit" disabled={guardando} aria-busy={guardando || undefined}>
              {guardando && <Spinner size="sm" aria-hidden />}
              {guardando ? "Guardando…" : "Marcar como resuelta"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
