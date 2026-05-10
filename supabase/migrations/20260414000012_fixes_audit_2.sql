-- M-03: Actualizar schedule del CRON a las 6 AM (0 6 * * *)
SELECT cron.unschedule('auto_devolver_encomienda');
SELECT cron.schedule('auto_devolver_encomienda', '0 6 * * *', 'SELECT public.auto_devolver_encomienda();');

-- N-01: Update pg_net para usar el service_role key y URL correcta
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
    -- Intentamos extraer las credenciales y configuraciones desde el vault (La forma recomendada en Supabase Prod)
    -- Asume que configuraste supabase vault: 
    -- select vault.create_secret('tu-service-role', 'service_role_key');
    -- select vault.create_secret('https://tydpnvajwfzcsxsowctp.supabase.co', 'project_url');
    SELECT decrypted_secret INTO v_service_key FROM vault.decrypted_secrets WHERE name = 'service_role_key';
    SELECT decrypted_secret INTO v_project_url FROM vault.decrypted_secrets WHERE name = 'project_url';
    
    -- Usar pg_net apuntando al webhook compuesto dinamicamente
    PERFORM net.http_post(
        url:= COALESCE(v_project_url, 'https://FALTA_URL_EN_VAULT.supabase.co') || '/functions/v1/procesar-notificaciones-pendientes',
        headers:=jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || COALESCE(v_service_key, 'FALTA_SERVICE_KEY_EN_VAULT')),
        body:='{}'::jsonb
    );
  END $blk$;
  $$
);

-- M-02: Politica oficial de "5 días hábiles" en servidor SQL.
-- Al no tener tabla de feriados en la V1, 5 días hábiles se estandarizan a 7 días naturales (incluyendo el fin de semana).
CREATE OR REPLACE FUNCTION public.auto_devolver_encomienda()
RETURNS void AS $$
DECLARE
  pkg RECORD;
BEGIN
  -- Se cuenta 7 dias naturales como el equivalente estándar a 5 dias habiles
  FOR pkg IN 
    SELECT id, tracking_id, sender_id 
    FROM public.encomiendas 
    WHERE estado = 'EN_OFICINA_DESTINO' 
      AND updated_at < now() - interval '7 days'
  LOOP
    UPDATE public.encomiendas
    SET estado = 'DEVUELTA'
    WHERE id = pkg.id;

    INSERT INTO public.pending_notifications (destinatario_id, recurso_tipo, recurso_id, tipo_notificacion, payload)
    VALUES (pkg.sender_id, 'encomienda', pkg.id, 'DEVOLUCION_AUTOMATICA', jsonb_build_object('tracking_id', pkg.tracking_id));
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
