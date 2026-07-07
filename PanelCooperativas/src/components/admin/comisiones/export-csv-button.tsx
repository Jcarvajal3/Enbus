"use client";

import { Button } from "@/components/ui/button";
import { DownloadSimple } from "@phosphor-icons/react";
import { ComisionCiclo } from "@/lib/types/admin-comisiones";
import { toast } from "sonner";

interface ExportCSVButtonProps {
  data: ComisionCiclo[];
  filename?: string;
}

export function ExportCSVButton({ data, filename = "ciclos_comisiones.csv" }: ExportCSVButtonProps) {
  const handleExport = () => {
    if (!data || data.length === 0) {
      toast.warning("No hay datos para exportar");
      return;
    }

    try {
      // Cabeceras del CSV
      const headers = [
        "ID",
        "Cooperativa",
        "Periodo Inicio",
        "Periodo Fin",
        "Total Ventas Encomiendas",
        "Total Ventas Boletos",
        "Comision %",
        "Monto Comision",
        "Estado Pago",
        "Fecha Pago",
        "Fecha Creacion"
      ];

      // Formatear filas
      const rows = data.map((item) => [
        item.id,
        `"${item.cooperativa_nombre || "Desconocida"}"`,
        item.periodo_inicio,
        item.periodo_fin,
        item.total_encomiendas.toFixed(2),
        item.total_boletos.toFixed(2),
        item.comision_porcentaje.toFixed(2),
        item.monto_comision.toFixed(2),
        item.pagado ? "PAGADO" : "PENDIENTE",
        item.pagado_at ? new Date(item.pagado_at).toISOString().split("T")[0] : "N/A",
        new Date(item.created_at).toISOString().split("T")[0]
      ]);

      // Unir cabeceras y filas con punto y coma (formato regional latinoamericano) o coma
      // Usaremos punto y coma (;) para mayor compatibilidad con Excel en español,
      // pero con comillas dobles para escapar strings.
      const csvContent = [
        headers.join(";"),
        ...rows.map((row) => row.join(";"))
      ].join("\n");

      // Crear blob con BOM (Byte Order Mark) UTF-8 para que Excel detecte correctamente los caracteres especiales (tildes, Ñ, etc.)
      const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", filename);
      link.style.visibility = "hidden";
      
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url); // Liberar el blob de memoria
      
      toast.success("Archivo CSV exportado correctamente");
    } catch (error) {
      console.error("Error al exportar CSV:", error);
      toast.error("Ocurrió un error al exportar el archivo CSV");
    }
  };

  return (
    <Button 
      onClick={handleExport}
      variant="outline" 
      size="sm"
      className="bg-slate-900 border-slate-800 text-slate-300 hover:text-slate-100 hover:bg-slate-800 gap-1.5 h-9"
    >
      <DownloadSimple className="h-4 w-4" /> Exportar CSV
    </Button>
  );
}
