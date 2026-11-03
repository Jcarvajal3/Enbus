"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

// ─── Miga del objeto abierto (D15) ────────────────────────────────────────────
// Una página de detalle monta <MigaObjeto label="Expresos del Táchira" /> y la barra
// superior del shell dibuja "Sección › Expresos del Táchira" (la sección enlazada).
// Al desmontarse la página, la miga vuelve a "Grupo › Sección".

type Registro = { id: number; label: string };
type ContextoMiga = { registro: Registro | null; fijar(r: Registro | null, soloSiEs?: number): void };

const MigaContext = createContext<ContextoMiga | null>(null);
let siguienteId = 0;

/** Lo monta cada shell alrededor de su contenido. */
export function MigaObjetoProvider({ children }: { children: ReactNode }) {
  const [registro, setRegistro] = useState<Registro | null>(null);
  const [contexto] = useState<ContextoMiga>(() => ({
    registro: null,
    fijar: (r, soloSiEs) =>
      setRegistro((actual) => (soloSiEs === undefined || actual?.id === soloSiEs ? r : actual)),
  }));
  return <MigaContext.Provider value={{ ...contexto, registro }}>{children}</MigaContext.Provider>;
}

/** Etiqueta del objeto abierto, o null en una lista. */
export function useMigaObjeto(): string | null {
  return useContext(MigaContext)?.registro?.label ?? null;
}

/** Registra "Sección › {label}" en la barra superior mientras la página esté montada. */
export function MigaObjeto({ label }: { label: string }): null {
  const contexto = useContext(MigaContext);
  const fijar = contexto?.fijar;

  useEffect(() => {
    if (!fijar) return;
    const id = ++siguienteId;
    fijar({ id, label });
    // Solo limpia si sigue siendo la suya (otra página pudo registrarse antes de este cleanup).
    return () => fijar(null, id);
  }, [fijar, label]);

  return null;
}
