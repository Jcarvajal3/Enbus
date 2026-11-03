-- Fase 3 · "Reportar un problema" (#28), estado de la cooperativa con motivo y rechazo
-- reversible (#37, AD-12), puesta en marcha (#38).
-- Requiere 20260720000001 y 20260720000002. Re-ejecutable.
BEGIN;

-- ─── 1. App: reportar un problema (crea una incidencia REPORTE_USUARIO) ─────
-- p_categoria: 'PAGO' | 'BOLETO' | 'ENCOMIENDA' | 'CUENTA' | 'OTRO'
CREATE OR REPLACE FUNCTION public.fn_reportar_problema(
  p_categoria text, p_descripcion text, p_boleto_id uuid DEFAULT NULL, p_encomienda_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_uid uuid := public._uid_usuario(); v_desc text := left(btrim(coalesce(p_descripcion, '')), 2000);
        v_id uuid; v_creada timestamptz;
BEGIN
  IF p_categoria IS NULL OR p_categoria NOT IN ('PAGO', 'BOLETO', 'ENCOMIENDA', 'CUENTA', 'OTRO') THEN
    PERFORM public._fallar('EB_DATOS_INVALIDOS', 'Elige de qué se trata el problema.', '{"campo":"categoria"}');
  END IF;
  IF length(v_desc) < 10 THEN
    PERFORM public._fallar('EB_DATOS_INVALIDOS', 'Cuéntanos qué pasó (al menos 10 caracteres).', '{"campo":"descripcion"}');
  END IF;
  IF p_boleto_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM public.boletos WHERE id = p_boleto_id AND comprador_id = v_uid) THEN
    PERFORM public._fallar('EB_NO_ENCONTRADO', 'No encontramos ese boleto en tu cuenta.');
  END IF;
  IF p_encomienda_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM public.encomiendas WHERE id = p_encomienda_id
          AND (sender_id = v_uid OR receiver_user_id = v_uid)) THEN
    PERFORM public._fallar('EB_NO_ENCONTRADO', 'No encontramos esa encomienda en tu cuenta.');
  END IF;
  IF (SELECT count(*) FROM public.incidencias
       WHERE reportado_por = v_uid AND created_at > now() - interval '24 hours') >= 5 THEN
    PERFORM public._fallar('EB_DEMASIADOS_REPORTES',
      'Ya nos enviaste varios reportes hoy. Te responderemos pronto; si es urgente, escríbenos por WhatsApp.');
  END IF;
  INSERT INTO public.incidencias (encomienda_id, boleto_id, reportado_por, tipo, categoria, descripcion, estado)
  VALUES (p_encomienda_id, p_boleto_id, v_uid, 'REPORTE_USUARIO', p_categoria, v_desc, 'ABIERTA')
  RETURNING id, created_at INTO v_id, v_creada;
  RETURN jsonb_build_object('id', v_id, 'codigo', 'INC-' || upper(left(replace(v_id::text, '-', ''), 6)),
                            'creada_at', v_creada);
END $$;

-- ─── 2. Super admin: cambiar el estado de una cooperativa con motivo ────────
-- RECHAZADA es reversible (vuelve a PENDIENTE). DESACTIVADA es terminal.
CREATE OR REPLACE FUNCTION public.fn_cambiar_estado_cooperativa(
  p_cooperativa_id uuid, p_estado public.estado_cooperativa, p_motivo text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_c record; v_motivo text := nullif(left(btrim(coalesce(p_motivo, '')), 500), ''); v_ok boolean;
BEGIN
  IF NOT coalesce(public.is_super_admin(), false) THEN
    PERFORM public._fallar('EB_SIN_PERMISO', 'Solo el equipo de EnBus puede cambiar el estado de una cooperativa.');
  END IF;
  SELECT id, estado, nombre INTO v_c FROM public.cooperativas WHERE id = p_cooperativa_id FOR UPDATE;
  IF NOT FOUND THEN
    PERFORM public._fallar('EB_NO_ENCONTRADO', 'No encontramos esa cooperativa.');
  END IF;
  IF v_c.estado = p_estado THEN
    RETURN jsonb_build_object('estado', p_estado, 'anterior', v_c.estado, 'ya_procesado', true);
  END IF;
  v_ok := CASE v_c.estado::text
            WHEN 'PENDIENTE'   THEN p_estado::text IN ('ACTIVA', 'RECHAZADA', 'DESACTIVADA')
            WHEN 'RECHAZADA'   THEN p_estado::text IN ('PENDIENTE', 'DESACTIVADA')
            WHEN 'ACTIVA'      THEN p_estado::text IN ('SUSPENDIDA', 'DESACTIVADA')
            WHEN 'SUSPENDIDA'  THEN p_estado::text IN ('ACTIVA', 'DESACTIVADA')
            ELSE false END;
  IF NOT v_ok THEN
    PERFORM public._fallar('EB_ESTADO_CAMBIO',
      CASE WHEN v_c.estado::text = 'DESACTIVADA' THEN 'Una cooperativa desactivada no se puede reactivar.'
           ELSE format('No se puede pasar de %s a %s.', v_c.estado, p_estado) END);
  END IF;
  IF p_estado::text IN ('RECHAZADA', 'SUSPENDIDA', 'DESACTIVADA') AND coalesce(length(v_motivo), 0) < 5 THEN
    PERFORM public._fallar('EB_MOTIVO_REQUERIDO', 'Escribe el motivo: la cooperativa lo verá en su panel.', '{"campo":"motivo"}');
  END IF;
  UPDATE public.cooperativas
     SET estado = p_estado,
         motivo_estado = CASE WHEN p_estado::text IN ('ACTIVA', 'PENDIENTE') THEN NULL ELSE v_motivo END,
         estado_cambiado_at = now(), estado_cambiado_por = auth.uid(), updated_at = now()
   WHERE id = p_cooperativa_id;
  RETURN jsonb_build_object('estado', p_estado, 'anterior', v_c.estado);
END $$;

-- ─── 3. Cooperativa rechazada: corrige sus datos y pide una nueva revisión ──
CREATE OR REPLACE FUNCTION public.fn_solicitar_revision_cooperativa(p_mensaje text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_ctx record; v_estado public.estado_cooperativa;
BEGIN
  SELECT * INTO v_ctx FROM public._contexto_staff();
  IF v_ctx.o_rol <> 'admin_cooperativa' THEN
    PERFORM public._fallar('EB_SIN_PERMISO', 'Solo el administrador de la cooperativa puede pedir la revisión.');
  END IF;
  SELECT estado INTO v_estado FROM public.cooperativas WHERE id = v_ctx.o_cooperativa_id FOR UPDATE;
  IF v_estado::text = 'PENDIENTE' THEN RETURN jsonb_build_object('estado', 'PENDIENTE', 'ya_procesado', true); END IF;
  IF v_estado::text <> 'RECHAZADA' THEN
    PERFORM public._fallar('EB_ESTADO_CAMBIO', 'Tu cooperativa no tiene una solicitud rechazada.');
  END IF;
  UPDATE public.cooperativas
     SET estado = 'PENDIENTE', motivo_estado = NULL, estado_cambiado_at = now(), estado_cambiado_por = v_ctx.o_uid,
         mensaje_registro = coalesce(nullif(left(btrim(coalesce(p_mensaje, '')), 1000), ''), mensaje_registro),
         updated_at = now()
   WHERE id = v_ctx.o_cooperativa_id;
  RETURN jsonb_build_object('estado', 'PENDIENTE');
END $$;

-- ─── 4. Panel: checklist de puesta en marcha (#38) ──────────────────────────
CREATE OR REPLACE FUNCTION public.fn_checklist_cooperativa()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_ctx record; v_c record;
BEGIN
  SELECT * INTO v_ctx FROM public._contexto_staff();
  SELECT estado, motivo_estado, estado_cambiado_at INTO v_c FROM public.cooperativas WHERE id = v_ctx.o_cooperativa_id;
  RETURN jsonb_build_object(
    'estado', v_c.estado, 'motivo_estado', v_c.motivo_estado, 'estado_cambiado_at', v_c.estado_cambiado_at,
    'sucursales', (SELECT count(*) FROM public.sucursales WHERE cooperativa_id = v_ctx.o_cooperativa_id AND activa),
    'metodos_pago', (SELECT count(*) FROM public.metodos_pago_cooperativa
                      WHERE cooperativa_id = v_ctx.o_cooperativa_id AND activo),
    'metodos_digitales', (SELECT count(*) FROM public.metodos_pago_cooperativa
                           WHERE cooperativa_id = v_ctx.o_cooperativa_id AND activo AND tipo <> 'EFECTIVO'),
    'rutas', (SELECT count(*) FROM public.rutas
               WHERE cooperativa_id = v_ctx.o_cooperativa_id AND activa AND coalesce(precio_pasaje, 0) > 0),
    'viajes_proximos', (SELECT count(*) FROM public.viajes
                         WHERE cooperativa_id = v_ctx.o_cooperativa_id AND estado = 'PROGRAMADO'
                           AND fecha_hora_salida > now()),
    'taquilleros', (SELECT count(*) FROM public.profiles
                     WHERE cooperativa_id = v_ctx.o_cooperativa_id AND role = 'taquillero'),
    'invitaciones_pendientes', (SELECT count(*) FROM public.invitaciones
                                 WHERE cooperativa_id = v_ctx.o_cooperativa_id AND NOT usado
                                   AND revocada_at IS NULL AND expira_at > now()));
END $$;

-- ─── 5. Registro de cooperativa: ¿el correo ya tiene cuenta? (#39, PC-03) ───
-- Solo service_role (server action del registro): sustituye listUsers() sin paginar.
CREATE OR REPLACE FUNCTION public.fn_email_registrado(p_email text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, auth, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM auth.users u WHERE lower(u.email) = lower(btrim(coalesce(p_email, ''))));
$$;
REVOKE ALL ON FUNCTION public.fn_email_registrado(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_email_registrado(text) TO service_role;

-- Permisos
DO $$
DECLARE f record;
BEGIN
  FOR f IN SELECT p.oid::regprocedure AS sig FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public' AND p.proname IN (
              'fn_reportar_problema', 'fn_cambiar_estado_cooperativa', 'fn_solicitar_revision_cooperativa',
              'fn_checklist_cooperativa') LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', f.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', f.sig);
  END LOOP;
END $$;

COMMIT;
