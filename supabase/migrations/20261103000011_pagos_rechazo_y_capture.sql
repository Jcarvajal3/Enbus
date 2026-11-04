-- Pagos reportados desde la app: rechazo que libera los asientos y capture obligatorio en Pago Móvil.
--   1. fn_rechazar_pago: los boletos de la compra pasan a CANCELADO y sus asientos quedan libres al
--      momento (antes volvían a "reserva sin pagar" con 30 minutos nuevos). Un reporte falso ya no
--      retiene asientos. La encomienda sigue igual: queda por pagar y se puede volver a reportar.
--   2. Bucket privado comprobantes-pago y pagos.comprobante_path. Ruta: <usuario>/<uuid>.<ext>.
--   3. fn_checkout_boletos y fn_registrar_pago_encomienda reciben p_comprobante_path y lo exigen
--      solo con Pago Móvil (EB_COMPROBANTE_REQUERIDO). El cobro en taquilla no cambia.
--   4. fn_pagos_por_verificar devuelve comprobante_path para que el panel muestre el capture.
-- Re-ejecutable.
BEGIN;

-- ─── 1. Columna y bucket ─────────────────────────────────────────────────────
ALTER TABLE public.pagos ADD COLUMN IF NOT EXISTS comprobante_path text;
COMMENT ON COLUMN public.pagos.comprobante_path IS
  'Capture del pago (ruta en el bucket privado comprobantes-pago). Obligatorio al reportar Pago Móvil desde la app; NULL en pagos anteriores y en los demás métodos.';
CREATE INDEX IF NOT EXISTS idx_pagos_comprobante ON public.pagos (comprobante_path)
  WHERE comprobante_path IS NOT NULL;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('comprobantes-pago', 'comprobantes-pago', false, 5242880,
        ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO UPDATE
  SET public = false, file_size_limit = EXCLUDED.file_size_limit, allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Sin HEIC: el panel lo muestra en el navegador y Chrome no lo abre.
-- Sube el pasajero, a su carpeta; no se reemplaza ni se borra (es evidencia del pago).
-- Lo ven el dueño, el personal de la cooperativa del pago y el super admin.
DROP POLICY IF EXISTS "Comprobantes: subir" ON storage.objects;
DROP POLICY IF EXISTS "Comprobantes: ver" ON storage.objects;
DROP POLICY IF EXISTS "Comprobantes: validar en RPC" ON storage.objects;
CREATE POLICY "Comprobantes: subir" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'comprobantes-pago'
              AND (select public.user_role()) = 'user'
              AND (storage.foldername(name))[1] = (select auth.uid())::text);
CREATE POLICY "Comprobantes: ver" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'comprobantes-pago' AND (
           (storage.foldername(name))[1] = (select auth.uid())::text
           OR (select public.is_super_admin())
           OR EXISTS (SELECT 1 FROM public.pagos p
                       WHERE p.comprobante_path = objects.name
                         AND p.cooperativa_id = (select public.user_cooperativa_id()))));
-- _validar_capture corre como postgres y debe poder comprobar que el archivo existe.
CREATE POLICY "Comprobantes: validar en RPC" ON storage.objects FOR SELECT TO postgres
  USING (bucket_id = 'comprobantes-pago');

-- ─── 2. Validación del capture ───────────────────────────────────────────────
-- Devuelve la ruta que se guarda: NULL si el método no es Pago Móvil.
CREATE OR REPLACE FUNCTION public._validar_capture(p_tipo public.tipo_metodo_pago, p_uid uuid, p_path text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_path text := btrim(coalesce(p_path, ''));
BEGIN
  IF p_tipo <> 'PAGO_MOVIL' THEN RETURN NULL; END IF;
  IF split_part(v_path, '/', 1) <> p_uid::text
     OR NOT EXISTS (SELECT 1 FROM storage.objects o
                     WHERE o.bucket_id = 'comprobantes-pago' AND o.name = v_path) THEN
    PERFORM public._fallar('EB_COMPROBANTE_REQUERIDO',
      'Adjunta el capture del Pago Móvil. Si no ves la opción, actualiza la app.', '{"campo":"comprobante"}');
  END IF;
  RETURN v_path;
END $$;
REVOKE ALL ON FUNCTION public._validar_capture(public.tipo_metodo_pago, uuid, text) FROM PUBLIC, anon, authenticated;

-- ─── 3. Reportar pago de boletos ─────────────────────────────────────────────
-- Igual que en 20260720000003 + p_comprobante_path. Se borra la firma anterior para no dejar una
-- sobrecarga que permita saltarse el capture.
DROP FUNCTION IF EXISTS public.fn_checkout_boletos(uuid, uuid, text[], uuid, text, date, text, numeric, numeric, text);
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
  IF v_metodo_tipo IS NULL OR v_metodo_tipo = 'EFECTIVO' THEN
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
              AND tipo_pago = 'DIGITAL' AND rechazado_at IS NULL) THEN
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

