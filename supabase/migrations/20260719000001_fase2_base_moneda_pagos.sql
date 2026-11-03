-- Fase 2 · Base: utilidades, tasa BCV, columnas de dinero, compra/pago en boletos,
-- profiles.sucursal_id, protección de escrituras directas. Compatible con los clientes actuales.
BEGIN;

-- ─── 1. Utilidades ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._fallar(p_codigo text, p_mensaje text, p_detalle jsonb DEFAULT NULL)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = p_codigo, HINT = p_mensaje,
                        DETAIL = coalesce(p_detalle::text, '{}');
END $$;

-- Igual que normalizeForDb() de las edge functions (rutas guardan "puerto_la_cruz").
CREATE OR REPLACE FUNCTION public.normalizar_localidad(p text)
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT CASE
           WHEN p IS NULL OR btrim(p) = '' THEN NULL
           WHEN x.s = 'san fernando de apure' THEN 'san_fernando'
           WHEN x.s = 'san juan de los morros' THEN 'san_juan'
           ELSE replace(x.s, ' ', '_')
         END
    FROM (SELECT btrim(regexp_replace(
                   lower(translate(btrim(coalesce(p, '')), 'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNaeiouun')),
                   '[_[:space:]]+', ' ', 'g')) AS s) x;
$$;

-- "V-12.345.678", "v12345678", "12345678" -> "V12345678". NULL si no es usable (incluye 'PENDIENTE…').
CREATE OR REPLACE FUNCTION public.normalizar_cedula(p text)
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT CASE
           WHEN x.v LIKE 'PENDIENTE%' THEN NULL
           WHEN x.v ~ '^[VEJGPC]?[0-9]+$' AND length(ltrim(regexp_replace(x.v, '[^0-9]', '', 'g'), '0')) BETWEEN 5 AND 10
             THEN CASE WHEN left(x.v, 1) ~ '[VEJGPC]' THEN left(x.v, 1) ELSE 'V' END
                  || ltrim(regexp_replace(x.v, '[^0-9]', '', 'g'), '0')
         END
    FROM (SELECT regexp_replace(upper(coalesce(p, '')), '[^A-Z0-9]', '', 'g') AS v) x;
$$;

-- "0414-123.45.67", "+58 414 1234567", "4141234567" -> "4141234567". NULL si no es válido.
CREATE OR REPLACE FUNCTION public.normalizar_telefono(p text)
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT CASE WHEN n.v ~ '^[24][0-9]{9}$' THEN n.v END
    FROM (SELECT CASE
                   WHEN upper(coalesce(p, '')) LIKE 'PENDIENTE%' THEN ''
                   WHEN length(d.v) = 12 AND left(d.v, 2) = '58' THEN substr(d.v, 3)
                   WHEN length(d.v) = 11 AND left(d.v, 1) = '0'  THEN substr(d.v, 2)
                   ELSE d.v
                 END AS v
            FROM (SELECT regexp_replace(coalesce(p, ''), '[^0-9]', '', 'g') AS v) d) n;
$$;

