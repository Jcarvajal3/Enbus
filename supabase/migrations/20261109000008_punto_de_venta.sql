-- Punto de venta en la taquilla (necesita 20261109000003_punto_de_venta_enum.sql).
--   1. pagos.metodo_tipo: el tipo de método de cada pago. Hasta ahora solo se sabía por la cuenta de
--      la cooperativa (metodo_pago_id) y los cobros de taquilla "sin cuenta" quedaban como DIGITAL a
--      secas; un punto de venta sería indistinguible de una transferencia. Se rellena en los pagos
--      históricos (cuenta → su tipo; tipo_pago EFECTIVO → EFECTIVO; banco "Zelle" → ZELLE) y un
--      disparador lo completa en cualquier INSERT que no lo traiga.
--   2. Punto de venta es solo presencial: no se configura como cuenta (restricción en
--      metodos_pago_cooperativa), nunca queda por verificar (restricción en pagos) y las RPC de la app
--      lo rechazan. Como no hay cuentas de ese tipo, tampoco cuenta en "metodos_digitales".
--   3. _validar_comprobante: en punto de venta pide solo referencia (numérica, 4 a 30) y fecha (hoy
--      o hasta 30 días atrás); sin banco.
--   4. Cobro en taquilla (fn_vender_boletos_taquilla, fn_cobrar_reserva_taquilla,
--      fn_cobrar_encomienda_taquilla): aceptan PUNTO_DE_VENTA (Bs, sin banco ni vuelto) y guardan
--      metodo_tipo. Nace verificado: no entra en la bandeja ni en el aviso push al panel
--      (zz_push_pago_por_verificar solo mira pagos DIGITAL sin verificar).
--   5. La referencia de un punto de venta es del terminal, no del banco: no cuenta como "referencia
--      repetida" frente a los pagos que reporta el cliente (fn_checkout_boletos,
--      fn_registrar_pago_encomienda, pagos_referencia_unica_fn, fn_pagos_por_verificar).
--   6. fn_pagos_por_verificar y fn_reembolsos devuelven el método del pago (metodo_tipo) antes que
--      el de la cuenta. Punto de venta NO es un medio de devolución (fn_registrar_reembolso no cambia).
-- Cada función parte de su versión más reciente (indicada en su encabezado).
-- Re-ejecutable.

-- ─── 1. pagos.metodo_tipo ────────────────────────────────────────────────────
ALTER TABLE public.pagos ADD COLUMN IF NOT EXISTS metodo_tipo public.tipo_metodo_pago;

UPDATE public.pagos p SET metodo_tipo = m.tipo
  FROM public.metodos_pago_cooperativa m
 WHERE p.metodo_tipo IS NULL AND m.id = p.metodo_pago_id;
UPDATE public.pagos SET metodo_tipo = 'EFECTIVO' WHERE metodo_tipo IS NULL AND tipo_pago = 'EFECTIVO';
UPDATE public.pagos SET metodo_tipo = 'ZELLE' WHERE metodo_tipo IS NULL AND banco_emisor ILIKE 'zelle';
-- Lo demás (cobros digitales de taquilla sin cuenta, pagos legados) queda NULL: "Pago digital".

-- Completa metodo_tipo cuando el INSERT no lo trae (mismo criterio que el relleno).
CREATE OR REPLACE FUNCTION public.pagos_metodo_tipo_fn()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.metodo_tipo IS NULL THEN
    IF NEW.metodo_pago_id IS NOT NULL THEN
      SELECT m.tipo INTO NEW.metodo_tipo FROM public.metodos_pago_cooperativa m WHERE m.id = NEW.metodo_pago_id;
    END IF;
    IF NEW.metodo_tipo IS NULL AND NEW.tipo_pago = 'EFECTIVO' THEN
      NEW.metodo_tipo := 'EFECTIVO';
    ELSIF NEW.metodo_tipo IS NULL AND NEW.banco_emisor ILIKE 'zelle' THEN
      NEW.metodo_tipo := 'ZELLE';
    END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.pagos_metodo_tipo_fn() FROM PUBLIC, anon, authenticated;
-- "a0" corre antes que aa_referencia_unica_pago (los BEFORE se disparan por orden alfabético).
DROP TRIGGER IF EXISTS a0_metodo_tipo_pago ON public.pagos;
CREATE TRIGGER a0_metodo_tipo_pago BEFORE INSERT ON public.pagos
  FOR EACH ROW EXECUTE FUNCTION public.pagos_metodo_tipo_fn();

CREATE INDEX IF NOT EXISTS idx_pagos_coop_metodo_tipo ON public.pagos (cooperativa_id, metodo_tipo);

