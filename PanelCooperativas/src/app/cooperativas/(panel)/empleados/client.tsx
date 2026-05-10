"use client";

import { useState, useTransition } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { invitarEmpleado, toggleEmpleado } from "./actions";
import { DotsThree, UserPlus, Copy, Check, UsersThree } from "@phosphor-icons/react";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";

/* eslint-disable @typescript-eslint/no-explicit-any */
export function EmpleadosClient({
  empleados,
  sucursales,
  currentUserId,
}: {
  empleados: any[];
  sucursales: any[];
  currentUserId: string;
}) {
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleInvite(formData: FormData) {
    startTransition(async () => {
      const res = await invitarEmpleado(formData);
      if (res.error) {
        alert(res.error);
        return;
      }
      if (res.success && res.token) {
        setInviteLink(`${window.location.origin}/cooperativas/invite/${res.token}`);
      }
    });
  }

  async function handleToggle(id: string, action: "desactivar" | "reactivar") {
    if (confirm(`¿Estás seguro de que deseas ${action} a este empleado?`)) {
      startTransition(async () => {
        const res = await toggleEmpleado(id, action);
        if (res.error) {
          alert(res.error);
        }
      });
    }
  }

  function handleCopy() {
    if (inviteLink) {
      navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Empleados" description="Gestiona los accesos de tu cooperativa">
        <Button onClick={() => setIsInviteOpen(true)}>
          <UserPlus className="mr-2 h-4 w-4" weight="bold" />
          Invitar Empleado
        </Button>
      </PageHeader>

      <Dialog open={isInviteOpen} onOpenChange={(open) => {
        setIsInviteOpen(open);
        if (!open) {
          setInviteLink(null);
          setCopied(false);
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invitar nuevo empleado</DialogTitle>
            <DialogDescription>
              Genera un enlace mágico para que un empleado configure su cuenta de taquillero.
            </DialogDescription>
          </DialogHeader>

          {inviteLink ? (
            <div className="flex flex-col gap-4 py-4">
              <div className="rounded-md bg-muted p-4">
                <p className="text-sm break-all font-mono">{inviteLink}</p>
              </div>
              <Button onClick={handleCopy} className="w-full" variant="secondary">
                {copied ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
                {copied ? "Copiado!" : "Copiar enlace"}
              </Button>
            </div>
          ) : (
            <form action={handleInvite}>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="email">Correo electrónico</Label>
                  <Input id="email" name="email" type="email" placeholder="correo@ejemplo.com" required />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="sucursal">Sucursal Asignada</Label>
                  <Select name="sucursalId" required>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecciona una sucursal" />
                    </SelectTrigger>
                    <SelectContent>
                      {sucursales.map((s) => (
                        <SelectItem key={s.id} value={s.id}>{s.nombre}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button type="submit" disabled={isPending}>
                  {isPending ? "Generando..." : "Generar Invitación"}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Rol</TableHead>
              <TableHead>Fecha de Registro</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {empleados.map((emp) => {
              const isActive = !emp.isBanned;
              return (
                <TableRow key={emp.id} className={!isActive ? "opacity-60" : ""}>
                  <TableCell className="font-medium">{emp.nombre_completo}</TableCell>
                  <TableCell>{emp.email}</TableCell>
                  <TableCell>
                    <Badge variant={emp.role === "admin_cooperativa" ? "default" : "secondary"}>
                      {emp.role === "admin_cooperativa" ? "Administrador" : "Taquillero"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {new Intl.DateTimeFormat("es-VE", { dateStyle: "short" }).format(new Date(emp.created_at))}
                  </TableCell>
                  <TableCell>
                    {isActive ? (
                      <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20">Activo</Badge>
                    ) : (
                      <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/20">Inactivo</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger className="inline-flex h-8 w-8 items-center justify-center rounded-md p-0 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50">
                        <span className="sr-only">Abrir menú</span>
                        <DotsThree className="h-4 w-4" weight="bold" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {emp.id !== currentUserId ? (
                          <>
                            {isActive ? (
                              <DropdownMenuItem 
                                className="text-destructive focus:text-destructive"
                                onClick={() => handleToggle(emp.id, "desactivar")}
                              >
                                Desactivar cuenta
                              </DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem 
                                onClick={() => handleToggle(emp.id, "reactivar")}
                              >
                                Reactivar cuenta
                              </DropdownMenuItem>
                            )}
                          </>
                        ) : (
                          <DropdownMenuItem disabled>
                            (Tu cuenta)
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              );
            })}
            
            {empleados.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="h-48 text-center text-muted-foreground p-0">
                  <EmptyState 
                    icon={UsersThree} 
                    title="Sin empleados" 
                    description="No hay empleados registrados en tu cooperativa." 
                  />
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
