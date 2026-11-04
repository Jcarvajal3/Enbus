-- Encomiendas: una cooperativa no ve las de otra; el personal no cambia costo ni estados por la API;
-- la app solo registra envíos a cooperativas activas con ruta; el PIN ya no es único global; los
-- avisos de "en camino" y "llegó" llegan a la bandeja del destinatario.
BEGIN;
\i 00_fixtures.sql

-- P1 registra un envío desde la app para P2 (vinculado por cédula).
UPDATE public.profiles SET cedula_rif = 'V-30111222', telefono = '0414-3011122'
 WHERE id = (SELECT v FROM fx WHERE k = 'P2');
SELECT pg_temp.como('P1');
INSERT INTO public.encomiendas (sender_id, receiver_nombre, receiver_cedula_rif, receiver_telefono,
  estado_origen, ciudad_origen, estado_destino, ciudad_destino, descripcion_contenido, modalidad_pago, cooperativa_id,
  costo_calculado, pin_retiro)
VALUES ((SELECT v FROM fx WHERE k = 'P1'), 'Ana Pérez', 'V-30111222', '0414-3011122', 'merida', 'merida',
        'distrito_capital', 'caracas', 'Ropa y zapatos', 'ORIGEN', (SELECT v FROM fx WHERE k = 'COOP_A'), 0.01, '0000');
-- A una cooperativa sin esa ruta: rechazado.
INSERT INTO resultados (r) SELECT pg_temp.espera_error('EB_SIN_RUTA', format($q$
  INSERT INTO public.encomiendas (sender_id, receiver_nombre, receiver_cedula_rif, receiver_telefono,
    estado_origen, ciudad_origen, estado_destino, ciudad_destino, descripcion_contenido, modalidad_pago, cooperativa_id)
  VALUES (%L, 'Ana Pérez', 'V-30111222', '0414-3011122', 'zulia', 'maracaibo', 'distrito_capital', 'caracas',
          'Ropa', 'ORIGEN', %L)$q$, (SELECT v FROM fx WHERE k = 'P1'), (SELECT v FROM fx WHERE k = 'COOP_A')));
-- Destinatario con cédula inválida: rechazado.
INSERT INTO resultados (r) SELECT pg_temp.espera_error('EB_DATOS_INVALIDOS', format($q$
  INSERT INTO public.encomiendas (sender_id, receiver_nombre, receiver_cedula_rif, receiver_telefono,
    estado_origen, ciudad_origen, estado_destino, ciudad_destino, descripcion_contenido, modalidad_pago, cooperativa_id)
  VALUES (%L, 'Ana Pérez', '12', '0414-3011122', 'merida', 'merida', 'distrito_capital', 'caracas',
          'Ropa', 'ORIGEN', %L)$q$, (SELECT v FROM fx WHERE k = 'P1'), (SELECT v FROM fx WHERE k = 'COOP_A')));
RESET ROLE;
INSERT INTO fx SELECT 'ENC', id FROM public.encomiendas WHERE cooperativa_id = (SELECT v FROM fx WHERE k = 'COOP_A');
INSERT INTO resultados (r) SELECT pg_temp.afirma(
  (SELECT costo_calculado IS NULL AND pin_retiro IS NULL AND receiver_user_id = (SELECT v FROM fx WHERE k = 'P2')
     FROM public.encomiendas WHERE id = (SELECT v FROM fx WHERE k = 'ENC')),
  'la app no fija costo ni PIN; el destinatario se vincula por cédula');

-- Aislamiento entre cooperativas.
SELECT pg_temp.como('AB');
INSERT INTO resultados (r) SELECT pg_temp.afirma(
  (SELECT count(*) FROM public.encomiendas WHERE id = (SELECT v FROM fx WHERE k = 'ENC')) = 0,
  'el admin de B no ve la encomienda de A');
INSERT INTO resultados (r) SELECT pg_temp.espera_error('EB_NO_ENCONTRADO',
  format($q$SELECT public.fn_confirmar_recepcion_origen(%L, 2)$q$, (SELECT v FROM fx WHERE k = 'ENC')));
