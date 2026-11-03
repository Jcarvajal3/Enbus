-- Robustez · Pedidos del agente de edge functions (Audits/robustez/edge-functions.md §4).
--   A. notificaciones_log: id del ticket de Expo y revisión del recibo (enviar-push guarda el ticket
--      y luego revisa el recibo; si la columna no existe, la función lo omite).
--   B. Un token push en un solo perfil: la app no lo borra al cerrar sesión; si otra persona entra en
--      el mismo teléfono, los dos perfiles quedaban con el mismo token y el teléfono recibía los avisos
--      (con PIN) de ambas cuentas. Al asignar el token a un perfil se quita de los demás.
--   C. Los cron que llaman a edge functions esperan hasta 30 s (antes 5 s por defecto: pg_net marcaba
--      timed_out aunque la función terminara bien).
--   D. tracking_id: mismo formato EB-AAMMDD-NNNNN (lo validan app, panel, landing y funciones), pero la
--      parte aleatoria sale de gen_random_uuid() (aleatoriedad criptográfica, no predecible) en vez de
--      random(); la fecha ya es la de Venezuela (20261103000003).
--   E. fn_rastrear_encomienda_publico compara tracking_id = upper(…) (usa el índice único; antes
--      upper(tracking_id) = … recorría la tabla).
-- Re-ejecutable.
BEGIN;

-- ─── A ───────────────────────────────────────────────────────────────────────
ALTER TABLE public.notificaciones_log
  ADD COLUMN IF NOT EXISTS expo_ticket_id      text,
  ADD COLUMN IF NOT EXISTS receipt_revisado_at timestamptz;
CREATE INDEX IF NOT EXISTS idx_notificaciones_log_tickets_pendientes
  ON public.notificaciones_log (created_at)
  WHERE expo_ticket_id IS NOT NULL AND receipt_revisado_at IS NULL;

-- ─── B ───────────────────────────────────────────────────────────────────────
-- Tokens ya repetidos: se queda el perfil actualizado más recientemente.
UPDATE public.profiles p SET expo_push_token = NULL
  FROM (SELECT id, row_number() OVER (PARTITION BY expo_push_token ORDER BY updated_at DESC, id) AS rn
          FROM public.profiles WHERE expo_push_token IS NOT NULL) d
 WHERE p.id = d.id AND d.rn > 1;

CREATE OR REPLACE FUNCTION public.expo_token_unico_fn()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  UPDATE public.profiles SET expo_push_token = NULL
   WHERE expo_push_token = NEW.expo_push_token AND id <> NEW.id;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.expo_token_unico_fn() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS expo_token_unico ON public.profiles;
CREATE TRIGGER expo_token_unico AFTER INSERT OR UPDATE OF expo_push_token ON public.profiles
  FOR EACH ROW WHEN (NEW.expo_push_token IS NOT NULL) EXECUTE FUNCTION public.expo_token_unico_fn();
CREATE INDEX IF NOT EXISTS idx_profiles_expo_push_token ON public.profiles (expo_push_token)
  WHERE expo_push_token IS NOT NULL;

-- ─── C ───────────────────────────────────────────────────────────────────────
DO $do$
DECLARE j record;
BEGIN
  FOR j IN SELECT * FROM (VALUES ('procesar_notificaciones_pendientes', '* * * * *', 'procesar-notificaciones-pendientes'),
                                 ('actualizar_tasa_bcv', '*/30 * * * *', 'actualizar-tasa-bcv')) AS t(nombre, horario, funcion) LOOP
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = j.nombre) THEN
      PERFORM cron.unschedule(j.nombre);
    END IF;
    PERFORM cron.schedule(j.nombre, j.horario, format($job$
      DO $blk$
      DECLARE v_key text; v_url text;
      BEGIN
        SELECT decrypted_secret INTO v_key FROM vault.decrypted_secrets WHERE name = 'service_role_key';
        SELECT decrypted_secret INTO v_url FROM vault.decrypted_secrets WHERE name = 'project_url';
        PERFORM net.http_post(
          url := COALESCE(v_url, 'https://FALTA_URL_EN_VAULT.supabase.co') || '/functions/v1/%s',
          headers := jsonb_build_object('Content-Type', 'application/json',
                                        'Authorization', 'Bearer ' || COALESCE(v_key, 'FALTA_SERVICE_KEY_EN_VAULT')),
          body := '{}'::jsonb,
          timeout_milliseconds := 30000);
      END $blk$;
    $job$, j.funcion));
  END LOOP;
END $do$;

-- ─── D ───────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.generar_tracking_id_fn()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE v_fecha text := to_char(now() AT TIME ZONE 'America/Caracas', 'YYMMDD'); v_id text; b bytea;
BEGIN
  -- Reintentos acotados: con 100.000 códigos por día, 50 choques seguidos solo pasan si el día está
  -- casi lleno; antes el bucle no terminaba nunca.
  FOR i IN 1..50 LOOP
    b := uuid_send(gen_random_uuid());   -- los 4 primeros bytes son aleatorios (pg_strong_random)
    v_id := 'EB-' || v_fecha || '-'
            || lpad((((get_byte(b, 0)::bigint << 24) | (get_byte(b, 1) << 16) | (get_byte(b, 2) << 8)
                      | get_byte(b, 3)) % 100000)::text, 5, '0');
    IF NOT EXISTS (SELECT 1 FROM public.encomiendas WHERE tracking_id = v_id) THEN
      NEW.tracking_id := v_id;
      RETURN NEW;
    END IF;
  END LOOP;
  RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'EB_TRACKING_NO_DISPONIBLE',
    HINT = 'No pudimos generar el código de seguimiento. Intenta de nuevo en unos segundos.';
END $$;
REVOKE ALL ON FUNCTION public.generar_tracking_id_fn() FROM PUBLIC, anon, authenticated;

-- ─── E ───────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_rastrear_encomienda_publico(p_tracking text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_e record;
BEGIN
  SELECT e.id, e.tracking_id, e.estado, e.estado_origen, e.ciudad_origen, e.estado_destino, e.ciudad_destino,
         e.created_at, e.updated_at, c.nombre AS cooperativa
    INTO v_e
    FROM public.encomiendas e LEFT JOIN public.cooperativas c ON c.id = e.cooperativa_id
   WHERE e.tracking_id = upper(btrim(coalesce(p_tracking, '')));   -- los códigos se guardan en mayúsculas
  IF NOT FOUND THEN RETURN NULL; END IF;
  RETURN jsonb_build_object(
    'tracking_id', v_e.tracking_id, 'estado', v_e.estado, 'cooperativa', v_e.cooperativa,
    'origen', jsonb_build_object('estado', v_e.estado_origen, 'ciudad', v_e.ciudad_origen),
    'destino', jsonb_build_object('estado', v_e.estado_destino, 'ciudad', v_e.ciudad_destino),
    'creada_at', v_e.created_at, 'actualizada_at', v_e.updated_at,
    'historial', coalesce((SELECT jsonb_agg(jsonb_build_object('estado', h.estado_nuevo, 'fecha', h.created_at)
                                            ORDER BY h.created_at)
                             FROM public.encomienda_estado_historial h WHERE h.encomienda_id = v_e.id), '[]'::jsonb));
END $$;
REVOKE ALL ON FUNCTION public.fn_rastrear_encomienda_publico(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_rastrear_encomienda_publico(text) TO service_role;

COMMIT;
