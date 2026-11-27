-- Horarios fijos y asignación de unidades (migración 20261127000001): las salidas se generan solas desde
-- el horario (30 días, días elegidos, sin no laborables), son idempotentes aunque se mueva la hora de una,
-- se retiran sin dejar huecos ni tocar lo vendido (al cambiar solo la hora del horario, las vacías se mueven
-- en el lugar con su unidad, salvo choque), se adoptan los recurrentes que ya existían, y la unidad
-- se asigna con sus reglas (capacidad, choque, puestos vendidos) y es obligatoria para marcar la salida.
BEGIN;
\i 00_fixtures.sql

CREATE TEMP TABLE IF NOT EXISTS ids (k text PRIMARY KEY, v uuid) ON COMMIT DROP;
GRANT ALL ON ids TO authenticated, anon;
CREATE TEMP TABLE IF NOT EXISTS tx (k text PRIMARY KEY, v jsonb) ON COMMIT DROP;
GRANT ALL ON tx TO authenticated, anon;

CREATE OR REPLACE FUNCTION pg_temp.hoy() RETURNS date LANGUAGE sql STABLE AS $f$
  SELECT (now() AT TIME ZONE 'America/Caracas')::date $f$;
-- Salidas que debe tener un horario con esos días y esa hora: hoy…hoy+30 que aún no pasaron.
CREATE OR REPLACE FUNCTION pg_temp.esperadas(p_dias smallint[], p_hora time) RETURNS integer LANGUAGE sql STABLE AS $f$
  SELECT count(*)::integer FROM generate_series(0, 30) i
   WHERE extract(dow FROM pg_temp.hoy() + i)::smallint = ANY (p_dias)
     AND (((pg_temp.hoy() + i) + p_hora) AT TIME ZONE 'America/Caracas') > now() $f$;
-- El texto (HINT) del error que da una sentencia, o NULL si no falla.
CREATE OR REPLACE FUNCTION pg_temp.hint_de(p_sql text) RETURNS text LANGUAGE plpgsql AS $f$
DECLARE h text;
BEGIN
  BEGIN
    EXECUTE p_sql;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS h = PG_EXCEPTION_HINT;
    RETURN h;
  END;
  RETURN NULL;
END $f$;

-- El admin de A no tiene sucursal (la bandeja filtraría por su ciudad); dos buses de A.
ALTER TABLE public.profiles DISABLE TRIGGER aa_proteger_perfil;
UPDATE public.profiles SET sucursal_id = NULL WHERE id = (SELECT v FROM fx WHERE k = 'AA');
ALTER TABLE public.profiles ENABLE TRIGGER aa_proteger_perfil;
INSERT INTO fx VALUES ('BUS1', gen_random_uuid()), ('BUS2', gen_random_uuid());
INSERT INTO public.buses (id, cooperativa_id, numero_unidad, placa, asientos, chofer_nombre)
VALUES ((SELECT v FROM fx WHERE k = 'BUS1'), (SELECT v FROM fx WHERE k = 'COOP_A'), 'U-1', 'AB123CD', 31, 'Pedro Pérez'),
       ((SELECT v FROM fx WHERE k = 'BUS2'), (SELECT v FROM fx WHERE k = 'COOP_A'), 'U-2', 'AB124CD', 20, NULL);

INSERT INTO resultados (r) SELECT pg_temp.afirma(
  (SELECT count(*) FROM cron.job WHERE jobname = 'generar_salidas' AND schedule = '15 4 * * *') = 1,
  'el cron generar_salidas está programado a las 00:15 de Venezuela');

-- ─── Permisos ────────────────────────────────────────────────────────────────
SELECT pg_temp.como('TA');
INSERT INTO resultados (r) SELECT pg_temp.espera_error('EB_SIN_PERMISO', format(
  $q$SELECT public.fn_guardar_horario(NULL, %L, '08:00'::time, ARRAY[1]::smallint[], 31, pg_temp.hoy(), NULL)$q$,
  (SELECT v FROM fx WHERE k = 'RUTA_A')));
INSERT INTO resultados (r) SELECT pg_temp.espera_error('EB_SIN_PERMISO',
  $q$SELECT public.fn_guardar_dia_no_laborable(pg_temp.hoy() + 5, 'x', false)$q$);
INSERT INTO resultados (r) SELECT pg_temp.espera_error('42501', format(
  $q$INSERT INTO public.horarios (cooperativa_id, ruta_id, hora_salida, dias, capacidad, vigente_desde)
     VALUES (%L, %L, '08:00', ARRAY[1]::smallint[], 31, pg_temp.hoy())$q$,
  (SELECT v FROM fx WHERE k = 'COOP_A'), (SELECT v FROM fx WHERE k = 'RUTA_A')));
RESET ROLE;
SELECT pg_temp.como('AA');
INSERT INTO resultados (r) SELECT pg_temp.espera_error('42501', $q$SELECT public._generar_salidas()$q$);
INSERT INTO resultados (r) SELECT pg_temp.espera_error('42501',
  $q$INSERT INTO public.dias_no_laborables (cooperativa_id, fecha) VALUES (gen_random_uuid(), pg_temp.hoy())$q$);
RESET ROLE;

