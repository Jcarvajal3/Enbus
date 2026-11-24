-- Carga de rutas de "Transporte Barinas C.A" (una sola vez; se puede repetir sin duplicar).
--   Requiere antes la migración 20261123000002_rutas_borrador_sin_duracion.sql.
--   Las rutas quedan INACTIVAS y sin duración: todavía no se conoce. El administrador de la
--   cooperativa las completa en el panel (Rutas → editar) y solo entonces se pueden activar.
--   Precios en USD de referencia (el pasajero paga en Bs a la tasa BCV del día).
--
--   Claves de ciudad y estado como las guarda el panel (shared/ve.ts → normalizarCiudad):
--   minúsculas y sin tildes. Si la cooperativa no existe, no inserta nada y avisa.
BEGIN;

DO $$
DECLARE
  v_coop uuid;
  v_n    integer;
  r      record;
BEGIN
  SELECT id INTO v_coop
    FROM public.cooperativas
   WHERE lower(btrim(nombre)) = lower('Transporte Barinas C.A')
   LIMIT 1;

  IF v_coop IS NULL THEN
    RAISE EXCEPTION 'No existe la cooperativa "Transporte Barinas C.A": no se cargó ninguna ruta.';
  END IF;

  FOR r IN
    SELECT * FROM (VALUES
      ('merida', 'merida', 'lara',      'barquisimeto', 25.00),
      ('merida', 'merida', 'portuguesa', 'acarigua',    20.00),
      ('merida', 'merida', 'portuguesa', 'guanare',     17.00)
    ) AS t(estado_origen, ciudad_origen, estado_destino, ciudad_destino, precio_pasaje)
  LOOP
    -- Idempotente: si ya hay una ruta igual de esa cooperativa, no se vuelve a crear.
    IF NOT EXISTS (
      SELECT 1 FROM public.rutas x
       WHERE x.cooperativa_id = v_coop
         AND public.normalizar_localidad(x.ciudad_origen)  = public.normalizar_localidad(r.ciudad_origen)
         AND public.normalizar_localidad(x.ciudad_destino) = public.normalizar_localidad(r.ciudad_destino)
    ) THEN
      INSERT INTO public.rutas (cooperativa_id, estado_origen, ciudad_origen, estado_destino, ciudad_destino,
                                duracion_estimada_min, precio_pasaje, activa)
      VALUES (v_coop, r.estado_origen, r.ciudad_origen, r.estado_destino, r.ciudad_destino,
              NULL, r.precio_pasaje, false);
      v_n := coalesce(v_n, 0) + 1;
    END IF;
  END LOOP;

  RAISE NOTICE 'Rutas nuevas para Transporte Barinas C.A: %', coalesce(v_n, 0);
END $$;

-- Comprobación: las tres, inactivas y sin duración.
SELECT r.ciudad_origen, r.ciudad_destino, r.precio_pasaje, r.duracion_estimada_min, r.activa
  FROM public.rutas r
  JOIN public.cooperativas c ON c.id = r.cooperativa_id
 WHERE lower(btrim(c.nombre)) = lower('Transporte Barinas C.A')
 ORDER BY r.precio_pasaje DESC;

COMMIT;
