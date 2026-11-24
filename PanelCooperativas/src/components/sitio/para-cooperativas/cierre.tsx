import Link from "next/link";
import { ArrowRight, EnvelopeSimple, WhatsappLogo } from "@phosphor-icons/react/dist/ssr";

import { RUTAS_PANEL, correoSoporte, soporteWhatsApp } from "@/lib/sitio/urls";
import estilos from "./secciones.module.css";

export function Cierre() {
  const whatsapp = soporteWhatsApp("Hola, quiero registrar mi cooperativa en EnBus.");
  const correo = correoSoporte();

  return (
    <section id="registro" className="s-seccion" aria-labelledby="coop-cierre">
      <div className="s-marco">
        <div className={estilos.cierre} data-revelar>
          <h2 id="coop-cierre">Lleva tu cooperativa a la app de EnBus</h2>
          <p>Registrarse no tiene costo. Envía tu solicitud y te avisamos cuando esté aprobada.</p>
          <div className={estilos.cierreAcciones}>
            <Link href={RUTAS_PANEL.registro} className="s-boton s-boton--sol s-boton--lg">
              Registrar mi cooperativa
              <ArrowRight weight="bold" aria-hidden="true" />
            </Link>
            <Link href={RUTAS_PANEL.login} className="s-boton s-boton--fantasma s-boton--lg">
              Entrar al panel
            </Link>
          </div>
          {(whatsapp || correo) && (
            <p className={estilos.contacto}>
              ¿Dudas? Escríbenos
              {whatsapp && (
                <a href={whatsapp} className="s-enlace" target="_blank" rel="noopener noreferrer">
                  <WhatsappLogo weight="regular" aria-hidden="true" /> WhatsApp
                </a>
              )}
              {correo && (
                <a href={`mailto:${correo}`} className="s-enlace">
                  <EnvelopeSimple weight="regular" aria-hidden="true" /> {correo}
                </a>
              )}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
