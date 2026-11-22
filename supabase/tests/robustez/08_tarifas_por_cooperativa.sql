-- Tarifas por cooperativa: aislamiento, autorización, escrituras directas bloqueadas,
-- programación simultánea y cancelación aislada, cron por cooperativa, cotización privada y
-- pública, bloqueo de encomiendas sin tarifa, checklist y tasa BCV global.
BEGIN;
\i 00_fixtures.sql
INSERT INTO fx VALUES ('SA', '784a5837-f802-4dcc-b99c-296fba9f6171');

-- ─── 1. Escrituras directas bloqueadas (42501) ───────────────────────────────
SELECT pg_temp.como('AA');
INSERT INTO resultados (r) SELECT pg_temp.espera_error('42501', format($q$
  INSERT INTO public.tarifas (cooperativa_id, tarifa_por_kg, factor_distancia_por_min, dimensiones_max_cm, peso_max_kg, creada_por)
  VALUES (%L, 9.99, 0.001, 50, 25, %L)$q$, (SELECT v FROM fx WHERE k = 'COOP_A'), (SELECT v FROM fx WHERE k = 'AA')));
INSERT INTO resultados (r) SELECT pg_temp.espera_error('42501', format($q$
  UPDATE public.tarifas SET tarifa_por_kg = 9.99 WHERE cooperativa_id = %L$q$, (SELECT v FROM fx WHERE k = 'COOP_A')));
INSERT INTO resultados (r) SELECT pg_temp.espera_error('42501', format($q$
  DELETE FROM public.tarifas WHERE cooperativa_id = %L$q$, (SELECT v FROM fx WHERE k = 'COOP_A')));
RESET ROLE;

SELECT pg_temp.como('SA');
INSERT INTO resultados (r) SELECT pg_temp.espera_error('42501', format($q$
  INSERT INTO public.tarifas (cooperativa_id, tarifa_por_kg, factor_distancia_por_min, dimensiones_max_cm, peso_max_kg, creada_por)
  VALUES (%L, 9.99, 0.001, 50, 25, %L)$q$, (SELECT v FROM fx WHERE k = 'COOP_A'), (SELECT v FROM fx WHERE k = 'SA')));
INSERT INTO resultados (r) SELECT pg_temp.espera_error('42501',
  $q$UPDATE public.tarifas SET activa = false$q$);
RESET ROLE;

SELECT pg_temp.como('P1');
INSERT INTO resultados (r) SELECT pg_temp.espera_error('42501',
  $q$DELETE FROM public.tarifas$q$);
RESET ROLE;

-- ─── 2. RLS SELECT estricta en public.tarifas ───────────────────────────────
SELECT pg_temp.como('AA');
INSERT INTO resultados (r) SELECT pg_temp.afirma(
  (SELECT count(*) FROM public.tarifas WHERE cooperativa_id = (SELECT v FROM fx WHERE k = 'COOP_A')) = 1
  AND (SELECT count(*) FROM public.tarifas WHERE cooperativa_id IS DISTINCT FROM (SELECT v FROM fx WHERE k = 'COOP_A')) = 0,
  'AA solo ve las tarifas de COOP_A');
RESET ROLE;

SELECT pg_temp.como('AB');
INSERT INTO resultados (r) SELECT pg_temp.afirma(
  (SELECT count(*) FROM public.tarifas WHERE cooperativa_id = (SELECT v FROM fx WHERE k = 'COOP_B')) = 1
  AND (SELECT count(*) FROM public.tarifas WHERE cooperativa_id IS DISTINCT FROM (SELECT v FROM fx WHERE k = 'COOP_B')) = 0,
  'AB solo ve las tarifas de COOP_B');
RESET ROLE;

SELECT pg_temp.como('TA');
INSERT INTO resultados (r) SELECT pg_temp.afirma(
  (SELECT count(*) FROM public.tarifas WHERE cooperativa_id = (SELECT v FROM fx WHERE k = 'COOP_A')) = 1
  AND (SELECT count(*) FROM public.tarifas WHERE cooperativa_id IS DISTINCT FROM (SELECT v FROM fx WHERE k = 'COOP_A')) = 0,
  'TA solo ve las tarifas de COOP_A');
RESET ROLE;

