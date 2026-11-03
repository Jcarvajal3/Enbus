-- Vínculo del destinatario (M-50) y RIF antiguos.
BEGIN;

CREATE INDEX IF NOT EXISTS idx_profiles_cedula_norm   ON public.profiles (public.normalizar_cedula(cedula_rif));
CREATE INDEX IF NOT EXISTS idx_profiles_telefono_norm ON public.profiles (public.normalizar_telefono(telefono));
CREATE INDEX IF NOT EXISTS idx_encomiendas_receiver_cedula_norm
  ON public.encomiendas (public.normalizar_cedula(receiver_cedula_rif));
CREATE INDEX IF NOT EXISTS idx_encomiendas_receiver_tel_norm
  ON public.encomiendas (public.normalizar_telefono(receiver_telefono));

-- Único usuario 'user' por cédula; si no hay, único por teléfono. Ambiguo => no se vincula.
CREATE OR REPLACE FUNCTION public._buscar_destinatario(p_cedula text, p_telefono text,
                                                       OUT o_user_id uuid, OUT o_via text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_ced text := public.normalizar_cedula(p_cedula); v_tel text := public.normalizar_telefono(p_telefono); v_ids uuid[];
BEGIN
  IF v_ced IS NOT NULL THEN
    SELECT array_agg(id) INTO v_ids FROM public.profiles
     WHERE role = 'user' AND public.normalizar_cedula(cedula_rif) = v_ced;
    IF cardinality(v_ids) = 1 THEN o_user_id := v_ids[1]; o_via := 'CEDULA'; RETURN;
    ELSIF cardinality(v_ids) > 1 THEN RETURN;
    END IF;
  END IF;
  IF v_tel IS NOT NULL THEN
    SELECT array_agg(id) INTO v_ids FROM public.profiles
     WHERE role = 'user' AND public.normalizar_telefono(telefono) = v_tel;
    IF cardinality(v_ids) = 1 THEN o_user_id := v_ids[1]; o_via := 'TELEFONO'; END IF;
  END IF;
END $$;

-- Al crear la encomienda o cambiar los datos del destinatario. El cliente nunca decide el vínculo.
CREATE OR REPLACE FUNCTION public.vincular_destinatario_encomienda_fn()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_id uuid; v_via text;
BEGIN
  SELECT o_user_id, o_via INTO v_id, v_via FROM public._buscar_destinatario(NEW.receiver_cedula_rif, NEW.receiver_telefono);
  NEW.receiver_user_id := v_id;
  NEW.receiver_vinculado_por := v_via;
  NEW.receiver_vinculado_at := CASE WHEN v_id IS NOT NULL THEN now() END;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS vincular_destinatario_encomienda ON public.encomiendas;
CREATE TRIGGER vincular_destinatario_encomienda
  BEFORE INSERT OR UPDATE OF receiver_cedula_rif, receiver_telefono ON public.encomiendas
  FOR EACH ROW EXECUTE FUNCTION public.vincular_destinatario_encomienda_fn();

-- Al registrarse un usuario o cambiar su cédula/teléfono. Nunca rompe el alta (corre dentro de handle_new_user).
CREATE OR REPLACE FUNCTION public.vincular_encomiendas_de_perfil_fn()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.role <> 'user' THEN RETURN NULL; END IF;
  IF TG_OP = 'UPDATE' THEN   -- soltar vínculos que dejaron de coincidir
    UPDATE public.encomiendas e
       SET receiver_user_id = NULL, receiver_vinculado_por = NULL, receiver_vinculado_at = NULL
     WHERE e.receiver_user_id = NEW.id
       AND e.estado NOT IN ('ENTREGADA', 'CANCELADA', 'DEVUELTA')
       AND NOT coalesce(
             (e.receiver_vinculado_por = 'CEDULA'
                AND public.normalizar_cedula(e.receiver_cedula_rif) = public.normalizar_cedula(NEW.cedula_rif))
          OR (e.receiver_vinculado_por = 'TELEFONO'
                AND public.normalizar_telefono(e.receiver_telefono) = public.normalizar_telefono(NEW.telefono)), false);
  END IF;
  UPDATE public.encomiendas e
     SET receiver_user_id = c.o_user_id, receiver_vinculado_por = c.o_via, receiver_vinculado_at = now()
    FROM (SELECT x.id, b.o_user_id, b.o_via
            FROM public.encomiendas x
           CROSS JOIN LATERAL public._buscar_destinatario(x.receiver_cedula_rif, x.receiver_telefono) b
           WHERE x.receiver_user_id IS NULL AND x.estado NOT IN ('ENTREGADA', 'CANCELADA', 'DEVUELTA')
             AND (public.normalizar_cedula(x.receiver_cedula_rif) = public.normalizar_cedula(NEW.cedula_rif)
               OR public.normalizar_telefono(x.receiver_telefono) = public.normalizar_telefono(NEW.telefono))) c
   WHERE e.id = c.id AND c.o_user_id = NEW.id;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'vincular_encomiendas_de_perfil (%): %', NEW.id, SQLERRM;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS vincular_encomiendas_de_perfil ON public.profiles;
CREATE TRIGGER vincular_encomiendas_de_perfil
  AFTER INSERT OR UPDATE OF cedula_rif, telefono, role ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.vincular_encomiendas_de_perfil_fn();

-- Backfill (antes del trigger de aviso, para no notificar historia). No mueve updated_at (migración 01).
UPDATE public.encomiendas e
   SET receiver_user_id = c.o_user_id, receiver_vinculado_por = c.o_via, receiver_vinculado_at = now()
  FROM (SELECT x.id, b.o_user_id, b.o_via
          FROM public.encomiendas x
         CROSS JOIN LATERAL public._buscar_destinatario(x.receiver_cedula_rif, x.receiver_telefono) b
         WHERE x.receiver_user_id IS NULL AND b.o_user_id IS NOT NULL) c
 WHERE e.id = c.id;

CREATE OR REPLACE FUNCTION public.avisar_destinatario_vinculado_fn()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_remitente text;
BEGIN
  IF NEW.receiver_user_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.receiver_user_id IS DISTINCT FROM OLD.receiver_user_id)
     AND NEW.receiver_user_id <> NEW.sender_id
     AND NEW.estado NOT IN ('ENTREGADA', 'CANCELADA', 'DEVUELTA') THEN
    SELECT split_part(nombre_completo, ' ', 1) INTO v_remitente FROM public.profiles WHERE id = NEW.sender_id;
    PERFORM public._notificar_usuario(NEW.receiver_user_id, 'ENCOMIENDA_PARA_TI', 'Te enviaron un paquete',
      format('%s te envió la encomienda %s a %s. Síguela en Encomiendas > Para mí.',
             coalesce(v_remitente, 'Alguien'), NEW.tracking_id, NEW.ciudad_destino),
      'encomienda', NEW.id);
  END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS avisar_destinatario_vinculado ON public.encomiendas;
