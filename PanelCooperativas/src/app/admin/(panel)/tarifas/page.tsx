export const dynamic = "force-dynamic";

import {
  fetchTarifaVigente,
  fetchTarifaProgramada,
  fetchHistorialTarifas,
  fetchRutasParaSimulador,
} from "@/lib/data/admin-tarifas";
import { obtenerTasaBCV } from "@/lib/tasa-bcv";
import { hoyVE } from "@/lib/fechas";
import { PageHeader } from "@/components/page-header";
import { TarifaVigenteCard } from "@/components/admin/tarifas/tarifa-vigente-card";
import { CreateTarifaDialog } from "@/components/admin/tarifas/create-tarifa-dialog";
import { HistorialTarifasTable } from "@/components/admin/tarifas/historial-tarifas-table";
import { Simulador } from "@/components/admin/tarifas/simulador";
import { TasaBCVCard } from "@/components/admin/tarifas/tasa-bcv-card";

export default async function AdminTarifasPage() {
  const [tarifaVigente, tarifaProgramada, historialTarifas, rutas, tasa] = await Promise.all([
    fetchTarifaVigente(),
    fetchTarifaProgramada(),
    fetchHistorialTarifas(),
    fetchRutasParaSimulador(),
    obtenerTasaBCV(),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Tarifas" description="Precio de encomiendas y tasa BCV.">
        <CreateTarifaDialog vigente={tarifaVigente} rutas={rutas} />
      </PageHeader>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="flex flex-col gap-6 lg:col-span-5">
          <TarifaVigenteCard tarifa={tarifaVigente} programada={tarifaProgramada} />
          <TasaBCVCard tasa={tasa} hoy={hoyVE()} />
          <Simulador tarifa={tarifaVigente} rutas={rutas} tasa={tasa} />
        </div>

        <div className="lg:col-span-7">
          <HistorialTarifasTable tarifas={historialTarifas} />
        </div>
      </div>
    </div>
  );
}
