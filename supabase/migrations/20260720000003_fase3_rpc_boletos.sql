-- Fase 3 · Boletos: pasajero por asiento (#25), asientos ocupados visibles (#25),
-- código corto legible en el embarque (#26), OTRO_DIA antes que OTRO_VIAJE (pendiente fase 2),
-- cancelación de viaje con reembolso y bandeja de reembolsos (#27).
-- Requiere 20260719000003 y 20260720000002. Re-ejecutable.
BEGIN;

-- "05/10 a las 8:30 a. m." (hora de Venezuela), para los avisos.
CREATE OR REPLACE FUNCTION public._fecha_hora_ve(p timestamptz)
RETURNS text LANGUAGE sql STABLE SET search_path = public, pg_temp AS $$
  SELECT to_char(p AT TIME ZONE 'America/Caracas', 'DD/MM') || ' a las '
         || ltrim(to_char(p AT TIME ZONE 'America/Caracas', 'HH12:MI'), '0')
         || CASE WHEN extract(hour FROM p AT TIME ZONE 'America/Caracas') < 12 THEN ' a. m.' ELSE ' p. m.' END;
$$;

-- Resumen de compra: ahora con el pasajero de cada boleto (cambio aditivo).
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
                 'qr_embarque_data', v.qr_embarque_data,
                 'pasajero_nombre', v.pasajero_nombre, 'pasajero_cedula', v.pasajero_cedula,
                 'pasajero_telefono', v.pasajero_telefono)
               ORDER BY length(v.asiento), v.asiento) FROM vivos v), '[]'::jsonb),
    'total_usd', (SELECT sum(precio) FROM vivos),
    'reserva_expira_at', (SELECT min(reserva_expira_at) FROM vivos WHERE estado = 'RESERVADO'),
    'pago', (SELECT jsonb_build_object('id', u.id, 'estado', u.estado_verificacion, 'monto_usd', u.monto,
                    'monto_bs', u.monto_bs, 'tasa_bcv', u.tasa_bcv, 'tasa_bcv_fecha', u.tasa_bcv_fecha,
                    'moneda', u.moneda, 'monto_declarado', u.monto_declarado,
                    'motivo_rechazo', u.motivo_rechazo) FROM ult u)
  );
$$;

-- Apartar asientos: igual que en la fase 2, pero solo copia del perfil datos válidos
-- (un perfil de Google tiene cédula 'PENDIENTE-…': el boleto queda sin cédula hasta asignarla).
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
      'Ya registraste un pago para esta compra. Revisa tus boletos en Mis boletos.');
  END IF;

  UPDATE public.boletos
     SET estado = 'CANCELADO', motivo_cancelacion = 'Asiento cambiado por el pasajero antes de pagar'
   WHERE compra_id = p_compra_id AND estado = 'RESERVADO' AND NOT (asiento = ANY (v_asientos));

  v_expira := least(now() + interval '30 minutes', v_viaje.fecha_hora_salida);
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

  SELECT nullif(btrim(nombre_completo), ''),
         CASE WHEN public.normalizar_cedula(cedula_rif) IS NOT NULL THEN cedula_rif END,
         CASE WHEN public.normalizar_telefono(telefono) IS NOT NULL THEN telefono END
    INTO v_nombre, v_cedula, v_tel
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

