import type { TasaRef } from "@/lib/dinero.generated";
import { EncabezadoSeccion } from "../ui/encabezado";
import { Rastreador } from "./rastreo";
import estilos from "./encomiendas.module.css";

/** El costo se muestra en la app; se conserva la firma que usa la portada. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function Encomiendas(_props: { tasa: TasaRef | null }) {
  const pasos = [
    {
      titulo: "Créalo en la web o en la app",
      texto: "Dices qué envías y quién lo retira. Ves el costo estimado en bolívares y en dólares antes de salir de casa.",
    },
    {
      titulo: "Llévalo a la taquilla",
      texto: "Lo revisan, lo pesan y te dan la guía con tu código de seguimiento que empieza por EB.",
    },
    {
      titulo: "Viaja en el próximo bus",
      texto: "Sale en el siguiente viaje de la ruta y recibes un aviso en cada etapa.",
    },
    {
      titulo: "Retíralo con tu PIN",
      texto: "En destino piden cédula y PIN. Si nadie lo busca en 5 días hábiles, vuelve a la oficina de origen.",
    },
  ];

  return (
    <section id="encomiendas" className="s-seccion" aria-labelledby="titulo-encomiendas">
      <div className="s-marco">
        <EncabezadoSeccion
          id="titulo-encomiendas"
          tono="coral"
          etiqueta="Encomiendas"
          titulo="Envía paquetes en el bus, con seguimiento de verdad"
          bajada="Tu envío viaja con guía, seguro gratuito y aviso en cada etapa. Se retira con cédula y PIN."
        />

        <div className={estilos.recorrido} data-revelar>
        <h3 className="sr-only">Así funciona un envío</h3>
        <ol className={estilos.pasos}>
          {pasos.map((p, i) => (
            <li key={p.titulo} className={estilos.paso}>
              <span className={`${estilos.numero} s-num`} aria-hidden>
                {i + 1}
              </span>
              <h4>{p.titulo}</h4>
              <p>{p.texto}</p>
            </li>
          ))}
        </ol>
        </div>

        <div id="rastrear" className={estilos.panel} role="group" aria-labelledby="titulo-rastrear">
          <div className={estilos.panelTexto}>
            <div>
              <h3 id="titulo-rastrear" className={estilos.panelTitulo}>
                ¿Dónde va tu paquete?
              </h3>
              <p className={estilos.panelBajada}>
                Escribe el código de tu guía y mira en qué etapa está. No necesitas cuenta.
              </p>
            </div>
            <Rastreador />
          </div>
        </div>
      </div>
    </section>
  );
}
