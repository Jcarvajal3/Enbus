-- Robustez · Integridad de datos y escrituras directas.
--   1. PIN de retiro: era UNIQUE en TODA la tabla con solo 10.000 valores posibles. Al llegar a
--      ~10.000 encomiendas con PIN (no se borra al entregar), generar_pin_retiro_fn entraba en un
--      bucle infinito y la recepción de paquetes se colgaba; antes, cada vez más reintentos.
--      El PIN se valida contra UNA encomienda (fn_validar_pin_retiro recibe el id): no necesita ser
--      único. Ahora se genera con aleatoriedad criptográfica y sin bucle.
--   2. tracking_id con la fecha de Venezuela (antes UTC: después de las 8 p. m. salía la de mañana).
--   3. CHECK de dinero, asientos y rangos (los datos actuales los cumplen).
--   4. viajes: el INSERT directo del panel se valida (ruta de la misma cooperativa y activa, salida
--      futura, asientos disponibles = totales, estado PROGRAMADO).
--   5. encomiendas, personal de la cooperativa por la API: solo puede marcar la llegada
--      (EN_TRANSITO → EN_OFICINA_DESTINO) y guardar la foto o el motivo de omitirla. Antes podía
--      cambiar costo, peso, modalidad o pasar POR_PAGAR → PAGADA sin pago.
--   6. encomiendas creadas desde la app: cooperativa ACTIVA con ruta activa a ese destino, datos del
--      destinatario válidos, foto en la carpeta del usuario y límite de frecuencia.
--   7. pagos: la referencia repetida se comprueba con un candado por (cooperativa, referencia):
--      dos pagos simultáneos con la misma referencia ya no pasan los dos.
--   8. calcular_calificacion_fn bloquea la cooperativa antes de recalcular (dos calificaciones a la
--      vez dejaban el promedio sin una de ellas).
--   9. handle_new_user no rompe el alta si dos registros simultáneos usan la misma cédula/teléfono.
--  10. Una sola alerta amarilla abierta por encomienda (índice único).
-- Re-ejecutable.
BEGIN;

-- ─── 1. PIN de retiro ────────────────────────────────────────────────────────
ALTER TABLE public.encomiendas DROP CONSTRAINT IF EXISTS encomiendas_pin_retiro_key;
DROP INDEX IF EXISTS public.encomiendas_pin_retiro_key;

CREATE OR REPLACE FUNCTION public.generar_pin_retiro_fn()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE b bytea;
BEGIN
  -- Solo al pasar a EN_RECEPCION por primera vez y sin PIN asignado.
  IF NEW.estado = 'EN_RECEPCION' AND OLD.estado IS DISTINCT FROM 'EN_RECEPCION' AND NEW.pin_retiro IS NULL THEN
    b := uuid_send(gen_random_uuid());          -- 16 bytes de pg_strong_random (los 4 primeros son aleatorios)
    NEW.pin_retiro := lpad((((get_byte(b, 0)::bigint << 24) | (get_byte(b, 1) << 16)
                             | (get_byte(b, 2) << 8) | get_byte(b, 3)) % 10000)::text, 4, '0');
  END IF;
  RETURN NEW;
END $$;

-- ─── 2. tracking_id con la fecha de Venezuela ────────────────────────────────
CREATE OR REPLACE FUNCTION public.generar_tracking_id_fn()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE v_fecha text := to_char(now() AT TIME ZONE 'America/Caracas', 'YYMMDD'); v_id text;
BEGIN
  LOOP
    v_id := 'EB-' || v_fecha || '-' || lpad(floor(random() * 100000)::int::text, 5, '0');
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.encomiendas WHERE tracking_id = v_id);
  END LOOP;
  NEW.tracking_id := v_id;
  RETURN NEW;
END $$;

