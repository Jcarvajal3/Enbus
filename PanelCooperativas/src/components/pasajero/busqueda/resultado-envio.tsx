import Link from "next/link";
import { ArrowRight, Star } from "@phosphor-icons/react/dist/ssr";

import type { EstadoCotizacion } from "@/app/(sitio)/acciones";
import { fechaTasaCorta, formatBs, formatNumeroVE, formatUsd } from "@/lib/dinero.generated";
import { urlEnviar } from "@/lib/pasajero/rutas";
import { formatCiudad, formatDuracion } from "@/lib/ve.generated";
import s from "./buscador.module.css";

/** Respuesta del cotizador de encomiendas: una opción por cooperativa, de la más barata a la más cara. */
export function ResultadoEnvio({
  estado,
  origen,
  destino,
}: {
  estado: EstadoCotizacion;
  origen: string;
  destino: string;
}) {
  if (estado.tipo === "limite") {
    return (
      <p className={s.vacio} data-tono="error">
        Hiciste muchas cotizaciones seguidas. Intenta de nuevo en {estado.espera}.
      </p>
    );
  }
  if (estado.tipo === "no_disponible" || estado.tipo === "error" || estado.tipo === "invalido") {
    return (
      <p className={s.vacio} data-tono="error">
        No pudimos calcular el costo en este momento. Intenta de nuevo en unos minutos.
      </p>
    );
  }
  if (estado.tipo === "sin_opciones") {
    return (
      <p className={s.vacio}>
        Todavía ninguna cooperativa lleva encomiendas de {formatCiudad(origen)} a {formatCiudad(destino)}. Prueba con otra
        ruta.
      </p>
    );
  }

  return (
    <>
      <p className={s.resultadosTitulo}>
        {estado.opciones.length === 1 ? "1 cooperativa lleva" : `${estado.opciones.length} cooperativas llevan`} tu paquete de{" "}
        {formatNumeroVE(estado.pesoKg, estado.pesoKg % 1 === 0 ? 0 : 2)} kg de {formatCiudad(origen)} a{" "}
        {formatCiudad(destino)}
      </p>
      <ul className={s.opciones}>
        {estado.opciones.map((o) => (
          <li key={o.cooperativaId} className={s.opcionEnvio}>
            <p className={s.opcionEnvioNombre}>{o.cooperativa}</p>
            <p className={s.opcionEnvioMeta}>
              {o.calificacion !== null && o.calificacion > 0 && (
                <span>
                  <Star weight="fill" aria-hidden style={{ display: "inline", verticalAlign: "-2px" }} />{" "}
                  {formatNumeroVE(o.calificacion, 1)}
                </span>
              )}
              {o.duracionMin !== null && o.duracionMin > 0 && <span>Aprox. {formatDuracion(o.duracionMin)}</span>}
            </p>
            <p className={`${s.opcionEnvioPrecio} s-num`}>
              {o.costoBs !== null ? (
                <>
                  <strong>{formatBs(o.costoBs)}</strong>
                  <span>
                    ≈ {formatUsd(o.costoUsd)}
                    {estado.tasaFecha ? ` · BCV ${fechaTasaCorta(estado.tasaFecha)}` : ""}
                  </span>
                </>
              ) : (
                <>
                  <strong>{formatUsd(o.costoUsd)}</strong>
                  <span>Se paga en Bs a la tasa BCV del día</span>
                </>
              )}
            </p>
            <div className={s.opcionEnvioAccion}>
              <Link
                href={urlEnviar({ origen, destino, peso: estado.pesoKg })}
                className="s-boton s-boton--tinta s-boton--sm"
              >
                Enviar con {o.cooperativa}
                <ArrowRight aria-hidden weight="bold" />
              </Link>
            </div>
          </li>
        ))}
      </ul>
      <p className={s.aviso}>
        Es un estimado según el peso que escribiste. El costo final lo confirma la taquilla al pesar el paquete.
      </p>
    </>
  );
}
