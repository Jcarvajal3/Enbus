import Link from "next/link";
import { Package } from "@phosphor-icons/react/dist/ssr";
import { EstadoVacio } from "@/components/pasajero/cuenta/piezas";
import { RUTAS_PASAJERO } from "@/lib/pasajero/rutas";

export default function EncomiendaNoEncontrada() {
  return (
    <EstadoVacio
      icono={<Package size={28} />}
      titulo="Encomienda no encontrada"
      acciones={
        <Link href={RUTAS_PASAJERO.misEncomiendas} className="s-boton s-boton--tinta">
          Ir a Mis encomiendas
        </Link>
      }
    >
      Puede ser de otra cuenta o ya no estar disponible.
    </EstadoVacio>
  );
}
