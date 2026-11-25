"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Buildings } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { limpiarBorradoresLocales } from "@/lib/borradores";
import { createClient } from "@/lib/supabase/client";
import { TarjetaAuth } from "./tarjeta-auth";
import estilos from "./auth.module.css";

/**
 * Una cuenta del panel de cooperativas no compra aquí. Explica y ofrece cerrar la sesión
 * (solo en este navegador) para entrar con una cuenta de pasajero. No redirige a nadie.
 */
export function AvisoCuentaPanel({ correo }: { correo: string | null }) {
  const router = useRouter();
  const [saliendo, setSaliendo] = useState(false);

  const cerrar = async () => {
    if (saliendo) return;
    setSaliendo(true);
    limpiarBorradoresLocales();
    try {
      await createClient().auth.signOut({ scope: "local" });
    } finally {
      // Con la sesión cerrada, /ingresar vuelve a mostrar el formulario.
      router.replace("/ingresar");
      router.refresh();
    }
  };

  return (
    <TarjetaAuth titulo="Esta cuenta es del panel de cooperativas">
      <div className={estilos.estado}>
        <span className="s-icono s-icono--sol">
          <Buildings aria-hidden />
        </span>
        <p>
          {correo ? (
            <>
              Entraste con <strong>{correo}</strong>, una cuenta del panel. Para comprar boletos o enviar encomiendas
              usa una cuenta de pasajero.
            </>
          ) : (
            "Para comprar boletos o enviar encomiendas usa una cuenta de pasajero."
          )}
        </p>
      </div>
      <Button size="lg" className="w-full" onClick={cerrar} disabled={saliendo} aria-busy={saliendo || undefined}>
        {saliendo && <Spinner size="sm" aria-hidden />}
        Cerrar sesión
      </Button>
    </TarjetaAuth>
  );
}
