/* eslint-disable */
// PÁGINA TEMPORAL DE QA (W2-PANEL-MOSTRADOR): se borra al terminar.
export const dynamic = "force-dynamic";
import { PanelShell } from "@/components/panel-shell";
import { TasaBCVChip, TasaBCVProvider } from "@/components/tasa-bcv-provider";
import { ImpresoraChip } from "@/components/impresora-chip";
import { obtenerTasaBCV } from "@/lib/tasa-bcv";
import TaquillaBoletosPage from "@/app/cooperativas/(panel)/taquilla/boletos/page";
import TaquillaEncomiendasPage from "@/app/cooperativas/(panel)/taquilla/encomiendas/page";
import DespachoPage from "@/app/cooperativas/(panel)/despacho/page";
import RecepcionDestinoPage from "@/app/cooperativas/(panel)/recepcion-destino/page";
import EntregaPage from "@/app/cooperativas/(panel)/entrega/page";
import ImpresoraYLectorPage from "@/app/cooperativas/(panel)/hardware/page";
import { Demo } from "./demo";

const PAGINAS: Record<string, () => React.ReactNode> = {
  boletos: () => <TaquillaBoletosPage />,
  encomiendas: () => <TaquillaEncomiendasPage />,
  despacho: () => <DespachoPage />,
  recepcion: () => <RecepcionDestinoPage />,
  entrega: () => <EntregaPage />,
  hardware: () => <ImpresoraYLectorPage />,
};

export default async function Qa({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const s = sp.s ?? "boletos";
  const tasa = await obtenerTasaBCV().catch(() => null);
  const user = { id: "u", role: "admin_cooperativa" as const, nombre_completo: "Ana Rondón", cooperativa_id: "00000000-0000-0000-0000-000000000000", cooperativa_nombre: "Expresos del Táchira", cooperativa_estado: "ACTIVA", sucursal_nombre: "Terminal San Cristóbal" };
  return (
    <TasaBCVProvider tasaInicial={tasa}>
      <PanelShell user={user} menuAbierto={null} headerExtra={<><ImpresoraChip /><TasaBCVChip /></>}>
        {PAGINAS[s] ? PAGINAS[s]() : <Demo s={s} />}
      </PanelShell>
    </TasaBCVProvider>
  );
}
