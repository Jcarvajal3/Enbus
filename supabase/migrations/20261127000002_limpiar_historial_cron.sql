-- pg_cron guarda una fila por ejecución en cron.job_run_details y nunca la borra.
-- Con varias tareas cada minuto llegó a ~420 MB y llenó la base (límite 500 MB).
-- Limpieza diaria: historial de cron de más de 3 días y respuestas viejas de pg_net.
DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'limpiar_historial_cron') THEN
    PERFORM cron.unschedule('limpiar_historial_cron');
  END IF;
  PERFORM cron.schedule('limpiar_historial_cron', '47 4 * * *', $job$
    DELETE FROM cron.job_run_details WHERE start_time < now() - interval '3 days';
    DELETE FROM net._http_response WHERE created < now() - interval '1 day';
  $job$);
END $do$;
