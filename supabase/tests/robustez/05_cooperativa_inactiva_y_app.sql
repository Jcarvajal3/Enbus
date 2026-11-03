-- Cooperativa no activa, personal desactivado, token push por RPC, embarque por código.
BEGIN;
\i 00_fixtures.sql

-- Venta en taquilla y embarque con la cooperativa activa.
SELECT pg_temp.como('TA');
SELECT public.fn_vender_boletos_taquilla((SELECT v FROM fx WHERE k = 'VIAJE_A'),
  '[{"asiento":"3","nombre":"Luis Gómez","cedula":"V-15123456"}]'::jsonb, 'EFECTIVO', NULL, 'USD', 100,
  NULL, NULL, NULL, 'prueba-venta-0001');
INSERT INTO resultados (r) SELECT pg_temp.afirma(
  public.fn_validar_embarque('pass-' || lower((SELECT codigo_boleto FROM public.boletos
                                                WHERE viaje_id = (SELECT v FROM fx WHERE k = 'VIAJE_A') AND asiento = '3')))->>'resultado'
    IN ('VALIDO', 'OTRO_DIA'),
  'el escaneo encuentra el boleto por su QR en minúsculas');
RESET ROLE;

-- Suspendida: no vende ni recibe envíos nuevos, pero lo vendido sigue (embarque, reembolso).
UPDATE public.cooperativas SET estado = 'SUSPENDIDA' WHERE id = (SELECT v FROM fx WHERE k = 'COOP_A');
SELECT pg_temp.como('TA');
INSERT INTO resultados (r) SELECT pg_temp.espera_error('EB_COOPERATIVA_NO_OPERATIVA', format($q$
  SELECT public.fn_vender_boletos_taquilla(%L, '[{"asiento":"4","nombre":"Luis Gómez","cedula":"V-15123456"}]'::jsonb,
    'EFECTIVO', NULL, 'USD', 100, NULL, NULL, NULL, 'prueba-venta-0002')$q$, (SELECT v FROM fx WHERE k = 'VIAJE_A')));
INSERT INTO resultados (r) SELECT pg_temp.espera_error('EB_COOPERATIVA_NO_OPERATIVA', format($q$
  SELECT public.fn_registrar_encomienda_taquilla(%L, '{"nombre":"Ana Pérez","cedula":"V-30111222","telefono":"0414-3011122"}',
    '{"nombre":"Juan Ruiz","cedula":"V-20111222","telefono":"0412-2011122"}', 'Caja de ropa', NULL, 'ORIGEN', 2,
    'prueba-enc-0001', %L)$q$, (SELECT v FROM fx WHERE k = 'RUTA_A'), (SELECT v FROM fx WHERE k = 'SUC_A_ORIG')));
RESET ROLE;
SELECT pg_temp.como('P1');
INSERT INTO resultados (r) SELECT pg_temp.espera_error('EB_VIAJE_NO_DISPONIBLE', format(
  $q$SELECT public.fn_reservar_asientos(gen_random_uuid(), %L, ARRAY['8'])$q$, (SELECT v FROM fx WHERE k = 'VIAJE_A')));
RESET ROLE;
UPDATE public.cooperativas SET estado = 'ACTIVA' WHERE id = (SELECT v FROM fx WHERE k = 'COOP_A');

-- Personal desactivado: su JWT sigue vivo, pero las RPC lo rechazan.
UPDATE auth.users SET banned_until = now() + interval '100 years' WHERE id = (SELECT v FROM fx WHERE k = 'TA');
SELECT pg_temp.como('TA');
INSERT INTO resultados (r) SELECT pg_temp.espera_error('EB_SIN_PERMISO', $q$SELECT public.fn_bandeja_cooperativa()$q$);
-- Y no puede cerrar sesiones de otros.
INSERT INTO resultados (r) SELECT pg_temp.espera_error('EB_SIN_PERMISO',
  format($q$SELECT public.fn_cerrar_sesiones_usuario(%L)$q$, (SELECT v FROM fx WHERE k = 'AA')));
RESET ROLE;
SELECT pg_temp.como('AA');
INSERT INTO resultados (r) SELECT pg_temp.afirma(
  public.fn_cerrar_sesiones_usuario((SELECT v FROM fx WHERE k = 'TA')) ? 'sesiones', 'el admin de A cierra las sesiones de su taquillero');
INSERT INTO resultados (r) SELECT pg_temp.espera_error('EB_SIN_PERMISO',
  format($q$SELECT public.fn_cerrar_sesiones_usuario(%L)$q$, (SELECT v FROM fx WHERE k = 'P1')));
RESET ROLE;

-- Token push por RPC.
SELECT pg_temp.como('P1');
SELECT public.fn_registrar_push_token('ExponentPushToken[robustez-rpc]');
RESET ROLE;
SELECT pg_temp.como('P2');
SELECT public.fn_registrar_push_token('ExponentPushToken[robustez-rpc]');
INSERT INTO resultados (r) SELECT pg_temp.espera_error('EB_DATOS_INVALIDOS', $q$SELECT public.fn_registrar_push_token('cualquier cosa')$q$);
RESET ROLE;
INSERT INTO resultados (r) SELECT pg_temp.afirma(
  (SELECT array_agg(id) FROM public.profiles WHERE expo_push_token = 'ExponentPushToken[robustez-rpc]')
    = ARRAY[(SELECT v FROM fx WHERE k = 'P2')],
  'fn_registrar_push_token deja el token solo en el perfil de quien lo registra');

-- Calificación: la cooperativa sale del boleto; no se cambia de boleto al editar.
INSERT INTO public.boletos (codigo_boleto, comprador_id, viaje_id, cooperativa_id, asiento, precio, estado)
VALUES ('BOL-ROBUST01', (SELECT v FROM fx WHERE k = 'P1'), (SELECT v FROM fx WHERE k = 'VIAJE_A'),
        (SELECT v FROM fx WHERE k = 'COOP_A'), '20', 20, 'USADO');
SELECT pg_temp.como('P1');
INSERT INTO public.calificaciones (boleto_id, usuario_id, cooperativa_id, estrellas)
VALUES ((SELECT id FROM public.boletos WHERE codigo_boleto = 'BOL-ROBUST01'), (SELECT v FROM fx WHERE k = 'P1'),
        (SELECT v FROM fx WHERE k = 'COOP_B'), 4);
INSERT INTO resultados (r) SELECT pg_temp.espera_error('EB_OPERACION_NO_PERMITIDA', format(
  $q$UPDATE public.calificaciones SET cooperativa_id = %L WHERE usuario_id = auth.uid()$q$, (SELECT v FROM fx WHERE k = 'COOP_B')));
RESET ROLE;
INSERT INTO resultados (r) SELECT pg_temp.afirma(
  (SELECT cooperativa_id = (SELECT v FROM fx WHERE k = 'COOP_A') FROM public.calificaciones
    WHERE boleto_id = (SELECT id FROM public.boletos WHERE codigo_boleto = 'BOL-ROBUST01'))
  AND (SELECT total_calificaciones = 1 AND calificacion_promedio = 4 FROM public.cooperativas WHERE id = (SELECT v FROM fx WHERE k = 'COOP_A')),
  'la calificación queda para la cooperativa del boleto y actualiza su promedio');

SELECT string_agg(r, E'\n' ORDER BY n) AS resultado FROM resultados;
ROLLBACK;
