-- Robustez · Permisos de funciones y de tablas (auditoría de robustez, 2026-11-03).
--   1. search_path fijo en todas las funciones de public que no lo tenían (advisor
--      function_search_path_mutable): una función SECURITY DEFINER o de trigger con search_path
--      mutable puede resolver objetos de otro esquema que ponga el llamador.
--   2. Las funciones de trigger y las de cron no se pueden llamar por /rest/v1/rpc: se revoca
--      EXECUTE a PUBLIC, anon y authenticated (los triggers se disparan igual: PostgreSQL no
--      comprueba EXECUTE al dispararlos; el cron corre como postgres).
--   3. fn_tasa_bcv_vigente y fn_sucursales_en_ciudad pasan a SECURITY INVOKER (leen tablas que
--      el llamador ya puede leer por RLS). fn_rutas_populares y fn_estadisticas_publicas solo
--      las usa la landing con service role.
--   4. anon no escribe en ninguna tabla; nadie de la API hace TRUNCATE (no pasa por RLS).
--   5. pg_net sale del esquema public (advisor extension_in_public).
-- Re-ejecutable.
BEGIN;

-- ─── 1. search_path fijo ─────────────────────────────────────────────────────
DO $$
DECLARE f record;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure AS sig
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.prokind = 'f'
       AND NOT EXISTS (SELECT 1 FROM unnest(coalesce(p.proconfig, '{}')) c WHERE c LIKE 'search_path=%')
       AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid = 'pg_proc'::regclass
                                                  AND d.objid = p.oid AND d.deptype = 'e')
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = public, pg_temp', f.sig);
  END LOOP;
END $$;

-- ─── 2. Funciones que no son RPC ─────────────────────────────────────────────
-- Trigger del cierre de escrituras directas (20260719000006): ya no hay trigger que la use.
DROP TRIGGER IF EXISTS vincular_pago_legado ON public.pagos;
DROP FUNCTION IF EXISTS public.vincular_pago_legado_fn();

DO $$
DECLARE f record;
BEGIN
  -- Todas las funciones de trigger de public.
  FOR f IN SELECT p.oid::regprocedure AS sig
             FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public' AND p.prorettype = 'trigger'::regtype
              AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid = 'pg_proc'::regclass
                                                         AND d.objid = p.oid AND d.deptype = 'e') LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', f.sig);
  END LOOP;
  -- Funciones de cron (solo postgres / service role).
  FOR f IN SELECT p.oid::regprocedure AS sig
             FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public'
              AND p.proname IN ('auto_expirar_reserva', 'auto_devolver_encomienda', 'alerta_amarilla_72h',
                                'fn_activar_tarifas_programadas', 'fn_limpiar_limites_uso') LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', f.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f.sig);
  END LOOP;
END $$;

-- ─── 3. Funciones públicas ───────────────────────────────────────────────────
-- tasas_bcv es de lectura pública (RLS "true"): no hace falta SECURITY DEFINER.
ALTER FUNCTION public.fn_tasa_bcv_vigente() SECURITY INVOKER;
GRANT EXECUTE ON FUNCTION public.fn_tasa_bcv_vigente() TO anon, authenticated, service_role;
-- sucursales: cualquier autenticado las lee (RLS); la RPC solo filtra por ciudad normalizada.
ALTER FUNCTION public.fn_sucursales_en_ciudad(uuid, text) SECURITY INVOKER;
-- Solo la landing (service role) las usa.
REVOKE ALL ON FUNCTION public.fn_rutas_populares(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_estadisticas_publicas() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_rutas_populares(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_estadisticas_publicas() TO service_role;

-- ─── 4. Privilegios de tabla ─────────────────────────────────────────────────
DO $$
DECLARE t record;
BEGIN
  FOR t IN SELECT c.oid::regclass AS rel, c.relkind
             FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'public' AND c.relkind IN ('r', 'v', 'p') LOOP
    EXECUTE format('REVOKE INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER, REFERENCES ON %s FROM anon', t.rel);
    EXECUTE format('REVOKE TRUNCATE, TRIGGER, REFERENCES ON %s FROM authenticated', t.rel);
    IF t.relkind = 'v' THEN   -- las vistas son de lectura
      EXECUTE format('REVOKE INSERT, UPDATE, DELETE ON %s FROM authenticated', t.rel);
    END IF;
  END LOOP;
END $$;

-- ─── 5. pg_net fuera de public ───────────────────────────────────────────────
-- pg_net no se puede mover con SET SCHEMA: se recrea en "extensions". Sus funciones viven en el
-- esquema "net" en ambos casos, así que los cron (net.http_post) siguen igual. Se pierde la cola
-- de peticiones en vuelo (como mucho la de este minuto).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace
              WHERE e.extname = 'pg_net' AND n.nspname = 'public') THEN
    DROP EXTENSION pg_net;
    CREATE EXTENSION pg_net WITH SCHEMA extensions;
  ELSIF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    CREATE EXTENSION pg_net WITH SCHEMA extensions;
  END IF;
END $$;

COMMIT;
