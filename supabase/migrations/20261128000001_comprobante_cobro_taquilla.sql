-- Comprobante opcional en el cobro de taquilla (Pago Móvil, Transferencia, Zelle y Punto de venta).
--   1. Subida: el personal de la cooperativa (taquillero y admin) puede subir imágenes al bucket
--      comprobantes-pago, siempre a su carpeta <uid>/. Antes solo el pasajero ('user'). Sigue sin
--      poder reemplazarse ni borrarse (es evidencia). La política "ver" no cambia: el personal ve el
--      comprobante de cualquier pago de su cooperativa (pagos.comprobante_path = objeto), así que
--      el verificador de Pagos y el detalle ven lo que subió otro taquillero.
--   2. _validar_capture_taquilla: comprobante OPCIONAL. Sin ruta (o en efectivo) devuelve NULL; con
--      ruta exige que sea de la carpeta de quien llama y que el objeto exista (EB_COMPROBANTE_INVALIDO).
--   3. fn_vender_boletos_taquilla, fn_cobrar_reserva_taquilla y fn_cobrar_encomienda_taquilla reciben
--      p_comprobante_path (último parámetro, DEFAULT NULL) y lo guardan en pagos.comprobante_path. El
--      resto de su lógica es la de 20261109000008. Se borran las firmas anteriores para no dejar
--      sobrecargas y se repiten los permisos.
-- Re-ejecutable.
BEGIN;

-- ─── 1. Subida por el personal ───────────────────────────────────────────────
DROP POLICY IF EXISTS "Comprobantes: subir" ON storage.objects;
CREATE POLICY "Comprobantes: subir" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'comprobantes-pago'
              AND (select public.user_role()) IN ('user', 'taquillero', 'admin_cooperativa')
              AND (storage.foldername(name))[1] = (select auth.uid())::text);

