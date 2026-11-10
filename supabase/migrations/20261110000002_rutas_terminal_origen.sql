-- Terminal de salida de cada ruta (reemplaza a viajes.terminal_origen de 20261110000001).
--   Una ruta sale casi siempre del mismo terminal, así que el administrador lo elige una vez al
--   crear o editar la ruta (panel → Rutas) entre los terminales y paradas del catálogo compartido
--   (shared/ve.ts → TERMINALES_VE): los de la ciudad de origen y los demás de su estado. Se guarda
--   el nombre legible ("Terminal La Bandera") para que la app lo muestre tal cual, sin depender de
--   la versión del catálogo que tenga el teléfono.
--   Opcional: las rutas existentes y las ciudades sin terminal quedan en NULL.
--   La app lo lee con el resto de la ruta (rutas no tiene permisos por columna).
--
-- viajes.terminal_origen deja de escribirse y de leerse: se pasa a la ruta el último terminal que
-- se indicó en uno de sus viajes y la columna queda sin uso (se puede borrar cuando ya no haya
-- versiones del panel que la escriban).
-- Re-ejecutable.
BEGIN;

ALTER TABLE public.rutas ADD COLUMN IF NOT EXISTS terminal_origen text;

-- Mismo largo que TERMINAL_MAX de shared/ve.ts; vacío o solo espacios no vale (es NULL).
ALTER TABLE public.rutas DROP CONSTRAINT IF EXISTS rutas_terminal_origen_valido;
ALTER TABLE public.rutas ADD CONSTRAINT rutas_terminal_origen_valido
  CHECK (terminal_origen IS NULL OR char_length(btrim(terminal_origen)) BETWEEN 1 AND 120);

COMMENT ON COLUMN public.rutas.terminal_origen IS
  'Terminal o parada de salida (nombre legible del catálogo TERMINALES_VE de shared/ve.ts); NULL si no se indicó.';

-- Rutas que aún no tienen terminal: el del viaje más reciente de esa ruta que lo indicó.
UPDATE public.rutas r
SET terminal_origen = v.terminal_origen
FROM (
  SELECT DISTINCT ON (ruta_id) ruta_id, btrim(terminal_origen) AS terminal_origen
  FROM public.viajes
  WHERE terminal_origen IS NOT NULL AND btrim(terminal_origen) <> ''
  ORDER BY ruta_id, created_at DESC
) v
WHERE r.id = v.ruta_id
  AND r.terminal_origen IS NULL;

COMMENT ON COLUMN public.viajes.terminal_origen IS
  'Sin uso desde 20261110000002: el terminal de salida está en rutas.terminal_origen.';

COMMIT;