SELECT pg_temp.como('P1');
INSERT INTO resultados (r) SELECT pg_temp.afirma(
  (SELECT count(*) FROM public.tarifas) = 0,
  'P1 (pasajero) no ve ninguna fila de public.tarifas');
RESET ROLE;

SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);
INSERT INTO resultados (r) SELECT pg_temp.afirma(
  (SELECT count(*) FROM public.tarifas) = 0,
  'anon no ve ninguna fila de public.tarifas');
RESET ROLE;

SELECT pg_temp.como('SA');
INSERT INTO resultados (r) SELECT pg_temp.afirma(
  (SELECT count(*) FROM public.tarifas
    WHERE cooperativa_id IN ((SELECT v FROM fx WHERE k = 'COOP_A'), (SELECT v FROM fx WHERE k = 'COOP_B'))) = 2,
  'SA ve las tarifas de todas las cooperativas');
RESET ROLE;

-- ─── 3. Autorización en fn_publicar_tarifa y fn_cancelar_tarifa_programada ──
SELECT pg_temp.como('P1');
INSERT INTO resultados (r) SELECT pg_temp.espera_error('EB_SIN_PERMISO',
  $q$SELECT public.fn_publicar_tarifa(2.50, 0.001, 50, 25)$q$);
RESET ROLE;

SELECT pg_temp.como('TA');
INSERT INTO resultados (r) SELECT pg_temp.espera_error('EB_SIN_PERMISO',
  $q$SELECT public.fn_publicar_tarifa(2.50, 0.001, 50, 25)$q$);
RESET ROLE;

SELECT pg_temp.como('SA');
INSERT INTO resultados (r) SELECT pg_temp.espera_error('EB_SIN_PERMISO',
  $q$SELECT public.fn_publicar_tarifa(2.50, 0.001, 50, 25)$q$);
RESET ROLE;

-- ─── 4. Programación simultánea, cancelación aislada y activación por cron ───
SELECT pg_temp.como('AA');
INSERT INTO fx (k, v)
SELECT 'PROG_A', (public.fn_publicar_tarifa(3.00, 0.0010, 60, 30, now() + interval '2 days', 'Programada A')->>'id')::uuid;
RESET ROLE;

SELECT pg_temp.como('AB');
INSERT INTO fx (k, v)
SELECT 'PROG_B', (public.fn_publicar_tarifa(5.00, 0.0020, 90, 45, now() + interval '2 days', 'Programada B')->>'id')::uuid;
RESET ROLE;

INSERT INTO resultados (r) SELECT pg_temp.afirma(
  (SELECT count(*) = 2 FROM public.tarifas
    WHERE id IN ((SELECT v FROM fx WHERE k = 'PROG_A'), (SELECT v FROM fx WHERE k = 'PROG_B'))
      AND NOT activa AND publicada_at IS NOT NULL AND reemplazada_at IS NULL),
  'COOP_A y COOP_B tienen una tarifa programada simultáneamente');

-- Aislamiento al cancelar: AA no puede cancelar PROG_B, AB no puede cancelar PROG_A.
SELECT pg_temp.como('AA');
INSERT INTO resultados (r) SELECT pg_temp.espera_error('EB_ESTADO_CAMBIO', format(
  $q$SELECT public.fn_cancelar_tarifa_programada(%L)$q$, (SELECT v FROM fx WHERE k = 'PROG_B')));
RESET ROLE;

SELECT pg_temp.como('TA');
INSERT INTO resultados (r) SELECT pg_temp.espera_error('EB_SIN_PERMISO', format(
  $q$SELECT public.fn_cancelar_tarifa_programada(%L)$q$, (SELECT v FROM fx WHERE k = 'PROG_A')));
RESET ROLE;

SELECT pg_temp.como('SA');
INSERT INTO resultados (r) SELECT pg_temp.espera_error('EB_SIN_PERMISO', format(
  $q$SELECT public.fn_cancelar_tarifa_programada(%L)$q$, (SELECT v FROM fx WHERE k = 'PROG_A')));
RESET ROLE;

SELECT pg_temp.como('AA');
INSERT INTO resultados (r) SELECT pg_temp.afirma(
  (public.fn_cancelar_tarifa_programada((SELECT v FROM fx WHERE k = 'PROG_A'))->>'estado') = 'CANCELADA',
  'AA cancela su tarifa programada');