-- ─── 2. Punto de venta: solo presencial ──────────────────────────────────────
DO $$
BEGIN
  -- No es una cuenta que el cliente pueda elegir en la app: no se configura en Métodos de pago.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_metodos_pago_sin_punto_de_venta') THEN
    ALTER TABLE public.metodos_pago_cooperativa ADD CONSTRAINT chk_metodos_pago_sin_punto_de_venta
      CHECK (tipo <> 'PUNTO_DE_VENTA');
  END IF;
  -- Lo registra la taquilla con el cliente delante: nace verificado y es un pago digital.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_pagos_punto_de_venta_presencial') THEN
    ALTER TABLE public.pagos ADD CONSTRAINT chk_pagos_punto_de_venta_presencial
      CHECK (metodo_tipo IS DISTINCT FROM 'PUNTO_DE_VENTA' OR (verificado AND tipo_pago = 'DIGITAL'));
  END IF;
END $$;

-- ─── 3. Comprobante (versión de 20260719000003_fase2_rpc_boletos.sql) ────────
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
  ELSIF p_tipo = 'PUNTO_DE_VENTA' THEN
    -- Solo referencia del comprobante del punto y fecha: sin banco.
    IF v_ref !~ '^[0-9]{4,30}$' THEN
      PERFORM public._fallar('EB_DATOS_PAGO_INVALIDOS',
        'Escribe la referencia del comprobante del punto de venta: solo números, mínimo 4.', '{"campo":"referencia"}');
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

-- ─── 4a. Venta en taquilla (versión de 20260719000003_fase2_rpc_boletos.sql) ─
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
                            banco_emisor, verificado, verificado_por, verificado_at, idempotency_key, metodo_tipo)
  VALUES ((SELECT id FROM public.boletos WHERE compra_id = v_compra ORDER BY length(asiento), asiento LIMIT 1),
          v_ctx.o_uid, v_ctx.o_cooperativa_id, p_metodo_pago_id, v_total_usd, v_total_bs, v_tasa,
          v_tasa_fecha, v_moneda, coalesce(p_monto_recibido, v_esperado),
          CASE WHEN p_metodo_tipo = 'EFECTIVO' THEN 'EFECTIVO'::public.tipo_pago ELSE 'DIGITAL'::public.tipo_pago END,
          v_ref, coalesce(p_fecha_transaccion, (now() AT TIME ZONE 'America/Caracas')::date),
          CASE p_metodo_tipo WHEN 'ZELLE' THEN 'Zelle' WHEN 'PUNTO_DE_VENTA' THEN NULL
                    ELSE nullif(btrim(p_banco_emisor), '') END,
          true, v_ctx.o_uid, now(), p_idempotency_key, p_metodo_tipo)
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

-- ─── 4b. Cobro de una reserva en taquilla (versión de 20260719000003_fase2_rpc_boletos.sql) ─
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
                            banco_emisor, verificado, verificado_por, verificado_at, idempotency_key, metodo_tipo)
  VALUES (v_primer, v_ctx.o_uid, v_coop, p_metodo_pago_id, v_total_usd, v_total_bs, v_tasa, v_tasa_fecha,
          v_moneda, coalesce(p_monto_recibido, v_esperado),
          CASE WHEN p_metodo_tipo = 'EFECTIVO' THEN 'EFECTIVO'::public.tipo_pago ELSE 'DIGITAL'::public.tipo_pago END,
          v_ref, coalesce(p_fecha_transaccion, (now() AT TIME ZONE 'America/Caracas')::date),
          CASE p_metodo_tipo WHEN 'ZELLE' THEN 'Zelle' WHEN 'PUNTO_DE_VENTA' THEN NULL
                    ELSE nullif(btrim(p_banco_emisor), '') END,
          true, v_ctx.o_uid, now(), p_idempotency_key, p_metodo_tipo)
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

-- ─── 4c. Cobro de una encomienda en taquilla (versión de 20260719000004_fase2_rpc_pagos_encomiendas.sql) ─
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
                              fecha_transaccion, banco_emisor, verificado, verificado_por, verificado_at, idempotency_key, metodo_tipo)
    VALUES (p_encomienda_id, v_ctx.o_uid, v_ctx.o_cooperativa_id, p_metodo_pago_id, v_e.costo_calculado, v_bs,
            v_tasa, v_tasa_fecha, v_moneda, coalesce(p_monto_recibido, v_esperado),
            CASE WHEN p_metodo_tipo = 'EFECTIVO' THEN 'EFECTIVO'::public.tipo_pago ELSE 'DIGITAL'::public.tipo_pago END,
            v_ref, coalesce(p_fecha_transaccion, (now() AT TIME ZONE 'America/Caracas')::date),
            CASE p_metodo_tipo WHEN 'ZELLE' THEN 'Zelle' WHEN 'PUNTO_DE_VENTA' THEN NULL
                    ELSE nullif(btrim(p_banco_emisor), '') END,
            true, v_ctx.o_uid, now(), p_idempotency_key, p_metodo_tipo)
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

