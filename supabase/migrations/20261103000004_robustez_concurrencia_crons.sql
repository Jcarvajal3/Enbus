-- Robustez · Concurrencia y tareas programadas.
--   1. Orden único de candados viaje → boletos. El trigger actualizar_asientos actualiza la fila del
--      viaje cada vez que un boleto entra o sale de un estado ocupado; quien bloqueaba primero el
--      boleto y después (por el trigger) el viaje se podía cruzar con _asegurar_asientos, que bloquea
--      el viaje y después los boletos de la compra → deadlock (40P01). Ahora fn_cancelar_boleto,
--      fn_liberar_reserva y auto_expirar_reserva bloquean primero los viajes (en orden de id).
--   2. auto_expirar_reserva por lotes acotados (5.000 por minuto).
--   3. fn_registrar_encomienda_taquilla: el doble clic simultáneo con la misma clave devolvía un
--      error de clave duplicada; ahora el segundo espera y recibe la encomienda ya creada.
--   4. calcular_dias_habiles en hora de Venezuela (antes, la fecha en UTC: una encomienda que llegó un
--      viernes después de las 8 p. m. contaba desde el sábado).
--   5. auto_devolver_encomienda y alerta_amarilla_72h en una sola sentencia, por lotes, sin esperar
--      filas que la taquilla tiene bloqueadas; la devolución corre a las 6:05 a. m. de Venezuela.
--   6. Cola pending_notifications: fn_tomar_notificaciones_pendientes reparte lotes con
--      FOR UPDATE SKIP LOCKED y un plazo de reserva, para que dos ejecuciones de
--      procesar-notificaciones-pendientes no envíen el mismo push; limpieza diaria de la cola.
-- Re-ejecutable. Firmas de las RPC sin cambios.
BEGIN;