CREATE TRIGGER avisar_destinatario_vinculado
  AFTER INSERT OR UPDATE OF receiver_user_id ON public.encomiendas
  FOR EACH ROW EXECUTE FUNCTION public.avisar_destinatario_vinculado_fn();

-- El destinatario no puede leer profiles del remitente (RLS): nombre y teléfono enmascarado.
CREATE OR REPLACE FUNCTION public.fn_remitente_de_encomienda(p_encomienda_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_nombre text; v_tel text;
BEGIN
  SELECT pr.nombre_completo, pr.telefono INTO v_nombre, v_tel
    FROM public.encomiendas e JOIN public.profiles pr ON pr.id = e.sender_id
   WHERE e.id = p_encomienda_id AND auth.uid() IN (e.sender_id, e.receiver_user_id);
  IF v_nombre IS NULL THEN RETURN NULL; END IF;
  v_tel := regexp_replace(coalesce(v_tel, ''), '[^0-9]', '', 'g');   -- "0414-123.45.67" -> "04141234567"
  RETURN jsonb_build_object('nombre', v_nombre,
    'telefono', CASE WHEN length(v_tel) > 4 THEN repeat('•', length(v_tel) - 4) || right(v_tel, 4)
                     ELSE nullif(v_tel, '') END);
END $$;

-- RIF antiguos: solo se reformatean los que ya tienen 9 dígitos (no se inventa el verificador).
WITH norm AS (
  SELECT c.id, regexp_replace(upper(c.rif), '[^A-Z0-9]', '', 'g') AS limpio FROM public.cooperativas c
), destino AS (
  SELECT id, left(limpio, 1) || '-' || substr(limpio, 2, 8) || '-' || right(limpio, 1) AS rif_nuevo
    FROM norm WHERE limpio ~ '^[JGVEPC][0-9]{9}$'
)
UPDATE public.cooperativas c SET rif = d.rif_nuevo
  FROM destino d
 WHERE c.id = d.id AND c.rif <> d.rif_nuevo
   AND NOT EXISTS (SELECT 1 FROM public.cooperativas o WHERE o.rif = d.rif_nuevo AND o.id <> c.id)
   -- Dos cooperativas con el mismo RIF escrito distinto: no se tocan (UNIQUE abortaría la migración).
   AND NOT EXISTS (SELECT 1 FROM destino d2 WHERE d2.rif_nuevo = d.rif_nuevo AND d2.id <> d.id);
-- Pendientes de revisión en Admin:  SELECT id, nombre, rif FROM cooperativas WHERE rif !~ '^[JGVEPC]-[0-9]{8}-[0-9]$';

DO $$
DECLARE f record;
BEGIN
  FOR f IN SELECT p.oid::regprocedure AS sig FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public' AND p.proname LIKE '\_%' LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', f.sig);
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.fn_remitente_de_encomienda(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_remitente_de_encomienda(uuid) TO authenticated;

COMMIT;
