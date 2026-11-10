-- Terminal de llegada de cada ruta (par de rutas.terminal_origen de 20261110000002).
--   El administrador lo elige al crear o editar la ruta (panel → Rutas) entre los terminales y
--   paradas del catálogo compartido (shared/ve.ts → TERMINALES_VE): los de la ciudad de destino
--   y los demás de su estado. Se guarda el nombre legible ("Terminal La Bandera") para que la app
--   lo muestre tal cual ("Llega a …"), sin depender de la versión del catálogo del teléfono.
--   Opcional: las rutas existentes y las ciudades sin terminal quedan en NULL.
--   La app lo lee con el resto de la ruta (rutas no tiene permisos por columna).
-- Re-ejecutable.
BEGIN;

ALTER TABLE public.rutas ADD COLUMN IF NOT EXISTS terminal_destino text;

-- Mismo largo que TERMINAL_MAX de shared/ve.ts; vacío o solo espacios no vale (es NULL).
ALTER TABLE public.rutas DROP CONSTRAINT IF EXISTS rutas_terminal_destino_valido;
ALTER TABLE public.rutas ADD CONSTRAINT rutas_terminal_destino_valido
  CHECK (terminal_destino IS NULL OR char_length(btrim(terminal_destino)) BETWEEN 1 AND 120);

COMMENT ON COLUMN public.rutas.terminal_destino IS
  'Terminal o parada de llegada (nombre legible del catálogo TERMINALES_VE de shared/ve.ts); NULL si no se indicó.';

COMMIT;