-- ─── 1. Cancelaciones del pasajero: viaje → boleto ───────────────────────────
CREATE OR REPLACE FUNCTION public.fn_cancelar_boleto(p_boleto_id uuid, p_motivo text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_uid uuid := public._uid_usuario(); v_b record; v_reembolso numeric; v_tasa numeric; v_fecha date;
BEGIN
  -- Candado del viaje antes que el del boleto (mismo orden que _asegurar_asientos).
  PERFORM 1 FROM public.viajes v WHERE v.id = (SELECT b.viaje_id FROM public.boletos b WHERE b.id = p_boleto_id)
     FOR UPDATE;
  SELECT b.id, b.estado, b.precio, b.comprador_id, v.fecha_hora_salida, p.estado_verificacion AS pago_estado
    INTO v_b
    FROM public.boletos b JOIN public.viajes v ON v.id = b.viaje_id
    LEFT JOIN public.pagos p ON p.id = b.pago_id
   WHERE b.id = p_boleto_id
     FOR UPDATE OF b;
  IF NOT FOUND OR v_b.comprador_id IS DISTINCT FROM v_uid THEN
    PERFORM public._fallar('EB_NO_ENCONTRADO', 'No encontramos este boleto.');
  END IF;
  IF v_b.estado = 'RESERVADO' THEN
    IF v_b.pago_estado = 'PENDIENTE' THEN
      PERFORM public._fallar('EB_PAGO_EN_VERIFICACION',
        'Tu pago está en verificación. Espera la respuesta de la cooperativa o contáctala para cancelar.');
    END IF;
    UPDATE public.boletos SET estado = 'CANCELADO',
           motivo_cancelacion = coalesce(nullif(btrim(p_motivo), ''), 'Reserva cancelada por el pasajero')
     WHERE id = p_boleto_id;
  ELSIF v_b.estado = 'PAGADO' THEN
    IF v_b.fecha_hora_salida <= now() THEN
      PERFORM public._fallar('EB_VIAJE_YA_SALIO', 'Este viaje ya salió; no se puede cancelar desde la app.');
    END IF;
    IF length(btrim(coalesce(p_motivo, ''))) < 3 THEN
      PERFORM public._fallar('EB_MOTIVO_REQUERIDO', 'Cuéntanos brevemente el motivo.', '{"campo":"motivo"}');
    END IF;
    v_reembolso := round(v_b.precio * 0.95, 2);
    UPDATE public.boletos SET estado = 'CANCELADO', motivo_cancelacion = left(btrim(p_motivo), 300),
           monto_reembolso = v_reembolso
     WHERE id = p_boleto_id;
  ELSE
    PERFORM public._fallar('EB_ESTADO_CAMBIO', 'Este boleto ya no se puede cancelar. Actualiza la pantalla.');
  END IF;
  SELECT t.tasa, t.fecha INTO v_tasa, v_fecha FROM public.fn_tasa_bcv_vigente() t;
  RETURN jsonb_build_object('estado', 'CANCELADO', 'reembolso_usd', v_reembolso,
    'reembolso_bs_estimado', CASE WHEN v_reembolso IS NOT NULL AND v_tasa IS NOT NULL THEN round(v_reembolso * v_tasa, 2) END,
    'tasa_bcv', v_tasa, 'tasa_bcv_fecha', v_fecha);
END $$;

CREATE OR REPLACE FUNCTION public.fn_liberar_reserva(p_compra_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_uid uuid := public._uid_usuario(); v_n integer;
BEGIN
  PERFORM 1 FROM public.viajes v
   WHERE v.id IN (SELECT b.viaje_id FROM public.boletos b WHERE b.compra_id = p_compra_id AND b.comprador_id = v_uid)
   ORDER BY v.id FOR UPDATE;
  UPDATE public.boletos b
     SET estado = 'CANCELADO', motivo_cancelacion = 'Reserva liberada por el pasajero'
   WHERE b.compra_id = p_compra_id AND b.comprador_id = v_uid AND b.estado = 'RESERVADO'
     AND NOT EXISTS (SELECT 1 FROM public.pagos p WHERE p.id = b.pago_id
                      AND p.estado_verificacion IN ('PENDIENTE', 'APROBADO'));
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN jsonb_build_object('liberados', v_n);
END $$;

-- ─── 2. Expiración de reservas ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.auto_expirar_reserva()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_ids uuid[]; v_viajes uuid[];
BEGIN
  SELECT array_agg(x.id), array_agg(DISTINCT x.viaje_id) INTO v_ids, v_viajes
    FROM (SELECT b.id, b.viaje_id
            FROM public.boletos b JOIN public.viajes v ON v.id = b.viaje_id
           WHERE b.estado = 'RESERVADO'
             AND ((b.reserva_expira_at IS NOT NULL AND b.reserva_expira_at < now())
                  OR v.fecha_hora_salida < now()
                  OR v.estado IN ('CANCELADO', 'EN_CURSO', 'COMPLETADO'))
             AND NOT EXISTS (SELECT 1 FROM public.pagos p
                              WHERE (p.id = b.pago_id OR p.boleto_id = b.id)
                                AND p.tipo_pago = 'DIGITAL' AND p.estado_verificacion = 'PENDIENTE')
           LIMIT 5000) x;
  IF v_ids IS NULL THEN RETURN; END IF;
  PERFORM 1 FROM public.viajes WHERE id = ANY (v_viajes) ORDER BY id FOR UPDATE;
  -- Se re-evalúan las condiciones: entre la lectura y el candado alguien pudo pagar o re-apartar.
  UPDATE public.boletos b
     SET estado = 'EXPIRADO'
    FROM public.viajes v
   WHERE b.id = ANY (v_ids) AND v.id = b.viaje_id
     AND b.estado = 'RESERVADO'
     AND ((b.reserva_expira_at IS NOT NULL AND b.reserva_expira_at < now())
          OR v.fecha_hora_salida < now()
          OR v.estado IN ('CANCELADO', 'EN_CURSO', 'COMPLETADO'))
     AND NOT EXISTS (SELECT 1 FROM public.pagos p
                      WHERE (p.id = b.pago_id OR p.boleto_id = b.id)
                        AND p.tipo_pago = 'DIGITAL' AND p.estado_verificacion = 'PENDIENTE');
END $$;

-- ─── 3. Alta de encomienda en taquilla: idempotente también en simultáneo ────
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
  -- Dos envíos simultáneos con la misma clave: el segundo espera y devuelve la encomienda del primero.
  PERFORM pg_advisory_xact_lock(hashtextextended('encomiendas.taquilla:' || v_ctx.o_uid::text || ':'
                                                 || p_idempotency_key, 0));
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
  VALUES ('PENDIENTE', v_ctx.o_uid, 'TAQUILLA', left(v_rn, 120), v_rc, v_rt, left(v_dn, 120), v_dc, v_dt,
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

-- ─── 4. Días hábiles en hora de Venezuela ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.calcular_dias_habiles(desde timestamptz, hasta timestamptz)
RETURNS integer LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = public, pg_temp AS $$
  -- Días de lunes a viernes desde el día siguiente a "desde" hasta el día de "hasta" (inclusive),
  -- con las fechas de Venezuela. IMMUTABLE es correcto: la zona horaria es fija.
  SELECT CASE
           WHEN desde IS NULL OR hasta IS NULL OR desde >= hasta THEN 0
           ELSE (SELECT count(*)::integer
                   FROM generate_series(((desde AT TIME ZONE 'America/Caracas')::date + 1)::timestamp,
                                        (hasta AT TIME ZONE 'America/Caracas')::date::timestamp,
                                        interval '1 day') g
                  WHERE extract(isodow FROM g) < 6)
         END;
$$;

-- ─── 5. Devolución automática y alerta amarilla ──────────────────────────────
CREATE OR REPLACE FUNCTION public.auto_devolver_encomienda()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  WITH cand AS (
    SELECT e.id FROM public.encomiendas e
     WHERE e.estado = 'EN_OFICINA_DESTINO' AND public.calcular_dias_habiles(e.updated_at, now()) >= 5
     ORDER BY e.id
     LIMIT 5000
       FOR UPDATE SKIP LOCKED                    -- si la taquilla la está entregando, queda para la próxima pasada
  ), dev AS (
    UPDATE public.encomiendas e SET estado = 'DEVUELTA'
      FROM cand WHERE e.id = cand.id AND e.estado = 'EN_OFICINA_DESTINO'
    RETURNING e.id, e.tracking_id, e.sender_id, e.origen_registro
  )
  INSERT INTO public.pending_notifications (destinatario_id, recurso_tipo, recurso_id, tipo_notificacion, payload)
  SELECT d.sender_id, 'encomienda', d.id, 'DEVOLUCION_AUTOMATICA', jsonb_build_object('tracking_id', d.tracking_id)
    FROM dev d
   WHERE d.origen_registro = 'APP';             -- en altas de taquilla sender_id es el empleado
END $$;

CREATE OR REPLACE FUNCTION public.alerta_amarilla_72h()
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  INSERT INTO public.incidencias (encomienda_id, tipo, descripcion)
  SELECT e.id, 'ALERTA_AMARILLA',
         'La encomienda ' || e.tracking_id || ' lleva más de 72 horas en tránsito sin llegar a destino.'
    FROM public.encomiendas e
   WHERE e.estado = 'EN_TRANSITO' AND e.updated_at < now() - interval '72 hours'
     AND NOT EXISTS (SELECT 1 FROM public.incidencias i
                      WHERE i.encomienda_id = e.id AND i.tipo = 'ALERTA_AMARILLA' AND i.estado = 'ABIERTA')
  ON CONFLICT (encomienda_id) WHERE tipo = 'ALERTA_AMARILLA' AND estado = 'ABIERTA' DO NOTHING;
$$;

-- 6:05 a. m. de Venezuela (UTC-4, sin horario de verano) = 10:05 UTC, y cada hora hasta las 10:05
-- a. m. por si un día hay más de 5.000 (cada pasada es idempotente).
DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'auto_devolver_encomienda') THEN
    PERFORM cron.unschedule('auto_devolver_encomienda');
  END IF;
  PERFORM cron.schedule('auto_devolver_encomienda', '5 10-14 * * *', 'SELECT public.auto_devolver_encomienda()');
END $do$;

-- ─── 6. Cola de notificaciones ───────────────────────────────────────────────
ALTER TABLE public.pending_notifications
  ADD COLUMN IF NOT EXISTS intentos     integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tomada_hasta timestamptz;
COMMENT ON COLUMN public.pending_notifications.tomada_hasta IS
  'Reserva de fn_tomar_notificaciones_pendientes: hasta esta hora ninguna otra ejecución la toma.';

-- Solo service role (edge function procesar-notificaciones-pendientes). Devuelve hasta p_limite avisos
-- pendientes y los reserva p_segundos; dos ejecuciones simultáneas nunca reciben el mismo aviso.
-- Al enviarlo, la edge function marca procesado = true; si falla, vuelve a la cola al vencer la reserva.
CREATE OR REPLACE FUNCTION public.fn_tomar_notificaciones_pendientes(p_limite integer DEFAULT 100,
                                                                     p_segundos integer DEFAULT 120)
RETURNS SETOF public.pending_notifications
LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  UPDATE public.pending_notifications p
     SET tomada_hasta = now() + make_interval(secs => greatest(coalesce(p_segundos, 120), 10)),
         intentos = p.intentos + 1
   WHERE p.id IN (SELECT q.id FROM public.pending_notifications q
                   WHERE NOT q.procesado AND (q.tomada_hasta IS NULL OR q.tomada_hasta < now())
                   ORDER BY q.created_at
                   LIMIT greatest(1, least(coalesce(p_limite, 100), 500))
                     FOR UPDATE SKIP LOCKED)
  RETURNING p.*;
$$;
REVOKE ALL ON FUNCTION public.fn_tomar_notificaciones_pendientes(integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_tomar_notificaciones_pendientes(integer, integer) TO service_role;

CREATE OR REPLACE FUNCTION public.fn_limpiar_notificaciones()
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  DELETE FROM public.pending_notifications WHERE procesado AND created_at < now() - interval '30 days';
  -- Avisos que nunca se pudieron enviar en una semana: ya no son oportunos.
  UPDATE public.pending_notifications SET procesado = true
   WHERE NOT procesado AND created_at < now() - interval '7 days';
$$;
REVOKE ALL ON FUNCTION public.fn_limpiar_notificaciones() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_limpiar_notificaciones() TO service_role;
DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'limpiar_notificaciones') THEN
    PERFORM cron.unschedule('limpiar_notificaciones');
  END IF;
  PERFORM cron.schedule('limpiar_notificaciones', '27 4 * * *', 'SELECT public.fn_limpiar_notificaciones()');
END $do$;

-- Permisos (CREATE OR REPLACE los conserva; se repiten por si se aplica en otro orden).
REVOKE ALL ON FUNCTION public.auto_expirar_reserva() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.auto_devolver_encomienda() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.alerta_amarilla_72h() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_cancelar_boleto(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_liberar_reserva(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_registrar_encomienda_taquilla(uuid, jsonb, jsonb, text, numeric,
                                                               public.modalidad_pago, numeric, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_cancelar_boleto(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_liberar_reserva(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_registrar_encomienda_taquilla(uuid, jsonb, jsonb, text, numeric,
                                                                  public.modalidad_pago, numeric, text, uuid) TO authenticated;

COMMIT;