RESET ROLE;

INSERT INTO resultados (r) SELECT pg_temp.afirma(
  (SELECT reemplazada_at IS NOT NULL AND NOT activa FROM public.tarifas WHERE id = (SELECT v FROM fx WHERE k = 'PROG_A'))
  AND (SELECT reemplazada_at IS NULL AND NOT activa FROM public.tarifas WHERE id = (SELECT v FROM fx WHERE k = 'PROG_B'))
  AND (SELECT activa AND tarifa_por_kg = 2.00 FROM public.tarifas WHERE cooperativa_id = (SELECT v FROM fx WHERE k = 'COOP_A') AND activa),
  'cancelar PROG_A deja intacta PROG_B y la tarifa vigente de COOP_A');

-- Reprogramar en COOP_A y simular vencimiento solo para COOP_A.
SELECT pg_temp.como('AA');
INSERT INTO fx (k, v)
SELECT 'PROG_A2', (public.fn_publicar_tarifa(2.50, 0.0010, 55, 28, now() + interval '1 day', 'Programada A2')->>'id')::uuid;
RESET ROLE;

UPDATE public.tarifas SET vigente_desde = now() - interval '1 minute'
 WHERE id = (SELECT v FROM fx WHERE k = 'PROG_A2');

SELECT public.fn_activar_tarifas_programadas();

INSERT INTO resultados (r) SELECT pg_temp.afirma(
  (SELECT activa AND id = (SELECT v FROM fx WHERE k = 'PROG_A2') FROM public.tarifas WHERE id = (SELECT v FROM fx WHERE k = 'PROG_A2'))
  AND (SELECT count(*) = 1 FROM public.tarifas WHERE cooperativa_id = (SELECT v FROM fx WHERE k = 'COOP_A') AND activa)
  AND (SELECT activa AND tarifa_por_kg = 4.00 FROM public.tarifas WHERE cooperativa_id = (SELECT v FROM fx WHERE k = 'COOP_B') AND activa)
  AND (SELECT NOT activa AND reemplazada_at IS NULL FROM public.tarifas WHERE id = (SELECT v FROM fx WHERE k = 'PROG_B')),
  'fn_activar_tarifas_programadas activa solo la vencida de COOP_A y no toca COOP_B');

-- Restaurar tarifa original de COOP_A vía RPC (para el resto de pruebas: 2.00/kg, 0.0010/min, 50 cm, 25 kg).
SELECT pg_temp.como('AA');
INSERT INTO resultados (r) SELECT pg_temp.afirma(
  (public.fn_publicar_tarifa(2.00, 0.0010, 50, 25, NULL, 'Restaurar tarifa A')->>'estado') = 'VIGENTE',
  'AA publica tarifa vigente directamente y reemplaza la activa de COOP_A');
RESET ROLE;

-- Validación de redondeo: 0.001 redondeado a 2 decimales es 0.00 -> EB_DATOS_INVALIDOS (no 23514).
SELECT pg_temp.como('AA');
INSERT INTO resultados (r) SELECT pg_temp.espera_error('EB_DATOS_INVALIDOS',
  $q$SELECT public.fn_publicar_tarifa(0.001, 0.001, 50, 25)$q$);
RESET ROLE;

-- ─── 5. fn_cotizar_envio_publico por cooperativa ─────────────────────────────
-- Rutas aisladas para verificar conteos exactos sin interferencia de otras cooperativas.
INSERT INTO public.rutas (cooperativa_id, estado_origen, ciudad_origen, estado_destino, ciudad_destino,
                          duracion_estimada_min, precio_pasaje, activa)
VALUES ((SELECT v FROM fx WHERE k = 'COOP_A'), 'lara', 'ciudad_tarifa_orig', 'miranda', 'ciudad_tarifa_dest', 600, 20, true),
       ((SELECT v FROM fx WHERE k = 'COOP_B'), 'lara', 'ciudad_tarifa_orig', 'miranda', 'ciudad_tarifa_dest', 600, 25, true);

