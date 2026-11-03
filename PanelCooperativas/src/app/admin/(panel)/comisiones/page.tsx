export const dynamic = "force-dynamic";

import { fetchCiclosComisiones, fetchCooperativasList } from "@/lib/data/admin-comisiones";
import { GenerarCicloDialog } from "@/components/admin/comisiones/generar-ciclo-dialog";
import { CiclosTable } from "@/components/admin/comisiones/ciclos-table";
import { PageHeader } from "@/components/page-header";
import { obtenerTasaBCV } from "@/lib/tasa-bcv";

export default async function AdminComisionesPage() {
  // Fetch data concurrently on the server side
  const [{ ciclos, truncado }, cooperativas, tasa] = await Promise.all([
    fetchCiclosComisiones(),
    fetchCooperativasList(),
    obtenerTasaBCV(),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Comisiones"
        description="Genera los ciclos de comisiones de cada cooperativa y registra sus pagos."
      >
        <GenerarCicloDialog cooperativas={cooperativas} tasa={tasa} />
      </PageHeader>

      {/* Tabla e interfaz interactiva */}
      <CiclosTable data={ciclos} truncado={truncado} cooperativas={cooperativas} tasa={tasa} />
    </div>
  );
}
