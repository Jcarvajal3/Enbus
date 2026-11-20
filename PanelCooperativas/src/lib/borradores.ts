// ─── Borradores locales de la pestaña ───────────────────────────────────────
// Los asistentes guardan lo escrito en `sessionStorage` bajo `enbus:<flujo>:*`
// para sobrevivir a una recarga. Contienen datos de personas (nombre, cédula,
// teléfono): al cerrar sesión se borran todos, aunque la pestaña siga abierta.

const PREFIJO_BORRADORES = "enbus:";

/** Borra todos los borradores locales (`enbus:*`). No lanza: sin almacenamiento no hay nada que borrar. */
export function limpiarBorradoresLocales(): void {
  try {
    const storage = window.sessionStorage;
    const claves: string[] = [];
    for (let i = 0; i < storage.length; i++) {
      const clave = storage.key(i);
      if (clave?.startsWith(PREFIJO_BORRADORES)) claves.push(clave);
    }
    for (const clave of claves) storage.removeItem(clave);
  } catch {
    // Almacenamiento no disponible (modo privado, bloqueado): no hay borradores.
  }
}
