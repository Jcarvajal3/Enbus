export const dynamic = "force-dynamic";

import { fetchHistorialTasasBCV } from "@/lib/data/admin-tasa-bcv";
import { obtenerTasaBCV } from "@/lib/tasa-bcv";
import { hoyVE } from "@/lib/fechas";
import { PageHeader } from "@/components/page-header";
import { TasaBCVCard } from "@/components/admin/tasa-bcv/tasa-bcv-card";
import { HistorialTasasBCVTable } from "@/components/admin/tasa-bcv/historial-tasas-table";

export default async function AdminTasaBCVPage() {
  const [tasa, historial] = await Promise.all([obtenerTasaBCV(), fetchHistorialTasasBCV()]);

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Tasa BCV"
        description="Tasa oficial usada para cobrar boletos y encomiendas en bolívares."
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="lg:col-span-5">
          <TasaBCVCard tasa={tasa} hoy={hoyVE()} />
        </div>

        <div className="lg:col-span-7">
          <HistorialTasasBCVTable tasas={historial} />
        </div>
      </div>
    </div>
  );
}
