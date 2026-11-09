-- Columnas privadas de cooperativas (20261109000009_cooperativas_columnas_publicas.sql):
-- la app solo lee las columnas públicas; fn_cooperativas_privadas() da las filas completas al
-- super admin (todas) y al personal activo (la suya).
BEGIN;
\i 00_fixtures.sql

-- AB pasa a super admin dentro de la prueba (desaparece con el ROLLBACK).
ALTER TABLE public.profiles DISABLE TRIGGER aa_proteger_perfil;
UPDATE public.profiles SET role = 'super_admin', cooperativa_id = NULL WHERE id = (SELECT v FROM fx WHERE k = 'AB');
ALTER TABLE public.profiles ENABLE TRIGGER aa_proteger_perfil;

-- Pasajero: columnas públicas sí, privadas no (ni directo, ni con *, ni por un join como los embeds).
SELECT pg_temp.como('P1');
INSERT INTO resultados (r) SELECT pg_temp.afirma(
  (SELECT count(*) = 1 FROM (SELECT id, nombre, logo_url, estado, calificacion_promedio, total_calificaciones
                               FROM public.cooperativas WHERE id = (SELECT v FROM fx WHERE k = 'COOP_A')) x),
  'el pasajero lee las columnas públicas');
INSERT INTO resultados (r) SELECT pg_temp.espera_error('42501',
  $q$SELECT rif FROM public.cooperativas LIMIT 1$q$);
INSERT INTO resultados (r) SELECT pg_temp.espera_error('42501',
  $q$SELECT * FROM public.cooperativas LIMIT 1$q$);
INSERT INTO resultados (r) SELECT pg_temp.espera_error('42501',
  $q$SELECT c.comision_porcentaje FROM public.viajes v JOIN public.cooperativas c ON c.id = v.cooperativa_id LIMIT 1$q$);
INSERT INTO resultados (r) SELECT pg_temp.espera_error('42501',
  $q$SELECT id FROM public.cooperativas WHERE email IS NOT NULL$q$);
INSERT INTO resultados (r) SELECT pg_temp.afirma(
  (SELECT count(*) = 0 FROM public.fn_cooperativas_privadas()),
  'fn_cooperativas_privadas no le da filas al pasajero');
RESET ROLE;

-- Taquillero de A: solo su cooperativa, con todas las columnas.
SELECT pg_temp.como('TA');
INSERT INTO resultados (r) SELECT pg_temp.afirma(
  (SELECT count(*) = 1 AND bool_and(id = (SELECT v FROM fx WHERE k = 'COOP_A') AND rif IS NOT NULL
                                    AND comision_porcentaje IS NOT NULL)
     FROM public.fn_cooperativas_privadas()),
  'el taquillero ve su cooperativa completa y ninguna otra');
INSERT INTO resultados (r) SELECT pg_temp.espera_error('42501',
  $q$SELECT rif FROM public.cooperativas LIMIT 1$q$);
RESET ROLE;

-- Admin de A: sigue actualizando su cooperativa (WHERE y RETURNING sobre id).
SELECT pg_temp.como('AA');
WITH u AS (UPDATE public.cooperativas SET logo_url = 'https://ejemplo.test/logo.png'
             WHERE id = (SELECT v FROM fx WHERE k = 'COOP_A') RETURNING id)
INSERT INTO resultados (r) SELECT pg_temp.afirma(count(*) = 1, 'el admin de la cooperativa actualiza su logo') FROM u;
INSERT INTO resultados (r) SELECT pg_temp.afirma(
  (SELECT count(*) = 1 AND bool_and(id = (SELECT v FROM fx WHERE k = 'COOP_A'))
     FROM public.fn_cooperativas_privadas()),
  'el admin de la cooperativa ve solo la suya');
RESET ROLE;

-- Super admin: todas las filas completas.
SELECT pg_temp.como('AB');
INSERT INTO resultados (r) SELECT pg_temp.afirma(
  (SELECT count(*) = 2 FROM public.fn_cooperativas_privadas()
    WHERE id IN ((SELECT v FROM fx WHERE k = 'COOP_A'), (SELECT v FROM fx WHERE k = 'COOP_B'))
      AND rif IS NOT NULL),
  'el super admin ve todas las cooperativas completas');
RESET ROLE;

-- Personal desactivado: su JWT sigue vivo, pero la RPC no le da filas.
UPDATE auth.users SET banned_until = now() + interval '100 years' WHERE id = (SELECT v FROM fx WHERE k = 'TA');
SELECT pg_temp.como('TA');
INSERT INTO resultados (r) SELECT pg_temp.afirma(
  (SELECT count(*) = 0 FROM public.fn_cooperativas_privadas()),
  'el taquillero desactivado no recibe filas');
RESET ROLE;

-- anon: ni columnas privadas ni la RPC.
SET LOCAL ROLE anon;
INSERT INTO resultados (r) SELECT pg_temp.espera_error('42501',
  $q$SELECT rif FROM public.cooperativas LIMIT 1$q$);
INSERT INTO resultados (r) SELECT pg_temp.espera_error('42501',
  $q$SELECT * FROM public.fn_cooperativas_privadas()$q$);
RESET ROLE;

SELECT string_agg(r, E'\n' ORDER BY n) AS resultado FROM resultados;
ROLLBACK;
