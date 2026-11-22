export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { exigirRolPanel } from "@/lib/supabase/auth-guards";
import { INICIO } from "@/lib/navigation";
import {
  fetchTarifaVigenteCooperativa,
  fetchTarifaProgramadaCooperativa,
  fetchHistorialTarifasCooperativa,
  fetchRutasParaSimuladorCooperativa,
} from "@/lib/data/cooperativa-tarifas";
import { obtenerTasaBCV } from "@/lib/tasa-bcv";
import { PageHeader } from "@/components/page-header";
import { TarifaVigenteCard } from "@/components/tarifas/tarifa-vigente-card";
import { CreateTarifaDialog } from "@/components/tarifas/create-tarifa-dialog";
import { HistorialTarifasTable } from "@/components/tarifas/historial-tarifas-table";
import { Simulador } from "@/components/tarifas/simulador";

export default async function CooperativaTarifasPage() {
  const user = await exigirRolPanel(["admin_cooperativa"]);
  if (!user.cooperativa_id) redirect(INICIO);

  const [tarifaVigente, tarifaProgramada, historialTarifas, rutas, tasa] = await Promise.all([
    fetchTarifaVigenteCooperativa(user.cooperativa_id),
    fetchTarifaProgramadaCooperativa(user.cooperativa_id),
    fetchHistorialTarifasCooperativa(user.cooperativa_id),
    fetchRutasParaSimuladorCooperativa(user.cooperativa_id),
    obtenerTasaBCV(),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Tarifas"
        description="Precio y límites de las encomiendas de tu cooperativa."
        principal={<CreateTarifaDialog vigente={tarifaVigente} rutas={rutas} />}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="flex flex-col gap-6 lg:col-span-5">
          <TarifaVigenteCard tarifa={tarifaVigente} programada={tarifaProgramada} />
          <Simulador tarifa={tarifaVigente} rutas={rutas} tasa={tasa} />
        </div>

        <div className="lg:col-span-7">
          <HistorialTarifasTable tarifas={historialTarifas} />
        </div>
      </div>
    </div>
  );
}
