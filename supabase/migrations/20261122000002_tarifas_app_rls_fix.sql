-- Fix incremental tras auditoría de tarifas por cooperativa:
--   1. Helper SECURITY DEFINER _cooperativa_tiene_tarifa_activa para que validar_encomienda_app_fn
--      (SECURITY INVOKER) valide la existencia de tarifa activa sin depender del RLS SELECT del pasajero.
--   2. fn_publicar_tarifa valida límites sobre valores ya redondeados para evitar 23514.
--   3. Permiso explícito de fn_activar_tarifas_programadas para service_role.
BEGIN;

CREATE OR REPLACE FUNCTION public._cooperativa_tiene_tarifa_activa(p_cooperativa_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tarifas t
     WHERE t.cooperativa_id = p_cooperativa_id AND t.activa = true
  );
$$;

CREATE OR REPLACE FUNCTION public.validar_encomienda_app_fn()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_dia integer;
  v_abiertas integer;
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') OR public.user_role() IS DISTINCT FROM 'user' THEN
    RETURN NEW;
  END IF;
  IF NEW.cooperativa_id IS NULL
     OR NOT EXISTS (SELECT 1 FROM public.cooperativas c WHERE c.id = NEW.cooperativa_id AND c.estado = 'ACTIVA') THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'EB_COOPERATIVA_NO_DISPONIBLE',
      HINT = 'Esta cooperativa no está recibiendo envíos en este momento. Elige otra.';
  END IF;
  IF NOT EXISTS (
       SELECT 1 FROM public.rutas r
        WHERE r.cooperativa_id = NEW.cooperativa_id AND r.activa
          AND public.normalizar_localidad(r.estado_origen)  = public.normalizar_localidad(NEW.estado_origen)
          AND public.normalizar_localidad(r.ciudad_origen)  = public.normalizar_localidad(NEW.ciudad_origen)
          AND public.normalizar_localidad(r.estado_destino) = public.normalizar_localidad(NEW.estado_destino)
          AND public.normalizar_localidad(r.ciudad_destino) = public.normalizar_localidad(NEW.ciudad_destino)) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'EB_SIN_RUTA',
      HINT = 'La cooperativa no tiene una ruta activa a ese destino. Elige otra.';
  END IF;
  IF NOT public._cooperativa_tiene_tarifa_activa(NEW.cooperativa_id) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'EB_TARIFA_NO_DISPONIBLE',
      HINT = 'Esta cooperativa todavía no tiene tarifas de encomiendas activas. Elige otra.';
  END IF;
  IF length(btrim(coalesce(NEW.receiver_nombre, ''))) NOT BETWEEN 3 AND 120
     OR public.normalizar_cedula(NEW.receiver_cedula_rif) IS NULL
     OR public.normalizar_telefono(NEW.receiver_telefono) IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'EB_DATOS_INVALIDOS',
      HINT = 'Revisa el nombre, la cédula y el teléfono de quien recibe.', DETAIL = '{"campo":"destinatario"}';
  END IF;
  IF length(btrim(coalesce(NEW.descripcion_contenido, ''))) NOT BETWEEN 3 AND 500 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'EB_DATOS_INVALIDOS',
      HINT = 'Describe el contenido del paquete (hasta 500 caracteres).', DETAIL = '{"campo":"descripcion"}';
  END IF;
  IF NEW.foto_cliente_path IS NOT NULL AND NEW.foto_cliente_path NOT LIKE v_uid::text || '/%' THEN
    NEW.foto_cliente_path := NULL;
  END IF;
  SELECT count(*) FILTER (WHERE e.created_at > now() - interval '24 hours'),
         count(*) FILTER (WHERE e.estado = 'PENDIENTE_DE_ESCANEO')
    INTO v_dia, v_abiertas
    FROM public.encomiendas e
   WHERE e.sender_id = v_uid AND (e.created_at > now() - interval '24 hours' OR e.estado = 'PENDIENTE_DE_ESCANEO');
  IF v_dia >= 30 OR v_abiertas >= 15 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'EB_DEMASIADAS_ENCOMIENDAS',
      HINT = 'Tienes muchos envíos por llevar a la taquilla. Entrega o cancela algunos antes de registrar otro.';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.fn_publicar_tarifa(
  p_tarifa_por_kg numeric, p_factor_distancia_por_min numeric, p_dimensiones_max_cm integer,
  p_peso_max_kg numeric, p_vigente_desde timestamptz DEFAULT NULL, p_nota text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_ctx record;
  v_desde timestamptz := coalesce(p_vigente_desde, now());
  v_id uuid;
  v_programada boolean;
  v_tarifa_kg numeric := round(p_tarifa_por_kg, 2);
  v_factor numeric := round(p_factor_distancia_por_min, 4);
  v_peso_max numeric := round(p_peso_max_kg, 2);
BEGIN
  SELECT * INTO v_ctx FROM public._contexto_staff();
  IF v_ctx.o_rol <> 'admin_cooperativa' THEN
    PERFORM public._fallar('EB_SIN_PERMISO', 'Solo el administrador de la cooperativa puede publicar tarifas.');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('tarifas:' || v_ctx.o_cooperativa_id::text));

  IF v_tarifa_kg IS NULL OR v_tarifa_kg < 0.01 OR v_tarifa_kg > 1000 THEN
    PERFORM public._fallar('EB_DATOS_INVALIDOS', 'El precio por kilo debe ser mayor que 0.', '{"campo":"tarifa_por_kg"}');
  END IF;
  IF v_factor IS NULL OR v_factor < 0 OR v_factor > 1 THEN
    PERFORM public._fallar('EB_DATOS_INVALIDOS', 'El recargo por minuto de viaje debe estar entre 0 y 1.',
                           '{"campo":"factor_distancia_por_min"}');
  END IF;
  IF p_dimensiones_max_cm IS NULL OR p_dimensiones_max_cm < 10 OR p_dimensiones_max_cm > 300 THEN
    PERFORM public._fallar('EB_DATOS_INVALIDOS', 'La medida máxima debe estar entre 10 y 300 cm.',
                           '{"campo":"dimensiones_max_cm"}');
  END IF;
  IF v_peso_max IS NULL OR v_peso_max < 1 OR v_peso_max > 100 THEN
    PERFORM public._fallar('EB_DATOS_INVALIDOS', 'El peso máximo debe estar entre 1 y 100 kg.', '{"campo":"peso_max_kg"}');
  END IF;

  v_programada := v_desde > now() + interval '1 minute';

  UPDATE public.tarifas
     SET reemplazada_at = now()
   WHERE cooperativa_id = v_ctx.o_cooperativa_id
     AND NOT activa AND publicada_at IS NOT NULL AND reemplazada_at IS NULL;

  IF NOT v_programada THEN
    UPDATE public.tarifas
       SET activa = false, reemplazada_at = now()
     WHERE cooperativa_id = v_ctx.o_cooperativa_id AND activa;
    v_desde := now();
  END IF;

  INSERT INTO public.tarifas (
    cooperativa_id, tarifa_por_kg, factor_distancia_por_min, dimensiones_max_cm,
    peso_max_kg, vigente_desde, activa, creada_por, publicada_at, nota
  )
  VALUES (
    v_ctx.o_cooperativa_id, v_tarifa_kg, v_factor,
    p_dimensiones_max_cm, v_peso_max, v_desde, NOT v_programada,
    v_ctx.o_uid, now(), nullif(left(btrim(coalesce(p_nota, '')), 300), '')
  )
  RETURNING id INTO v_id;

  RETURN jsonb_build_object(
    'id', v_id,
    'estado', CASE WHEN v_programada THEN 'PROGRAMADA' ELSE 'VIGENTE' END,
    'vigente_desde', v_desde
  );
END $$;

REVOKE ALL ON FUNCTION public._cooperativa_tiene_tarifa_activa(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._cooperativa_tiene_tarifa_activa(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.fn_activar_tarifas_programadas() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_activar_tarifas_programadas() TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
