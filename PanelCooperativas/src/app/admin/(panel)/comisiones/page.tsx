export const dynamic = "force-dynamic";

import { fetchCiclosComisiones, fetchCooperativasList } from "@/lib/data/admin-comisiones";
import { GenerarCicloDialog } from "@/components/admin/comisiones/generar-ciclo-dialog";
import { CiclosTable } from "@/components/admin/comisiones/ciclos-table";
import { Receipt } from "@phosphor-icons/react/dist/ssr";

export default async function AdminComisionesPage() {
  // Fetch data concurrently on the server side
  const [ciclos, cooperativas] = await Promise.all([
    fetchCiclosComisiones(),
    fetchCooperativasList(),
  ]);

  return (
    <div className="space-y-6">
      {/* Header Sección */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Receipt className="h-6 w-6 text-emerald-500" /> Control de Comisiones
          </h1>
          <p className="text-sm text-muted-foreground">
            Administra los ciclos de liquidación y pagos de comisiones de las cooperativas.
          </p>
        </div>
        <div className="flex-shrink-0">
          <GenerarCicloDialog cooperativas={cooperativas} />
        </div>
      </div>

      {/* Tabla e interfaz interactiva */}
      <CiclosTable data={ciclos} cooperativas={cooperativas} />
    </div>
  );
}
