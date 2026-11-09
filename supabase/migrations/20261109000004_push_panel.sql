-- Notificaciones push (Web Push) del panel de cooperativas instalado como web app.
--   1. panel_push_suscripciones: una fila por navegador/dispositivo del personal (endpoint único).
--      Cada usuario ve y borra solo las suyas; el alta va por fn_guardar_push_panel (valida el rol y
--      reasigna el endpoint si el navegador lo usaba otra persona). La edge function push-panel las lee
--      con la service role.
--   2. panel_push_cola: un aviso por pago (UNIQUE pago_id + tipo). Es una cola aparte de
--      pending_notifications porque esa la consume procesar-notificaciones-pendientes (push de Expo a
--      clientes de la app) y aquí los destinatarios son todos los equipos del personal.
--   3. Disparador AFTER INSERT en pagos: un pago DIGITAL sin verificar ni rechazar (lo crean
--      fn_checkout_boletos —uno por compra aunque tenga varios boletos— y fn_registrar_pago_encomienda,
--      también al volver a reportar tras un rechazo) se encola solo si la cooperativa tiene equipos
--      suscritos, y se pide a push-panel que lo envíe ya (pg_net, tras el COMMIT). Si algo de eso
--      falla, el pago se guarda igual: el cron lo recoge.
--   4. fn_tomar_push_panel / fn_resultado_push_panel (solo service role): reclamo atómico (FOR UPDATE
--      SKIP LOCKED + reserva) y resultado (suscripciones usadas, caducadas o con fallos; reintentos).
--   5. Cron 'procesar_push_panel' cada minuto (solo llama a la función si hay avisos pendientes) y
--      limpieza diaria.
-- La clave pública VAPID va en el panel (NEXT_PUBLIC_VAPID_PUBLIC_KEY) y el par completo en los
-- secretos de la función (Audits/pendientes_push_panel.md).
-- Re-ejecutable.
BEGIN;

-- ─── 1. Suscripciones ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.panel_push_suscripciones (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  cooperativa_id uuid NOT NULL REFERENCES public.cooperativas(id) ON DELETE CASCADE,
  endpoint       text NOT NULL,
  p256dh         text NOT NULL,
  auth           text NOT NULL,
  user_agent     text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  last_used_at   timestamptz,
  fallos         integer NOT NULL DEFAULT 0,
  CONSTRAINT uq_panel_push_endpoint UNIQUE (endpoint),
  CONSTRAINT chk_panel_push_valores CHECK (
    endpoint ~ '^https://' AND length(endpoint) <= 1024
    AND p256dh ~ '^[A-Za-z0-9_-]{80,100}$' AND auth ~ '^[A-Za-z0-9_-]{16,32}$'
    AND (user_agent IS NULL OR length(user_agent) <= 300) AND fallos >= 0)
);
COMMENT ON TABLE public.panel_push_suscripciones IS
  'Navegadores del personal (admin_cooperativa y taquilleros) que activaron las notificaciones push del panel.';
CREATE INDEX IF NOT EXISTS idx_panel_push_suscripciones_coop ON public.panel_push_suscripciones (cooperativa_id);
CREATE INDEX IF NOT EXISTS idx_panel_push_suscripciones_user ON public.panel_push_suscripciones (user_id);

ALTER TABLE public.panel_push_suscripciones ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Push panel: ver las propias" ON public.panel_push_suscripciones;
DROP POLICY IF EXISTS "Push panel: borrar las propias" ON public.panel_push_suscripciones;
CREATE POLICY "Push panel: ver las propias" ON public.panel_push_suscripciones FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));
CREATE POLICY "Push panel: borrar las propias" ON public.panel_push_suscripciones FOR DELETE TO authenticated
  USING (user_id = (select auth.uid()));
-- Altas y cambios solo por fn_guardar_push_panel (SECURITY DEFINER).
REVOKE ALL ON public.panel_push_suscripciones FROM PUBLIC, anon;
REVOKE INSERT, UPDATE, TRUNCATE, TRIGGER, REFERENCES ON public.panel_push_suscripciones FROM authenticated;
GRANT SELECT, DELETE ON public.panel_push_suscripciones TO authenticated;
GRANT ALL ON public.panel_push_suscripciones TO service_role;

