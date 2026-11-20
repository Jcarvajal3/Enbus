import type { Metadata } from "next";
import { VentaPagina } from "@/components/boletos/venta/venta-pagina";

export const metadata: Metadata = { title: "Vender boletos" };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function primero(valor: string | string[] | undefined): string | null {
  const v = Array.isArray(valor) ? valor[0] : valor;
  return v ? v : null;
}

// Venta de boletos en taquilla como página. `?viaje=<id>` preselecciona la salida y salta
// al paso de asientos (lo usa Embarque, con `?volver=embarque`). Next 16: `searchParams` es una promesa.
export default async function VenderBoletosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const viaje = primero(params.viaje);
  const volver = primero(params.volver);
  return (
    <VentaPagina
      viajeIdInicial={viaje && UUID_RE.test(viaje) ? viaje : null}
      volver={volver === "embarque" ? "embarque" : null}
    />
  );
}
