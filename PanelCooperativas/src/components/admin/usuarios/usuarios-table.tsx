"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { MagnifyingGlass, Funnel, ShieldCheck } from "@phosphor-icons/react";
import type { Usuario } from "@/lib/types/admin-usuarios";

interface UsuariosTableProps {
  initialUsuarios: Usuario[];
  cooperativas: { id: string; nombre: string }[];
}

export function UsuariosTable({ initialUsuarios, cooperativas }: UsuariosTableProps) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("ALL");
  const [coopFilter, setCoopFilter] = useState<string>("ALL");

  const filteredUsuarios = initialUsuarios.filter((u) => {
    const matchesSearch = 
      u.nombre_completo.toLowerCase().includes(search.toLowerCase()) ||
      u.telefono.toLowerCase().includes(search.toLowerCase()) ||
      u.cedula_rif.toLowerCase().includes(search.toLowerCase()) ||
      (u.email && u.email.toLowerCase().includes(search.toLowerCase()));

    const matchesRole = roleFilter === "ALL" || u.role === roleFilter;
    const matchesCoop = coopFilter === "ALL" || u.cooperativa_id === coopFilter;

    return matchesSearch && matchesRole && matchesCoop;
  });

  const getRoleBadge = (role: Usuario["role"]) => {
    switch (role) {
      case "super_admin":
        return <Badge className="bg-amber-500/10 text-amber-500 hover:bg-amber-500/20 border-amber-500/20 gap-1"><ShieldCheck className="h-3 w-3" /> Super Admin</Badge>;
      case "admin_cooperativa":
        return <Badge className="bg-indigo-500/10 text-indigo-500 hover:bg-indigo-500/20 border-indigo-500/20">Admin Coop</Badge>;
      case "taquillero":
        return <Badge className="bg-sky-500/10 text-sky-500 hover:bg-sky-500/20 border-sky-500/20">Taquillero</Badge>;
      case "user":
        return <Badge className="bg-slate-500/10 text-muted-foreground hover:bg-slate-500/20 border-slate-500/20">Cliente</Badge>;
      default:
        return <Badge variant="outline">{role}</Badge>;
    }
  };

  const getStatusBadge = (isBanned: boolean) => {
    if (isBanned) {
      return <Badge className="bg-destructive/10 text-destructive hover:bg-destructive/20 border-destructive/20">Suspendido</Badge>;
    }
    return <Badge className="bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 border-emerald-500/20">Activo</Badge>;
  };

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative flex-1 max-w-md">
          <MagnifyingGlass className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por nombre, correo, cédula o teléfono..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-background border-input text-foreground placeholder:text-muted-foreground focus-visible:ring-emerald-500 focus-visible:border-emerald-500"
          />
        </div>
        
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Funnel className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Rol:</span>
            <Select value={roleFilter} onValueChange={(val) => setRoleFilter(val ?? "ALL")}>
              <SelectTrigger className="w-[140px] bg-background border-input text-foreground">
                <SelectValue placeholder="Rol" />
              </SelectTrigger>
              <SelectContent className="bg-popover border text-popover-foreground">
                <SelectItem value="ALL">Todos</SelectItem>
                <SelectItem value="super_admin">Super Admin</SelectItem>
                <SelectItem value="admin_cooperativa">Admin Coop</SelectItem>
                <SelectItem value="taquillero">Taquillero</SelectItem>
                <SelectItem value="user">Cliente</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Cooperativa:</span>
            <Select value={coopFilter} onValueChange={(val) => setCoopFilter(val ?? "ALL")}>
              <SelectTrigger className="w-[200px] bg-background border-input text-foreground">
                <SelectValue placeholder="Cooperativa" />
              </SelectTrigger>
              <SelectContent className="bg-popover border text-popover-foreground">
                <SelectItem value="ALL">Todas las cooperativas</SelectItem>
                {cooperativas.map((coop) => (
                  <SelectItem key={coop.id} value={coop.id}>
                    {coop.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Tabla */}
      <div className="rounded-xl border bg-card overflow-hidden">
        <Table>
          <TableHeader className="bg-muted/50 border-b">
            <TableRow className="hover:bg-transparent">
              <TableHead className="text-muted-foreground w-[50px]"></TableHead>
              <TableHead className="text-muted-foreground">Nombre Completo</TableHead>
              <TableHead className="text-muted-foreground">Correo Electrónico</TableHead>
              <TableHead className="text-muted-foreground">Identificación / Cédula</TableHead>
              <TableHead className="text-muted-foreground">Teléfono</TableHead>
              <TableHead className="text-muted-foreground">Rol</TableHead>
              <TableHead className="text-muted-foreground">Cooperativa</TableHead>
              <TableHead className="text-muted-foreground">Estado</TableHead>
              <TableHead className="text-muted-foreground text-right">Registro</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredUsuarios.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={9} className="h-32 text-center text-muted-foreground">
                  No se encontraron usuarios con los criterios de búsqueda.
                </TableCell>
              </TableRow>
            ) : (
              filteredUsuarios.map((u) => (
                <TableRow 
                  key={u.id}
                  onClick={() => router.push(`/admin/usuarios/${u.id}`)}
                  className="cursor-pointer transition-colors"
                >
                  <TableCell className="py-3">
                    <Avatar className="h-8 w-8 border">
                      <AvatarFallback className="bg-muted text-muted-foreground text-xs font-semibold">
                        {u.nombre_completo.substring(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                  </TableCell>
                  <TableCell className="font-medium text-foreground py-3">
                    {u.nombre_completo}
                  </TableCell>
                  <TableCell className="text-muted-foreground py-3 text-sm">
                    {u.email || <span className="text-muted-foreground/60">N/A</span>}
                  </TableCell>
                  <TableCell className="text-foreground py-3 text-sm font-mono">
                    {u.cedula_rif}
                  </TableCell>
                  <TableCell className="text-muted-foreground py-3 text-sm">
                    {u.telefono}
                  </TableCell>
                  <TableCell className="py-3">
                    {getRoleBadge(u.role)}
                  </TableCell>
                  <TableCell className="text-foreground py-3 text-sm font-medium">
                    {u.cooperativa_nombre || <span className="text-muted-foreground/60 italic">Ninguna</span>}
                  </TableCell>
                  <TableCell className="py-3">
                    {getStatusBadge(u.is_banned)}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground py-3 text-sm">
                    {new Date(u.created_at).toLocaleDateString("es-VE")}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
