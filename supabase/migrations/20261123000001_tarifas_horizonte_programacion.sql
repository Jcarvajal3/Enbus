-- Tope de anticipación al programar una tarifa de encomiendas.
--   fn_publicar_tarifa aceptaba cualquier fecha futura (p. ej. el año 9999): una tarifa mal
--   programada quedaba "en espera" indefinidamente y bloqueaba el espacio de programación.
--   Ahora solo se acepta hasta 365 días hacia adelante (PanelCooperativas: DIAS_MAX_PROGRAMACION).
-- Re-ejecutable e idempotente.
BEGIN;

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
  IF v_desde > now() + interval '365 days' THEN
    PERFORM public._fallar('EB_DATOS_INVALIDOS', 'Solo puedes programar una tarifa con hasta 365 días de anticipación.',
                           '{"campo":"vigente_desde"}');
  END IF;

  v_programada := v_desde > now() + interval '1 minute';

  -- Una programación nueva reemplaza a la anterior de la cooperativa que aún no entró en vigor.
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

REVOKE ALL ON FUNCTION public.fn_publicar_tarifa(numeric, numeric, integer, numeric, timestamptz, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_publicar_tarifa(numeric, numeric, integer, numeric, timestamptz, text) TO authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';
