-- Auditoría de escalabilidad E2: el cron llamaba a la edge function procesar-notificaciones-pendientes
-- cada minuto aunque no hubiera nada que hacer (1.440 invocaciones al día, descifrado del Vault y HTTP).
-- Ahora sigue revisando cada minuto (los avisos salen con el mismo retraso), pero solo llama a la
-- función si hay trabajo: avisos listos para tomar en la cola, o tickets de Expo cuyo recibo ya
-- se puede revisar (entre 15 min y 24 h, la misma ventana que revisarRecibos en _shared/push.ts).
-- Ambas comprobaciones usan índices parciales (idx_pending_notifications_cola e
-- idx_notificaciones_log_tickets_pendientes), así que cuestan casi nada con la cola vacía.
DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'procesar_notificaciones_pendientes') THEN
    PERFORM cron.unschedule('procesar_notificaciones_pendientes');
  END IF;
  PERFORM cron.schedule('procesar_notificaciones_pendientes', '* * * * *', $job$
    DO $blk$
    DECLARE v_key text; v_url text;
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM public.pending_notifications
                      WHERE NOT procesado AND (tomada_hasta IS NULL OR tomada_hasta < now()))
         AND NOT EXISTS (SELECT 1 FROM public.notificaciones_log
                          WHERE expo_ticket_id IS NOT NULL AND receipt_revisado_at IS NULL
                            AND canal = 'PUSH' AND estado_envio = 'ENVIADO'
                            AND created_at < now() - interval '15 minutes'
                            AND created_at > now() - interval '24 hours') THEN
        RETURN;
      END IF;
      SELECT decrypted_secret INTO v_key FROM vault.decrypted_secrets WHERE name = 'service_role_key';
      SELECT decrypted_secret INTO v_url FROM vault.decrypted_secrets WHERE name = 'project_url';
      PERFORM net.http_post(
        url := COALESCE(v_url, 'https://FALTA_URL_EN_VAULT.supabase.co') || '/functions/v1/procesar-notificaciones-pendientes',
        headers := jsonb_build_object('Content-Type', 'application/json',
                                      'Authorization', 'Bearer ' || COALESCE(v_key, 'FALTA_SERVICE_KEY_EN_VAULT')),
        body := '{}'::jsonb,
        timeout_milliseconds := 30000);
    END $blk$;
  $job$);
END $do$;
