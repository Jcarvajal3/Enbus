"use client";

import { useState } from "react";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { MagnifyingGlass } from "@phosphor-icons/react";
import type { SolicitudPendiente } from "@/lib/types/admin-solicitudes";
import { AprobarDialog } from "./aprobar-dialog";
import { RechazarDialog } from "./rechazar-dialog";

interface SolicitudesTableProps {
  solicitudes: SolicitudPendiente[];
}

export function SolicitudesTable({ solicitudes }: SolicitudesTableProps) {
  const [search, setSearch] = useState("");

  const filteredSolicitudes = solicitudes.filter((sol) => {
    return (
      sol.nombre.toLowerCase().includes(search.toLowerCase()) ||
      sol.rif.toLowerCase().includes(search.toLowerCase())
    );
  });

  return (
    <div className="space-y-4 font-sans">
      {/* Filtros */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-md">
          <MagnifyingGlass className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por nombre o RIF..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-background border-input text-foreground placeholder:text-muted-foreground focus-visible:ring-emerald-500 focus-visible:border-emerald-500 font-sans"
          />
        </div>
      </div>

      {/* Tabla */}
      <div className="rounded-xl border bg-card overflow-hidden">
        <Table>
          <TableHeader className="bg-muted/50 border-b">
            <TableRow className="hover:bg-transparent">
              <TableHead className="text-muted-foreground font-sans">Nombre Comercial</TableHead>
              <TableHead className="text-muted-foreground font-sans">RIF</TableHead>
              <TableHead className="text-muted-foreground font-sans">Email</TableHead>
              <TableHead className="text-muted-foreground font-sans">Teléfono</TableHead>
              <TableHead className="text-muted-foreground text-right font-sans">Fecha de Solicitud</TableHead>
              <TableHead className="text-muted-foreground text-center w-[220px] font-sans">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredSolicitudes.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={6} className="h-32 text-center text-muted-foreground font-sans">
                  No hay solicitudes de registro pendientes.
                </TableCell>
              </TableRow>
            ) : (
              filteredSolicitudes.map((sol) => (
                <TableRow key={sol.id} className="hover:bg-muted/40 transition-colors">
                  <TableCell className="font-medium text-foreground py-3 font-sans">
                    {sol.nombre}
                  </TableCell>
                  <TableCell className="text-muted-foreground py-3 font-mono">
                    {sol.rif}
                  </TableCell>
                  <TableCell className="text-muted-foreground py-3 font-sans">
                    {sol.email || "No provisto"}
                  </TableCell>
                  <TableCell className="text-muted-foreground py-3 font-mono">
                    {sol.telefono || "No provisto"}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground py-3 text-sm font-sans">
                    {new Date(sol.created_at).toLocaleDateString("es-VE")}
                  </TableCell>
                  <TableCell className="py-3">
                    <div className="flex items-center justify-center gap-2">
                      <AprobarDialog
                        cooperativaId={sol.id}
                        nombre={sol.nombre}
                        rif={sol.rif}
                      />
                      <RechazarDialog
                        cooperativaId={sol.id}
                        nombre={sol.nombre}
                      />
                    </div>
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