-- ─── Crear un horario: lunes y jueves 23:30, 35 puestos ──────────────────────
SELECT pg_temp.como('AA');
INSERT INTO resultados (r) SELECT pg_temp.espera_error('EB_DATOS_INVALIDOS', format(
  $q$SELECT public.fn_guardar_horario(NULL, %L, '23:30'::time, ARRAY[1]::smallint[], 35, pg_temp.hoy() - 1, NULL)$q$,
  (SELECT v FROM fx WHERE k = 'RUTA_A')));   -- no puede empezar en el pasado
INSERT INTO resultados (r) SELECT pg_temp.espera_error('EB_DATOS_INVALIDOS', format(
  $q$SELECT public.fn_guardar_horario(NULL, %L, '23:30'::time, ARRAY[7]::smallint[], 35, pg_temp.hoy(), NULL)$q$,
  (SELECT v FROM fx WHERE k = 'RUTA_A')));   -- día inexistente
INSERT INTO tx SELECT 'H1', public.fn_guardar_horario(NULL, (SELECT v FROM fx WHERE k = 'RUTA_A'), '23:30'::time,
                                                       ARRAY[1, 4]::smallint[], 35, pg_temp.hoy(), NULL);
RESET ROLE;
INSERT INTO ids SELECT 'H1', (v->>'id')::uuid FROM tx WHERE k = 'H1';

INSERT INTO resultados (r) SELECT pg_temp.afirma(
  (SELECT (v->>'creadas')::int FROM tx WHERE k = 'H1') = pg_temp.esperadas(ARRAY[1, 4]::smallint[], '23:30'),
  'el horario crea una salida por cada lunes y jueves de los próximos 30 días');
INSERT INTO resultados (r) SELECT pg_temp.afirma(
  (SELECT count(*) FROM public.viajes WHERE horario_id = (SELECT v FROM ids WHERE k = 'H1'))
    = pg_temp.esperadas(ARRAY[1, 4]::smallint[], '23:30'),
  'hay exactamente esas salidas en viajes');
INSERT INTO resultados (r) SELECT pg_temp.afirma(
  (SELECT bool_and(extract(dow FROM fecha_servicio) IN (1, 4)
                   AND fecha_servicio BETWEEN pg_temp.hoy() AND pg_temp.hoy() + 30
                   AND fecha_servicio = (fecha_hora_salida AT TIME ZONE 'America/Caracas')::date
                   AND ((fecha_hora_salida AT TIME ZONE 'America/Caracas')::time) = '23:30'
                   AND asientos_totales = 35 AND asientos_disponibles = 35
                   AND bus_id IS NULL AND numero_unidad IS NULL AND recurrente AND estado = 'PROGRAMADO')
     FROM public.viajes WHERE horario_id = (SELECT v FROM ids WHERE k = 'H1')),
  'solo lunes y jueves, dentro de 30 días, 23:30 hora de Venezuela, sin bus y con la capacidad del horario');

-- Solape: otro horario activo de la misma ruta a la misma hora que comparte un día.
SELECT pg_temp.como('AA');
INSERT INTO resultados (r) SELECT pg_temp.espera_error('EB_DATOS_INVALIDOS', format(
  $q$SELECT public.fn_guardar_horario(NULL, %L, '23:30'::time, ARRAY[4, 5]::smallint[], 31, pg_temp.hoy(), NULL)$q$,
  (SELECT v FROM fx WHERE k = 'RUTA_A')));
RESET ROLE;
-- El admin de B no ve ni edita el horario de A, ni usa su ruta.
SELECT pg_temp.como('AB');
INSERT INTO resultados (r) SELECT pg_temp.espera_error('EB_NO_ENCONTRADO', format(
  $q$SELECT public.fn_guardar_horario(%L, %L, '23:30'::time, ARRAY[1]::smallint[], 31, pg_temp.hoy(), NULL)$q$,
  (SELECT v FROM ids WHERE k = 'H1'), (SELECT v FROM fx WHERE k = 'RUTA_B')));
INSERT INTO resultados (r) SELECT pg_temp.espera_error('EB_DATOS_INVALIDOS', format(
  $q$SELECT public.fn_guardar_horario(NULL, %L, '10:00'::time, ARRAY[1]::smallint[], 31, pg_temp.hoy(), NULL)$q$,
  (SELECT v FROM fx WHERE k = 'RUTA_A')));
INSERT INTO resultados (r) SELECT pg_temp.afirma(
  (SELECT count(*) FROM public.horarios) = 0, 'el admin de B no lee los horarios de A');
RESET ROLE;

-- ─── Idempotencia ────────────────────────────────────────────────────────────
INSERT INTO resultados (r) SELECT pg_temp.afirma(
  public._generar_salidas((SELECT v FROM fx WHERE k = 'COOP_A')) = 0, 'generar de nuevo no crea nada');
SELECT pg_temp.como('AA');
INSERT INTO tx SELECT 'H1b', public.fn_guardar_horario((SELECT v FROM ids WHERE k = 'H1'), (SELECT v FROM fx WHERE k = 'RUTA_A'),
  '23:30'::time, ARRAY[1, 4]::smallint[], 35, pg_temp.hoy(), NULL);
RESET ROLE;
INSERT INTO resultados (r) SELECT pg_temp.afirma(
  (SELECT (v->>'creadas')::int = 0 AND (v->>'quitadas')::int = 0 AND jsonb_array_length(v->'conservadas') = 0
     FROM tx WHERE k = 'H1b'),
  'guardar el horario sin cambios no crea ni quita salidas');

