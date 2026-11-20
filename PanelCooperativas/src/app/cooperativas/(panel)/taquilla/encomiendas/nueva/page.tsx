import type { Metadata } from "next";
import { NuevaEncomiendaFlujo } from "@/components/encomiendas/nueva-encomienda-flujo";

// Nueva encomienda de un cliente sin la app, como página (no diálogo). El paso vive en `?paso=`.
export const metadata: Metadata = { title: "Nueva encomienda" };

export default function NuevaEncomiendaPage() {
  return <NuevaEncomiendaFlujo />;
}
