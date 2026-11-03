-- Fase 4 · Seguridad de la entrega (pendiente de la fase 3, prioridad alta).
-- fn_entregar_encomienda no contaba el PIN fallido: al lanzar EB_PIN_INCORRECTO se revertía el
-- UPDATE del contador, así que un empleado podía probar los 10.000 PIN llamándola directamente.
-- Ahora:
--   1. fn_validar_pin_retiro (cuenta y bloquea a los 10 intentos) deja una validación de 15 minutos
--      para el empleado que la hizo (pin_validado_at / pin_validado_por).
--   2. fn_entregar_encomienda con PIN exige esa validación ANTES de mirar el PIN (no revela si el PIN
--      es correcto) y la consume al entregar.
--   3. Los clientes de la API (rol authenticated) ya no pueden escribir el PIN, sus intentos, la
--      validación ni los datos de la entrega, ni pasar una encomienda a ENTREGADA o DEVUELTA: solo las
--      RPC (SECURITY DEFINER), el cron y el service role.
-- Requiere 20260720000004. Re-ejecutable. Contrato de las RPC sin cambios salvo el error nuevo
-- EB_PIN_NO_VALIDADO.
BEGIN;

ALTER TABLE public.encomiendas
  ADD COLUMN IF NOT EXISTS pin_validado_at  timestamptz,
  ADD COLUMN IF NOT EXISTS pin_validado_por uuid;          -- sin FK a profiles (ver 20260720000002)

-- La validación del PIN tampoco mueve updated_at (cuenta los días en oficina).
CREATE OR REPLACE FUNCTION public.encomiendas_updated_at_fn()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE c text[] := ARRAY['receiver_user_id','receiver_vinculado_por','receiver_vinculado_at',
                          'sucursal_origen_id','sucursal_destino_id','updated_at',
                          'intentos_pin','pin_bloqueado','pin_validado_at','pin_validado_por',
                          'foto_evidencia_url','foto_cliente_path','foto_omitida_motivo'];
BEGIN
  IF (to_jsonb(NEW) - c) IS DISTINCT FROM (to_jsonb(OLD) - c) THEN
    NEW.updated_at := now();
  END IF;
  RETURN NEW;
END $$;

-- Escrituras directas de la API: el PIN y la entrega solo los cambia el sistema.
-- "aa_" para correr antes que generar_pin_retiro (que asigna el PIN al pasar a EN_RECEPCION).
CREATE OR REPLACE FUNCTION public.proteger_entrega_encomienda_fn()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;
  IF NEW.estado IS DISTINCT FROM OLD.estado AND NEW.estado IN ('ENTREGADA', 'DEVUELTA') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'EB_OPERACION_NO_PERMITIDA',
      HINT = 'La entrega se registra desde la pantalla Entrega, con el PIN de retiro.';
  END IF;
  IF (NEW.pin_retiro, NEW.intentos_pin, NEW.pin_bloqueado, NEW.pin_validado_at, NEW.pin_validado_por,
      NEW.entregada_at, NEW.entregada_por, NEW.retiro_tercero, NEW.retiro_nombre, NEW.retiro_cedula,
      NEW.entrega_sin_pin_motivo)
     IS DISTINCT FROM
     (OLD.pin_retiro, OLD.intentos_pin, OLD.pin_bloqueado, OLD.pin_validado_at, OLD.pin_validado_por,
      OLD.entregada_at, OLD.entregada_por, OLD.retiro_tercero, OLD.retiro_nombre, OLD.retiro_cedula,
      OLD.entrega_sin_pin_motivo) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'EB_OPERACION_NO_PERMITIDA',
      HINT = 'El PIN de retiro y los datos de la entrega solo los cambia el sistema.';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS aa_proteger_entrega_encomienda ON public.encomiendas;
CREATE TRIGGER aa_proteger_entrega_encomienda BEFORE UPDATE ON public.encomiendas
  FOR EACH ROW EXECUTE FUNCTION public.proteger_entrega_encomienda_fn();