-- 2 kg: COOP_A = round(2 * 2.00 * (1 + 0.0010 * 600), 2) = 6.40; COOP_B = round(2 * 4.00 * (1 + 0.0020 * 600), 2) = 17.60.
INSERT INTO resultados (r) SELECT pg_temp.afirma(
  (SELECT (j->>'peso_max_kg')::numeric = 40
      AND (j->>'tasa_bcv')::numeric = (SELECT tasa FROM public.fn_tasa_bcv_vigente())
      AND jsonb_array_length(j->'opciones') = 2
      AND (j->'opciones'->0->>'cooperativa_id')::uuid = (SELECT v FROM fx WHERE k = 'COOP_A')
      AND (j->'opciones'->0->>'costo_usd')::numeric = 6.40
      AND (j->'opciones'->0->>'peso_max_kg')::numeric = 25
      AND (j->'opciones'->0->>'dimensiones_max_cm')::integer = 50
      AND (j->'opciones'->1->>'cooperativa_id')::uuid = (SELECT v FROM fx WHERE k = 'COOP_B')
      AND (j->'opciones'->1->>'costo_usd')::numeric = 17.60
      AND (j->'opciones'->1->>'peso_max_kg')::numeric = 40
      AND (j->'opciones'->1->>'dimensiones_max_cm')::integer = 80
     FROM (SELECT public.fn_cotizar_envio_publico(2, 'ciudad_tarifa_orig', 'ciudad_tarifa_dest') AS j) x),
  'fn_cotizar_envio_publico (2 kg) devuelve ambas cooperativas ordenadas por costo con sus límites');

-- 30 kg: solo COOP_B (peso_max_kg = 40 >= 30); COOP_A (peso_max_kg = 25) queda filtrada.
INSERT INTO resultados (r) SELECT pg_temp.afirma(
  (SELECT (j->>'peso_max_kg')::numeric = 40
      AND jsonb_array_length(j->'opciones') = 1
      AND (j->'opciones'->0->>'cooperativa_id')::uuid = (SELECT v FROM fx WHERE k = 'COOP_B')
     FROM (SELECT public.fn_cotizar_envio_publico(30, 'ciudad_tarifa_orig', 'ciudad_tarifa_dest') AS j) x),
  'fn_cotizar_envio_publico (30 kg) devuelve solo COOP_B con peso_max_kg = 40');

-- 50 kg: excede peso_max_kg = 40 -> EB_PESO_INVALIDO con detalle peso_max_kg = 40.
DO $$
DECLARE v_msg text; v_det text;
BEGIN
  PERFORM public.fn_cotizar_envio_publico(50, 'ciudad_tarifa_orig', 'ciudad_tarifa_dest');
  RAISE EXCEPTION 'FALLO: esperaba EB_PESO_INVALIDO para 50 kg';
EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT, v_det = PG_EXCEPTION_DETAIL;
  IF v_msg <> 'EB_PESO_INVALIDO' OR (v_det::jsonb->>'peso_max_kg')::numeric <> 40 THEN
    RAISE EXCEPTION 'FALLO: esperaba EB_PESO_INVALIDO con peso_max_kg=40, fue % (%)', v_msg, v_det;
  END IF;
  INSERT INTO resultados (r) VALUES ('ok: EB_PESO_INVALIDO para 50 kg con peso_max_kg = 40');
END $$;

-- Ciudad sin rutas ni tarifas: devuelve opciones vacías y peso_max_kg NULL.
INSERT INTO resultados (r) SELECT pg_temp.afirma(
  (SELECT (j->>'peso_max_kg') IS NULL AND j->'opciones' = '[]'::jsonb
     FROM (SELECT public.fn_cotizar_envio_publico(2, 'ciudad_inexistente_a', 'ciudad_inexistente_b') AS j) x),
  'fn_cotizar_envio_publico sin rutas devuelve peso_max_kg NULL y opciones vacías');

-- ─── 6. fn_cotizar_encomienda, checklist y validar_encomienda_app_fn ─────────
SELECT pg_temp.como('P1');
INSERT INTO public.encomiendas (sender_id, receiver_nombre, receiver_cedula_rif, receiver_telefono,
  estado_origen, ciudad_origen, estado_destino, ciudad_destino, descripcion_contenido, modalidad_pago, cooperativa_id)
VALUES ((SELECT v FROM fx WHERE k = 'P1'), 'Ana Pérez', 'V-30111222', '0414-3011122', 'merida', 'merida',
        'distrito_capital', 'caracas', 'Caja de prueba', 'ORIGEN', (SELECT v FROM fx WHERE k = 'COOP_A'));
