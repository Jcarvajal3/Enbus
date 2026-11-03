-- Reserva, checkout, cancelación, venta y cobro en taquilla, embarque y expiración.
BEGIN;

CREATE OR REPLACE FUNCTION public.estado_ui_boleto(p_estado public.estado_boleto, p_pago_estado text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN p_estado <> 'RESERVADO'     THEN p_estado::text
    WHEN p_pago_estado = 'PENDIENTE' THEN 'PAGO_EN_VERIFICACION'
    WHEN p_pago_estado = 'RECHAZADO' THEN 'PAGO_RECHAZADO'
    ELSE 'RESERVA_SIN_PAGAR'
  END;
$$;

CREATE OR REPLACE FUNCTION public._codigo_boleto_nuevo()
RETURNS text LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE v text;
BEGIN
  LOOP
    v := 'BOL-' || upper(substr(md5(gen_random_uuid()::text), 1, 8));
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.boletos WHERE codigo_boleto = v);
  END LOOP;
  RETURN v;
END $$;

-- Valida el comprobante según el tipo de método. Devuelve la referencia normalizada (NULL en efectivo).
CREATE OR REPLACE FUNCTION public._validar_comprobante(p_tipo public.tipo_metodo_pago, p_referencia text,
                                                       p_banco text, p_fecha date)
RETURNS text LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE
  v_ref text := upper(regexp_replace(coalesce(p_referencia, ''), '[[:space:]._/-]', '', 'g'));
  v_hoy date := (now() AT TIME ZONE 'America/Caracas')::date;
BEGIN
  IF p_tipo = 'EFECTIVO' THEN RETURN NULL; END IF;
  IF p_tipo = 'ZELLE' THEN
    IF v_ref !~ '^[A-Z0-9]{4,40}$' THEN
      PERFORM public._fallar('EB_DATOS_PAGO_INVALIDOS',
        'Escribe el código de confirmación de Zelle completo (mínimo 4 caracteres).', '{"campo":"referencia"}');
    END IF;
  ELSE
    IF v_ref !~ '^[0-9]{4,30}$' THEN
      PERFORM public._fallar('EB_DATOS_PAGO_INVALIDOS',
        'Escribe el número de referencia completo: solo números, mínimo 4.', '{"campo":"referencia"}');
    END IF;
    IF coalesce(btrim(p_banco), '') = '' THEN
      PERFORM public._fallar('EB_DATOS_PAGO_INVALIDOS', 'Elige el banco desde el que pagaste.', '{"campo":"banco"}');
    END IF;
  END IF;
  IF p_fecha IS NULL OR p_fecha > v_hoy OR p_fecha < v_hoy - 30 THEN
    PERFORM public._fallar('EB_DATOS_PAGO_INVALIDOS',
      'La fecha del pago debe estar entre hoy y los últimos 30 días.', '{"campo":"fecha"}');
  END IF;
  RETURN v_ref;
END $$;

