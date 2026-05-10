-- Generic updated_at trigger function
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at to relevant tables
CREATE TRIGGER set_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER set_cooperativas_updated_at BEFORE UPDATE ON public.cooperativas FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER set_encomiendas_updated_at BEFORE UPDATE ON public.encomiendas FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER set_boletos_updated_at BEFORE UPDATE ON public.boletos FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER set_incidencias_updated_at BEFORE UPDATE ON public.incidencias FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Trigger: log_estado_encomienda
CREATE OR REPLACE FUNCTION public.log_estado_encomienda_fn()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.estado IS DISTINCT FROM NEW.estado THEN
    INSERT INTO public.encomienda_estado_historial (encomienda_id, estado_anterior, estado_nuevo, cambiado_por)
    VALUES (NEW.id, OLD.estado, NEW.estado, auth.uid());
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER log_estado_encomienda
AFTER UPDATE ON public.encomiendas
FOR EACH ROW EXECUTE FUNCTION public.log_estado_encomienda_fn();

-- Trigger: generar_tracking_id (EB-YYMMDD-XXXXX)
CREATE OR REPLACE FUNCTION public.generar_tracking_id_fn()
RETURNS TRIGGER AS $$
DECLARE
  date_part TEXT;
  random_part TEXT;
  new_tracking_id TEXT;
  is_unique BOOLEAN := false;
BEGIN
  date_part := to_char(now(), 'YYMMDD');
  WHILE NOT is_unique LOOP
    random_part := lpad(floor(random() * 100000)::text, 5, '0');
    new_tracking_id := 'EB-' || date_part || '-' || random_part;
    
    PERFORM 1 FROM public.encomiendas WHERE tracking_id = new_tracking_id;
    IF NOT FOUND THEN
      is_unique := true;
    END IF;
  END LOOP;
  
  NEW.tracking_id := new_tracking_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER generar_tracking_id
BEFORE INSERT ON public.encomiendas
FOR EACH ROW EXECUTE FUNCTION public.generar_tracking_id_fn();

-- Trigger: generar_pin_retiro
CREATE OR REPLACE FUNCTION public.generar_pin_retiro_fn()
RETURNS TRIGGER AS $$
DECLARE
  new_pin CHAR(4);
  is_unique BOOLEAN := false;
BEGIN
  -- Solo generar cuando cambia a EN_RECEPCION por primera vez y no tiene PIN asignado
  IF NEW.estado = 'EN_RECEPCION' AND OLD.estado != 'EN_RECEPCION' AND NEW.pin_retiro IS NULL THEN
    WHILE NOT is_unique LOOP
      new_pin := lpad(floor(random() * 10000)::text, 4, '0');
      
      PERFORM 1 FROM public.encomiendas WHERE pin_retiro = new_pin;
      IF NOT FOUND THEN
        is_unique := true;
      END IF;
    END LOOP;
    
    NEW.pin_retiro := new_pin;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER generar_pin_retiro
BEFORE UPDATE ON public.encomiendas
FOR EACH ROW EXECUTE FUNCTION public.generar_pin_retiro_fn();

-- Trigger: calcular_calificacion
CREATE OR REPLACE FUNCTION public.calcular_calificacion_fn()
RETURNS TRIGGER AS $$
DECLARE
  coop_id UUID;
BEGIN
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    coop_id := NEW.cooperativa_id;
  ELSIF TG_OP = 'DELETE' THEN
    coop_id := OLD.cooperativa_id;
  END IF;

  UPDATE public.cooperativas
  SET 
    calificacion_promedio = COALESCE((SELECT TRUNC(AVG(estrellas), 1) FROM public.calificaciones WHERE cooperativa_id = coop_id), 0.0),
    total_calificaciones = (SELECT COUNT(*) FROM public.calificaciones WHERE cooperativa_id = coop_id)
  WHERE id = coop_id;

  RETURN NULL; -- AFTER trigger
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER calcular_calificacion
AFTER INSERT OR UPDATE OR DELETE ON public.calificaciones
FOR EACH ROW EXECUTE FUNCTION public.calcular_calificacion_fn();

-- Trigger: actualizar_asientos
CREATE OR REPLACE FUNCTION public.actualizar_asientos_fn()
RETURNS TRIGGER AS $$
DECLARE
  target_viaje_id UUID;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.estado IN ('RESERVADO', 'PAGADO', 'USADO') THEN
      UPDATE public.viajes SET asientos_disponibles = asientos_disponibles - 1 WHERE id = NEW.viaje_id;
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.estado IN ('RESERVADO', 'PAGADO', 'USADO') AND NEW.estado IN ('CANCELADO', 'EXPIRADO') THEN
      UPDATE public.viajes SET asientos_disponibles = asientos_disponibles + 1 WHERE id = NEW.viaje_id;
    ELSIF OLD.estado IN ('CANCELADO', 'EXPIRADO') AND NEW.estado IN ('RESERVADO', 'PAGADO', 'USADO') THEN
      UPDATE public.viajes SET asientos_disponibles = asientos_disponibles - 1 WHERE id = NEW.viaje_id;
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.estado IN ('RESERVADO', 'PAGADO', 'USADO') THEN
      UPDATE public.viajes SET asientos_disponibles = asientos_disponibles + 1 WHERE id = OLD.viaje_id;
    END IF;
  END IF;
  
  RETURN NULL; -- AFTER trigger
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER actualizar_asientos
AFTER INSERT OR UPDATE OR DELETE ON public.boletos
FOR EACH ROW EXECUTE FUNCTION public.actualizar_asientos_fn();
