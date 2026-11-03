-- Fase 3 · Encomiendas: alta presencial en taquilla (#33, P-27), rechazo en recepción
-- (P-31), PIN validado y entrega en servidor con cédula verificada (#34, pendiente fase 2),
-- desbloqueo del PIN (A-08, P-45), cotización y rastreo públicos, rutas populares (#31, #42).
-- Requiere 20260719000004 y 20260720000002. Re-ejecutable.
BEGIN;

-- ─── 1. Taquilla: alta presencial (cliente sin la app) ──────────────────────
-- Crea, recibe y pesa en una sola operación: la encomienda queda POR_PAGAR con su costo
-- y su PIN. sender_id = empleado que la registra; el remitente real va en remitente_*.
-- p_remitente / p_destinatario: {"nombre":"Ana Pérez","cedula":"V-12345678","telefono":"0414-1234567"}
CREATE OR REPLACE FUNCTION public.fn_registrar_encomienda_taquilla(
  p_ruta_id uuid, p_remitente jsonb, p_destinatario jsonb, p_descripcion text,
  p_valor_declarado numeric, p_modalidad_pago public.modalidad_pago, p_peso_kg numeric,
  p_idempotency_key text, p_sucursal_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_ctx record; v_suc record; v_ruta record; v_e record; v_id uuid;
  v_costo numeric; v_max numeric; v_tasa numeric; v_fecha date;
  v_rn text := btrim(coalesce(p_remitente->>'nombre', ''));
  v_rc text := btrim(coalesce(p_remitente->>'cedula', ''));
  v_rt text := btrim(coalesce(p_remitente->>'telefono', ''));
  v_dn text := btrim(coalesce(p_destinatario->>'nombre', ''));
  v_dc text := btrim(coalesce(p_destinatario->>'cedula', ''));
  v_dt text := btrim(coalesce(p_destinatario->>'telefono', ''));
BEGIN
  SELECT * INTO v_ctx FROM public._contexto_staff();
  IF coalesce(length(p_idempotency_key), 0) < 8 THEN
    PERFORM public._fallar('EB_DATOS_INVALIDOS', 'Falta la clave de la operación. Recarga la página.');
  END IF;
  SELECT * INTO v_e FROM public.encomiendas WHERE sender_id = v_ctx.o_uid AND idempotency_key = p_idempotency_key;
  IF FOUND THEN
    RETURN jsonb_build_object('encomienda_id', v_e.id, 'tracking_id', v_e.tracking_id, 'estado', v_e.estado,
      'costo_usd', v_e.costo_calculado, 'modalidad_pago', v_e.modalidad_pago, 'pin_retiro', v_e.pin_retiro,
      'repetido', true);
  END IF;

  SELECT s.id, s.ciudad INTO v_suc FROM public.sucursales s
   WHERE s.id = coalesce(p_sucursal_id, v_ctx.o_sucursal_id)
     AND s.cooperativa_id = v_ctx.o_cooperativa_id AND s.activa;
  IF NOT FOUND THEN
    PERFORM public._fallar('EB_SUCURSAL_REQUERIDA', 'Elige la sucursal en la que recibes la encomienda.', '{"campo":"sucursal"}');
  END IF;
  SELECT r.id, r.estado_origen, r.ciudad_origen, r.estado_destino, r.ciudad_destino INTO v_ruta
    FROM public.rutas r
   WHERE r.id = p_ruta_id AND r.cooperativa_id = v_ctx.o_cooperativa_id AND r.activa;
  IF NOT FOUND OR public.normalizar_localidad(v_ruta.ciudad_origen) IS DISTINCT FROM public.normalizar_localidad(v_suc.ciudad) THEN
    PERFORM public._fallar('EB_SIN_RUTA', 'Elige un destino con ruta activa desde tu sucursal.', '{"campo":"destino"}');
  END IF;
  IF length(v_rn) < 3 OR public.normalizar_cedula(v_rc) IS NULL OR public.normalizar_telefono(v_rt) IS NULL THEN
    PERFORM public._fallar('EB_DATOS_INVALIDOS', 'Revisa el nombre, la cédula y el teléfono de quien envía.', '{"campo":"remitente"}');
  END IF;
  IF length(v_dn) < 3 OR public.normalizar_cedula(v_dc) IS NULL OR public.normalizar_telefono(v_dt) IS NULL THEN
    PERFORM public._fallar('EB_DATOS_INVALIDOS', 'Revisa el nombre, la cédula y el teléfono de quien recibe.', '{"campo":"destinatario"}');
  END IF;
  IF length(btrim(coalesce(p_descripcion, ''))) < 3 THEN
    PERFORM public._fallar('EB_DATOS_INVALIDOS', 'Describe el contenido del paquete.', '{"campo":"descripcion"}');
  END IF;
  IF p_valor_declarado IS NOT NULL AND p_valor_declarado < 0 THEN
    PERFORM public._fallar('EB_DATOS_INVALIDOS', 'El valor declarado no puede ser negativo.', '{"campo":"valor_declarado"}');
  END IF;
  IF p_modalidad_pago IS NULL THEN
    PERFORM public._fallar('EB_DATOS_INVALIDOS', 'Elige quién paga el envío.', '{"campo":"modalidad"}');
  END IF;

  INSERT INTO public.encomiendas (tracking_id, sender_id, origen_registro, remitente_nombre, remitente_cedula,
                                  remitente_telefono, receiver_nombre, receiver_cedula_rif, receiver_telefono,
                                  cooperativa_id, sucursal_origen_id, estado_origen, ciudad_origen,
                                  estado_destino, ciudad_destino, descripcion_contenido, valor_declarado,
                                  modalidad_pago, idempotency_key)
  VALUES ('PENDIENTE', v_ctx.o_uid, 'TAQUILLA', v_rn, v_rc, v_rt, v_dn, v_dc, v_dt,
          v_ctx.o_cooperativa_id, v_suc.id, v_ruta.estado_origen, v_ruta.ciudad_origen,
          v_ruta.estado_destino, v_ruta.ciudad_destino, left(btrim(p_descripcion), 500), p_valor_declarado,
          p_modalidad_pago, p_idempotency_key)   -- tracking_id lo asigna el trigger generar_tracking_id
  RETURNING id INTO v_id;

  SELECT o_costo_usd, o_peso_max INTO v_costo, v_max FROM public._costo_encomienda(v_id, p_peso_kg);
  UPDATE public.encomiendas SET estado = 'EN_RECEPCION' WHERE id = v_id;          -- genera el PIN
  UPDATE public.encomiendas SET estado = 'POR_PAGAR', peso_kg = p_peso_kg, costo_calculado = v_costo
   WHERE id = v_id;

  SELECT * INTO v_e FROM public.encomiendas WHERE id = v_id;
  SELECT t.tasa, t.fecha INTO v_tasa, v_fecha FROM public.fn_tasa_bcv_vigente() t;
  RETURN jsonb_build_object('encomienda_id', v_id, 'tracking_id', v_e.tracking_id, 'estado', 'POR_PAGAR',
    'costo_usd', v_costo, 'costo_bs', CASE WHEN v_tasa IS NOT NULL THEN round(v_costo * v_tasa, 2) END,
    'tasa_bcv', v_tasa, 'tasa_bcv_fecha', v_fecha, 'peso_max_kg', v_max,
    'modalidad_pago', p_modalidad_pago, 'pin_retiro', v_e.pin_retiro);
END $$;

-- ─── 2. Taquilla: no recibir una encomienda (sin ruta, contenido prohibido…) ─
CREATE OR REPLACE FUNCTION public.fn_rechazar_encomienda_origen(p_encomienda_id uuid, p_motivo text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_ctx record; v_e record; v_motivo text := left(btrim(coalesce(p_motivo, '')), 300);
BEGIN
  SELECT * INTO v_ctx FROM public._contexto_staff();
  SELECT * INTO v_e FROM public.encomiendas WHERE id = p_encomienda_id FOR UPDATE;
  IF NOT FOUND OR v_e.cooperativa_id IS DISTINCT FROM v_ctx.o_cooperativa_id THEN
    PERFORM public._fallar('EB_NO_ENCONTRADO', 'No encontramos esta encomienda en tu cooperativa.');
  END IF;
  IF v_e.estado = 'CANCELADA' THEN RETURN jsonb_build_object('estado', 'CANCELADA', 'ya_procesado', true); END IF;
  IF v_e.estado NOT IN ('PENDIENTE_DE_ESCANEO', 'EN_RECEPCION', 'POR_PAGAR') THEN
    PERFORM public._fallar('EB_ESTADO_CAMBIO', 'Esta encomienda ya fue cobrada o despachada; no se puede rechazar aquí.');
  END IF;
  IF length(v_motivo) < 5 THEN
    PERFORM public._fallar('EB_MOTIVO_REQUERIDO', 'Escribe por qué no recibes la encomienda (se le avisará al cliente).',
                           '{"campo":"motivo"}');
  END IF;
  IF EXISTS (SELECT 1 FROM public.pagos WHERE encomienda_id = p_encomienda_id
              AND estado_verificacion IN ('PENDIENTE', 'APROBADO')) THEN
    PERFORM public._fallar('EB_PAGO_YA_REGISTRADO',
      'Esta encomienda tiene un pago registrado. Resuélvelo en «Pagos por verificar» antes de rechazarla.');
  END IF;
  UPDATE public.encomiendas SET estado = 'CANCELADA', motivo_cancelacion = 'No recibida en taquilla: ' || v_motivo
   WHERE id = p_encomienda_id;
  PERFORM public._notificar_usuario(v_e.sender_id, 'ENCOMIENDA_RECHAZADA', 'No pudimos recibir tu envío',
    format('La taquilla no recibió tu encomienda %s: %s', v_e.tracking_id, v_motivo), 'encomienda', p_encomienda_id);
  RETURN jsonb_build_object('estado', 'CANCELADA');
END $$;

-- ─── 3. Entrega: PIN validado en servidor ───────────────────────────────────
-- Devuelve (no lanza) para que el intento fallido quede guardado.
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
    RETURN jsonb_build_object('valido', true, 'bloqueado', false, 'intentos_restantes', v_max - v_e.intentos_pin);
  END IF;
  v_intentos := v_e.intentos_pin + 1;
  UPDATE public.encomiendas SET intentos_pin = v_intentos, pin_bloqueado = (v_intentos >= v_max)
   WHERE id = p_encomienda_id;
  RETURN jsonb_build_object('valido', false, 'bloqueado', v_intentos >= v_max,
                            'intentos_restantes', greatest(v_max - v_intentos, 0));
END $$;

-- Entrega con PIN y cédula verificada (o sin PIN, solo el administrador y con motivo).
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
  ELSIF v_e.pin_retiro IS NULL OR v_e.pin_retiro <> btrim(coalesce(p_pin, '')) THEN
    PERFORM public._fallar('EB_PIN_INCORRECTO', 'El PIN no coincide. Valídalo de nuevo.', '{"campo":"pin"}');
  END IF;
  v_nombre := CASE WHEN v_tercero THEN btrim(p_retiro_nombre) ELSE v_e.receiver_nombre END;
  v_cedula := CASE WHEN v_tercero THEN btrim(p_retiro_cedula) ELSE v_e.receiver_cedula_rif END;
  UPDATE public.encomiendas
     SET estado = 'ENTREGADA', entregada_at = now(), entregada_por = v_ctx.o_uid,
         retiro_tercero = v_tercero, retiro_nombre = v_nombre, retiro_cedula = v_cedula,
         entrega_sin_pin_motivo = v_sin_pin
   WHERE id = p_encomienda_id;                 -- el trigger exige el cobro si paga quien recibe
  RETURN jsonb_build_object('estado', 'ENTREGADA', 'entregada_at', now(), 'retiro_nombre', v_nombre,
                            'retiro_cedula', v_cedula, 'sin_pin', v_sin_pin IS NOT NULL);
END $$;

-- Desbloquear el PIN: administrador de la cooperativa o super admin (antes no tenía política UPDATE).
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
  UPDATE public.encomiendas SET pin_bloqueado = false, intentos_pin = 0 WHERE id = p_encomienda_id;
  RETURN jsonb_build_object('ok', true, 'intentos_previos', v_e.intentos_pin);
END $$;

-- ─── 4. Público: cotizar un envío (app y landing) ───────────────────────────
-- Misma fórmula que _costo_encomienda / calcular-costo-encomienda; USD de referencia.
CREATE OR REPLACE FUNCTION public.fn_cotizar_envio_publico(p_peso_kg numeric, p_ciudad_origen text, p_ciudad_destino text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_por_kg numeric; v_factor numeric; v_max numeric; v_tasa numeric; v_fecha date; v_opciones jsonb;
BEGIN
  SELECT tarifa_por_kg, factor_distancia_por_min, peso_max_kg INTO v_por_kg, v_factor, v_max
    FROM public.tarifas WHERE activa LIMIT 1;
  IF v_por_kg IS NULL THEN
    PERFORM public._fallar('EB_TARIFA_NO_DISPONIBLE', 'Todavía no podemos calcular el costo. Intenta más tarde.');
  END IF;
  IF p_peso_kg IS NULL OR p_peso_kg <= 0 OR p_peso_kg > v_max THEN
    PERFORM public._fallar('EB_PESO_INVALIDO', format('El peso debe ser mayor que 0 y de hasta %s kg.', v_max),
      jsonb_build_object('peso_max_kg', v_max, 'campo', 'peso'));
  END IF;
  SELECT t.tasa, t.fecha INTO v_tasa, v_fecha FROM public.fn_tasa_bcv_vigente() t;
  SELECT coalesce(jsonb_agg(o ORDER BY (o->>'costo_usd')::numeric, o->>'cooperativa'), '[]'::jsonb) INTO v_opciones
    FROM (
      SELECT jsonb_build_object(
               'cooperativa_id', x.cooperativa_id, 'cooperativa', x.nombre, 'calificacion', x.calificacion_promedio,
               'duracion_min', x.duracion_estimada_min,
               'costo_usd', round(p_peso_kg * v_por_kg * (1 + v_factor * x.duracion_estimada_min), 2),
               'costo_bs', CASE WHEN v_tasa IS NOT NULL
                                THEN round(round(p_peso_kg * v_por_kg * (1 + v_factor * x.duracion_estimada_min), 2) * v_tasa, 2) END) AS o
        FROM (SELECT DISTINCT ON (r.cooperativa_id) r.cooperativa_id, c.nombre, c.calificacion_promedio, r.duracion_estimada_min
                FROM public.rutas r JOIN public.cooperativas c ON c.id = r.cooperativa_id AND c.estado = 'ACTIVA'
               WHERE r.activa
                 AND public.normalizar_localidad(r.ciudad_origen) = public.normalizar_localidad(p_ciudad_origen)
                 AND public.normalizar_localidad(r.ciudad_destino) = public.normalizar_localidad(p_ciudad_destino)
               ORDER BY r.cooperativa_id, r.duracion_estimada_min) x
    ) s;
  RETURN jsonb_build_object('peso_max_kg', v_max, 'tasa_bcv', v_tasa, 'tasa_bcv_fecha', v_fecha, 'opciones', v_opciones);
END $$;

-- ─── 5. Público: rastrear por código de seguimiento (landing, con service role) ─
CREATE OR REPLACE FUNCTION public.fn_rastrear_encomienda_publico(p_tracking text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_e record;
BEGIN
  SELECT e.id, e.tracking_id, e.estado, e.estado_origen, e.ciudad_origen, e.estado_destino, e.ciudad_destino,
         e.created_at, e.updated_at, c.nombre AS cooperativa
    INTO v_e
    FROM public.encomiendas e LEFT JOIN public.cooperativas c ON c.id = e.cooperativa_id
   WHERE upper(e.tracking_id) = upper(btrim(coalesce(p_tracking, '')));
  IF NOT FOUND THEN RETURN NULL; END IF;
  RETURN jsonb_build_object(
    'tracking_id', v_e.tracking_id, 'estado', v_e.estado, 'cooperativa', v_e.cooperativa,
    'origen', jsonb_build_object('estado', v_e.estado_origen, 'ciudad', v_e.ciudad_origen),
    'destino', jsonb_build_object('estado', v_e.estado_destino, 'ciudad', v_e.ciudad_destino),
    'creada_at', v_e.created_at, 'actualizada_at', v_e.updated_at,
    'historial', coalesce((SELECT jsonb_agg(jsonb_build_object('estado', h.estado_nuevo, 'fecha', h.created_at)
                                            ORDER BY h.created_at)
                             FROM public.encomienda_estado_historial h WHERE h.encomienda_id = v_e.id), '[]'::jsonb));
END $$;

-- ─── 6. Público: rutas populares y cifras reales (landing, L-07, LP-03) ─────
CREATE OR REPLACE FUNCTION public.fn_rutas_populares(p_limite integer DEFAULT 6)
RETURNS TABLE (ciudad_origen text, estado_origen text, ciudad_destino text, estado_destino text,
               desde_usd numeric, duracion_min integer, cooperativas integer, salidas_proximas integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT r.ciudad_origen, min(r.estado_origen), r.ciudad_destino, min(r.estado_destino),
         min(r.precio_pasaje)::numeric, min(r.duracion_estimada_min), count(DISTINCT r.cooperativa_id)::integer,
         (SELECT count(*)::integer FROM public.viajes v JOIN public.rutas r2 ON r2.id = v.ruta_id
           WHERE r2.ciudad_origen = r.ciudad_origen AND r2.ciudad_destino = r.ciudad_destino AND r2.activa
             AND v.estado = 'PROGRAMADO' AND v.fecha_hora_salida > now())
    FROM public.rutas r JOIN public.cooperativas c ON c.id = r.cooperativa_id AND c.estado = 'ACTIVA'
   WHERE r.activa AND coalesce(r.precio_pasaje, 0) > 0
   GROUP BY r.ciudad_origen, r.ciudad_destino
   ORDER BY 8 DESC, 7 DESC, 5
   LIMIT greatest(1, least(coalesce(p_limite, 6), 12));
$$;

CREATE OR REPLACE FUNCTION public.fn_estadisticas_publicas()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT jsonb_build_object(
    'cooperativas', (SELECT count(*) FROM public.cooperativas WHERE estado = 'ACTIVA'),
    'ciudades', (SELECT count(DISTINCT x) FROM (
                   SELECT public.normalizar_localidad(r.ciudad_origen) AS x
                     FROM public.rutas r JOIN public.cooperativas c ON c.id = r.cooperativa_id AND c.estado = 'ACTIVA'
                    WHERE r.activa
                   UNION
                   SELECT public.normalizar_localidad(r.ciudad_destino)
                     FROM public.rutas r JOIN public.cooperativas c ON c.id = r.cooperativa_id AND c.estado = 'ACTIVA'
                    WHERE r.activa) t),
    'rutas', (SELECT count(*) FROM (SELECT DISTINCT r.ciudad_origen, r.ciudad_destino
                                      FROM public.rutas r JOIN public.cooperativas c
                                        ON c.id = r.cooperativa_id AND c.estado = 'ACTIVA'
                                     WHERE r.activa) t));
$$;

-- Permisos
DO $$
DECLARE f record;
BEGIN
  FOR f IN SELECT p.oid::regprocedure AS sig FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public' AND p.proname LIKE '\_%' LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', f.sig);
  END LOOP;
  FOR f IN SELECT p.oid::regprocedure AS sig FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public' AND p.proname IN (
              'fn_registrar_encomienda_taquilla', 'fn_rechazar_encomienda_origen', 'fn_validar_pin_retiro',
              'fn_entregar_encomienda', 'fn_desbloquear_pin') LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', f.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', f.sig);
  END LOOP;
  FOR f IN SELECT p.oid::regprocedure AS sig FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public' AND p.proname IN (
              'fn_cotizar_envio_publico', 'fn_rutas_populares', 'fn_estadisticas_publicas') LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO anon, authenticated, service_role', f.sig);
  END LOOP;
  FOR f IN SELECT p.oid::regprocedure AS sig FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public' AND p.proname = 'fn_rastrear_encomienda_publico' LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', f.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f.sig);
  END LOOP;
END $$;

COMMIT;
