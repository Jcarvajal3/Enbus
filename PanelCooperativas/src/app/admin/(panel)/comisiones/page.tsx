export const dynamic = "force-dynamic";

import { fetchCiclosComisiones, fetchCooperativasList } from "@/lib/data/admin-comisiones";
import { GenerarCicloDialog } from "@/components/admin/comisiones/generar-ciclo-dialog";
import { CiclosTable } from "@/components/admin/comisiones/ciclos-table";
import { Receipt } from "@phosphor-icons/react/dist/ssr";
import { obtenerTasaBCV } from "@/lib/tasa-bcv";

export default async function AdminComisionesPage() {
  // Fetch data concurrently on the server side
  const [ciclos, cooperativas, tasa] = await Promise.all([
    fetchCiclosComisiones(),
    fetchCooperativasList(),
    obtenerTasaBCV(),
  ]);

  return (
    <div className="space-y-6">
      {/* Header Sección */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Receipt className="h-6 w-6 text-muted-foreground" aria-hidden /> Comisiones
          </h1>
          <p className="text-sm text-muted-foreground">
            Genera los ciclos de comisiones de cada cooperativa y registra sus pagos.
          </p>
        </div>
        <div className="flex-shrink-0">
          <GenerarCicloDialog cooperativas={cooperativas} tasa={tasa} />
        </div>
      </div>

      {/* Tabla e interfaz interactiva */}
      <CiclosTable data={ciclos} cooperativas={cooperativas} tasa={tasa} />
    </div>
  );
}
