import { Plus } from "@phosphor-icons/react/dist/ssr";

import { EncabezadoSeccion } from "@/components/sitio/ui/encabezado";
import estilos from "./secciones.module.css";

/** Texto plano: lo usan el acordeón y el JSON-LD (FAQPage). */
export const PREGUNTAS_COOPERATIVAS = [
  {
    pregunta: "¿Qué necesito para registrarme?",
    respuesta:
      "Los datos de tu cooperativa (nombre, RIF y teléfono de contacto), el nombre del representante legal y un correo y una contraseña para el administrador. También puedes contarnos qué rutas te interesan.",
  },
  {
    pregunta: "¿Cuánto tarda la aprobación?",
    respuesta:
      "Revisamos cada solicitud antes de aprobarla. Cuando esté lista, te avisamos y ya puedes configurar tu operación.",
  },
  {
    pregunta: "¿Puedo seguir vendiendo en taquilla?",
    respuesta:
      "Sí. La taquilla sigue igual, pero vende sobre el mismo mapa de asientos que la app. Así un puesto nunca se vende dos veces.",
  },
  {
    pregunta: "¿Necesito equipos especiales?",
    respuesta:
      "No. El panel funciona en el navegador. La impresora térmica y el lector de QR son opcionales; si no los tienes, puedes escanear con la cámara.",
  },
  {
    pregunta: "¿Quién recibe el dinero?",
    respuesta:
      "Tú. Los pasajeros pagan directo a tus cuentas (Pago Móvil, transferencia, Zelle o efectivo) y tú verificas cada referencia antes de confirmar el boleto.",
  },
] as const;

export function Preguntas() {
  return (
    <section id="preguntas" className="s-seccion" aria-labelledby="coop-preguntas">
      <div className="s-marco">
        <EncabezadoSeccion id="coop-preguntas" etiqueta="Preguntas" titulo="Preguntas de las cooperativas" />
        <div className={estilos.acordeon}>
          {PREGUNTAS_COOPERATIVAS.map(({ pregunta, respuesta }) => (
            <details key={pregunta} name="preguntas-coop" className={estilos.detalle}>
              <summary>
                {pregunta}
                <Plus weight="bold" aria-hidden="true" />
              </summary>
              <p>{respuesta}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
