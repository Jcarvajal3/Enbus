import Link from "next/link";
import { ArrowRight } from "@phosphor-icons/react/dist/ssr";

import { RUTAS_PANEL } from "@/lib/sitio/urls";
import { MaquetaPanel } from "./maqueta-panel";
import estilos from "./hero.module.css";

/** Hero B2B: único H1 de la página, CTA de registro y maqueta del panel. */
export function Hero() {
  return (
    <section className={estilos.hero} aria-labelledby="coop-titulo">
      <div className={`s-marco ${estilos.rejilla}`}>
        <div className={estilos.texto}>
          <span className="s-chip s-chip--cielo">EnBus para cooperativas</span>
          <h1 id="coop-titulo" className="s-titulo-1">
            Vende pasajes y encomiendas en línea, sin cambiar tu forma de trabajar
          </h1>
          <p className="s-bajada">
            Un solo panel para tu taquilla y para la app de EnBus. Tus pasajeros te encuentran, eligen su asiento y te
            pagan directo. Tú verificas, despachas y embarcas.
          </p>
          <div className={estilos.acciones}>
            <Link href={RUTAS_PANEL.registro} className="s-boton s-boton--sol s-boton--lg">
              Registrar mi cooperativa
              <ArrowRight weight="bold" aria-hidden="true" />
            </Link>
            <Link href={RUTAS_PANEL.login} className="s-boton s-boton--claro s-boton--lg">
              Entrar al panel
            </Link>
          </div>
          <p className={estilos.nota}>Registrarse no tiene costo. Revisamos tu solicitud y te avisamos.</p>
        </div>
        <div className={estilos.visual}>
          <MaquetaPanel />
        </div>
      </div>
    </section>
  );
}
