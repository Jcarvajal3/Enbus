"use client";

import { useEffect, useId, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { invitarEmpleado, reenviarInvitacion, revocarInvitacion, toggleEmpleado, type RolInvitacion } from "./actions";
import {
  DotsThree,
  UserPlus,
  Copy,
  Check,
  UsersThree,
  WhatsappLogo,
  WarningCircle,
  SpinnerIcon,
  MapPin,
  ArrowClockwise,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { requireOnline } from "@/components/connectivity-banner";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Pagination } from "@/components/ui/pagination";
import { humanizeError } from "@/lib/errores";
import { ROLES, etiquetaRol } from "@/lib/estados";
import { formatFechaVE, formatHoraVE } from "@/lib/fechas";
import { cn } from "@/lib/utils";

export type Empleado = {
  id: string;
  nombre_completo: string;
  role: string;
  created_at: string;
  sucursal_id: string | null;
  email: string | null;
  isBanned: boolean;
};

export type SucursalOpcion = { id: string; nombre: string; activa: boolean };

export type InvitacionPendiente = {
  id: string;
  email: string;
  role: string;
  sucursal_id: string | null;
  token: string;
  expira_at: string;
  created_at: string;
};

const ROLES_INVITACION: { value: RolInvitacion; titulo: string; ayuda: string }[] = [
  { value: "taquillero", titulo: ROLES.taquillero, ayuda: "Vende boletos y recibe, despacha y entrega encomiendas." },
  {
    value: "admin_cooperativa",
    titulo: "Administrador",
    ayuda: "Además configura rutas, viajes, métodos de pago y empleados.",
  },
];

/** "sáb. 05/10 a las 2:30 p. m." */
function venceEl(iso: string) {
  const dia = formatFechaVE(iso, { weekday: "short" }).replace(/\.$/, "");
  return `${dia}. ${formatFechaVE(iso, { day: "2-digit", month: "2-digit" })} a las ${formatHoraVE(iso)}`;
}

/** "Vence en 30 h" / "Vence en 45 min" / "Vencida". */
function venceEn(iso: string, ahora: number) {
  const ms = new Date(iso).getTime() - ahora;
  if (ms <= 0) return "Vencida";
  const minutos = Math.floor(ms / 60000);
  if (minutos < 60) return `Vence en ${Math.max(1, minutos)} min`;
  return `Vence en ${Math.floor(minutos / 60)} h`;
}

function enlaceInvitacion(token: string) {
  return `${window.location.origin}/cooperativas/invite/${token}`;
}

function mensajeWhatsApp(cooperativa: string | null, enlace: string) {
  return `Hola, te invito a usar el panel de ${cooperativa || "nuestra cooperativa"} en EnBus. Crea tu cuenta aquí (vence en 48 horas): ${enlace}`;
}

function abrirWhatsApp(cooperativa: string | null, token: string) {
  const texto = mensajeWhatsApp(cooperativa, enlaceInvitacion(token));
  window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, "_blank", "noopener,noreferrer");
}

async function copiarEnlace(token: string) {
  try {
    await navigator.clipboard.writeText(enlaceInvitacion(token));
    return true;
  } catch {
    toast.error("No pudimos copiar el enlace. Selecciónalo y cópialo a mano.");
    return false;
  }
}

