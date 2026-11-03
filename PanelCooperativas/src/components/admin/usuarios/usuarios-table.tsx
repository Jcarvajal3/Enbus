"use client";

// ─── Usuarios (#54, AD-21, AD-22) ────────────────────────────────────────────
// Búsqueda, filtros y paginación viven en la URL y se resuelven en el servidor
// (`?q=&rol=&cooperativa=&pagina=&vista=`). Cada fila abre el detalle con
// CeldaEnlace; "Completar baja" queda encima de la fila (relative z-10).

import { useId, useState, useTransition, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowsCounterClockwise, CaretLeft, CaretRight, MagnifyingGlass, ShieldCheck, UserMinus } from "@phosphor-icons/react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { CeldaEnlace } from "@/components/celda-enlace";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { ROLES, etiquetaEstado, etiquetaRol } from "@/lib/estados";
import { formatNumeroVE } from "@/lib/dinero";
import { formatFechaVE } from "@/lib/fechas";
import { cn } from "@/lib/utils";
import { completarBajaCuenta } from "@/app/admin/(panel)/usuarios/actions";
import { bajaPorCompletar, type FiltrosUsuarios, type PaginaUsuarios, type Usuario } from "@/lib/types/admin-usuarios";

export type CooperativaFiltro = { id: string; nombre: string; estado: string };

interface UsuariosTableProps {
  resultado: PaginaUsuarios;
  filtros: FiltrosUsuarios;
  /** Todas las cooperativas, para el filtro agrupado por estado. */
  cooperativas: CooperativaFiltro[];
}

const CLASE_SELECT =
  "h-9 w-full rounded-md border border-border-strong bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

const ORDEN_ESTADOS = ["ACTIVA", "PENDIENTE", "SUSPENDIDA", "RECHAZADA", "DESACTIVADA"];

/** Arma la URL de la lista con los filtros (sin los vacíos). */
function urlUsuarios(f: FiltrosUsuarios): string {
  const p = new URLSearchParams();
  if (f.q) p.set("q", f.q);
  if (f.rol) p.set("rol", f.rol);
  if (f.cooperativa) p.set("cooperativa", f.cooperativa);
  if (f.vista === "bajas") p.set("vista", "bajas");
  if (f.pagina && f.pagina > 1) p.set("pagina", String(f.pagina));
  const qs = p.toString();
  return qs ? `/admin/usuarios?${qs}` : "/admin/usuarios";
}

function EstadoCuenta({ u }: { u: Usuario }) {
  if (u.eliminada_at) {
    return (
      <div className="flex flex-col items-start gap-1">
        <Badge variant="secondary" className="bg-muted text-foreground">
          Cuenta eliminada
        </Badge>
        {bajaPorCompletar(u) && <span className="text-xs text-warning-text">Baja por completar</span>}
      </div>
    );
  }
  return u.is_banned ? (
    <Badge variant="secondary" className="bg-destructive-light text-destructive-deep">
      Suspendida
    </Badge>
  ) : (
    <Badge variant="outline">Activa</Badge>
  );
}

