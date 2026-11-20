import type { Metadata } from "next";
import { CobrarReservaPagina } from "@/components/boletos/venta/cobrar-reserva-pagina";

export const metadata: Metadata = { title: "Cobrar reserva" };

function primero(valor: string | string[] | undefined): string | null {
  const v = Array.isArray(valor) ? valor[0] : valor;
  return v ? v : null;
}

// Cobro en taquilla de una reserva hecha en la app. Next 16: `params` y `searchParams` son promesas.
export default async function CobrarReservaPage({
  params,
  searchParams,
}: {
  params: Promise<{ compraId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { compraId } = await params;
  const volver = primero((await searchParams).volver);
  return <CobrarReservaPagina compraId={compraId} volver={volver === "embarque" ? "embarque" : null} />;
}
