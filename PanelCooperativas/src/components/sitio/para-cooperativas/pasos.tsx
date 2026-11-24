import { EncabezadoSeccion } from "@/components/sitio/ui/encabezado";
import estilos from "./secciones.module.css";

const PASOS = [
  { titulo: "Envía tu solicitud", texto: "Llenas los datos de tu cooperativa y del administrador. Toma pocos minutos." },
  { titulo: "EnBus la revisa", texto: "Verificamos tu cooperativa y la aprobamos. Te avisamos cuando esté lista." },
  {
    titulo: "Configuras tu operación",
    texto: "Cargas rutas, buses, métodos de pago y empleados desde el panel.",
  },
  { titulo: "Empiezas a vender", texto: "Vendes en taquilla y en la app, sobre el mismo mapa de asientos." },
] as const;

export function Pasos() {
  return (
    <section id="como-empezar" className="s-seccion s-seccion--papel" aria-labelledby="coop-pasos">
      <div className="s-marco">
        <EncabezadoSeccion id="coop-pasos" etiqueta="Cómo empezar" titulo="De la solicitud a tu primera venta en 4 pasos" />
        <ol className={estilos.pasos}>
          {PASOS.map(({ titulo, texto }, i) => (
            <li key={titulo} className={estilos.paso} data-revelar style={{ "--d": i } as React.CSSProperties}>
              <span className={`${estilos.numero} s-num`} aria-hidden="true">
                {i + 1}
              </span>
              <h3>
                <span className="sr-only">Paso {i + 1}: </span>
                {titulo}
              </h3>
              <p>{texto}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