CREATE OR REPLACE FUNCTION public._resumen_compra(p_compra_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  WITH vivos AS (
    SELECT b.*, p.estado_verificacion AS pago_estado
      FROM public.boletos b LEFT JOIN public.pagos p ON p.id = b.pago_id
     WHERE b.compra_id = p_compra_id AND b.estado IN ('RESERVADO', 'PAGADO', 'USADO')
  ), ult AS (
    SELECT p.* FROM public.pagos p
     WHERE p.id = (SELECT b2.pago_id FROM public.boletos b2
                    WHERE b2.compra_id = p_compra_id AND b2.pago_id IS NOT NULL
                    ORDER BY b2.updated_at DESC LIMIT 1)
  )
  SELECT jsonb_build_object(
    'compra_id', p_compra_id,
    'server_now', now(),
    'viaje_id', (SELECT viaje_id FROM vivos LIMIT 1),
    'cooperativa_id', (SELECT cooperativa_id FROM vivos LIMIT 1),
    'boletos', coalesce((SELECT jsonb_agg(jsonb_build_object(
                 'id', v.id, 'codigo_boleto', v.codigo_boleto, 'asiento', v.asiento, 'estado', v.estado,
                 'estado_ui', public.estado_ui_boleto(v.estado, v.pago_estado),
                 'precio_usd', v.precio, 'reserva_expira_at', v.reserva_expira_at,
                 'qr_embarque_data', v.qr_embarque_data)
               ORDER BY length(v.asiento), v.asiento) FROM vivos v), '[]'::jsonb),
    'total_usd', (SELECT sum(precio) FROM vivos),
    'reserva_expira_at', (SELECT min(reserva_expira_at) FROM vivos WHERE estado = 'RESERVADO'),
    'pago', (SELECT jsonb_build_object('id', u.id, 'estado', u.estado_verificacion, 'monto_usd', u.monto,
                    'monto_bs', u.monto_bs, 'tasa_bcv', u.tasa_bcv, 'tasa_bcv_fecha', u.tasa_bcv_fecha,
                    'moneda', u.moneda, 'monto_declarado', u.monto_declarado,
                    'motivo_rechazo', u.motivo_rechazo) FROM ult u)
  );
$$;

-- Aparta (o re-aparta) los asientos de una compra del usuario. Bloquea el viaje.
CREATE OR REPLACE FUNCTION public._asegurar_asientos(p_uid uuid, p_compra_id uuid, p_viaje_id uuid, p_asientos text[])
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_viaje record; v_asientos text[]; v_faltan text[]; v_ocupados text[]; v_expira timestamptz;
  v_nombre text; v_cedula text; v_tel text;
BEGIN
  IF p_compra_id IS NULL THEN
    PERFORM public._fallar('EB_DATOS_INVALIDOS', 'Falta el identificador de la compra. Actualiza la app.');
  END IF;
  SELECT array_agg(DISTINCT btrim(a)) INTO v_asientos
    FROM unnest(p_asientos) a WHERE coalesce(btrim(a), '') <> '';
  IF v_asientos IS NULL THEN
    PERFORM public._fallar('EB_ASIENTO_INVALIDO', 'Elige al menos un asiento.');
  END IF;
  IF cardinality(v_asientos) > 10 THEN
    PERFORM public._fallar('EB_ASIENTO_INVALIDO', 'Puedes apartar hasta 10 asientos por compra.');
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(v_asientos) a WHERE a !~ '^[1-9][0-9]{0,2}$') THEN
    PERFORM public._fallar('EB_ASIENTO_INVALIDO', 'Uno de los asientos no existe en este bus. Vuelve a elegirlos.');
  END IF;

  SELECT v.id, v.estado, v.fecha_hora_salida, v.asientos_totales, v.cooperativa_id,
         r.precio_pasaje, r.activa AS ruta_activa, c.estado AS coop_estado
    INTO v_viaje
    FROM public.viajes v
    JOIN public.rutas r ON r.id = v.ruta_id
    JOIN public.cooperativas c ON c.id = v.cooperativa_id
   WHERE v.id = p_viaje_id
     FOR UPDATE OF v;
  IF NOT FOUND OR v_viaje.estado <> 'PROGRAMADO' OR v_viaje.fecha_hora_salida <= now()
     OR NOT v_viaje.ruta_activa OR v_viaje.coop_estado <> 'ACTIVA' OR coalesce(v_viaje.precio_pasaje, 0) <= 0 THEN
    PERFORM public._fallar('EB_VIAJE_NO_DISPONIBLE', 'Esta salida ya no está disponible para la venta. Elige otra.');
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(v_asientos) a WHERE a::int > v_viaje.asientos_totales) THEN
    PERFORM public._fallar('EB_ASIENTO_INVALIDO', 'Uno de los asientos no existe en este bus. Vuelve a elegirlos.');
  END IF;
  IF EXISTS (SELECT 1 FROM public.boletos WHERE compra_id = p_compra_id
              AND (comprador_id IS DISTINCT FROM p_uid OR viaje_id <> p_viaje_id)) THEN
    PERFORM public._fallar('EB_SIN_PERMISO', 'Esta compra no te pertenece.');
  END IF;

  PERFORM 1 FROM public.boletos WHERE compra_id = p_compra_id AND estado = 'RESERVADO' FOR UPDATE;
  IF EXISTS (SELECT 1 FROM public.boletos b JOIN public.pagos p ON p.id = b.pago_id
              WHERE b.compra_id = p_compra_id AND b.estado IN ('RESERVADO', 'PAGADO')
                AND p.estado_verificacion IN ('PENDIENTE', 'APROBADO')) THEN
    PERFORM public._fallar('EB_PAGO_YA_REGISTRADO',
      'Ya registraste un pago para esta compra. Revisa tus boletos en Mis viajes.');
  END IF;

  -- Asientos de la compra que el usuario ya no quiere.
  UPDATE public.boletos
     SET estado = 'CANCELADO', motivo_cancelacion = 'Asiento cambiado por el pasajero antes de pagar'
   WHERE compra_id = p_compra_id AND estado = 'RESERVADO' AND NOT (asiento = ANY (v_asientos));

  v_expira := least(now() + interval '30 minutes', v_viaje.fecha_hora_salida);
  -- Reservas vencidas que el cron todavía no liberó.
  UPDATE public.boletos SET reserva_expira_at = v_expira
   WHERE compra_id = p_compra_id AND estado = 'RESERVADO'
     AND (reserva_expira_at IS NULL OR reserva_expira_at <= now());

  SELECT array_agg(a) INTO v_faltan FROM unnest(v_asientos) a
   WHERE NOT EXISTS (SELECT 1 FROM public.boletos b
                      WHERE b.compra_id = p_compra_id AND b.estado = 'RESERVADO' AND b.asiento = a);
  IF v_faltan IS NULL THEN RETURN; END IF;

  SELECT array_agg(b.asiento ORDER BY length(b.asiento), b.asiento) INTO v_ocupados
    FROM public.boletos b
   WHERE b.viaje_id = p_viaje_id AND b.asiento = ANY (v_faltan) AND b.estado IN ('RESERVADO', 'PAGADO', 'USADO');
  IF v_ocupados IS NOT NULL THEN
    PERFORM public._fallar('EB_ASIENTO_OCUPADO',
      format('El asiento %s ya no está disponible. Elige otro.', array_to_string(v_ocupados, ', ')),
      jsonb_build_object('asientos', v_ocupados));
  END IF;

  -- El personal no puede leer perfiles de clientes (RLS): se copian al boleto.
  SELECT nombre_completo, cedula_rif, telefono INTO v_nombre, v_cedula, v_tel
    FROM public.profiles WHERE id = p_uid;
  BEGIN
    INSERT INTO public.boletos (codigo_boleto, comprador_id, viaje_id, cooperativa_id, asiento, precio, estado,
                                reserva_expira_at, compra_id, pasajero_nombre, pasajero_cedula, pasajero_telefono)
    SELECT public._codigo_boleto_nuevo(), p_uid, p_viaje_id, v_viaje.cooperativa_id, a, v_viaje.precio_pasaje,
           'RESERVADO', v_expira, p_compra_id, v_nombre, v_cedula, v_tel
      FROM unnest(v_faltan) a;
  EXCEPTION WHEN unique_violation THEN
    PERFORM public._fallar('EB_ASIENTO_OCUPADO', 'Uno de los asientos acaba de ser tomado. Elige otro.',
                           jsonb_build_object('asientos', v_faltan));
  END;
