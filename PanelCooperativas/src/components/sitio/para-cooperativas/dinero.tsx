import { ArrowCounterClockwise, Bank, SealCheck } from "@phosphor-icons/react/dist/ssr";

import { EncabezadoSeccion } from "@/components/sitio/ui/encabezado";
import estilos from "./secciones.module.css";

const PUNTOS = [
  {
    Icono: Bank,
    titulo: "Te pagan directo",
    texto: "Los pasajeros pagan a tus cuentas con Pago Móvil, transferencia, Zelle o efectivo en taquilla.",
  },
  {
    Icono: SealCheck,
    titulo: "Tú verificas",
    texto: "Revisas cada referencia antes de confirmar el boleto. Nada se confirma sin tu visto bueno.",
  },
  {
    Icono: ArrowCounterClockwise,
    titulo: "Reembolsos con registro",
    texto: "Cuando toca devolver, lo registras en el panel y queda anotado.",
  },
] as const;

export function Dinero() {
  return (
    <section id="dinero" className="s-seccion s-seccion--noche" aria-labelledby="coop-dinero">
      <div className="s-marco">
        <EncabezadoSeccion
          id="coop-dinero"
          etiqueta="Tu dinero es tuyo"
          titulo="El dinero de tus pasajes va a tus cuentas"
          bajada="EnBus no recibe ni guarda el pago de tus boletos. Tú decides qué métodos aceptas y verificas cada pago."
        />
        <ul className={estilos.rejilla3}>
          {PUNTOS.map(({ Icono, titulo, texto }, i) => (
            <li key={titulo} className={estilos.puntoNoche} data-revelar style={{ "--d": i } as React.CSSProperties}>
              <span className="s-icono s-icono--noche" aria-hidden="true">
                <Icono weight="regular" />
              </span>
              <h3>{titulo}</h3>
              <p>{texto}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
