"use client";

// ─── Usuarios (AD5-16, AD5-17, AD5-31, AD5-32) ──────────────────────────────
// Búsqueda, filtros, vista y página en la URL (`?q=&rol=&cooperativa=&vista=&pagina=`),
// resueltos en el servidor. Cada fila abre el detalle; "Completar baja" queda
// encima de la fila (relative z-10).

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MagnifyingGlass, UserMinus, Users } from "@phosphor-icons/react";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CeldaEnlace } from "@/components/celda-enlace";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { FilaVacia } from "@/components/fila-vacia";
import { StatusBadge, TonoBadge } from "@/components/status-badge";
import { BarraFiltros, TabsUrl } from "@/components/barra-filtros";
import { PaginacionTabla } from "@/components/paginacion-tabla";
import { PARAM_PAGINA, useCambiarParams } from "@/hooks/use-param-url";
import { Vacio } from "@/components/admin/detalle";
import { ROLES, etiquetaEstado, etiquetaRol } from "@/lib/estados";
import { formatFechaVE } from "@/lib/fechas";
import { avisarExito } from "@/lib/avisos";
import { completarBajaCuenta } from "@/app/admin/(panel)/usuarios/actions";
import { bajaPorCompletar, estadoCuenta, type FiltrosUsuarios, type PaginaUsuarios, type Usuario } from "@/lib/types/admin-usuarios";

export type CooperativaFiltro = { id: string; nombre: string; estado: string };

interface UsuariosTableProps {
  resultado: PaginaUsuarios;
  filtros: FiltrosUsuarios;
  /** Todas las cooperativas, para el filtro (las activas primero). */
  cooperativas: CooperativaFiltro[];
}

const ORDEN_ESTADOS = ["ACTIVA", "PENDIENTE", "SUSPENDIDA", "RECHAZADA", "DESACTIVADA"];

function EstadoCuenta({ u }: { u: Usuario }) {
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      <StatusBadge status={estadoCuenta(u)} dominio="cuenta" />
      {bajaPorCompletar(u) && <TonoBadge tono="pendiente">Baja por completar</TonoBadge>}
    </span>
  );
}

export function UsuariosTable({ resultado, filtros, cooperativas }: UsuariosTableProps) {
  const router = useRouter();
  const cambiar = useCambiarParams();
  const [aCompletar, setACompletar] = useState<Usuario | null>(null);

  const { usuarios, total, pagina, porPagina, bajasPendientes } = resultado;
  const vistaBajas = filtros.vista === "bajas";
  const hayFiltros = Boolean(filtros.q || filtros.rol || filtros.cooperativa);
  const paginas = Math.max(1, Math.ceil(total / porPagina));
  // Con "Pasajeros" la columna Cooperativa siempre estaría vacía.
  const conCooperativa = filtros.rol !== "user";
  const columnas = 4 + (conCooperativa ? 1 : 0) + (vistaBajas ? 1 : 0);

  const rango = (estado: string) => {
    const i = ORDEN_ESTADOS.indexOf(estado);
    return i === -1 ? ORDEN_ESTADOS.length : i;
  };
  const opcionesCooperativa = [...cooperativas]
    .sort((a, b) => rango(a.estado) - rango(b.estado) || a.nombre.localeCompare(b.nombre, "es"))
    .map((c) => ({
      valor: c.id,
      etiqueta: c.estado === "ACTIVA" ? c.nombre : `${c.nombre} (${etiquetaEstado("cooperativa", c.estado)})`,
    }));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <BarraFiltros
          busqueda={{ etiqueta: "Buscar", placeholder: "Nombre, cédula o teléfono" }}
          selects={[
            {
              param: "rol",
              etiqueta: "Rol",
              todas: "Todos",
              opciones: (Object.keys(ROLES) as Array<keyof typeof ROLES>).map((r) => ({ valor: r, etiqueta: ROLES[r] })),
            },
            { param: "cooperativa", etiqueta: "Cooperativa", opciones: opcionesCooperativa },
          ]}
        />
        <TabsUrl
          param="vista"
          defecto="todas"
          opciones={[
            { valor: "todas", etiqueta: "Todas" },
            { valor: "bajas", etiqueta: "Bajas por completar", conteo: bajasPendientes },
          ]}
        />
      </div>

      <Card className="gap-0 overflow-hidden p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Usuario</TableHead>
              <TableHead>Rol</TableHead>
              {conCooperativa && <TableHead className="hidden md:table-cell">Cooperativa</TableHead>}
              <TableHead className="hidden lg:table-cell">Estado</TableHead>
              <TableHead className="hidden lg:table-cell">Registro</TableHead>
              {vistaBajas && <TableHead className="text-right">Acciones</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {usuarios.length === 0 ? (
              <FilaVacia
                colSpan={columnas}
                icon={hayFiltros ? MagnifyingGlass : Users}
                titulo={
                  vistaBajas
                    ? "No hay bajas por completar"
                    : hayFiltros
                      ? "Ningún usuario coincide con los filtros"
                      : "Todavía no hay usuarios"
                }
              />
            ) : (
              usuarios.map((u) => (
                <TableRow key={u.id} className="relative">
                  <CeldaEnlace href={`/admin/usuarios/${u.id}`} etiqueta={`Ver usuario ${u.nombre_completo}`}>
                    <span className="block">{u.nombre_completo}</span>
                    <span className="block text-xs font-normal text-muted-foreground">{u.email || "Sin correo"}</span>
                  </CeldaEnlace>
                  <TableCell>
                    <Badge variant="secondary">{etiquetaRol(u.role)}</Badge>
                    {/* En pantallas chicas el estado va bajo el rol (la columna se oculta). */}
                    {(u.eliminada_at || u.is_banned) && (
                      <div className="mt-1 lg:hidden">
                        <EstadoCuenta u={u} />
                      </div>
                    )}
                  </TableCell>
                  {conCooperativa && (
                    <TableCell className="hidden md:table-cell">{u.cooperativa_nombre || <Vacio />}</TableCell>
                  )}
                  <TableCell className="hidden lg:table-cell">
                    <EstadoCuenta u={u} />
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground tabular-nums lg:table-cell">
                    {formatFechaVE(u.created_at)}
                  </TableCell>
                  {vistaBajas && (
                    <TableCell className="text-right">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="relative z-10"
                        aria-label={`Completar baja de ${u.email || u.nombre_completo}`}
                        onClick={() => setACompletar(u)}
                      >
                        <UserMinus aria-hidden /> Completar baja
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        <PaginacionTabla
          pagina={pagina}
          paginas={paginas}
          onCambio={(p) => cambiar({ [PARAM_PAGINA]: p <= 1 ? null : String(Math.min(p, paginas)) })}
        />
      </Card>

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
          Eliminó su cuenta desde la app, pero su acceso a <strong className="font-semibold">{correo}</strong> sigue activo.
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
        avisarExito("Baja completada. La cuenta ya no tiene acceso.");
        onHecho();
        return { ok: true };
      }}
    />
  );
}
