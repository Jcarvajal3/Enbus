-- Robustez · Pedidos del agente del panel de cooperativas (Audits/robustez/panel-cooperativas.md §4).
--   1. Cooperativa que no está ACTIVA (PENDIENTE, RECHAZADA, SUSPENDIDA, DESACTIVADA): no vende boletos
--      nuevos ni acepta encomiendas nuevas por ningún canal (Specs/00_General/State_Machines_Spec.md:210).
--      Lo en curso termina su ciclo: cobrar, despachar, recibir en destino, entregar y reembolsar
--      siguen permitidos. Se hace con triggers para no tocar las RPC de venta.
--   2. Personal desactivado (ban en Auth): _contexto_staff lo rechaza aunque su sesión siga abierta, y
--      fn_cerrar_sesiones_usuario borra sus sesiones y refresh tokens (service role o super admin; el
--      admin de una cooperativa, solo para su personal).
--   3. Índices compuestos para las listas y conteos del panel.
-- Re-ejecutable. Firmas existentes sin cambios.
BEGIN;

-- ─── 1. Cooperativa operativa ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.exigir_cooperativa_activa_fn()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_estado public.estado_cooperativa;
BEGIN
  -- IF anidados: cada expresión se compila con el tipo de fila de la tabla del trigger (en boletos,
  -- 'PENDIENTE_DE_ESCANEO' no es un estado_boleto válido).
  IF TG_OP = 'UPDATE' THEN
    IF NOT (OLD.estado::text = 'PENDIENTE_DE_ESCANEO' AND NEW.estado::text = 'EN_RECEPCION') THEN
      RETURN NEW;   -- solo cuenta como "nueva" la recepción en origen de un envío de la app
    END IF;
  END IF;
  SELECT c.estado INTO v_estado FROM public.cooperativas c WHERE c.id = NEW.cooperativa_id;
  IF v_estado IS DISTINCT FROM 'ACTIVA' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'EB_COOPERATIVA_NO_OPERATIVA',
      HINT = CASE TG_TABLE_NAME
               WHEN 'boletos' THEN 'La cooperativa no está activa en EnBus: no puede vender boletos nuevos.'
               ELSE 'La cooperativa no está activa en EnBus: no puede recibir envíos nuevos.' END,
      DETAIL = jsonb_build_object('estado', v_estado)::text;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.exigir_cooperativa_activa_fn() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS ab_exigir_cooperativa_activa ON public.boletos;
CREATE TRIGGER ab_exigir_cooperativa_activa BEFORE INSERT ON public.boletos
  FOR EACH ROW EXECUTE FUNCTION public.exigir_cooperativa_activa_fn();
DROP TRIGGER IF EXISTS ab_exigir_cooperativa_activa ON public.encomiendas;
CREATE TRIGGER ab_exigir_cooperativa_activa BEFORE INSERT OR UPDATE OF estado ON public.encomiendas
  FOR EACH ROW EXECUTE FUNCTION public.exigir_cooperativa_activa_fn();

-- ─── 2. Personal desactivado ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._contexto_staff(
  OUT o_uid uuid, OUT o_rol public.rol_usuario, OUT o_cooperativa_id uuid, OUT o_sucursal_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  o_uid := auth.uid();
  IF o_uid IS NULL THEN
    PERFORM public._fallar('EB_NO_AUTENTICADO', 'Tu sesión expiró. Inicia sesión de nuevo.');
  END IF;
  SELECT p.role, p.cooperativa_id, p.sucursal_id INTO o_rol, o_cooperativa_id, o_sucursal_id
    FROM public.profiles p WHERE p.id = o_uid AND p.eliminada_at IS NULL;
  IF o_rol IS NULL OR o_rol NOT IN ('taquillero', 'admin_cooperativa') OR o_cooperativa_id IS NULL THEN
    PERFORM public._fallar('EB_SIN_PERMISO',
      'Tu usuario no puede hacer esta operación. Avísale al administrador de tu cooperativa.');
  END IF;
  -- Un empleado desactivado conserva su JWT hasta que vence: se le corta aquí.
  IF EXISTS (SELECT 1 FROM auth.users u WHERE u.id = o_uid AND u.banned_until > now()) THEN
    PERFORM public._fallar('EB_SIN_PERMISO', 'Tu usuario está desactivado. Habla con el administrador de tu cooperativa.');
  END IF;
END $$;
REVOKE ALL ON FUNCTION public._contexto_staff() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.fn_cerrar_sesiones_usuario(p_usuario_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth, pg_temp AS $$
DECLARE v_uid uuid := auth.uid(); v_rol public.rol_usuario; v_coop uuid; v_obj record; v_s integer; v_r integer;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN   -- dentro de SECURITY DEFINER, current_user es el dueño
    SELECT role, cooperativa_id INTO v_rol, v_coop FROM public.profiles WHERE id = v_uid AND eliminada_at IS NULL;
    SELECT role, cooperativa_id INTO v_obj FROM public.profiles WHERE id = p_usuario_id;
    IF NOT (v_rol = 'super_admin'
            OR (v_rol = 'admin_cooperativa' AND v_obj.cooperativa_id = v_coop
                AND v_obj.role IN ('taquillero', 'admin_cooperativa') AND p_usuario_id <> v_uid)) THEN
      PERFORM public._fallar('EB_SIN_PERMISO', 'No puedes cerrar las sesiones de este usuario.');
    END IF;
  END IF;
  DELETE FROM auth.refresh_tokens WHERE user_id = p_usuario_id::text;
  GET DIAGNOSTICS v_r = ROW_COUNT;
  DELETE FROM auth.sessions WHERE user_id = p_usuario_id;
  GET DIAGNOSTICS v_s = ROW_COUNT;
  RETURN jsonb_build_object('sesiones', v_s, 'refresh_tokens', v_r);
END $$;
REVOKE ALL ON FUNCTION public.fn_cerrar_sesiones_usuario(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_cerrar_sesiones_usuario(uuid) TO authenticated, service_role;

-- ─── 3. Índices del panel ────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_encomiendas_coop_estado_fecha ON public.encomiendas (cooperativa_id, estado, created_at DESC);
DROP INDEX IF EXISTS public.idx_encomiendas_coop_estado;
CREATE INDEX IF NOT EXISTS idx_boletos_coop_estado_fecha ON public.boletos (cooperativa_id, estado, created_at);
CREATE INDEX IF NOT EXISTS idx_boletos_viaje_estado ON public.boletos (viaje_id, estado);
DROP INDEX IF EXISTS public.idx_boletos_viaje_id;
CREATE INDEX IF NOT EXISTS idx_viajes_coop_estado_salida ON public.viajes (cooperativa_id, estado, fecha_hora_salida);
DROP INDEX IF EXISTS public.idx_viajes_coop_salida;
CREATE INDEX IF NOT EXISTS idx_pagos_coop_verificado_at ON public.pagos (cooperativa_id, verificado_at) WHERE verificado;
CREATE INDEX IF NOT EXISTS idx_historial_estado_fecha ON public.encomienda_estado_historial (estado_nuevo, created_at);
DROP INDEX IF EXISTS public.idx_encomienda_historial_created_at;

COMMIT;