-- App: asientos ocupados de una salida (la RLS de boletos solo deja ver los propios).
CREATE OR REPLACE FUNCTION public.fn_asientos_ocupados(p_viaje_id uuid)
RETURNS text[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT coalesce(array_agg(b.asiento ORDER BY length(b.asiento), b.asiento), '{}'::text[])
    FROM public.boletos b
   WHERE b.viaje_id = p_viaje_id AND b.estado IN ('RESERVADO', 'PAGADO', 'USADO');
$$;

-- App: nombre y cédula de quien viaja en cada asiento apartado (#25).
-- p_pasajeros: [{"asiento":"14","nombre":"Ana Pérez","cedula":"V-12345678","telefono":"0414-1234567"}]
CREATE OR REPLACE FUNCTION public.fn_asignar_pasajeros(p_compra_id uuid, p_pasajeros jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_uid uuid := public._uid_usuario(); v_malos text[]; v_ajenos text[]; v_faltan text[]; v_n integer;
BEGIN
  IF jsonb_typeof(p_pasajeros) IS DISTINCT FROM 'array' OR jsonb_array_length(p_pasajeros) = 0 THEN
    PERFORM public._fallar('EB_DATOS_PASAJERO', 'Escribe el nombre y la cédula de cada pasajero.', '{"campo":"pasajeros"}');
  END IF;
  IF EXISTS (SELECT 1 FROM public.boletos WHERE compra_id = p_compra_id AND comprador_id IS DISTINCT FROM v_uid) THEN
    PERFORM public._fallar('EB_SIN_PERMISO', 'Esta compra no te pertenece.');
  END IF;
  PERFORM 1 FROM public.boletos WHERE compra_id = p_compra_id AND estado = 'RESERVADO' FOR UPDATE;
  IF NOT FOUND THEN
    PERFORM public._fallar('EB_ESTADO_CAMBIO', 'Tus asientos ya no están apartados. Vuelve a elegirlos.');
  END IF;
  SELECT array_agg(coalesce(nullif(btrim(x.asiento), ''), '?')) INTO v_malos
    FROM jsonb_to_recordset(p_pasajeros) AS x(asiento text, nombre text, cedula text, telefono text)
   WHERE length(coalesce(btrim(x.nombre), '')) < 3
      OR public.normalizar_cedula(x.cedula) IS NULL
      OR (nullif(btrim(x.telefono), '') IS NOT NULL AND public.normalizar_telefono(x.telefono) IS NULL);
  IF v_malos IS NOT NULL THEN
    PERFORM public._fallar('EB_DATOS_PASAJERO',
      format('Revisa el nombre y la cédula del pasajero del asiento %s.', array_to_string(v_malos, ', ')),
      jsonb_build_object('campo', 'pasajeros', 'asientos', v_malos));
  END IF;
  SELECT array_agg(btrim(x.asiento)) INTO v_ajenos
    FROM jsonb_to_recordset(p_pasajeros) AS x(asiento text)
   WHERE NOT EXISTS (SELECT 1 FROM public.boletos b WHERE b.compra_id = p_compra_id
                       AND b.estado = 'RESERVADO' AND b.asiento = btrim(x.asiento));
  IF v_ajenos IS NOT NULL THEN
    PERFORM public._fallar('EB_ESTADO_CAMBIO',
      format('El asiento %s ya no está apartado en esta compra. Vuelve a elegir tus asientos.', array_to_string(v_ajenos, ', ')),
      jsonb_build_object('asientos', v_ajenos));
  END IF;
  UPDATE public.boletos b
     SET pasajero_nombre = btrim(x.nombre), pasajero_cedula = btrim(x.cedula),
         pasajero_telefono = nullif(btrim(x.telefono), '')
    FROM jsonb_to_recordset(p_pasajeros) AS x(asiento text, nombre text, cedula text, telefono text)
   WHERE b.compra_id = p_compra_id AND b.estado = 'RESERVADO' AND b.asiento = btrim(x.asiento);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  SELECT array_agg(b.asiento ORDER BY length(b.asiento), b.asiento) INTO v_faltan
    FROM public.boletos b
   WHERE b.compra_id = p_compra_id AND b.estado = 'RESERVADO'
     AND (length(coalesce(btrim(b.pasajero_nombre), '')) < 3 OR public.normalizar_cedula(b.pasajero_cedula) IS NULL);
  RETURN public._resumen_compra(p_compra_id)
         || jsonb_build_object('actualizados', v_n, 'asientos_sin_datos', coalesce(to_jsonb(v_faltan), '[]'::jsonb));
END $$;

-- Checkout: igual que en la fase 2 + exige nombre y cédula válidos en cada asiento (#25, M-06).
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
  v_coop uuid; v_primer uuid; v_pago_id uuid; v_sin_datos text[];
BEGIN
  IF coalesce(length(p_idempotency_key), 0) < 8 THEN
    PERFORM public._fallar('EB_DATOS_INVALIDOS', 'Falta la clave de la operación. Actualiza la app e intenta de nuevo.');
  END IF;
  PERFORM 1 FROM public.viajes WHERE id = p_viaje_id FOR UPDATE;
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

  SELECT array_agg(asiento ORDER BY length(asiento), asiento) INTO v_sin_datos
    FROM public.boletos
   WHERE compra_id = p_compra_id AND estado = 'RESERVADO'
     AND (length(coalesce(btrim(pasajero_nombre), '')) < 3 OR public.normalizar_cedula(pasajero_cedula) IS NULL);
  IF v_sin_datos IS NOT NULL THEN
    PERFORM public._fallar('EB_DATOS_PASAJERO',
      format('Falta el nombre o la cédula del pasajero del asiento %s.', array_to_string(v_sin_datos, ', ')),
      jsonb_build_object('campo', 'pasajeros', 'asientos', v_sin_datos));
  END IF;

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

-- Embarque: OTRO_DIA tiene prioridad sobre OTRO_VIAJE (pendiente fase 2: es la causa más útil).
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
    WHEN v_dia <> v_hoy                                      THEN 'OTRO_DIA'
    WHEN p_viaje_id IS NOT NULL AND r.viaje_id <> p_viaje_id THEN 'OTRO_VIAJE'
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

-- Código legible: "BOL-7KQ2-M9XA", "bol 7kq2 m9xa" o el QR "PASS-BOL-…" encuentran el mismo boleto (#26, DS-09).
CREATE INDEX IF NOT EXISTS idx_boletos_codigo_norm
  ON public.boletos (regexp_replace(upper(codigo_boleto), '[^A-Z0-9]', '', 'g'));

CREATE OR REPLACE FUNCTION public.fn_validar_embarque(p_codigo text, p_viaje_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_ctx record; v_code text := upper(btrim(coalesce(p_codigo, ''))); v_norm text; v_id uuid; v_coop uuid;
BEGIN
  SELECT * INTO v_ctx FROM public._contexto_staff();
  v_norm := regexp_replace(v_code, '[^A-Z0-9]', '', 'g');
  IF v_norm LIKE 'PASS%' THEN v_norm := substr(v_norm, 5); END IF;
  SELECT b.id, b.cooperativa_id INTO v_id, v_coop
    FROM public.boletos b
   WHERE b.codigo_boleto = v_code OR upper(b.qr_embarque_data) = v_code OR 'PASS-' || b.codigo_boleto = v_code
      OR (length(v_norm) >= 8 AND regexp_replace(upper(b.codigo_boleto), '[^A-Z0-9]', '', 'g') = v_norm)
   ORDER BY (b.cooperativa_id = v_ctx.o_cooperativa_id) DESC, b.created_at DESC
   LIMIT 1;
  IF v_id IS NULL THEN RETURN jsonb_build_object('resultado', 'NO_ENCONTRADO', 'codigo', v_code); END IF;
  IF v_coop <> v_ctx.o_cooperativa_id THEN RETURN jsonb_build_object('resultado', 'OTRA_COOPERATIVA', 'codigo', v_code); END IF;
  RETURN public._resultado_embarque(v_id, p_viaje_id);
END $$;

-- Cancelar un viaje (admin de la cooperativa): reembolso del 100 % de los boletos pagados (#27, P-49).
CREATE OR REPLACE FUNCTION public.fn_cancelar_viaje(p_viaje_id uuid, p_motivo text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_ctx record; v_v record; v_motivo text := left(btrim(coalesce(p_motivo, '')), 300);
  v_pendientes integer; v_pagados integer; v_reservas integer; v_total numeric; v_enc integer;
  v_ruta text; v_salida text; r record;
BEGIN
  SELECT * INTO v_ctx FROM public._contexto_staff();
  IF v_ctx.o_rol <> 'admin_cooperativa' THEN
    PERFORM public._fallar('EB_SIN_PERMISO', 'Solo el administrador de la cooperativa puede cancelar viajes.');
  END IF;
  SELECT v.id, v.cooperativa_id, v.estado, v.fecha_hora_salida, ru.ciudad_origen, ru.ciudad_destino INTO v_v
    FROM public.viajes v JOIN public.rutas ru ON ru.id = v.ruta_id
   WHERE v.id = p_viaje_id FOR UPDATE OF v;
  IF NOT FOUND OR v_v.cooperativa_id <> v_ctx.o_cooperativa_id THEN
    PERFORM public._fallar('EB_NO_ENCONTRADO', 'No encontramos ese viaje en tu cooperativa.');
  END IF;
  IF v_v.estado = 'CANCELADO' THEN
    RETURN jsonb_build_object('estado', 'CANCELADO', 'ya_procesado', true);
  END IF;
  IF v_v.estado <> 'PROGRAMADO' THEN
    PERFORM public._fallar('EB_ESTADO_CAMBIO', 'Solo se puede cancelar un viaje que todavía no ha salido.');
  END IF;
  IF length(v_motivo) < 5 THEN
    PERFORM public._fallar('EB_MOTIVO_REQUERIDO',
      'Escribe el motivo de la cancelación (se lo enviaremos a los pasajeros).', '{"campo":"motivo"}');
  END IF;
  PERFORM 1 FROM public.boletos WHERE viaje_id = p_viaje_id FOR UPDATE;
  SELECT count(*) INTO v_pendientes
    FROM public.boletos b JOIN public.pagos p ON p.id = b.pago_id
   WHERE b.viaje_id = p_viaje_id AND b.estado = 'RESERVADO' AND p.estado_verificacion = 'PENDIENTE';
  IF v_pendientes > 0 THEN
    PERFORM public._fallar('EB_PAGOS_PENDIENTES',
      format('Hay %s pago(s) por verificar en este viaje. Apruébalos o recházalos en «Pagos por verificar» y vuelve a cancelarlo.', v_pendientes),
      jsonb_build_object('pendientes', v_pendientes));
  END IF;

  v_ruta := initcap(replace(v_v.ciudad_origen, '_', ' ')) || ' → ' || initcap(replace(v_v.ciudad_destino, '_', ' '));
  v_salida := public._fecha_hora_ve(v_v.fecha_hora_salida);

  -- Avisos (antes de cambiar los estados): un aviso por comprador.
  FOR r IN
    SELECT b.comprador_id, (array_agg(b.id ORDER BY length(b.asiento), b.asiento))[1] AS boleto_id,
           bool_or(b.estado = 'PAGADO') AS pagado, sum(b.precio) FILTER (WHERE b.estado = 'PAGADO') AS total
      FROM public.boletos b
     WHERE b.viaje_id = p_viaje_id AND b.estado IN ('PAGADO', 'RESERVADO') AND b.comprador_id IS NOT NULL
     GROUP BY b.comprador_id
  LOOP
    PERFORM public._notificar_usuario(r.comprador_id, 'VIAJE_CANCELADO', 'Tu viaje fue cancelado',
      CASE WHEN r.pagado THEN
        format('La cooperativa canceló el viaje %s del %s: %s. Te devolverá el 100 %% de tu pasaje (USD %s) en bolívares a la tasa BCV del día, por el mismo medio de pago.',
               v_ruta, v_salida, v_motivo, replace(to_char(r.total, 'FM999999990.00'), '.', ','))
      ELSE
        format('La cooperativa canceló el viaje %s del %s: %s. Tu reserva quedó anulada; no tienes que pagar nada.',
               v_ruta, v_salida, v_motivo)
      END, 'boleto', r.boleto_id);
  END LOOP;

  UPDATE public.viajes SET estado = 'CANCELADO' WHERE id = p_viaje_id;
  SELECT coalesce(sum(precio), 0) INTO v_total FROM public.boletos WHERE viaje_id = p_viaje_id AND estado = 'PAGADO';
  UPDATE public.boletos
     SET estado = 'CANCELADO', monto_reembolso = precio,
         motivo_cancelacion = 'Viaje cancelado por la cooperativa: ' || v_motivo
   WHERE viaje_id = p_viaje_id AND estado = 'PAGADO';
  GET DIAGNOSTICS v_pagados = ROW_COUNT;
  UPDATE public.boletos
     SET estado = 'CANCELADO', motivo_cancelacion = 'Viaje cancelado por la cooperativa: ' || v_motivo
   WHERE viaje_id = p_viaje_id AND estado = 'RESERVADO';
  GET DIAGNOSTICS v_reservas = ROW_COUNT;
  SELECT count(*) INTO v_enc FROM public.encomiendas WHERE viaje_id = p_viaje_id AND estado = 'EN_TRANSITO';

  RETURN jsonb_build_object('estado', 'CANCELADO', 'boletos_reembolso', v_pagados, 'reservas_anuladas', v_reservas,
                            'total_reembolso_usd', v_total, 'encomiendas_en_transito', v_enc);
END $$;

-- Bandeja de reembolsos de la cooperativa (#27, P-49). p_estado: 'PENDIENTE' | 'PROCESADO' | 'TODOS'.
CREATE OR REPLACE FUNCTION public.fn_reembolsos(p_estado text DEFAULT 'PENDIENTE')
RETURNS TABLE (
  boleto_id uuid, codigo_boleto text, compra_id uuid, asiento text,
  pasajero_nombre text, pasajero_cedula text, contacto_nombre text, contacto_telefono text,
  viaje_salida timestamptz, ruta text, cancelado_at timestamptz, motivo_cancelacion text, cancelado_por text,
  monto_usd numeric, pago_id uuid, pago_metodo text, pago_banco_emisor text, pago_referencia text,
  pago_moneda text, pago_estado text,
  procesado boolean, procesado_at timestamptz, reembolso_metodo text, reembolso_referencia text, reembolso_nota text
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
#variable_conflict use_column
DECLARE v_ctx record;
BEGIN
  SELECT * INTO v_ctx FROM public._contexto_staff();
  RETURN QUERY
  SELECT b.id, b.codigo_boleto, b.compra_id, b.asiento,
         b.pasajero_nombre, b.pasajero_cedula,
         coalesce(pr.nombre_completo, b.pasajero_nombre),
         coalesce(CASE WHEN public.normalizar_telefono(pr.telefono) IS NOT NULL THEN pr.telefono END, b.pasajero_telefono),
         v.fecha_hora_salida, ru.ciudad_origen || ' → ' || ru.ciudad_destino,
         b.updated_at, b.motivo_cancelacion,
         CASE WHEN b.motivo_cancelacion LIKE 'Viaje cancelado por la cooperativa%' THEN 'COOPERATIVA' ELSE 'PASAJERO' END,
         b.monto_reembolso::numeric, p.id,
         coalesce(m.tipo::text, p.tipo_pago::text), p.banco_emisor, p.numero_referencia, p.moneda, p.estado_verificacion,
         b.reembolso_procesado, b.reembolso_procesado_at, b.reembolso_metodo, b.reembolso_referencia, b.reembolso_nota
    FROM public.boletos b
    JOIN public.viajes v ON v.id = b.viaje_id
    JOIN public.rutas ru ON ru.id = v.ruta_id
    LEFT JOIN public.profiles pr ON pr.id = b.comprador_id
    LEFT JOIN public.pagos p ON p.id = b.pago_id
    LEFT JOIN public.metodos_pago_cooperativa m ON m.id = p.metodo_pago_id
   WHERE b.cooperativa_id = v_ctx.o_cooperativa_id
     AND b.estado = 'CANCELADO' AND coalesce(b.monto_reembolso, 0) > 0
     AND (coalesce(p_estado, 'PENDIENTE') = 'TODOS'
          OR (coalesce(p_estado, 'PENDIENTE') = 'PENDIENTE' AND NOT b.reembolso_procesado)
          OR (p_estado = 'PROCESADO' AND b.reembolso_procesado))
   ORDER BY b.reembolso_procesado, b.updated_at;
END $$;

-- Registrar que la cooperativa ya devolvió el dinero (uno o varios boletos de una misma compra).
CREATE OR REPLACE FUNCTION public.fn_registrar_reembolso(p_boleto_ids uuid[], p_metodo text,
                                                         p_referencia text, p_nota text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_ctx record; v_ids uuid[]; v_ref text := nullif(btrim(coalesce(p_referencia, '')), '');
  v_n integer; v_ya integer; r record;
BEGIN
  SELECT * INTO v_ctx FROM public._contexto_staff();
  SELECT array_agg(DISTINCT x) INTO v_ids FROM unnest(p_boleto_ids) x WHERE x IS NOT NULL;
  IF v_ids IS NULL THEN
    PERFORM public._fallar('EB_DATOS_INVALIDOS', 'Elige al menos un boleto.');
  END IF;
  IF p_metodo IS NULL OR p_metodo NOT IN ('PAGO_MOVIL', 'TRANSFERENCIA_BANCARIA', 'ZELLE', 'EFECTIVO') THEN
    PERFORM public._fallar('EB_DATOS_INVALIDOS', 'Elige cómo devolviste el dinero.', '{"campo":"metodo"}');
  END IF;
  IF p_metodo <> 'EFECTIVO' AND (v_ref IS NULL OR length(regexp_replace(v_ref, '[^A-Za-z0-9]', '', 'g')) < 4) THEN
    PERFORM public._fallar('EB_DATOS_PAGO_INVALIDOS', 'Escribe la referencia de la devolución (mínimo 4 caracteres).',
                           '{"campo":"referencia"}');
  END IF;
  PERFORM 1 FROM public.boletos WHERE id = ANY (v_ids) ORDER BY id FOR UPDATE;
  IF EXISTS (SELECT 1 FROM unnest(v_ids) i LEFT JOIN public.boletos b ON b.id = i
              WHERE b.id IS NULL OR b.cooperativa_id <> v_ctx.o_cooperativa_id
                 OR b.estado <> 'CANCELADO' OR coalesce(b.monto_reembolso, 0) <= 0) THEN
    PERFORM public._fallar('EB_NO_ENCONTRADO', 'Uno de los boletos no tiene un reembolso pendiente en tu cooperativa. Actualiza la lista.');
  END IF;
  SELECT count(*) INTO v_ya FROM public.boletos WHERE id = ANY (v_ids) AND reembolso_procesado;

  FOR r IN
    SELECT b.comprador_id, (array_agg(b.id ORDER BY length(b.asiento), b.asiento))[1] AS boleto_id,
           string_agg(b.codigo_boleto, ', ' ORDER BY length(b.asiento), b.asiento) AS codigos,
           sum(b.monto_reembolso) AS total
      FROM public.boletos b
     WHERE b.id = ANY (v_ids) AND NOT b.reembolso_procesado AND b.comprador_id IS NOT NULL
     GROUP BY b.comprador_id
  LOOP
    PERFORM public._notificar_usuario(r.comprador_id, 'REEMBOLSO_ENVIADO', 'Te devolvimos tu dinero',
      format('La cooperativa registró la devolución de USD %s por %s%s. Si no la ves en 24 horas, escríbele a la cooperativa.',
             replace(to_char(r.total, 'FM999999990.00'), '.', ','), r.codigos,
             CASE WHEN v_ref IS NOT NULL THEN ' (ref. ' || v_ref || ')' ELSE '' END),
      'boleto', r.boleto_id);
  END LOOP;

  UPDATE public.boletos
     SET reembolso_procesado = true, reembolso_procesado_at = now(), reembolso_procesado_por = v_ctx.o_uid,
         reembolso_metodo = p_metodo, reembolso_referencia = v_ref,
         reembolso_nota = nullif(left(btrim(coalesce(p_nota, '')), 300), '')
   WHERE id = ANY (v_ids) AND NOT reembolso_procesado;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN jsonb_build_object('procesados', v_n, 'ya_procesados', v_ya);
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
              'fn_asientos_ocupados', 'fn_asignar_pasajeros', 'fn_checkout_boletos', 'fn_validar_embarque',
              'fn_cancelar_viaje', 'fn_reembolsos', 'fn_registrar_reembolso') LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', f.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', f.sig);
  END LOOP;
END $$;

COMMIT;