RESET ROLE;
SELECT pg_temp.como('TA');
INSERT INTO resultados (r) SELECT pg_temp.afirma(
  (SELECT count(*) FROM public.encomiendas WHERE id = (SELECT v FROM fx WHERE k = 'ENC')) = 1,
  'el taquillero de A sí la ve');
-- Recepción por RPC: costo del servidor y PIN de 4 dígitos.
SELECT public.fn_confirmar_recepcion_origen((SELECT v FROM fx WHERE k = 'ENC'), 2);
-- Escrituras directas del personal: ni costo ni POR_PAGAR → PAGADA sin pago.
INSERT INTO resultados (r) SELECT pg_temp.espera_error('EB_OPERACION_NO_PERMITIDA',
  format($q$UPDATE public.encomiendas SET costo_calculado = 0.01 WHERE id = %L$q$, (SELECT v FROM fx WHERE k = 'ENC')));
INSERT INTO resultados (r) SELECT pg_temp.espera_error('EB_OPERACION_NO_PERMITIDA',
  format($q$UPDATE public.encomiendas SET estado = 'PAGADA' WHERE id = %L$q$, (SELECT v FROM fx WHERE k = 'ENC')));
-- La foto sí la puede guardar.
UPDATE public.encomiendas SET foto_omitida_motivo = 'Cliente sin tiempo' WHERE id = (SELECT v FROM fx WHERE k = 'ENC');
-- Cobro en taquilla (pago aprobado) y despacho por RPC.
SELECT public.fn_cobrar_encomienda_taquilla((SELECT v FROM fx WHERE k = 'ENC'), 'EFECTIVO', NULL, 'USD', 1000,
                                            NULL, NULL, NULL, 'prueba-cobro-0001');
SELECT public.fn_despachar_encomiendas((SELECT v FROM fx WHERE k = 'VIAJE_A'), ARRAY[(SELECT v FROM fx WHERE k = 'ENC')]);
-- Llegada con el UPDATE directo que usa el panel (Recepción en destino).
UPDATE public.encomiendas SET estado = 'EN_OFICINA_DESTINO' WHERE id = (SELECT v FROM fx WHERE k = 'ENC') AND estado = 'EN_TRANSITO';
RESET ROLE;
INSERT INTO resultados (r) SELECT pg_temp.afirma(
  (SELECT estado = 'EN_OFICINA_DESTINO' AND costo_calculado > 1 AND pin_retiro ~ '^[0-9]{4}$'
          AND foto_omitida_motivo = 'Cliente sin tiempo'
     FROM public.encomiendas WHERE id = (SELECT v FROM fx WHERE k = 'ENC')),
  'flujo recepción → cobro → despacho → llegada con costo del servidor y PIN');
INSERT INTO resultados (r) SELECT pg_temp.afirma(
  (SELECT count(*) FROM public.notificaciones_usuario
    WHERE usuario_id = (SELECT v FROM fx WHERE k = 'P2') AND recurso_id = (SELECT v FROM fx WHERE k = 'ENC')
      AND tipo = 'ENCOMIENDA_LISTA_RETIRO'
      AND mensaje LIKE '%' || (SELECT pin_retiro FROM public.encomiendas WHERE id = (SELECT v FROM fx WHERE k = 'ENC')) || '%') = 1
  AND (SELECT count(*) FROM public.notificaciones_usuario
        WHERE usuario_id IN ((SELECT v FROM fx WHERE k = 'P1'), (SELECT v FROM fx WHERE k = 'P2'))
          AND recurso_id = (SELECT v FROM fx WHERE k = 'ENC') AND tipo = 'ENCOMIENDA_EN_CAMINO') = 2,
  'avisos: en camino (remitente y destinatario) y llegó con PIN (destinatario)');
-- El remitente (P1) no puede leer las notificaciones de P2.
SELECT pg_temp.como('P1');
INSERT INTO resultados (r) SELECT pg_temp.afirma(
  (SELECT count(*) FROM public.notificaciones_usuario WHERE usuario_id = (SELECT v FROM fx WHERE k = 'P2')) = 0,
  'P1 no lee la bandeja de P2');
