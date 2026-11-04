-- Pago Móvil: el capture es obligatorio y solo vale el propio. Rechazar un pago de boletos cancela
-- la reserva y libera los asientos. La cooperativa ve el capture; otro pasajero no.
BEGIN;
\i 00_fixtures.sql

INSERT INTO storage.objects (bucket_id, name, owner_id)
SELECT 'comprobantes-pago', v::text || '/prueba-06.jpg', v::text FROM fx WHERE k IN ('P1', 'P2');

SELECT pg_temp.como('P1');
SELECT public.fn_reservar_asientos('44444444-4444-4444-4444-444444444444', (SELECT v FROM fx WHERE k = 'VIAJE_A'), ARRAY['20', '21']);
SELECT public.fn_asignar_pasajeros('44444444-4444-4444-4444-444444444444',
  '[{"asiento":"20","nombre":"Pedro Pérez","cedula":"V-12345678"},
    {"asiento":"21","nombre":"Ana Pérez","cedula":"V-87654321"}]'::jsonb);

-- Sin capture, o con el de otro usuario, o con una ruta que no existe: no se registra.
INSERT INTO resultados (r) SELECT pg_temp.espera_error('EB_COMPROBANTE_REQUERIDO', format($q$
  SELECT public.fn_checkout_boletos('44444444-4444-4444-4444-444444444444', %L, ARRAY['20', '21'], %L, '11223344',
    (now() AT TIME ZONE 'America/Caracas')::date, 'Banesco', NULL, NULL, 'prueba-capture-0001')$q$,
  (SELECT v FROM fx WHERE k = 'VIAJE_A'), (SELECT v FROM fx WHERE k = 'METODO_A')));
INSERT INTO resultados (r) SELECT pg_temp.espera_error('EB_COMPROBANTE_REQUERIDO', format($q$
  SELECT public.fn_checkout_boletos('44444444-4444-4444-4444-444444444444', %L, ARRAY['20', '21'], %L, '11223344',
    (now() AT TIME ZONE 'America/Caracas')::date, 'Banesco', NULL, NULL, 'prueba-capture-0002', %L)$q$,
  (SELECT v FROM fx WHERE k = 'VIAJE_A'), (SELECT v FROM fx WHERE k = 'METODO_A'),
  (SELECT v::text || '/prueba-06.jpg' FROM fx WHERE k = 'P2')));
INSERT INTO resultados (r) SELECT pg_temp.espera_error('EB_COMPROBANTE_REQUERIDO', format($q$
  SELECT public.fn_checkout_boletos('44444444-4444-4444-4444-444444444444', %L, ARRAY['20', '21'], %L, '11223344',
    (now() AT TIME ZONE 'America/Caracas')::date, 'Banesco', NULL, NULL, 'prueba-capture-0003', %L)$q$,
  (SELECT v FROM fx WHERE k = 'VIAJE_A'), (SELECT v FROM fx WHERE k = 'METODO_A'),
  (SELECT v::text || '/no-existe.jpg' FROM fx WHERE k = 'P1')));

-- Con su capture, sí.
SELECT public.fn_checkout_boletos('44444444-4444-4444-4444-444444444444', (SELECT v FROM fx WHERE k = 'VIAJE_A'), ARRAY['20', '21'],
  (SELECT v FROM fx WHERE k = 'METODO_A'), '11223344', (now() AT TIME ZONE 'America/Caracas')::date, 'Banesco',
  NULL, NULL, 'prueba-capture-0004', (SELECT v::text || '/prueba-06.jpg' FROM fx WHERE k = 'P1'));
RESET ROLE;

INSERT INTO resultados (r) SELECT pg_temp.afirma(
  (SELECT asientos_disponibles FROM public.viajes WHERE id = (SELECT v FROM fx WHERE k = 'VIAJE_A')) = 28,
  'los dos asientos quedan ocupados mientras se verifica el pago');

-- Quién ve el capture en Storage.
SELECT pg_temp.como('P2');
INSERT INTO resultados (r) SELECT pg_temp.afirma(
  NOT EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id = 'comprobantes-pago'
               AND name = (SELECT v::text || '/prueba-06.jpg' FROM fx WHERE k = 'P1')),
  'otro pasajero no ve el capture');
RESET ROLE;
SELECT pg_temp.como('AA');
INSERT INTO resultados (r) SELECT pg_temp.afirma(
  EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id = 'comprobantes-pago'
           AND name = (SELECT v::text || '/prueba-06.jpg' FROM fx WHERE k = 'P1')),
  'el admin de la cooperativa ve el capture');
INSERT INTO resultados (r) SELECT pg_temp.afirma(
  (SELECT f.comprobante_path FROM public.fn_pagos_por_verificar() f WHERE f.numero_referencia = '11223344')
    = (SELECT v::text || '/prueba-06.jpg' FROM fx WHERE k = 'P1'),
  'la bandeja del panel trae el capture');
INSERT INTO resultados (r) SELECT pg_temp.espera_error('EB_MOTIVO_REQUERIDO', format($q$
  SELECT public.fn_rechazar_pago(%L, 'no')$q$,
  (SELECT f.pago_id FROM public.fn_pagos_por_verificar() f WHERE f.numero_referencia = '11223344')));

-- Rechazar: asientos libres de inmediato.
INSERT INTO resultados (r) SELECT pg_temp.afirma(
  (public.fn_rechazar_pago(
     (SELECT f.pago_id FROM public.fn_pagos_por_verificar() f WHERE f.numero_referencia = '11223344'),
     'La referencia no aparece en nuestra cuenta')->>'boletos_liberados')::int = 2,
  'el rechazo libera los dos boletos');
RESET ROLE;

INSERT INTO resultados (r) SELECT pg_temp.afirma(
  (SELECT count(*) FROM public.boletos
    WHERE compra_id = '44444444-4444-4444-4444-444444444444' AND estado = 'CANCELADO'
      AND motivo_cancelacion LIKE 'Pago rechazado: %') = 2,
  'los boletos quedan cancelados con el motivo del rechazo');
INSERT INTO resultados (r) SELECT pg_temp.afirma(
  (SELECT asientos_disponibles FROM public.viajes WHERE id = (SELECT v FROM fx WHERE k = 'VIAJE_A')) = 30,
  'el viaje recupera los asientos');

-- Otro pasajero puede comprar el mismo asiento.
SELECT pg_temp.como('P2');
INSERT INTO resultados (r) SELECT pg_temp.afirma(
  jsonb_array_length(public.fn_reservar_asientos('55555555-5555-5555-5555-555555555555',
                     (SELECT v FROM fx WHERE k = 'VIAJE_A'), ARRAY['20'])->'boletos') = 1,
  'otro pasajero aparta el asiento liberado');
RESET ROLE;

SELECT string_agg(r, E'\n' ORDER BY n) AS resultado FROM resultados;
ROLLBACK;
