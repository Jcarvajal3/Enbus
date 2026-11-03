export const dynamic = "force-dynamic";

import Link from "next/link";
import { MagnifyingGlass, WarningCircle } from "@phosphor-icons/react/dist/ssr";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusBadge } from "@/components/status-badge";
import { DesbloquearPinButton } from "@/components/admin/encomiendas/desbloquear-pin-button";
import { requireSuperAdmin } from "@/lib/supabase/auth-guards";
import { formatFechaHoraVE } from "@/lib/fechas";
import { formatCedula, formatTelefono } from "@/lib/ve";
import { MODALIDAD_PAGO, estadoInfo } from "@/lib/estados";
import { formatCiudad } from "@/lib/ciudades";
import { PIN_MAX_INTENTOS } from "@/lib/artefactos.generated";
import { buscarEncomiendaAdmin, type EncomiendaAdmin } from "./actions";

interface PageProps {
  searchParams: Promise<{ codigo?: string }>;
}

const CLASE_ENLACE = "text-foreground underline decoration-primary underline-offset-4";
const ESTADOS_CERRADOS = ["ENTREGADA", "CANCELADA", "DEVUELTA"];
const MAX_INTENTOS_PIN = PIN_MAX_INTENTOS;

function legible(valor: string | null | undefined, formato: (v: string) => string) {
  if (!valor || valor.toUpperCase().startsWith("PENDIENTE")) return "Sin dato";
  const f = formato(valor);
  return f === "—" ? valor : f;
}

function ciudad(nombre: string, estado: string) {
  const c = formatCiudad(nombre) || nombre;
  return estado ? `${c} (${formatCiudad(estado) || estado})` : c;
}

function Dato({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-0.5">
      <dt className="text-xs text-muted-foreground">{etiqueta}</dt>
      <dd className="text-sm text-foreground">{children}</dd>
    </div>
  );
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
    <section className="space-y-3 rounded-xl border bg-card p-4">
      <h3 className="text-sm font-semibold">{titulo}</h3>
      <dl className="grid gap-3">
        <Dato etiqueta="Nombre">
          {usuarioId && nombre ? (
            <Link href={`/admin/usuarios/${usuarioId}`} className={CLASE_ENLACE}>
              {nombre}
            </Link>
          ) : (
            nombre || "Sin dato"
          )}
        </Dato>
        <Dato etiqueta="Cédula">{legible(cedula, formatCedula)}</Dato>
        <Dato etiqueta="Teléfono">{legible(telefono, formatTelefono)}</Dato>
      </dl>
      {nota && <p className="text-xs text-muted-foreground">{nota}</p>}
    </section>
  );
}

function Resultado({ e }: { e: EncomiendaAdmin }) {
  const cerrada = ESTADOS_CERRADOS.includes(e.estado);
  const puedeDesbloquear = !cerrada && (e.pin_bloqueado || e.intentos_pin > 0);

  return (
    <div className="space-y-4">
      <section className="space-y-4 rounded-xl border bg-card p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <p className="font-mono text-lg font-semibold">{e.tracking_id}</p>
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={e.estado} dominio="encomienda" />
              <span className="text-sm text-muted-foreground">{estadoInfo("encomienda", e.estado).ayuda}</span>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Creada el {formatFechaHoraVE(e.created_at)} · último cambio el {formatFechaHoraVE(e.updated_at)}
          </p>
        </div>

        <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Dato etiqueta="Cooperativa">
            {e.cooperativa_id && e.cooperativa_nombre ? (
              <Link href={`/admin/cooperativas/${e.cooperativa_id}`} className={CLASE_ENLACE}>
                {e.cooperativa_nombre}
              </Link>
            ) : (
              "Sin asignar"
            )}
          </Dato>
          <Dato etiqueta="Ruta">
            {ciudad(e.ciudad_origen, e.estado_origen)} → {ciudad(e.ciudad_destino, e.estado_destino)}
          </Dato>
          <Dato etiqueta="Contenido">{e.descripcion_contenido || "Sin descripción"}</Dato>
          <Dato etiqueta="Quién paga">{MODALIDAD_PAGO[e.modalidad_pago].largo}</Dato>
        </dl>
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <Persona
          titulo="Remitente"
          nombre={e.remitente.nombre}
          cedula={e.remitente.cedula}
          telefono={e.remitente.telefono}
          usuarioId={e.remitente.usuario_id}
          nota={e.origen_registro === "TAQUILLA" ? "Registrada en la taquilla: son los datos que dio quien envía." : undefined}
        />
        <Persona
          titulo="Destinatario"
          nombre={e.destinatario.nombre}
          cedula={e.destinatario.cedula}
          telefono={e.destinatario.telefono}
          usuarioId={e.destinatario.usuario_id}
        />
      </div>

      <section className="space-y-3 rounded-xl border bg-card p-5">
        <h3 className="text-sm font-semibold">PIN de retiro</h3>
        {e.pin_bloqueado ? (
          <div
            role="status"
            className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive-text"
          >
            <WarningCircle className="mt-0.5 size-4 shrink-0" weight="fill" aria-hidden />
            <p>
              PIN bloqueado tras {e.intentos_pin} intentos fallidos. La taquilla no puede entregarla hasta que lo
              desbloquees.
            </p>
          </div>
        ) : (
          <p className="text-sm text-foreground">
            {e.intentos_pin === 0
              ? "Sin intentos fallidos."
              : `${e.intentos_pin} ${e.intentos_pin === 1 ? "intento fallido" : "intentos fallidos"} de ${MAX_INTENTOS_PIN}.`}
          </p>
        )}
        {puedeDesbloquear ? (
          <DesbloquearPinButton encomiendaId={e.id} tracking={e.tracking_id} />
        ) : cerrada ? (
          <p className="text-xs text-muted-foreground">La encomienda ya está cerrada: no hace falta desbloquear el PIN.</p>
        ) : null}
      </section>
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
      <PageHeader
        title="Buscar encomienda"
        description="Busca por código de seguimiento para ver su estado, quién la envía y quién la recibe, y desbloquear el PIN de retiro."
      />

      <form action="/admin/encomiendas" method="get" role="search" className="flex max-w-xl flex-col gap-2">
        <Label htmlFor="codigo">Código de seguimiento (EB-…)</Label>
        <div className="flex gap-2">
          <Input
            id="codigo"
            name="codigo"
            defaultValue={busqueda}
            placeholder="EB-241003-00042"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            autoFocus={!busqueda}
            required
            className="font-mono"
          />
          <Button type="submit" className="gap-2">
            <MagnifyingGlass className="h-4 w-4" aria-hidden /> Buscar
          </Button>
        </div>
      </form>

      {resultado?.estado === "error" && (
        <div
          role="alert"
          className="flex max-w-xl flex-col gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <p className="text-sm text-foreground">{resultado.error}</p>
          <Link
            href={`/admin/encomiendas?codigo=${encodeURIComponent(busqueda)}`}
            className={`${CLASE_ENLACE} shrink-0 text-sm font-medium`}
          >
            Reintentar
          </Link>
        </div>
      )}

      {resultado?.estado === "no_encontrada" && (
        <p role="status" className="max-w-xl rounded-xl border bg-card p-4 text-sm text-foreground">
          No encontramos la encomienda <span className="font-mono font-semibold">{resultado.codigo || busqueda}</span>.
          Revisa el código: tiene la forma EB-AAMMDD-NNNNN.
        </p>
      )}

      {resultado?.estado === "encontrada" && <Resultado e={resultado.encomienda} />}
    </div>
  );
}
