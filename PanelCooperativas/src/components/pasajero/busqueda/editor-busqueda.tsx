"use client";

import { useState, type ReactNode } from "react";
import { PencilSimple, X } from "@phosphor-icons/react";

import s from "./editor-busqueda.module.css";

/**
 * Cabecera de /viajes: título de la ruta y el buscador. En móvil el buscador se pliega tras
 * un botón "Cambiar" para que lo primero que se vea sean las salidas; en escritorio siempre
 * está abierto (lo decide el CSS, así no hay salto al hidratar).
 */
export function EditorBusqueda({ titulo, children }: { titulo: ReactNode; children: ReactNode }) {
  const [abierto, setAbierto] = useState(false);

  return (
    <div className={s.editor} data-abierto={abierto ? "true" : undefined}>
      <div className={s.cabeza}>
        <div className={s.titulo}>{titulo}</div>
        <button
          type="button"
          className={s.alternar}
          aria-expanded={abierto}
          aria-controls="editor-busqueda"
          onClick={() => setAbierto((v) => !v)}
        >
          {abierto ? <X aria-hidden weight="bold" /> : <PencilSimple aria-hidden weight="bold" />}
          {abierto ? "Cerrar" : "Cambiar"}
        </button>
      </div>
      <div id="editor-busqueda" className={s.formulario}>
        {children}
      </div>
    </div>
  );
}