RESET ROLE;
INSERT INTO fx (k, v)
SELECT 'ENC_A', id FROM public.encomiendas WHERE cooperativa_id = (SELECT v FROM fx WHERE k = 'COOP_A') LIMIT 1;

SELECT pg_temp.como('TA');
INSERT INTO resultados (r) SELECT pg_temp.afirma(
  (SELECT (j->>'costo_usd')::numeric = 6.40
      AND (j->>'peso_max_kg')::numeric = 25
      AND (j->>'dimensiones_max_cm')::integer = 50
      AND (j->>'tasa_bcv')::numeric = (SELECT tasa FROM public.fn_tasa_bcv_vigente())
      AND (j->>'costo_bs')::numeric = round(6.40 * (SELECT tasa FROM public.fn_tasa_bcv_vigente()), 2)
     FROM (SELECT public.fn_cotizar_encomienda((SELECT v FROM fx WHERE k = 'ENC_A'), 2) AS j) x),
  'fn_cotizar_encomienda incluye costo, peso_max_kg y dimensiones_max_cm de COOP_A');
RESET ROLE;

-- Checklist incluye tarifas_activas = 1.
SELECT pg_temp.como('AA');
INSERT INTO resultados (r) SELECT pg_temp.afirma(
  (public.fn_checklist_cooperativa()->>'tarifas_activas')::integer = 1,
  'fn_checklist_cooperativa reporta tarifas_activas = 1');
RESET ROLE;

-- Desactivar tarifa de COOP_A: cotización y alta desde la app se bloquean con EB_TARIFA_NO_DISPONIBLE,
-- y checklist reporta tarifas_activas = 0.
UPDATE public.tarifas SET activa = false, reemplazada_at = now()
 WHERE cooperativa_id = (SELECT v FROM fx WHERE k = 'COOP_A') AND activa;

SELECT pg_temp.como('TA');
INSERT INTO resultados (r) SELECT pg_temp.espera_error('EB_TARIFA_NO_DISPONIBLE', format(
  $q$SELECT public.fn_cotizar_encomienda(%L, 2)$q$, (SELECT v FROM fx WHERE k = 'ENC_A')));
RESET ROLE;

SELECT pg_temp.como('AA');
INSERT INTO resultados (r) SELECT pg_temp.afirma(
  (public.fn_checklist_cooperativa()->>'tarifas_activas')::integer = 0,
  'fn_checklist_cooperativa reporta tarifas_activas = 0 sin tarifa activa');
RESET ROLE;

SELECT pg_temp.como('P1');
INSERT INTO resultados (r) SELECT pg_temp.espera_error('EB_TARIFA_NO_DISPONIBLE', format($q$
  INSERT INTO public.encomiendas (sender_id, receiver_nombre, receiver_cedula_rif, receiver_telefono,
    estado_origen, ciudad_origen, estado_destino, ciudad_destino, descripcion_contenido, modalidad_pago, cooperativa_id)
  VALUES (%L, 'Ana Pérez', 'V-30111222', '0414-3011122', 'merida', 'merida', 'distrito_capital', 'caracas',
          'Paquete sin tarifa', 'ORIGEN', %L)$q$,
  (SELECT v FROM fx WHERE k = 'P1'), (SELECT v FROM fx WHERE k = 'COOP_A')));
RESET ROLE;

-- ─── 7. Tasa BCV sigue siendo global (solo super_admin) ─────────────────────
SELECT pg_temp.como('AA');
INSERT INTO resultados (r) SELECT pg_temp.espera_error('EB_SIN_PERMISO',
  $q$SELECT public.fn_registrar_tasa_bcv_manual((now() AT TIME ZONE 'America/Caracas')::date, 120, 'Intento de admin coop')$q$);
RESET ROLE;

SELECT pg_temp.como('SA');
INSERT INTO resultados (r) SELECT pg_temp.afirma(
  (public.fn_registrar_tasa_bcv_manual((now() AT TIME ZONE 'America/Caracas')::date, 120, 'Prueba tasa BCV global')->>'tasa')::numeric = 120,
  'SA sigue actualizando la tasa BCV global');
RESET ROLE;

SELECT string_agg(r, E'\n' ORDER BY n) AS resultado FROM resultados;
ROLLBACK;
