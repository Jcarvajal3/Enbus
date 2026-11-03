/* eslint-disable */
"use client";
// PÁGINA TEMPORAL DE QA (W2-PANEL-MOSTRADOR): se borra al terminar.
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { CobroTaquillaForm, VentaFlow } from "@/components/boletos/venta-flow";
import { SeatSelector } from "@/components/boletos/seat-selector";
import { RecepcionLoteModal } from "@/app/cooperativas/(panel)/recepcion-destino/recepcion-lote-modal";
import { NuevaEncomiendaDialog } from "@/components/encomiendas/nueva-encomienda-dialog";
import { CobroEncomiendaForm } from "@/components/encomiendas/pago-modal";
import { ViajesClient } from "@/app/cooperativas/(panel)/viajes/client";
import { MarcarSalidaDialog } from "@/components/viajes/marcar-viaje-dialogs";
import { CameraQRScanner } from "@/components/camera-qr-scanner";

const h = (x: number) => new Date(Date.now() + x * 3600e3).toISOString();
const viajes = Array.from({ length: 30 }, (_, i) => ({
  id: `v${i}`, ruta_id: i % 2 ? "r1" : "r2", estado: ["PROGRAMADO", "EN_CURSO", "COMPLETADO", "CANCELADO"][i % 4],
  fecha_hora_salida: h(i), fecha_hora_llegada_est: h(i + 6), asientos_disponibles: 40 - i, asientos_totales: 40,
  numero_unidad: String(10 + i), nombre_chofer: "Pedro Pérez",
  ruta: { ciudad_origen: i % 2 ? "caracas" : "san cristobal", ciudad_destino: i % 2 ? "valencia" : "barquisimeto", precio_pasaje: 18 + i },
}));
const rutas = [{ id: "r1", ciudad_origen: "caracas", ciudad_destino: "valencia" }, { id: "r2", ciudad_origen: "san cristobal", ciudad_destino: "barquisimeto" }];

export function Demo({ s }: { s: string }) {
  const [open, setOpen] = useState(true);
  if (s === "viajes") return <ViajesClient viajes={viajes} rutasActivas={rutas} userRole="admin_cooperativa" vista="hoy" totalHoy={12} />;
  if (s === "viajes-vacio") return <ViajesClient viajes={[]} rutasActivas={rutas} userRole="admin_cooperativa" vista="proximos" totalHoy={0} />;
  if (s === "venta") return <VentaFlow isOpen={open} onClose={() => setOpen(false)} />;
  if (s === "lote") return <RecepcionLoteModal isOpen={open} onClose={() => setOpen(false)} cooperativaId="00000000-0000-0000-0000-000000000000" sucursal={null} onSuccess={() => {}} />;
  if (s === "nueva") return <NuevaEncomiendaDialog open={open} onOpenChange={setOpen} onContinuar={() => {}} />;
  if (s === "salida") return <MarcarSalidaDialog open={open} onOpenChange={setOpen} viaje={{ id: "x", origen: "caracas", destino: "valencia", salida: h(2) }} />;
  if (s === "camara") return <CameraQRScanner open={open} onOpenChange={setOpen} onScan={() => {}} />;
  if (s === "cobro" || s === "cobro-enc" || s === "asientos")
    return (
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent tamano="flujo">
          <DialogHeader><DialogTitle>Vender boletos</DialogTitle><DialogDescription>Paso 4 de 5 · Cobro</DialogDescription></DialogHeader>
          {s === "cobro" && <CobroTaquillaForm totalUsd={36} enviando={false} onCobrar={() => {}} onVolver={() => {}} />}
          {s === "cobro-enc" && <CobroEncomiendaForm encomienda={{ id: "e", tracking_id: "EB-261103-00012", costo_calculado: 12, cooperativa_id: "00000000-0000-0000-0000-000000000000" }} onCobrado={() => {}} />}
          {s === "asientos" && <SeatSelector viajeId="00000000-0000-0000-0000-000000000000" totalAsientos={38} seleccionInicial={["6", "7"]} onConfirm={() => {}} onCancel={() => {}} />}
        </DialogContent>
      </Dialog>
    );
  return null;
}
