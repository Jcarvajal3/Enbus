import Link from "next/link";
import { BusIcon } from "@phosphor-icons/react/dist/ssr";
import { urlViajes, RUTAS_PASAJERO } from "@/lib/pasajero/rutas";
import s from "./compra.module.css";

/** La salida ya no se vende (salió, se llenó, se canceló…): lleva a buscar otra de la misma ruta. */
export function SalidaNoDisponible({
  origen,
  destino,
  fecha,
  mensaje = "Puede que ya haya salido, que se haya llenado o que la cooperativa la haya retirado. Busca otra salida de la misma ruta.",
}: {
  origen: string;
  destino: string;
  fecha?: string | null;
  mensaje?: string;
}) {
  return (
    <div className={`s-marco`}>
      <section className={s.vacio} aria-labelledby="salida-no-disponible">
        <span className="s-icono s-icono--coral" aria-hidden>
          <BusIcon weight="bold" />
        </span>
        <h1 id="salida-no-disponible">Esta salida ya no está a la venta</h1>
        <p>{mensaje}</p>
        <div className={s.vacioAcciones}>
          <Link href={urlViajes({ origen, destino, fecha })} className="s-boton s-boton--sol s-boton--lg">
            Ver otras salidas
          </Link>
          <Link href={RUTAS_PASAJERO.inicio} className="s-boton s-boton--claro s-boton--lg">
            Ir al inicio
          </Link>
        </div>
      </section>
    </div>
  );
}