-- ─── 2. Tasa BCV ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tasas_bcv (
  fecha          date PRIMARY KEY,
  tasa           numeric(14,4) NOT NULL CHECK (tasa > 0),
  fuente         text NOT NULL DEFAULT 'dolarapi' CHECK (fuente IN ('dolarapi', 'manual')),
  motivo         text,
  registrada_por uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.tasas_bcv IS 'Tasa oficial BCV (Bs por 1 USD) por día de vigencia. Fuente única de app, panel, landing y RPC.';
ALTER TABLE public.tasas_bcv ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Lectura publica tasas BCV" ON public.tasas_bcv;
CREATE POLICY "Lectura publica tasas BCV" ON public.tasas_bcv FOR SELECT USING (true);

CREATE OR REPLACE FUNCTION public.fn_tasa_bcv_vigente()
RETURNS TABLE (tasa numeric, fecha date, fuente text, dias_antiguedad integer, actualizada_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT t.tasa, t.fecha, t.fuente,
         ((now() AT TIME ZONE 'America/Caracas')::date - t.fecha)::integer,
         t.updated_at
    FROM public.tasas_bcv t
   WHERE t.fecha <= (now() AT TIME ZONE 'America/Caracas')::date
   ORDER BY t.fecha DESC
   LIMIT 1;
$$;

-- Tasa para cobrar: falla si no hay o tiene más de 4 días.
CREATE OR REPLACE FUNCTION public._tasa_para_cobro(OUT o_tasa numeric, OUT o_fecha date)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_hoy date := (now() AT TIME ZONE 'America/Caracas')::date;
BEGIN
  SELECT t.tasa, t.fecha INTO o_tasa, o_fecha
    FROM public.tasas_bcv t WHERE t.fecha <= v_hoy ORDER BY t.fecha DESC LIMIT 1;
  IF o_tasa IS NULL OR v_hoy - o_fecha > 4 THEN
    PERFORM public._fallar('EB_TASA_NO_DISPONIBLE',
      'No tenemos la tasa BCV de hoy. Intenta de nuevo en unos minutos.',
      jsonb_build_object('ultima_fecha', o_fecha));
  END IF;
END $$;

-- Solo service_role (edge function actualizar-tasa-bcv). La tasa manual no se pisa.
CREATE OR REPLACE FUNCTION public.fn_guardar_tasa_bcv(p_fecha date, p_tasa numeric)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_anterior numeric; v_guardada numeric;
BEGIN
  IF p_fecha IS NULL OR p_tasa IS NULL OR p_tasa <= 0
     OR p_fecha > (now() AT TIME ZONE 'America/Caracas')::date + 7 THEN
    PERFORM public._fallar('EB_TASA_INVALIDA', 'Tasa inválida.');
  END IF;
  SELECT t.tasa INTO v_anterior FROM public.tasas_bcv t WHERE t.fecha < p_fecha ORDER BY t.fecha DESC LIMIT 1;
  IF v_anterior IS NOT NULL AND abs(p_tasa - v_anterior) / v_anterior > 0.25 THEN
    PERFORM public._fallar('EB_TASA_SOSPECHOSA',
      'La tasa nueva difiere más de 25 % de la anterior. Cárgala a mano si es correcta.',
      jsonb_build_object('anterior', v_anterior, 'nueva', p_tasa));
  END IF;
  INSERT INTO public.tasas_bcv AS t (fecha, tasa, fuente)
  VALUES (p_fecha, round(p_tasa, 4), 'dolarapi')
  ON CONFLICT (fecha) DO UPDATE
     SET tasa = EXCLUDED.tasa, updated_at = now()
   WHERE t.fuente <> 'manual';
  -- Devuelve la tasa que quedó guardada (si ese día hay una manual, la manual).
  SELECT t.tasa INTO v_guardada FROM public.tasas_bcv t WHERE t.fecha = p_fecha;
  RETURN jsonb_build_object('fecha', p_fecha, 'tasa', v_guardada);
END $$;

CREATE OR REPLACE FUNCTION public.fn_registrar_tasa_bcv_manual(p_fecha date, p_tasa numeric, p_motivo text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT coalesce(public.is_super_admin(), false) THEN
    PERFORM public._fallar('EB_SIN_PERMISO', 'Solo el super administrador puede cargar la tasa BCV.');
  END IF;
  IF p_fecha IS NULL OR p_tasa IS NULL OR p_tasa <= 0
     OR p_fecha > (now() AT TIME ZONE 'America/Caracas')::date + 1 THEN
    PERFORM public._fallar('EB_TASA_INVALIDA', 'Revisa la fecha y la tasa.', '{"campo":"tasa"}');
  END IF;
  IF length(btrim(coalesce(p_motivo, ''))) < 5 THEN
    PERFORM public._fallar('EB_MOTIVO_REQUERIDO', 'Escribe por qué cargas la tasa a mano.', '{"campo":"motivo"}');
  END IF;
  INSERT INTO public.tasas_bcv AS t (fecha, tasa, fuente, motivo, registrada_por)
  VALUES (p_fecha, round(p_tasa, 4), 'manual', btrim(p_motivo), auth.uid())
  ON CONFLICT (fecha) DO UPDATE
     SET tasa = EXCLUDED.tasa, fuente = 'manual', motivo = EXCLUDED.motivo,
         registrada_por = EXCLUDED.registrada_por, updated_at = now();
  RETURN jsonb_build_object('fecha', p_fecha, 'tasa', round(p_tasa, 4));
END $$;

-- Cron cada 30 min → edge function actualizar-tasa-bcv (mismo patrón vault que 20260414000013).
DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'actualizar_tasa_bcv') THEN
    PERFORM cron.unschedule('actualizar_tasa_bcv');
  END IF;
  PERFORM cron.schedule('actualizar_tasa_bcv', '*/30 * * * *', $job$
    DO $blk$
    DECLARE v_key text; v_url text;
    BEGIN
      SELECT decrypted_secret INTO v_key FROM vault.decrypted_secrets WHERE name = 'service_role_key';
      SELECT decrypted_secret INTO v_url FROM vault.decrypted_secrets WHERE name = 'project_url';
      PERFORM net.http_post(
        url := COALESCE(v_url, 'https://FALTA_URL_EN_VAULT.supabase.co') || '/functions/v1/actualizar-tasa-bcv',
        headers := jsonb_build_object('Content-Type', 'application/json',
                                      'Authorization', 'Bearer ' || COALESCE(v_key, 'FALTA_SERVICE_KEY_EN_VAULT')),
        body := '{}'::jsonb);
    END $blk$;
  $job$);
END $do$;

-- ─── 3. pagos: Bs, tasa, moneda, declarado, rechazo, idempotencia ────────────
ALTER TABLE public.pagos
  ADD COLUMN IF NOT EXISTS monto_bs        numeric(16,2),
  ADD COLUMN IF NOT EXISTS tasa_bcv        numeric(14,4),
  ADD COLUMN IF NOT EXISTS tasa_bcv_fecha  date,
  ADD COLUMN IF NOT EXISTS moneda          text,
  ADD COLUMN IF NOT EXISTS monto_declarado numeric(16,2),
  ADD COLUMN IF NOT EXISTS rechazado_at    timestamptz,
  ADD COLUMN IF NOT EXISTS rechazado_por   uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS motivo_rechazo  text,
  ADD COLUMN IF NOT EXISTS idempotency_key text;

COMMENT ON COLUMN public.pagos.monto IS 'USD de referencia esperado (base de comisiones y balances).';
COMMENT ON COLUMN public.pagos.monto_bs IS 'Bs esperados = monto × tasa_bcv. NULL en pagos anteriores a la fase 2.';
COMMENT ON COLUMN public.pagos.moneda IS 'Moneda en la que pagó el cliente: VES o USD (Zelle / efectivo USD).';
COMMENT ON COLUMN public.pagos.monto_declarado IS 'Lo que el cliente dice que pagó (o lo recibido en taquilla), en "moneda".';

-- Pagos EFECTIVO "por verificar" creados por la app: nadie los concilia. Se anulan.
UPDATE public.pagos
   SET rechazado_at = now(),
       motivo_rechazo = 'Pago en efectivo anunciado desde la app y no registrado en taquilla (limpieza fase 2).'
 WHERE tipo_pago = 'EFECTIVO' AND NOT verificado AND rechazado_at IS NULL;

UPDATE public.pagos p
   SET moneda = CASE WHEN p.banco_emisor ILIKE 'zelle'
                       OR EXISTS (SELECT 1 FROM public.metodos_pago_cooperativa m
                                   WHERE m.id = p.metodo_pago_id AND m.tipo = 'ZELLE')
                     THEN 'USD' ELSE 'VES' END
 WHERE p.moneda IS NULL;
ALTER TABLE public.pagos ALTER COLUMN moneda SET DEFAULT 'VES';
ALTER TABLE public.pagos ALTER COLUMN moneda SET NOT NULL;

ALTER TABLE public.pagos
  ADD COLUMN IF NOT EXISTS estado_verificacion text
  GENERATED ALWAYS AS (CASE WHEN verificado THEN 'APROBADO'
                            WHEN rechazado_at IS NOT NULL THEN 'RECHAZADO'
                            ELSE 'PENDIENTE' END) STORED;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_pagos_resuelto_una_vez') THEN
    ALTER TABLE public.pagos ADD CONSTRAINT chk_pagos_resuelto_una_vez
      CHECK (NOT (verificado AND rechazado_at IS NOT NULL));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_pagos_moneda') THEN
    ALTER TABLE public.pagos ADD CONSTRAINT chk_pagos_moneda CHECK (moneda IN ('VES', 'USD'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_pagos_montos') THEN
    ALTER TABLE public.pagos ADD CONSTRAINT chk_pagos_montos CHECK (
      (monto_bs IS NULL OR monto_bs >= 0) AND (tasa_bcv IS NULL OR tasa_bcv > 0)
      AND (monto_declarado IS NULL OR monto_declarado >= 0)) NOT VALID;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_pagos_idempotencia
  ON public.pagos (pagador_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pagos_por_verificar
  ON public.pagos (cooperativa_id, created_at)
  WHERE NOT verificado AND rechazado_at IS NULL AND tipo_pago = 'DIGITAL';
CREATE INDEX IF NOT EXISTS idx_pagos_referencia
  ON public.pagos (cooperativa_id, numero_referencia) WHERE numero_referencia IS NOT NULL;

-- Un pendiente y un aprobado por encomienda (solo si los datos actuales lo permiten).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'uq_pagos_encomienda_pendiente') THEN
    IF EXISTS (SELECT 1 FROM public.pagos
                WHERE encomienda_id IS NOT NULL AND NOT verificado AND rechazado_at IS NULL
                GROUP BY encomienda_id HAVING count(*) > 1) THEN
      RAISE NOTICE 'uq_pagos_encomienda_pendiente NO creado: hay encomiendas con más de un pago pendiente. Recházalos y re-ejecuta.';
    ELSE
      CREATE UNIQUE INDEX uq_pagos_encomienda_pendiente ON public.pagos (encomienda_id)
        WHERE encomienda_id IS NOT NULL AND NOT verificado AND rechazado_at IS NULL;
    END IF;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'uq_pagos_encomienda_aprobado') THEN
    IF EXISTS (SELECT 1 FROM public.pagos WHERE encomienda_id IS NOT NULL AND verificado
                GROUP BY encomienda_id HAVING count(*) > 1) THEN
      RAISE NOTICE 'uq_pagos_encomienda_aprobado NO creado: hay encomiendas cobradas dos veces (revisar reembolso).';
    ELSE
      CREATE UNIQUE INDEX uq_pagos_encomienda_aprobado ON public.pagos (encomienda_id)
        WHERE encomienda_id IS NOT NULL AND verificado;
    END IF;
  END IF;
END $$;

-- INSERT de pagos: cliente solo DIGITAL pendiente propio; personal solo de su cooperativa.
DROP POLICY IF EXISTS "Cualquier usuario inserta pago" ON public.pagos;
DROP POLICY IF EXISTS "Pagador inserta pago digital pendiente" ON public.pagos;
CREATE POLICY "Pagador inserta pago digital pendiente" ON public.pagos FOR INSERT
  WITH CHECK (pagador_id = auth.uid() AND public.user_role() = 'user' AND tipo_pago = 'DIGITAL'
              AND verificado = false AND verificado_por IS NULL AND rechazado_at IS NULL);
DROP POLICY IF EXISTS "Personal registra pagos de su cooperativa" ON public.pagos;
CREATE POLICY "Personal registra pagos de su cooperativa" ON public.pagos FOR INSERT
  WITH CHECK (public.user_role() IN ('taquillero', 'admin_cooperativa')
              AND cooperativa_id = public.user_cooperativa_id() AND pagador_id = auth.uid());

-- ─── 4. boletos: compra, pago que los cubre, embarque ───────────────────────
ALTER TABLE public.boletos
  ADD COLUMN IF NOT EXISTS compra_id     uuid,
  ADD COLUMN IF NOT EXISTS pago_id       uuid,
  ADD COLUMN IF NOT EXISTS embarcado_at  timestamptz,
  ADD COLUMN IF NOT EXISTS embarcado_por uuid REFERENCES public.profiles(id);
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'boletos_pago_id_fkey') THEN
    ALTER TABLE public.boletos ADD CONSTRAINT boletos_pago_id_fkey
      FOREIGN KEY (pago_id) REFERENCES public.pagos(id);
  END IF;
END $$;
COMMENT ON COLUMN public.boletos.precio IS 'USD de referencia (rutas.precio_pasaje al reservar).';
COMMENT ON COLUMN public.boletos.monto_reembolso IS 'USD de referencia; se paga en Bs a la tasa BCV del día del reembolso.';

-- compra_id: los boletos de una compra de la app se insertaron en un solo INSERT (mismo created_at).
WITH g AS (
  SELECT comprador_id, viaje_id, created_at, gen_random_uuid() AS cid
    FROM public.boletos
   WHERE compra_id IS NULL AND comprador_id IS NOT NULL
   GROUP BY comprador_id, viaje_id, created_at
)
UPDATE public.boletos b SET compra_id = g.cid
  FROM g
 WHERE b.compra_id IS NULL AND b.comprador_id = g.comprador_id
   AND b.viaje_id = g.viaje_id AND b.created_at = g.created_at;
UPDATE public.boletos SET compra_id = id WHERE compra_id IS NULL;
ALTER TABLE public.boletos ALTER COLUMN compra_id SET DEFAULT gen_random_uuid();
ALTER TABLE public.boletos ALTER COLUMN compra_id SET NOT NULL;

-- pago_id: el pago que ya apuntaba al boleto (aprobado > pendiente > rechazado, el más reciente).
UPDATE public.boletos b SET pago_id = x.id
  FROM (SELECT DISTINCT ON (p.boleto_id) p.boleto_id, p.id
          FROM public.pagos p
         WHERE p.boleto_id IS NOT NULL
         ORDER BY p.boleto_id,
                  CASE p.estado_verificacion WHEN 'APROBADO' THEN 0 WHEN 'PENDIENTE' THEN 1 ELSE 2 END,
                  p.created_at DESC) x
 WHERE b.id = x.boleto_id AND b.pago_id IS NULL;
-- Hermanos de la misma compra.
UPDATE public.boletos h SET pago_id = a.pago_id
  FROM public.boletos a
 WHERE a.compra_id = h.compra_id AND a.pago_id IS NOT NULL AND h.pago_id IS NULL AND h.id <> a.id;
-- Con pago digital pendiente la reserva deja de vencer.
UPDATE public.boletos b SET reserva_expira_at = NULL
  FROM public.pagos p
 WHERE p.id = b.pago_id AND b.estado = 'RESERVADO' AND b.reserva_expira_at IS NOT NULL
   AND p.tipo_pago = 'DIGITAL' AND p.estado_verificacion = 'PENDIENTE';

CREATE INDEX IF NOT EXISTS idx_boletos_compra_id ON public.boletos (compra_id);
CREATE INDEX IF NOT EXISTS idx_boletos_pago_id   ON public.boletos (pago_id);

-- ─── 5. profiles.sucursal_id (pendiente fase 1) ─────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS sucursal_id uuid REFERENCES public.sucursales(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_profiles_sucursal_id ON public.profiles (sucursal_id);
UPDATE public.profiles p
   SET sucursal_id = x.sucursal_id
  FROM (SELECT DISTINCT ON (lower(i.email)) lower(i.email) AS email, i.sucursal_id, i.cooperativa_id
          FROM public.invitaciones i
         WHERE i.usado AND i.sucursal_id IS NOT NULL
         ORDER BY lower(i.email), i.created_at DESC) x
  JOIN auth.users u ON lower(u.email) = x.email
  JOIN public.sucursales s ON s.id = x.sucursal_id AND s.cooperativa_id = x.cooperativa_id
 WHERE p.id = u.id AND p.cooperativa_id = x.cooperativa_id AND p.sucursal_id IS NULL;

-- ─── 6. encomiendas: rastro del vínculo + updated_at estable ────────────────
ALTER TABLE public.encomiendas
  ADD COLUMN IF NOT EXISTS receiver_vinculado_por text,
  ADD COLUMN IF NOT EXISTS receiver_vinculado_at  timestamptz;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_encomiendas_vinculo') THEN
    ALTER TABLE public.encomiendas ADD CONSTRAINT chk_encomiendas_vinculo
      CHECK (receiver_vinculado_por IS NULL OR receiver_vinculado_por IN ('CEDULA', 'TELEFONO'));
  END IF;
END $$;
COMMENT ON COLUMN public.encomiendas.costo_calculado IS 'USD de referencia (tarifas en USD). Se cobra en Bs a la tasa BCV.';

-- updated_at no se mueve por cambios automáticos (auto_devolver_encomienda y "tiempo en oficina" dependen de él).
CREATE OR REPLACE FUNCTION public.encomiendas_updated_at_fn()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE c text[] := ARRAY['receiver_user_id','receiver_vinculado_por','receiver_vinculado_at',
                          'sucursal_origen_id','sucursal_destino_id','updated_at'];
BEGIN
  IF (to_jsonb(NEW) - c) IS DISTINCT FROM (to_jsonb(OLD) - c) THEN
    NEW.updated_at := now();
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS set_encomiendas_updated_at ON public.encomiendas;
CREATE TRIGGER set_encomiendas_updated_at BEFORE UPDATE ON public.encomiendas
  FOR EACH ROW EXECUTE FUNCTION public.encomiendas_updated_at_fn();

-- ─── 7. Contexto del llamador y notificaciones ──────────────────────────────
CREATE OR REPLACE FUNCTION public._uid_usuario()
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_uid uuid := auth.uid(); v_rol public.rol_usuario;
BEGIN
  IF v_uid IS NULL THEN
    PERFORM public._fallar('EB_NO_AUTENTICADO', 'Tu sesión expiró. Inicia sesión de nuevo.');
  END IF;
  SELECT role INTO v_rol FROM public.profiles WHERE id = v_uid;
  IF v_rol IS DISTINCT FROM 'user' THEN
    PERFORM public._fallar('EB_SIN_PERMISO', 'Esta operación se hace con una cuenta de pasajero.');
  END IF;
  RETURN v_uid;
END $$;

CREATE OR REPLACE FUNCTION public._contexto_staff(
  OUT o_uid uuid, OUT o_rol public.rol_usuario, OUT o_cooperativa_id uuid, OUT o_sucursal_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  o_uid := auth.uid();
  IF o_uid IS NULL THEN
    PERFORM public._fallar('EB_NO_AUTENTICADO', 'Tu sesión expiró. Inicia sesión de nuevo.');
  END IF;
  SELECT p.role, p.cooperativa_id, p.sucursal_id INTO o_rol, o_cooperativa_id, o_sucursal_id
    FROM public.profiles p WHERE p.id = o_uid;
  IF o_rol IS NULL OR o_rol NOT IN ('taquillero', 'admin_cooperativa') OR o_cooperativa_id IS NULL THEN
    PERFORM public._fallar('EB_SIN_PERMISO',
      'Tu usuario no puede hacer esta operación. Avísale al administrador de tu cooperativa.');
  END IF;
END $$;

-- Bandeja in-app garantizada (misma transacción) + push encolado (sin duplicar la bandeja).
CREATE OR REPLACE FUNCTION public._notificar_usuario(p_usuario uuid, p_tipo text, p_titulo text,
                                                     p_mensaje text, p_recurso_tipo text, p_recurso_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF p_usuario IS NULL
     OR (SELECT role FROM public.profiles WHERE id = p_usuario) IS DISTINCT FROM 'user' THEN
    RETURN;
  END IF;
  INSERT INTO public.notificaciones_usuario (usuario_id, titulo, mensaje, recurso_tipo, recurso_id)
  VALUES (p_usuario, p_titulo, p_mensaje, p_recurso_tipo, p_recurso_id);
  INSERT INTO public.pending_notifications (destinatario_id, recurso_tipo, recurso_id, tipo_notificacion, payload)
  VALUES (p_usuario, p_recurso_tipo, p_recurso_id, p_tipo,
          jsonb_build_object('titulo', p_titulo, 'mensaje', p_mensaje, 'sin_bandeja', true));
END $$;

-- ─── 8. Protección de escrituras directas (clientes de la API) ──────────────
-- Prefijo "aa_" para correr antes que los demás BEFORE triggers (orden alfabético).
CREATE OR REPLACE FUNCTION public.proteger_boletos_cliente_fn()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_precio numeric; v_estado public.estado_viaje; v_salida timestamptz; v_coop uuid;
  c text[] := ARRAY['estado','motivo_cancelacion','monto_reembolso','updated_at'];
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') OR public.user_role() IS DISTINCT FROM 'user' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN   -- app antigua: se sanea todo lo que decide el servidor
    SELECT r.precio_pasaje, v.estado, v.fecha_hora_salida, v.cooperativa_id
      INTO v_precio, v_estado, v_salida, v_coop
      FROM public.viajes v JOIN public.rutas r ON r.id = v.ruta_id
     WHERE v.id = NEW.viaje_id;
    IF v_precio IS NULL OR v_precio <= 0 OR v_estado <> 'PROGRAMADO' OR v_salida <= now() THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'EB_VIAJE_NO_DISPONIBLE',
        HINT = 'Esta salida ya no está disponible para la venta. Elige otra.';
    END IF;
    NEW.comprador_id := auth.uid();
    -- Los asientos de un mismo INSERT (misma transacción) forman una compra, con o sin pago.
    NEW.compra_id := md5(NEW.comprador_id::text || NEW.viaje_id::text || now()::text)::uuid;
    NEW.cooperativa_id := v_coop;
    NEW.estado := 'RESERVADO';
    NEW.precio := v_precio;
    NEW.reserva_expira_at := least(now() + interval '30 minutes', v_salida);
    NEW.pago_id := NULL; NEW.qr_embarque_data := NULL;
    NEW.monto_reembolso := NULL; NEW.reembolso_procesado := false;
    NEW.embarcado_at := NULL; NEW.embarcado_por := NULL;
    RETURN NEW;
  END IF;
  -- UPDATE: solo cancelar.
  IF NEW.estado IS DISTINCT FROM OLD.estado AND NEW.estado <> 'CANCELADO' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'EB_OPERACION_NO_PERMITIDA',
      HINT = 'El estado del boleto lo cambia la cooperativa o el sistema.';
  END IF;
  IF (to_jsonb(NEW) - c) IS DISTINCT FROM (to_jsonb(OLD) - c) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'EB_OPERACION_NO_PERMITIDA',
      HINT = 'Esta acción la hace la cooperativa.';
  END IF;
  IF NEW.estado = 'CANCELADO' AND OLD.estado = 'RESERVADO' AND EXISTS (
       SELECT 1 FROM public.pagos p WHERE p.id = OLD.pago_id AND p.estado_verificacion = 'PENDIENTE') THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'EB_PAGO_EN_VERIFICACION',
      HINT = 'Tu pago está en verificación. Espera la respuesta de la cooperativa o contáctala para cancelar.';
  END IF;
  NEW.monto_reembolso := CASE WHEN NEW.estado = 'CANCELADO' AND OLD.estado = 'PAGADO'
                              THEN round(OLD.precio * 0.95, 2)
                              WHEN NEW.estado = 'CANCELADO' THEN NULL
                              ELSE OLD.monto_reembolso END;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS aa_proteger_boletos_cliente ON public.boletos;
CREATE TRIGGER aa_proteger_boletos_cliente BEFORE INSERT OR UPDATE ON public.boletos
  FOR EACH ROW EXECUTE FUNCTION public.proteger_boletos_cliente_fn();

CREATE OR REPLACE FUNCTION public.proteger_encomiendas_cliente_fn()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE c text[] := ARRAY['estado','motivo_cancelacion','updated_at'];
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') OR public.user_role() IS DISTINCT FROM 'user' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.sender_id := auth.uid();
    NEW.estado := 'PENDIENTE_DE_ESCANEO';
    NEW.costo_calculado := NULL;
    NEW.pin_retiro := NULL; NEW.intentos_pin := 0; NEW.pin_bloqueado := false; NEW.qr_data := NULL;
    NEW.viaje_id := NULL; NEW.sucursal_origen_id := NULL; NEW.sucursal_destino_id := NULL;
    NEW.receiver_user_id := NULL; NEW.receiver_vinculado_por := NULL; NEW.receiver_vinculado_at := NULL;
    RETURN NEW;
  END IF;
  IF NEW.estado IS DISTINCT FROM OLD.estado
     AND NOT (OLD.estado = 'PENDIENTE_DE_ESCANEO' AND NEW.estado = 'CANCELADA') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'EB_OPERACION_NO_PERMITIDA',
      HINT = 'El estado del envío lo cambia la cooperativa.';
  END IF;
  IF (to_jsonb(NEW) - c) IS DISTINCT FROM (to_jsonb(OLD) - c) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'EB_OPERACION_NO_PERMITIDA',
      HINT = 'Esta acción la hace la cooperativa.';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS aa_proteger_encomiendas_cliente ON public.encomiendas;
CREATE TRIGGER aa_proteger_encomiendas_cliente BEFORE INSERT OR UPDATE ON public.encomiendas
  FOR EACH ROW EXECUTE FUNCTION public.proteger_encomiendas_cliente_fn();

CREATE OR REPLACE FUNCTION public.proteger_perfil_fn()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF current_user IN ('authenticated', 'anon') AND NOT coalesce(public.is_super_admin(), false)
     AND (NEW.role, NEW.cooperativa_id, NEW.sucursal_id)
         IS DISTINCT FROM (OLD.role, OLD.cooperativa_id, OLD.sucursal_id) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'EB_SIN_PERMISO',
      HINT = 'No puedes cambiar tu rol, tu cooperativa ni tu sucursal.';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS aa_proteger_perfil ON public.profiles;
CREATE TRIGGER aa_proteger_perfil BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.proteger_perfil_fn();

-- ─── 9. Compatibilidad con la app actual (transitorio hasta la migración 06) ─
-- La app vieja inserta el pago solo en boletos[0]: se extiende a todos los asientos de su INSERT.
-- Las RPC nuevas siempre envían idempotency_key, así que este trigger no las toca.
CREATE OR REPLACE FUNCTION public.vincular_pago_legado_fn()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v record;
BEGIN
  IF NEW.idempotency_key IS NOT NULL OR NEW.verificado OR NEW.tipo_pago <> 'DIGITAL' THEN
    RETURN NULL;
  END IF;
  IF NEW.banco_emisor ILIKE 'zelle' THEN
    UPDATE public.pagos SET moneda = 'USD' WHERE id = NEW.id AND moneda <> 'USD';
  END IF;
  IF NEW.boleto_id IS NULL THEN RETURN NULL; END IF;
  SELECT compra_id, comprador_id, viaje_id, created_at INTO v FROM public.boletos WHERE id = NEW.boleto_id;
  IF NOT FOUND OR v.comprador_id IS NULL THEN RETURN NULL; END IF;
  UPDATE public.boletos b
     SET pago_id = NEW.id, compra_id = v.compra_id, reserva_expira_at = NULL
   WHERE b.comprador_id = v.comprador_id AND b.viaje_id = v.viaje_id AND b.created_at = v.created_at
     AND b.estado = 'RESERVADO' AND b.pago_id IS NULL;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS vincular_pago_legado ON public.pagos;
CREATE TRIGGER vincular_pago_legado AFTER INSERT ON public.pagos
  FOR EACH ROW EXECUTE FUNCTION public.vincular_pago_legado_fn();

-- ─── 10. Permisos ───────────────────────────────────────────────────────────
DO $$
DECLARE f record;
BEGIN
  FOR f IN SELECT p.oid::regprocedure AS sig FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public' AND p.proname LIKE '\_%' LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', f.sig);
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.fn_guardar_tasa_bcv(date, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_guardar_tasa_bcv(date, numeric) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_tasa_bcv_vigente() TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.fn_registrar_tasa_bcv_manual(date, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_registrar_tasa_bcv_manual(date, numeric, text) TO authenticated;

COMMIT;