-- ─── 2. Validación del comprobante opcional ──────────────────────────────────
CREATE OR REPLACE FUNCTION public._validar_capture_taquilla(p_tipo public.tipo_metodo_pago, p_uid uuid, p_path text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_path text := btrim(coalesce(p_path, ''));
BEGIN
  IF p_tipo = 'EFECTIVO' OR v_path = '' THEN RETURN NULL; END IF;
  IF split_part(v_path, '/', 1) <> p_uid::text
     OR NOT EXISTS (SELECT 1 FROM storage.objects o
                     WHERE o.bucket_id = 'comprobantes-pago' AND o.name = v_path) THEN
    PERFORM public._fallar('EB_COMPROBANTE_INVALIDO',
      'No pudimos encontrar la imagen del comprobante. Adjúntala de nuevo o cobra sin ella.', '{"campo":"comprobante"}');
  END IF;
  RETURN v_path;
END $$;
REVOKE ALL ON FUNCTION public._validar_capture_taquilla(public.tipo_metodo_pago, uuid, text) FROM PUBLIC, anon, authenticated;

-- Se borran las firmas sin el parámetro nuevo (no debe quedar una segunda versión).
DROP FUNCTION IF EXISTS public.fn_vender_boletos_taquilla(uuid, jsonb, public.tipo_metodo_pago, uuid, text, numeric, text, date, text, text);
DROP FUNCTION IF EXISTS public.fn_cobrar_reserva_taquilla(uuid, public.tipo_metodo_pago, uuid, text, numeric, text, date, text, text);
DROP FUNCTION IF EXISTS public.fn_cobrar_encomienda_taquilla(uuid, public.tipo_metodo_pago, uuid, text, numeric, text, date, text, text);

-- ─── 3a. Venta en taquilla (versión de 20261109000008_punto_de_venta.sql) ─
CREATE OR REPLACE FUNCTION public.fn_vender_boletos_taquilla(
  p_viaje_id uuid, p_pasajeros jsonb, p_metodo_tipo public.tipo_metodo_pago, p_metodo_pago_id uuid,
  p_moneda text, p_monto_recibido numeric, p_numero_referencia text, p_fecha_transaccion date,
  p_banco_emisor text, p_idempotency_key text, p_comprobante_path text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_ctx record; v_viaje record; v_compra uuid := gen_random_uuid();
  v_asientos text[]; v_n integer; v_ocupados text[]; v_previo uuid;
  v_tasa numeric; v_tasa_fecha date; v_ref text; v_capture text;
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
  v_capture := public._validar_capture_taquilla(p_metodo_tipo, v_ctx.o_uid, p_comprobante_path);
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
                            banco_emisor, verificado, verificado_por, verificado_at, idempotency_key, metodo_tipo, comprobante_path)
  VALUES ((SELECT id FROM public.boletos WHERE compra_id = v_compra ORDER BY length(asiento), asiento LIMIT 1),
          v_ctx.o_uid, v_ctx.o_cooperativa_id, p_metodo_pago_id, v_total_usd, v_total_bs, v_tasa,
          v_tasa_fecha, v_moneda, coalesce(p_monto_recibido, v_esperado),
          CASE WHEN p_metodo_tipo = 'EFECTIVO' THEN 'EFECTIVO'::public.tipo_pago ELSE 'DIGITAL'::public.tipo_pago END,
          v_ref, coalesce(p_fecha_transaccion, (now() AT TIME ZONE 'America/Caracas')::date),
          CASE p_metodo_tipo WHEN 'ZELLE' THEN 'Zelle' WHEN 'PUNTO_DE_VENTA' THEN NULL
                    ELSE nullif(btrim(p_banco_emisor), '') END,
          true, v_ctx.o_uid, now(), p_idempotency_key, p_metodo_tipo, v_capture)
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

-- ─── 3b. Cobro de una reserva en taquilla (versión de 20261109000008_punto_de_venta.sql) ─
CREATE OR REPLACE FUNCTION public.fn_cobrar_reserva_taquilla(
  p_boleto_id uuid, p_metodo_tipo public.tipo_metodo_pago, p_metodo_pago_id uuid, p_moneda text,
  p_monto_recibido numeric, p_numero_referencia text, p_fecha_transaccion date, p_banco_emisor text,
  p_idempotency_key text, p_comprobante_path text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_ctx record; v_compra uuid; v_coop uuid; v_comprador uuid;
  v_tasa numeric; v_tasa_fecha date; v_ref text; v_capture text;
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
  v_capture := public._validar_capture_taquilla(p_metodo_tipo, v_ctx.o_uid, p_comprobante_path);
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
                            banco_emisor, verificado, verificado_por, verificado_at, idempotency_key, metodo_tipo, comprobante_path)
  VALUES (v_primer, v_ctx.o_uid, v_coop, p_metodo_pago_id, v_total_usd, v_total_bs, v_tasa, v_tasa_fecha,
          v_moneda, coalesce(p_monto_recibido, v_esperado),
          CASE WHEN p_metodo_tipo = 'EFECTIVO' THEN 'EFECTIVO'::public.tipo_pago ELSE 'DIGITAL'::public.tipo_pago END,
          v_ref, coalesce(p_fecha_transaccion, (now() AT TIME ZONE 'America/Caracas')::date),
          CASE p_metodo_tipo WHEN 'ZELLE' THEN 'Zelle' WHEN 'PUNTO_DE_VENTA' THEN NULL
                    ELSE nullif(btrim(p_banco_emisor), '') END,
          true, v_ctx.o_uid, now(), p_idempotency_key, p_metodo_tipo, v_capture)
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

-- ─── 3c. Cobro de una encomienda en taquilla (versión de 20261109000008_punto_de_venta.sql) ─
CREATE OR REPLACE FUNCTION public.fn_cobrar_encomienda_taquilla(
  p_encomienda_id uuid, p_metodo_tipo public.tipo_metodo_pago, p_metodo_pago_id uuid, p_moneda text,
  p_monto_recibido numeric, p_numero_referencia text, p_fecha_transaccion date, p_banco_emisor text,
  p_idempotency_key text, p_comprobante_path text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_ctx record; v_e record; v_tasa numeric; v_tasa_fecha date; v_ref text; v_capture text;
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
  v_capture := public._validar_capture_taquilla(p_metodo_tipo, v_ctx.o_uid, p_comprobante_path);
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
                              fecha_transaccion, banco_emisor, verificado, verificado_por, verificado_at, idempotency_key, metodo_tipo, comprobante_path)
    VALUES (p_encomienda_id, v_ctx.o_uid, v_ctx.o_cooperativa_id, p_metodo_pago_id, v_e.costo_calculado, v_bs,
            v_tasa, v_tasa_fecha, v_moneda, coalesce(p_monto_recibido, v_esperado),
            CASE WHEN p_metodo_tipo = 'EFECTIVO' THEN 'EFECTIVO'::public.tipo_pago ELSE 'DIGITAL'::public.tipo_pago END,
            v_ref, coalesce(p_fecha_transaccion, (now() AT TIME ZONE 'America/Caracas')::date),
            CASE p_metodo_tipo WHEN 'ZELLE' THEN 'Zelle' WHEN 'PUNTO_DE_VENTA' THEN NULL
                    ELSE nullif(btrim(p_banco_emisor), '') END,
            true, v_ctx.o_uid, now(), p_idempotency_key, p_metodo_tipo, v_capture)
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

-- ─── 4. Permisos (DROP FUNCTION se llevó los anteriores) ─────────────────────
REVOKE ALL ON FUNCTION public.fn_vender_boletos_taquilla(uuid, jsonb, public.tipo_metodo_pago, uuid, text, numeric, text, date, text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_cobrar_reserva_taquilla(uuid, public.tipo_metodo_pago, uuid, text, numeric, text, date, text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_cobrar_encomienda_taquilla(uuid, public.tipo_metodo_pago, uuid, text, numeric, text, date, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_vender_boletos_taquilla(uuid, jsonb, public.tipo_metodo_pago, uuid, text, numeric, text, date, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_cobrar_reserva_taquilla(uuid, public.tipo_metodo_pago, uuid, text, numeric, text, date, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_cobrar_encomienda_taquilla(uuid, public.tipo_metodo_pago, uuid, text, numeric, text, date, text, text, text) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