export function UsuariosTable({ resultado, filtros, cooperativas }: UsuariosTableProps) {
  const router = useRouter();
  const uid = useId();
  const [pendiente, startTransition] = useTransition();
  const [busqueda, setBusqueda] = useState(filtros.q ?? "");
  const [aCompletar, setACompletar] = useState<Usuario | null>(null);

  const { usuarios, total, pagina, porPagina, bajasPendientes } = resultado;
  const vistaBajas = filtros.vista === "bajas";
  const desde = total === 0 ? 0 : (pagina - 1) * porPagina + 1;
  const hasta = Math.min(pagina * porPagina, total);
  const hayAnterior = pagina > 1;
  const haySiguiente = pagina * porPagina < total;
  const hayFiltros = Boolean(filtros.q || filtros.rol || filtros.cooperativa || vistaBajas);

  /** Cambiar un filtro vuelve a la primera página. */
  const aplicar = (cambios: Partial<FiltrosUsuarios>) => {
    startTransition(() => {
      router.push(urlUsuarios({ ...filtros, ...cambios, pagina: 1 }));
    });
  };

  const buscar = (e: FormEvent) => {
    e.preventDefault();
    aplicar({ q: busqueda.trim() || undefined });
  };

  const grupos = ORDEN_ESTADOS.map((estado) => ({
    estado,
    lista: cooperativas.filter((c) => c.estado === estado),
  })).filter((g) => g.lista.length > 0);
  const otras = cooperativas.filter((c) => !ORDEN_ESTADOS.includes(c.estado));

  return (
    <div className="space-y-4">
      {/* Filtros (en la URL) */}
      <div className="space-y-4 rounded-xl border bg-card p-4">
        <form onSubmit={buscar} role="search" className="space-y-1.5">
          <Label htmlFor={`${uid}-q`}>Buscar</Label>
          <div className="flex max-w-xl gap-2">
            <div className="relative flex-1">
              <MagnifyingGlass
                className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                id={`${uid}-q`}
                type="search"
                placeholder="Nombre, cédula o teléfono"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                className="pl-9"
                autoComplete="off"
              />
            </div>
            <Button type="submit" variant="outline" disabled={pendiente}>
              Buscar
            </Button>
          </div>
        </form>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor={`${uid}-rol`}>Rol</Label>
            <select
              id={`${uid}-rol`}
              value={filtros.rol ?? ""}
              onChange={(e) => aplicar({ rol: e.target.value || undefined })}
              className={CLASE_SELECT}
            >
              <option value="">Todos los roles</option>
              {(Object.keys(ROLES) as Array<keyof typeof ROLES>).map((r) => (
                <option key={r} value={r}>
                  {ROLES[r]}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor={`${uid}-cooperativa`}>Cooperativa</Label>
            <select
              id={`${uid}-cooperativa`}
              value={filtros.cooperativa ?? ""}
              onChange={(e) => aplicar({ cooperativa: e.target.value || undefined })}
              className={CLASE_SELECT}
            >
              <option value="">Todas las cooperativas</option>
              {grupos.map((g) => (
                <optgroup key={g.estado} label={etiquetaEstado("cooperativa", g.estado)}>
                  {g.lista.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre}
                    </option>
                  ))}
                </optgroup>
              ))}
              {otras.length > 0 && (
                <optgroup label="Otras">
                  {otras.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor={`${uid}-vista`}>Mostrar</Label>
            <select
              id={`${uid}-vista`}
              value={vistaBajas ? "bajas" : ""}
              onChange={(e) => aplicar({ vista: e.target.value === "bajas" ? "bajas" : undefined })}
              className={CLASE_SELECT}
            >
              <option value="">Todas las cuentas</option>
              <option value="bajas">Bajas por completar ({formatNumeroVE(bajasPendientes, 0)})</option>
            </select>
          </div>
        </div>

        {hayFiltros && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setBusqueda("");
              startTransition(() => router.push("/admin/usuarios"));
            }}
          >
            <ArrowsCounterClockwise className="size-3.5" aria-hidden /> Limpiar filtros
          </Button>
        )}
      </div>

      {vistaBajas && (
        <p className="rounded-xl border border-warning/40 bg-warning-light p-3 text-sm text-warning-deep">
          Estas personas eliminaron su cuenta desde la app, pero su acceso todavía existe (la función automática no lo
          borró). «Completar baja» borra su acceso; sus boletos y envíos se conservan sin datos personales.
        </p>
      )}

      <p className="text-sm text-muted-foreground" aria-live="polite">
        {total === 0
          ? "Sin resultados"
          : `Mostrando ${formatNumeroVE(desde, 0)}–${formatNumeroVE(hasta, 0)} de ${formatNumeroVE(total, 0)}`}
      </p>

      {/* Tabla */}
      <div className={cn("overflow-hidden rounded-xl border bg-card", pendiente && "opacity-60")} aria-busy={pendiente || undefined}>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="border-b bg-muted/50">
              <TableRow className="hover:bg-transparent">
                <TableHead>Usuario</TableHead>
                <TableHead>Rol</TableHead>
                <TableHead>Cooperativa</TableHead>
                <TableHead className="hidden lg:table-cell">Estado</TableHead>
                <TableHead className="hidden text-right lg:table-cell">Registrado</TableHead>
                {vistaBajas && <TableHead className="text-right">Acción</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {usuarios.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={vistaBajas ? 6 : 5} className="h-32 text-center text-muted-foreground">
                    {vistaBajas
                      ? "No hay bajas por completar."
                      : hayFiltros
                        ? "Ningún usuario coincide con la búsqueda o los filtros."
                        : "Todavía no hay usuarios."}
                  </TableCell>
                </TableRow>
              ) : (
                usuarios.map((u) => (
                  <TableRow key={u.id} className="relative">
                    <CeldaEnlace href={`/admin/usuarios/${u.id}`} etiqueta={`Ver usuario ${u.nombre_completo}`} className="py-3">
                      <span className="block">{u.nombre_completo}</span>
                      <span className="block text-sm font-normal text-muted-foreground">{u.email || "Sin correo"}</span>
                    </CeldaEnlace>
                    <TableCell className="py-3">
                      <Badge variant="secondary" className="gap-1">
                        {u.role === "super_admin" && <ShieldCheck className="size-3" aria-hidden />}
                        {etiquetaRol(u.role)}
                      </Badge>
                      {/* En pantallas chicas el estado va bajo el rol (la columna se oculta). */}
                      <div className="mt-1 lg:hidden">
                        {(u.eliminada_at || u.is_banned) && <EstadoCuenta u={u} />}
                      </div>
                    </TableCell>
                    <TableCell className="py-3 text-sm">
                      {u.cooperativa_nombre || <span className="text-muted-foreground">Ninguna</span>}
                    </TableCell>
                    <TableCell className="hidden py-3 lg:table-cell">
                      <EstadoCuenta u={u} />
                    </TableCell>
                    <TableCell className="hidden py-3 text-right text-sm text-muted-foreground lg:table-cell">
                      {formatFechaVE(u.created_at)}
                    </TableCell>
                    {vistaBajas && (
                      <TableCell className="py-3 text-right">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="relative z-10"
                          aria-label={`Completar baja de ${u.email || u.nombre_completo}`}
                          onClick={() => setACompletar(u)}
                        >
                          <UserMinus className="size-4" aria-hidden /> Completar baja
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {(hayAnterior || haySiguiente) && (
        <nav aria-label="Páginas de usuarios" className="flex items-center justify-between gap-2">
          {hayAnterior ? (
            <Link
              href={urlUsuarios({ ...filtros, pagina: pagina - 1 })}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              <CaretLeft className="size-4" aria-hidden /> Anterior
            </Link>
          ) : (
            <span />
          )}
          <span className="text-sm text-muted-foreground">Página {pagina}</span>
          {haySiguiente ? (
            <Link
              href={urlUsuarios({ ...filtros, pagina: pagina + 1 })}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              Siguiente <CaretRight className="size-4" aria-hidden />
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}

      <ConfirmDialogBaja usuario={aCompletar} onClose={() => setACompletar(null)} onHecho={() => router.refresh()} />
    </div>
  );
}

/** "Completar baja": borra el acceso (Auth) de una cuenta eliminada desde la app. */
export function ConfirmDialogBaja({
  usuario,
  onClose,
  onHecho,
}: {
  usuario: Pick<Usuario, "id" | "nombre_completo" | "email"> | null;
  onClose(): void;
  onHecho(): void;
}) {
  const correo = usuario?.email || "su correo";
  return (
    <ConfirmDialog
      open={usuario !== null}
      onOpenChange={(v) => !v && onClose()}
      titulo="¿Completar la baja de esta cuenta?"
      descripcion={
        <>
          La persona eliminó su cuenta desde la app. Falta borrar su acceso a <strong>{correo}</strong>.
        </>
      }
      impacto={[
        `Ya no podrá entrar con ${correo}. Si vuelve, tendrá que crear una cuenta nueva.`,
        "Sus boletos y envíos anteriores se conservan sin sus datos personales.",
        "No se puede deshacer.",
      ]}
      verbo="Completar baja"
      verboCargando="Completando…"
      tono="destructive"
      onConfirm={async () => {
        if (!usuario) return { ok: false };
        const res = await completarBajaCuenta(usuario.id);
        if (!res.success) return { ok: false, error: res.error };
        toast.success("Baja completada. La cuenta ya no tiene acceso.");
        onHecho();
        return { ok: true };
      }}
    />
  );
}