-- Salidas T1..T4 (por día) para los casos siguientes.
INSERT INTO ids SELECT 'T1', id FROM public.viajes WHERE horario_id = (SELECT v FROM ids WHERE k = 'H1')
  AND fecha_servicio >= pg_temp.hoy() + 1 ORDER BY fecha_servicio LIMIT 1 OFFSET 0;
INSERT INTO ids SELECT 'T2', id FROM public.viajes WHERE horario_id = (SELECT v FROM ids WHERE k = 'H1')
  AND fecha_servicio >= pg_temp.hoy() + 1 ORDER BY fecha_servicio LIMIT 1 OFFSET 1;
INSERT INTO ids SELECT 'T3', id FROM public.viajes WHERE horario_id = (SELECT v FROM ids WHERE k = 'H1')
  AND fecha_servicio >= pg_temp.hoy() + 1 ORDER BY fecha_servicio LIMIT 1 OFFSET 2;   -- = T1 + 7 días
INSERT INTO ids SELECT 'T4', id FROM public.viajes WHERE horario_id = (SELECT v FROM ids WHERE k = 'H1')
  AND fecha_servicio >= pg_temp.hoy() + 1 ORDER BY fecha_servicio LIMIT 1 OFFSET 3;
INSERT INTO ids SELECT 'TL', id FROM public.viajes WHERE horario_id = (SELECT v FROM ids WHERE k = 'H1')
  ORDER BY fecha_servicio DESC LIMIT 1;

-- ─── Mover una salida de hora no duplica al regenerar ───────────────────────
SELECT pg_temp.como('AA');
SELECT public.fn_editar_viaje((SELECT v FROM ids WHERE k = 'TL'), NULL, NULL,
  (SELECT fecha_hora_salida + interval '30 minutes' FROM public.viajes WHERE id = (SELECT v FROM ids WHERE k = 'TL')),
  NULL, NULL, NULL);
RESET ROLE;
INSERT INTO resultados (r) SELECT pg_temp.afirma(
  public._generar_salidas((SELECT v FROM fx WHERE k = 'COOP_A')) = 0
  AND (SELECT count(*) FROM public.viajes WHERE horario_id = (SELECT v FROM ids WHERE k = 'H1')
        AND fecha_servicio = (SELECT fecha_servicio FROM public.viajes WHERE id = (SELECT v FROM ids WHERE k = 'TL'))) = 1,
  'mover una salida (pasa de medianoche) no genera otra para ese día');
INSERT INTO resultados (r) SELECT pg_temp.afirma(
  (SELECT (fecha_hora_salida AT TIME ZONE 'America/Caracas')::date > fecha_servicio
     FROM public.viajes WHERE id = (SELECT v FROM ids WHERE k = 'TL')),
  'la salida movida conserva su día nominal (fecha_servicio)');

-- ─── Asignar unidad: copia capacidad, chofer y unidad ────────────────────────
SELECT pg_temp.como('AA');
INSERT INTO tx SELECT 'A1', public.fn_asignar_bus((SELECT v FROM ids WHERE k = 'T1'), (SELECT v FROM fx WHERE k = 'BUS1'), NULL);
RESET ROLE;
INSERT INTO resultados (r) SELECT pg_temp.afirma(
  (SELECT v->>'numero_unidad' = 'U-1' AND v->>'nombre_chofer' = 'Pedro Pérez'
          AND (v->>'asientos_totales')::int = 31 AND (v->>'asientos_disponibles')::int = 31 FROM tx WHERE k = 'A1')
  AND (SELECT bus_id = (SELECT v FROM fx WHERE k = 'BUS1') AND numero_unidad = 'U-1' AND asientos_totales = 31
             AND asientos_disponibles = 31 FROM public.viajes WHERE id = (SELECT v FROM ids WHERE k = 'T1')),
  'asignar el bus copia unidad, chofer del bus y sus 31 puestos (el horario tenía 35)');

-- Quitar la unidad la deja "por asignar"; los puestos no cambian.
SELECT pg_temp.como('AA');
SELECT public.fn_asignar_bus((SELECT v FROM ids WHERE k = 'T4'), (SELECT v FROM fx WHERE k = 'BUS2'), 'Luis Ramos');
SELECT public.fn_asignar_bus((SELECT v FROM ids WHERE k = 'T4'), NULL, NULL);
RESET ROLE;
INSERT INTO resultados (r) SELECT pg_temp.afirma(
  (SELECT bus_id IS NULL AND numero_unidad IS NULL AND nombre_chofer IS NULL AND asientos_totales = 20
     FROM public.viajes WHERE id = (SELECT v FROM ids WHERE k = 'T4')),
  'quitar la unidad la deja por asignar y conserva los puestos');
UPDATE public.viajes SET asientos_totales = 35, asientos_disponibles = 35 WHERE id = (SELECT v FROM ids WHERE k = 'T4');

-- ─── Copiar la semana anterior (lo hace el taquillero) ───────────────────────
SELECT pg_temp.como('TA');
INSERT INTO tx SELECT 'C1', public.fn_copiar_asignaciones(
  (SELECT fecha_servicio FROM public.viajes WHERE id = (SELECT v FROM ids WHERE k = 'T3')),
  (SELECT fecha_servicio FROM public.viajes WHERE id = (SELECT v FROM ids WHERE k = 'T3')));
