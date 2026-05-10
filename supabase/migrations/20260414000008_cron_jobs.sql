-- Extensión pg_cron y pg_net asumiendo que están disponibles en Supabase
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Tabla para encolar notificaciones (para que Edge Function las procese)
CREATE TABLE public.pending_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  destinatario_id UUID,
  recurso_tipo TEXT,
  recurso_id UUID,
  tipo_notificacion TEXT NOT NULL,
  payload JSONB,
  procesado BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE public.pending_notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Super admin o backend procesa" ON public.pending_notifications FOR ALL USING (public.is_super_admin());

-- Función: auto_expirar_reserva
CREATE OR REPLACE FUNCTION public.auto_expirar_reserva()
RETURNS void AS $$
BEGIN
  -- Cancelar reservas de boletos (RESERVADO sin pagar) con tiempo superior a 30 mins
  -- La lógica en boletos decía: "reserva_expira_at < now()"
  UPDATE public.boletos
  SET estado = 'EXPIRADO'
  WHERE estado = 'RESERVADO' AND reserva_expira_at < now();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Función: auto_devolver_encomienda
CREATE OR REPLACE FUNCTION public.auto_devolver_encomienda()
RETURNS void AS $$
DECLARE
  pkg RECORD;
BEGIN
  -- En oficina destino > 5 días hábiles. Asumimos 7 días naturales como aproximación rápida para SQL puro
  FOR pkg IN 
    SELECT id, tracking_id, sender_id 
    FROM public.encomiendas 
    WHERE estado = 'EN_OFICINA_DESTINO' 
      AND updated_at < now() - interval '7 days'
  LOOP
    UPDATE public.encomiendas
    SET estado = 'DEVUELTA'
    WHERE id = pkg.id;

    -- Encolar notificación
    INSERT INTO public.pending_notifications (destinatario_id, recurso_tipo, recurso_id, tipo_notificacion, payload)
    VALUES (pkg.sender_id, 'encomienda', pkg.id, 'DEVOLUCION_AUTOMATICA', jsonb_build_object('tracking_id', pkg.tracking_id));
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Función: alerta_amarilla_72h
CREATE OR REPLACE FUNCTION public.alerta_amarilla_72h()
RETURNS void AS $$
DECLARE
  pkg RECORD;
BEGIN
  -- En tránsito > 72h
  FOR pkg IN 
    SELECT id, tracking_id 
    FROM public.encomiendas 
    WHERE estado = 'EN_TRANSITO' 
      AND updated_at < now() - interval '72 hours'
  LOOP
    -- Verificar si ya hay alerta abierta para evitar duplicados
    PERFORM 1 FROM public.incidencias WHERE encomienda_id = pkg.id AND tipo = 'ALERTA_AMARILLA' AND estado = 'ABIERTA';
    IF NOT FOUND THEN
      INSERT INTO public.incidencias (encomienda_id, tipo, descripcion)
      VALUES (pkg.id, 'ALERTA_AMARILLA', 'La encomienda ' || pkg.tracking_id || ' lleva más de 72 horas en tránsito sin llegar a destino.');
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Programación de Cron Jobs
SELECT cron.schedule('auto_expirar_reserva', '* * * * *', 'SELECT public.auto_expirar_reserva();');
SELECT cron.schedule('auto_devolver_encomienda', '0 0 * * *', 'SELECT public.auto_devolver_encomienda();');
SELECT cron.schedule('alerta_amarilla_72h', '0 * * * *', 'SELECT public.alerta_amarilla_72h();');

-- Disparador de pg_net para la Edge Function de notificaciones
SELECT cron.schedule(
  'procesar_notificaciones_pendientes', 
  '* * * * *', 
  $$
  SELECT net.http_post(
      url:='https://[PROJECT_REF].supabase.co/functions/v1/procesar-notificaciones-pendientes',
      headers:='{"Content-Type": "application/json", "Authorization": "Bearer [ANON_KEY]"}'::jsonb,
      body:='{}'::jsonb
  );
  $$
);
