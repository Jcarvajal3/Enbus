"use client";

import { useState } from "react";
import { GoogleLogo } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { createClient } from "@/lib/supabase/client";
import { urlCallback } from "./utils";
import estilos from "./auth.module.css";

interface Props {
  next: string | null;
  disabled?: boolean;
  /** Se llama si Google no pudo iniciarse (el aviso lo muestra quien lo usa). */
  onError: () => void;
  texto?: string;
}

/** "Continuar con Google": OAuth con retorno al callback del pasajero. */
export function BotonGoogle({ next, disabled, onError, texto = "Continuar con Google" }: Props) {
  const [cargando, setCargando] = useState(false);

  const iniciar = async () => {
    if (cargando || disabled) return;
    setCargando(true);
    try {
      const { error } = await createClient().auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: urlCallback(next) },
      });
      if (error) throw error;
    } catch {
      setCargando(false);
      onError();
    }
  };

  return (
    <>
      <div className={estilos.separador} aria-hidden>
        o
      </div>
      <Button
        type="button"
        variant="outline"
        size="lg"
        className="w-full"
        onClick={iniciar}
        disabled={disabled || cargando}
        aria-busy={cargando || undefined}
      >
        {cargando ? <Spinner size="sm" aria-hidden /> : <GoogleLogo aria-hidden />}
        {texto}
      </Button>
    </>
  );
}
