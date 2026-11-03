"use client";

import { Button } from "@/components/ui/button";
import { DownloadSimple } from "@phosphor-icons/react";
import { ComisionCiclo } from "@/lib/types/admin-comisiones";
import { toast } from "sonner";
import { fechaVE } from "@/lib/fechas";
import { etiquetaMetodoPago } from "@/lib/estados";

/** Decimal con coma (Excel en español con separador ";"), sin separador de miles: 1250.5 -> "1250,50". */
const decimalCsv = (n: number, decimales = 2) => Number(n ?? 0).toFixed(decimales).replace(".", ",");

/**
 * Texto entre comillas, escapando comillas internas. Un texto que empieza por
 * = + - @ se antepone con ' para que Excel no lo ejecute como fórmula.
 */
const textoCsv = (s: string) => {
  const seguro = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return `"${seguro.replace(/"/g, "\"\"")}"`;
};

interface ExportCSVButtonProps {
  data: ComisionCiclo[];
  filename?: string;
}

export function ExportCSVButton({ data, filename = "ciclos_comisiones.csv" }: ExportCSVButtonProps) {
  const handleExport = () => {
    if (!data || data.length === 0) {
      toast.warning("No hay ciclos para exportar con estos filtros.");
      return;
    }

    try {
      // Cabeceras del CSV
      const headers = [
        "ID",
        "Cooperativa",
        "Período Inicio",
        "Período Fin",
        "Total Ventas Encomiendas (USD)",
        "Total Ventas Boletos (USD)",
        "Comisión %",
        "Monto Comisión (USD)",
        "Estado Pago",
        "Fecha Pago",
        "Método Pago",
        "Referencia Pago",
        "Fecha Creación"
      ];

      // Formatear filas
      const rows = data.map((item) => [
        item.id,
        textoCsv(item.cooperativa_nombre || "Desconocida"),
        item.periodo_inicio,
        item.periodo_fin,
        decimalCsv(item.total_encomiendas),
        decimalCsv(item.total_boletos),
        decimalCsv(item.comision_porcentaje),
        decimalCsv(item.monto_comision),
        item.pagado ? "Pagado" : "Pendiente",
        item.pagado_at ? fechaVE(item.pagado_at) : "",
        textoCsv(item.pago_metodo ? etiquetaMetodoPago(item.pago_metodo) : ""),
        textoCsv(item.pago_referencia ?? ""),
        fechaVE(item.created_at)
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
      
      toast.success("Descargamos el archivo CSV.");
    } catch (error) {
      console.error("Error al exportar CSV:", error);
      toast.error("No pudimos generar el archivo CSV. Intenta de nuevo.");
    }
  };

  return (
    <Button 
      onClick={handleExport}
      variant="outline" 
      size="sm"
      className="gap-1.5 h-9"
    >
      <DownloadSimple className="h-4 w-4" aria-hidden /> Exportar CSV
    </Button>
  );
}
