-- Fixtures comunes de las pruebas de robustez. NO se ejecuta solo: cada prueba lo incluye al
-- principio (dentro de su BEGIN … ROLLBACK), con run.sh. Crea dos cooperativas de prueba con ruta,
-- viaje futuro, método de pago, sucursales y tasa BCV, y usa los usuarios QA existentes:
--   P1  61673358-fc41-4a22-8cf3-6caa775c8680  pasajero
--   P2  b3315b30-03b1-4ee6-b962-97f68a943c72  pasajero
--   TA  adee13f6-93e1-4520-a1a5-8dd8d076a0cd  se convierte en taquillero de la cooperativa A
--   AB  9b571026-acad-4794-8837-f7845ce758fd  admin de su cooperativa real; se mueve a la B
--   AA  109f6afd-51be-47a9-80dd-cbffca5d7d3f  admin de su cooperativa real; se mueve a la A
-- Todo lo crea postgres (sin RLS) y desaparece con el ROLLBACK.
CREATE TEMP TABLE IF NOT EXISTS fx (k text PRIMARY KEY, v uuid) ON COMMIT DROP;
GRANT ALL ON fx TO authenticated, anon;
INSERT INTO fx VALUES
  ('P1', '61673358-fc41-4a22-8cf3-6caa775c8680'), ('P2', 'b3315b30-03b1-4ee6-b962-97f68a943c72'),
  ('TA', 'adee13f6-93e1-4520-a1a5-8dd8d076a0cd'), ('AB', '9b571026-acad-4794-8837-f7845ce758fd'),
  ('AA', '109f6afd-51be-47a9-80dd-cbffca5d7d3f'),
  ('COOP_A', gen_random_uuid()), ('COOP_B', gen_random_uuid()),
  ('RUTA_A', gen_random_uuid()), ('RUTA_B', gen_random_uuid()),
  ('VIAJE_A', gen_random_uuid()), ('VIAJE_B', gen_random_uuid()),
  ('METODO_A', gen_random_uuid()), ('SUC_A_ORIG', gen_random_uuid()), ('SUC_A_DEST', gen_random_uuid());

INSERT INTO public.cooperativas (id, nombre, rif, comision_porcentaje, estado)
SELECT (SELECT v FROM fx WHERE k = 'COOP_A'), 'Prueba A', 'J-99' || floor(random() * 1e6)::int || '-1', 5, 'ACTIVA'::public.estado_cooperativa
UNION ALL
SELECT (SELECT v FROM fx WHERE k = 'COOP_B'), 'Prueba B', 'J-98' || floor(random() * 1e6)::int || '-2', 5, 'ACTIVA'::public.estado_cooperativa;
INSERT INTO public.rutas (id, cooperativa_id, estado_origen, ciudad_origen, estado_destino, ciudad_destino,
                          duracion_estimada_min, precio_pasaje, activa)
VALUES ((SELECT v FROM fx WHERE k = 'RUTA_A'), (SELECT v FROM fx WHERE k = 'COOP_A'),
        'merida', 'merida', 'distrito_capital', 'caracas', 600, 20, true),
       ((SELECT v FROM fx WHERE k = 'RUTA_B'), (SELECT v FROM fx WHERE k = 'COOP_B'),
        'merida', 'merida', 'distrito_capital', 'caracas', 600, 25, true);
INSERT INTO public.viajes (id, ruta_id, cooperativa_id, fecha_hora_salida, fecha_hora_llegada_est,
                           asientos_totales, asientos_disponibles, estado)
VALUES ((SELECT v FROM fx WHERE k = 'VIAJE_A'), (SELECT v FROM fx WHERE k = 'RUTA_A'), (SELECT v FROM fx WHERE k = 'COOP_A'),
        now() + interval '2 days', now() + interval '2 days 10 hours', 30, 30, 'PROGRAMADO'),
       ((SELECT v FROM fx WHERE k = 'VIAJE_B'), (SELECT v FROM fx WHERE k = 'RUTA_B'), (SELECT v FROM fx WHERE k = 'COOP_B'),
        now() + interval '2 days', now() + interval '2 days 10 hours', 30, 30, 'PROGRAMADO');