-- ─── 5a. Reportar pago de boletos desde la app (versión de 20261103000011_pagos_rechazo_y_capture.sql) ─
CREATE OR REPLACE FUNCTION public.fn_checkout_boletos(
  p_compra_id uuid, p_viaje_id uuid, p_asientos text[],
  p_metodo_pago_id uuid, p_numero_referencia text, p_fecha_transaccion date, p_banco_emisor text,
  p_monto_declarado numeric, p_tasa_esperada numeric, p_idempotency_key text,
  p_comprobante_path text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_uid uuid := public._uid_usuario();
  v_metodo_tipo public.tipo_metodo_pago;
  v_ref text; v_capture text; v_tasa numeric; v_tasa_fecha date;
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
  IF v_metodo_tipo IS NULL OR v_metodo_tipo IN ('EFECTIVO', 'PUNTO_DE_VENTA') THEN
    PERFORM public._fallar('EB_METODO_INVALIDO',
      'Elige una forma de pago de la cooperativa. Para pagar en efectivo, aparta tu asiento y paga en taquilla.');
  END IF;
  v_ref := public._validar_comprobante(v_metodo_tipo, p_numero_referencia, p_banco_emisor, p_fecha_transaccion);
  v_capture := public._validar_capture(v_metodo_tipo, v_uid, p_comprobante_path);

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
              AND tipo_pago = 'DIGITAL' AND rechazado_at IS NULL
              AND metodo_tipo IS DISTINCT FROM 'PUNTO_DE_VENTA') THEN
    PERFORM public._fallar('EB_REFERENCIA_REPETIDA',
      'Esa referencia ya fue registrada en otro pago. Revisa el número de tu comprobante.', '{"campo":"referencia"}');
  END IF;

  SELECT id INTO v_primer FROM public.boletos
   WHERE compra_id = p_compra_id AND estado = 'RESERVADO' ORDER BY length(asiento), asiento LIMIT 1;

  INSERT INTO public.pagos (boleto_id, pagador_id, cooperativa_id, metodo_pago_id, monto, monto_bs, tasa_bcv,
                            tasa_bcv_fecha, moneda, monto_declarado, tipo_pago, numero_referencia,
                            fecha_transaccion, banco_emisor, verificado, idempotency_key, comprobante_path)
  VALUES (v_primer, v_uid, v_coop, p_metodo_pago_id, v_total_usd, v_total_bs, v_tasa,
          v_tasa_fecha, v_moneda, coalesce(p_monto_declarado, v_esperado), 'DIGITAL', v_ref,
          p_fecha_transaccion, CASE WHEN v_metodo_tipo = 'ZELLE' THEN 'Zelle' ELSE btrim(p_banco_emisor) END,
          false, p_idempotency_key, v_capture)
  RETURNING id INTO v_pago_id;

  UPDATE public.boletos SET pago_id = v_pago_id, reserva_expira_at = NULL
   WHERE compra_id = p_compra_id AND estado = 'RESERVADO';

  RETURN public._resumen_compra(p_compra_id);
END $$;

