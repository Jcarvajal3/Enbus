import { Badge } from "@/components/ui/badge";

export type EncomiendaEstado = 
  | "PENDIENTE_DE_ESCANEO"
  | "POR_PAGAR"
  | "PAGADA"
  | "EN_TRANSITO"
  | "ENTREGADA"
  | "CANCELADA";

export function StatusBadge({ status }: { status: EncomiendaEstado | string }) {
  switch (status) {
    case "PENDIENTE_DE_ESCANEO":
      return <Badge variant="outline">Pendiente</Badge>;
    case "POR_PAGAR":
      return <Badge variant="secondary" className="bg-amber-500/20 text-amber-700 hover:bg-amber-500/30 dark:bg-amber-500/10 dark:text-amber-400">Por Pagar</Badge>;
    case "PAGADA":
      return <Badge variant="default" className="bg-emerald-500 hover:bg-emerald-600 text-white">Pagada</Badge>;
    case "EN_TRANSITO":
      return <Badge variant="default" className="bg-blue-500 hover:bg-blue-600 text-white">En Tránsito</Badge>;
    case "ENTREGADA":
      return <Badge variant="secondary" className="bg-slate-200 text-slate-700 hover:bg-slate-300 dark:bg-slate-800 dark:text-slate-300">Entregada</Badge>;
    case "CANCELADA":
      return <Badge variant="destructive">Cancelada</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}
