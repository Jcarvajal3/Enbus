-- P3: Update pg_net para no hardcodear el PROJECT_REF y almacenarlo dinamicamente en Vault
SELECT cron.unschedule('procesar_notificaciones_pendientes');

SELECT cron.schedule(
  'procesar_notificaciones_pendientes', 
  '* * * * *', 
  $$
  DO $blk$
  DECLARE
    v_service_key text;
    v_project_url text;
  BEGIN
    -- Obteniendo de vault para produccion segura
    SELECT decrypted_secret INTO v_service_key FROM vault.decrypted_secrets WHERE name = 'service_role_key';
    SELECT decrypted_secret INTO v_project_url FROM vault.decrypted_secrets WHERE name = 'project_url';
    
    PERFORM net.http_post(
        url:= COALESCE(v_project_url, 'https://FALTA_URL_EN_VAULT.supabase.co') || '/functions/v1/procesar-notificaciones-pendientes',
        headers:=jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || COALESCE(v_service_key, 'FALTA_SERVICE_KEY_EN_VAULT')),
        body:='{}'::jsonb
    );
  END $blk$;
  $$
);