-- Servicios de push conocidos (Chrome/Edge/Android, Firefox, Safari/iOS, Windows). Evita que la edge
-- function haga POST a cualquier URL que alguien registre. push-panel aplica la misma lista.
CREATE OR REPLACE FUNCTION public._endpoint_push_valido(p_endpoint text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp AS $$
  SELECT coalesce(length(p_endpoint) <= 1024 AND p_endpoint ~* (
    '^https://(fcm\.googleapis\.com|android\.googleapis\.com|updates\.push\.services\.mozilla\.com'
    || '|[a-z0-9.-]+\.push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9.-]+\.push\.apple\.com'
    || '|[a-z0-9.-]+\.notify\.windows\.com)/'), false);
$$;
REVOKE ALL ON FUNCTION public._endpoint_push_valido(text) FROM PUBLIC, anon, authenticated;

-- Guarda (o reasigna) la suscripción de este navegador al usuario actual. Solo personal activo de
-- una cooperativa. Un mismo navegador es de una sola persona: si otra lo tenía, pasa a la actual.
-- Tope de 10 equipos por usuario (se borran los más viejos).
CREATE OR REPLACE FUNCTION public.fn_guardar_push_panel(p_endpoint text, p_p256dh text, p_auth text,
                                                        p_user_agent text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_ctx record; v_id uuid;
BEGIN
  SELECT * INTO v_ctx FROM public._contexto_staff();
  IF NOT public._endpoint_push_valido(btrim(coalesce(p_endpoint, '')))
     OR coalesce(p_p256dh, '') !~ '^[A-Za-z0-9_-]{80,100}$'
     OR coalesce(p_auth, '') !~ '^[A-Za-z0-9_-]{16,32}$' THEN
    PERFORM public._fallar('EB_DATOS_INVALIDOS',
      'Este navegador no entregó una suscripción válida. Usa Chrome, Edge, Firefox o Safari actualizados.');
  END IF;
  INSERT INTO public.panel_push_suscripciones (user_id, cooperativa_id, endpoint, p256dh, auth, user_agent)
  VALUES (v_ctx.o_uid, v_ctx.o_cooperativa_id, btrim(p_endpoint), p_p256dh, p_auth,
          nullif(left(btrim(coalesce(p_user_agent, '')), 300), ''))
  ON CONFLICT (endpoint) DO UPDATE
    SET user_id = EXCLUDED.user_id, cooperativa_id = EXCLUDED.cooperativa_id, p256dh = EXCLUDED.p256dh,
        auth = EXCLUDED.auth, user_agent = coalesce(EXCLUDED.user_agent, panel_push_suscripciones.user_agent),
        updated_at = now(), fallos = 0
  RETURNING id INTO v_id;
  DELETE FROM public.panel_push_suscripciones s
   WHERE s.user_id = v_ctx.o_uid
     AND s.id NOT IN (SELECT q.id FROM public.panel_push_suscripciones q WHERE q.user_id = v_ctx.o_uid
                       ORDER BY q.updated_at DESC LIMIT 10);
  RETURN jsonb_build_object('id', v_id, 'activa', true);
END $$;
REVOKE ALL ON FUNCTION public.fn_guardar_push_panel(text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_guardar_push_panel(text, text, text, text) TO authenticated;

-- ─── 2. Cola ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.panel_push_cola (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo           text NOT NULL DEFAULT 'PAGO_POR_VERIFICAR',
  pago_id        uuid NOT NULL REFERENCES public.pagos(id) ON DELETE CASCADE,
  cooperativa_id uuid NOT NULL REFERENCES public.cooperativas(id) ON DELETE CASCADE,
  procesado      boolean NOT NULL DEFAULT false,
  intentos       integer NOT NULL DEFAULT 0,
  tomada_hasta   timestamptz,
  enviados       integer,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_panel_push_cola UNIQUE (pago_id, tipo),
  CONSTRAINT chk_panel_push_cola_tipo CHECK (tipo IN ('PAGO_POR_VERIFICAR'))
);
COMMENT ON TABLE public.panel_push_cola IS
  'Avisos push para el personal del panel (los envía la edge function push-panel). Un aviso por pago.';
CREATE INDEX IF NOT EXISTS idx_panel_push_cola_pendientes ON public.panel_push_cola (created_at) WHERE NOT procesado;
ALTER TABLE public.panel_push_cola ENABLE ROW LEVEL SECURITY;   -- sin políticas: solo service role
REVOKE ALL ON public.panel_push_cola FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.panel_push_cola TO service_role;

-- ─── 3. Disparador en pagos ──────────────────────────────────────────────────
-- Pide a push-panel que procese la cola. pg_net encola la petición en la transacción y la envía
-- después del COMMIT (si el pago se revierte, no sale nada). Sin vault o sin pg_net no hace nada:
-- el cron de cada minuto envía el aviso.
CREATE OR REPLACE FUNCTION public._despertar_push_panel()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_key text; v_url text;
BEGIN
  SELECT decrypted_secret INTO v_key FROM vault.decrypted_secrets WHERE name = 'service_role_key';
  SELECT decrypted_secret INTO v_url FROM vault.decrypted_secrets WHERE name = 'project_url';
  IF v_key IS NULL OR v_url IS NULL THEN RETURN; END IF;
  PERFORM net.http_post(
    url := v_url || '/functions/v1/push-panel',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_key),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000);
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING '[push-panel] no se pudo pedir el envío inmediato: %', SQLERRM;
END $$;
REVOKE ALL ON FUNCTION public._despertar_push_panel() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.encolar_push_pago_fn()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  -- Sin equipos suscritos en la cooperativa no hay a quién avisar.
  IF NOT EXISTS (SELECT 1 FROM public.panel_push_suscripciones s WHERE s.cooperativa_id = NEW.cooperativa_id) THEN
    RETURN NULL;
  END IF;
  BEGIN
    INSERT INTO public.panel_push_cola (tipo, pago_id, cooperativa_id)
    VALUES ('PAGO_POR_VERIFICAR', NEW.id, NEW.cooperativa_id)
    ON CONFLICT (pago_id, tipo) DO NOTHING;
    PERFORM public._despertar_push_panel();
  EXCEPTION WHEN OTHERS THEN
    -- Un aviso nunca debe impedir que el cliente registre su pago.
    RAISE WARNING '[push-panel] no se pudo encolar el aviso del pago %: %', NEW.id, SQLERRM;
  END;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.encolar_push_pago_fn() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS zz_push_pago_por_verificar ON public.pagos;
CREATE TRIGGER zz_push_pago_por_verificar AFTER INSERT ON public.pagos
  FOR EACH ROW
  WHEN (NEW.tipo_pago = 'DIGITAL' AND NOT NEW.verificado AND NEW.rechazado_at IS NULL)
  EXECUTE FUNCTION public.encolar_push_pago_fn();

-- ─── 4. RPC de la edge function ──────────────────────────────────────────────
-- Reclama hasta p_limite avisos (reserva p_segundos) y devuelve lo necesario para el texto, sin
-- datos sensibles: tipo, cantidad de boletos, monto esperado en la moneda del pago, nombre corto del
-- cliente (nombre + inicial) y las suscripciones del personal vigente de la cooperativa (admin y
-- taquilleros sin eliminar ni desactivar). pendiente = false si el pago ya se aprobó o rechazó.
DROP FUNCTION IF EXISTS public.fn_tomar_push_panel(integer, integer);
CREATE FUNCTION public.fn_tomar_push_panel(p_limite integer DEFAULT 50, p_segundos integer DEFAULT 120)
RETURNS TABLE (
  cola_id uuid, pago_id uuid, cooperativa_id uuid, intentos integer, creado_at timestamptz,
  pendiente boolean, tipo_recurso text, n_boletos integer, moneda text, monto numeric, cliente text,
  suscripciones jsonb
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
#variable_conflict use_column
BEGIN
  RETURN QUERY
  WITH tomadas AS (
    UPDATE public.panel_push_cola c
       SET tomada_hasta = now() + make_interval(secs => greatest(coalesce(p_segundos, 120), 10)),
           intentos = c.intentos + 1
     WHERE c.id IN (SELECT q.id FROM public.panel_push_cola q
                     WHERE NOT q.procesado AND (q.tomada_hasta IS NULL OR q.tomada_hasta < now())
                     ORDER BY q.created_at
                     LIMIT greatest(1, least(coalesce(p_limite, 50), 200))
                       FOR UPDATE SKIP LOCKED)
    RETURNING c.*
  )
  SELECT t.id, t.pago_id, t.cooperativa_id, t.intentos, t.created_at,
         (NOT p.verificado AND p.rechazado_at IS NULL),
         CASE WHEN p.encomienda_id IS NOT NULL THEN 'encomienda' ELSE 'boleto' END,
         CASE WHEN p.encomienda_id IS NOT NULL THEN 0
              ELSE greatest(1, (SELECT count(*)::integer FROM public.boletos b WHERE b.pago_id = p.id)) END,
         p.moneda,
         CASE WHEN p.moneda = 'USD' THEN p.monto::numeric ELSE coalesce(p.monto_bs, p.monto::numeric) END,
         nullif(btrim(split_part(btrim(coalesce(pr.nombre_completo, '')), ' ', 1)
                || coalesce(' ' || nullif(upper(left(split_part(btrim(coalesce(pr.nombre_completo, '')), ' ', 2), 1)), '') || '.', '')), ''),
         coalesce((SELECT jsonb_agg(jsonb_build_object('id', s.id, 'endpoint', s.endpoint,
                                                       'p256dh', s.p256dh, 'auth', s.auth))
                     FROM public.panel_push_suscripciones s
                     JOIN public.profiles e ON e.id = s.user_id
                    WHERE s.cooperativa_id = t.cooperativa_id
                      AND e.cooperativa_id = t.cooperativa_id
                      AND e.role IN ('taquillero', 'admin_cooperativa')
                      AND e.eliminada_at IS NULL
                      AND NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = e.id AND u.banned_until > now())),
                  '[]'::jsonb)
    FROM tomadas t
    JOIN public.pagos p ON p.id = t.pago_id
    LEFT JOIN public.profiles pr ON pr.id = p.pagador_id;
END $$;
REVOKE ALL ON FUNCTION public.fn_tomar_push_panel(integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_tomar_push_panel(integer, integer) TO service_role;

-- Resultado de una pasada de push-panel:
--   p_hechos: avisos terminados (procesado). p_reintentar: vuelven a la cola con espera 1, 2, 4… min.
--   p_ok: suscripciones que recibieron el push. p_caducadas: el servicio respondió 404/410 (se borran).
--   p_fallidas: otro error definitivo (fallos + 1; con 10 seguidos se borra).
DROP FUNCTION IF EXISTS public.fn_resultado_push_panel(jsonb);
CREATE FUNCTION public.fn_resultado_push_panel(p_resultado jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_hechos uuid[] := ARRAY(SELECT jsonb_array_elements_text(coalesce(p_resultado->'hechos', '[]')))::uuid[];
  v_reint uuid[] := ARRAY(SELECT jsonb_array_elements_text(coalesce(p_resultado->'reintentar', '[]')))::uuid[];
  v_ok uuid[] := ARRAY(SELECT jsonb_array_elements_text(coalesce(p_resultado->'ok', '[]')))::uuid[];
  v_cad uuid[] := ARRAY(SELECT jsonb_array_elements_text(coalesce(p_resultado->'caducadas', '[]')))::uuid[];
  v_fal uuid[] := ARRAY(SELECT jsonb_array_elements_text(coalesce(p_resultado->'fallidas', '[]')))::uuid[];
BEGIN
  UPDATE public.panel_push_cola c
     SET procesado = true,
         enviados = (SELECT (x->>'enviados')::integer FROM jsonb_array_elements(coalesce(p_resultado->'enviados', '[]')) x
                      WHERE x->>'cola_id' = c.id::text LIMIT 1)
   WHERE c.id = ANY (v_hechos);
  UPDATE public.panel_push_cola c
     SET tomada_hasta = now() + make_interval(mins => least(2 ^ greatest(c.intentos - 1, 0), 60)::integer)
   WHERE c.id = ANY (v_reint) AND NOT c.procesado;
  UPDATE public.panel_push_suscripciones SET last_used_at = now(), fallos = 0 WHERE id = ANY (v_ok);
  DELETE FROM public.panel_push_suscripciones WHERE id = ANY (v_cad);
  UPDATE public.panel_push_suscripciones SET fallos = fallos + 1 WHERE id = ANY (v_fal);
  DELETE FROM public.panel_push_suscripciones WHERE id = ANY (v_fal) AND fallos >= 10;
END $$;
REVOKE ALL ON FUNCTION public.fn_resultado_push_panel(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_resultado_push_panel(jsonb) TO service_role;

-- ─── 5. Cron ─────────────────────────────────────────────────────────────────
-- Cada minuto, y solo si hay avisos pendientes (no gasta invocaciones con la cola vacía). Mismo
-- mecanismo que los demás cron HTTP (20261103000007): URL y service role del vault, 30 s de espera.
DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'procesar_push_panel') THEN
    PERFORM cron.unschedule('procesar_push_panel');
  END IF;
  PERFORM cron.schedule('procesar_push_panel', '* * * * *', $job$
    DO $blk$
    BEGIN
      IF EXISTS (SELECT 1 FROM public.panel_push_cola
                  WHERE NOT procesado AND (tomada_hasta IS NULL OR tomada_hasta < now())) THEN
        PERFORM public._despertar_push_panel();
      END IF;
    END $blk$;
  $job$);

  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'limpiar_push_panel') THEN
    PERFORM cron.unschedule('limpiar_push_panel');
  END IF;
  -- Avisos de más de 7 días (enviados o no: ya no son oportunos) y equipos sin uso en 90 días.
  PERFORM cron.schedule('limpiar_push_panel', '37 4 * * *', $job$
    DELETE FROM public.panel_push_cola WHERE created_at < now() - interval '7 days';
    DELETE FROM public.panel_push_suscripciones
     WHERE coalesce(last_used_at, updated_at) < now() - interval '90 days';
  $job$);
END $do$;

NOTIFY pgrst, 'reload schema';

COMMIT;