export function EmpleadosClient({
  empleados,
  sucursales,
  invitaciones,
  cooperativaNombre,
  currentUserId,
  errorCarga = null,
  errorInvitaciones = null,
}: {
  empleados: Empleado[];
  sucursales: SucursalOpcion[];
  invitaciones: InvitacionPendiente[];
  cooperativaNombre: string | null;
  currentUserId: string;
  errorCarga?: string | null;
  errorInvitaciones?: string | null;
}) {
  const router = useRouter();
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // Hora actual en el cliente (evita diferencias entre servidor y navegador) y se actualiza cada minuto.
  const [ahora, setAhora] = useState(0);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAhora(Date.now());
    const idIntervalo = window.setInterval(() => setAhora(Date.now()), 60_000);
    return () => window.clearInterval(idIntervalo);
  }, []);

  // Desactivar / reactivar (con confirmación)
  const [empleadoAccion, setEmpleadoAccion] = useState<{ empleado: Empleado; accion: "desactivar" | "reactivar" } | null>(null);
  const [accionOpen, setAccionOpen] = useState(false);

  // Revocar invitación (con confirmación)
  const [aRevocar, setARevocar] = useState<InvitacionPendiente | null>(null);
  const [revocarOpen, setRevocarOpen] = useState(false);
  const [renovandoId, setRenovandoId] = useState<string | null>(null);
  const [copiadoId, setCopiadoId] = useState<string | null>(null);

  const nombreSucursal = (id: string | null) =>
    id ? sucursales.find((s) => s.id === id)?.nombre ?? "Sucursal eliminada" : "Sin sucursal";

  const totalPages = Math.ceil(empleados.length / itemsPerPage);
  const paginatedEmpleados = empleados.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  async function confirmarAccionEmpleado() {
    if (!empleadoAccion) return { ok: false, error: "No encontramos al empleado. Actualiza la página." };
    const { empleado, accion } = empleadoAccion;
    try {
      const res = await requireOnline(() => toggleEmpleado(empleado.id, accion))();
      if (res.error) return { ok: false, error: res.error };
    } catch (err) {
      return { ok: false, error: humanizeError(err, `${accion} al empleado`) };
    }
    toast.success(
      accion === "desactivar"
        ? `${empleado.nombre_completo} ya no puede entrar al panel.`
        : `${empleado.nombre_completo} puede volver a entrar al panel.`
    );
    router.refresh();
    return { ok: true };
  }

  async function renovar(inv: InvitacionPendiente) {
    if (renovandoId) return;
    setRenovandoId(inv.id);
    try {
      const res = await requireOnline(() => reenviarInvitacion(inv.id))();
      if (!res.success) {
        toast.error(res.error);
        return;
      }
      const copiado = await copiarEnlace(res.token);
      toast.success(
        `Invitación renovada: vence el ${venceEl(res.expiraAt)}.${copiado ? " Copiamos el enlace para que lo envíes." : ""}`
      );
      router.refresh();
    } catch (err) {
      toast.error(humanizeError(err, "renovar la invitación"));
    } finally {
      setRenovandoId(null);
    }
  }

  async function confirmarRevocar() {
    if (!aRevocar) return { ok: false, error: "No encontramos la invitación. Actualiza la página." };
    try {
      const res = await requireOnline(() => revocarInvitacion(aRevocar.id))();
      if (res.error) return { ok: false, error: res.error };
    } catch (err) {
      return { ok: false, error: humanizeError(err, "revocar la invitación") };
    }
    toast.success(`Invitación de ${aRevocar.email} revocada. El enlace ya no funciona.`);
    router.refresh();
    return { ok: true };
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Empleados" description="Invita a tus taquilleros y administra quién entra al panel.">
        <Button onClick={() => setIsInviteOpen(true)}>
          <UserPlus className="mr-2 h-4 w-4" weight="bold" aria-hidden />
          Invitar empleado
        </Button>
      </PageHeader>

      <InvitarDialog
        open={isInviteOpen}
        onOpenChange={setIsInviteOpen}
        sucursales={sucursales.filter((s) => s.activa)}
        hayInactivas={sucursales.some((s) => !s.activa)}
        cooperativaNombre={cooperativaNombre}
        onCreada={() => router.refresh()}
      />

      {/* Invitaciones pendientes */}
      {(invitaciones.length > 0 || errorInvitaciones) && (
        <section aria-labelledby="titulo-invitaciones" className="flex flex-col gap-3">
          <h2 id="titulo-invitaciones" className="text-lg font-semibold">
            Invitaciones pendientes ({invitaciones.length})
          </h2>
          {errorInvitaciones ? (
            <ErrorState
              compacto
              titulo="No pudimos cargar las invitaciones"
              descripcion={errorInvitaciones}
              onReintentar={() => router.refresh()}
            />
          ) : (
            <div className="rounded-md border bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Correo</TableHead>
                    <TableHead>Rol</TableHead>
                    <TableHead>Sucursal</TableHead>
                    <TableHead>Vencimiento</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invitaciones.map((inv) => {
                    const vencida = ahora > 0 && new Date(inv.expira_at).getTime() <= ahora;
                    return (
                      <TableRow key={inv.id}>
                        <TableCell className="font-medium">{inv.email}</TableCell>
                        <TableCell>{etiquetaRol(inv.role)}</TableCell>
                        <TableCell>{nombreSucursal(inv.sucursal_id)}</TableCell>
                        <TableCell>
                          {ahora === 0 ? (
                            ""
                          ) : vencida ? (
                            <Badge variant="secondary" className="bg-muted text-muted-foreground">
                              Vencida
                            </Badge>
                          ) : (
                            <span title={`Vence el ${venceEl(inv.expira_at)}`}>{venceEn(inv.expira_at, ahora)}</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex flex-wrap justify-end gap-1">
                            {!vencida && (
                              <>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  aria-label={`Copiar enlace de la invitación de ${inv.email}`}
                                  onClick={async () => {
                                    if (await copiarEnlace(inv.token)) {
                                      setCopiadoId(inv.id);
                                      toast.success("Enlace copiado.");
                                      window.setTimeout(() => setCopiadoId((c) => (c === inv.id ? null : c)), 2000);
                                    }
                                  }}
                                >
                                  {copiadoId === inv.id ? <Check aria-hidden /> : <Copy aria-hidden />}
                                  Copiar enlace
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  aria-label={`Enviar por WhatsApp la invitación de ${inv.email}`}
                                  onClick={() => abrirWhatsApp(cooperativaNombre, inv.token)}
                                >
                                  <WhatsappLogo weight="fill" aria-hidden />
                                  WhatsApp
                                </Button>
                              </>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={renovandoId === inv.id}
                              aria-label={`${vencida ? "Renovar" : "Reenviar"} la invitación de ${inv.email} por 48 horas`}
                              onClick={() => void renovar(inv)}
                            >
                              {renovandoId === inv.id ? (
                                <SpinnerIcon className="motion-safe:animate-spin" aria-hidden />
                              ) : (
                                <ArrowClockwise aria-hidden />
                              )}
                              {vencida ? "Renovar" : "Reenviar"}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-destructive-text hover:text-destructive-text"
                              aria-label={`Revocar la invitación de ${inv.email}`}
                              onClick={() => {
                                setARevocar(inv);
                                setRevocarOpen(true);
                              }}
                            >
                              Revocar
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </section>
      )}

      {/* Empleados */}
      <section aria-labelledby="titulo-empleados" className="flex flex-col gap-3">
        {(invitaciones.length > 0 || errorInvitaciones) && (
          <h2 id="titulo-empleados" className="text-lg font-semibold">
            Equipo ({empleados.length})
          </h2>
        )}
        <div className="rounded-md border bg-card">
          {errorCarga && empleados.length === 0 ? (
            <ErrorState titulo="No pudimos cargar los empleados" descripcion={errorCarga} onReintentar={() => router.refresh()} />
          ) : (
            <Table aria-labelledby={invitaciones.length > 0 ? "titulo-empleados" : undefined}>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Correo</TableHead>
                  <TableHead>Rol</TableHead>
                  <TableHead>Sucursal</TableHead>
                  <TableHead>Desde</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedEmpleados.map((emp) => {
                  const isActive = !emp.isBanned;
                  const esYo = emp.id === currentUserId;
                  return (
                    <TableRow key={emp.id}>
                      <TableCell className={cn("font-medium", !isActive && "text-muted-foreground")}>
                        {emp.nombre_completo}
                        {esYo && <span className="text-muted-foreground font-normal"> (tú)</span>}
                      </TableCell>
                      <TableCell>{emp.email ?? <span className="text-muted-foreground">Sin correo</span>}</TableCell>
                      <TableCell>{etiquetaRol(emp.role)}</TableCell>
                      <TableCell>{emp.role === "admin_cooperativa" && !emp.sucursal_id ? "Todas" : nombreSucursal(emp.sucursal_id)}</TableCell>
                      <TableCell>{formatFechaVE(emp.created_at, { dateStyle: "short" })}</TableCell>
                      <TableCell>
                        {isActive ? (
                          <Badge variant="secondary" className="bg-success-light text-success-deep">
                            Activo
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="bg-muted text-muted-foreground">
                            Desactivado
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {esYo ? (
                          <span className="text-xs text-muted-foreground">Tu cuenta</span>
                        ) : (
                          <DropdownMenu>
                            <DropdownMenuTrigger className="inline-flex h-8 w-8 items-center justify-center rounded-md p-0 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50">
                              <span className="sr-only">Acciones para {emp.nombre_completo}</span>
                              <DotsThree className="h-4 w-4" weight="bold" aria-hidden />
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {isActive ? (
                                <DropdownMenuItem
                                  className="text-destructive-text focus:text-destructive-text"
                                  onClick={() => {
                                    setEmpleadoAccion({ empleado: emp, accion: "desactivar" });
                                    setAccionOpen(true);
                                  }}
                                >
                                  Desactivar cuenta
                                </DropdownMenuItem>
                              ) : (
                                <DropdownMenuItem
                                  onClick={() => {
                                    setEmpleadoAccion({ empleado: emp, accion: "reactivar" });
                                    setAccionOpen(true);
                                  }}
                                >
                                  Reactivar cuenta
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}

                {empleados.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="h-48 text-center text-muted-foreground p-0">
                      <EmptyState
                        icon={UsersThree}
                        title="Aún no tienes empleados"
                        description="Invita a tus taquilleros: cada uno entra al panel con su propia cuenta."
                      />
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </div>
        <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={setCurrentPage} />
      </section>

      <ConfirmDialog
        open={accionOpen && empleadoAccion !== null}
        onOpenChange={setAccionOpen}
        tono={empleadoAccion?.accion === "desactivar" ? "destructive" : "default"}
        titulo={
          empleadoAccion
            ? empleadoAccion.accion === "desactivar"
              ? `¿Desactivar a ${empleadoAccion.empleado.nombre_completo}?`
              : `¿Reactivar a ${empleadoAccion.empleado.nombre_completo}?`
            : ""
        }
        descripcion={
          empleadoAccion?.accion === "desactivar"
            ? "No podrá entrar al panel hasta que lo reactives. Sus ventas y registros se conservan."
            : "Podrá volver a entrar al panel con su correo y contraseña."
        }
        verbo={empleadoAccion?.accion === "desactivar" ? "Desactivar cuenta" : "Reactivar cuenta"}
        verboCargando={empleadoAccion?.accion === "desactivar" ? "Desactivando…" : "Reactivando…"}
        onConfirm={confirmarAccionEmpleado}
      />

      <ConfirmDialog
        open={revocarOpen && aRevocar !== null}
        onOpenChange={setRevocarOpen}
        tono="destructive"
        titulo={aRevocar ? `¿Revocar la invitación de ${aRevocar.email}?` : ""}
        descripcion="El enlace dejará de funcionar de inmediato. Podrás invitar a esta persona de nuevo cuando quieras."
        verbo="Revocar invitación"
        verboCargando="Revocando…"
        onConfirm={confirmarRevocar}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Diálogo "Invitar empleado": Sucursal → Rol → Correo → resultado
// ─────────────────────────────────────────────────────────────────────────────

function InvitarDialog({
  open,
  onOpenChange,
  sucursales,
  hayInactivas,
  cooperativaNombre,
  onCreada,
}: {
  open: boolean;
  onOpenChange(open: boolean): void;
  sucursales: SucursalOpcion[];
  /** Hay sucursales, pero todas desactivadas. */
  hayInactivas: boolean;
  cooperativaNombre: string | null;
  onCreada(): void;
}) {
  const [enviando, setEnviando] = useState(false);
  return (
    <Dialog open={open} onOpenChange={(abierto) => !enviando && onOpenChange(abierto)}>
      {open && (
        <FormularioInvitacion
          sucursales={sucursales}
          hayInactivas={hayInactivas}
          cooperativaNombre={cooperativaNombre}
          enviando={enviando}
          setEnviando={setEnviando}
          onCerrar={() => onOpenChange(false)}
          onCreada={onCreada}
        />
      )}
    </Dialog>
  );
}

function FormularioInvitacion({
  sucursales,
  hayInactivas,
  cooperativaNombre,
  enviando,
  setEnviando,
  onCerrar,
  onCreada,
}: {
  sucursales: SucursalOpcion[];
  hayInactivas: boolean;
  cooperativaNombre: string | null;
  enviando: boolean;
  setEnviando(v: boolean): void;
  onCerrar(): void;
  onCreada(): void;
}) {
  const uid = useId();
  const [sucursalId, setSucursalId] = useState(sucursales.length === 1 ? sucursales[0].id : "");
  const [rol, setRol] = useState<RolInvitacion>("taquillero");
  const [email, setEmail] = useState("");
  const [errores, setErrores] = useState<{ email?: string; sucursal?: string; rol?: string }>({});
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
  const [resultado, setResultado] = useState<{ token: string; expiraAt: string; existente: boolean } | null>(null);
  const [copiado, setCopiado] = useState(false);

  if (sucursales.length === 0) {
    return (
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invitar empleado</DialogTitle>
          <DialogDescription>
            {hayInactivas
              ? "Tus sucursales están desactivadas. Activa una (o crea otra): cada empleado trabaja en una."
              : "Primero crea una sucursal: cada empleado trabaja en una."}
          </DialogDescription>
        </DialogHeader>
        <div className="flex justify-center py-4">
          <div className="flex size-14 items-center justify-center rounded-full bg-muted">
            <MapPin className="size-7 text-muted-foreground" weight="duotone" aria-hidden />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCerrar}>
            Cancelar
          </Button>
          <Link href="/cooperativas/configuracion?tab=sucursales" className={buttonVariants({ variant: "default" })}>
            Ir a Sucursales
          </Link>
        </DialogFooter>
      </DialogContent>
    );
  }

  if (resultado) {
    const enlace = enlaceInvitacion(resultado.token);
    return (
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invitación lista</DialogTitle>
          <DialogDescription>
            {resultado.existente
              ? `Este correo ya tenía una invitación vigente: vence el ${venceEl(resultado.expiraAt)}. Si necesitas más tiempo, usa «Reenviar» en Invitaciones pendientes.`
              : `Vence el ${venceEl(resultado.expiraAt)} (48 horas).`}{" "}
            Solo se puede usar una vez.
          </DialogDescription>
        </DialogHeader>
        <div className="rounded-md bg-muted p-4">
          <p className="break-all font-mono text-sm">{enlace}</p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <Button
            type="button"
            variant="outline"
            onClick={async () => {
              if (await copiarEnlace(resultado.token)) {
                setCopiado(true);
                window.setTimeout(() => setCopiado(false), 2000);
              }
            }}
          >
            {copiado ? <Check aria-hidden /> : <Copy aria-hidden />}
            {copiado ? "Copiado" : "Copiar enlace"}
          </Button>
          <Button type="button" variant="outline" onClick={() => abrirWhatsApp(cooperativaNombre, resultado.token)}>
            <WhatsappLogo weight="fill" aria-hidden />
            Enviar por WhatsApp
          </Button>
        </div>
        <DialogFooter>
          <Button type="button" onClick={onCerrar}>
            Listo
          </Button>
        </DialogFooter>
      </DialogContent>
    );
  }

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    if (enviando) return;
    setErrorGeneral(null);
    const encontrados: typeof errores = {};
    if (!sucursalId) encontrados.sucursal = "Elige la sucursal donde trabajará.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      encontrados.email = "Escribe un correo válido, por ejemplo nombre@correo.com.";
    }
    setErrores(encontrados);
    if (encontrados.sucursal) {
      document.getElementById(`${uid}-sucursal`)?.focus();
      return;
    }
    if (encontrados.email) {
      document.getElementById(`${uid}-email`)?.focus();
      return;
    }

    const formData = new FormData();
    formData.set("sucursalId", sucursalId);
    formData.set("rol", rol);
    formData.set("email", email.trim());
    setEnviando(true);
    try {
      const res = await requireOnline(() => invitarEmpleado(formData))();
      if (!res.success) {
        if (res.campo) setErrores({ [res.campo]: res.error });
        else setErrorGeneral(res.error);
        return;
      }
      setResultado({ token: res.token, expiraAt: res.expiraAt, existente: res.existente === true });
      onCreada();
    } catch (err) {
      setErrorGeneral(humanizeError(err, "crear la invitación"));
    } finally {
      setEnviando(false);
    }
  };

  return (
    <DialogContent showCloseButton={!enviando}>
      <form onSubmit={enviar} noValidate className="grid gap-5">
        <DialogHeader>
          <DialogTitle>Invitar empleado</DialogTitle>
          <DialogDescription>
            Le daremos un enlace para que cree su cuenta. Vence en 48 horas.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-2">
          <Label htmlFor={`${uid}-sucursal`}>Sucursal</Label>
          <Select
            value={sucursalId}
            onValueChange={(v) => {
              setSucursalId(v ?? "");
              setErrores((p) => ({ ...p, sucursal: undefined }));
            }}
            items={sucursales.map((s) => ({ value: s.id, label: s.nombre }))}
            disabled={enviando}
          >
            <SelectTrigger id={`${uid}-sucursal`} className="w-full" aria-invalid={errores.sucursal ? true : undefined}>
              <SelectValue placeholder="Elige la sucursal donde trabajará" />
            </SelectTrigger>
            <SelectContent>
              {sucursales.map((s) => (
                <SelectItem key={s.id} value={s.id}>{s.nombre}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errores.sucursal && <p className="text-sm text-destructive-text">{errores.sucursal}</p>}
        </div>

        <fieldset className="grid gap-2" disabled={enviando}>
          <legend className="mb-2 text-sm font-medium">Rol</legend>
          <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Rol">
            {ROLES_INVITACION.map((r) => (
              <label
                key={r.value}
                className={cn(
                  "flex cursor-pointer flex-col gap-1 rounded-xl border p-3 text-sm transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
                  rol === r.value ? "border-foreground bg-muted/60" : "hover:bg-muted/40"
                )}
              >
                <span className="flex items-center gap-2 font-medium">
                  <input
                    type="radio"
                    name={`${uid}-rol`}
                    value={r.value}
                    checked={rol === r.value}
                    onChange={() => setRol(r.value)}
                    className="size-4 accent-foreground"
                  />
                  {r.titulo}
                </span>
                <span className="pl-6 text-xs text-muted-foreground">{r.ayuda}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="grid gap-2">
          <Label htmlFor={`${uid}-email`}>Correo del empleado</Label>
          <Input
            id={`${uid}-email`}
            type="email"
            inputMode="email"
            autoComplete="off"
            placeholder="nombre@correo.com"
            value={email}
            disabled={enviando}
            aria-invalid={errores.email ? true : undefined}
            aria-describedby={errores.email ? `${uid}-email-error` : undefined}
            onChange={(e) => {
              setEmail(e.target.value);
              setErrores((p) => ({ ...p, email: undefined }));
            }}
          />
          {errores.email && (
            <p id={`${uid}-email-error`} className="text-sm text-destructive-text">
              {errores.email}
            </p>
          )}
        </div>

        {errorGeneral && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive-light p-3 text-sm text-destructive-deep"
          >
            <WarningCircle className="mt-0.5 size-4 shrink-0" weight="fill" aria-hidden />
            <p>{errorGeneral}</p>
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCerrar} disabled={enviando}>
            Cancelar
          </Button>
          <Button type="submit" disabled={enviando} aria-busy={enviando || undefined}>
            {enviando && <SpinnerIcon className="motion-safe:animate-spin" aria-hidden />}
            {enviando ? "Creando…" : "Crear invitación"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
