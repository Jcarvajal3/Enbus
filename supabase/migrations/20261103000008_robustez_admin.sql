-- Robustez · Pedidos del agente del super admin (Audits/robustez/panel-admin.md §4).
--   1. fn_admin_totales_comision: ventas aprobadas por cooperativa en un período (hora de Venezuela),
--      sumadas en Postgres (PostgREST corta en 1.000 filas: el cliente sumaba de menos).
--   2. fn_admin_dashboard_actividad: conteos de los últimos N días, top de cooperativas y de rutas.
--   3. Índices: pagos por verificado_at (KPIs y comisiones), incidencias por estado y antigüedad.
--   4. Ciclos de comisión solapados: el UNIQUE solo frenaba períodos idénticos; dos generaciones
--      simultáneas con períodos que se pisan pasaban las dos. Ahora EXCLUDE (23P01).
--   5. Una sola incidencia de PERDIDA sin resolver por encomienda.
--   6. user_role(), user_cooperativa_id() e is_super_admin() ignoran perfiles eliminados
--      (eliminada_at): una cuenta dada de baja perdía sus datos pero conservaba permisos.
-- Ambas RPC exigen is_super_admin() y solo authenticated las ejecuta. Re-ejecutable.
BEGIN;

-- ─── 6. Funciones de RLS ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.user_role() RETURNS public.rol_usuario
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid() AND eliminada_at IS NULL;
$$;
CREATE OR REPLACE FUNCTION public.user_cooperativa_id() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT cooperativa_id FROM public.profiles WHERE id = auth.uid() AND eliminada_at IS NULL;
$$;
CREATE OR REPLACE FUNCTION public.is_super_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT coalesce(public.user_role() = 'super_admin', false);
$$;
REVOKE ALL ON FUNCTION public.user_role() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.user_cooperativa_id() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_super_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.user_role(), public.user_cooperativa_id(), public.is_super_admin()
  TO authenticated, service_role;

