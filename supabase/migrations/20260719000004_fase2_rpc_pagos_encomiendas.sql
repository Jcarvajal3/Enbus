-- Cobro en destino, pagos de encomienda, aprobar/rechazar, bandeja de verificación,
-- recepción en origen con costo en servidor, despacho y salida del bus.
BEGIN;

-- 1. Máquina de estados de encomienda.
CREATE OR REPLACE FUNCTION public.validar_transicion_encomienda_fn()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.estado IS DISTINCT FROM NEW.estado THEN
    IF OLD.estado IN ('ENTREGADA', 'CANCELADA', 'DEVUELTA') THEN
      RAISE EXCEPTION 'No se permite salir de un estado terminal: %', OLD.estado;
    ELSIF OLD.estado = 'PENDIENTE_DE_ESCANEO' AND NEW.estado NOT IN ('EN_RECEPCION', 'CANCELADA') THEN
      RAISE EXCEPTION 'Transición no válida: % -> %', OLD.estado, NEW.estado;
    ELSIF OLD.estado = 'EN_RECEPCION' AND NEW.estado NOT IN ('POR_PAGAR') THEN
      RAISE EXCEPTION 'Transición no válida: % -> %', OLD.estado, NEW.estado;
    ELSIF OLD.estado = 'POR_PAGAR' AND NEW.estado = 'EN_TRANSITO' AND NEW.modalidad_pago <> 'DESTINO' THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'EB_COBRO_PENDIENTE',
        HINT = format('La encomienda %s está por pagar en origen. Cóbrala antes de despacharla.', NEW.tracking_id);
    ELSIF OLD.estado = 'POR_PAGAR' AND NEW.estado NOT IN ('PAGADA', 'CANCELADA', 'EN_TRANSITO') THEN
      RAISE EXCEPTION 'Transición no válida: % -> %', OLD.estado, NEW.estado;
    ELSIF OLD.estado = 'PAGADA' AND NEW.estado NOT IN ('EN_TRANSITO') THEN
      RAISE EXCEPTION 'Transición no válida: % -> %', OLD.estado, NEW.estado;
    ELSIF OLD.estado = 'EN_TRANSITO' AND NEW.estado NOT IN ('EN_OFICINA_DESTINO') THEN
      RAISE EXCEPTION 'Transición no válida: % -> %', OLD.estado, NEW.estado;
    ELSIF OLD.estado = 'EN_OFICINA_DESTINO' AND NEW.estado NOT IN ('ENTREGADA', 'DEVUELTA') THEN
      RAISE EXCEPTION 'Transición no válida: % -> %', OLD.estado, NEW.estado;
    END IF;
    IF NEW.estado = 'ENTREGADA' AND NEW.modalidad_pago = 'DESTINO'
       AND NOT EXISTS (SELECT 1 FROM public.pagos p WHERE p.encomienda_id = NEW.id AND p.verificado) THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'EB_COBRO_PENDIENTE',
        HINT = 'Falta cobrar el envío: regístralo antes de entregarlo.';
    END IF;
  END IF;
  RETURN NEW;
END $$;
-- (el trigger validar_transicion_encomienda ya existe y usa esta función)