-- ─── 4. Reportar pago de encomienda ──────────────────────────────────────────
-- Igual que en 20260719000004 + p_comprobante_path.
DROP FUNCTION IF EXISTS public.fn_registrar_pago_encomienda(uuid, uuid, text, date, text, numeric, numeric, text);
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
  IF v_metodo_tipo IS NULL OR v_metodo_tipo = 'EFECTIVO' THEN
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
              AND tipo_pago = 'DIGITAL' AND rechazado_at IS NULL) THEN
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

-- ─── 5. Rechazar: libera los asientos ────────────────────────────────────────
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
    -- Candado del viaje antes que el de los boletos (mismo orden que _asegurar_asientos): el trigger
    -- actualizar_asientos toca la fila del viaje al liberar cada asiento.
    PERFORM 1 FROM public.viajes v
     WHERE v.id IN (SELECT b.viaje_id FROM public.boletos b
                     WHERE b.pago_id = p_pago_id OR (b.id = v_p.boleto_id AND b.pago_id IS NULL))
     ORDER BY v.id FOR UPDATE;
    UPDATE public.boletos b
       SET estado = 'CANCELADO', reserva_expira_at = NULL,
           motivo_cancelacion = left('Pago rechazado: ' || v_motivo, 300)
     WHERE (b.pago_id = p_pago_id OR (b.id = v_p.boleto_id AND b.pago_id IS NULL)) AND b.estado = 'RESERVADO';
    GET DIAGNOSTICS v_n = ROW_COUNT;
    SELECT id INTO v_boleto FROM public.boletos WHERE pago_id = p_pago_id ORDER BY length(asiento), asiento LIMIT 1;
    PERFORM public._notificar_usuario(v_p.pagador_id, 'PAGO_RECHAZADO', 'Tu pago fue rechazado',
      CASE WHEN v_n > 0 THEN
        format('La cooperativa no pudo confirmar tu pago (ref. %s): %s. Tus asientos se liberaron; para viajar, vuelve a elegirlos. Si te cobraron, contacta a la cooperativa.',
               coalesce(v_p.numero_referencia, 's/n'), v_motivo)
      ELSE   -- los asientos ya no estaban apartados: no hay nada que liberar
        format('La cooperativa no pudo confirmar tu pago (ref. %s): %s. Tus asientos ya no están apartados; si te cobraron, contacta a la cooperativa para la devolución.',
               coalesce(v_p.numero_referencia, 's/n'), v_motivo)
      END, 'boleto', coalesce(v_boleto, v_p.boleto_id));
  END IF;
  RETURN jsonb_build_object('ok', true, 'boletos_liberados', v_n);
END $$;

-- ─── 6. Bandeja del panel: agrega comprobante_path ───────────────────────────
-- Cambia el tipo que devuelve: hay que borrarla y crearla de nuevo.
DROP FUNCTION IF EXISTS public.fn_pagos_por_verificar(text, uuid);
CREATE FUNCTION public.fn_pagos_por_verificar(p_tipo text DEFAULT NULL, p_pago_id uuid DEFAULT NULL)
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
                    AND o.numero_referencia = p.numero_referencia AND o.rechazado_at IS NULL),
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

-- ─── 7. Permisos (DROP FUNCTION se llevó los anteriores) ─────────────────────
REVOKE ALL ON FUNCTION public.fn_checkout_boletos(uuid, uuid, text[], uuid, text, date, text, numeric, numeric, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_registrar_pago_encomienda(uuid, uuid, text, date, text, numeric, numeric, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_pagos_por_verificar(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_checkout_boletos(uuid, uuid, text[], uuid, text, date, text, numeric, numeric, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_registrar_pago_encomienda(uuid, uuid, text, date, text, numeric, numeric, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_pagos_por_verificar(text, uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
