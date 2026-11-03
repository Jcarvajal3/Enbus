-- Robustez · Pedidos del agente de la app (Audits/robustez/app-movil.md).
--   1. calificaciones: además de la RLS de 20261103000002 (boleto propio, USADO, de esa cooperativa),
--      la cooperativa se toma del boleto (la app ya no puede equivocarse) y boleto, usuario y
--      cooperativa no cambian al editar.
--   2. fn_registrar_push_token(p_token): guarda el token del teléfono en el perfil propio y lo quita
--      de cualquier otro perfil (lo mismo hace el trigger expo_token_unico de 20261103000007 con el
--      UPDATE directo). Con p_token NULL lo borra (cerrar sesión).
--   3. fn_validar_embarque: el WHERE con cuatro OR y ORDER BY created_at podía recorrer todos los
--      boletos en cada escaneo; ahora cada forma del código busca por su índice (UNION).
-- Re-ejecutable. Firmas existentes sin cambios.
BEGIN;

-- ─── 1. calificaciones ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.proteger_calificacion_fn()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND (NEW.boleto_id, NEW.usuario_id, NEW.cooperativa_id)
                          IS DISTINCT FROM (OLD.boleto_id, OLD.usuario_id, OLD.cooperativa_id) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'EB_OPERACION_NO_PERMITIDA',
      HINT = 'Solo puedes cambiar las estrellas y el comentario de tu calificación.';
  END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.usuario_id := auth.uid();
    -- La RLS solo deja leer boletos propios: si no es suyo, queda NULL y la política lo rechaza.
    NEW.cooperativa_id := coalesce((SELECT b.cooperativa_id FROM public.boletos b WHERE b.id = NEW.boleto_id),
                                   NEW.cooperativa_id);
    NEW.created_at := now();
  END IF;
  NEW.comentario := nullif(btrim(NEW.comentario), '');
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.proteger_calificacion_fn() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS aa_proteger_calificacion ON public.calificaciones;
CREATE TRIGGER aa_proteger_calificacion BEFORE INSERT OR UPDATE ON public.calificaciones
  FOR EACH ROW EXECUTE FUNCTION public.proteger_calificacion_fn();

-- ─── 2. Token push ───────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_registrar_push_token(p_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_uid uuid := auth.uid(); v_token text := nullif(btrim(coalesce(p_token, '')), '');
BEGIN
  IF v_uid IS NULL THEN
    PERFORM public._fallar('EB_NO_AUTENTICADO', 'Tu sesión expiró. Inicia sesión de nuevo.');
  END IF;
  IF v_token IS NOT NULL AND (length(v_token) > 200 OR v_token !~ '^(Exponent|Expo)PushToken\[[A-Za-z0-9_-]+\]$') THEN
    PERFORM public._fallar('EB_DATOS_INVALIDOS', 'El identificador de notificaciones no es válido.');
  END IF;
  IF v_token IS NOT NULL THEN
    UPDATE public.profiles SET expo_push_token = NULL WHERE expo_push_token = v_token AND id <> v_uid;
  END IF;
  UPDATE public.profiles SET expo_push_token = v_token
   WHERE id = v_uid AND expo_push_token IS DISTINCT FROM v_token;
  RETURN jsonb_build_object('ok', true, 'registrado', v_token IS NOT NULL);
END $$;
REVOKE ALL ON FUNCTION public.fn_registrar_push_token(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_registrar_push_token(text) TO authenticated;

-- ─── 3. Escaneo de embarque por índices ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_validar_embarque(p_codigo text, p_viaje_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_ctx record; v_code text := upper(btrim(coalesce(p_codigo, ''))); v_norm text; v_id uuid; v_coop uuid;
BEGIN
  SELECT * INTO v_ctx FROM public._contexto_staff();
  v_norm := regexp_replace(v_code, '[^A-Z0-9]', '', 'g');
  IF v_norm LIKE 'PASS%' THEN v_norm := substr(v_norm, 5); END IF;
  SELECT c.id, c.cooperativa_id INTO v_id, v_coop
    FROM (SELECT b.id, b.cooperativa_id, b.created_at FROM public.boletos b WHERE b.codigo_boleto = v_code
          UNION
          SELECT b.id, b.cooperativa_id, b.created_at FROM public.boletos b WHERE upper(b.qr_embarque_data) = v_code
          UNION
          SELECT b.id, b.cooperativa_id, b.created_at FROM public.boletos b WHERE 'PASS-' || b.codigo_boleto = v_code
          UNION
          SELECT b.id, b.cooperativa_id, b.created_at FROM public.boletos b
           WHERE length(v_norm) >= 8 AND regexp_replace(upper(b.codigo_boleto), '[^A-Z0-9]', '', 'g') = v_norm) c
   ORDER BY (c.cooperativa_id = v_ctx.o_cooperativa_id) DESC, c.created_at DESC
   LIMIT 1;
  IF v_id IS NULL THEN RETURN jsonb_build_object('resultado', 'NO_ENCONTRADO', 'codigo', v_code); END IF;
  IF v_coop <> v_ctx.o_cooperativa_id THEN RETURN jsonb_build_object('resultado', 'OTRA_COOPERATIVA', 'codigo', v_code); END IF;
  RETURN public._resultado_embarque(v_id, p_viaje_id);
END $$;
REVOKE ALL ON FUNCTION public.fn_validar_embarque(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_validar_embarque(text, uuid) TO authenticated;

COMMIT;
