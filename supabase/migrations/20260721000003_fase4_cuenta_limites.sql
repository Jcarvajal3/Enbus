-- Fase 4 · Cuenta y límites: eliminar la cuenta desde la app (#50, M-56, APP-52, requisito de
-- Google Play), límite de frecuencia para las acciones públicas (verificarCorreoRegistro y
-- reenviarInvitacion, pendientes de la fase 3) y cédula/teléfono únicos por su valor normalizado
-- (pendiente de la fase 3, #57). Requiere 20260720000002. Re-ejecutable.
BEGIN;

-- ─── 1. Límite de frecuencia (solo service role) ────────────────────────────
-- Ventana fija por clave ("correo:<hash ip>", "invitacion:<rif>"). Atómico: INSERT … ON CONFLICT.
CREATE TABLE IF NOT EXISTS public.limites_uso (
  clave          text PRIMARY KEY,
  ventana_inicio timestamptz NOT NULL DEFAULT now(),
  conteo         integer NOT NULL DEFAULT 0
);
ALTER TABLE public.limites_uso ENABLE ROW LEVEL SECURITY;      -- sin políticas: nadie desde la API
REVOKE ALL ON public.limites_uso FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.fn_consumir_limite(p_clave text, p_maximo integer, p_ventana_segundos integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_clave text := left(btrim(coalesce(p_clave, '')), 200); v_conteo integer; v_inicio timestamptz;
        v_ventana interval;
BEGIN
  IF v_clave = '' OR coalesce(p_maximo, 0) < 1 OR coalesce(p_ventana_segundos, 0) < 1 THEN
    PERFORM public._fallar('EB_DATOS_INVALIDOS', 'Límite mal configurado.');
  END IF;
  v_ventana := make_interval(secs => p_ventana_segundos);
  INSERT INTO public.limites_uso AS l (clave, ventana_inicio, conteo)
  VALUES (v_clave, now(), 1)
  ON CONFLICT (clave) DO UPDATE
     SET conteo = CASE WHEN l.ventana_inicio <= now() - v_ventana THEN 1 ELSE l.conteo + 1 END,
         ventana_inicio = CASE WHEN l.ventana_inicio <= now() - v_ventana THEN now() ELSE l.ventana_inicio END
  RETURNING conteo, ventana_inicio INTO v_conteo, v_inicio;
  RETURN jsonb_build_object(
    'permitido', v_conteo <= p_maximo,
    'restantes', greatest(p_maximo - v_conteo, 0),
    'reintentar_en_segundos', CASE WHEN v_conteo <= p_maximo THEN 0
                                   ELSE greatest(ceil(extract(epoch FROM (v_inicio + v_ventana - now())))::integer, 1) END);
END $$;

CREATE OR REPLACE FUNCTION public.fn_limpiar_limites_uso()
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  DELETE FROM public.limites_uso WHERE ventana_inicio < now() - interval '2 days';
$$;
DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'limpiar_limites_uso') THEN
    PERFORM cron.unschedule('limpiar_limites_uso');
  END IF;
  PERFORM cron.schedule('limpiar_limites_uso', '17 4 * * *', 'SELECT public.fn_limpiar_limites_uso()');
END $do$;

-- ─── 2. Formato único de cédula y teléfono (#57) ────────────────────────────
-- Misma forma en que la app y el panel guardan ("V-12345678", "0414-1234567"): cedulaParaGuardar y
-- telefonoParaGuardar de shared/ve.ts. NULL si no es válido (incluye los marcadores 'PENDIENTE…').
CREATE OR REPLACE FUNCTION public._cedula_para_guardar(p text)
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT CASE WHEN x.n IS NULL THEN NULL ELSE left(x.n, 1) || '-' || substr(x.n, 2) END
    FROM (SELECT public.normalizar_cedula(p) AS n) x;
$$;
CREATE OR REPLACE FUNCTION public._telefono_para_guardar(p text)
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT CASE WHEN x.n IS NULL THEN NULL ELSE '0' || substr(x.n, 1, 3) || '-' || substr(x.n, 4) END
    FROM (SELECT public.normalizar_telefono(p) AS n) x;
$$;

-- Perfiles antiguos en otro formato ("V12345678", "04141234567") pasan a la forma única, salvo que
-- choquen con otro perfil (esos quedan para revisión, ver la consulta al final). Sin avisos ni
-- re-vínculos de encomiendas: el valor normalizado no cambia.
ALTER TABLE public.profiles DISABLE TRIGGER vincular_encomiendas_de_perfil;
WITH cand AS (
  SELECT id, public._cedula_para_guardar(cedula_rif) AS nueva FROM public.profiles
   WHERE public._cedula_para_guardar(cedula_rif) IS NOT NULL
     AND cedula_rif <> public._cedula_para_guardar(cedula_rif)
)
UPDATE public.profiles p SET cedula_rif = c.nueva
  FROM cand c
 WHERE p.id = c.id
   AND NOT EXISTS (SELECT 1 FROM public.profiles o WHERE o.cedula_rif = c.nueva AND o.id <> p.id)
   AND NOT EXISTS (SELECT 1 FROM cand c2 WHERE c2.nueva = c.nueva AND c2.id <> c.id);
WITH cand AS (
  SELECT id, public._telefono_para_guardar(telefono) AS nuevo FROM public.profiles
   WHERE public._telefono_para_guardar(telefono) IS NOT NULL
     AND telefono <> public._telefono_para_guardar(telefono)
)
UPDATE public.profiles p SET telefono = c.nuevo
  FROM cand c
 WHERE p.id = c.id
   AND NOT EXISTS (SELECT 1 FROM public.profiles o WHERE o.telefono = c.nuevo AND o.id <> p.id)
   AND NOT EXISTS (SELECT 1 FROM cand c2 WHERE c2.nuevo = c.nuevo AND c2.id <> c.id);
ALTER TABLE public.profiles ENABLE TRIGGER vincular_encomiendas_de_perfil;

-- Únicos por valor normalizado: solo si los datos lo permiten (si no, NOTICE con la consulta).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.profiles WHERE public.normalizar_cedula(cedula_rif) IS NOT NULL
              GROUP BY public.normalizar_cedula(cedula_rif) HAVING count(*) > 1) THEN
    RAISE NOTICE 'Hay cédulas repetidas escritas distinto: no se crea uq_profiles_cedula_normalizada. Revisa: SELECT public.normalizar_cedula(cedula_rif), array_agg(id) FROM public.profiles WHERE public.normalizar_cedula(cedula_rif) IS NOT NULL GROUP BY 1 HAVING count(*) > 1;';
  ELSE
    CREATE UNIQUE INDEX IF NOT EXISTS uq_profiles_cedula_normalizada
      ON public.profiles (public.normalizar_cedula(cedula_rif)) WHERE public.normalizar_cedula(cedula_rif) IS NOT NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM public.profiles WHERE public.normalizar_telefono(telefono) IS NOT NULL
              GROUP BY public.normalizar_telefono(telefono) HAVING count(*) > 1) THEN
    RAISE NOTICE 'Hay teléfonos repetidos escritos distinto: no se crea uq_profiles_telefono_normalizado. Revisa: SELECT public.normalizar_telefono(telefono), array_agg(id) FROM public.profiles WHERE public.normalizar_telefono(telefono) IS NOT NULL GROUP BY 1 HAVING count(*) > 1;';
  ELSE
    CREATE UNIQUE INDEX IF NOT EXISTS uq_profiles_telefono_normalizado
      ON public.profiles (public.normalizar_telefono(telefono)) WHERE public.normalizar_telefono(telefono) IS NOT NULL;
  END IF;