RESET ROLE;
INSERT INTO resultados (r) SELECT pg_temp.afirma(
  (SELECT (v->>'asignadas')::int = 1 AND jsonb_array_length(v->'omitidas') = 0 FROM tx WHERE k = 'C1')
  AND (SELECT bus_id = (SELECT v FROM fx WHERE k = 'BUS1') AND nombre_chofer = 'Pedro Pérez'
        FROM public.viajes WHERE id = (SELECT v FROM ids WHERE k = 'T3')),
  'copiar asigna a la salida de hoy+7 el bus y chofer de la semana anterior');
SELECT pg_temp.como('TA');
INSERT INTO resultados (r) SELECT pg_temp.espera_error('EB_DATOS_INVALIDOS',
  $q$SELECT public.fn_copiar_asignaciones(pg_temp.hoy(), pg_temp.hoy() + 20)$q$);   -- más de 14 días
RESET ROLE;

-- ─── Choque de bus ───────────────────────────────────────────────────────────
INSERT INTO ids VALUES ('X', gen_random_uuid());
INSERT INTO public.viajes (id, ruta_id, cooperativa_id, fecha_hora_salida, fecha_hora_llegada_est,
                           asientos_totales, asientos_disponibles, estado)
SELECT (SELECT v FROM ids WHERE k = 'X'), (SELECT v FROM fx WHERE k = 'RUTA_A'), (SELECT v FROM fx WHERE k = 'COOP_A'),
       t.fecha_hora_salida + interval '1 hour', t.fecha_hora_salida + interval '11 hours', 30, 30, 'PROGRAMADO'
  FROM public.viajes t WHERE t.id = (SELECT v FROM ids WHERE k = 'T1');
SELECT pg_temp.como('AA');
INSERT INTO resultados (r) SELECT pg_temp.afirma(
  pg_temp.hint_de(format($q$SELECT public.fn_asignar_bus(%L, %L, NULL)$q$,
                         (SELECT v FROM ids WHERE k = 'X'), (SELECT v FROM fx WHERE k = 'BUS1'))) LIKE '%U-1 ya hace la salida%',
  'asignar un bus que ya hace una salida que se solapa da error con la unidad y la salida');
INSERT INTO resultados (r) SELECT pg_temp.espera_error('EB_DATOS_INVALIDOS', format(
  $q$SELECT public.fn_editar_viaje(%L, NULL, NULL, NULL, NULL, NULL, %L)$q$,
  (SELECT v FROM ids WHERE k = 'X'), (SELECT v FROM fx WHERE k = 'BUS1')));
-- INSERT directo del panel con ese bus en horas que se solapan.
INSERT INTO resultados (r) SELECT pg_temp.espera_error('EB_DATOS_INVALIDOS', format(
  $q$INSERT INTO public.viajes (ruta_id, cooperativa_id, fecha_hora_salida, fecha_hora_llegada_est, asientos_totales,
                                asientos_disponibles, bus_id)
     SELECT %L, %L, t.fecha_hora_salida + interval '2 hours', t.fecha_hora_salida + interval '12 hours', 31, 31, %L
       FROM public.viajes t WHERE t.id = %L$q$,
  (SELECT v FROM fx WHERE k = 'RUTA_A'), (SELECT v FROM fx WHERE k = 'COOP_A'), (SELECT v FROM fx WHERE k = 'BUS1'),
  (SELECT v FROM ids WHERE k = 'T1')));
RESET ROLE;

-- ─── Bus con menos puestos que el asiento vendido ────────────────────────────
INSERT INTO public.boletos (codigo_boleto, comprador_id, viaje_id, cooperativa_id, asiento, precio, estado)
VALUES ('BOL-H1', (SELECT v FROM fx WHERE k = 'P1'), (SELECT v FROM ids WHERE k = 'T2'),
        (SELECT v FROM fx WHERE k = 'COOP_A'), '25', 20, 'PAGADO');
SELECT pg_temp.como('AA');
INSERT INTO resultados (r) SELECT pg_temp.afirma(
  pg_temp.hint_de(format($q$SELECT public.fn_asignar_bus(%L, %L, NULL)$q$,
                         (SELECT v FROM ids WHERE k = 'T2'), (SELECT v FROM fx WHERE k = 'BUS2'))) LIKE '%tiene 20 puestos%puesto 25%',
  'un bus de 20 puestos no entra en una salida con el asiento 25 vendido');
INSERT INTO tx SELECT 'A2', public.fn_asignar_bus((SELECT v FROM ids WHERE k = 'T2'), (SELECT v FROM fx WHERE k = 'BUS1'), 'Ana Díaz');
RESET ROLE;
INSERT INTO resultados (r) SELECT pg_temp.afirma(
  (SELECT (v->>'asientos_totales')::int = 31 AND (v->>'asientos_disponibles')::int = 30
          AND v->>'nombre_chofer' = 'Ana Díaz' FROM tx WHERE k = 'A2'),
  'con pasajeros, el bus de 31 puestos baja la capacidad de 35 a 31 y el contador cuadra (30 libres)');

-- ─── Marcar la salida exige unidad ───────────────────────────────────────────
SELECT pg_temp.como('TA');
INSERT INTO resultados (r) SELECT pg_temp.espera_error('EB_SIN_UNIDAD', format(
  $q$SELECT public.fn_marcar_salida_viaje(%L)$q$, (SELECT v FROM ids WHERE k = 'T4')));
