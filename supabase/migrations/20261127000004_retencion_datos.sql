-- Auditoría de escalabilidad E3: retención de datos para que la base no crezca sin límite.
-- Solo se borra lo que no tiene valor de negocio. Nada que tenga dinero de por medio
-- (pagos, reembolsos, boletos pagados o usados, encomiendas y su historial) se toca.
--
--  · pending_notifications procesadas: 30 días (ya existía).
--  · notificaciones_log (registro de envíos push, correo, WhatsApp; lo ve el super admin
--    en la ficha del usuario): 90 días.
--  · notificaciones_usuario (bandeja de la app, que muestra las 50 últimas):
--    leídas 90 días, sin leer 180 días.
--  · boletos abandonados: reservas EXPIRADAS y boletos CANCELADOS antes de pagar (cada cambio
--    de asiento deja uno). Hoy son el 77 % de la tabla. Se borran a los 90 días si no tienen
--    pago, reembolso ni calificación, y el viaje salió hace más de 30 días.
--    El trigger actualizar_asientos no cambia los cupos al borrar estos estados; las
--    incidencias que los nombren quedan con boleto_id NULL (FK ON DELETE SET NULL).
--
-- Se borra en lotes (5.000 por tabla y ejecución) para no bloquear mucho tiempo; el cron es diario.

CREATE OR REPLACE FUNCTION public.fn_limpiar_notificaciones()
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  DELETE FROM public.pending_notifications WHERE procesado AND created_at < now() - interval '30 days';
  -- Avisos que nunca se pudieron enviar en una semana: ya no son oportunos.
  UPDATE public.pending_notifications SET procesado = true
   WHERE NOT procesado AND created_at < now() - interval '7 days';

  DELETE FROM public.notificaciones_log
   WHERE id IN (SELECT id FROM public.notificaciones_log
                 WHERE created_at < now() - interval '90 days' LIMIT 5000);

  DELETE FROM public.notificaciones_usuario
   WHERE id IN (SELECT id FROM public.notificaciones_usuario
                 WHERE (leida AND created_at < now() - interval '90 days')
                    OR created_at < now() - interval '180 days'
                 LIMIT 5000);
$$;
REVOKE ALL ON FUNCTION public.fn_limpiar_notificaciones() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_limpiar_notificaciones() TO service_role;

CREATE OR REPLACE FUNCTION public.fn_limpiar_boletos_abandonados()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_borrados integer;
BEGIN
  DELETE FROM public.boletos b
   WHERE b.id IN (
     SELECT x.id
       FROM public.boletos x JOIN public.viajes v ON v.id = x.viaje_id
      WHERE x.estado IN ('EXPIRADO', 'CANCELADO')
        AND x.pago_id IS NULL
        AND coalesce(x.monto_reembolso, 0) = 0
        AND x.updated_at < now() - interval '90 days'
        AND v.fecha_hora_salida < now() - interval '30 days'
        AND NOT EXISTS (SELECT 1 FROM public.pagos p WHERE p.boleto_id = x.id)
        AND NOT EXISTS (SELECT 1 FROM public.calificaciones c WHERE c.boleto_id = x.id)
      LIMIT 5000);
  GET DIAGNOSTICS v_borrados = ROW_COUNT;
  RETURN v_borrados;
END $$;
REVOKE ALL ON FUNCTION public.fn_limpiar_boletos_abandonados() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_limpiar_boletos_abandonados() TO service_role;

COMMENT ON FUNCTION public.fn_limpiar_boletos_abandonados() IS
  'Retención: borra reservas vencidas y boletos cancelados antes de pagar (sin pago, reembolso ni calificación), 90 días después, con el viaje ya pasado. Cron diario limpiar_boletos_abandonados.';

DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'limpiar_boletos_abandonados') THEN
    PERFORM cron.unschedule('limpiar_boletos_abandonados');
  END IF;
  PERFORM cron.schedule('limpiar_boletos_abandonados', '57 4 * * *', 'SELECT public.fn_limpiar_boletos_abandonados()');
END $do$;
