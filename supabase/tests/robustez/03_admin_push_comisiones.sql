-- Super admin, comisiones, token push y tracking.
BEGIN;
\i 00_fixtures.sql
INSERT INTO fx VALUES ('SA', '784a5837-f802-4dcc-b99c-296fba9f6171');

-- RPC del super admin: solo el super admin.
SELECT pg_temp.como('AA');
INSERT INTO resultados (r) SELECT pg_temp.espera_error('EB_SIN_PERMISO',
  $q$SELECT * FROM public.fn_admin_totales_comision(current_date - 30, current_date)$q$);
INSERT INTO resultados (r) SELECT pg_temp.espera_error('EB_SIN_PERMISO', $q$SELECT public.fn_admin_dashboard_actividad(30)$q$);
RESET ROLE;
SELECT pg_temp.como('SA');
INSERT INTO resultados (r) SELECT pg_temp.afirma(
  jsonb_array_length(public.fn_admin_dashboard_actividad(30)->'actividad') = 30, 'dashboard con 30 días');
INSERT INTO resultados (r) SELECT pg_temp.afirma(
  (SELECT count(*) >= 0 FROM public.fn_admin_totales_comision(current_date - 30, current_date)), 'totales de comisión');
-- Ciclos de comisión solapados: el segundo choca (23P01).
INSERT INTO public.comisiones_ciclo (cooperativa_id, periodo_inicio, periodo_fin, comision_porcentaje, monto_comision)
VALUES ((SELECT v FROM fx WHERE k = 'COOP_A'), '2026-10-01', '2026-10-15', 5, 0);
INSERT INTO resultados (r) SELECT pg_temp.espera_error('23P01', format($q$
  INSERT INTO public.comisiones_ciclo (cooperativa_id, periodo_inicio, periodo_fin, comision_porcentaje, monto_comision)
  VALUES (%L, '2026-10-10', '2026-10-31', 5, 0)$q$, (SELECT v FROM fx WHERE k = 'COOP_A')));
RESET ROLE;

-- Una cuenta eliminada pierde sus permisos aunque siga en Auth.
UPDATE public.profiles SET eliminada_at = now() WHERE id = (SELECT v FROM fx WHERE k = 'SA');
SELECT pg_temp.como('SA');
INSERT INTO resultados (r) SELECT pg_temp.afirma(NOT public.is_super_admin(), 'super admin eliminado ya no es super admin');
INSERT INTO resultados (r) SELECT pg_temp.afirma((SELECT count(*) FROM public.boletos) = 0, 'y no lee boletos ajenos');
RESET ROLE;

-- Token push en un solo perfil.
SELECT pg_temp.como('P1');
UPDATE public.profiles SET expo_push_token = 'ExponentPushToken[prueba-robustez]' WHERE id = auth.uid();
RESET ROLE;
SELECT pg_temp.como('P2');
UPDATE public.profiles SET expo_push_token = 'ExponentPushToken[prueba-robustez]' WHERE id = auth.uid();
RESET ROLE;
INSERT INTO resultados (r) SELECT pg_temp.afirma(
  (SELECT count(*) FROM public.profiles WHERE expo_push_token = 'ExponentPushToken[prueba-robustez]') = 1
  AND (SELECT expo_push_token IS NULL FROM public.profiles WHERE id = (SELECT v FROM fx WHERE k = 'P1')),
  'el token queda solo en el último perfil que lo registró');

-- tracking_id: formato EB-AAMMDD-NNNNN con la fecha de Venezuela; rastreo público por código.
INSERT INTO public.encomiendas (tracking_id, sender_id, receiver_nombre, receiver_cedula_rif, receiver_telefono,
  estado_origen, ciudad_origen, estado_destino, ciudad_destino, descripcion_contenido, modalidad_pago, cooperativa_id)
SELECT 'X', (SELECT v FROM fx WHERE k = 'P1'), 'Ana Pérez', 'V-30111222', '0414-3011122', 'merida', 'merida',
       'distrito_capital', 'caracas', 'Prueba ' || g, 'ORIGEN', (SELECT v FROM fx WHERE k = 'COOP_A')
  FROM generate_series(1, 200) g;
INSERT INTO resultados (r) SELECT pg_temp.afirma(
  (SELECT bool_and(tracking_id ~ ('^EB-' || to_char(now() AT TIME ZONE 'America/Caracas', 'YYMMDD') || '-[0-9]{5}$'))
     AND count(DISTINCT tracking_id) = 200
     FROM public.encomiendas WHERE cooperativa_id = (SELECT v FROM fx WHERE k = 'COOP_A')),
  '200 tracking_id únicos con la fecha de Venezuela');
-- PIN: 200 encomiendas pasan a recepción; PIN de 4 dígitos sin exigir unicidad global.
UPDATE public.encomiendas SET estado = 'EN_RECEPCION' WHERE cooperativa_id = (SELECT v FROM fx WHERE k = 'COOP_A');
INSERT INTO resultados (r) SELECT pg_temp.afirma(
  (SELECT bool_and(pin_retiro ~ '^[0-9]{4}$') FROM public.encomiendas WHERE cooperativa_id = (SELECT v FROM fx WHERE k = 'COOP_A')),
  '200 PIN de 4 dígitos generados');
INSERT INTO resultados (r) SELECT pg_temp.afirma(
  (public.fn_rastrear_encomienda_publico(lower((SELECT min(tracking_id) FROM public.encomiendas
                                                 WHERE cooperativa_id = (SELECT v FROM fx WHERE k = 'COOP_A'))))->>'estado') = 'EN_RECEPCION',
  'rastreo público (en minúsculas) encuentra la encomienda');

SELECT string_agg(r, E'\n' ORDER BY n) AS resultado FROM resultados;
ROLLBACK;
