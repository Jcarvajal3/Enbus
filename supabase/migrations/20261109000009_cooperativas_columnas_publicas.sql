-- Cooperativas: la app solo lee las columnas públicas; las filas completas, por RPC.
--
-- Hasta aquí la política "Cooperativas visibles" (20261103000002_robustez_rls.sql, USING (true))
-- dejaba a cualquier usuario con sesión leer TODAS las columnas de cada cooperativa: comisión,
-- RIF, correo, teléfono, representante, mensaje de registro y motivo de suspensión. RLS filtra
-- filas, no columnas, así que el cierre va por privilegios de columna:
--
--   anon, authenticated         SELECT solo de id, nombre, logo_url, estado, calificacion_promedio
--                               y total_calificaciones (lo que la app muestra o filtra, también en
--                               los embeds desde viajes, rutas, boletos y encomiendas). La política
--                               de filas no cambia.
--   fn_cooperativas_privadas()  filas completas (SETOF cooperativas): todas para el super admin, la
--                               suya para el personal (admin_cooperativa y taquillero no
--                               desactivados), ninguna para los demás. PostgREST admite select,
--                               filtros, orden y embeds sobre ella igual que sobre la tabla.
--
-- Qué cambia en PostgREST para anon/authenticated (42501 "permission denied for table"):
--   · select('*') y cualquier select de columnas no concedidas sobre cooperativas, también en embeds;
--   · insert/update seguidos de .select() de columnas no concedidas (con .select('id') funcionan).
-- INSERT, UPDATE y DELETE siguen igual (privilegios de tabla y políticas sin cambios): solo
-- necesitan SELECT de las columnas que van en el WHERE o el RETURNING (id, estado).
-- Las funciones SECURITY DEFINER, los triggers (NEW/OLD), la service role (landing, server
-- actions con createAdminClient, edge functions) y las vistas v_proximos_viajes y
-- v_balance_cooperativa (solo columnas concedidas) no se ven afectados.
-- Una columna nueva de cooperativas NO queda legible para la app hasta concederla aquí.
--
-- Despliegue: PRIMERO el panel que lee por fn_cooperativas_privadas (si la RPC aún no existe,
-- vuelve a leer la tabla), DESPUÉS esta migración. El panel anterior lee comisión, RIF, correo y
-- motivo directamente de la tabla: con esta migración aplicada pierde el perfil en cada página
-- (embed de motivo_estado) y las pantallas del super admin. La app publicada y la nueva solo leen
-- columnas concedidas. Detalle en Audits/qa_noviembre_despliegue.md.
-- Re-ejecutable.
BEGIN;

-- ─── 1. Filas completas para EnBus y el personal de cada cooperativa ────────
CREATE OR REPLACE FUNCTION public.fn_cooperativas_privadas()
RETURNS SETOF public.cooperativas
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT c.*
    FROM public.cooperativas c
   WHERE ((SELECT public.is_super_admin())
          OR ((SELECT public.user_role()) IN ('admin_cooperativa', 'taquillero')
              AND c.id = (SELECT public.user_cooperativa_id())))
     -- Un usuario desactivado conserva su JWT hasta que vence (igual que _contexto_staff).
     AND NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = auth.uid() AND u.banned_until > now());
$$;
COMMENT ON FUNCTION public.fn_cooperativas_privadas() IS
  'Todas las columnas de cooperativas: todas las filas para el super admin, la propia para su personal activo, ninguna para los demás. La tabla solo concede a anon/authenticated las columnas públicas (20261109000009).';
REVOKE ALL ON FUNCTION public.fn_cooperativas_privadas() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_cooperativas_privadas() TO authenticated, service_role;

-- ─── 2. Lectura de la tabla por columna ─────────────────────────────────────
-- REVOKE a nivel de tabla también quita los privilegios de columna que hubiera: la lista de
-- abajo queda como la única fuente de verdad en cada ejecución.
REVOKE SELECT ON public.cooperativas FROM anon, authenticated;
GRANT SELECT (id, nombre, logo_url, estado, calificacion_promedio, total_calificaciones)
  ON public.cooperativas TO anon, authenticated;

-- ─── 3. Comprobaciones ──────────────────────────────────────────────────────
DO $$
DECLARE
  v_rol text;
  v_cols text;
  v_publicas constant text[] := ARRAY['id', 'nombre', 'logo_url', 'estado', 'calificacion_promedio', 'total_calificaciones'];
BEGIN
  FOREACH v_rol IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    -- has_*_privilege incluye lo heredado (PUBLIC y roles de los que es miembro).
    IF has_table_privilege(v_rol::name, 'public.cooperativas', 'SELECT') THEN
      RAISE EXCEPTION '% conserva SELECT sobre toda la tabla cooperativas (¿lo hereda de otro rol?)', v_rol;
    END IF;
    SELECT string_agg(a.attname::text, ', ' ORDER BY a.attnum) INTO v_cols
      FROM pg_attribute a
     WHERE a.attrelid = 'public.cooperativas'::regclass AND a.attnum > 0 AND NOT a.attisdropped
       AND has_column_privilege(v_rol::name, a.attrelid, a.attnum, 'SELECT')
       AND a.attname::text <> ALL (v_publicas);
    IF v_cols IS NOT NULL THEN
      RAISE EXCEPTION '% puede leer columnas privadas de cooperativas: %', v_rol, v_cols;
    END IF;
    SELECT string_agg(c, ', ') INTO v_cols
      FROM unnest(v_publicas) c
     WHERE NOT has_column_privilege(v_rol::name, 'public.cooperativas', c, 'SELECT');
    IF v_cols IS NOT NULL THEN
      RAISE EXCEPTION '% no puede leer columnas públicas de cooperativas: %', v_rol, v_cols;
    END IF;
  END LOOP;
  IF has_function_privilege('anon', 'public.fn_cooperativas_privadas()', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon puede ejecutar fn_cooperativas_privadas()';
  END IF;
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';