-- ─── 3. CHECK ────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_encomiendas_pin_formato') THEN
    ALTER TABLE public.encomiendas ADD CONSTRAINT chk_encomiendas_pin_formato
      CHECK (pin_retiro IS NULL OR pin_retiro ~ '^[0-9]{4}$');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_encomiendas_montos') THEN
    ALTER TABLE public.encomiendas ADD CONSTRAINT chk_encomiendas_montos
      CHECK ((peso_kg IS NULL OR peso_kg > 0) AND (costo_calculado IS NULL OR costo_calculado >= 0)
             AND (valor_declarado IS NULL OR valor_declarado >= 0) AND intentos_pin >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_viajes_asientos') THEN
    ALTER TABLE public.viajes ADD CONSTRAINT chk_viajes_asientos
      CHECK (asientos_totales BETWEEN 1 AND 80 AND asientos_disponibles BETWEEN 0 AND asientos_totales);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_viajes_llegada') THEN
    ALTER TABLE public.viajes ADD CONSTRAINT chk_viajes_llegada CHECK (fecha_hora_llegada_est >= fecha_hora_salida);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_rutas_valores') THEN
    ALTER TABLE public.rutas ADD CONSTRAINT chk_rutas_valores
      CHECK (duracion_estimada_min > 0 AND (precio_pasaje IS NULL OR precio_pasaje >= 0));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_boletos_montos') THEN
    ALTER TABLE public.boletos ADD CONSTRAINT chk_boletos_montos
      CHECK (precio >= 0 AND (monto_reembolso IS NULL OR monto_reembolso BETWEEN 0 AND precio));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_pagos_monto_usd') THEN
    ALTER TABLE public.pagos ADD CONSTRAINT chk_pagos_monto_usd CHECK (monto >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_cooperativas_valores') THEN
    ALTER TABLE public.cooperativas ADD CONSTRAINT chk_cooperativas_valores
      CHECK (comision_porcentaje BETWEEN 0 AND 100 AND calificacion_promedio BETWEEN 0 AND 5
             AND total_calificaciones >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_comisiones_valores') THEN
    ALTER TABLE public.comisiones_ciclo ADD CONSTRAINT chk_comisiones_valores
      CHECK (periodo_fin >= periodo_inicio AND total_encomiendas >= 0 AND total_boletos >= 0
             AND monto_comision >= 0 AND comision_porcentaje BETWEEN 0 AND 100);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_tarifas_valores') THEN
    ALTER TABLE public.tarifas ADD CONSTRAINT chk_tarifas_valores
      CHECK (tarifa_por_kg > 0 AND factor_distancia_por_min >= 0 AND peso_max_kg > 0 AND dimensiones_max_cm > 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_calificaciones_comentario') THEN
    ALTER TABLE public.calificaciones ADD CONSTRAINT chk_calificaciones_comentario
      CHECK (comentario IS NULL OR char_length(comentario) <= 1000);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_incidencias_estado') THEN
    ALTER TABLE public.incidencias ADD CONSTRAINT chk_incidencias_estado
      CHECK (estado IN ('ABIERTA', 'EN_PROCESO', 'RESUELTA'));
  END IF;
END $$;
-- Era NOT VALID (20260719000001); los datos ya lo cumplen.
ALTER TABLE public.pagos VALIDATE CONSTRAINT chk_pagos_montos;

-- ─── 4. viajes: INSERT directo del panel ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.proteger_viajes_cliente_fn()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE v_coop uuid; v_activa boolean;
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') OR coalesce(public.is_super_admin(), false) THEN
    RETURN NEW;
  END IF;
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'EB_OPERACION_NO_PERMITIDA',
      HINT = 'Los viajes se editan, cierran o cancelan desde su pantalla.';
  END IF;
  SELECT r.cooperativa_id, r.activa INTO v_coop, v_activa FROM public.rutas r WHERE r.id = NEW.ruta_id;
  IF v_coop IS NULL OR v_coop IS DISTINCT FROM NEW.cooperativa_id THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'EB_SIN_RUTA',
      HINT = 'No encontramos la ruta en tu cooperativa. Actualiza la página y vuelve a elegirla.';
  END IF;
  IF NOT v_activa THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'EB_SIN_RUTA',
      HINT = 'Esa ruta está desactivada. Reactívala en Rutas o elige otra.';
  END IF;
  IF NEW.fecha_hora_salida <= now() THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'EB_DATOS_INVALIDOS',
      HINT = 'La salida tiene que ser más tarde que ahora.', DETAIL = '{"campo":"salida"}';
  END IF;
  NEW.estado := 'PROGRAMADO';
  NEW.asientos_disponibles := NEW.asientos_totales;
  RETURN NEW;
END $$;
-- (UPDATE y DELETE directos ya solo los permite la RLS al super admin.)
DROP TRIGGER IF EXISTS aa_proteger_viajes_cliente ON public.viajes;
CREATE TRIGGER aa_proteger_viajes_cliente BEFORE INSERT OR UPDATE ON public.viajes
  FOR EACH ROW EXECUTE FUNCTION public.proteger_viajes_cliente_fn();

-- ─── 5. encomiendas: escrituras directas del personal ────────────────────────
CREATE OR REPLACE FUNCTION public.proteger_encomiendas_staff_fn()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE c text[] := ARRAY['estado', 'foto_evidencia_url', 'foto_omitida_motivo', 'updated_at'];
BEGIN
  IF current_user NOT IN ('authenticated', 'anon')
     OR public.user_role() NOT IN ('taquillero', 'admin_cooperativa') THEN
    RETURN NEW;   -- RPC, cron y service role; el pasajero lo controla aa_proteger_encomiendas_cliente
  END IF;
  IF NEW.estado IS DISTINCT FROM OLD.estado
     AND NOT (OLD.estado = 'EN_TRANSITO' AND NEW.estado = 'EN_OFICINA_DESTINO') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'EB_OPERACION_NO_PERMITIDA',
      HINT = 'Ese cambio de estado se hace desde su pantalla (recepción, cobro, despacho o entrega).';
  END IF;
  IF (to_jsonb(NEW) - c) IS DISTINCT FROM (to_jsonb(OLD) - c) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'EB_OPERACION_NO_PERMITIDA',
      HINT = 'Esos datos de la encomienda solo se cambian desde su pantalla.';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS aa_proteger_encomiendas_staff ON public.encomiendas;
CREATE TRIGGER aa_proteger_encomiendas_staff BEFORE UPDATE ON public.encomiendas
  FOR EACH ROW EXECUTE FUNCTION public.proteger_encomiendas_staff_fn();

-- ─── 6. encomiendas creadas desde la app ─────────────────────────────────────
-- Corre después de aa_proteger_encomiendas_cliente (que ya saneó sender_id, estado, PIN…).
CREATE OR REPLACE FUNCTION public.validar_encomienda_app_fn()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE v_uid uuid := auth.uid(); v_dia integer; v_abiertas integer;
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') OR public.user_role() IS DISTINCT FROM 'user' THEN
    RETURN NEW;
  END IF;
  IF NEW.cooperativa_id IS NULL
     OR NOT EXISTS (SELECT 1 FROM public.cooperativas c WHERE c.id = NEW.cooperativa_id AND c.estado = 'ACTIVA') THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'EB_COOPERATIVA_NO_DISPONIBLE',
      HINT = 'Esta cooperativa no está recibiendo envíos en este momento. Elige otra.';
  END IF;
  IF NOT EXISTS (
       SELECT 1 FROM public.rutas r
        WHERE r.cooperativa_id = NEW.cooperativa_id AND r.activa
          AND public.normalizar_localidad(r.estado_origen)  = public.normalizar_localidad(NEW.estado_origen)
          AND public.normalizar_localidad(r.ciudad_origen)  = public.normalizar_localidad(NEW.ciudad_origen)
          AND public.normalizar_localidad(r.estado_destino) = public.normalizar_localidad(NEW.estado_destino)
          AND public.normalizar_localidad(r.ciudad_destino) = public.normalizar_localidad(NEW.ciudad_destino)) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'EB_SIN_RUTA',
      HINT = 'La cooperativa no tiene una ruta activa a ese destino. Elige otra.';
  END IF;
  IF length(btrim(coalesce(NEW.receiver_nombre, ''))) NOT BETWEEN 3 AND 120
     OR public.normalizar_cedula(NEW.receiver_cedula_rif) IS NULL
     OR public.normalizar_telefono(NEW.receiver_telefono) IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'EB_DATOS_INVALIDOS',
      HINT = 'Revisa el nombre, la cédula y el teléfono de quien recibe.', DETAIL = '{"campo":"destinatario"}';
  END IF;
  IF length(btrim(coalesce(NEW.descripcion_contenido, ''))) NOT BETWEEN 3 AND 500 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'EB_DATOS_INVALIDOS',
      HINT = 'Describe el contenido del paquete (hasta 500 caracteres).', DETAIL = '{"campo":"descripcion"}';
  END IF;
  IF NEW.foto_cliente_path IS NOT NULL AND NEW.foto_cliente_path NOT LIKE v_uid::text || '/%' THEN
    NEW.foto_cliente_path := NULL;   -- solo fotos de la carpeta propia
  END IF;
  SELECT count(*) FILTER (WHERE e.created_at > now() - interval '24 hours'),
         count(*) FILTER (WHERE e.estado = 'PENDIENTE_DE_ESCANEO')
    INTO v_dia, v_abiertas
    FROM public.encomiendas e
   WHERE e.sender_id = v_uid AND (e.created_at > now() - interval '24 hours' OR e.estado = 'PENDIENTE_DE_ESCANEO');
  IF v_dia >= 30 OR v_abiertas >= 15 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'EB_DEMASIADAS_ENCOMIENDAS',
      HINT = 'Tienes muchos envíos por llevar a la taquilla. Entrega o cancela algunos antes de registrar otro.';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS ab_validar_encomienda_app ON public.encomiendas;
CREATE TRIGGER ab_validar_encomienda_app BEFORE INSERT ON public.encomiendas
  FOR EACH ROW EXECUTE FUNCTION public.validar_encomienda_app_fn();

-- ─── 7. pagos: referencia repetida sin carreras ──────────────────────────────
-- Mismo criterio que las RPC (DIGITAL, no rechazado, misma cooperativa). Solo para los pagos que
-- reporta el cliente (pendientes); la taquilla registra pagos ya verificados.
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
                AND p.tipo_pago = 'DIGITAL' AND p.rechazado_at IS NULL AND p.id <> NEW.id) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'EB_REFERENCIA_REPETIDA',
      HINT = 'Esa referencia ya fue registrada en otro pago. Revisa el número de tu comprobante.',
      DETAIL = '{"campo":"referencia"}';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS aa_referencia_unica_pago ON public.pagos;
CREATE TRIGGER aa_referencia_unica_pago BEFORE INSERT ON public.pagos
  FOR EACH ROW EXECUTE FUNCTION public.pagos_referencia_unica_fn();

-- ─── 8. Calificación promedio sin carreras ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.calcular_calificacion_fn()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_coops uuid[];
BEGIN
  v_coops := CASE TG_OP WHEN 'INSERT' THEN ARRAY[NEW.cooperativa_id]
                        WHEN 'DELETE' THEN ARRAY[OLD.cooperativa_id]
                        ELSE ARRAY[OLD.cooperativa_id, NEW.cooperativa_id] END;
  -- Primero el candado: el recálculo (otra sentencia) ya ve las calificaciones confirmadas por
  -- quien tenía el candado.
  PERFORM 1 FROM public.cooperativas WHERE id = ANY (v_coops) ORDER BY id FOR UPDATE;
  UPDATE public.cooperativas c
     SET calificacion_promedio = coalesce((SELECT trunc(avg(k.estrellas), 1) FROM public.calificaciones k
                                            WHERE k.cooperativa_id = c.id), 0.0),
         total_calificaciones = (SELECT count(*) FROM public.calificaciones k WHERE k.cooperativa_id = c.id)
   WHERE c.id = ANY (v_coops);
  RETURN NULL;
END $$;

-- ─── 9. Alta de usuarios a prueba de registros simultáneos ───────────────────
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
  BEGIN
    INSERT INTO public.profiles (id, role, nombre_completo, telefono, cedula_rif)
    VALUES (NEW.id, 'user', v_nombre, v_tel, v_ced)
    ON CONFLICT (id) DO NOTHING;
  EXCEPTION WHEN unique_violation THEN
    -- Otro registro simultáneo tomó la cédula o el teléfono: la app los pide antes de comprar.
    INSERT INTO public.profiles (id, role, nombre_completo, telefono, cedula_rif)
    VALUES (NEW.id, 'user', v_nombre, 'PENDIENTE-' || NEW.id::text, 'PENDIENTE-' || NEW.id::text)
    ON CONFLICT (id) DO NOTHING;
  END;
  RETURN NEW;
END $$;

-- ─── 10. Una alerta amarilla abierta por encomienda ──────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS uq_incidencias_alerta_abierta
  ON public.incidencias (encomienda_id) WHERE tipo = 'ALERTA_AMARILLA' AND estado = 'ABIERTA';

-- Las funciones nuevas de trigger no son RPC.
REVOKE ALL ON FUNCTION public.generar_pin_retiro_fn() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.generar_tracking_id_fn() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.proteger_viajes_cliente_fn() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.proteger_encomiendas_staff_fn() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.validar_encomienda_app_fn() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pagos_referencia_unica_fn() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.calcular_calificacion_fn() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

COMMIT;
