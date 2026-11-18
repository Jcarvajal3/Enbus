export const dynamic = "force-dynamic";

import { fetchCiclosComisiones, fetchCooperativasList } from "@/lib/data/admin-comisiones";
import { GenerarCicloDialog } from "@/components/admin/comisiones/generar-ciclo-dialog";
import { CiclosTable } from "@/components/admin/comisiones/ciclos-table";
import { PageHeader } from "@/components/page-header";
import { obtenerTasaBCV } from "@/lib/tasa-bcv";

export default async function AdminComisionesPage() {
  const [{ ciclos, truncado }, cooperativas, tasa] = await Promise.all([
    fetchCiclosComisiones(),
    fetchCooperativasList(),
    obtenerTasaBCV(),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Comisiones"
        description="Ciclos de comisión de cada cooperativa y sus pagos."
        principal={<GenerarCicloDialog cooperativas={cooperativas} tasa={tasa} />}
      />

      <CiclosTable data={ciclos} truncado={truncado} cooperativas={cooperativas} tasa={tasa} />
    </div>
  );
}
