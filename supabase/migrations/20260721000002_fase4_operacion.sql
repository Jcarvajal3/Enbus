-- Fase 4 · Operación: bandeja "Requiere tu atención" (#51), editar y cerrar viajes (#52),
-- tarifas con revisión y programación (#54, AD-15), registro del pago de comisiones (AD-18),
-- tipo de notificación para iconos (#49), Realtime de viajes y pagos, y arreglos pendientes de la
-- fase 3 (remitente de taquilla en fn_remitente_de_encomienda, rutas populares solo de
-- cooperativas activas). Requiere 20260720000001…05. Re-ejecutable.
BEGIN;

-- ─── 1. Publicación Realtime (pendiente fase 3) ─────────────────────────────
-- Sin viajes, los asientos no se actualizan en vivo; sin pagos, "Pagos por verificar (n)" no se mueve.
-- Realtime respeta la RLS de cada tabla.
DO $$
DECLARE t text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    RAISE NOTICE 'No existe la publicación supabase_realtime: actívala en Database > Publications y vuelve a ejecutar este archivo.';
    RETURN;
  END IF;
  IF (SELECT puballtables FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    RETURN;
  END IF;
  FOREACH t IN ARRAY ARRAY['boletos', 'encomiendas', 'viajes', 'pagos', 'notificaciones_usuario'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
                    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
      RAISE NOTICE 'Realtime: public.% añadida a supabase_realtime.', t;
    END IF;
  END LOOP;
END $$;

-- ─── 2. Notificaciones con tipo (iconos por tipo en la app, #49) ────────────
ALTER TABLE public.notificaciones_usuario ADD COLUMN IF NOT EXISTS tipo text;

CREATE OR REPLACE FUNCTION public._notificar_usuario(p_usuario uuid, p_tipo text, p_titulo text,
                                                     p_mensaje text, p_recurso_tipo text, p_recurso_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF p_usuario IS NULL
     OR (SELECT role FROM public.profiles WHERE id = p_usuario) IS DISTINCT FROM 'user' THEN
    RETURN;
  END IF;
  INSERT INTO public.notificaciones_usuario (usuario_id, tipo, titulo, mensaje, recurso_tipo, recurso_id)
  VALUES (p_usuario, p_tipo, p_titulo, p_mensaje, p_recurso_tipo, p_recurso_id);
  INSERT INTO public.pending_notifications (destinatario_id, recurso_tipo, recurso_id, tipo_notificacion, payload)
  VALUES (p_usuario, p_recurso_tipo, p_recurso_id, p_tipo,
          jsonb_build_object('titulo', p_titulo, 'mensaje', p_mensaje, 'sin_bandeja', true));
END $$;

-- ─── 3. Remitente de una encomienda de taquilla (pendiente fase 3) ──────────
-- En las altas presenciales sender_id es el empleado: se devuelve el remitente real (remitente_*).
CREATE OR REPLACE FUNCTION public.fn_remitente_de_encomienda(p_encomienda_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_nombre text; v_tel text; v_origen text;
BEGIN
  SELECT e.origen_registro,
         CASE WHEN e.origen_registro = 'TAQUILLA'
              THEN coalesce(nullif(btrim(e.remitente_nombre), ''), 'Cliente de taquilla')
              ELSE pr.nombre_completo END,
         CASE WHEN e.origen_registro = 'TAQUILLA' THEN e.remitente_telefono ELSE pr.telefono END
    INTO v_origen, v_nombre, v_tel
    FROM public.encomiendas e LEFT JOIN public.profiles pr ON pr.id = e.sender_id
   WHERE e.id = p_encomienda_id AND auth.uid() IN (e.sender_id, e.receiver_user_id);
  IF v_nombre IS NULL THEN RETURN NULL; END IF;
  -- Teléfono enmascarado ("•••••••1234"); el marcador 'PENDIENTE-…' no es un teléfono.
  v_tel := CASE WHEN public.normalizar_telefono(v_tel) IS NULL THEN ''
                ELSE '0' || public.normalizar_telefono(v_tel) END;
  RETURN jsonb_build_object('nombre', v_nombre, 'origen_registro', v_origen,
    'telefono', CASE WHEN length(v_tel) > 4 THEN repeat('•', length(v_tel) - 4) || right(v_tel, 4) END);
END $$;

-- ─── 4. Rutas populares: las salidas cuentan solo si la cooperativa está activa ─
CREATE OR REPLACE FUNCTION public.fn_rutas_populares(p_limite integer DEFAULT 6)
RETURNS TABLE (ciudad_origen text, estado_origen text, ciudad_destino text, estado_destino text,
               desde_usd numeric, duracion_min integer, cooperativas integer, salidas_proximas integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT r.ciudad_origen, min(r.estado_origen), r.ciudad_destino, min(r.estado_destino),
         min(r.precio_pasaje)::numeric, min(r.duracion_estimada_min), count(DISTINCT r.cooperativa_id)::integer,
         (SELECT count(*)::integer FROM public.viajes v
            JOIN public.rutas r2 ON r2.id = v.ruta_id
            JOIN public.cooperativas c2 ON c2.id = r2.cooperativa_id AND c2.estado = 'ACTIVA'
           WHERE r2.ciudad_origen = r.ciudad_origen AND r2.ciudad_destino = r.ciudad_destino AND r2.activa
             AND v.estado = 'PROGRAMADO' AND v.fecha_hora_salida > now())
    FROM public.rutas r JOIN public.cooperativas c ON c.id = r.cooperativa_id AND c.estado = 'ACTIVA'
   WHERE r.activa AND coalesce(r.precio_pasaje, 0) > 0
   GROUP BY r.ciudad_origen, r.ciudad_destino
   ORDER BY 8 DESC, 7 DESC, 5
   LIMIT greatest(1, least(coalesce(p_limite, 6), 12));
$$;

-- ─── 5. Comisiones: soporte del pago (AD-18, pendiente fase 3) ──────────────
ALTER TABLE public.comisiones_ciclo
  ADD COLUMN IF NOT EXISTS pago_referencia     text,
  ADD COLUMN IF NOT EXISTS pago_metodo         text,
  ADD COLUMN IF NOT EXISTS pago_registrado_por uuid;      -- sin FK (embeds)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_comisiones_pago_metodo') THEN
    ALTER TABLE public.comisiones_ciclo ADD CONSTRAINT chk_comisiones_pago_metodo
      CHECK (pago_metodo IS NULL OR pago_metodo IN ('PAGO_MOVIL', 'TRANSFERENCIA_BANCARIA', 'ZELLE', 'EFECTIVO'));
  END IF;
END $$;

-- ─── 6. Bandeja "Requiere tu atención" del Resumen (#51, PC-14) ─────────────
-- Conteos del trabajo pendiente de la cooperativa (y de la sucursal del empleado, si tiene).
CREATE OR REPLACE FUNCTION public.fn_bandeja_cooperativa()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_ctx record; v_ciudad text;
  v_pagos integer; v_reemb integer; v_reemb_usd numeric;
  v_vencer integer; v_dias_min integer; v_despachar integer; v_en_camino integer;
  v_prox record; v_prox_enc integer; v_prox_vendidos integer; v_proxima jsonb;
BEGIN
  SELECT * INTO v_ctx FROM public._contexto_staff();
  SELECT s.ciudad INTO v_ciudad FROM public.sucursales s WHERE s.id = v_ctx.o_sucursal_id;

  SELECT count(*) INTO v_pagos
    FROM public.pagos p
   WHERE p.cooperativa_id = v_ctx.o_cooperativa_id AND p.tipo_pago = 'DIGITAL'
     AND NOT p.verificado AND p.rechazado_at IS NULL;

  SELECT count(*), coalesce(sum(b.monto_reembolso), 0) INTO v_reemb, v_reemb_usd
    FROM public.boletos b
   WHERE b.cooperativa_id = v_ctx.o_cooperativa_id AND b.estado = 'CANCELADO'
     AND coalesce(b.monto_reembolso, 0) > 0 AND NOT b.reembolso_procesado;

  -- En oficina de destino con 3 o más días hábiles (se devuelven a los 5).
  SELECT count(*), min(5 - public.calcular_dias_habiles(e.updated_at, now())) INTO v_vencer, v_dias_min
    FROM public.encomiendas e
   WHERE e.cooperativa_id = v_ctx.o_cooperativa_id AND e.estado = 'EN_OFICINA_DESTINO'
     AND (v_ctx.o_sucursal_id IS NULL OR e.sucursal_destino_id = v_ctx.o_sucursal_id
          OR (e.sucursal_destino_id IS NULL
              AND public.normalizar_localidad(e.ciudad_destino) = public.normalizar_localidad(v_ciudad)))
     AND public.calcular_dias_habiles(e.updated_at, now()) >= 3;

  -- Listas para salir desde aquí: pagadas, o por cobrar en destino.
  SELECT count(*) INTO v_despachar
    FROM public.encomiendas e
   WHERE e.cooperativa_id = v_ctx.o_cooperativa_id
     AND (e.estado = 'PAGADA' OR (e.estado = 'POR_PAGAR' AND e.modalidad_pago = 'DESTINO'))
     AND (v_ctx.o_sucursal_id IS NULL OR e.sucursal_origen_id = v_ctx.o_sucursal_id
          OR (e.sucursal_origen_id IS NULL
              AND public.normalizar_localidad(e.ciudad_origen) = public.normalizar_localidad(v_ciudad)));

  SELECT count(*) INTO v_en_camino
    FROM public.encomiendas e
   WHERE e.cooperativa_id = v_ctx.o_cooperativa_id AND e.estado = 'EN_TRANSITO'
     AND (v_ctx.o_sucursal_id IS NULL OR e.sucursal_destino_id = v_ctx.o_sucursal_id
          OR (e.sucursal_destino_id IS NULL
              AND public.normalizar_localidad(e.ciudad_destino) = public.normalizar_localidad(v_ciudad)));

  SELECT v.id, v.fecha_hora_salida, v.asientos_disponibles, r.ciudad_origen, r.ciudad_destino INTO v_prox
    FROM public.viajes v JOIN public.rutas r ON r.id = v.ruta_id
   WHERE v.cooperativa_id = v_ctx.o_cooperativa_id AND v.estado = 'PROGRAMADO'
     AND v.fecha_hora_salida > now() - interval '30 minutes'
     AND (v_ciudad IS NULL OR public.normalizar_localidad(r.ciudad_origen) = public.normalizar_localidad(v_ciudad))
   ORDER BY v.fecha_hora_salida
   LIMIT 1;
  IF v_prox.id IS NOT NULL THEN
    SELECT count(*) INTO v_prox_enc
      FROM public.encomiendas e
     WHERE e.cooperativa_id = v_ctx.o_cooperativa_id
       AND (e.estado = 'PAGADA' OR (e.estado = 'POR_PAGAR' AND e.modalidad_pago = 'DESTINO'))
       AND public.normalizar_localidad(e.ciudad_origen) = public.normalizar_localidad(v_prox.ciudad_origen)
       AND public.normalizar_localidad(e.ciudad_destino) = public.normalizar_localidad(v_prox.ciudad_destino);
    SELECT count(*) INTO v_prox_vendidos
      FROM public.boletos b WHERE b.viaje_id = v_prox.id AND b.estado IN ('PAGADO', 'USADO');
    v_proxima := jsonb_build_object(
      'viaje_id', v_prox.id, 'ciudad_origen', v_prox.ciudad_origen, 'ciudad_destino', v_prox.ciudad_destino,
      'salida', v_prox.fecha_hora_salida,
      'minutos_para_salir', floor(extract(epoch FROM (v_prox.fecha_hora_salida - now())) / 60)::integer,
      'boletos_vendidos', v_prox_vendidos, 'asientos_disponibles', v_prox.asientos_disponibles,
      'encomiendas_por_despachar', v_prox_enc);
  END IF;

  RETURN jsonb_build_object(
    'pagos_por_verificar', v_pagos,
    'reembolsos_por_devolver', v_reemb, 'reembolsos_usd', round(v_reemb_usd, 2),
    'encomiendas_por_vencer', v_vencer, 'dias_minimos_para_devolucion', greatest(coalesce(v_dias_min, 0), 0),
    'encomiendas_por_despachar', v_despachar, 'encomiendas_en_camino', v_en_camino,
    'proxima_salida', v_proxima, 'generado_at', now());
END $$;

-- ─── 7. Viajes: editar y marcar la llegada (#52, P-48) ──────────────────────
-- Solo el administrador de la cooperativa y solo viajes PROGRAMADO. Un argumento NULL no cambia
-- ese dato; '' en unidad o chofer lo borra. Si cambia la hora y hay pasajeros, el motivo es
-- obligatorio y se avisa a cada comprador.
CREATE OR REPLACE FUNCTION public.fn_editar_viaje(
  p_viaje_id uuid, p_numero_unidad text DEFAULT NULL, p_nombre_chofer text DEFAULT NULL,
  p_fecha_hora_salida timestamptz DEFAULT NULL, p_asientos_totales integer DEFAULT NULL,
  p_motivo text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_ctx record; v_v record; v_cambia_hora boolean; v_ocupados integer; v_mayor integer;
  v_motivo text := left(btrim(coalesce(p_motivo, '')), 300); v_avisados integer := 0; r record;
  v_salida timestamptz; v_llegada timestamptz; v_totales integer; v_disponibles integer;
BEGIN
  SELECT * INTO v_ctx FROM public._contexto_staff();
  IF v_ctx.o_rol <> 'admin_cooperativa' THEN
    PERFORM public._fallar('EB_SIN_PERMISO', 'Solo el administrador de la cooperativa puede editar viajes.');
  END IF;
  SELECT v.*, ru.ciudad_origen, ru.ciudad_destino, ru.duracion_estimada_min INTO v_v
    FROM public.viajes v JOIN public.rutas ru ON ru.id = v.ruta_id
   WHERE v.id = p_viaje_id FOR UPDATE OF v;
  IF NOT FOUND OR v_v.cooperativa_id <> v_ctx.o_cooperativa_id THEN
    PERFORM public._fallar('EB_NO_ENCONTRADO', 'No encontramos ese viaje en tu cooperativa.');
  END IF;
  IF v_v.estado <> 'PROGRAMADO' THEN
    PERFORM public._fallar('EB_ESTADO_CAMBIO', 'Solo se pueden editar los viajes programados.');
  END IF;

  SELECT count(*), max(CASE WHEN b.asiento ~ '^[0-9]+$' THEN b.asiento::integer END) INTO v_ocupados, v_mayor
    FROM public.boletos b
   WHERE b.viaje_id = p_viaje_id AND b.estado IN ('RESERVADO', 'PAGADO', 'USADO');

  v_cambia_hora := p_fecha_hora_salida IS NOT NULL AND p_fecha_hora_salida <> v_v.fecha_hora_salida;
  IF v_cambia_hora AND p_fecha_hora_salida <= now() THEN
    PERFORM public._fallar('EB_DATOS_INVALIDOS', 'La nueva salida tiene que ser más tarde que ahora.',
                           '{"campo":"salida"}');
  END IF;
  IF v_cambia_hora AND v_ocupados > 0 AND length(v_motivo) < 5 THEN
    PERFORM public._fallar('EB_MOTIVO_REQUERIDO',
      'Este viaje tiene pasajeros: explica por qué cambia la hora. Les enviaremos tu mensaje.', '{"campo":"motivo"}');
  END IF;
  IF p_asientos_totales IS NOT NULL THEN
    IF p_asientos_totales < 1 OR p_asientos_totales > 80 THEN
      PERFORM public._fallar('EB_DATOS_INVALIDOS', 'El bus debe tener entre 1 y 80 asientos.', '{"campo":"asientos"}');
    END IF;
    IF p_asientos_totales < greatest(coalesce(v_mayor, 0), v_ocupados) THEN
      PERFORM public._fallar('EB_DATOS_INVALIDOS',
        format('Ya hay pasajeros hasta el asiento %s: el bus debe tener al menos %s asientos.',
               greatest(coalesce(v_mayor, 0), v_ocupados), greatest(coalesce(v_mayor, 0), v_ocupados)),
        jsonb_build_object('campo', 'asientos', 'minimo', greatest(coalesce(v_mayor, 0), v_ocupados)));
    END IF;
  END IF;

  v_salida := CASE WHEN v_cambia_hora THEN p_fecha_hora_salida ELSE v_v.fecha_hora_salida END;
  v_llegada := CASE WHEN v_cambia_hora
                    THEN p_fecha_hora_salida + make_interval(mins => coalesce(v_v.duracion_estimada_min, 0))
                    ELSE v_v.fecha_hora_llegada_est END;
  v_totales := coalesce(p_asientos_totales, v_v.asientos_totales);
  v_disponibles := CASE WHEN p_asientos_totales IS NULL THEN v_v.asientos_disponibles
                        ELSE greatest(p_asientos_totales - v_ocupados, 0) END;

  UPDATE public.viajes
     SET numero_unidad = CASE WHEN p_numero_unidad IS NULL THEN numero_unidad
                              ELSE nullif(left(btrim(p_numero_unidad), 40), '') END,
         nombre_chofer = CASE WHEN p_nombre_chofer IS NULL THEN nombre_chofer
                              ELSE nullif(left(btrim(p_nombre_chofer), 80), '') END,
         fecha_hora_salida = v_salida, fecha_hora_llegada_est = v_llegada,
         asientos_totales = v_totales, asientos_disponibles = v_disponibles
   WHERE id = p_viaje_id;

  IF v_cambia_hora THEN
    FOR r IN SELECT DISTINCT ON (b.comprador_id) b.comprador_id, b.id
               FROM public.boletos b
              WHERE b.viaje_id = p_viaje_id AND b.estado IN ('RESERVADO', 'PAGADO')
              ORDER BY b.comprador_id, b.created_at LOOP
      PERFORM public._notificar_usuario(r.comprador_id, 'VIAJE_REPROGRAMADO', 'Cambió la hora de tu viaje',
        format('Tu viaje %s → %s ahora sale el %s (antes: %s). Motivo: %s. Si la nueva hora no te sirve, escríbele a la cooperativa.',
               initcap(replace(v_v.ciudad_origen, '_', ' ')), initcap(replace(v_v.ciudad_destino, '_', ' ')),
               public._fecha_hora_ve(v_salida), public._fecha_hora_ve(v_v.fecha_hora_salida),
               coalesce(nullif(v_motivo, ''), 'ajuste de horario')),
        'boleto', r.id);
      v_avisados := v_avisados + 1;
    END LOOP;
  END IF;

  RETURN jsonb_build_object('viaje_id', p_viaje_id, 'salida', v_salida, 'llegada_estimada', v_llegada,
                            'asientos_totales', v_totales, 'asientos_disponibles', v_disponibles,
                            'pasajeros_avisados', v_avisados);
END $$;

-- El bus llegó: EN_CURSO → COMPLETADO (cualquier empleado de la cooperativa).
CREATE OR REPLACE FUNCTION public.fn_completar_viaje(p_viaje_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_ctx record; v_v record; v_no_embarcados integer;
BEGIN
  SELECT * INTO v_ctx FROM public._contexto_staff();
  SELECT id, cooperativa_id, estado INTO v_v FROM public.viajes WHERE id = p_viaje_id FOR UPDATE;
  IF NOT FOUND OR v_v.cooperativa_id <> v_ctx.o_cooperativa_id THEN
    PERFORM public._fallar('EB_NO_ENCONTRADO', 'No encontramos ese viaje en tu cooperativa.');
  END IF;
  IF v_v.estado = 'COMPLETADO' THEN
    RETURN jsonb_build_object('estado', 'COMPLETADO', 'ya_procesado', true);
  END IF;
  IF v_v.estado <> 'EN_CURSO' THEN
    PERFORM public._fallar('EB_ESTADO_CAMBIO', 'Marca primero la salida del bus; luego podrás marcar su llegada.');
  END IF;
  UPDATE public.viajes SET estado = 'COMPLETADO' WHERE id = p_viaje_id;
  SELECT count(*) INTO v_no_embarcados FROM public.boletos b WHERE b.viaje_id = p_viaje_id AND b.estado = 'PAGADO';
  RETURN jsonb_build_object('estado', 'COMPLETADO', 'no_embarcados', v_no_embarcados);
END $$;

-- ─── 8. Tarifas: publicar en una operación, con programación (#54, AD-15) ────
-- Antes se desactivaba la vigente y luego se insertaba la nueva en dos pasos (sin transacción), y
-- una fecha futura activaba la tarifa al instante. Ahora:
--   vigente     activa = true (una sola, idx_tarifas_activa)
--   programada  activa = false, publicada_at NOT NULL, reemplazada_at NULL, vigente_desde > now()
--   histórica   reemplazada_at NOT NULL
ALTER TABLE public.tarifas
  ADD COLUMN IF NOT EXISTS publicada_at   timestamptz,
  ADD COLUMN IF NOT EXISTS reemplazada_at timestamptz,
  ADD COLUMN IF NOT EXISTS nota           text;
UPDATE public.tarifas SET publicada_at = created_at WHERE activa AND publicada_at IS NULL;
UPDATE public.tarifas SET reemplazada_at = created_at
 WHERE NOT activa AND publicada_at IS NULL AND reemplazada_at IS NULL;   -- histórico anterior

CREATE OR REPLACE FUNCTION public.fn_publicar_tarifa(
  p_tarifa_por_kg numeric, p_factor_distancia_por_min numeric, p_dimensiones_max_cm integer,
  p_peso_max_kg numeric, p_vigente_desde timestamptz DEFAULT NULL, p_nota text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_uid uuid := auth.uid(); v_desde timestamptz := coalesce(p_vigente_desde, now()); v_id uuid;
        v_programada boolean;
BEGIN
  IF v_uid IS NULL OR NOT coalesce(public.is_super_admin(), false) THEN
    PERFORM public._fallar('EB_SIN_PERMISO', 'Solo el equipo de EnBus puede publicar tarifas.');
  END IF;
  IF p_tarifa_por_kg IS NULL OR p_tarifa_por_kg <= 0 OR p_tarifa_por_kg > 1000 THEN
    PERFORM public._fallar('EB_DATOS_INVALIDOS', 'El precio por kilo debe ser mayor que 0.', '{"campo":"tarifa_por_kg"}');
  END IF;
  IF p_factor_distancia_por_min IS NULL OR p_factor_distancia_por_min < 0 OR p_factor_distancia_por_min > 1 THEN
    PERFORM public._fallar('EB_DATOS_INVALIDOS', 'El recargo por minuto de viaje debe estar entre 0 y 1.',
                           '{"campo":"factor_distancia_por_min"}');
  END IF;
  IF p_dimensiones_max_cm IS NULL OR p_dimensiones_max_cm < 10 OR p_dimensiones_max_cm > 300 THEN
    PERFORM public._fallar('EB_DATOS_INVALIDOS', 'La medida máxima debe estar entre 10 y 300 cm.',
                           '{"campo":"dimensiones_max_cm"}');
  END IF;
  IF p_peso_max_kg IS NULL OR p_peso_max_kg < 1 OR p_peso_max_kg > 100 THEN
    PERFORM public._fallar('EB_DATOS_INVALIDOS', 'El peso máximo debe estar entre 1 y 100 kg.', '{"campo":"peso_max_kg"}');
  END IF;
  v_programada := v_desde > now() + interval '1 minute';
  -- Una programación nueva reemplaza a la anterior que aún no entró en vigor.
  UPDATE public.tarifas SET reemplazada_at = now()
   WHERE NOT activa AND publicada_at IS NOT NULL AND reemplazada_at IS NULL;
  IF NOT v_programada THEN
    UPDATE public.tarifas SET activa = false, reemplazada_at = now() WHERE activa;
    v_desde := now();
  END IF;
  INSERT INTO public.tarifas (tarifa_por_kg, factor_distancia_por_min, dimensiones_max_cm, peso_max_kg,
                              vigente_desde, activa, creada_por, publicada_at, nota)
  VALUES (round(p_tarifa_por_kg, 2), round(p_factor_distancia_por_min, 4), p_dimensiones_max_cm,
          round(p_peso_max_kg, 2), v_desde, NOT v_programada, v_uid, now(),
          nullif(left(btrim(coalesce(p_nota, '')), 300), ''))
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('id', v_id, 'estado', CASE WHEN v_programada THEN 'PROGRAMADA' ELSE 'VIGENTE' END,
                            'vigente_desde', v_desde);
END $$;

CREATE OR REPLACE FUNCTION public.fn_cancelar_tarifa_programada(p_tarifa_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT coalesce(public.is_super_admin(), false) THEN
    PERFORM public._fallar('EB_SIN_PERMISO', 'Solo el equipo de EnBus puede cambiar las tarifas.');
  END IF;
  UPDATE public.tarifas SET reemplazada_at = now()
   WHERE id = p_tarifa_id AND NOT activa AND publicada_at IS NOT NULL AND reemplazada_at IS NULL;
  IF NOT FOUND THEN
    PERFORM public._fallar('EB_ESTADO_CAMBIO', 'Esta tarifa ya no está programada. Actualiza la página.');
  END IF;
  RETURN jsonb_build_object('id', p_tarifa_id, 'estado', 'CANCELADA');
END $$;

-- Cron: activa la tarifa programada cuando llega su fecha.
CREATE OR REPLACE FUNCTION public.fn_activar_tarifas_programadas()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_id uuid;
BEGIN
  SELECT id INTO v_id FROM public.tarifas
   WHERE NOT activa AND publicada_at IS NOT NULL AND reemplazada_at IS NULL AND vigente_desde <= now()
   ORDER BY vigente_desde DESC, publicada_at DESC LIMIT 1 FOR UPDATE;
  IF v_id IS NULL THEN RETURN; END IF;
  UPDATE public.tarifas SET activa = false, reemplazada_at = now() WHERE activa;
  UPDATE public.tarifas SET reemplazada_at = now()
   WHERE id <> v_id AND NOT activa AND publicada_at IS NOT NULL AND reemplazada_at IS NULL AND vigente_desde <= now();
  UPDATE public.tarifas SET activa = true WHERE id = v_id;
END $$;

DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'activar_tarifas_programadas') THEN
    PERFORM cron.unschedule('activar_tarifas_programadas');
  END IF;
  PERFORM cron.schedule('activar_tarifas_programadas', '*/5 * * * *',
                        'SELECT public.fn_activar_tarifas_programadas()');
END $do$;

-- ─── Permisos ────────────────────────────────────────────────────────────────
DO $$
DECLARE f record;
BEGIN
  FOR f IN SELECT p.oid::regprocedure AS sig FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public' AND p.proname LIKE '\_%' LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', f.sig);
  END LOOP;
  FOR f IN SELECT p.oid::regprocedure AS sig FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public' AND p.proname IN (
              'fn_bandeja_cooperativa', 'fn_editar_viaje', 'fn_completar_viaje', 'fn_publicar_tarifa',
              'fn_cancelar_tarifa_programada', 'fn_remitente_de_encomienda') LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', f.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', f.sig);
  END LOOP;
  FOR f IN SELECT p.oid::regprocedure AS sig FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public' AND p.proname = 'fn_activar_tarifas_programadas' LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', f.sig);
  END LOOP;
  FOR f IN SELECT p.oid::regprocedure AS sig FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public' AND p.proname = 'fn_rutas_populares' LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO anon, authenticated, service_role', f.sig);
  END LOOP;
END $$;

COMMIT;
