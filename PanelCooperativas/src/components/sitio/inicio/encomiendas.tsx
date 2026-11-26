import { IdentificationCard, ShieldCheck, UsersThree, MapPinLine } from "@phosphor-icons/react/dist/ssr";

import type { TasaRef } from "@/lib/dinero.generated";
import { EncabezadoSeccion } from "../ui/encabezado";
import { Telefono } from "../ui/telefono";
import { Rastreador } from "./rastreo";
import estilos from "./encomiendas.module.css";


const BENEFICIOS = [
  {
    icono: ShieldCheck,
    titulo: "Seguro gratuito",
    texto: "Cubre la pérdida hasta 3 veces el valor declarado.",
  },
  {
    icono: MapPinLine,
    titulo: "Rastreo etapa por etapa",
    texto: "Lo sigues en la web con el código de la guía, sin crear cuenta.",
  },
  {
    icono: IdentificationCard,
    titulo: "Retiro seguro",
    texto: "Se entrega con cédula y un PIN de 4 dígitos.",
  },
  {
    icono: UsersThree,
    titulo: "Paga quien quiera",
    texto: "Paga quien envía o quien recibe, según prefieran.",
  },
] as const;

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
          bajada="Más fácil que llevar la caja al terminal y esperar una llamada: tu envío tiene guía, código y aviso en cada etapa."
        />

        <ul className={estilos.beneficios}>
          {BENEFICIOS.map(({ icono: Icono, titulo, texto }, i) => (
            <li key={titulo} className={estilos.beneficio} data-revelar style={{ ["--d" as string]: i }}>
              <span className="s-icono s-icono--coral" aria-hidden>
                <Icono />
              </span>
              <div>
                <h3>{titulo}</h3>
                <p>{texto}</p>
              </div>
            </li>
          ))}
        </ul>

        <div className={estilos.recorrido} data-revelar>
        <h3 className={estilos.subtitulo}>Así funciona un envío</h3>
        <ol className={estilos.pasos}>
          {pasos.map((p, i) => (
            <li key={p.titulo} className={estilos.paso}>
              <span className={`${estilos.numero} s-num`} aria-hidden>
                0{i + 1}
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
          <div className={estilos.panelMaqueta}>
            <Telefono ancho={236}>
              <div className={estilos.pantalla}>
                <p className={estilos.pantallaTitulo}>PIN de retiro</p>
                <div className={`${estilos.pin} s-num`}>
                  <span>4</span>
                  <span>8</span>
                  <span>2</span>
                  <span>7</span>
                </div>
                <p className={`${estilos.pantallaCodigo} s-num`}>EB-261113-04821</p>
                <span className="s-chip s-chip--ok">Lista para retirar</span>
              </div>
            </Telefono>
          </div>
        </div>
      </div>
    </section>
  );
}
