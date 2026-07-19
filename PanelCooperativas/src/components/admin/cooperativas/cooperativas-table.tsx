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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Star, MagnifyingGlass, Funnel } from "@phosphor-icons/react";
import type { Cooperativa, EstadoCooperativa } from "@/lib/types/admin-cooperativas";

interface CooperativasTableProps {
  initialCooperativas: Cooperativa[];
}

export function CooperativasTable({ initialCooperativas }: CooperativasTableProps) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [estadoFilter, setEstadoFilter] = useState<string>("ALL");

  // Filtering on client side for instantaneous interaction, but could also sync with searchParams if needed
  const filteredCooperativas = initialCooperativas.filter((coop) => {
    const matchesSearch = 
      coop.nombre.toLowerCase().includes(search.toLowerCase()) ||
      coop.rif.toLowerCase().includes(search.toLowerCase());
    
    const matchesEstado = estadoFilter === "ALL" || coop.estado === estadoFilter;

    return matchesSearch && matchesEstado;
  });

  const getEstadoBadge = (estado: EstadoCooperativa) => {
    switch (estado) {
      case "PENDIENTE":
        return <Badge className="bg-blue-500/10 text-blue-500 hover:bg-blue-500/20 border-blue-500/20">Pendiente</Badge>;
      case "ACTIVA":
        return <Badge className="bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 border-emerald-500/20">Activa</Badge>;
      case "SUSPENDIDA":
        return <Badge className="bg-amber-500/10 text-amber-500 hover:bg-amber-500/20 border-amber-500/20">Suspendida</Badge>;
      case "DESACTIVADA":
        return <Badge className="bg-destructive/10 text-destructive hover:bg-destructive/20 border-destructive/20">Desactivada</Badge>;
      default:
        return <Badge variant="outline">{estado}</Badge>;
    }
  };

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-md">
          <MagnifyingGlass className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por nombre o RIF..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-background border-input text-foreground placeholder:text-muted-foreground focus-visible:ring-emerald-500 focus-visible:border-emerald-500"
          />
        </div>
        <div className="flex items-center gap-2">
          <Funnel className="h-4 w-4 text-muted-foreground" />
          <Select value={estadoFilter} onValueChange={(val) => setEstadoFilter(val ?? "ALL")}>
            <SelectTrigger className="w-[180px] bg-background border-input text-foreground">
              <SelectValue placeholder="Filtrar por estado" />
            </SelectTrigger>
            <SelectContent className="bg-popover border text-popover-foreground">
              <SelectItem value="ALL">Todos los estados</SelectItem>
              <SelectItem value="PENDIENTE">Pendiente</SelectItem>
              <SelectItem value="ACTIVA">Activa</SelectItem>
              <SelectItem value="SUSPENDIDA">Suspendida</SelectItem>
              <SelectItem value="DESACTIVADA">Desactivada</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Tabla */}
      <div className="rounded-xl border bg-card overflow-hidden">
        <Table>
          <TableHeader className="bg-muted/50 border-b">
            <TableRow className="hover:bg-transparent">
              <TableHead className="text-muted-foreground w-[80px]">Logo</TableHead>
              <TableHead className="text-muted-foreground">Nombre</TableHead>
              <TableHead className="text-muted-foreground">RIF</TableHead>
              <TableHead className="text-muted-foreground">Estado</TableHead>
              <TableHead className="text-muted-foreground text-right">Comisión %</TableHead>
              <TableHead className="text-muted-foreground text-center">Calificación</TableHead>
              <TableHead className="text-muted-foreground text-right">Registro</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredCooperativas.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
                  No se encontraron cooperativas con los filtros seleccionados.
                </TableCell>
              </TableRow>
            ) : (
              filteredCooperativas.map((coop) => (
                <TableRow 
                  key={coop.id}
                  onClick={() => router.push(`/admin/cooperativas/${coop.id}`)}
                  className="cursor-pointer transition-colors"
                >
                  <TableCell className="py-3">
                    <Avatar className="h-10 w-10 border">
                      <AvatarImage src={coop.logo_url || ""} alt={coop.nombre} />
                      <AvatarFallback className="bg-muted text-muted-foreground font-semibold">
                        {coop.nombre.substring(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                  </TableCell>
                  <TableCell className="font-medium text-foreground py-3">
                    {coop.nombre}
                  </TableCell>
                  <TableCell className="text-muted-foreground py-3">
                    {coop.rif}
                  </TableCell>
                  <TableCell className="py-3">
                    {getEstadoBadge(coop.estado)}
                  </TableCell>
                  <TableCell className="text-right text-foreground py-3 font-semibold">
                    {coop.comision_porcentaje}%
                  </TableCell>
                  <TableCell className="py-3">
                    <div className="flex items-center justify-center gap-1">
                      <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                      <span className="text-sm font-medium text-foreground">
                        {Number(coop.calificacion_promedio).toFixed(1)}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        ({coop.total_calificaciones})
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground py-3 text-sm">
                    {new Date(coop.created_at).toLocaleDateString("es-VE")}
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
