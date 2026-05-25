-- Función para calcular días hábiles (excluyendo fines de semana: Sábado=6, Domingo=7)
CREATE OR REPLACE FUNCTION public.calcular_dias_habiles(desde timestamptz, hasta timestamptz)
RETURNS integer AS $$
DECLARE
  dias integer := 0;
  curr date;
  fin date;
BEGIN
  IF desde IS NULL OR hasta IS NULL OR desde >= hasta THEN
    RETURN 0;
  END IF;
  
  -- Empezamos a contar desde el día siguiente de la fecha de inicio
  curr := (desde + interval '1 day')::date;
  fin := hasta::date;
  
  WHILE curr <= fin LOOP
    -- extract(isodow from curr) retorna 1 para Lunes, 5 para Viernes, 6 para Sábado, 7 para Domingo
    IF extract(isodow from curr) < 6 THEN
      dias := dias + 1;
    END IF;
    curr := curr + 1;
  END LOOP;
  
  RETURN dias;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Actualizar la función auto_devolver_encomienda para usar la política estricta de 5 días hábiles
CREATE OR REPLACE FUNCTION public.auto_devolver_encomienda()
RETURNS void AS $$
DECLARE
  pkg RECORD;
BEGIN
  -- Filtrar encomiendas en oficina de destino que exceden los 5 días hábiles
  FOR pkg IN 
    SELECT id, tracking_id, sender_id 
    FROM public.encomiendas 
    WHERE estado = 'EN_OFICINA_DESTINO' 
      AND public.calcular_dias_habiles(updated_at, now()) >= 5
  LOOP
    -- Cambiar estado a DEVUELTA
    UPDATE public.encomiendas
    SET estado = 'DEVUELTA'
    WHERE id = pkg.id;

    -- Encolar la notificación para que la Edge function la procese y envíe la alerta
    INSERT INTO public.pending_notifications (destinatario_id, recurso_tipo, recurso_id, tipo_notificacion, payload)
    VALUES (pkg.sender_id, 'encomienda', pkg.id, 'DEVOLUCION_AUTOMATICA', jsonb_build_object('tracking_id', pkg.tracking_id));
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
