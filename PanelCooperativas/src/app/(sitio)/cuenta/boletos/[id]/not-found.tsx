import Link from "next/link";
import { Ticket } from "@phosphor-icons/react/dist/ssr";
import { EstadoVacio } from "@/components/pasajero/cuenta/piezas";
import { RUTAS_PASAJERO } from "@/lib/pasajero/rutas";

export default function BoletoNoEncontrado() {
  return (
    <EstadoVacio
      icono={<Ticket size={28} />}
      titulo="Boleto no encontrado"
      acciones={
        <Link href={RUTAS_PASAJERO.misBoletos} className="s-boton s-boton--tinta">
          Ir a Mis boletos
        </Link>
      }
    >
      Puede ser de otra cuenta o tener un error en el enlace.
    </EstadoVacio>
  );
}
