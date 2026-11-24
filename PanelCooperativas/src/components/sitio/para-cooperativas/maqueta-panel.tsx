import {
  CalendarBlank,
  ChartBar,
  HandCoins,
  Package,
  Receipt,
  Ticket,
  TruckTrailer,
  UserCheck,
} from "@phosphor-icons/react/dist/ssr";

import estilos from "./maqueta-panel.module.css";

type Puesto = "libre" | "taquilla" | "app";

// 10 filas x 4 puestos (2 + pasillo + 2). Maqueta fija: no son datos reales.
const VENDIDOS_TAQUILLA = new Set([0, 1, 5, 6, 10, 14, 17, 22, 25, 31, 36]);
const VENDIDOS_APP = new Set([2, 4, 8, 9, 12, 13, 19, 20, 27, 28, 33, 38]);
const PUESTOS: Puesto[] = Array.from({ length: 40 }, (_, i) =>
  VENDIDOS_TAQUILLA.has(i) ? "taquilla" : VENDIDOS_APP.has(i) ? "app" : "libre",
);

const MENU = [
  { nombre: "Resumen", Icono: ChartBar, activo: false },
  { nombre: "Taquilla", Icono: Ticket, activo: true },
  { nombre: "Encomiendas", Icono: Package, activo: false },
  { nombre: "Despacho", Icono: TruckTrailer, activo: false },
  { nombre: "Embarque", Icono: UserCheck, activo: false },
  { nombre: "Viajes", Icono: CalendarBlank, activo: false },
] as const;

/** Maqueta HTML/CSS del panel de la cooperativa (decorativa, no son datos reales). */
export function MaquetaPanel() {
  return (
    <div
      className={estilos.marco}
      role="img"
      aria-label="Maqueta del panel de EnBus: mapa de asientos de un viaje con puestos vendidos en taquilla y por la app, y un pago por verificar."
    >
      <div className={estilos.barra} aria-hidden="true">
        <span className={estilos.punto} />
        <span className={estilos.punto} />
        <span className={estilos.punto} />
        <span className={estilos.direccion}>Panel de la cooperativa</span>
      </div>
      <div className={estilos.cuerpo} aria-hidden="true">
        <nav className={estilos.lateral}>
          {MENU.map(({ nombre, Icono, activo }) => (
            <span key={nombre} className={`${estilos.item} ${activo ? estilos.itemActivo : ""}`}>
              <Icono weight="regular" />
              {nombre}
            </span>
          ))}
          <span className={estilos.item}>
            <Receipt weight="regular" />
            Pagos
            <b className={estilos.contador}>1</b>
          </span>
        </nav>

        <div className={estilos.contenido}>
          <div className={estilos.cabeza}>
            <div>
              <p className={estilos.titulo}>Taquilla de boletos</p>
              <p className={estilos.sub}>Salida de hoy, 8:00 p. m.</p>
            </div>
            <span className="s-chip s-chip--ok">Venta abierta</span>
          </div>

          <div className={estilos.rejilla}>
            <div className={estilos.mapa}>
              <div className={estilos.puestos}>
                {PUESTOS.map((estado, i) => (
                  <span
                    key={i}
                    className={`${estilos.puesto} ${estado === "taquilla" ? estilos.taquilla : estado === "app" ? estilos.app : ""} ${i % 4 === 1 ? estilos.pasillo : ""}`}
                  />
                ))}
              </div>
              <div className={estilos.leyenda}>
                <span>
                  <i className={`${estilos.muestra} ${estilos.taquilla}`} /> Taquilla
                </span>
                <span>
                  <i className={`${estilos.muestra} ${estilos.app}`} /> App
                </span>
                <span>
                  <i className={estilos.muestra} /> Libre
                </span>
              </div>
            </div>

            <div className={estilos.pago}>
              <span className="s-chip s-chip--sol">
                <HandCoins weight="regular" /> Pago por verificar
              </span>
              <p className={estilos.pagoMetodo}>Pago Móvil</p>
              <p className={estilos.pagoRef}>Ref 0412…</p>
              <div className={estilos.acciones}>
                <span className={estilos.confirmar}>Confirmar</span>
                <span className={estilos.rechazar}>Revisar</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
