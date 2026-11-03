export const dynamic = "force-dynamic";

import Link from "next/link";
import { MagnifyingGlass, Package } from "@phosphor-icons/react/dist/ssr";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge, TonoBadge } from "@/components/status-badge";
import { EmptyState } from "@/components/empty-state";
import { DesbloquearPinButton } from "@/components/admin/encomiendas/desbloquear-pin-button";
import { ErrorRefrescar } from "@/components/admin/error-refrescar";
import { Dato, Vacio } from "@/components/admin/detalle";
import { requireSuperAdmin } from "@/lib/supabase/auth-guards";
import { formatFechaHoraVE } from "@/lib/fechas";
import { formatCedula, formatTelefono } from "@/lib/ve";
import { MODALIDAD_PAGO } from "@/lib/estados";
import { formatCiudad } from "@/lib/ciudades";
import { PIN_MAX_INTENTOS } from "@/lib/artefactos.generated";
import { buscarEncomiendaAdmin, type EncomiendaAdmin } from "./actions";

interface PageProps {
  searchParams: Promise<{ codigo?: string }>;
}

const ENLACE = "font-medium text-info-text underline-offset-4 hover:underline focus-visible:underline";
const ESTADOS_CERRADOS = ["ENTREGADA", "CANCELADA", "DEVUELTA"];

function legible(valor: string | null | undefined, formato: (v: string) => string) {
  if (!valor || valor.toUpperCase().startsWith("PENDIENTE")) return "—";
  const f = formato(valor);
  return f === "—" ? valor : f;
}

function ciudad(nombre: string, estado: string) {
  const c = formatCiudad(nombre) || nombre;
  return estado ? `${c} (${formatCiudad(estado) || estado})` : c;
}

function Persona({
  titulo,
  nombre,
  cedula,
  telefono,
  usuarioId,
  nota,
}: {
  titulo: string;
  nombre: string | null;
  cedula: string | null;
  telefono: string | null;
  usuarioId: string | null;
  nota?: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{titulo}</CardTitle>
        {nota && <CardDescription>{nota}</CardDescription>}
      </CardHeader>
      <CardContent>
        <dl className="flex flex-col gap-4">
          <Dato etiqueta="Nombre">
            {usuarioId && nombre ? (
              <Link href={`/admin/usuarios/${usuarioId}`} className={ENLACE}>
                {nombre}
              </Link>
            ) : (
              nombre || <Vacio />
            )}
          </Dato>
          <Dato etiqueta="Cédula">{legible(cedula, formatCedula)}</Dato>
          <Dato etiqueta="Teléfono">
            <span className="tabular-nums">{legible(telefono, formatTelefono)}</span>
          </Dato>
        </dl>
      </CardContent>
    </Card>
  );
}

function Resultado({ e }: { e: EncomiendaAdmin }) {
  const cerrada = ESTADOS_CERRADOS.includes(e.estado);
  const puedeDesbloquear = !cerrada && (e.pin_bloqueado || e.intentos_pin > 0);

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <CardTitle className="font-mono text-lg">{e.tracking_id}</CardTitle>
            <StatusBadge status={e.estado} dominio="encomienda" />
          </div>
          <CardDescription className="tabular-nums">
            Creada el {formatFechaHoraVE(e.created_at)} · último cambio el {formatFechaHoraVE(e.updated_at)}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
            <Dato etiqueta="Cooperativa">
              {e.cooperativa_id && e.cooperativa_nombre ? (
                <Link href={`/admin/cooperativas/${e.cooperativa_id}`} className={ENLACE}>
                  {e.cooperativa_nombre}
                </Link>
              ) : (
                <Vacio texto="Sin asignar" />
              )}
            </Dato>
            <Dato etiqueta="Ruta">
              {ciudad(e.ciudad_origen, e.estado_origen)} → {ciudad(e.ciudad_destino, e.estado_destino)}
            </Dato>
            <Dato etiqueta="Contenido">{e.descripcion_contenido || <Vacio texto="Sin descripción" />}</Dato>
            <Dato etiqueta="Quién paga">{MODALIDAD_PAGO[e.modalidad_pago].largo}</Dato>
          </dl>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Persona
          titulo="Remitente"
          nombre={e.remitente.nombre}
          cedula={e.remitente.cedula}
          telefono={e.remitente.telefono}
          usuarioId={e.remitente.usuario_id}
          nota={e.origen_registro === "TAQUILLA" ? "Registrada en la taquilla con los datos de quien envía." : undefined}
        />
        <Persona
          titulo="Destinatario"
          nombre={e.destinatario.nombre}
          cedula={e.destinatario.cedula}
          telefono={e.destinatario.telefono}
          usuarioId={e.destinatario.usuario_id}
        />
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <CardTitle>PIN de retiro</CardTitle>
            {e.pin_bloqueado && <TonoBadge tono="peligro">Bloqueado</TonoBadge>}
          </div>
          <CardDescription className="tabular-nums">
            {e.pin_bloqueado
              ? `Bloqueado tras ${e.intentos_pin} intentos fallidos: la taquilla no puede entregarla.`
              : e.intentos_pin === 0
                ? "Sin intentos fallidos."
                : `${e.intentos_pin} ${e.intentos_pin === 1 ? "intento fallido" : "intentos fallidos"} de ${PIN_MAX_INTENTOS}.`}
          </CardDescription>
          {puedeDesbloquear && (
            <CardAction>
              <DesbloquearPinButton encomiendaId={e.id} tracking={e.tracking_id} />
            </CardAction>
          )}
        </CardHeader>
      </Card>
    </div>
  );
}

export default async function AdminEncomiendasPage({ searchParams }: PageProps) {
  await requireSuperAdmin();
  const { codigo = "" } = await searchParams;
  const busqueda = codigo.trim();
  const resultado = busqueda ? await buscarEncomiendaAdmin(busqueda) : null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Encomiendas" />

      <form action="/admin/encomiendas" method="get" role="search" className="flex w-full max-w-xl flex-col gap-2">
        <Label htmlFor="codigo">Código de seguimiento</Label>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <MagnifyingGlass
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              id="codigo"
              name="codigo"
              type="search"
              defaultValue={busqueda}
              placeholder="Ej. EB-261003-12345"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              autoFocus={!busqueda}
              required
              className="pl-9 font-mono"
            />
          </div>
          <Button type="submit">Buscar</Button>
        </div>
      </form>

      {resultado?.estado === "error" && (
        <ErrorRefrescar titulo="No pudimos buscar la encomienda" descripcion={resultado.error} className="max-w-xl" />
      )}

      {resultado?.estado === "no_encontrada" && (
        <Card className="max-w-xl">
          <EmptyState
            compacto
            icon={Package}
            title={`No encontramos ${resultado.codigo || busqueda}`}
            description="Revisa el código: tiene la forma EB-AAMMDD-NNNNN."
          />
        </Card>
      )}

      {resultado?.estado === "encontrada" && <Resultado e={resultado.encomienda} />}
    </div>
  );
}
