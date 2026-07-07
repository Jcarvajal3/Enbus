export const dynamic = "force-dynamic";

import { fetchTarifaVigente, fetchHistorialTarifas, fetchRutasParaSimulador } from "@/lib/data/admin-tarifas";
import { TarifaVigenteCard } from "@/components/admin/tarifas/tarifa-vigente-card";
import { CreateTarifaDialog } from "@/components/admin/tarifas/create-tarifa-dialog";
import { HistorialTarifasTable } from "@/components/admin/tarifas/historial-tarifas-table";
import { Simulador } from "@/components/admin/tarifas/simulador";

export default async function AdminTarifasPage() {
  // Fetch active tariff, historical tariffs, and active routes in parallel
  const [tarifaVigente, historialTarifas, rutas] = await Promise.all([
    fetchTarifaVigente(),
    fetchHistorialTarifas(),
    fetchRutasParaSimulador(),
  ]);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Tarifas</h1>
          <p className="text-muted-foreground mt-1 text-xs">
            Gestiona los costos por kilogramo y distancia, y simula envíos en tiempo real.
          </p>
        </div>
        <div>
          <CreateTarifaDialog />
        </div>
      </div>

      {/* Main Grid Content */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left Side: Active Tariff & Simulator */}
        <div className="lg:col-span-5 space-y-6">
          <TarifaVigenteCard tarifa={tarifaVigente} />
          <Simulador tarifa={tarifaVigente} rutas={rutas} />
        </div>

        {/* Right Side: Tariff History */}
        <div className="lg:col-span-7">
          <HistorialTarifasTable tarifas={historialTarifas} />
        </div>
      </div>
    </div>
  );
}
