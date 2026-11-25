"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowClockwiseIcon, WarningCircleIcon } from "@phosphor-icons/react";

import { RUTAS_PASAJERO } from "@/lib/pasajero/rutas";
import s from "@/components/pasajero/compra-boleto/compra.module.css";

// Error al preparar la compra. Nunca muestra el texto técnico: solo el código `digest` para
// cruzarlo con los registros del servidor. Tus asientos apartados (si los hay) no se pierden:
// al reintentar, la compra se retoma desde lo guardado en esta pestaña.
export default function ErrorCompra({
  error,
  unstable_retry,
  reset,
}: {
  error: Error & { digest?: string };
  /** Next.js 16: vuelve a pedir los datos y a renderizar la ruta. */
  unstable_retry?: () => void;
  reset: () => void;
}) {
  const [reintentando, setReintentando] = useState(false);

  useEffect(() => {
    console.error("[ComprarBoleto]", error);
  }, [error]);

  const reintentar = () => {
    setReintentando(true);
    (unstable_retry ?? reset)();
    window.setTimeout(() => setReintentando(false), 4000);
  };

  return (
    <div className="s-marco">
      <section className={s.vacio} role="alert" aria-labelledby="error-compra-titulo">
        <span className="s-icono s-icono--coral" aria-hidden>
          <WarningCircleIcon weight="bold" />
        </span>
        <h1 id="error-compra-titulo">No pudimos preparar tu compra</h1>
        <p>
          {error.digest ? (
            <>
              Si sigue pasando, avísanos con este código: <strong className="s-num">{error.digest}</strong>
            </>
          ) : (
            "Reintenta en unos segundos."
          )}
        </p>
        <div className={s.vacioAcciones}>
          <button
            type="button"
            className="s-boton s-boton--sol s-boton--lg"
            onClick={reintentar}
            disabled={reintentando}
            aria-busy={reintentando || undefined}
          >
            <ArrowClockwiseIcon aria-hidden weight="bold" />
            Reintentar
          </button>
          <Link href={RUTAS_PASAJERO.misBoletos} className="s-boton s-boton--claro s-boton--lg">
            Ver mis boletos
          </Link>
        </div>
      </section>
    </div>
  );
}
