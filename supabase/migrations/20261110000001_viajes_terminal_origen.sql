-- Terminal de salida de cada viaje.
--   El administrador de la cooperativa lo elige al programar el viaje (panel → Viajes) entre los
--   terminales y paradas del catálogo compartido (shared/ve.ts → TERMINALES_VE): los de la ciudad
--   de origen de la ruta y los demás de su estado. Se guarda el nombre legible
--   ("Terminal La Bandera") para que la app lo muestre tal cual en la búsqueda, sin depender de
--   la versión del catálogo que tenga el teléfono.
--   Opcional: los viajes ya programados y las ciudades sin terminal quedan en NULL.
--   Lo escribe el INSERT del panel (proteger_viajes_cliente_fn no lo toca) y lo lee la app con
--   el resto de la fila (viajes no tiene permisos por columna).
-- Re-ejecutable.
BEGIN;

ALTER TABLE public.viajes ADD COLUMN IF NOT EXISTS terminal_origen text;

-- Mismo largo que TERMINAL_MAX de shared/ve.ts; vacío o solo espacios no vale (es NULL).
ALTER TABLE public.viajes DROP CONSTRAINT IF EXISTS viajes_terminal_origen_valido;
ALTER TABLE public.viajes ADD CONSTRAINT viajes_terminal_origen_valido
  CHECK (terminal_origen IS NULL OR char_length(btrim(terminal_origen)) BETWEEN 1 AND 120);

COMMENT ON COLUMN public.viajes.terminal_origen IS
  'Terminal o parada de salida (nombre legible del catálogo TERMINALES_VE de shared/ve.ts); NULL si no se indicó.';

COMMIT;