-- 2. App: pagar una encomienda (ORIGEN: remitente en POR_PAGAR; DESTINO: remitente o destinatario
--    desde POR_PAGAR hasta EN_OFICINA_DESTINO). Sustituye el INSERT directo de la app y su UPDATE a un estado "en verificación" que no existe en el enum.
CREATE OR REPLACE FUNCTION public.fn_registrar_pago_encomienda(
  p_encomienda_id uuid, p_metodo_pago_id uuid, p_numero_referencia text, p_fecha_transaccion date,
  p_banco_emisor text, p_monto_declarado numeric, p_tasa_esperada numeric, p_idempotency_key text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_uid uuid := public._uid_usuario(); v_e record; v_metodo_tipo public.tipo_metodo_pago;
  v_tasa numeric; v_tasa_fecha date; v_ref text; v_bs numeric; v_moneda text; v_esperado numeric; v_pago_id uuid;
BEGIN
  IF coalesce(length(p_idempotency_key), 0) < 8 THEN
    PERFORM public._fallar('EB_DATOS_INVALIDOS', 'Falta la clave de la operación. Actualiza la app e intenta de nuevo.');
  END IF;
  SELECT * INTO v_e FROM public.encomiendas WHERE id = p_encomienda_id FOR UPDATE;
  IF NOT FOUND OR NOT (v_e.sender_id = v_uid OR v_e.receiver_user_id IS NOT DISTINCT FROM v_uid) THEN
    PERFORM public._fallar('EB_NO_ENCONTRADO', 'No encontramos esta encomienda.');
  END IF;
  SELECT id INTO v_pago_id FROM public.pagos WHERE pagador_id = v_uid AND idempotency_key = p_idempotency_key;
  IF v_pago_id IS NOT NULL THEN
    RETURN jsonb_build_object('pago_id', v_pago_id, 'estado', 'PENDIENTE', 'repetido', true);
  END IF;
  IF NOT ((v_e.estado = 'POR_PAGAR' AND (v_e.modalidad_pago = 'DESTINO' OR v_e.sender_id = v_uid))
       OR (v_e.modalidad_pago = 'DESTINO' AND v_e.estado IN ('EN_TRANSITO', 'EN_OFICINA_DESTINO'))) THEN
    PERFORM public._fallar('EB_ESTADO_CAMBIO', 'Esta encomienda no tiene un pago pendiente. Actualiza la pantalla.');
  END IF;
  IF coalesce(v_e.costo_calculado, 0) <= 0 THEN
    PERFORM public._fallar('EB_COSTO_PENDIENTE', 'El costo se calcula cuando la taquilla pesa el paquete.');
  END IF;
  IF EXISTS (SELECT 1 FROM public.pagos WHERE encomienda_id = p_encomienda_id
              AND estado_verificacion IN ('PENDIENTE', 'APROBADO')) THEN
    PERFORM public._fallar('EB_PAGO_YA_REGISTRADO', 'Ya hay un pago registrado para esta encomienda.');
  END IF;
  SELECT m.tipo INTO v_metodo_tipo FROM public.metodos_pago_cooperativa m
   WHERE m.id = p_metodo_pago_id AND m.cooperativa_id = v_e.cooperativa_id AND m.activo;
  IF v_metodo_tipo IS NULL OR v_metodo_tipo = 'EFECTIVO' THEN
    PERFORM public._fallar('EB_METODO_INVALIDO', 'Elige una forma de pago de la cooperativa. El efectivo se paga en taquilla.');
  END IF;
  v_ref := public._validar_comprobante(v_metodo_tipo, p_numero_referencia, p_banco_emisor, p_fecha_transaccion);
  SELECT o_tasa, o_fecha INTO v_tasa, v_tasa_fecha FROM public._tasa_para_cobro();
  v_bs := round(v_e.costo_calculado * v_tasa, 2);
  IF p_tasa_esperada IS NOT NULL AND abs(p_tasa_esperada - v_tasa) > 0.00005 THEN
    PERFORM public._fallar('EB_TASA_CAMBIO', 'La tasa BCV se actualizó. Revisa el nuevo total antes de registrar el pago.',
      jsonb_build_object('tasa', v_tasa, 'tasa_fecha', v_tasa_fecha, 'total_usd', v_e.costo_calculado, 'total_bs', v_bs));
  END IF;
  v_moneda := CASE WHEN v_metodo_tipo = 'ZELLE' THEN 'USD' ELSE 'VES' END;
  v_esperado := CASE WHEN v_moneda = 'USD' THEN v_e.costo_calculado ELSE v_bs END;
  IF p_monto_declarado IS NOT NULL AND (p_monto_declarado <= 0 OR p_monto_declarado > v_esperado * 10) THEN
    PERFORM public._fallar('EB_DATOS_PAGO_INVALIDOS', 'Revisa el monto que pagaste.', '{"campo":"monto"}');
  END IF;
  IF EXISTS (SELECT 1 FROM public.pagos WHERE cooperativa_id = v_e.cooperativa_id AND numero_referencia = v_ref
              AND tipo_pago = 'DIGITAL' AND rechazado_at IS NULL) THEN
    PERFORM public._fallar('EB_REFERENCIA_REPETIDA',
      'Esa referencia ya fue registrada en otro pago. Revisa el número de tu comprobante.', '{"campo":"referencia"}');
  END IF;
  BEGIN
    INSERT INTO public.pagos (encomienda_id, pagador_id, cooperativa_id, metodo_pago_id, monto, monto_bs, tasa_bcv,
                              tasa_bcv_fecha, moneda, monto_declarado, tipo_pago, numero_referencia,
                              fecha_transaccion, banco_emisor, verificado, idempotency_key)
    VALUES (p_encomienda_id, v_uid, v_e.cooperativa_id, p_metodo_pago_id, v_e.costo_calculado, v_bs, v_tasa,
            v_tasa_fecha, v_moneda, coalesce(p_monto_declarado, v_esperado), 'DIGITAL', v_ref,
            p_fecha_transaccion, CASE WHEN v_metodo_tipo = 'ZELLE' THEN 'Zelle' ELSE btrim(p_banco_emisor) END,
            false, p_idempotency_key)
    RETURNING id INTO v_pago_id;
  EXCEPTION WHEN unique_violation THEN
    PERFORM public._fallar('EB_PAGO_YA_REGISTRADO', 'Ya hay un pago registrado para esta encomienda.');
  END;
  RETURN jsonb_build_object('pago_id', v_pago_id, 'estado', 'PENDIENTE', 'monto_usd', v_e.costo_calculado,
    'monto_bs', v_bs, 'tasa_bcv', v_tasa, 'tasa_bcv_fecha', v_tasa_fecha, 'moneda', v_moneda,
    'monto_declarado', coalesce(p_monto_declarado, v_esperado));
END $$;

-- 3. Taquilla (origen o destino): cobrar una encomienda en mostrador (P-33).
CREATE OR REPLACE FUNCTION public.fn_cobrar_encomienda_taquilla(
  p_encomienda_id uuid, p_metodo_tipo public.tipo_metodo_pago, p_metodo_pago_id uuid, p_moneda text,
  p_monto_recibido numeric, p_numero_referencia text, p_fecha_transaccion date, p_banco_emisor text,
  p_idempotency_key text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_ctx record; v_e record; v_tasa numeric; v_tasa_fecha date; v_ref text;
  v_bs numeric; v_moneda text; v_esperado numeric; v_pago_id uuid;
BEGIN
  SELECT * INTO v_ctx FROM public._contexto_staff();
  IF coalesce(length(p_idempotency_key), 0) < 8 THEN
    PERFORM public._fallar('EB_DATOS_INVALIDOS', 'Falta la clave de la operación. Recarga la página.');
  END IF;
  SELECT * INTO v_e FROM public.encomiendas WHERE id = p_encomienda_id FOR UPDATE;
  IF NOT FOUND OR v_e.cooperativa_id IS DISTINCT FROM v_ctx.o_cooperativa_id THEN
    PERFORM public._fallar('EB_NO_ENCONTRADO', 'No encontramos esta encomienda en tu cooperativa.');
  END IF;
  SELECT id INTO v_pago_id FROM public.pagos WHERE pagador_id = v_ctx.o_uid AND idempotency_key = p_idempotency_key;
  IF v_pago_id IS NOT NULL THEN
    RETURN jsonb_build_object('pago_id', v_pago_id, 'estado', 'APROBADO', 'repetido', true);
  END IF;
  IF NOT (v_e.estado = 'POR_PAGAR'
          OR (v_e.modalidad_pago = 'DESTINO' AND v_e.estado IN ('EN_TRANSITO', 'EN_OFICINA_DESTINO'))) THEN
    PERFORM public._fallar('EB_ESTADO_CAMBIO', 'Esta encomienda ya no está pendiente de pago. Actualiza la lista.');
  END IF;
  IF coalesce(v_e.costo_calculado, 0) <= 0 THEN
    PERFORM public._fallar('EB_COSTO_PENDIENTE', 'La encomienda todavía no tiene costo. Recíbela y pésala primero.');
  END IF;
  IF EXISTS (SELECT 1 FROM public.pagos WHERE encomienda_id = p_encomienda_id AND verificado) THEN
    PERFORM public._fallar('EB_PAGO_YA_REGISTRADO', 'Esta encomienda ya está pagada.');
  END IF;
  IF EXISTS (SELECT 1 FROM public.pagos WHERE encomienda_id = p_encomienda_id AND estado_verificacion = 'PENDIENTE') THEN
    PERFORM public._fallar('EB_PAGO_PENDIENTE_EXISTE',
      'El cliente ya reportó un pago. Verifícalo o recházalo antes de cobrar de nuevo.');
  END IF;
  IF p_metodo_pago_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM public.metodos_pago_cooperativa
        WHERE id = p_metodo_pago_id AND cooperativa_id = v_ctx.o_cooperativa_id AND tipo = p_metodo_tipo) THEN
    PERFORM public._fallar('EB_METODO_INVALIDO', 'La cuenta elegida no corresponde a esa forma de pago.');
  END IF;
  v_ref := public._validar_comprobante(p_metodo_tipo, p_numero_referencia, p_banco_emisor, p_fecha_transaccion);
  v_moneda := CASE p_metodo_tipo WHEN 'ZELLE' THEN 'USD' WHEN 'EFECTIVO' THEN coalesce(p_moneda, 'VES') ELSE 'VES' END;
  IF v_moneda NOT IN ('VES', 'USD') THEN PERFORM public._fallar('EB_DATOS_INVALIDOS', 'Moneda no válida.'); END IF;
  SELECT o_tasa, o_fecha INTO v_tasa, v_tasa_fecha FROM public._tasa_para_cobro();
  v_bs := round(v_e.costo_calculado * v_tasa, 2);
  v_esperado := CASE WHEN v_moneda = 'USD' THEN v_e.costo_calculado ELSE v_bs END;
  IF p_metodo_tipo = 'EFECTIVO' AND coalesce(p_monto_recibido, 0) < v_esperado THEN
    PERFORM public._fallar('EB_MONTO_INSUFICIENTE', 'El monto recibido es menor que el total a cobrar.',
      jsonb_build_object('esperado', v_esperado, 'moneda', v_moneda, 'campo', 'monto'));
  END IF;
  BEGIN
    INSERT INTO public.pagos (encomienda_id, pagador_id, cooperativa_id, metodo_pago_id, monto, monto_bs, tasa_bcv,
                              tasa_bcv_fecha, moneda, monto_declarado, tipo_pago, numero_referencia,
                              fecha_transaccion, banco_emisor, verificado, verificado_por, verificado_at, idempotency_key)
    VALUES (p_encomienda_id, v_ctx.o_uid, v_ctx.o_cooperativa_id, p_metodo_pago_id, v_e.costo_calculado, v_bs,
            v_tasa, v_tasa_fecha, v_moneda, coalesce(p_monto_recibido, v_esperado),
            CASE WHEN p_metodo_tipo = 'EFECTIVO' THEN 'EFECTIVO'::public.tipo_pago ELSE 'DIGITAL'::public.tipo_pago END,
            v_ref, coalesce(p_fecha_transaccion, (now() AT TIME ZONE 'America/Caracas')::date),
            CASE WHEN p_metodo_tipo = 'ZELLE' THEN 'Zelle' ELSE nullif(btrim(p_banco_emisor), '') END,
            true, v_ctx.o_uid, now(), p_idempotency_key)
    RETURNING id INTO v_pago_id;
  EXCEPTION WHEN unique_violation THEN
    PERFORM public._fallar('EB_PAGO_YA_REGISTRADO', 'Esta encomienda ya está pagada.');
  END;
  IF v_e.estado = 'POR_PAGAR' THEN
    UPDATE public.encomiendas SET estado = 'PAGADA' WHERE id = p_encomienda_id;
  END IF;
  RETURN jsonb_build_object('pago_id', v_pago_id, 'estado', 'APROBADO',
    'encomienda_estado', CASE WHEN v_e.estado = 'POR_PAGAR' THEN 'PAGADA' ELSE v_e.estado::text END,
    'monto_usd', v_e.costo_calculado, 'monto_bs', v_bs, 'tasa_bcv', v_tasa, 'tasa_bcv_fecha', v_tasa_fecha,
    'moneda', v_moneda, 'esperado', v_esperado, 'recibido', coalesce(p_monto_recibido, v_esperado),
    'vuelto', GREATEST(coalesce(p_monto_recibido, v_esperado) - v_esperado, 0));
END $$;

-- 4. Aprobar / rechazar (personal de la cooperativa).
CREATE OR REPLACE FUNCTION public.fn_aprobar_pago(p_pago_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_ctx record; v_p public.pagos%ROWTYPE; v_n integer := 0; v_tracking text; v_boleto uuid;
BEGIN
  SELECT * INTO v_ctx FROM public._contexto_staff();
  SELECT * INTO v_p FROM public.pagos WHERE id = p_pago_id FOR UPDATE;
  IF NOT FOUND OR v_p.cooperativa_id <> v_ctx.o_cooperativa_id THEN
    PERFORM public._fallar('EB_NO_ENCONTRADO', 'No encontramos este pago en tu cooperativa.');
  END IF;
  IF v_p.verificado THEN RETURN jsonb_build_object('ok', true, 'ya_procesado', true); END IF;
  IF v_p.rechazado_at IS NOT NULL THEN
    PERFORM public._fallar('EB_PAGO_YA_RESUELTO', 'Este pago ya fue rechazado. Actualiza la lista.');
  END IF;
  UPDATE public.pagos SET verificado = true, verificado_por = v_ctx.o_uid, verificado_at = now() WHERE id = p_pago_id;

  IF v_p.encomienda_id IS NOT NULL THEN
    UPDATE public.encomiendas SET estado = 'PAGADA' WHERE id = v_p.encomienda_id AND estado = 'POR_PAGAR';
    SELECT tracking_id INTO v_tracking FROM public.encomiendas WHERE id = v_p.encomienda_id;
    PERFORM public._notificar_usuario(v_p.pagador_id, 'PAGO_APROBADO', 'Pago confirmado',
      format('La cooperativa confirmó el pago de tu envío %s.', v_tracking), 'encomienda', v_p.encomienda_id);
    RETURN jsonb_build_object('ok', true, 'encomienda_id', v_p.encomienda_id);
  END IF;

  UPDATE public.boletos
     SET estado = 'PAGADO', reserva_expira_at = NULL,
         qr_embarque_data = coalesce(qr_embarque_data, 'PASS-' || codigo_boleto)
   WHERE (pago_id = p_pago_id OR (id = v_p.boleto_id AND pago_id IS NULL)) AND estado = 'RESERVADO';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n = 0 THEN
    PERFORM public._fallar('EB_BOLETOS_NO_ACTIVABLES',
      'Los boletos de este pago ya vencieron o se cancelaron. Recházalo con el motivo y devuelve el dinero.');
  END IF;
  SELECT id INTO v_boleto FROM public.boletos WHERE pago_id = p_pago_id ORDER BY length(asiento), asiento LIMIT 1;
  PERFORM public._notificar_usuario(v_p.pagador_id, 'PAGO_APROBADO', 'Pago confirmado',
    'La cooperativa confirmó tu pago. Tu pase de abordaje ya está disponible.', 'boleto', coalesce(v_boleto, v_p.boleto_id));
  RETURN jsonb_build_object('ok', true, 'boletos_activados', v_n);
END $$;

CREATE OR REPLACE FUNCTION public.fn_rechazar_pago(p_pago_id uuid, p_motivo text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_ctx record; v_p public.pagos%ROWTYPE; v_motivo text := left(btrim(coalesce(p_motivo, '')), 300);
        v_tracking text; v_n integer := 0; v_boleto uuid;
BEGIN
  SELECT * INTO v_ctx FROM public._contexto_staff();
  SELECT * INTO v_p FROM public.pagos WHERE id = p_pago_id FOR UPDATE;
  IF NOT FOUND OR v_p.cooperativa_id <> v_ctx.o_cooperativa_id THEN
    PERFORM public._fallar('EB_NO_ENCONTRADO', 'No encontramos este pago en tu cooperativa.');
  END IF;
  IF v_p.rechazado_at IS NOT NULL THEN RETURN jsonb_build_object('ok', true, 'ya_procesado', true); END IF;
  IF v_p.verificado THEN
    PERFORM public._fallar('EB_PAGO_YA_RESUELTO', 'Este pago ya fue aprobado; no se puede rechazar.');
  END IF;
  IF length(v_motivo) < 5 THEN
    PERFORM public._fallar('EB_MOTIVO_REQUERIDO', 'Escribe el motivo del rechazo (se le enviará al cliente).', '{"campo":"motivo"}');
  END IF;
  UPDATE public.pagos SET rechazado_at = now(), rechazado_por = v_ctx.o_uid, motivo_rechazo = v_motivo WHERE id = p_pago_id;

  IF v_p.encomienda_id IS NOT NULL THEN
    SELECT tracking_id INTO v_tracking FROM public.encomiendas WHERE id = v_p.encomienda_id;
    PERFORM public._notificar_usuario(v_p.pagador_id, 'PAGO_RECHAZADO', 'Revisa tu pago',
      format('La cooperativa no pudo confirmar el pago de tu envío %s (ref. %s): %s. Regístralo de nuevo o paga en la taquilla.',
             v_tracking, coalesce(v_p.numero_referencia, 's/n'), v_motivo), 'encomienda', v_p.encomienda_id);
  ELSE
    -- La reserva vuelve a "sin pagar" con 30 minutos nuevos (sin pasar de la salida).
    UPDATE public.boletos b
       SET reserva_expira_at = least(now() + interval '30 minutes', v.fecha_hora_salida)
      FROM public.viajes v
     WHERE v.id = b.viaje_id AND b.pago_id = p_pago_id AND b.estado = 'RESERVADO'
       AND v.estado = 'PROGRAMADO' AND v.fecha_hora_salida > now();   -- si el bus ya salió, el cron las libera
    GET DIAGNOSTICS v_n = ROW_COUNT;
    SELECT id INTO v_boleto FROM public.boletos WHERE pago_id = p_pago_id ORDER BY length(asiento), asiento LIMIT 1;
    PERFORM public._notificar_usuario(v_p.pagador_id, 'PAGO_RECHAZADO', 'Revisa tu pago',
      CASE WHEN v_n > 0 THEN
        format('La cooperativa no pudo confirmar tu pago (ref. %s): %s. Regístralo de nuevo en los próximos 30 minutos o se liberarán tus asientos.',
               coalesce(v_p.numero_referencia, 's/n'), v_motivo)
      ELSE   -- los asientos ya no estaban apartados: no hay nada que volver a pagar
        format('La cooperativa no pudo confirmar tu pago (ref. %s): %s. Tus asientos ya no están apartados; si te cobraron, contacta a la cooperativa para la devolución.',
               coalesce(v_p.numero_referencia, 's/n'), v_motivo)
      END, 'boleto', coalesce(v_boleto, v_p.boleto_id));
  END IF;
  RETURN jsonb_build_object('ok', true, 'boletos_afectados', v_n);
END $$;

-- 5. Bandeja "Pagos por verificar" (o el detalle de un pago con p_pago_id).
CREATE OR REPLACE FUNCTION public.fn_pagos_por_verificar(p_tipo text DEFAULT NULL, p_pago_id uuid DEFAULT NULL)
RETURNS TABLE (
  pago_id uuid, creado_at timestamptz, tipo_recurso text,
  compra_id uuid, boleto_ids uuid[], codigos_boletos text, asientos text,
  encomienda_id uuid, tracking_id text, encomienda_estado text, modalidad_pago text,
  viaje_salida timestamptz, ruta text, recurso_vencido boolean,
  cliente_nombre text, cliente_cedula text, cliente_telefono text, pagador_rol text,
  metodo_tipo text, cuenta_banco text, cuenta_titular text, cuenta_final text, cuenta_email_zelle text,
  banco_emisor text, numero_referencia text, fecha_transaccion date,
  moneda text, esperado numeric, declarado numeric, diferencia numeric,
  monto_usd numeric, monto_bs numeric, tasa_bcv numeric, tasa_bcv_fecha date,
  estado_verificacion text, motivo_rechazo text, referencia_repetida boolean
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
#variable_conflict use_column
DECLARE v_ctx record;
BEGIN
  SELECT * INTO v_ctx FROM public._contexto_staff();
  RETURN QUERY
  SELECT p.id, p.created_at,
         CASE WHEN p.encomienda_id IS NOT NULL THEN 'encomienda' ELSE 'boleto' END,
         bol.compra_id, bol.ids, bol.codigos, bol.asientos,
         p.encomienda_id, e.tracking_id, e.estado::text, e.modalidad_pago::text,
         bol.salida, coalesce(bol.ruta, e.ciudad_origen || ' → ' || e.ciudad_destino),
         coalesce(bol.vencidos, false) OR coalesce(e.estado IN ('CANCELADA', 'DEVUELTA'), false),
         coalesce(bol.pasajero, pr.nombre_completo), coalesce(bol.cedula, pr.cedula_rif), pr.telefono,
         CASE WHEN e.id IS NULL THEN 'PASAJERO'
              WHEN p.pagador_id = e.sender_id THEN 'REMITENTE'
              WHEN p.pagador_id = e.receiver_user_id THEN 'DESTINATARIO'
              ELSE 'OTRO' END,
         m.tipo::text, m.banco, m.titular,
         right(regexp_replace(coalesce(m.numero_cuenta, ''), '[^0-9]', '', 'g'), 4), m.email_zelle,
         p.banco_emisor, p.numero_referencia, p.fecha_transaccion,
         p.moneda,
         CASE WHEN p.moneda = 'USD' THEN p.monto::numeric ELSE p.monto_bs END,
         p.monto_declarado,
         p.monto_declarado - CASE WHEN p.moneda = 'USD' THEN p.monto::numeric ELSE p.monto_bs END,
         p.monto::numeric, p.monto_bs, p.tasa_bcv, p.tasa_bcv_fecha,
         p.estado_verificacion, p.motivo_rechazo,
         EXISTS (SELECT 1 FROM public.pagos o
                  WHERE o.id <> p.id AND o.cooperativa_id = p.cooperativa_id AND p.numero_referencia IS NOT NULL
                    AND o.numero_referencia = p.numero_referencia AND o.rechazado_at IS NULL)
    FROM public.pagos p
    LEFT JOIN public.profiles pr ON pr.id = p.pagador_id
    LEFT JOIN public.metodos_pago_cooperativa m ON m.id = p.metodo_pago_id
    LEFT JOIN public.encomiendas e ON e.id = p.encomienda_id
    LEFT JOIN LATERAL (
      SELECT (array_agg(b.compra_id))[1] AS compra_id,
             array_agg(b.id ORDER BY length(b.asiento), b.asiento) AS ids,
             string_agg(b.codigo_boleto, ', ' ORDER BY length(b.asiento), b.asiento) AS codigos,
             string_agg(b.asiento, ', ' ORDER BY length(b.asiento), b.asiento) AS asientos,
             min(v.fecha_hora_salida) AS salida,
             min(r.ciudad_origen || ' → ' || r.ciudad_destino) AS ruta,
             bool_and(b.estado IN ('EXPIRADO', 'CANCELADO')) AS vencidos,
             min(b.pasajero_nombre) AS pasajero, min(b.pasajero_cedula) AS cedula
        FROM public.boletos b
        JOIN public.viajes v ON v.id = b.viaje_id
        JOIN public.rutas r ON r.id = v.ruta_id
       WHERE b.pago_id = p.id OR (b.id = p.boleto_id AND b.pago_id IS NULL)
    ) bol ON p.encomienda_id IS NULL
   WHERE p.cooperativa_id = v_ctx.o_cooperativa_id
     AND ((p_pago_id IS NOT NULL AND p.id = p_pago_id)
       OR (p_pago_id IS NULL AND p.tipo_pago = 'DIGITAL' AND NOT p.verificado AND p.rechazado_at IS NULL))
     AND (p_tipo IS NULL OR (p_tipo = 'boleto' AND p.encomienda_id IS NULL)
                         OR (p_tipo = 'encomienda' AND p.encomienda_id IS NOT NULL))
   ORDER BY p.created_at;
END $$;

-- 6. Costo de encomienda en servidor (misma fórmula que calcular-costo-encomienda).
CREATE OR REPLACE FUNCTION public._costo_encomienda(p_encomienda_id uuid, p_peso_kg numeric,
                                                    OUT o_costo_usd numeric, OUT o_peso_max numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_e record; v_por_kg numeric; v_factor numeric; v_duracion integer;
BEGIN
  SELECT * INTO v_e FROM public.encomiendas WHERE id = p_encomienda_id;
  SELECT tarifa_por_kg, factor_distancia_por_min, peso_max_kg INTO v_por_kg, v_factor, o_peso_max
    FROM public.tarifas WHERE activa LIMIT 1;
  IF v_por_kg IS NULL THEN
    PERFORM public._fallar('EB_TARIFA_NO_DISPONIBLE', 'No hay una tarifa activa. Avísale al administrador de EnBus.');
  END IF;
  IF p_peso_kg IS NULL OR p_peso_kg <= 0 OR p_peso_kg > o_peso_max THEN
    PERFORM public._fallar('EB_PESO_INVALIDO', format('El peso debe ser mayor que 0 y de hasta %s kg.', o_peso_max),
      jsonb_build_object('peso_max_kg', o_peso_max, 'campo', 'peso'));
  END IF;
  SELECT r.duracion_estimada_min INTO v_duracion
    FROM public.rutas r
   WHERE r.cooperativa_id = v_e.cooperativa_id AND r.activa
     AND public.normalizar_localidad(r.estado_origen)  = public.normalizar_localidad(v_e.estado_origen)
     AND public.normalizar_localidad(r.ciudad_origen)  = public.normalizar_localidad(v_e.ciudad_origen)
     AND public.normalizar_localidad(r.estado_destino) = public.normalizar_localidad(v_e.estado_destino)
     AND public.normalizar_localidad(r.ciudad_destino) = public.normalizar_localidad(v_e.ciudad_destino)
   ORDER BY r.duracion_estimada_min LIMIT 1;
  IF v_duracion IS NULL THEN
    PERFORM public._fallar('EB_SIN_RUTA', 'Tu cooperativa no tiene una ruta activa a ese destino.');
  END IF;
  o_costo_usd := round(p_peso_kg * v_por_kg * (1 + v_factor * v_duracion), 2);
END $$;

CREATE OR REPLACE FUNCTION public.fn_cotizar_encomienda(p_encomienda_id uuid, p_peso_kg numeric)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_ctx record; v_coop uuid; v_costo numeric; v_max numeric; v_tasa numeric; v_fecha date;
BEGIN
  SELECT * INTO v_ctx FROM public._contexto_staff();
  SELECT cooperativa_id INTO v_coop FROM public.encomiendas WHERE id = p_encomienda_id;
  IF v_coop IS DISTINCT FROM v_ctx.o_cooperativa_id THEN
    PERFORM public._fallar('EB_NO_ENCONTRADO', 'No encontramos esta encomienda en tu cooperativa.');
  END IF;
  SELECT o_costo_usd, o_peso_max INTO v_costo, v_max FROM public._costo_encomienda(p_encomienda_id, p_peso_kg);
  SELECT t.tasa, t.fecha INTO v_tasa, v_fecha FROM public.fn_tasa_bcv_vigente() t;
  RETURN jsonb_build_object('costo_usd', v_costo, 'peso_max_kg', v_max, 'tasa_bcv', v_tasa, 'tasa_bcv_fecha', v_fecha,
    'costo_bs', CASE WHEN v_tasa IS NOT NULL THEN round(v_costo * v_tasa, 2) END);
END $$;

CREATE OR REPLACE FUNCTION public._sucursal_destino_unica(p_cooperativa_id uuid, p_ciudad text)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT CASE WHEN count(*) = 1 THEN (array_agg(s.id))[1] END
    FROM public.sucursales s
   WHERE s.cooperativa_id = p_cooperativa_id AND s.activa
     AND public.normalizar_localidad(s.ciudad) = public.normalizar_localidad(p_ciudad);
$$;

-- Rellena sucursal_destino_id al crear la encomienda (solo si hay UNA sucursal activa en la ciudad).
CREATE OR REPLACE FUNCTION public.asignar_sucursal_destino_fn()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.sucursal_destino_id IS NULL AND NEW.cooperativa_id IS NOT NULL THEN
    NEW.sucursal_destino_id := public._sucursal_destino_unica(NEW.cooperativa_id, NEW.ciudad_destino);
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS asignar_sucursal_destino ON public.encomiendas;
CREATE TRIGGER asignar_sucursal_destino
  BEFORE INSERT OR UPDATE OF cooperativa_id, ciudad_destino ON public.encomiendas
  FOR EACH ROW EXECUTE FUNCTION public.asignar_sucursal_destino_fn();

UPDATE public.encomiendas e
   SET sucursal_destino_id = public._sucursal_destino_unica(e.cooperativa_id, e.ciudad_destino)
 WHERE e.sucursal_destino_id IS NULL AND e.cooperativa_id IS NOT NULL
   AND public._sucursal_destino_unica(e.cooperativa_id, e.ciudad_destino) IS NOT NULL;

-- 7. Taquilla origen: recibir y pesar (el costo lo calcula el servidor).
CREATE OR REPLACE FUNCTION public.fn_confirmar_recepcion_origen(p_encomienda_id uuid, p_peso_kg numeric)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_ctx record; v_e record; v_costo numeric; v_max numeric; v_tasa numeric; v_fecha date;
BEGIN
  SELECT * INTO v_ctx FROM public._contexto_staff();
  SELECT * INTO v_e FROM public.encomiendas WHERE id = p_encomienda_id FOR UPDATE;
  IF NOT FOUND OR v_e.cooperativa_id IS DISTINCT FROM v_ctx.o_cooperativa_id THEN
    PERFORM public._fallar('EB_NO_ENCONTRADO', 'No encontramos esta encomienda en tu cooperativa.');
  END IF;
  IF v_e.estado = 'POR_PAGAR' AND v_e.peso_kg = p_peso_kg THEN   -- reintento idempotente
    SELECT t.tasa, t.fecha INTO v_tasa, v_fecha FROM public.fn_tasa_bcv_vigente() t;
    RETURN jsonb_build_object('estado', 'POR_PAGAR', 'costo_usd', v_e.costo_calculado,
      'costo_bs', CASE WHEN v_tasa IS NOT NULL THEN round(v_e.costo_calculado * v_tasa, 2) END,
      'tasa_bcv', v_tasa, 'tasa_bcv_fecha', v_fecha, 'modalidad_pago', v_e.modalidad_pago, 'repetido', true);
  END IF;
  IF v_e.estado NOT IN ('PENDIENTE_DE_ESCANEO', 'EN_RECEPCION') THEN
    PERFORM public._fallar('EB_ESTADO_CAMBIO', 'Esta encomienda ya fue recibida. Actualiza la lista para ver su estado actual.');
  END IF;
  SELECT o_costo_usd, o_peso_max INTO v_costo, v_max FROM public._costo_encomienda(p_encomienda_id, p_peso_kg);
  IF v_e.estado = 'PENDIENTE_DE_ESCANEO' THEN      -- dispara generar_pin_retiro
    UPDATE public.encomiendas SET estado = 'EN_RECEPCION' WHERE id = p_encomienda_id;
  END IF;
  UPDATE public.encomiendas
     SET estado = 'POR_PAGAR', peso_kg = p_peso_kg, costo_calculado = v_costo,
         sucursal_origen_id = coalesce(sucursal_origen_id, v_ctx.o_sucursal_id),
         sucursal_destino_id = coalesce(sucursal_destino_id,
                                        public._sucursal_destino_unica(cooperativa_id, ciudad_destino))
   WHERE id = p_encomienda_id;
  SELECT t.tasa, t.fecha INTO v_tasa, v_fecha FROM public.fn_tasa_bcv_vigente() t;
  RETURN jsonb_build_object('estado', 'POR_PAGAR', 'costo_usd', v_costo,
    'costo_bs', CASE WHEN v_tasa IS NOT NULL THEN round(v_costo * v_tasa, 2) END,
    'tasa_bcv', v_tasa, 'tasa_bcv_fecha', v_fecha, 'modalidad_pago', v_e.modalidad_pago);
END $$;

-- 8. Despacho (compara solo ciudades normalizadas).
CREATE OR REPLACE FUNCTION public._resultado_despacho(p_encomienda_id uuid, p_viaje_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE e record; r record;
BEGIN
  SELECT * INTO e FROM public.encomiendas WHERE id = p_encomienda_id;
  IF NOT FOUND THEN RETURN 'NO_ENCONTRADA'; END IF;
  SELECT ru.ciudad_origen, ru.ciudad_destino, v.cooperativa_id INTO r
    FROM public.viajes v JOIN public.rutas ru ON ru.id = v.ruta_id WHERE v.id = p_viaje_id;
  IF NOT FOUND THEN RETURN 'VIAJE_NO_ENCONTRADO'; END IF;
  IF e.cooperativa_id IS DISTINCT FROM r.cooperativa_id THEN RETURN 'OTRA_COOPERATIVA'; END IF;
  IF e.estado IN ('EN_TRANSITO', 'EN_OFICINA_DESTINO', 'ENTREGADA') THEN RETURN 'YA_DESPACHADA'; END IF;
  IF e.estado IN ('CANCELADA', 'DEVUELTA') THEN RETURN 'CERRADA'; END IF;
  IF e.estado IN ('PENDIENTE_DE_ESCANEO', 'EN_RECEPCION') THEN RETURN 'SIN_RECIBIR'; END IF;
  IF e.estado = 'POR_PAGAR' AND e.modalidad_pago = 'ORIGEN' THEN RETURN 'POR_PAGAR'; END IF;
  IF public.normalizar_localidad(e.ciudad_destino) IS DISTINCT FROM public.normalizar_localidad(r.ciudad_destino) THEN
    RETURN 'OTRO_DESTINO';
  END IF;
  IF public.normalizar_localidad(e.ciudad_origen) IS DISTINCT FROM public.normalizar_localidad(r.ciudad_origen) THEN
    RETURN 'OTRO_ORIGEN';
  END IF;
  RETURN 'OK';
END $$;

CREATE OR REPLACE FUNCTION public.fn_validar_encomienda_despacho(p_codigo text, p_viaje_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_ctx record; v_code text := btrim(coalesce(p_codigo, '')); e record; r record;
BEGIN
  SELECT * INTO v_ctx FROM public._contexto_staff();
  SELECT ru.ciudad_origen, ru.ciudad_destino, v.fecha_hora_salida, v.numero_unidad, v.estado INTO r
    FROM public.viajes v JOIN public.rutas ru ON ru.id = v.ruta_id
   WHERE v.id = p_viaje_id AND v.cooperativa_id = v_ctx.o_cooperativa_id;
  IF NOT FOUND THEN
    PERFORM public._fallar('EB_VIAJE_REQUERIDO', 'Primero elige el viaje en el que vas a cargar las encomiendas.');
  END IF;
  SELECT * INTO e FROM public.encomiendas
   WHERE cooperativa_id = v_ctx.o_cooperativa_id
     AND (upper(tracking_id) = upper(v_code) OR qr_data = v_code OR id::text = lower(v_code))
   ORDER BY (upper(tracking_id) = upper(v_code)) DESC, (id::text = lower(v_code)) DESC
   LIMIT 1;
  IF NOT FOUND THEN RETURN jsonb_build_object('resultado', 'NO_ENCONTRADA', 'codigo', v_code); END IF;
  RETURN jsonb_build_object(
    'resultado', public._resultado_despacho(e.id, p_viaje_id),
    'encomienda', jsonb_build_object('id', e.id, 'tracking_id', e.tracking_id, 'estado', e.estado,
      'modalidad_pago', e.modalidad_pago, 'ciudad_origen', e.ciudad_origen, 'ciudad_destino', e.ciudad_destino,
      'receiver_nombre', e.receiver_nombre, 'peso_kg', e.peso_kg, 'costo_usd', e.costo_calculado,
      'cobro_en_destino', e.modalidad_pago = 'DESTINO'
        AND NOT EXISTS (SELECT 1 FROM public.pagos p WHERE p.encomienda_id = e.id AND p.verificado)),
    'viaje', jsonb_build_object('origen', r.ciudad_origen, 'destino', r.ciudad_destino,
      'salida', r.fecha_hora_salida, 'unidad', r.numero_unidad, 'estado', r.estado));
END $$;

CREATE OR REPLACE FUNCTION public.fn_despachar_encomiendas(p_viaje_id uuid, p_encomienda_ids uuid[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_ctx record; v_viaje record; v_ids uuid[]; v_malas jsonb; v_n integer; v_destino integer;
BEGIN
  SELECT * INTO v_ctx FROM public._contexto_staff();
  SELECT id, cooperativa_id, estado INTO v_viaje FROM public.viajes WHERE id = p_viaje_id FOR UPDATE;
  IF NOT FOUND OR v_viaje.cooperativa_id <> v_ctx.o_cooperativa_id THEN
    PERFORM public._fallar('EB_NO_ENCONTRADO', 'No encontramos ese viaje en tu cooperativa.');
  END IF;
  IF v_viaje.estado <> 'PROGRAMADO' THEN
    PERFORM public._fallar('EB_VIAJE_NO_DISPONIBLE',
      CASE WHEN v_viaje.estado = 'CANCELADO' THEN 'Este viaje fue cancelado. Elige otro.'
           ELSE 'Este bus ya salió. Elige otro viaje programado.' END);
  END IF;
  SELECT array_agg(DISTINCT x) INTO v_ids FROM unnest(p_encomienda_ids) x WHERE x IS NOT NULL;
  IF v_ids IS NULL THEN
    PERFORM public._fallar('EB_DATOS_INVALIDOS', 'Escanea al menos una encomienda antes de confirmar el despacho.');
  END IF;
  PERFORM 1 FROM public.encomiendas WHERE id = ANY (v_ids) ORDER BY id FOR UPDATE;
  SELECT jsonb_agg(jsonb_build_object('id', x.id, 'resultado', x.res, 'tracking_id', e.tracking_id,
                                      'ciudad_destino', e.ciudad_destino))
    INTO v_malas
    FROM (SELECT i AS id, public._resultado_despacho(i, p_viaje_id) AS res FROM unnest(v_ids) i) x
    LEFT JOIN public.encomiendas e ON e.id = x.id
   WHERE x.res <> 'OK';
  IF v_malas IS NOT NULL THEN
    PERFORM public._fallar('EB_DESPACHO_INVALIDO',
      'Algunas encomiendas no pueden ir en este viaje. Quítalas de la lista e intenta de nuevo.',
      jsonb_build_object('rechazadas', v_malas));
  END IF;
  SELECT count(*) INTO v_destino FROM public.encomiendas
   WHERE id = ANY (v_ids) AND estado = 'POR_PAGAR' AND modalidad_pago = 'DESTINO';
  UPDATE public.encomiendas SET viaje_id = p_viaje_id, estado = 'EN_TRANSITO' WHERE id = ANY (v_ids);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN jsonb_build_object('despachadas', v_n, 'cobro_en_destino', v_destino);   -- el viaje NO cambia de estado
END $$;

-- Salida del bus (separada del despacho). Cierra la venta y libera reservas sin pagar.
CREATE OR REPLACE FUNCTION public.fn_marcar_salida_viaje(p_viaje_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_ctx record; v_viaje record; v_liberadas integer; v_en_verificacion integer;
BEGIN
  SELECT * INTO v_ctx FROM public._contexto_staff();
  SELECT id, cooperativa_id, estado INTO v_viaje FROM public.viajes WHERE id = p_viaje_id FOR UPDATE;
  IF NOT FOUND OR v_viaje.cooperativa_id <> v_ctx.o_cooperativa_id THEN
    PERFORM public._fallar('EB_NO_ENCONTRADO', 'No encontramos ese viaje en tu cooperativa.');
  END IF;
  IF v_viaje.estado = 'EN_CURSO' THEN RETURN jsonb_build_object('estado', 'EN_CURSO', 'ya_procesado', true); END IF;
  IF v_viaje.estado <> 'PROGRAMADO' THEN
    PERFORM public._fallar('EB_ESTADO_CAMBIO', 'Este viaje no está programado.');
  END IF;
  UPDATE public.viajes SET estado = 'EN_CURSO' WHERE id = p_viaje_id;
  UPDATE public.boletos b SET estado = 'EXPIRADO'
   WHERE b.viaje_id = p_viaje_id AND b.estado = 'RESERVADO'
     AND NOT EXISTS (SELECT 1 FROM public.pagos p WHERE p.id = b.pago_id AND p.estado_verificacion = 'PENDIENTE');
  GET DIAGNOSTICS v_liberadas = ROW_COUNT;
  SELECT count(*) INTO v_en_verificacion
    FROM public.boletos b JOIN public.pagos p ON p.id = b.pago_id
   WHERE b.viaje_id = p_viaje_id AND b.estado = 'RESERVADO' AND p.estado_verificacion = 'PENDIENTE';
  RETURN jsonb_build_object('estado', 'EN_CURSO', 'reservas_liberadas', v_liberadas,
                            'pagos_en_verificacion', v_en_verificacion);
END $$;

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
              'fn_registrar_pago_encomienda', 'fn_cobrar_encomienda_taquilla', 'fn_aprobar_pago', 'fn_rechazar_pago',
              'fn_pagos_por_verificar', 'fn_cotizar_encomienda', 'fn_confirmar_recepcion_origen',
              'fn_validar_encomienda_despacho', 'fn_despachar_encomiendas', 'fn_marcar_salida_viaje') LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', f.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', f.sig);
  END LOOP;
END $$;

COMMIT;
