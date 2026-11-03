"use client";

import { useEffect, useId, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Spinner } from "@/components/ui/spinner";
import { invitarEmpleado, reenviarInvitacion, revocarInvitacion, toggleEmpleado, type RolInvitacion } from "./actions";
import {
  ArrowClockwise,
  ArrowCounterClockwise,
  Check,
  Copy,
  DotsThree,
  MapPin,
  Prohibit,
  UserPlus,
  WhatsappLogo,
  XCircle,
} from "@phosphor-icons/react";
import { PageHeader } from "@/components/page-header";
import { requireOnline } from "@/components/connectivity-banner";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { FilaVacia } from "@/components/fila-vacia";
import { AvisoError } from "@/components/aviso-error";
import { StatusBadge, TonoBadge } from "@/components/status-badge";
import { GrupoOpciones, OpcionTile } from "@/components/opcion-tile";
import { PaginacionTabla, usePaginacion } from "@/components/paginacion-tabla";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { avisarError, avisarExito } from "@/lib/avisos";
import { humanizeError } from "@/lib/errores";
import { ROLES, etiquetaRol } from "@/lib/estados";
import { formatFechaVE, formatHoraVE } from "@/lib/fechas";
import { ICONO_SECCION } from "@/lib/navigation";
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
  { value: "taquillero", titulo: ROLES.taquillero, ayuda: "Vende boletos y atiende encomiendas." },
  { value: "admin_cooperativa", titulo: "Administrador", ayuda: "Además configura la cooperativa." },
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

const MSG_NO_COPIADO = "No pudimos copiar el enlace. Selecciónalo y cópialo a mano.";