INSERT INTO public.metodos_pago_cooperativa (id, cooperativa_id, tipo, banco, titular, numero_cuenta, cedula_rif, activo)
VALUES ((SELECT v FROM fx WHERE k = 'METODO_A'), (SELECT v FROM fx WHERE k = 'COOP_A'), 'PAGO_MOVIL',
        'Banco de Venezuela', 'Prueba A', '04141234567', 'J-123456789', true);
INSERT INTO public.sucursales (id, cooperativa_id, nombre, estado_geografico, ciudad, direccion, activa)
VALUES ((SELECT v FROM fx WHERE k = 'SUC_A_ORIG'), (SELECT v FROM fx WHERE k = 'COOP_A'), 'Terminal Mérida', 'merida', 'merida', 'Av. Las Américas', true),
       ((SELECT v FROM fx WHERE k = 'SUC_A_DEST'), (SELECT v FROM fx WHERE k = 'COOP_A'), 'Terminal La Bandera', 'distrito_capital', 'caracas', 'La Bandera', true);
INSERT INTO public.tasas_bcv (fecha, tasa, fuente, motivo)
VALUES ((now() AT TIME ZONE 'America/Caracas')::date, 100, 'manual', 'prueba de robustez')
ON CONFLICT (fecha) DO NOTHING;

ALTER TABLE public.profiles DISABLE TRIGGER aa_proteger_perfil;
UPDATE public.profiles SET role = 'taquillero', cooperativa_id = (SELECT v FROM fx WHERE k = 'COOP_A'),
                           sucursal_id = (SELECT v FROM fx WHERE k = 'SUC_A_DEST')
 WHERE id = (SELECT v FROM fx WHERE k = 'TA');
UPDATE public.profiles SET cooperativa_id = (SELECT v FROM fx WHERE k = 'COOP_A') WHERE id = (SELECT v FROM fx WHERE k = 'AA');
UPDATE public.profiles SET cooperativa_id = (SELECT v FROM fx WHERE k = 'COOP_B') WHERE id = (SELECT v FROM fx WHERE k = 'AB');
ALTER TABLE public.profiles ENABLE TRIGGER aa_proteger_perfil;

-- Actuar como un usuario: SELECT como_usuario('P1');  (luego RESET ROLE para volver a postgres)
CREATE OR REPLACE FUNCTION pg_temp.como(p_k text) RETURNS void LANGUAGE plpgsql AS $f$
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', (SELECT v FROM fx WHERE k = p_k), 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
END $f$;
-- Espera un error EB_*: SELECT pg_temp.espera_error('EB_ASIENTO_OCUPADO', $$SELECT …$$);
CREATE OR REPLACE FUNCTION pg_temp.espera_error(p_codigo text, p_sql text) RETURNS text LANGUAGE plpgsql AS $f$
BEGIN
  BEGIN
    EXECUTE p_sql;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = p_codigo OR SQLSTATE = p_codigo OR SQLERRM LIKE p_codigo THEN RETURN 'ok: ' || p_codigo; END IF;
    RAISE EXCEPTION 'FALLO: esperaba %, fue % (%)', p_codigo, SQLERRM, SQLSTATE;
  END;
  RAISE EXCEPTION 'FALLO: esperaba el error % y no hubo error: %', p_codigo, left(p_sql, 200);
END $f$;
CREATE OR REPLACE FUNCTION pg_temp.afirma(p_ok boolean, p_msg text) RETURNS text LANGUAGE plpgsql AS $f$
BEGIN
  IF p_ok IS NOT TRUE THEN RAISE EXCEPTION 'FALLO: %', p_msg; END IF;
  RETURN 'ok: ' || p_msg;
END $f$;
CREATE TEMP TABLE IF NOT EXISTS resultados (n serial, r text) ON COMMIT DROP;
GRANT ALL ON resultados, resultados_n_seq TO authenticated, anon;