-- ─── 5b. Reportar pago de encomienda desde la app (versión de 20261103000011_pagos_rechazo_y_capture.sql) ─
CREATE OR REPLACE FUNCTION public.fn_registrar_pago_encomienda(
  p_encomienda_id uuid, p_metodo_pago_id uuid, p_numero_referencia text, p_fecha_transaccion date,
  p_banco_emisor text, p_monto_declarado numeric, p_tasa_esperada numeric, p_idempotency_key text,
  p_comprobante_path text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_uid uuid := public._uid_usuario(); v_e record; v_metodo_tipo public.tipo_metodo_pago;
  v_tasa numeric; v_tasa_fecha date; v_ref text; v_capture text; v_bs numeric; v_moneda text; v_esperado numeric; v_pago_id uuid;
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
  IF v_metodo_tipo IS NULL OR v_metodo_tipo IN ('EFECTIVO', 'PUNTO_DE_VENTA') THEN
    PERFORM public._fallar('EB_METODO_INVALIDO', 'Elige una forma de pago de la cooperativa. El efectivo se paga en taquilla.');
  END IF;
  v_ref := public._validar_comprobante(v_metodo_tipo, p_numero_referencia, p_banco_emisor, p_fecha_transaccion);
  v_capture := public._validar_capture(v_metodo_tipo, v_uid, p_comprobante_path);
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
              AND tipo_pago = 'DIGITAL' AND rechazado_at IS NULL
              AND metodo_tipo IS DISTINCT FROM 'PUNTO_DE_VENTA') THEN
    PERFORM public._fallar('EB_REFERENCIA_REPETIDA',
      'Esa referencia ya fue registrada en otro pago. Revisa el número de tu comprobante.', '{"campo":"referencia"}');
  END IF;
  BEGIN
    INSERT INTO public.pagos (encomienda_id, pagador_id, cooperativa_id, metodo_pago_id, monto, monto_bs, tasa_bcv,
                              tasa_bcv_fecha, moneda, monto_declarado, tipo_pago, numero_referencia,
                              fecha_transaccion, banco_emisor, verificado, idempotency_key, comprobante_path)
    VALUES (p_encomienda_id, v_uid, v_e.cooperativa_id, p_metodo_pago_id, v_e.costo_calculado, v_bs, v_tasa,
            v_tasa_fecha, v_moneda, coalesce(p_monto_declarado, v_esperado), 'DIGITAL', v_ref,
            p_fecha_transaccion, CASE WHEN v_metodo_tipo = 'ZELLE' THEN 'Zelle' ELSE btrim(p_banco_emisor) END,
            false, p_idempotency_key, v_capture)
    RETURNING id INTO v_pago_id;
  EXCEPTION WHEN unique_violation THEN
    PERFORM public._fallar('EB_PAGO_YA_REGISTRADO', 'Ya hay un pago registrado para esta encomienda.');
  END;
  RETURN jsonb_build_object('pago_id', v_pago_id, 'estado', 'PENDIENTE', 'monto_usd', v_e.costo_calculado,
    'monto_bs', v_bs, 'tasa_bcv', v_tasa, 'tasa_bcv_fecha', v_tasa_fecha, 'moneda', v_moneda,
    'monto_declarado', coalesce(p_monto_declarado, v_esperado));
END $$;

-- ─── 5c. Referencia repetida al insertar (versión de 20261103000003_robustez_integridad.sql) ─
CREATE OR REPLACE FUNCTION public.pagos_referencia_unica_fn()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.tipo_pago <> 'DIGITAL' OR NEW.verificado OR NEW.rechazado_at IS NOT NULL
     OR NEW.numero_referencia IS NULL THEN
    RETURN NEW;
  END IF;
  -- Serializa a quien registra la misma referencia en la misma cooperativa; tras esperar, la
  -- consulta siguiente ve el pago ya confirmado del otro.
  PERFORM pg_advisory_xact_lock(hashtextextended('pagos.referencia:' || NEW.cooperativa_id::text || ':'
                                                 || NEW.numero_referencia, 0));
  IF EXISTS (SELECT 1 FROM public.pagos p
              WHERE p.cooperativa_id = NEW.cooperativa_id AND p.numero_referencia = NEW.numero_referencia
                AND p.tipo_pago = 'DIGITAL' AND p.rechazado_at IS NULL AND p.id <> NEW.id
                AND p.metodo_tipo IS DISTINCT FROM 'PUNTO_DE_VENTA') THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'EB_REFERENCIA_REPETIDA',
      HINT = 'Esa referencia ya fue registrada en otro pago. Revisa el número de tu comprobante.',
      DETAIL = '{"campo":"referencia"}';
  END IF;
  RETURN NEW;
END $$;

-- ─── 6a. Bandeja del panel (versión de 20261103000011_pagos_rechazo_y_capture.sql; mismo tipo de retorno) ─
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
  estado_verificacion text, motivo_rechazo text, referencia_repetida boolean,
  comprobante_path text
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
         coalesce(p.metodo_tipo, m.tipo)::text, m.banco, m.titular,
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
                    AND o.numero_referencia = p.numero_referencia AND o.rechazado_at IS NULL
                    -- La referencia de un punto de venta es del terminal: solo se compara con otras iguales.
                    AND (o.metodo_tipo IS NOT DISTINCT FROM 'PUNTO_DE_VENTA') = (p.metodo_tipo IS NOT DISTINCT FROM 'PUNTO_DE_VENTA')),
         p.comprobante_path
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

-- ─── 6b. Bandeja de reembolsos (versión de 20260720000003_fase3_rpc_boletos.sql) ─
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
         coalesce(p.metodo_tipo::text, m.tipo::text, p.tipo_pago::text), p.banco_emisor, p.numero_referencia, p.moneda, p.estado_verificacion,
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
