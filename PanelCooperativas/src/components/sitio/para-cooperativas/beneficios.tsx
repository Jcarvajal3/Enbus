import {
  Armchair,
  DeviceMobile,
  HandCoins,
  Package,
  QrCode,
  WifiSlash,
} from "@phosphor-icons/react/dist/ssr";

import { EncabezadoSeccion } from "@/components/sitio/ui/encabezado";
import estilos from "./secciones.module.css";

const BENEFICIOS = [
  {
    Icono: DeviceMobile,
    tono: "",
    titulo: "Vende también por la app",
    texto: "Más pasajeros te encuentran: buscan su ruta en EnBus y ven tus salidas junto a las de otras cooperativas.",
  },
  {
    Icono: Armchair,
    tono: "s-icono--sol",
    titulo: "Un solo mapa de asientos",
    texto: "La taquilla y la app venden sobre el mismo mapa. Un puesto nunca se vende dos veces.",
  },
  {
    Icono: HandCoins,
    tono: "s-icono--ok",
    titulo: "El dinero llega a tus cuentas",
    texto: "Los pasajeros pagan directo a ti y tú verificas cada referencia antes de confirmar el boleto.",
  },
  {
    Icono: Package,
    tono: "s-icono--coral",
    titulo: "Encomiendas con orden",
    texto: "Guía, foto del paquete, código de seguimiento y entrega con cédula y PIN.",
  },
  {
    Icono: QrCode,
    tono: "",
    titulo: "Embarque rápido",
    texto: "Escaneas el QR del pase del pasajero y validas el puesto al instante.",
  },
  {
    Icono: WifiSlash,
    tono: "s-icono--noche",
    titulo: "Aguanta la mala conexión",
    texto: "Si el internet falla, puedes seguir escaneando y consultando en modo sin conexión.",
  },
] as const;

export function Beneficios() {
  return (
    <section id="beneficios" className="s-seccion s-seccion--papel" aria-labelledby="coop-beneficios">
      <div className="s-marco">
        <EncabezadoSeccion
          id="coop-beneficios"
          etiqueta="Lo que gana tu cooperativa"
          titulo="Más ventas, menos desorden en el terminal"
          bajada="Trabajas como siempre. EnBus se encarga de que lo que vendes en taquilla y en la app esté en el mismo lugar."
        />
        <ul className={estilos.rejilla3}>
          {BENEFICIOS.map(({ Icono, tono, titulo, texto }, i) => (
            <li key={titulo} className={`s-tarjeta ${estilos.tarjeta}`} data-revelar style={{ "--d": i % 3 } as React.CSSProperties}>
              <span className={`s-icono ${tono}`}>
                <Icono weight="regular" aria-hidden="true" />
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
