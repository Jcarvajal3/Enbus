import Image from "next/image";
import { CheckCircle, Receipt } from "@phosphor-icons/react/dist/ssr";

import { Buscador } from "@/components/pasajero/busqueda/buscador";
import { FOTOS } from "@/components/sitio/fotos";
import { fechaTasaCorta, formatNumeroVE, type TasaRef } from "@/lib/dinero.generated";
import type { CiudadesConSalidas } from "@/lib/pasajero/viajes";
import s from "./hero.module.css";

const GARANTIAS = ["Pagas directo a la cooperativa", "Reembolso del 95 % si cancelas", "Pase QR en tu teléfono"];

/**
 * Portada: titular corto y el buscador de pasajes y encomiendas, a la vista sin hacer scroll.
 * Es estática (ISR): no lee sesión; las ciudades vienen de la caché de salidas vigentes.
 */
export function Hero({ ciudades, tasa }: { ciudades: CiudadesConSalidas; tasa: TasaRef | null }) {
  const tasaOk = tasa && Number.isFinite(tasa.tasa) && tasa.tasa > 0 ? tasa : null;

  return (
    <section id="inicio" aria-labelledby="hero-titulo" className={s.hero}>
      <div className={s.marco}>
        <div className={s.fondo} aria-hidden>
          <Image
            src={FOTOS.llanosApure}
            alt=""
            fill
            priority
            placeholder="blur"
            sizes="(min-width: 1480px) 1440px, 100vw"
            className={s.foto}
          />
          <div className={s.velo} />
        </div>

        <div className={`s-marco ${s.cabeza}`}>
          {tasaOk && (
            <p className={s.tasa}>
              <Receipt aria-hidden />
              <span>
                Tasa BCV del {fechaTasaCorta(tasaOk.fecha)}:{" "}
                <strong className="s-num">Bs {formatNumeroVE(tasaOk.tasa)}</strong>
              </span>
            </p>
          )}
          <h1 id="hero-titulo" className={s.titulo}>
            Tu pasaje de bus, <em>sin colas</em>
          </h1>
          <p className={s.bajada}>Compara salidas, elige tu asiento y paga en bolívares a la tasa BCV.</p>
        </div>
      </div>

      <div className={`s-marco ${s.contenido}`}>
        <div id="buscador">
          <Buscador ciudades={ciudades} modo="hero" />
        </div>

        <ul className={s.garantias}>
          {GARANTIAS.map((g) => (
            <li key={g}>
              <CheckCircle weight="fill" aria-hidden />
              {g}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
