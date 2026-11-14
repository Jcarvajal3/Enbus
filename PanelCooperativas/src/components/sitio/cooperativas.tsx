"use client";

import Image from "next/image";
import Link from "next/link";
import { useId, useState, type KeyboardEvent } from "react";

import { RUTAS_PANEL } from "@/lib/sitio/urls";
import { FOTOS } from "./fotos";

const PESTANAS = [
  {
    clave: "taquilla",
    nombre: "Taquilla",
    texto:
      "Vendes en la taquilla y en la app sobre el mismo mapa de asientos, así un puesto nunca se vende dos veces. Imprimes el boleto y, al embarcar, escaneas el QR del pase.",
  },
  {
    clave: "encomiendas",
    nombre: "Encomiendas",
    texto:
      "Recibes, pesas y despachas paquetes con su guía impresa. La oficina de destino entrega con cédula y PIN, y el cliente recibe un aviso en cada cambio.",
  },
  {
    clave: "pagos",
    nombre: "Pagos",
    texto:
      "Los pasajeros te pagan directo a tus cuentas: Pago Móvil, transferencia, Zelle o efectivo. Tú verificas cada referencia antes de confirmar el boleto.",
  },
] as const;

/** Para las cooperativas: la placa cuadrada del andén y el panel en tres pestañas. */
export function Cooperativas() {
  const [activa, setActiva] = useState(0);
  const id = useId();

  // Flechas izquierda/derecha entre pestañas (patrón de pestañas de WAI-ARIA).
  const teclas = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const siguiente = (activa + (e.key === "ArrowRight" ? 1 : PESTANAS.length - 1)) % PESTANAS.length;
    setActiva(siguiente);
    document.getElementById(`${id}-tab-${siguiente}`)?.focus();
  };

  return (
    <section id="cooperativas" className="s-coop" aria-labelledby={`${id}-titulo`}>
      <div className="s-coop__rejilla">
        <div className="s-coop__placa">
          <figure className="s-coop__foto" data-revelar>
            <Image
              src={FOTOS.terminalMerida}
              alt="Andenes cubiertos del terminal de Mérida, con pasajeros sentados y busetas de cooperativas esperando la salida"
              fill
              sizes="(max-width: 900px) 100vw, 50vw"
              placeholder="blur"
            />
          </figure>
        </div>

        <div className="s-coop__texto">
          <div className="s-pestanas" role="tablist" aria-label="Lo que hace el panel">
            {PESTANAS.map((p, i) => (
              <button
                key={p.clave}
                id={`${id}-tab-${i}`}
                type="button"
                role="tab"
                aria-selected={i === activa}
                aria-controls={`${id}-panel`}
                tabIndex={i === activa ? 0 : -1}
                onClick={() => setActiva(i)}
                onKeyDown={teclas}
              >
                {p.nombre}
              </button>
            ))}
          </div>

          <div className="s-coop__cuerpo">
            <h2 id={`${id}-titulo`} data-revelar>
              Tu cooperativa, en línea
            </h2>
            <p id={`${id}-panel`} role="tabpanel" aria-labelledby={`${id}-tab-${activa}`} aria-live="polite">
              {PESTANAS[activa].texto}
            </p>
          </div>

          <div className="s-coop__acciones">
            <Link href={RUTAS_PANEL.registro}>Registrar mi cooperativa</Link>
            <Link href={RUTAS_PANEL.login}>Ya tengo cuenta</Link>
          </div>
        </div>
      </div>
    </section>
  );
}
