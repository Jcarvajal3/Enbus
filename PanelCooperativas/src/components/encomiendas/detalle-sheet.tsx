"use client";

import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/status-badge";
import type { Encomienda } from "@/lib/types/encomiendas";

interface DetalleSheetProps {
  encomienda: Encomienda;
  isOpen: boolean;
  onClose: () => void;
}

export function DetalleSheet({ encomienda, isOpen, onClose }: DetalleSheetProps) {
  const formatDate = (dateString: string) => {
    return new Intl.DateTimeFormat("es-VE", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(dateString));
  };

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader className="mb-6">
          <SheetTitle className="text-xl flex items-center justify-between">
            Detalle de Encomienda
            <StatusBadge status={encomienda.estado} />
          </SheetTitle>
          <SheetDescription>
            ID: <span className="font-mono text-foreground">{encomienda.tracking_id}</span>
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-6">
          <section className="space-y-3 bg-muted/30 p-4 rounded-lg border">
            <h4 className="text-sm font-semibold">Ruta y Origen</h4>
            <div className="grid grid-cols-2 gap-y-4 gap-x-2 text-sm">
              <div>
                <p className="text-muted-foreground mb-1">Origen</p>
                <p className="font-medium">{encomienda.ciudad_origen}, {encomienda.estado_origen}</p>
              </div>
              <div>
                <p className="text-muted-foreground mb-1">Destino</p>
                <p className="font-medium">{encomienda.ciudad_destino}, {encomienda.estado_destino}</p>
              </div>
              <div className="col-span-2">
                <p className="text-muted-foreground mb-1">Fecha de Registro</p>
                <p className="font-medium">{formatDate(encomienda.created_at)}</p>
              </div>
            </div>
          </section>

          <section className="space-y-3 bg-muted/30 p-4 rounded-lg border">
            <h4 className="text-sm font-semibold">Cliente y Remitente</h4>
            <div className="grid gap-y-4 text-sm">
              <div>
                <p className="text-muted-foreground mb-1">Remitente</p>
                <p className="font-medium">{encomienda.sender?.nombre_completo || "Desconocido"}</p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <p className="text-muted-foreground mb-1">Destinatario</p>
                  <p className="font-medium">{encomienda.receiver_nombre}</p>
                </div>
                <div>
                  <p className="text-muted-foreground mb-1">Teléfono</p>
                  <p className="font-medium">{encomienda.receiver_telefono}</p>
                </div>
              </div>
            </div>
          </section>

          <section className="space-y-3 bg-muted/30 p-4 rounded-lg border">
            <h4 className="text-sm font-semibold">Paquete y Cobro</h4>
            <div className="grid grid-cols-2 gap-y-4 text-sm">
              <div>
                <p className="text-muted-foreground mb-1">Peso</p>
                <p className="font-medium">{encomienda.peso_kg ? `${encomienda.peso_kg} kg` : "N/A"}</p>
              </div>
              <div>
                <p className="text-muted-foreground mb-1">Modalidad</p>
                <Badge variant={encomienda.modalidad_pago === "ORIGEN" ? "default" : "secondary"}>
                  {encomienda.modalidad_pago}
                </Badge>
              </div>
              <div className="col-span-2">
                <p className="text-muted-foreground mb-1">Contenido</p>
                <p className="font-medium">{encomienda.descripcion_contenido}</p>
              </div>
              <div className="col-span-2 mt-2 pt-2 border-t flex justify-between items-center">
                <span className="font-medium text-muted-foreground">Costo Total:</span>
                <span className="text-xl font-bold text-primary">
                  ${encomienda.costo_calculado?.toFixed(2) || "0.00"}
                </span>
              </div>
            </div>
          </section>

          {encomienda.foto_evidencia_url && (
            <section className="space-y-3">
              <h4 className="text-sm font-semibold">Foto de Evidencia</h4>
              <div className="aspect-video w-full rounded-md overflow-hidden border">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img 
                  src={encomienda.foto_evidencia_url} 
                  alt="Evidencia fotográfica" 
                  className="w-full h-full object-cover hover:scale-105 transition-transform duration-300"
                />
              </div>
            </section>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
