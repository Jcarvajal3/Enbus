-- Asientos y boletos: no se vende dos veces el mismo asiento, el contador de asientos cuadra, un
-- pasajero no ve los boletos de otro, nadie escribe boletos/pagos/viajes por la API.
BEGIN;
\i 00_fixtures.sql

-- P1 aparta los asientos 5 y 6.
SELECT pg_temp.como('P1');
INSERT INTO resultados (r) SELECT pg_temp.afirma(
  jsonb_array_length(public.fn_reservar_asientos('11111111-1111-1111-1111-111111111111',
                     (SELECT v FROM fx WHERE k = 'VIAJE_A'), ARRAY['5', '6'])->'boletos') = 2,
  'P1 aparta los asientos 5 y 6');
-- Reintento idempotente (doble toque): sigue habiendo 2 boletos, no 4.
INSERT INTO resultados (r) SELECT pg_temp.afirma(
  jsonb_array_length(public.fn_reservar_asientos('11111111-1111-1111-1111-111111111111',
                     (SELECT v FROM fx WHERE k = 'VIAJE_A'), ARRAY['5', '6'])->'boletos') = 2,
  'el doble toque no duplica la reserva');
RESET ROLE;

-- P2 intenta el asiento 5 en otra compra.
SELECT pg_temp.como('P2');
INSERT INTO resultados (r) SELECT pg_temp.espera_error('EB_ASIENTO_OCUPADO',
  format($q$SELECT public.fn_reservar_asientos('22222222-2222-2222-2222-222222222222', %L, ARRAY['5'])$q$,
         (SELECT v FROM fx WHERE k = 'VIAJE_A')));
-- …y la compra de P1 tampoco es suya.
INSERT INTO resultados (r) SELECT pg_temp.espera_error('EB_SIN_PERMISO',
  format($q$SELECT public.fn_reservar_asientos('11111111-1111-1111-1111-111111111111', %L, ARRAY['7'])$q$,
         (SELECT v FROM fx WHERE k = 'VIAJE_A')));
-- P2 no ve los boletos de P1.
INSERT INTO resultados (r) SELECT pg_temp.afirma(
  (SELECT count(*) FROM public.boletos WHERE comprador_id = (SELECT v FROM fx WHERE k = 'P1')) = 0,
  'P2 no lee los boletos de P1');
-- Escrituras directas cerradas.
INSERT INTO resultados (r) SELECT pg_temp.espera_error('42501', format(
  $q$INSERT INTO public.boletos (codigo_boleto, viaje_id, cooperativa_id, asiento, precio) VALUES ('BOL-X', %L, %L, '9', 0)$q$,
  (SELECT v FROM fx WHERE k = 'VIAJE_A'), (SELECT v FROM fx WHERE k = 'COOP_A')));
INSERT INTO resultados (r) SELECT pg_temp.espera_error('42501',
  $q$UPDATE public.pagos SET verificado = true$q$);
RESET ROLE;

-- El contador del viaje cuadra con los boletos ocupados.
INSERT INTO resultados (r) SELECT pg_temp.afirma(
  (SELECT asientos_disponibles FROM public.viajes WHERE id = (SELECT v FROM fx WHERE k = 'VIAJE_A')) = 28,
  'asientos_disponibles = 30 - 2');

-- El taquillero de A no puede tocar el viaje por la API (antes podía cambiar estado y asientos).
SELECT pg_temp.como('TA');
UPDATE public.viajes SET asientos_disponibles = 0, estado = 'CANCELADO' WHERE id = (SELECT v FROM fx WHERE k = 'VIAJE_A');
RESET ROLE;
INSERT INTO resultados (r) SELECT pg_temp.afirma(
  (SELECT estado = 'PROGRAMADO' AND asientos_disponibles = 28 FROM public.viajes WHERE id = (SELECT v FROM fx WHERE k = 'VIAJE_A')),
  'el taquillero no cambia el viaje con un UPDATE directo');