-- Validar el PIN: igual que en la fase 3 (cuenta el intento sin lanzar error) y, si es correcto,
-- deja la validación para este empleado. Un intento fallido borra cualquier validación previa.
CREATE OR REPLACE FUNCTION public.fn_validar_pin_retiro(p_encomienda_id uuid, p_pin text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_ctx record; v_e record; v_intentos integer; v_max constant integer := 10;
BEGIN
  SELECT * INTO v_ctx FROM public._contexto_staff();
  SELECT id, cooperativa_id, estado, pin_retiro, intentos_pin, pin_bloqueado INTO v_e
    FROM public.encomiendas WHERE id = p_encomienda_id FOR UPDATE;
  IF NOT FOUND OR v_e.cooperativa_id IS DISTINCT FROM v_ctx.o_cooperativa_id THEN
    PERFORM public._fallar('EB_NO_ENCONTRADO', 'No encontramos esta encomienda en tu cooperativa.');
  END IF;
  IF v_e.estado <> 'EN_OFICINA_DESTINO' THEN
    PERFORM public._fallar('EB_ESTADO_CAMBIO', 'Esta encomienda no está lista para entregar. Actualiza la lista.');
  END IF;
  IF v_e.pin_bloqueado THEN
    RETURN jsonb_build_object('valido', false, 'bloqueado', true, 'intentos_restantes', 0);
  END IF;
  IF v_e.pin_retiro IS NOT NULL AND v_e.pin_retiro = btrim(coalesce(p_pin, '')) THEN
    UPDATE public.encomiendas SET pin_validado_at = now(), pin_validado_por = v_ctx.o_uid
     WHERE id = p_encomienda_id;
    RETURN jsonb_build_object('valido', true, 'bloqueado', false, 'intentos_restantes', v_max - v_e.intentos_pin);
  END IF;
  v_intentos := v_e.intentos_pin + 1;
  UPDATE public.encomiendas
     SET intentos_pin = v_intentos, pin_bloqueado = (v_intentos >= v_max),
         pin_validado_at = NULL, pin_validado_por = NULL
   WHERE id = p_encomienda_id;
  RETURN jsonb_build_object('valido', false, 'bloqueado', v_intentos >= v_max,
                            'intentos_restantes', greatest(v_max - v_intentos, 0));
END $$;

-- Entregar: misma firma y respuesta que en 20260720000004. Con PIN exige la validación vigente
-- del mismo empleado (se comprueba antes que el PIN para no revelar si es correcto).
CREATE OR REPLACE FUNCTION public.fn_entregar_encomienda(
  p_encomienda_id uuid, p_pin text, p_cedula_verificada boolean,
  p_retira_tercero boolean DEFAULT false, p_retiro_nombre text DEFAULT NULL, p_retiro_cedula text DEFAULT NULL,
  p_sin_pin_motivo text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_ctx record; v_e record; v_tercero boolean := coalesce(p_retira_tercero, false);
  v_sin_pin text := nullif(left(btrim(coalesce(p_sin_pin_motivo, '')), 300), '');
  v_nombre text; v_cedula text;
BEGIN
  SELECT * INTO v_ctx FROM public._contexto_staff();
  SELECT * INTO v_e FROM public.encomiendas WHERE id = p_encomienda_id FOR UPDATE;
  IF NOT FOUND OR v_e.cooperativa_id IS DISTINCT FROM v_ctx.o_cooperativa_id THEN
    PERFORM public._fallar('EB_NO_ENCONTRADO', 'No encontramos esta encomienda en tu cooperativa.');
  END IF;
  IF v_e.estado = 'ENTREGADA' THEN
    RETURN jsonb_build_object('estado', 'ENTREGADA', 'ya_procesado', true, 'entregada_at', v_e.entregada_at);
  END IF;
  IF v_e.estado <> 'EN_OFICINA_DESTINO' THEN
    PERFORM public._fallar('EB_ESTADO_CAMBIO', 'Esta encomienda no está lista para entregar. Actualiza la lista.');
  END IF;
  IF NOT coalesce(p_cedula_verificada, false) THEN
    PERFORM public._fallar('EB_CEDULA_NO_VERIFICADA', 'Confirma que revisaste la cédula de quien retira.', '{"campo":"cedula"}');
  END IF;
  IF v_tercero AND (length(btrim(coalesce(p_retiro_nombre, ''))) < 3 OR public.normalizar_cedula(p_retiro_cedula) IS NULL) THEN
    PERFORM public._fallar('EB_DATOS_INVALIDOS', 'Escribe el nombre y la cédula de quien retira.', '{"campo":"tercero"}');
  END IF;
  IF v_sin_pin IS NOT NULL THEN
    IF v_ctx.o_rol <> 'admin_cooperativa' THEN
      PERFORM public._fallar('EB_SIN_PERMISO', 'Solo el administrador de la cooperativa puede entregar sin PIN.');
    END IF;
    IF length(v_sin_pin) < 10 THEN
      PERFORM public._fallar('EB_MOTIVO_REQUERIDO', 'Explica por qué entregas sin PIN (mínimo 10 caracteres).',
                             '{"campo":"motivo"}');
    END IF;
  ELSIF v_e.pin_bloqueado THEN
    PERFORM public._fallar('EB_PIN_BLOQUEADO',
      'El PIN está bloqueado. Pídele al administrador de tu cooperativa que lo desbloquee o que autorice la entrega sin PIN.');
  ELSIF v_e.pin_validado_por IS DISTINCT FROM v_ctx.o_uid OR v_e.pin_validado_at IS NULL
        OR v_e.pin_validado_at < now() - interval '15 minutes' THEN
    PERFORM public._fallar('EB_PIN_NO_VALIDADO',
      'Valida el PIN de retiro antes de entregar. La validación dura 15 minutos.', '{"campo":"pin"}');
  ELSIF v_e.pin_retiro IS NULL OR v_e.pin_retiro <> btrim(coalesce(p_pin, '')) THEN
    PERFORM public._fallar('EB_PIN_INCORRECTO', 'El PIN no coincide. Valídalo de nuevo.', '{"campo":"pin"}');
  END IF;
  v_nombre := CASE WHEN v_tercero THEN btrim(p_retiro_nombre) ELSE v_e.receiver_nombre END;
  v_cedula := CASE WHEN v_tercero THEN btrim(p_retiro_cedula) ELSE v_e.receiver_cedula_rif END;
  UPDATE public.encomiendas
     SET estado = 'ENTREGADA', entregada_at = now(), entregada_por = v_ctx.o_uid,
         retiro_tercero = v_tercero, retiro_nombre = v_nombre, retiro_cedula = v_cedula,
         entrega_sin_pin_motivo = v_sin_pin, pin_validado_at = NULL, pin_validado_por = NULL
   WHERE id = p_encomienda_id;                 -- el trigger exige el cobro si paga quien recibe
  RETURN jsonb_build_object('estado', 'ENTREGADA', 'entregada_at', now(), 'retiro_nombre', v_nombre,
                            'retiro_cedula', v_cedula, 'sin_pin', v_sin_pin IS NOT NULL);
END $$;

-- Desbloquear: además borra cualquier validación previa.
CREATE OR REPLACE FUNCTION public.fn_desbloquear_pin(p_encomienda_id uuid, p_motivo text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_uid uuid := auth.uid(); v_rol public.rol_usuario; v_coop uuid; v_e record;
BEGIN
  IF v_uid IS NULL THEN
    PERFORM public._fallar('EB_NO_AUTENTICADO', 'Tu sesión expiró. Inicia sesión de nuevo.');
  END IF;
  SELECT role, cooperativa_id INTO v_rol, v_coop FROM public.profiles WHERE id = v_uid;
  SELECT id, cooperativa_id, estado, pin_bloqueado, intentos_pin INTO v_e
    FROM public.encomiendas WHERE id = p_encomienda_id FOR UPDATE;
  IF NOT FOUND OR NOT (v_rol = 'super_admin' OR (v_rol = 'admin_cooperativa' AND v_coop = v_e.cooperativa_id)) THEN
    PERFORM public._fallar('EB_SIN_PERMISO',
      'Solo el administrador de la cooperativa o el equipo de EnBus pueden desbloquear el PIN.');
  END IF;
  IF v_e.estado IN ('ENTREGADA', 'CANCELADA', 'DEVUELTA') THEN
    PERFORM public._fallar('EB_ESTADO_CAMBIO', 'Esta encomienda ya está cerrada.');
  END IF;
  IF length(btrim(coalesce(p_motivo, ''))) < 5 THEN
    PERFORM public._fallar('EB_MOTIVO_REQUERIDO', 'Escribe por qué desbloqueas el PIN.', '{"campo":"motivo"}');
  END IF;
  UPDATE public.encomiendas
     SET pin_bloqueado = false, intentos_pin = 0, pin_validado_at = NULL, pin_validado_por = NULL
   WHERE id = p_encomienda_id;
  RETURN jsonb_build_object('ok', true, 'intentos_previos', v_e.intentos_pin);
END $$;

-- Permisos (CREATE OR REPLACE conserva los anteriores; se repiten por si se aplicó fuera de orden).
DO $$
DECLARE f record;
BEGIN
  FOR f IN SELECT p.oid::regprocedure AS sig FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public' AND p.proname IN ('fn_validar_pin_retiro', 'fn_entregar_encomienda',
                                                         'fn_desbloquear_pin') LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', f.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', f.sig);
  END LOOP;
END $$;

COMMIT;