END $$;

-- Alta de usuarios: guarda la forma única y compara por valor normalizado (antes, "V12345678" y
-- "V-12345678" no chocaban). Si ya los usa otra cuenta, marcador 'PENDIENTE-<id>' como en la fase 3.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  m jsonb := coalesce(NEW.raw_user_meta_data, '{}'::jsonb);
  v_nombre text; v_tel text; v_ced text;
BEGIN
  v_nombre := coalesce(nullif(btrim(m->>'nombre_completo'), ''), nullif(btrim(m->>'full_name'), ''),
                       nullif(btrim(m->>'name'), ''), nullif(split_part(coalesce(NEW.email, ''), '@', 1), ''),
                       'Usuario EnBus');
  v_tel := public._telefono_para_guardar(m->>'telefono');
  v_ced := public._cedula_para_guardar(m->>'cedula_rif');
  IF v_tel IS NULL OR EXISTS (SELECT 1 FROM public.profiles p
                               WHERE public.normalizar_telefono(p.telefono) = public.normalizar_telefono(v_tel)) THEN
    v_tel := 'PENDIENTE-' || NEW.id::text;
  END IF;
  IF v_ced IS NULL OR EXISTS (SELECT 1 FROM public.profiles p
                               WHERE public.normalizar_cedula(p.cedula_rif) = public.normalizar_cedula(v_ced)) THEN
    v_ced := 'PENDIENTE-' || NEW.id::text;
  END IF;
  INSERT INTO public.profiles (id, role, nombre_completo, telefono, cedula_rif)
  VALUES (NEW.id, 'user', v_nombre, v_tel, v_ced)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END $$;