SELECT public.fn_asignar_bus((SELECT v FROM ids WHERE k = 'T4'), (SELECT v FROM fx WHERE k = 'BUS2'), 'Luis Ramos');
INSERT INTO tx SELECT 'M1', public.fn_marcar_salida_viaje((SELECT v FROM ids WHERE k = 'T4'));
RESET ROLE;
INSERT INTO resultados (r) SELECT pg_temp.afirma(
  (SELECT v->>'estado' = 'EN_CURSO' FROM tx WHERE k = 'M1')
  AND (SELECT estado = 'EN_CURSO' FROM public.viajes WHERE id = (SELECT v FROM ids WHERE k = 'T4')),
  'con unidad asignada (por el taquillero) la salida se marca');
-- Una salida EN_CURSO ya no se asigna.
SELECT pg_temp.como('AA');
INSERT INTO resultados (r) SELECT pg_temp.espera_error('EB_ESTADO_CAMBIO', format(
  $q$SELECT public.fn_asignar_bus(%L, %L, NULL)$q$, (SELECT v FROM ids WHERE k = 'T4'), (SELECT v FROM fx WHERE k = 'BUS1')));
RESET ROLE;

-- ─── Bandeja ─────────────────────────────────────────────────────────────────
SELECT pg_temp.como('AA');
INSERT INTO tx SELECT 'B1', public.fn_bandeja_cooperativa();
RESET ROLE;
INSERT INTO resultados (r) SELECT pg_temp.afirma(
  (SELECT v ? 'salidas_sin_unidad' AND v ? 'salidas_fuera_de_horario' AND v ? 'pagos_por_verificar'
          AND v ? 'proxima_salida' AND (v->>'salidas_sin_unidad')::int >= 0 FROM tx WHERE k = 'B1'),
  'la bandeja conserva lo que ya devolvía y suma salidas_sin_unidad y salidas_fuera_de_horario');