/** true si se copió; quien llama decide cómo avisar del fallo (toast en la lista, aviso en el diálogo). */
async function copiarEnlace(token: string) {
  try {
    await navigator.clipboard.writeText(enlaceInvitacion(token));
    return true;
  } catch {
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
  const { visibles, pagina, paginas, ir } = usePaginacion(empleados);

  // Hora actual en el cliente (evita diferencias entre servidor y navegador) y se actualiza cada minuto.
  const [ahora, setAhora] = useState(0);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAhora(Date.now());
    const idIntervalo = window.setInterval(() => setAhora(Date.now()), 60_000);
    return () => window.clearInterval(idIntervalo);
  }, []);

  // Suspender / reactivar (con confirmación)
  const [empleadoAccion, setEmpleadoAccion] = useState<{ empleado: Empleado; accion: "desactivar" | "reactivar" } | null>(null);
  const [accionOpen, setAccionOpen] = useState(false);

  // Revocar invitación (con confirmación)
  const [aRevocar, setARevocar] = useState<InvitacionPendiente | null>(null);
  const [revocarOpen, setRevocarOpen] = useState(false);
  const [renovandoId, setRenovandoId] = useState<string | null>(null);
  const [copiadoId, setCopiadoId] = useState<string | null>(null);

  const nombreSucursal = (id: string | null) =>
    id ? sucursales.find((s) => s.id === id)?.nombre ?? "Sucursal eliminada" : "Sin sucursal";

  async function confirmarAccionEmpleado() {
    if (!empleadoAccion) return { ok: false, error: "No encontramos al empleado. Actualiza la página." };
    const { empleado, accion } = empleadoAccion;
    try {
      const res = await requireOnline(() => toggleEmpleado(empleado.id, accion))();
      if (res.error) return { ok: false, error: res.error };
    } catch (err) {
      return { ok: false, error: humanizeError(err, accion === "desactivar" ? "suspender la cuenta" : "reactivar la cuenta") };
    }
    avisarExito(
      accion === "desactivar"
        ? `${empleado.nombre_completo} ya no puede entrar al panel.`
        : `${empleado.nombre_completo} puede volver a entrar al panel.`
    );
    router.refresh();
    return { ok: true };
  }

  async function copiar(inv: InvitacionPendiente) {
    if (!(await copiarEnlace(inv.token))) {
      avisarError(MSG_NO_COPIADO);
      return;
    }
    setCopiadoId(inv.id);
    avisarExito("Enlace copiado.");
    window.setTimeout(() => setCopiadoId((c) => (c === inv.id ? null : c)), 2000);
  }

  async function renovar(inv: InvitacionPendiente) {
    if (renovandoId) return;
    setRenovandoId(inv.id);
    try {
      const res = await requireOnline(() => reenviarInvitacion(inv.id))();
      if (!res.success) {
        avisarError(res.error);
        return;
      }
      const copiado = await copiarEnlace(res.token);
      avisarExito(`Invitación renovada: vence el ${venceEl(res.expiraAt)}.${copiado ? " Copiamos el enlace." : ""}`);
      router.refresh();
    } catch (err) {
      avisarError(humanizeError(err, "renovar la invitación"));
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
    avisarExito(`Invitación de ${aRevocar.email} revocada.`);
    router.refresh();
    return { ok: true };
  }

  const hayInvitaciones = invitaciones.length > 0 || Boolean(errorInvitaciones);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Empleados" description="Invita a tu equipo y decide quién entra al panel.">
        <Button onClick={() => setIsInviteOpen(true)}>
          <UserPlus aria-hidden />
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
      {hayInvitaciones && (
        <section aria-labelledby="titulo-invitaciones" className="flex flex-col gap-3">
          <h2 id="titulo-invitaciones" className="flex items-center gap-2 text-lg font-semibold">
            Invitaciones pendientes
            {invitaciones.length > 0 && <TonoBadge tono="neutro">{invitaciones.length}</TonoBadge>}
          </h2>
          {errorInvitaciones ? (
            <ErrorState
              compacto
              titulo="No pudimos cargar las invitaciones"
              descripcion={errorInvitaciones}
              onReintentar={() => router.refresh()}
            />
          ) : (
            <Card className="gap-0 overflow-hidden p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Correo</TableHead>
                    <TableHead className="hidden lg:table-cell">Rol</TableHead>
                    <TableHead className="hidden lg:table-cell">Sucursal</TableHead>
                    <TableHead className="hidden sm:table-cell">Vencimiento</TableHead>
                    <TableHead className="text-right">
                      <span className="sr-only">Acciones</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invitaciones.map((inv) => {
                    const vencida = ahora > 0 && new Date(inv.expira_at).getTime() <= ahora;
                    const renovando = renovandoId === inv.id;
                    return (
                      <TableRow key={inv.id}>
                        <TableCell>
                          <span className="block font-medium text-foreground">{inv.email}</span>
                          {ahora > 0 && (
                            <span className="block text-xs text-muted-foreground sm:hidden">
                              {vencida ? "Vencida" : venceEn(inv.expira_at, ahora)}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="hidden lg:table-cell">{etiquetaRol(inv.role)}</TableCell>
                        <TableCell className="hidden lg:table-cell">{nombreSucursal(inv.sucursal_id)}</TableCell>
                        <TableCell className="hidden sm:table-cell">
                          {ahora === 0 ? (
                            ""
                          ) : vencida ? (
                            <TonoBadge tono="neutro">Vencida</TonoBadge>
                          ) : (
                            <span title={`Vence el ${venceEl(inv.expira_at)}`}>{venceEn(inv.expira_at, ahora)}</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            {vencida ? (
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={renovando}
                                aria-label={`Renovar la invitación de ${inv.email} por 48 horas`}
                                onClick={() => void renovar(inv)}
                              >
                                {renovando ? <Spinner size="sm" aria-hidden /> : <ArrowClockwise aria-hidden />}
                                <span className="hidden sm:inline">Renovar</span>
                              </Button>
                            ) : (
                              <Button
                                variant="outline"
                                size="sm"
                                aria-label={`Copiar enlace de la invitación de ${inv.email}`}
                                onClick={() => void copiar(inv)}
                              >
                                {copiadoId === inv.id ? <Check aria-hidden /> : <Copy aria-hidden />}
                                <span className="hidden sm:inline">{copiadoId === inv.id ? "Copiado" : "Copiar enlace"}</span>
                              </Button>
                            )}
                            <DropdownMenu>
                              <DropdownMenuTrigger
                                className={buttonVariants({ variant: "ghost", size: "icon-sm" })}
                                aria-label={`Más acciones de la invitación de ${inv.email}`}
                              >
                                <DotsThree aria-hidden />
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                {!vencida && (
                                  <>
                                    <DropdownMenuItem onClick={() => abrirWhatsApp(cooperativaNombre, inv.token)}>
                                      <WhatsappLogo aria-hidden />
                                      Enviar por WhatsApp
                                    </DropdownMenuItem>
                                    <DropdownMenuItem disabled={renovando} onClick={() => void renovar(inv)}>
                                      <ArrowClockwise aria-hidden />
                                      Reenviar invitación
                                    </DropdownMenuItem>
                                  </>
                                )}
                                <DropdownMenuItem
                                  className="text-destructive-text focus:text-destructive-text"
                                  onClick={() => {
                                    setARevocar(inv);
                                    setRevocarOpen(true);
                                  }}
                                >
                                  <XCircle aria-hidden />
                                  Revocar invitación
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </Card>
          )}
        </section>
      )}

      {/* Empleados */}
      <section aria-labelledby={hayInvitaciones ? "titulo-empleados" : undefined} className="flex flex-col gap-3">
        {hayInvitaciones && (
          <h2 id="titulo-empleados" className="flex items-center gap-2 text-lg font-semibold">
            Equipo
            <TonoBadge tono="neutro">{empleados.length}</TonoBadge>
          </h2>
        )}
        {errorCarga && empleados.length === 0 ? (
          <Card className="p-0">
            <ErrorState titulo="No pudimos cargar los empleados" descripcion={errorCarga} onReintentar={() => router.refresh()} />
          </Card>
        ) : (
          <Card className="gap-0 overflow-hidden p-0">
            <Table aria-labelledby={hayInvitaciones ? "titulo-empleados" : undefined}>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead className="hidden sm:table-cell">Rol</TableHead>
                  <TableHead className="hidden lg:table-cell">Sucursal</TableHead>
                  <TableHead className="hidden lg:table-cell">Alta</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">
                    <span className="sr-only">Acciones</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibles.map((emp) => {
                  const isActive = !emp.isBanned;
                  const esYo = emp.id === currentUserId;
                  return (
                    <TableRow key={emp.id}>
                      <TableCell>
                        <span className={cn("block font-medium", isActive ? "text-foreground" : "text-muted-foreground")}>
                          {emp.nombre_completo}
                          {esYo && <span className="font-normal text-muted-foreground"> (tú)</span>}
                        </span>
                        <span className="block text-xs text-muted-foreground">{emp.email ?? "Sin correo"}</span>
                        <span className="block text-xs text-muted-foreground sm:hidden">{etiquetaRol(emp.role)}</span>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">{etiquetaRol(emp.role)}</TableCell>
                      <TableCell className="hidden lg:table-cell">
                        {emp.role === "admin_cooperativa" && !emp.sucursal_id ? "Todas" : nombreSucursal(emp.sucursal_id)}
                      </TableCell>
                      <TableCell className="hidden tabular-nums lg:table-cell">{formatFechaVE(emp.created_at)}</TableCell>
                      <TableCell>
                        <StatusBadge status={isActive ? "ACTIVA" : "SUSPENDIDA"} dominio="cuenta" />
                      </TableCell>
                      <TableCell className="text-right">
                        {esYo ? (
                          <span className="hidden text-xs text-muted-foreground sm:inline">Tu cuenta</span>
                        ) : (
                          <DropdownMenu>
                            <DropdownMenuTrigger
                              className={buttonVariants({ variant: "ghost", size: "icon-sm" })}
                              aria-label={`Acciones para ${emp.nombre_completo}`}
                            >
                              <DotsThree aria-hidden />
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
                                  <Prohibit aria-hidden />
                                  Suspender cuenta
                                </DropdownMenuItem>
                              ) : (
                                <DropdownMenuItem
                                  onClick={() => {
                                    setEmpleadoAccion({ empleado: emp, accion: "reactivar" });
                                    setAccionOpen(true);
                                  }}
                                >
                                  <ArrowCounterClockwise aria-hidden />
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
                  <FilaVacia
                    colSpan={6}
                    icon={ICONO_SECCION.empleados}
                    titulo="Todavía no tienes empleados"
                    accion={
                      <Button variant="outline" size="sm" onClick={() => setIsInviteOpen(true)}>
                        <UserPlus aria-hidden />
                        Invitar empleado
                      </Button>
                    }
                  />
                )}
              </TableBody>
            </Table>
            <PaginacionTabla pagina={pagina} paginas={paginas} onCambio={ir} />
          </Card>
        )}
      </section>

      <ConfirmDialog
        open={accionOpen && empleadoAccion !== null}
        onOpenChange={setAccionOpen}
        tono={empleadoAccion?.accion === "desactivar" ? "destructive" : "default"}
        titulo={
          empleadoAccion
            ? empleadoAccion.accion === "desactivar"
              ? `¿Suspender la cuenta de ${empleadoAccion.empleado.nombre_completo}?`
              : `¿Reactivar la cuenta de ${empleadoAccion.empleado.nombre_completo}?`
            : ""
        }
        descripcion={
          empleadoAccion?.accion === "desactivar"
            ? "No podrá entrar al panel hasta que la reactives. Sus ventas y registros se conservan."
            : "Podrá volver a entrar al panel con su correo y contraseña."
        }
        verbo={empleadoAccion?.accion === "desactivar" ? "Suspender cuenta" : "Reactivar cuenta"}
        verboCargando={empleadoAccion?.accion === "desactivar" ? "Suspendiendo…" : "Reactivando…"}
        onConfirm={confirmarAccionEmpleado}
      />

      <ConfirmDialog
        open={revocarOpen && aRevocar !== null}
        onOpenChange={setRevocarOpen}
        tono="destructive"
        titulo={aRevocar ? `¿Revocar la invitación de ${aRevocar.email}?` : ""}
        descripcion="El enlace dejará de funcionar. Puedes invitarle de nuevo cuando quieras."
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
  const [errorCopia, setErrorCopia] = useState<string | null>(null);

  if (sucursales.length === 0) {
    return (
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invitar empleado</DialogTitle>
        </DialogHeader>
        <EmptyState
          compacto
          icon={MapPin}
          title={hayInactivas ? "Tus sucursales están desactivadas" : "Primero crea una sucursal"}
          description="Cada empleado trabaja en una."
        />
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
              ? `Este correo ya tenía una invitación: vence el ${venceEl(resultado.expiraAt)}.`
              : `Vence el ${venceEl(resultado.expiraAt)}.`}{" "}
            Sirve una sola vez.
          </DialogDescription>
        </DialogHeader>
        <div className="rounded-md bg-muted p-4">
          <p className="font-mono text-sm break-all text-foreground">{enlace}</p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <Button
            type="button"
            variant="outline"
            onClick={async () => {
              setErrorCopia(null);
              if (await copiarEnlace(resultado.token)) {
                setCopiado(true);
                window.setTimeout(() => setCopiado(false), 2000);
              } else {
                setErrorCopia(MSG_NO_COPIADO);
              }
            }}
          >
            {copiado ? <Check aria-hidden /> : <Copy aria-hidden />}
            {copiado ? "Copiado" : "Copiar enlace"}
          </Button>
          <Button type="button" variant="outline" onClick={() => abrirWhatsApp(cooperativaNombre, resultado.token)}>
            <WhatsappLogo aria-hidden />
            Enviar por WhatsApp
          </Button>
        </div>
        {errorCopia && <AvisoError>{errorCopia}</AvisoError>}
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
      encontrados.email = "Escribe un correo válido, por ejemplo tu@correo.com.";
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
      <form onSubmit={enviar} noValidate className="grid gap-4">
        <DialogHeader>
          <DialogTitle>Invitar empleado</DialogTitle>
          <DialogDescription>Recibirá un enlace para crear su cuenta. Vence en 48 horas.</DialogDescription>
        </DialogHeader>

        <div className="grid content-start gap-2">
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

        <div className="grid gap-2">
          <p className="text-sm font-medium text-foreground">Rol</p>
          <GrupoOpciones etiqueta="Rol" className="grid gap-2 sm:grid-cols-2">
            {ROLES_INVITACION.map((r) => (
              <OpcionTile
                key={r.value}
                seleccionado={rol === r.value}
                disabled={enviando}
                titulo={r.titulo}
                detalle={r.ayuda}
                className="p-3"
                onSelect={() => setRol(r.value)}
              />
            ))}
          </GrupoOpciones>
        </div>

        <div className="grid content-start gap-2">
          <Label htmlFor={`${uid}-email`}>Correo del empleado</Label>
          <Input
            id={`${uid}-email`}
            type="email"
            inputMode="email"
            autoComplete="off"
            placeholder="tu@correo.com"
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

        {errorGeneral && <AvisoError>{errorGeneral}</AvisoError>}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCerrar} disabled={enviando}>
            Cancelar
          </Button>
          <Button type="submit" disabled={enviando} aria-busy={enviando || undefined}>
            {enviando && <Spinner size="sm" aria-hidden />}
            {enviando ? "Creando…" : "Crear invitación"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