-- ─── 3. Eliminar la cuenta (#50, Google Play) ───────────────────────────────
-- La RPC anonimiza el perfil (los boletos y encomiendas históricos se conservan para la
-- contabilidad de las cooperativas) y deja la solicitud en bajas_cuenta. La edge function
-- `eliminar-cuenta` borra después la identidad de Auth (borrado suave); si no está desplegada,
-- el super admin la completa con la consulta de los pasos manuales.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS eliminada_at timestamptz;

CREATE TABLE IF NOT EXISTS public.bajas_cuenta (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id        uuid NOT NULL UNIQUE,                 -- sin FK: el perfil se anonimiza, no se borra
  email             text,
  motivo            text,
  solicitada_at     timestamptz NOT NULL DEFAULT now(),
  auth_eliminada_at timestamptz
);
ALTER TABLE public.bajas_cuenta ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Super admin ve bajas" ON public.bajas_cuenta;
CREATE POLICY "Super admin ve bajas" ON public.bajas_cuenta FOR SELECT USING (public.is_super_admin());

-- El usuario no puede marcar ni desmarcar su baja con un UPDATE directo.
CREATE OR REPLACE FUNCTION public.proteger_perfil_fn()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF current_user IN ('authenticated', 'anon') AND NOT coalesce(public.is_super_admin(), false)
     AND (NEW.role, NEW.cooperativa_id, NEW.sucursal_id, NEW.eliminada_at)
         IS DISTINCT FROM (OLD.role, OLD.cooperativa_id, OLD.sucursal_id, OLD.eliminada_at) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'EB_SIN_PERMISO',
      HINT = 'No puedes cambiar tu rol, tu cooperativa, tu sucursal ni el estado de tu cuenta.';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.fn_eliminar_mi_cuenta(p_motivo text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_uid uuid := auth.uid(); v_rol public.rol_usuario; v_eliminada timestamptz;
  v_boletos integer; v_pagos integer; v_env integer; v_rec integer; v_reemb integer;
  v_partes text[] := '{}';
BEGIN
  IF v_uid IS NULL THEN
    PERFORM public._fallar('EB_NO_AUTENTICADO', 'Tu sesión expiró. Inicia sesión de nuevo.');
  END IF;
  SELECT role, eliminada_at INTO v_rol, v_eliminada FROM public.profiles WHERE id = v_uid FOR UPDATE;
  IF NOT FOUND THEN
    PERFORM public._fallar('EB_NO_ENCONTRADO', 'No encontramos tu cuenta.');
  END IF;
  IF v_eliminada IS NOT NULL THEN
    RETURN jsonb_build_object('eliminada_at', v_eliminada, 'ya_procesado', true);
  END IF;
  IF v_rol <> 'user' THEN
    PERFORM public._fallar('EB_SIN_PERMISO',
      'Las cuentas del personal de una cooperativa se dan de baja desde su panel. Pídeselo al administrador de tu cooperativa.');
  END IF;

  SELECT count(*) INTO v_boletos FROM public.boletos b JOIN public.viajes v ON v.id = b.viaje_id
   WHERE b.comprador_id = v_uid AND b.estado IN ('RESERVADO', 'PAGADO')
     AND v.estado IN ('PROGRAMADO', 'EN_CURSO');
  SELECT count(*) INTO v_pagos FROM public.pagos p
   WHERE p.pagador_id = v_uid AND NOT p.verificado AND p.rechazado_at IS NULL;
  SELECT count(*) INTO v_env FROM public.encomiendas e
   WHERE e.sender_id = v_uid AND e.estado NOT IN ('ENTREGADA', 'CANCELADA', 'DEVUELTA');
  SELECT count(*) INTO v_rec FROM public.encomiendas e
   WHERE e.receiver_user_id = v_uid AND e.estado NOT IN ('ENTREGADA', 'CANCELADA', 'DEVUELTA');
  SELECT count(*) INTO v_reemb FROM public.boletos b
   WHERE b.comprador_id = v_uid AND b.estado = 'CANCELADO'
     AND coalesce(b.monto_reembolso, 0) > 0 AND NOT b.reembolso_procesado;

  IF v_boletos > 0 THEN
    v_partes := v_partes || CASE WHEN v_boletos = 1 THEN '1 boleto por usar' ELSE v_boletos || ' boletos por usar' END;
  END IF;
  IF v_pagos > 0 THEN
    v_partes := v_partes || CASE WHEN v_pagos = 1 THEN '1 pago en verificación' ELSE v_pagos || ' pagos en verificación' END;
  END IF;
  IF v_env > 0 THEN
    v_partes := v_partes || CASE WHEN v_env = 1 THEN '1 encomienda enviada en camino' ELSE v_env || ' encomiendas enviadas en camino' END;
  END IF;
  IF v_rec > 0 THEN
    v_partes := v_partes || CASE WHEN v_rec = 1 THEN '1 encomienda por recibir' ELSE v_rec || ' encomiendas por recibir' END;
  END IF;
  IF v_reemb > 0 THEN
    v_partes := v_partes || CASE WHEN v_reemb = 1 THEN '1 reembolso pendiente' ELSE v_reemb || ' reembolsos pendientes' END;
  END IF;
  IF coalesce(array_length(v_partes, 1), 0) > 0 THEN
    PERFORM public._fallar('EB_CUENTA_CON_ACTIVIDAD',
      format('Antes de eliminar tu cuenta tienes que terminar: %s. Cuando terminen, podrás eliminarla.',
             array_to_string(v_partes, ', ')),
      jsonb_build_object('boletos', v_boletos, 'pagos', v_pagos, 'encomiendas_enviadas', v_env,
                         'encomiendas_por_recibir', v_rec, 'reembolsos', v_reemb));
  END IF;

  UPDATE public.profiles
     SET nombre_completo = 'Cuenta eliminada',
         telefono = 'PENDIENTE-BAJA-' || v_uid::text, cedula_rif = 'PENDIENTE-BAJA-' || v_uid::text,
         expo_push_token = NULL, notif_encomiendas = false, notif_boletos = false, notif_recordatorios = false,
         eliminada_at = now()
   WHERE id = v_uid;
  DELETE FROM public.notificaciones_usuario WHERE usuario_id = v_uid;
  DELETE FROM public.pending_notifications WHERE destinatario_id = v_uid AND NOT procesado;
  INSERT INTO public.bajas_cuenta (usuario_id, email, motivo)
  VALUES (v_uid, nullif(auth.jwt() ->> 'email', ''), nullif(left(btrim(coalesce(p_motivo, '')), 300), ''))
  ON CONFLICT (usuario_id) DO NOTHING;
  RETURN jsonb_build_object('eliminada_at', now());
END $$;

-- ─── 4. Logo de la cooperativa: su administrador lo cambia (pendiente fase 3) ─
-- El panel sube a "<cooperativa_id>/logo.<ext>" con upsert (INSERT + UPDATE).
DROP POLICY IF EXISTS "Admin de cooperativa sube su logo" ON storage.objects;
CREATE POLICY "Admin de cooperativa sube su logo" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'logos-cooperativas' AND public.user_role() = 'admin_cooperativa'
              AND (storage.foldername(name))[1] = public.user_cooperativa_id()::text);
DROP POLICY IF EXISTS "Admin de cooperativa reemplaza su logo" ON storage.objects;
CREATE POLICY "Admin de cooperativa reemplaza su logo" ON storage.objects FOR UPDATE
  USING (bucket_id = 'logos-cooperativas' AND public.user_role() = 'admin_cooperativa'
         AND (storage.foldername(name))[1] = public.user_cooperativa_id()::text)
  WITH CHECK (bucket_id = 'logos-cooperativas' AND public.user_role() = 'admin_cooperativa'
              AND (storage.foldername(name))[1] = public.user_cooperativa_id()::text);

-- ─── Permisos ────────────────────────────────────────────────────────────────
DO $$
DECLARE f record;
BEGIN
  FOR f IN SELECT p.oid::regprocedure AS sig FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public' AND p.proname LIKE '\_%' LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', f.sig);
  END LOOP;
  FOR f IN SELECT p.oid::regprocedure AS sig FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public' AND p.proname IN ('fn_consumir_limite', 'fn_limpiar_limites_uso') LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', f.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f.sig);
  END LOOP;
  FOR f IN SELECT p.oid::regprocedure AS sig FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public' AND p.proname = 'fn_eliminar_mi_cuenta' LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', f.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', f.sig);
  END LOOP;
END $$;

COMMIT;