END $$;

-- App: apartar asientos (30 min, sin pago). También es "Apartar y pagar en taquilla".
CREATE OR REPLACE FUNCTION public.fn_reservar_asientos(p_compra_id uuid, p_viaje_id uuid, p_asientos text[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_uid uuid := public._uid_usuario(); v_res jsonb; v_tasa numeric; v_fecha date;
BEGIN
  PERFORM public._asegurar_asientos(v_uid, p_compra_id, p_viaje_id, p_asientos);
  v_res := public._resumen_compra(p_compra_id);
  SELECT t.tasa, t.fecha INTO v_tasa, v_fecha FROM public.fn_tasa_bcv_vigente() t;
  RETURN v_res || jsonb_build_object('tasa_bcv', v_tasa, 'tasa_bcv_fecha', v_fecha,
    'total_bs', CASE WHEN v_tasa IS NOT NULL THEN round((v_res->>'total_usd')::numeric * v_tasa, 2) END);
END $$;

-- App: soltar los asientos al salir del asistente sin pagar (mejor esfuerzo).
CREATE OR REPLACE FUNCTION public.fn_liberar_reserva(p_compra_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_uid uuid := public._uid_usuario(); v_n integer;
BEGIN
  UPDATE public.boletos b
     SET estado = 'CANCELADO', motivo_cancelacion = 'Reserva liberada por el pasajero'
   WHERE b.compra_id = p_compra_id AND b.comprador_id = v_uid AND b.estado = 'RESERVADO'
     AND NOT EXISTS (SELECT 1 FROM public.pagos p WHERE p.id = b.pago_id
                      AND p.estado_verificacion IN ('PENDIENTE', 'APROBADO'));
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN jsonb_build_object('liberados', v_n);
END $$;

-- App: registrar el pago de una compra (checkout atómico e idempotente).
CREATE OR REPLACE FUNCTION public.fn_checkout_boletos(
  p_compra_id uuid, p_viaje_id uuid, p_asientos text[],
  p_metodo_pago_id uuid, p_numero_referencia text, p_fecha_transaccion date, p_banco_emisor text,
  p_monto_declarado numeric, p_tasa_esperada numeric, p_idempotency_key text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_uid uuid := public._uid_usuario();
  v_metodo_tipo public.tipo_metodo_pago;
  v_ref text; v_tasa numeric; v_tasa_fecha date;
  v_total_usd numeric; v_total_bs numeric; v_moneda text; v_esperado numeric;
  v_coop uuid; v_primer uuid; v_pago_id uuid;
BEGIN
  IF coalesce(length(p_idempotency_key), 0) < 8 THEN
    PERFORM public._fallar('EB_DATOS_INVALIDOS', 'Falta la clave de la operación. Actualiza la app e intenta de nuevo.');
  END IF;
  PERFORM 1 FROM public.viajes WHERE id = p_viaje_id FOR UPDATE;   -- serializa doble toque y compras simultáneas
  IF EXISTS (SELECT 1 FROM public.pagos WHERE pagador_id = v_uid AND idempotency_key = p_idempotency_key) THEN
    RETURN public._resumen_compra(p_compra_id) || jsonb_build_object('repetido', true);
  END IF;

  SELECT m.tipo INTO v_metodo_tipo
    FROM public.metodos_pago_cooperativa m JOIN public.viajes v ON v.cooperativa_id = m.cooperativa_id
   WHERE m.id = p_metodo_pago_id AND v.id = p_viaje_id AND m.activo;
  IF v_metodo_tipo IS NULL OR v_metodo_tipo = 'EFECTIVO' THEN
    PERFORM public._fallar('EB_METODO_INVALIDO',
      'Elige una forma de pago de la cooperativa. Para pagar en efectivo, aparta tu asiento y paga en taquilla.');
  END IF;
  v_ref := public._validar_comprobante(v_metodo_tipo, p_numero_referencia, p_banco_emisor, p_fecha_transaccion);

  PERFORM public._asegurar_asientos(v_uid, p_compra_id, p_viaje_id, p_asientos);

  SELECT sum(precio), (array_agg(cooperativa_id))[1] INTO v_total_usd, v_coop
    FROM public.boletos WHERE compra_id = p_compra_id AND estado = 'RESERVADO';
  SELECT o_tasa, o_fecha INTO v_tasa, v_tasa_fecha FROM public._tasa_para_cobro();
  v_total_bs := round(v_total_usd * v_tasa, 2);

  IF p_tasa_esperada IS NOT NULL AND abs(p_tasa_esperada - v_tasa) > 0.00005 THEN
    PERFORM public._fallar('EB_TASA_CAMBIO',
      'La tasa BCV se actualizó. Revisa el nuevo total antes de registrar el pago.',
      jsonb_build_object('tasa', v_tasa, 'tasa_fecha', v_tasa_fecha, 'total_usd', v_total_usd, 'total_bs', v_total_bs));
  END IF;

  v_moneda := CASE WHEN v_metodo_tipo = 'ZELLE' THEN 'USD' ELSE 'VES' END;
  v_esperado := CASE WHEN v_moneda = 'USD' THEN v_total_usd ELSE v_total_bs END;
  IF p_monto_declarado IS NOT NULL AND (p_monto_declarado <= 0 OR p_monto_declarado > v_esperado * 10) THEN
    PERFORM public._fallar('EB_DATOS_PAGO_INVALIDOS', 'Revisa el monto que pagaste.', '{"campo":"monto"}');
  END IF;
  IF EXISTS (SELECT 1 FROM public.pagos WHERE cooperativa_id = v_coop AND numero_referencia = v_ref
              AND tipo_pago = 'DIGITAL' AND rechazado_at IS NULL) THEN
    PERFORM public._fallar('EB_REFERENCIA_REPETIDA',
      'Esa referencia ya fue registrada en otro pago. Revisa el número de tu comprobante.', '{"campo":"referencia"}');
  END IF;

  SELECT id INTO v_primer FROM public.boletos
   WHERE compra_id = p_compra_id AND estado = 'RESERVADO' ORDER BY length(asiento), asiento LIMIT 1;

  INSERT INTO public.pagos (boleto_id, pagador_id, cooperativa_id, metodo_pago_id, monto, monto_bs, tasa_bcv,
                            tasa_bcv_fecha, moneda, monto_declarado, tipo_pago, numero_referencia,
                            fecha_transaccion, banco_emisor, verificado, idempotency_key)
  VALUES (v_primer, v_uid, v_coop, p_metodo_pago_id, v_total_usd, v_total_bs, v_tasa,
          v_tasa_fecha, v_moneda, coalesce(p_monto_declarado, v_esperado), 'DIGITAL', v_ref,
          p_fecha_transaccion, CASE WHEN v_metodo_tipo = 'ZELLE' THEN 'Zelle' ELSE btrim(p_banco_emisor) END,
          false, p_idempotency_key)
  RETURNING id INTO v_pago_id;

  UPDATE public.boletos SET pago_id = v_pago_id, reserva_expira_at = NULL
   WHERE compra_id = p_compra_id AND estado = 'RESERVADO';

  RETURN public._resumen_compra(p_compra_id);
END $$;

-- App: cancelar un boleto propio (reserva sin pago en verificación, o pagado antes de la salida).
CREATE OR REPLACE FUNCTION public.fn_cancelar_boleto(p_boleto_id uuid, p_motivo text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_uid uuid := public._uid_usuario(); v_b record; v_reembolso numeric; v_tasa numeric; v_fecha date;
BEGIN
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
    UPDATE public.boletos SET estado = 'CANCELADO', motivo_cancelacion = btrim(p_motivo), monto_reembolso = v_reembolso
     WHERE id = p_boleto_id;
  ELSE
    PERFORM public._fallar('EB_ESTADO_CAMBIO', 'Este boleto ya no se puede cancelar. Actualiza la pantalla.');
  END IF;
  SELECT t.tasa, t.fecha INTO v_tasa, v_fecha FROM public.fn_tasa_bcv_vigente() t;
  RETURN jsonb_build_object('estado', 'CANCELADO', 'reembolso_usd', v_reembolso,
    'reembolso_bs_estimado', CASE WHEN v_reembolso IS NOT NULL AND v_tasa IS NOT NULL THEN round(v_reembolso * v_tasa, 2) END,
    'tasa_bcv', v_tasa, 'tasa_bcv_fecha', v_fecha);
END $$;

-- Taquilla: vender 1..N asientos (pago APROBADO).
-- p_pasajeros: [{"asiento":"14","nombre":"Ana Pérez","cedula":"V-12345678","telefono":"0414..."}]
CREATE OR REPLACE FUNCTION public.fn_vender_boletos_taquilla(
  p_viaje_id uuid, p_pasajeros jsonb, p_metodo_tipo public.tipo_metodo_pago, p_metodo_pago_id uuid,
  p_moneda text, p_monto_recibido numeric, p_numero_referencia text, p_fecha_transaccion date,
  p_banco_emisor text, p_idempotency_key text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_ctx record; v_viaje record; v_compra uuid := gen_random_uuid();
  v_asientos text[]; v_n integer; v_ocupados text[]; v_previo uuid;
  v_tasa numeric; v_tasa_fecha date; v_ref text;
  v_total_usd numeric; v_total_bs numeric; v_moneda text; v_esperado numeric; v_pago_id uuid;
BEGIN
  SELECT * INTO v_ctx FROM public._contexto_staff();
  IF coalesce(length(p_idempotency_key), 0) < 8 THEN
    PERFORM public._fallar('EB_DATOS_INVALIDOS', 'Falta la clave de la operación. Recarga la página.');
  END IF;
  SELECT v.id, v.cooperativa_id, v.estado, v.fecha_hora_salida, v.asientos_totales, r.precio_pasaje
    INTO v_viaje
    FROM public.viajes v JOIN public.rutas r ON r.id = v.ruta_id
   WHERE v.id = p_viaje_id FOR UPDATE OF v;
  IF NOT FOUND OR v_viaje.cooperativa_id <> v_ctx.o_cooperativa_id THEN
    PERFORM public._fallar('EB_NO_ENCONTRADO', 'No encontramos ese viaje en tu cooperativa.');
  END IF;
  SELECT b.compra_id INTO v_previo
    FROM public.pagos p JOIN public.boletos b ON b.pago_id = p.id
   WHERE p.pagador_id = v_ctx.o_uid AND p.idempotency_key = p_idempotency_key LIMIT 1;
  IF v_previo IS NOT NULL THEN
    RETURN public._resumen_compra(v_previo) || jsonb_build_object('repetido', true);
  END IF;
  IF v_viaje.estado <> 'PROGRAMADO' OR v_viaje.fecha_hora_salida < now() - interval '30 minutes' THEN
    PERFORM public._fallar('EB_VIAJE_NO_DISPONIBLE', 'Este viaje ya salió o fue cancelado. Elige otro.');
  END IF;
  IF coalesce(v_viaje.precio_pasaje, 0) <= 0 THEN
    PERFORM public._fallar('EB_PRECIO_NO_DEFINIDO', 'La ruta de este viaje no tiene precio. Configúralo en Rutas.');
  END IF;
  IF jsonb_typeof(p_pasajeros) IS DISTINCT FROM 'array' THEN
    PERFORM public._fallar('EB_DATOS_INVALIDOS', 'Agrega entre 1 y 10 pasajeros.');
  END IF;
  IF jsonb_array_length(p_pasajeros) NOT BETWEEN 1 AND 10 THEN
    PERFORM public._fallar('EB_DATOS_INVALIDOS', 'Agrega entre 1 y 10 pasajeros.');
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_to_recordset(p_pasajeros) AS x(asiento text, nombre text, cedula text, telefono text)
              WHERE coalesce(btrim(x.nombre), '') = '' OR public.normalizar_cedula(x.cedula) IS NULL
                 OR coalesce(btrim(x.asiento), '') !~ '^[1-9][0-9]{0,2}$') THEN
    PERFORM public._fallar('EB_DATOS_INVALIDOS', 'Revisa nombre, cédula y asiento de cada pasajero.');
  END IF;
  SELECT array_agg(btrim(x.asiento)), count(DISTINCT btrim(x.asiento)) INTO v_asientos, v_n
    FROM jsonb_to_recordset(p_pasajeros) AS x(asiento text);
  IF v_n <> cardinality(v_asientos)
     OR EXISTS (SELECT 1 FROM unnest(v_asientos) a WHERE a::int > v_viaje.asientos_totales) THEN
    PERFORM public._fallar('EB_ASIENTO_INVALIDO', 'Hay asientos repetidos o que no existen en este bus.');
  END IF;
  SELECT array_agg(b.asiento) INTO v_ocupados FROM public.boletos b
   WHERE b.viaje_id = p_viaje_id AND b.asiento = ANY (v_asientos) AND b.estado IN ('RESERVADO', 'PAGADO', 'USADO');
  IF v_ocupados IS NOT NULL THEN
    PERFORM public._fallar('EB_ASIENTO_OCUPADO',
      format('El asiento %s ya está ocupado. Elige otro.', array_to_string(v_ocupados, ', ')),
      jsonb_build_object('asientos', v_ocupados));
  END IF;
  IF p_metodo_pago_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM public.metodos_pago_cooperativa
        WHERE id = p_metodo_pago_id AND cooperativa_id = v_ctx.o_cooperativa_id AND tipo = p_metodo_tipo) THEN
    PERFORM public._fallar('EB_METODO_INVALIDO', 'La cuenta elegida no corresponde a esa forma de pago.');
  END IF;
  v_ref := public._validar_comprobante(p_metodo_tipo, p_numero_referencia, p_banco_emisor, p_fecha_transaccion);
  v_moneda := CASE p_metodo_tipo WHEN 'ZELLE' THEN 'USD' WHEN 'EFECTIVO' THEN coalesce(p_moneda, 'VES') ELSE 'VES' END;
  IF v_moneda NOT IN ('VES', 'USD') THEN
    PERFORM public._fallar('EB_DATOS_INVALIDOS', 'Moneda no válida.');
  END IF;
  SELECT o_tasa, o_fecha INTO v_tasa, v_tasa_fecha FROM public._tasa_para_cobro();
  v_total_usd := v_viaje.precio_pasaje * cardinality(v_asientos);
  v_total_bs := round(v_total_usd * v_tasa, 2);
  v_esperado := CASE WHEN v_moneda = 'USD' THEN v_total_usd ELSE v_total_bs END;
  IF p_metodo_tipo = 'EFECTIVO' AND coalesce(p_monto_recibido, 0) < v_esperado THEN
    PERFORM public._fallar('EB_MONTO_INSUFICIENTE', 'El monto recibido es menor que el total a cobrar.',
      jsonb_build_object('esperado', v_esperado, 'moneda', v_moneda, 'campo', 'monto'));
  END IF;

  BEGIN
    INSERT INTO public.boletos (codigo_boleto, qr_embarque_data, comprador_id, viaje_id, cooperativa_id, asiento,
                                precio, estado, compra_id, pasajero_nombre, pasajero_cedula, pasajero_telefono)
    SELECT s.codigo, 'PASS-' || s.codigo, NULL, p_viaje_id, v_ctx.o_cooperativa_id, btrim(s.asiento),
           v_viaje.precio_pasaje, 'PAGADO', v_compra, btrim(s.nombre), btrim(s.cedula), nullif(btrim(s.telefono), '')
      FROM (SELECT public._codigo_boleto_nuevo() AS codigo, x.*
              FROM jsonb_to_recordset(p_pasajeros) AS x(asiento text, nombre text, cedula text, telefono text)) s;
  EXCEPTION WHEN unique_violation THEN
    PERFORM public._fallar('EB_ASIENTO_OCUPADO', 'Uno de los asientos acaba de ser vendido. Elige otro.');
  END;

  INSERT INTO public.pagos (boleto_id, pagador_id, cooperativa_id, metodo_pago_id, monto, monto_bs, tasa_bcv,
                            tasa_bcv_fecha, moneda, monto_declarado, tipo_pago, numero_referencia, fecha_transaccion,
                            banco_emisor, verificado, verificado_por, verificado_at, idempotency_key)
  VALUES ((SELECT id FROM public.boletos WHERE compra_id = v_compra ORDER BY length(asiento), asiento LIMIT 1),
          v_ctx.o_uid, v_ctx.o_cooperativa_id, p_metodo_pago_id, v_total_usd, v_total_bs, v_tasa,
          v_tasa_fecha, v_moneda, coalesce(p_monto_recibido, v_esperado),
          CASE WHEN p_metodo_tipo = 'EFECTIVO' THEN 'EFECTIVO'::public.tipo_pago ELSE 'DIGITAL'::public.tipo_pago END,
          v_ref, coalesce(p_fecha_transaccion, (now() AT TIME ZONE 'America/Caracas')::date),
          CASE WHEN p_metodo_tipo = 'ZELLE' THEN 'Zelle' ELSE nullif(btrim(p_banco_emisor), '') END,
          true, v_ctx.o_uid, now(), p_idempotency_key)
  RETURNING id INTO v_pago_id;
  UPDATE public.boletos SET pago_id = v_pago_id WHERE compra_id = v_compra;

  RETURN public._resumen_compra(v_compra) || jsonb_build_object(
    'impresion', (SELECT jsonb_agg(jsonb_build_object('codigo_boleto', b.codigo_boleto, 'qr', b.qr_embarque_data,
                    'asiento', b.asiento, 'pasajero', b.pasajero_nombre, 'cedula', b.pasajero_cedula)
                    ORDER BY length(b.asiento), b.asiento)
                  FROM public.boletos b WHERE b.compra_id = v_compra),
    'salida', v_viaje.fecha_hora_salida,
    'cobro', jsonb_build_object('moneda', v_moneda, 'esperado', v_esperado,
               'recibido', coalesce(p_monto_recibido, v_esperado),
               'vuelto', GREATEST(coalesce(p_monto_recibido, v_esperado) - v_esperado, 0),
               'total_usd', v_total_usd, 'total_bs', v_total_bs, 'tasa', v_tasa, 'tasa_fecha', v_tasa_fecha));
END $$;

-- Taquilla: cobrar una reserva sin pagar (o con pago rechazado) de la app.
CREATE OR REPLACE FUNCTION public.fn_cobrar_reserva_taquilla(
  p_boleto_id uuid, p_metodo_tipo public.tipo_metodo_pago, p_metodo_pago_id uuid, p_moneda text,
  p_monto_recibido numeric, p_numero_referencia text, p_fecha_transaccion date, p_banco_emisor text,
  p_idempotency_key text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_ctx record; v_compra uuid; v_coop uuid; v_comprador uuid;
  v_tasa numeric; v_tasa_fecha date; v_ref text;
  v_total_usd numeric; v_total_bs numeric; v_moneda text; v_esperado numeric; v_pago_id uuid; v_primer uuid;
BEGIN
  SELECT * INTO v_ctx FROM public._contexto_staff();
  IF coalesce(length(p_idempotency_key), 0) < 8 THEN
    PERFORM public._fallar('EB_DATOS_INVALIDOS', 'Falta la clave de la operación. Recarga la página.');
  END IF;
  SELECT compra_id, cooperativa_id, comprador_id INTO v_compra, v_coop, v_comprador
    FROM public.boletos WHERE id = p_boleto_id;
  IF v_compra IS NULL OR v_coop <> v_ctx.o_cooperativa_id THEN
    PERFORM public._fallar('EB_NO_ENCONTRADO', 'No encontramos ese boleto en tu cooperativa.');
  END IF;
  IF EXISTS (SELECT 1 FROM public.pagos WHERE pagador_id = v_ctx.o_uid AND idempotency_key = p_idempotency_key) THEN
    RETURN public._resumen_compra(v_compra) || jsonb_build_object('repetido', true);
  END IF;
  PERFORM 1 FROM public.boletos WHERE compra_id = v_compra FOR UPDATE;
  IF EXISTS (SELECT 1 FROM public.boletos b JOIN public.pagos p ON p.id = b.pago_id
              WHERE b.compra_id = v_compra AND b.estado = 'RESERVADO' AND p.estado_verificacion = 'PENDIENTE') THEN
    PERFORM public._fallar('EB_PAGO_PENDIENTE_EXISTE',
      'El pasajero ya reportó un pago. Verifícalo o recházalo antes de cobrar de nuevo.');
  END IF;
  SELECT sum(precio) INTO v_total_usd FROM public.boletos WHERE compra_id = v_compra AND estado = 'RESERVADO';
  IF v_total_usd IS NULL THEN
    PERFORM public._fallar('EB_ESTADO_CAMBIO', 'Esta reserva ya no está pendiente de pago.');
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
  v_total_bs := round(v_total_usd * v_tasa, 2);
  v_esperado := CASE WHEN v_moneda = 'USD' THEN v_total_usd ELSE v_total_bs END;
  IF p_metodo_tipo = 'EFECTIVO' AND coalesce(p_monto_recibido, 0) < v_esperado THEN
    PERFORM public._fallar('EB_MONTO_INSUFICIENTE', 'El monto recibido es menor que el total a cobrar.',
      jsonb_build_object('esperado', v_esperado, 'moneda', v_moneda, 'campo', 'monto'));
  END IF;
  SELECT id INTO v_primer FROM public.boletos
   WHERE compra_id = v_compra AND estado = 'RESERVADO' ORDER BY length(asiento), asiento LIMIT 1;

  INSERT INTO public.pagos (boleto_id, pagador_id, cooperativa_id, metodo_pago_id, monto, monto_bs, tasa_bcv,
                            tasa_bcv_fecha, moneda, monto_declarado, tipo_pago, numero_referencia, fecha_transaccion,
                            banco_emisor, verificado, verificado_por, verificado_at, idempotency_key)
  VALUES (v_primer, v_ctx.o_uid, v_coop, p_metodo_pago_id, v_total_usd, v_total_bs, v_tasa, v_tasa_fecha,
          v_moneda, coalesce(p_monto_recibido, v_esperado),
          CASE WHEN p_metodo_tipo = 'EFECTIVO' THEN 'EFECTIVO'::public.tipo_pago ELSE 'DIGITAL'::public.tipo_pago END,
          v_ref, coalesce(p_fecha_transaccion, (now() AT TIME ZONE 'America/Caracas')::date),
          CASE WHEN p_metodo_tipo = 'ZELLE' THEN 'Zelle' ELSE nullif(btrim(p_banco_emisor), '') END,
          true, v_ctx.o_uid, now(), p_idempotency_key)
  RETURNING id INTO v_pago_id;

  UPDATE public.boletos
     SET estado = 'PAGADO', pago_id = v_pago_id, reserva_expira_at = NULL,
         qr_embarque_data = coalesce(qr_embarque_data, 'PASS-' || codigo_boleto)
   WHERE compra_id = v_compra AND estado = 'RESERVADO';

  PERFORM public._notificar_usuario(v_comprador, 'BOLETO_CONFIRMADO', 'Boleto confirmado',
    'Registramos tu pago en taquilla. Tu pase de abordaje ya está disponible.', 'boleto', p_boleto_id);

  RETURN public._resumen_compra(v_compra) || jsonb_build_object('cobro', jsonb_build_object(
    'moneda', v_moneda, 'esperado', v_esperado, 'recibido', coalesce(p_monto_recibido, v_esperado),
    'vuelto', GREATEST(coalesce(p_monto_recibido, v_esperado) - v_esperado, 0)));
END $$;

-- Embarque: un resultado por causa.
CREATE OR REPLACE FUNCTION public._resultado_embarque(p_boleto_id uuid, p_viaje_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE r record; v_hoy date := (now() AT TIME ZONE 'America/Caracas')::date; v_dia date; v_res text;
BEGIN
  SELECT b.id, b.codigo_boleto, b.asiento, b.estado, b.viaje_id, b.compra_id, b.embarcado_at, b.updated_at,
         b.motivo_cancelacion, b.reserva_expira_at, b.precio,
         coalesce(b.pasajero_nombre, pr.nombre_completo) AS pasajero_nombre,
         coalesce(b.pasajero_cedula, pr.cedula_rif) AS pasajero_cedula,
         v.fecha_hora_salida, v.estado AS viaje_estado, v.numero_unidad, ru.ciudad_origen, ru.ciudad_destino,
         p.id AS pago_id, p.estado_verificacion AS pago_estado, p.tipo_pago, p.banco_emisor, p.numero_referencia,
         p.fecha_transaccion, p.monto, p.monto_bs, p.moneda, p.monto_declarado, p.tasa_bcv, p.tasa_bcv_fecha,
         p.motivo_rechazo, p.metodo_pago_id
    INTO r
    FROM public.boletos b
    JOIN public.viajes v ON v.id = b.viaje_id
    JOIN public.rutas ru ON ru.id = v.ruta_id
    LEFT JOIN public.profiles pr ON pr.id = b.comprador_id
    LEFT JOIN public.pagos p ON p.id = b.pago_id
   WHERE b.id = p_boleto_id;
  v_dia := (r.fecha_hora_salida AT TIME ZONE 'America/Caracas')::date;
  v_res := CASE
    WHEN r.estado = 'USADO'                                  THEN 'USADO'
    WHEN r.estado = 'CANCELADO'                              THEN 'CANCELADO'
    WHEN r.estado = 'EXPIRADO'                               THEN 'EXPIRADO'
    WHEN r.viaje_estado = 'CANCELADO'                        THEN 'VIAJE_CANCELADO'
    WHEN p_viaje_id IS NOT NULL AND r.viaje_id <> p_viaje_id THEN 'OTRO_VIAJE'
    WHEN v_dia <> v_hoy                                      THEN 'OTRO_DIA'
    WHEN r.estado = 'RESERVADO' AND r.pago_estado = 'PENDIENTE' THEN 'PAGO_EN_VERIFICACION'
    WHEN r.estado = 'RESERVADO' AND r.pago_estado = 'RECHAZADO' THEN 'PAGO_RECHAZADO'
    WHEN r.estado = 'RESERVADO'                              THEN 'RESERVA_SIN_PAGAR'
    ELSE 'VALIDO' END;
  RETURN jsonb_build_object(
    'resultado', v_res, 'dias_diferencia', v_dia - v_hoy,
    'boleto', jsonb_build_object('id', r.id, 'codigo_boleto', r.codigo_boleto, 'asiento', r.asiento,
      'estado', r.estado, 'compra_id', r.compra_id, 'pasajero_nombre', r.pasajero_nombre,
      'pasajero_cedula', r.pasajero_cedula, 'embarcado_at', r.embarcado_at, 'updated_at', r.updated_at,
      'motivo_cancelacion', r.motivo_cancelacion, 'reserva_expira_at', r.reserva_expira_at, 'precio_usd', r.precio),
    'viaje', jsonb_build_object('id', r.viaje_id, 'salida', r.fecha_hora_salida, 'estado', r.viaje_estado,
      'unidad', r.numero_unidad, 'origen', r.ciudad_origen, 'destino', r.ciudad_destino),
    'pago', CASE WHEN r.pago_id IS NULL THEN NULL ELSE jsonb_build_object(
      'id', r.pago_id, 'estado', r.pago_estado, 'tipo_pago', r.tipo_pago, 'banco_emisor', r.banco_emisor,
      'numero_referencia', r.numero_referencia, 'fecha_transaccion', r.fecha_transaccion,
      'monto_usd', r.monto, 'monto_bs', r.monto_bs, 'moneda', r.moneda, 'monto_declarado', r.monto_declarado,
      'tasa_bcv', r.tasa_bcv, 'tasa_bcv_fecha', r.tasa_bcv_fecha, 'motivo_rechazo', r.motivo_rechazo,
      'metodo_pago_id', r.metodo_pago_id) END);
END $$;

CREATE OR REPLACE FUNCTION public.fn_validar_embarque(p_codigo text, p_viaje_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_ctx record; v_code text := upper(btrim(coalesce(p_codigo, ''))); v_id uuid; v_coop uuid;
BEGIN
  SELECT * INTO v_ctx FROM public._contexto_staff();
  SELECT b.id, b.cooperativa_id INTO v_id, v_coop
    FROM public.boletos b
   WHERE b.codigo_boleto = v_code OR upper(b.qr_embarque_data) = v_code OR 'PASS-' || b.codigo_boleto = v_code
   ORDER BY (b.cooperativa_id = v_ctx.o_cooperativa_id) DESC, b.created_at DESC
   LIMIT 1;
  IF v_id IS NULL THEN RETURN jsonb_build_object('resultado', 'NO_ENCONTRADO', 'codigo', v_code); END IF;
  IF v_coop <> v_ctx.o_cooperativa_id THEN RETURN jsonb_build_object('resultado', 'OTRA_COOPERATIVA', 'codigo', v_code); END IF;
  RETURN public._resultado_embarque(v_id, p_viaje_id);
END $$;

CREATE OR REPLACE FUNCTION public.fn_confirmar_embarque(p_boleto_id uuid, p_viaje_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_ctx record; v_coop uuid; v_res jsonb;
BEGIN
  SELECT * INTO v_ctx FROM public._contexto_staff();
  SELECT cooperativa_id INTO v_coop FROM public.boletos WHERE id = p_boleto_id FOR UPDATE;
  IF v_coop IS NULL OR v_coop <> v_ctx.o_cooperativa_id THEN
    PERFORM public._fallar('EB_NO_ENCONTRADO', 'No encontramos ese boleto en tu cooperativa.');
  END IF;
  v_res := public._resultado_embarque(p_boleto_id, p_viaje_id);
  IF v_res->>'resultado' <> 'VALIDO' THEN
    PERFORM public._fallar('EB_EMBARQUE_NO_VALIDO', 'Este boleto no se puede embarcar ahora. Escanéalo de nuevo.', v_res);
  END IF;
  UPDATE public.boletos SET estado = 'USADO', embarcado_at = now(), embarcado_por = v_ctx.o_uid
   WHERE id = p_boleto_id AND estado = 'PAGADO';
  RETURN public._resultado_embarque(p_boleto_id, p_viaje_id);
END $$;

-- Expiración: solo el servidor; nunca con un pago en verificación.
CREATE OR REPLACE FUNCTION public.auto_expirar_reserva()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  UPDATE public.boletos b
     SET estado = 'EXPIRADO'
    FROM public.viajes v
   WHERE v.id = b.viaje_id
     AND b.estado = 'RESERVADO'
     AND NOT EXISTS (SELECT 1 FROM public.pagos p
                      WHERE (p.id = b.pago_id OR p.boleto_id = b.id)
                        AND p.tipo_pago = 'DIGITAL' AND p.estado_verificacion = 'PENDIENTE')
     AND ((b.reserva_expira_at IS NOT NULL AND b.reserva_expira_at < now())
          OR v.fecha_hora_salida < now()
          OR v.estado IN ('CANCELADO', 'EN_CURSO', 'COMPLETADO'));
END $$;
-- (el job 'auto_expirar_reserva' de 20260414000008 ya la ejecuta cada minuto)

-- Permisos
DO $$
DECLARE f record;
BEGIN
  FOR f IN SELECT p.oid::regprocedure AS sig FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public' AND (p.proname LIKE '\_%' OR p.proname = 'auto_expirar_reserva') LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', f.sig);
  END LOOP;
  FOR f IN SELECT p.oid::regprocedure AS sig FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public' AND p.proname IN (
              'fn_reservar_asientos', 'fn_liberar_reserva', 'fn_checkout_boletos', 'fn_cancelar_boleto',
              'fn_vender_boletos_taquilla', 'fn_cobrar_reserva_taquilla', 'fn_validar_embarque', 'fn_confirmar_embarque') LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', f.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', f.sig);
  END LOOP;
END $$;

COMMIT;