-- ─── 1. Totales para comisiones ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_admin_totales_comision(p_desde date, p_hasta date, p_cooperativa_id uuid DEFAULT NULL)
RETURNS TABLE (cooperativa_id uuid, total_boletos numeric, total_encomiendas numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
#variable_conflict use_column
BEGIN
  IF NOT coalesce(public.is_super_admin(), false) THEN
    PERFORM public._fallar('EB_SIN_PERMISO', 'Solo el equipo de EnBus puede calcular comisiones.');
  END IF;
  IF p_desde IS NULL OR p_hasta IS NULL OR p_hasta < p_desde OR p_hasta - p_desde > 400 THEN
    PERFORM public._fallar('EB_DATOS_INVALIDOS', 'Revisa las fechas del período.', '{"campo":"periodo"}');
  END IF;
  RETURN QUERY
  SELECT p.cooperativa_id,
         coalesce(sum(p.monto) FILTER (WHERE p.boleto_id IS NOT NULL AND b.estado IS DISTINCT FROM 'CANCELADO'), 0)::numeric,
         coalesce(sum(p.monto) FILTER (WHERE p.boleto_id IS NULL AND p.encomienda_id IS NOT NULL
                                         AND e.estado IS DISTINCT FROM 'CANCELADA'), 0)::numeric
    FROM public.pagos p
    LEFT JOIN public.boletos b ON b.id = p.boleto_id
    LEFT JOIN public.encomiendas e ON e.id = p.encomienda_id
   WHERE p.verificado
     AND p.verificado_at >= (p_desde::timestamp AT TIME ZONE 'America/Caracas')
     AND p.verificado_at <  ((p_hasta + 1)::timestamp AT TIME ZONE 'America/Caracas')
     AND (p_cooperativa_id IS NULL OR p.cooperativa_id = p_cooperativa_id)
   GROUP BY p.cooperativa_id;
END $$;
REVOKE ALL ON FUNCTION public.fn_admin_totales_comision(date, date, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_admin_totales_comision(date, date, uuid) TO authenticated;

-- ─── 2. Actividad del dashboard ──────────────────────────────────────────────
-- {actividad:[{fecha,encomiendas,boletos}], top_cooperativas:[{cooperativa_id,nombre,total}],
--  rutas:[{ciudad_origen,ciudad_destino,total}]}
CREATE OR REPLACE FUNCTION public.fn_admin_dashboard_actividad(p_dias integer DEFAULT 30)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_hoy date := (now() AT TIME ZONE 'America/Caracas')::date;
  v_dia0 date; v_desde timestamptz; v_res jsonb;
BEGIN
  IF NOT coalesce(public.is_super_admin(), false) THEN
    PERFORM public._fallar('EB_SIN_PERMISO', 'Solo el equipo de EnBus puede ver estas cifras.');
  END IF;
  v_dia0 := v_hoy - (least(greatest(coalesce(p_dias, 30), 1), 90) - 1);
  v_desde := v_dia0::timestamp AT TIME ZONE 'America/Caracas';
  WITH enc AS (
    SELECT e.cooperativa_id, e.ciudad_origen, e.ciudad_destino,
           (e.created_at AT TIME ZONE 'America/Caracas')::date AS dia
      FROM public.encomiendas e WHERE e.created_at >= v_desde
  ), bol AS (
    SELECT b.cooperativa_id, (b.created_at AT TIME ZONE 'America/Caracas')::date AS dia
      FROM public.boletos b WHERE b.created_at >= v_desde AND b.estado IN ('PAGADO', 'USADO')
  )
  SELECT jsonb_build_object(
    'actividad', (
      SELECT coalesce(jsonb_agg(jsonb_build_object('fecha', to_char(d, 'YYYY-MM-DD'),
                                                   'encomiendas', coalesce(ne.n, 0), 'boletos', coalesce(nb.n, 0))
                                ORDER BY d), '[]'::jsonb)
        FROM generate_series(v_dia0::timestamp, v_hoy::timestamp, interval '1 day') d
        LEFT JOIN (SELECT dia, count(*) n FROM enc GROUP BY dia) ne ON ne.dia = d::date
        LEFT JOIN (SELECT dia, count(*) n FROM bol GROUP BY dia) nb ON nb.dia = d::date),
    'top_cooperativas', (
      SELECT coalesce(jsonb_agg(jsonb_build_object('cooperativa_id', t.id, 'nombre', t.nombre, 'total', t.total)
                                ORDER BY t.total DESC, t.nombre), '[]'::jsonb)
        FROM (SELECT c.id, c.nombre, coalesce(ne.n, 0) + coalesce(nb.n, 0) AS total
                FROM public.cooperativas c
                LEFT JOIN (SELECT cooperativa_id, count(*) n FROM enc GROUP BY 1) ne ON ne.cooperativa_id = c.id
                LEFT JOIN (SELECT cooperativa_id, count(*) n FROM bol GROUP BY 1) nb ON nb.cooperativa_id = c.id
               ORDER BY 3 DESC, c.nombre LIMIT 5) t),
    'rutas', (
      SELECT coalesce(jsonb_agg(jsonb_build_object('ciudad_origen', r.o, 'ciudad_destino', r.d, 'total', r.n)
                                ORDER BY r.n DESC, r.o, r.d), '[]'::jsonb)
        FROM (SELECT min(ciudad_origen) o, min(ciudad_destino) d, count(*) n FROM enc
               WHERE ciudad_origen <> '' AND ciudad_destino <> ''
               GROUP BY public.normalizar_localidad(ciudad_origen), public.normalizar_localidad(ciudad_destino)
               ORDER BY 3 DESC LIMIT 5) r))
    INTO v_res;
  RETURN v_res;
END $$;
REVOKE ALL ON FUNCTION public.fn_admin_dashboard_actividad(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_admin_dashboard_actividad(integer) TO authenticated;

-- ─── 3. Índices ──────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_pagos_verificado_at ON public.pagos (verificado_at) WHERE verificado;
CREATE INDEX IF NOT EXISTS idx_incidencias_estado_fecha ON public.incidencias (estado, created_at);
DROP INDEX IF EXISTS public.idx_incidencias_estado;
CREATE INDEX IF NOT EXISTS idx_boletos_estado_fecha ON public.boletos (estado, created_at);
DROP INDEX IF EXISTS public.idx_boletos_estado;
CREATE INDEX IF NOT EXISTS idx_encomiendas_created_at ON public.encomiendas (created_at DESC);

-- ─── 4. Ciclos de comisión sin solapes ───────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA extensions;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ex_comisiones_ciclo_solape') THEN
    ALTER TABLE public.comisiones_ciclo ADD CONSTRAINT ex_comisiones_ciclo_solape
      EXCLUDE USING gist (cooperativa_id WITH =, daterange(periodo_inicio, periodo_fin, '[]') WITH &&);
  END IF;
END $$;

-- ─── 5. Una pérdida abierta por encomienda ───────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS uq_incidencia_perdida_abierta
  ON public.incidencias (encomienda_id) WHERE tipo = 'PERDIDA' AND estado <> 'RESUELTA';

COMMIT;
