import {
  Buildings,
  DownloadSimple,
  Handshake,
  MapTrifold,
  Package,
  Printer,
  QrCode,
  Receipt,
  Ticket,
  TruckTrailer,
} from "@phosphor-icons/react/dist/ssr";

import { EncabezadoSeccion } from "@/components/sitio/ui/encabezado";
import estilos from "./secciones.module.css";

const MODULOS = [
  { Icono: Ticket, nombre: "Taquilla de boletos", texto: "Vende y imprime boletos sobre el mapa de asientos." },
  { Icono: Package, nombre: "Taquilla de encomiendas", texto: "Recibe, pesa y entrega la guía con su código." },
  { Icono: TruckTrailer, nombre: "Despacho", texto: "Carga las encomiendas al bus que sale." },
  { Icono: QrCode, nombre: "Embarque", texto: "Escanea el QR del pase y deja subir a cada pasajero." },
  { Icono: DownloadSimple, nombre: "Recepción en destino", texto: "Registra lo que llega a tu oficina." },
  { Icono: Handshake, nombre: "Entrega con PIN", texto: "El paquete sale solo con cédula y PIN de 4 dígitos." },
  { Icono: Receipt, nombre: "Pagos y reembolsos", texto: "Verifica referencias y registra cada devolución." },
  { Icono: MapTrifold, nombre: "Rutas, horarios y buses", texto: "Define tus salidas, tus unidades y sus asientos." },
  { Icono: Buildings, nombre: "Empleados y sucursales", texto: "Administradores y taquilleros, cada quien con su acceso." },
] as const;

export function Modulos() {
  return (
    <section id="panel" className="s-seccion" aria-labelledby="coop-modulos">
      <div className="s-marco">
        <EncabezadoSeccion
          id="coop-modulos"
          etiqueta="El panel"
          titulo="Todo tu terminal en un panel"
          bajada="Funciona desde el navegador, en computadora, tablet o teléfono."
        />
        <ul className={estilos.rejilla3}>
          {MODULOS.map(({ Icono, nombre, texto }, i) => (
            <li key={nombre} className={estilos.modulo} data-revelar style={{ "--d": i % 3 } as React.CSSProperties}>
              <span className="s-icono s-icono--noche">
                <Icono weight="regular" aria-hidden="true" />
              </span>
              <div>
                <h3>{nombre}</h3>
                <p>{texto}</p>
              </div>
            </li>
          ))}
        </ul>
        <p className={estilos.nota}>
          <Printer weight="regular" aria-hidden="true" />
          Compatible con impresora térmica y lector de QR. Son opcionales: también puedes escanear con la cámara.
        </p>
      </div>
    </section>
  );
}
