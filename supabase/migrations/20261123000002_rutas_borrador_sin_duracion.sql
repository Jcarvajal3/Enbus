-- Rutas en borrador: se pueden crear sin duración mientras estén inactivas.
--   Hasta ahora `duracion_estimada_min` era NOT NULL, así que no se podía cargar una ruta cuya
--   duración todavía no se conoce. Ahora puede ser NULL, pero SOLO en una ruta inactiva:
--   `chk_rutas_activa_completa` impide activar (o crear activa) una ruta sin duración.
--
--   Seguro para quien ya lee la columna: toda consulta que usa la duración (cotizar
--   encomiendas, programar viajes, rutas populares, v_viajes_disponibles, la app y la landing)
--   ya filtra `activa`, y la política RLS "Rutas visibles" oculta las inactivas a los pasajeros.
--   El panel (PanelCooperativas → Rutas) exige además el precio al activar.
-- Re-ejecutable.
BEGIN;

ALTER TABLE public.rutas ALTER COLUMN duracion_estimada_min DROP NOT NULL;

-- La duración, si existe, sigue siendo mayor que 0; el precio, si existe, no es negativo.
ALTER TABLE public.rutas DROP CONSTRAINT IF EXISTS chk_rutas_valores;
ALTER TABLE public.rutas ADD CONSTRAINT chk_rutas_valores
  CHECK ((duracion_estimada_min IS NULL OR duracion_estimada_min > 0)
         AND (precio_pasaje IS NULL OR precio_pasaje >= 0));

-- Una ruta activa tiene duración. Las filas actuales la cumplen (la columna era NOT NULL y > 0).
ALTER TABLE public.rutas DROP CONSTRAINT IF EXISTS chk_rutas_activa_completa;
ALTER TABLE public.rutas ADD CONSTRAINT chk_rutas_activa_completa
  CHECK (NOT activa OR duracion_estimada_min > 0);

COMMENT ON COLUMN public.rutas.duracion_estimada_min IS
  'Duración estimada en minutos. NULL solo en rutas inactivas (borrador): para activarla hay que indicarla.';

COMMIT;