RESET ROLE;

-- PIN: ya no es único global (antes, a las 10.000 encomiendas la recepción quedaba en un bucle).
INSERT INTO resultados (r) SELECT pg_temp.afirma(
  NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'encomiendas_pin_retiro_key'),
  'sin UNIQUE global en pin_retiro');

-- Días hábiles en hora de Venezuela: llegó el jueves 5/11 a las 9 p. m. (viernes 01:00 UTC);
-- el viernes al mediodía va 1 día hábil (antes daba 0 por usar la fecha UTC).
INSERT INTO resultados (r) SELECT pg_temp.afirma(
  public.calcular_dias_habiles('2026-11-05 21:00-04', '2026-11-06 12:00-04') = 1
  AND public.calcular_dias_habiles('2026-11-06 21:00-04', '2026-11-09 08:00-04') = 1
  AND public.calcular_dias_habiles('2026-11-02 10:00-04', '2026-11-09 10:00-04') = 5,
  'calcular_dias_habiles cuenta con fechas de Venezuela');

-- Referencia de pago repetida: P1 y P2 reportan la misma referencia en dos compras distintas.
-- METODO_A es Pago Móvil: el reporte necesita su capture.
INSERT INTO storage.objects (bucket_id, name, owner_id)
SELECT 'comprobantes-pago', v::text || '/prueba-02.jpg', v::text FROM fx WHERE k = 'P1';
SELECT pg_temp.como('P1');
SELECT public.fn_reservar_asientos('33333333-3333-3333-3333-333333333333', (SELECT v FROM fx WHERE k = 'VIAJE_A'), ARRAY['10']);
SELECT public.fn_asignar_pasajeros('33333333-3333-3333-3333-333333333333',
  '[{"asiento":"10","nombre":"Pedro Pérez","cedula":"V-12345678"}]'::jsonb);
SELECT public.fn_checkout_boletos('33333333-3333-3333-3333-333333333333', (SELECT v FROM fx WHERE k = 'VIAJE_A'), ARRAY['10'],
  (SELECT v FROM fx WHERE k = 'METODO_A'), '99887766', (now() AT TIME ZONE 'America/Caracas')::date, 'Banesco',
  NULL, NULL, 'prueba-checkout-0001', (SELECT v::text || '/prueba-02.jpg' FROM fx WHERE k = 'P1'));
RESET ROLE;
-- Un INSERT que no pasa por la comprobación de la RPC (p. ej. otra RPC futura) también se frena.
INSERT INTO resultados (r) SELECT pg_temp.espera_error('EB_REFERENCIA_REPETIDA', format($q$
  INSERT INTO public.pagos (encomienda_id, pagador_id, cooperativa_id, monto, tipo_pago, numero_referencia, verificado)
  VALUES (%L, %L, %L, 1, 'DIGITAL', '99887766', false)$q$,
  (SELECT v FROM fx WHERE k = 'ENC'), (SELECT v FROM fx WHERE k = 'P2'), (SELECT v FROM fx WHERE k = 'COOP_A')));

-- Invitaciones: el admin de B no invita a la cooperativa A ni crea super admins.
SELECT pg_temp.como('AB');
INSERT INTO resultados (r) SELECT pg_temp.espera_error('42501', format($q$
  INSERT INTO public.invitaciones (email, role, cooperativa_id, creado_por) VALUES ('x@ejemplo.com', 'admin_cooperativa', %L, %L)$q$,
  (SELECT v FROM fx WHERE k = 'COOP_A'), (SELECT v FROM fx WHERE k = 'AB')));
INSERT INTO resultados (r) SELECT pg_temp.espera_error('42501', format($q$
  INSERT INTO public.invitaciones (email, role, cooperativa_id, creado_por) VALUES ('x@ejemplo.com', 'super_admin', %L, %L)$q$,
  (SELECT v FROM fx WHERE k = 'COOP_B'), (SELECT v FROM fx WHERE k = 'AB')));
