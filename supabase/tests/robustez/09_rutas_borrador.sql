-- Rutas en borrador (20261123000002_rutas_borrador_sin_duracion.sql): una ruta inactiva puede no
-- tener duración; una activa, no. Como el resto: dentro de BEGIN … ROLLBACK, no deja rastro.
BEGIN;
\i 00_fixtures.sql

-- Inactiva y sin duración: se puede crear.
INSERT INTO resultados (r) SELECT pg_temp.afirma(
  (WITH nueva AS (
     INSERT INTO public.rutas (cooperativa_id, estado_origen, ciudad_origen, estado_destino, ciudad_destino,
                               duracion_estimada_min, precio_pasaje, activa)
     VALUES ((SELECT v FROM fx WHERE k = 'COOP_A'), 'merida', 'merida', 'lara', 'barquisimeto', NULL, 25, false)
     RETURNING id)
   SELECT count(*) = 1 FROM nueva),
  'una ruta inactiva se crea sin duración');

-- Activa y sin duración: no.
INSERT INTO resultados (r) SELECT pg_temp.espera_error('23514',
  $q$INSERT INTO public.rutas (cooperativa_id, estado_origen, ciudad_origen, estado_destino, ciudad_destino,
                               duracion_estimada_min, precio_pasaje, activa)
     VALUES ((SELECT v FROM fx WHERE k = 'COOP_A'), 'merida', 'merida', 'portuguesa', 'guanare', NULL, 17, true)$q$);

-- Activar una ruta sin duración: no. Con duración: sí.
INSERT INTO resultados (r) SELECT pg_temp.espera_error('23514',
  $q$UPDATE public.rutas SET activa = true
      WHERE cooperativa_id = (SELECT v FROM fx WHERE k = 'COOP_A') AND ciudad_destino = 'barquisimeto'$q$);
UPDATE public.rutas SET duracion_estimada_min = 540, activa = true
 WHERE cooperativa_id = (SELECT v FROM fx WHERE k = 'COOP_A') AND ciudad_destino = 'barquisimeto';
INSERT INTO resultados (r) SELECT pg_temp.afirma(
  (SELECT activa AND duracion_estimada_min = 540 FROM public.rutas
    WHERE cooperativa_id = (SELECT v FROM fx WHERE k = 'COOP_A') AND ciudad_destino = 'barquisimeto'),
  'con duración, la ruta se activa');

-- Quitar la duración a una ruta activa: no. La duración 0 o negativa, tampoco.
INSERT INTO resultados (r) SELECT pg_temp.espera_error('23514',
  $q$UPDATE public.rutas SET duracion_estimada_min = NULL WHERE id = (SELECT v FROM fx WHERE k = 'RUTA_A')$q$);
INSERT INTO resultados (r) SELECT pg_temp.espera_error('23514',
  $q$UPDATE public.rutas SET duracion_estimada_min = 0 WHERE id = (SELECT v FROM fx WHERE k = 'RUTA_A')$q$);

SELECT string_agg(r, E'\n' ORDER BY n) AS resultado FROM resultados;
ROLLBACK;
