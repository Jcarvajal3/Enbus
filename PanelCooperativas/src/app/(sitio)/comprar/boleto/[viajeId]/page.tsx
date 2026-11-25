import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { CompraBoleto } from "@/components/pasajero/compra-boleto/compra-boleto";
import { SalidaNoDisponible } from "@/components/pasajero/compra-boleto/salida-no-disponible";
import { leerMetodosPago, leerTasaVigente } from "@/lib/pasajero/pagos";
import { urlComprarBoleto } from "@/lib/pasajero/rutas";
import { exigirPasajero } from "@/lib/pasajero/sesion";
import { viajePublico } from "@/lib/pasajero/viajes";
import { fechaVE } from "@/lib/ve.generated";

export const metadata: Metadata = {
  title: "Comprar boleto",
  description: "Elige tus asientos, indica quién viaja y paga tu boleto de bus.",
  robots: { index: false, follow: false },
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ComprarBoletoPage({ params }: { params: Promise<{ viajeId: string }> }) {
  const { viajeId } = await params;
  if (!UUID.test(viajeId)) notFound();

  // Sin sesión → /ingresar?next=… (el proxy ya lo hace; esto cubre el acceso directo). Cuenta del panel → aviso.
  const pasajero = await exigirPasajero(urlComprarBoleto(viajeId));

  const viaje = await viajePublico(viajeId);
  if (!viaje) notFound();
  if (!viaje.vendible) {
    return <SalidaNoDisponible origen={viaje.origen} destino={viaje.destino} fecha={fechaVE(viaje.salida)} />;
  }

  const [metodos, tasa] = await Promise.all([leerMetodosPago(viaje.cooperativa.id), leerTasaVigente()]);

  return (
    <CompraBoleto
      viaje={viaje}
      metodos={metodos}
      tasa={tasa}
      comprador={{
        nombre: pasajero.nombre,
        cedula: pasajero.cedula,
        telefono: pasajero.telefono,
        perfilCompleto: pasajero.perfilCompleto,
      }}
    />
  );
}