-- El admin de B no puede programar un viaje en la ruta de A (ni en su cooperativa con una ruta ajena).
SELECT pg_temp.como('AB');
INSERT INTO resultados (r) SELECT pg_temp.espera_error('EB_SIN_RUTA', format(
  $q$INSERT INTO public.viajes (ruta_id, cooperativa_id, fecha_hora_salida, fecha_hora_llegada_est, asientos_totales, asientos_disponibles)
     VALUES (%L, %L, now() + interval '3 days', now() + interval '3 days 10 hours', 30, 30)$q$,
  (SELECT v FROM fx WHERE k = 'RUTA_A'), (SELECT v FROM fx WHERE k = 'COOP_B')));
-- Su propio viaje sí, y el servidor fija estado y asientos disponibles.
INSERT INTO public.viajes (ruta_id, cooperativa_id, fecha_hora_salida, fecha_hora_llegada_est, asientos_totales,
                           asientos_disponibles, estado)
VALUES ((SELECT v FROM fx WHERE k = 'RUTA_B'), (SELECT v FROM fx WHERE k = 'COOP_B'),
        now() + interval '3 days', now() + interval '3 days 10 hours', 40, 0, 'CANCELADO');
RESET ROLE;
INSERT INTO resultados (r) SELECT pg_temp.afirma(
  (SELECT estado = 'PROGRAMADO' AND asientos_disponibles = 40 FROM public.viajes
    WHERE cooperativa_id = (SELECT v FROM fx WHERE k = 'COOP_B') AND asientos_totales = 40),
  'el INSERT del admin queda PROGRAMADO con todos los asientos libres');

-- P1 cancela un asiento: vuelve al contador y el asiento queda libre para P2.
SELECT pg_temp.como('P1');
SELECT public.fn_cancelar_boleto((SELECT id FROM public.boletos WHERE compra_id = '11111111-1111-1111-1111-111111111111' AND asiento = '5'));
RESET ROLE;
SELECT pg_temp.como('P2');
INSERT INTO resultados (r) SELECT pg_temp.afirma(
  jsonb_array_length(public.fn_reservar_asientos('22222222-2222-2222-2222-222222222222',
                     (SELECT v FROM fx WHERE k = 'VIAJE_A'), ARRAY['5'])->'boletos') = 1,
  'tras cancelar, otro pasajero toma el asiento');
RESET ROLE;
INSERT INTO resultados (r) SELECT pg_temp.afirma(
  (SELECT asientos_disponibles FROM public.viajes WHERE id = (SELECT v FROM fx WHERE k = 'VIAJE_A')) = 28,
  'el contador sigue cuadrando tras cancelar y re-apartar');

-- Calificar: solo con un boleto propio USADO de esa cooperativa.
SELECT pg_temp.como('P1');
INSERT INTO resultados (r) SELECT pg_temp.espera_error('42501', format(
  $q$INSERT INTO public.calificaciones (boleto_id, usuario_id, cooperativa_id, estrellas)
     VALUES (%L, %L, %L, 1)$q$,
  (SELECT id FROM public.boletos WHERE compra_id = '11111111-1111-1111-1111-111111111111' AND asiento = '6'),
  (SELECT v FROM fx WHERE k = 'P1'), (SELECT v FROM fx WHERE k = 'COOP_B')));
INSERT INTO resultados (r) SELECT pg_temp.espera_error('42501', format(
  $q$INSERT INTO public.calificaciones (boleto_id, usuario_id, cooperativa_id, estrellas)
     VALUES (%L, %L, %L, 5)$q$,
  (SELECT id FROM public.boletos WHERE compra_id = '11111111-1111-1111-1111-111111111111' AND asiento = '6'),
  (SELECT v FROM fx WHERE k = 'P1'), (SELECT v FROM fx WHERE k = 'COOP_A')));   -- aún no viajó
RESET ROLE;

SELECT string_agg(r, E'\n' ORDER BY n) AS resultado FROM resultados;
ROLLBACK;