-- ─── Día no laborable: retira la salida del día y se regenera al quitarlo ────
INSERT INTO tx SELECT 'TLFS', to_jsonb(fecha_servicio) FROM public.viajes WHERE id = (SELECT v FROM ids WHERE k = 'TL');
SELECT pg_temp.como('AA');
INSERT INTO tx SELECT 'N1', public.fn_guardar_dia_no_laborable(
  (SELECT (v #>> '{}')::date FROM tx WHERE k = 'TLFS'), 'Feriado de prueba', false);
RESET ROLE;
INSERT INTO resultados (r) SELECT pg_temp.afirma(
  (SELECT (v->>'quitadas')::int = 1 AND jsonb_array_length(v->'conservadas') = 0 FROM tx WHERE k = 'N1')
  AND NOT EXISTS (SELECT 1 FROM public.viajes WHERE id = (SELECT v FROM ids WHERE k = 'TL')),
  'un día no laborable retira la salida vacía de ese día');
INSERT INTO resultados (r) SELECT pg_temp.afirma(
  public._generar_salidas((SELECT v FROM fx WHERE k = 'COOP_A')) = 0
  AND NOT EXISTS (SELECT 1 FROM public.viajes WHERE horario_id = (SELECT v FROM ids WHERE k = 'H1')
                    AND fecha_servicio = (SELECT (v #>> '{}')::date FROM tx WHERE k = 'TLFS')),
  'y no se vuelve a generar ese día');
SELECT pg_temp.como('AA');
INSERT INTO tx SELECT 'N2', public.fn_borrar_dia_no_laborable((SELECT (v->>'id')::uuid FROM tx WHERE k = 'N1'));
RESET ROLE;
INSERT INTO resultados (r) SELECT pg_temp.afirma(
  (SELECT (v->>'creadas')::int = 1 FROM tx WHERE k = 'N2')
  AND (SELECT count(*) FROM public.viajes WHERE horario_id = (SELECT v FROM ids WHERE k = 'H1')
        AND fecha_servicio = (SELECT (v #>> '{}')::date FROM tx WHERE k = 'TLFS')) = 1,
  'al quitar el día no laborable vuelve la salida');

-- Cada año: el 29 de febrero solo coincide en años bisiestos y solo para su cooperativa.
SELECT pg_temp.como('AA');
SELECT public.fn_guardar_dia_no_laborable(DATE '2020-02-29', 'Bisiesto', true);
SELECT public.fn_guardar_dia_no_laborable(DATE '2020-12-25', 'Navidad', true);
RESET ROLE;
INSERT INTO resultados (r) SELECT pg_temp.afirma(
  public._es_no_laborable((SELECT v FROM fx WHERE k = 'COOP_A'), DATE '2028-02-29')
  AND NOT public._es_no_laborable((SELECT v FROM fx WHERE k = 'COOP_A'), DATE '2027-02-28')
  AND NOT public._es_no_laborable((SELECT v FROM fx WHERE k = 'COOP_A'), DATE '2027-03-01')
  AND NOT public._es_no_laborable((SELECT v FROM fx WHERE k = 'COOP_B'), DATE '2028-02-29'),
  'un día "cada año" del 29 de febrero solo aplica en bisiestos y solo a su cooperativa');
INSERT INTO resultados (r) SELECT pg_temp.afirma(
  public._es_no_laborable((SELECT v FROM fx WHERE k = 'COOP_A'), DATE '2031-12-25'),
  'un día "cada año" aplica a cualquier año');
-- Se quitan para no alterar las cuentas siguientes (el 25 de dic. puede caer dentro de los 30 días).
DELETE FROM public.dias_no_laborables WHERE nombre IN ('Bisiesto', 'Navidad');
SELECT public._generar_salidas((SELECT v FROM fx WHERE k = 'COOP_A'));

-- ─── Editar la hora: mueve las vacías (con su unidad), conserva las vendidas ─
-- T1 y T3 no tienen movimiento y llevan la U-1. Y: viaje extra con la U-1 que llega 30 minutos antes
-- de que salga T3 (no chocan a las 23:30, sí cuando T3 pase a las 22:30).
INSERT INTO tx SELECT 'T2FS', to_jsonb(fecha_servicio) FROM public.viajes WHERE id = (SELECT v FROM ids WHERE k = 'T2');
INSERT INTO tx SELECT 'T1FS', to_jsonb(fecha_servicio) FROM public.viajes WHERE id = (SELECT v FROM ids WHERE k = 'T1');
INSERT INTO tx SELECT 'T3FS', to_jsonb(fecha_servicio) FROM public.viajes WHERE id = (SELECT v FROM ids WHERE k = 'T3');
INSERT INTO ids VALUES ('Y', gen_random_uuid());
INSERT INTO public.viajes (id, ruta_id, cooperativa_id, bus_id, numero_unidad, fecha_hora_salida, fecha_hora_llegada_est,
                           asientos_totales, asientos_disponibles, estado)
SELECT (SELECT v FROM ids WHERE k = 'Y'), (SELECT v FROM fx WHERE k = 'RUTA_A'), (SELECT v FROM fx WHERE k = 'COOP_A'),
       (SELECT v FROM fx WHERE k = 'BUS1'), 'U-1',
       t.fecha_hora_salida - interval '5 hours', t.fecha_hora_salida - interval '30 minutes', 31, 31, 'PROGRAMADO'
  FROM public.viajes t WHERE t.id = (SELECT v FROM ids WHERE k = 'T3');
SELECT pg_temp.como('AA');
INSERT INTO tx SELECT 'E1', public.fn_guardar_horario((SELECT v FROM ids WHERE k = 'H1'), (SELECT v FROM fx WHERE k = 'RUTA_A'),
  '22:30'::time, ARRAY[1, 4]::smallint[], 35, pg_temp.hoy(), NULL);
RESET ROLE;
INSERT INTO resultados (r) SELECT pg_temp.afirma(
  (SELECT jsonb_array_length(v->'conservadas') = 1
          AND (v->'conservadas'->0->>'viaje_id')::uuid = (SELECT v FROM ids WHERE k = 'T2')
          AND (v->'conservadas'->0->>'ocupados')::int = 1 FROM tx WHERE k = 'E1'),
  'cambiar la hora conserva (y devuelve) la salida que ya tiene un boleto pagado');
INSERT INTO resultados (r) SELECT pg_temp.afirma(
  (SELECT estado = 'PROGRAMADO' AND fuera_de_horario AND horario_id IS NULL AND bus_id IS NOT NULL
     FROM public.viajes WHERE id = (SELECT v FROM ids WHERE k = 'T2')),
  'la salida con pasajeros queda fuera de horario, sin horario y sin tocar');
INSERT INTO resultados (r) SELECT pg_temp.afirma(
  (SELECT horario_id = (SELECT v FROM ids WHERE k = 'H1') AND estado = 'PROGRAMADO' AND NOT fuera_de_horario
          AND fecha_servicio = (SELECT (v #>> '{}')::date FROM tx WHERE k = 'T1FS')
          AND fecha_hora_salida = ((fecha_servicio + TIME '22:30') AT TIME ZONE 'America/Caracas')
          AND fecha_hora_llegada_est = fecha_hora_salida + interval '600 minutes'
          AND bus_id = (SELECT v FROM fx WHERE k = 'BUS1') AND numero_unidad = 'U-1' AND nombre_chofer = 'Pedro Pérez'
          AND asientos_totales = 31 AND asientos_disponibles = 31
     FROM public.viajes WHERE id = (SELECT v FROM ids WHERE k = 'T1')),
  'la salida vacía con unidad se mueve en el lugar a las 22:30 y conserva día, unidad, chofer y puestos');
INSERT INTO resultados (r) SELECT pg_temp.afirma(
  (SELECT horario_id = (SELECT v FROM ids WHERE k = 'H1') AND estado = 'PROGRAMADO'
          AND fecha_servicio = (SELECT (v #>> '{}')::date FROM tx WHERE k = 'T3FS')
          AND fecha_hora_salida = ((fecha_servicio + TIME '22:30') AT TIME ZONE 'America/Caracas')
          AND bus_id IS NULL AND numero_unidad IS NULL AND nombre_chofer IS NULL
          AND asientos_totales = 35 AND asientos_disponibles = 35
     FROM public.viajes WHERE id = (SELECT v FROM ids WHERE k = 'T3'))
  AND (SELECT bus_id = (SELECT v FROM fx WHERE k = 'BUS1') FROM public.viajes WHERE id = (SELECT v FROM ids WHERE k = 'Y')),
  'si al moverla la unidad choca con otro viaje programado, la salida queda por asignar (y el otro viaje no se toca)');
INSERT INTO resultados (r) SELECT pg_temp.afirma(
  (SELECT (v->>'sin_unidad_por_choque')::int = 1 AND (v->>'movidas')::int >= 2 FROM tx WHERE k = 'E1'),
  'el resultado cuenta las salidas movidas y la que perdió la unidad por choque');
INSERT INTO resultados (r) SELECT pg_temp.afirma(
  (SELECT bool_and(((fecha_hora_salida AT TIME ZONE 'America/Caracas')::time) = '22:30')
     FROM public.viajes WHERE horario_id = (SELECT v FROM ids WHERE k = 'H1') AND estado = 'PROGRAMADO'),
  'todas las salidas programadas del horario quedan a la hora nueva');
INSERT INTO resultados (r) SELECT pg_temp.afirma(
  (SELECT count(*) FROM public.viajes WHERE horario_id = (SELECT v FROM ids WHERE k = 'H1') AND estado = 'PROGRAMADO')
    = pg_temp.esperadas(ARRAY[1, 4]::smallint[], '22:30') - 1,
  'hay una salida PROGRAMADO a las 22:30 por día (menos la que ya salió y conserva su día)');
INSERT INTO resultados (r) SELECT pg_temp.afirma(
  (SELECT count(*) = 1 FROM public.viajes
    WHERE horario_id = (SELECT v FROM ids WHERE k = 'H1') AND estado = 'PROGRAMADO'
      AND fecha_servicio = (SELECT (v #>> '{}')::date FROM tx WHERE k = 'T2FS')
      AND ((fecha_hora_salida AT TIME ZONE 'America/Caracas')::time) = '22:30'),
  'el día de la salida conservada ya tiene su salida nueva a la hora nueva');
SELECT pg_temp.como('AA');
INSERT INTO tx SELECT 'B2', public.fn_bandeja_cooperativa();
RESET ROLE;
INSERT INTO resultados (r) SELECT pg_temp.afirma(
  (SELECT (v->>'salidas_fuera_de_horario')::int = 1 FROM tx WHERE k = 'B2'),
  'la bandeja cuenta 1 salida fuera de horario');

-- Reconciliación del cron: el boleto se cancela y la salida fuera de horario se retira sola.
UPDATE public.boletos SET estado = 'CANCELADO' WHERE codigo_boleto = 'BOL-H1';
SELECT public._generar_salidas();
INSERT INTO resultados (r) SELECT pg_temp.afirma(
  (SELECT estado = 'CANCELADO' AND NOT fuera_de_horario AND horario_id IS NULL
     FROM public.viajes WHERE id = (SELECT v FROM ids WHERE k = 'T2')),
  'el cron retira la salida fuera de horario cuando ya no tiene pasajeros (solo boletos cancelados: se cancela)');

-- ─── Adoptar un viaje recurrente que ya existía (con su bus) ─────────────────
INSERT INTO ids VALUES ('REC', gen_random_uuid());
INSERT INTO public.viajes (id, ruta_id, cooperativa_id, bus_id, numero_unidad, nombre_chofer, fecha_hora_salida,
                           fecha_hora_llegada_est, asientos_totales, asientos_disponibles, estado, recurrente)
SELECT (SELECT v FROM ids WHERE k = 'REC'), (SELECT v FROM fx WHERE k = 'RUTA_A'), (SELECT v FROM fx WHERE k = 'COOP_A'),
       (SELECT v FROM fx WHERE k = 'BUS2'), 'U-2', 'Chofer previo', s.t, s.t + interval '10 hours', 40, 40, 'PROGRAMADO', true
  FROM (SELECT (((pg_temp.hoy() + 1 + ((5 - extract(dow FROM pg_temp.hoy() + 1)::int + 7) % 7)) + TIME '21:00')
                AT TIME ZONE 'America/Caracas') AS t) s;
SELECT pg_temp.como('AA');
INSERT INTO tx SELECT 'H2', public.fn_guardar_horario(NULL, (SELECT v FROM fx WHERE k = 'RUTA_A'), '21:00'::time,
                                                       ARRAY[5]::smallint[], 31, pg_temp.hoy(), NULL);
RESET ROLE;
INSERT INTO ids SELECT 'H2', (v->>'id')::uuid FROM tx WHERE k = 'H2';
INSERT INTO resultados (r) SELECT pg_temp.afirma(
  (SELECT horario_id = (SELECT v FROM ids WHERE k = 'H2') AND bus_id = (SELECT v FROM fx WHERE k = 'BUS2')
          AND asientos_totales = 40 AND nombre_chofer = 'Chofer previo' AND fecha_servicio IS NOT NULL
     FROM public.viajes WHERE id = (SELECT v FROM ids WHERE k = 'REC'))
  AND (SELECT count(*) FROM public.viajes WHERE ruta_id = (SELECT v FROM fx WHERE k = 'RUTA_A')
        AND fecha_hora_salida = (SELECT fecha_hora_salida FROM public.viajes WHERE id = (SELECT v FROM ids WHERE k = 'REC'))) = 1,
  'el horario adopta el viaje recurrente existente (conserva bus y capacidad) en vez de duplicarlo');
INSERT INTO resultados (r) SELECT pg_temp.afirma(
  (SELECT (v->>'creadas')::int FROM tx WHERE k = 'H2') = pg_temp.esperadas(ARRAY[5]::smallint[], '21:00') - 1
  AND (SELECT count(*) FROM public.viajes WHERE horario_id = (SELECT v FROM ids WHERE k = 'H2'))
      = pg_temp.esperadas(ARRAY[5]::smallint[], '21:00'),
  'las demás salidas del horario se crean y la adoptada no cuenta como creada');

-- ─── Retiro con boletos EXPIRADO: libera el hueco y se regenera ──────────────
INSERT INTO ids SELECT 'TE', id FROM public.viajes WHERE horario_id = (SELECT v FROM ids WHERE k = 'H2')
  AND id <> (SELECT v FROM ids WHERE k = 'REC') ORDER BY fecha_servicio LIMIT 1;
INSERT INTO public.boletos (codigo_boleto, comprador_id, viaje_id, cooperativa_id, asiento, precio, estado)
VALUES ('BOL-EXP', (SELECT v FROM fx WHERE k = 'P1'), (SELECT v FROM ids WHERE k = 'TE'),
        (SELECT v FROM fx WHERE k = 'COOP_A'), '3', 20, 'EXPIRADO');
SELECT pg_temp.como('AA');
INSERT INTO tx SELECT 'N3', public.fn_guardar_dia_no_laborable(
  (SELECT fecha_servicio FROM public.viajes WHERE id = (SELECT v FROM ids WHERE k = 'TE')), 'Cierre de prueba', false);
RESET ROLE;
INSERT INTO resultados (r) SELECT pg_temp.afirma(
  (SELECT (v->>'quitadas')::int = 1 AND jsonb_array_length(v->'conservadas') = 0 FROM tx WHERE k = 'N3')
  AND (SELECT estado = 'CANCELADO' AND horario_id IS NULL FROM public.viajes WHERE id = (SELECT v FROM ids WHERE k = 'TE')),
  'una salida con solo boletos EXPIRADO se cancela y suelta su horario (no hay a quién avisar)');
SELECT pg_temp.como('AA');
INSERT INTO tx SELECT 'N4', public.fn_borrar_dia_no_laborable((SELECT (v->>'id')::uuid FROM tx WHERE k = 'N3'));
RESET ROLE;
INSERT INTO resultados (r) SELECT pg_temp.afirma(
  (SELECT (v->>'creadas')::int = 1 FROM tx WHERE k = 'N4')
  AND (SELECT count(*) = 1 FROM public.viajes
        WHERE horario_id = (SELECT v FROM ids WHERE k = 'H2') AND estado = 'PROGRAMADO' AND id <> (SELECT v FROM ids WHERE k = 'TE')
          AND fecha_servicio = (SELECT fecha_servicio FROM public.viajes WHERE id = (SELECT v FROM ids WHERE k = 'TE'))),
  'al quitar el día no laborable el hueco se rellena con una salida nueva');

-- ─── Desactivar y reactivar un horario ───────────────────────────────────────
SELECT pg_temp.como('AA');
INSERT INTO tx SELECT 'D1', public.fn_cambiar_estado_horario((SELECT v FROM ids WHERE k = 'H2'), false);
RESET ROLE;
INSERT INTO resultados (r) SELECT pg_temp.afirma(
  (SELECT jsonb_array_length(v->'conservadas') = 0 AND (v->>'quitadas')::int > 0 FROM tx WHERE k = 'D1')
  AND NOT EXISTS (SELECT 1 FROM public.viajes WHERE horario_id = (SELECT v FROM ids WHERE k = 'H2') AND estado = 'PROGRAMADO')
  AND NOT EXISTS (SELECT 1 FROM public.viajes WHERE id = (SELECT v FROM ids WHERE k = 'REC')),
  'desactivar el horario retira todas sus salidas sin movimiento (también la adoptada con bus)');
INSERT INTO resultados (r) SELECT pg_temp.afirma(
  public._generar_salidas((SELECT v FROM fx WHERE k = 'COOP_A'), (SELECT v FROM ids WHERE k = 'H2')) = 0,
  'un horario inactivo no genera');
SELECT pg_temp.como('AA');
INSERT INTO tx SELECT 'D2', public.fn_cambiar_estado_horario((SELECT v FROM ids WHERE k = 'H2'), true);
RESET ROLE;
INSERT INTO resultados (r) SELECT pg_temp.afirma(
  (SELECT (v->>'creadas')::int FROM tx WHERE k = 'D2') = pg_temp.esperadas(ARRAY[5]::smallint[], '21:00'),
  'reactivar el horario vuelve a generar sus salidas');

-- ─── El INSERT directo del panel no puede fijar horario_id (ni recurrente, ni fuera de horario) ──
SELECT pg_temp.como('AA');
INSERT INTO public.viajes (ruta_id, cooperativa_id, fecha_hora_salida, fecha_hora_llegada_est, asientos_totales,
                           asientos_disponibles, recurrente, horario_id, fuera_de_horario, fecha_servicio)
VALUES ((SELECT v FROM fx WHERE k = 'RUTA_A'), (SELECT v FROM fx WHERE k = 'COOP_A'),
        now() + interval '40 days', now() + interval '40 days 10 hours', 33, 33, true,
        (SELECT v FROM ids WHERE k = 'H1'), true, DATE '2000-01-01');
RESET ROLE;
INSERT INTO resultados (r) SELECT pg_temp.afirma(
  (SELECT horario_id IS NULL AND NOT recurrente AND NOT fuera_de_horario
          AND fecha_servicio = (fecha_hora_salida AT TIME ZONE 'America/Caracas')::date
          AND bus_id IS NULL AND numero_unidad IS NULL AND asientos_disponibles = 33
     FROM public.viajes WHERE cooperativa_id = (SELECT v FROM fx WHERE k = 'COOP_A') AND asientos_totales = 33),
  'el viaje extra del panel queda sin horario, no recurrente, sin unidad y con su fecha_servicio real');

SELECT string_agg(r, E'\n' ORDER BY n) AS resultado FROM resultados;
ROLLBACK;