INSERT INTO public.invitaciones (email, role, cooperativa_id, creado_por)
VALUES ('taquilla@ejemplo.com', 'taquillero', (SELECT v FROM fx WHERE k = 'COOP_B'), (SELECT v FROM fx WHERE k = 'AB'));
INSERT INTO resultados (r) SELECT pg_temp.afirma(
  (SELECT count(*) FROM public.invitaciones WHERE email = 'taquilla@ejemplo.com') = 1,
  'el admin de B sí invita a un taquillero de B');
RESET ROLE;

-- anon: no ve tablas, no ejecuta las funciones de RLS, sí la tasa BCV.
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);
INSERT INTO resultados (r) SELECT pg_temp.afirma(
  (SELECT count(*) FROM public.encomiendas) = 0 AND (SELECT count(*) FROM public.viajes) = 0
  AND (SELECT count(*) FROM public.profiles) = 0, 'anon no lee encomiendas, viajes ni perfiles');
INSERT INTO resultados (r) SELECT pg_temp.afirma((SELECT count(*) FROM public.fn_tasa_bcv_vigente()) = 1,
  'anon lee la tasa BCV');
INSERT INTO resultados (r) SELECT pg_temp.espera_error('42501', $q$SELECT public.user_role()$q$);
INSERT INTO resultados (r) SELECT pg_temp.espera_error('42501', $q$SELECT public.auto_devolver_encomienda()$q$);
RESET ROLE;
SELECT pg_temp.como('P1');
INSERT INTO resultados (r) SELECT pg_temp.espera_error('42501', $q$SELECT public.alerta_amarilla_72h()$q$);
RESET ROLE;

-- Storage: un pasajero no lista las guías (con PIN) ni las fotos de otros.
INSERT INTO storage.objects (bucket_id, name, owner_id)
VALUES ('fotos-encomiendas', (SELECT v FROM fx WHERE k = 'P2')::text || '/prueba.jpg', (SELECT v FROM fx WHERE k = 'P2')::text),
       ('fotos-encomiendas', 'guias/' || (SELECT v FROM fx WHERE k = 'COOP_A')::text || '/prueba.pdf', NULL),
       ('fotos-encomiendas', (SELECT v FROM fx WHERE k = 'ENC')::text || '/taquilla.jpg', NULL);
SELECT pg_temp.como('P1');
INSERT INTO resultados (r) SELECT pg_temp.afirma(
  (SELECT count(*) FROM storage.objects WHERE bucket_id = 'fotos-encomiendas'
    AND (name LIKE 'guias/%' OR name LIKE (SELECT v FROM fx WHERE k = 'P2')::text || '/%')) = 0
  AND (SELECT count(*) FROM storage.objects WHERE name = (SELECT v FROM fx WHERE k = 'ENC')::text || '/taquilla.jpg') = 1,
  'P1 ve la foto de su envío, no las guías ni la carpeta de P2');
RESET ROLE;
SELECT pg_temp.como('TA');
INSERT INTO resultados (r) SELECT pg_temp.afirma(
  (SELECT count(*) FROM storage.objects WHERE name = 'guias/' || (SELECT v FROM fx WHERE k = 'COOP_A')::text || '/prueba.pdf') = 1,
  'el taquillero de A ve las guías de A');
RESET ROLE;
SELECT pg_temp.como('AB');
INSERT INTO resultados (r) SELECT pg_temp.afirma(
  (SELECT count(*) FROM storage.objects WHERE bucket_id = 'fotos-encomiendas'
    AND name IN ('guias/' || (SELECT v FROM fx WHERE k = 'COOP_A')::text || '/prueba.pdf',
                 (SELECT v FROM fx WHERE k = 'ENC')::text || '/taquilla.jpg')) = 0,
  'el admin de B no ve fotos ni guías de A');
RESET ROLE;

SELECT string_agg(r, E'\n' ORDER BY n) AS resultado FROM resultados;
ROLLBACK;
