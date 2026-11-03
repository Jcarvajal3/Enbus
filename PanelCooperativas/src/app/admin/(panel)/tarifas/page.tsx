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
import { TasaBCVCard } from "@/components/admin/dashboard/tasa-bcv-card";

export default async function AdminTarifasPage() {
  const [tarifaVigente, tarifaProgramada, historialTarifas, rutas, tasa] = await Promise.all([
    fetchTarifaVigente(),
    fetchTarifaProgramada(),
    fetchHistorialTarifas(),
    fetchRutasParaSimulador(),
    obtenerTasaBCV(),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tarifas"
        description="Precio de las encomiendas en USD de referencia (por kilo y por duración del viaje) y tasa BCV con la que se cobran en bolívares."
      >
        <CreateTarifaDialog vigente={tarifaVigente} rutas={rutas} />
      </PageHeader>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="space-y-6 lg:col-span-5">
          <TarifaVigenteCard tarifa={tarifaVigente} programada={tarifaProgramada} />
          <TasaBCVCard tasa={tasa} hoy={hoyVE()} variante="completa" />
          <Simulador tarifa={tarifaVigente} rutas={rutas} tasa={tasa} />
        </div>

        <div className="lg:col-span-7">
          <HistorialTarifasTable tarifas={historialTarifas} />
        </div>
      </div>
    </div>
  );
}
