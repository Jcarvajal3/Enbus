-- Tarifas de encomiendas por cooperativa (antes globales de EnBus).
--   · Cada cooperativa configura y programa sus propias tarifas (por kg, factor de distancia,
--     dimensiones máximas y peso máximo). La tasa BCV sigue siendo global.
--   · Backfill seguro: si existe una tarifa global activa, se clona a cada cooperativa que aún
--     no tenga una tarifa activa y se archivan las filas globales antiguas.
--   · RLS estricta en public.tarifas: solo SELECT para super_admin o personal de su cooperativa;
--     toda escritura pasa por RPCs SECURITY DEFINER (fn_publicar_tarifa,
--     fn_cancelar_tarifa_programada, fn_activar_tarifas_programadas).
--   · validar_encomienda_app_fn impide registrar envíos desde la app a cooperativas sin tarifa
--     activa; _costo_encomienda, fn_cotizar_encomienda, fn_cotizar_envio_publico y
--     fn_checklist_cooperativa leen la tarifa activa de cada cooperativa.
-- Re-ejecutable e idempotente.
BEGIN;

-- ─── 1. Columna cooperativa_id y migración desde tarifa global ───────────────
ALTER TABLE public.tarifas
  ADD COLUMN IF NOT EXISTS cooperativa_id uuid REFERENCES public.cooperativas(id) ON DELETE CASCADE;

-- CRÍTICO: el índice único global (una sola activa en toda la tabla) debe caer ANTES del backfill.
DROP INDEX IF EXISTS public.idx_tarifas_activa;

DO $$
DECLARE
  v_global record;
BEGIN
  SELECT * INTO v_global
    FROM public.tarifas
   WHERE cooperativa_id IS NULL AND activa = true
   ORDER BY created_at DESC
   LIMIT 1;

  IF FOUND THEN
    INSERT INTO public.tarifas (
      cooperativa_id, tarifa_por_kg, factor_distancia_por_min, dimensiones_max_cm,
      peso_max_kg, vigente_desde, activa, creada_por, publicada_at, nota
    )
    SELECT c.id,
           v_global.tarifa_por_kg,
           v_global.factor_distancia_por_min,
           v_global.dimensiones_max_cm,
           v_global.peso_max_kg,
           coalesce(v_global.vigente_desde, now()),
           true,
           v_global.creada_por,
           coalesce(v_global.publicada_at, v_global.created_at, now()),
           coalesce(v_global.nota, 'Tarifa inicial migrada desde tarifa global')
      FROM public.cooperativas c
     WHERE NOT EXISTS (
       SELECT 1 FROM public.tarifas t
        WHERE t.cooperativa_id = c.id AND t.activa = true
     );
  END IF;

  UPDATE public.tarifas
     SET activa = false,
         reemplazada_at = coalesce(reemplazada_at, now())
   WHERE cooperativa_id IS NULL
     AND (activa = true OR reemplazada_at IS NULL);
END $$;

-- ─── 2. Índices y constraint por cooperativa ─────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS idx_tarifas_coop_activa
  ON public.tarifas (cooperativa_id)
  WHERE activa = true AND cooperativa_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_tarifas_coop_programada
  ON public.tarifas (cooperativa_id)
  WHERE NOT activa AND publicada_at IS NOT NULL AND reemplazada_at IS NULL AND cooperativa_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tarifas_coop_created_at
  ON public.tarifas (cooperativa_id, created_at DESC)
  WHERE cooperativa_id IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_tarifas_cooperativa_vigencia') THEN
    ALTER TABLE public.tarifas ADD CONSTRAINT chk_tarifas_cooperativa_vigencia
      CHECK (cooperativa_id IS NOT NULL OR (NOT activa AND reemplazada_at IS NOT NULL));
  END IF;
END $$;

-- ─── 3. RLS estricta en public.tarifas ───────────────────────────────────────
DROP POLICY IF EXISTS "Tarifas visibles" ON public.tarifas;
DROP POLICY IF EXISTS "Super admin crea tarifas" ON public.tarifas;
DROP POLICY IF EXISTS "Super admin actualiza tarifas" ON public.tarifas;
DROP POLICY IF EXISTS "Super admin borra tarifas" ON public.tarifas;
DROP POLICY IF EXISTS "Todos los autenticados ven tarifas" ON public.tarifas;
DROP POLICY IF EXISTS "Modificar tarifas Super Admin" ON public.tarifas;

REVOKE INSERT, UPDATE, DELETE ON public.tarifas FROM anon, authenticated;

CREATE POLICY "Tarifas visibles" ON public.tarifas FOR SELECT TO authenticated
  USING ((select public.is_super_admin())
         OR (cooperativa_id IS NOT NULL AND cooperativa_id = (select public.user_cooperativa_id())));

-- ─── 4. Costo y cotización por cooperativa ───────────────────────────────────
CREATE OR REPLACE FUNCTION public._costo_encomienda(p_encomienda_id uuid, p_peso_kg numeric,
                                                    OUT o_costo_usd numeric, OUT o_peso_max numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_e record;
  v_por_kg numeric;
  v_factor numeric;
  v_duracion integer;
BEGIN
  SELECT * INTO v_e FROM public.encomiendas WHERE id = p_encomienda_id;
  IF NOT FOUND THEN
    PERFORM public._fallar('EB_NO_ENCONTRADO', 'No encontramos esta encomienda.');
  END IF;

  SELECT tarifa_por_kg, factor_distancia_por_min, peso_max_kg
    INTO v_por_kg, v_factor, o_peso_max
    FROM public.tarifas
   WHERE cooperativa_id = v_e.cooperativa_id AND activa = true
   LIMIT 1;
  IF v_por_kg IS NULL THEN
    PERFORM public._fallar('EB_TARIFA_NO_DISPONIBLE',
      'Tu cooperativa no tiene una tarifa activa. Pídele al administrador que la configure en Tarifas.');
  END IF;

  IF p_peso_kg IS NULL OR p_peso_kg <= 0 OR p_peso_kg > o_peso_max THEN
    PERFORM public._fallar('EB_PESO_INVALIDO', format('El peso debe ser mayor que 0 y de hasta %s kg.', o_peso_max),
      jsonb_build_object('peso_max_kg', o_peso_max, 'campo', 'peso'));
  END IF;

  SELECT r.duracion_estimada_min INTO v_duracion
    FROM public.rutas r
   WHERE r.cooperativa_id = v_e.cooperativa_id AND r.activa
     AND public.normalizar_localidad(r.estado_origen)  = public.normalizar_localidad(v_e.estado_origen)
     AND public.normalizar_localidad(r.ciudad_origen)  = public.normalizar_localidad(v_e.ciudad_origen)
     AND public.normalizar_localidad(r.estado_destino) = public.normalizar_localidad(v_e.estado_destino)
     AND public.normalizar_localidad(r.ciudad_destino) = public.normalizar_localidad(v_e.ciudad_destino)
   ORDER BY r.duracion_estimada_min LIMIT 1;
  IF v_duracion IS NULL THEN
    PERFORM public._fallar('EB_SIN_RUTA', 'Tu cooperativa no tiene una ruta activa a ese destino.');
  END IF;

  o_costo_usd := round(p_peso_kg * v_por_kg * (1 + v_factor * v_duracion), 2);
END $$;

CREATE OR REPLACE FUNCTION public.fn_cotizar_encomienda(p_encomienda_id uuid, p_peso_kg numeric)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_ctx record;
  v_coop uuid;
  v_costo numeric;
  v_max numeric;
  v_dim integer;
  v_tasa numeric;
  v_fecha date;
BEGIN
  SELECT * INTO v_ctx FROM public._contexto_staff();
  SELECT cooperativa_id INTO v_coop FROM public.encomiendas WHERE id = p_encomienda_id;
  IF v_coop IS DISTINCT FROM v_ctx.o_cooperativa_id THEN
    PERFORM public._fallar('EB_NO_ENCONTRADO', 'No encontramos esta encomienda en tu cooperativa.');
  END IF;

  SELECT o_costo_usd, o_peso_max INTO v_costo, v_max FROM public._costo_encomienda(p_encomienda_id, p_peso_kg);
  SELECT dimensiones_max_cm INTO v_dim
    FROM public.tarifas
   WHERE cooperativa_id = v_coop AND activa = true
   LIMIT 1;
  SELECT t.tasa, t.fecha INTO v_tasa, v_fecha FROM public.fn_tasa_bcv_vigente() t;

  RETURN jsonb_build_object(
    'costo_usd', v_costo,
    'peso_max_kg', v_max,
    'dimensiones_max_cm', v_dim,
    'tasa_bcv', v_tasa,
    'tasa_bcv_fecha', v_fecha,
    'costo_bs', CASE WHEN v_tasa IS NOT NULL THEN round(v_costo * v_tasa, 2) END
  );
END $$;

CREATE OR REPLACE FUNCTION public.fn_cotizar_envio_publico(p_peso_kg numeric, p_ciudad_origen text, p_ciudad_destino text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_hay_rutas boolean;
  v_max_ruta numeric;
  v_tasa numeric;
  v_fecha date;
  v_opciones jsonb;
BEGIN
  IF p_peso_kg IS NULL OR p_peso_kg <= 0 THEN
    PERFORM public._fallar('EB_PESO_INVALIDO', 'El peso debe ser mayor que 0.', '{"campo":"peso"}');
  END IF;

  SELECT count(*) > 0, max(t.peso_max_kg)
    INTO v_hay_rutas, v_max_ruta
    FROM (
      SELECT DISTINCT ON (r.cooperativa_id) r.cooperativa_id
        FROM public.rutas r
        JOIN public.cooperativas c ON c.id = r.cooperativa_id AND c.estado = 'ACTIVA'
       WHERE r.activa
         AND public.normalizar_localidad(r.ciudad_origen) = public.normalizar_localidad(p_ciudad_origen)
         AND public.normalizar_localidad(r.ciudad_destino) = public.normalizar_localidad(p_ciudad_destino)
       ORDER BY r.cooperativa_id, r.duracion_estimada_min
    ) rc
    LEFT JOIN public.tarifas t ON t.cooperativa_id = rc.cooperativa_id AND t.activa = true;

  SELECT t.tasa, t.fecha INTO v_tasa, v_fecha FROM public.fn_tasa_bcv_vigente() t;

  IF NOT v_hay_rutas OR v_max_ruta IS NULL THEN
    RETURN jsonb_build_object(
      'peso_max_kg', NULL,
      'tasa_bcv', v_tasa,
      'tasa_bcv_fecha', v_fecha,
      'opciones', '[]'::jsonb
    );
  END IF;

  IF p_peso_kg > v_max_ruta THEN
    PERFORM public._fallar(
      'EB_PESO_INVALIDO',
      format('El peso debe ser mayor que 0 y de hasta %s kg.', v_max_ruta),
      jsonb_build_object('peso_max_kg', v_max_ruta, 'campo', 'peso')
    );
  END IF;

  SELECT coalesce(jsonb_agg(o ORDER BY (o->>'costo_usd')::numeric, o->>'cooperativa'), '[]'::jsonb)
    INTO v_opciones
    FROM (
      SELECT jsonb_build_object(
               'cooperativa_id', x.cooperativa_id,
               'cooperativa', x.nombre,
               'calificacion', x.calificacion_promedio,
               'duracion_min', x.duracion_estimada_min,
               'peso_max_kg', t.peso_max_kg,
               'dimensiones_max_cm', t.dimensiones_max_cm,
               'costo_usd', round(p_peso_kg * t.tarifa_por_kg * (1 + t.factor_distancia_por_min * x.duracion_estimada_min), 2),
               'costo_bs', CASE WHEN v_tasa IS NOT NULL
                                THEN round(round(p_peso_kg * t.tarifa_por_kg * (1 + t.factor_distancia_por_min * x.duracion_estimada_min), 2) * v_tasa, 2) END
             ) AS o
        FROM (
          SELECT DISTINCT ON (r.cooperativa_id) r.cooperativa_id, c.nombre, c.calificacion_promedio, r.duracion_estimada_min
            FROM public.rutas r
            JOIN public.cooperativas c ON c.id = r.cooperativa_id AND c.estado = 'ACTIVA'
           WHERE r.activa
             AND public.normalizar_localidad(r.ciudad_origen) = public.normalizar_localidad(p_ciudad_origen)
             AND public.normalizar_localidad(r.ciudad_destino) = public.normalizar_localidad(p_ciudad_destino)
           ORDER BY r.cooperativa_id, r.duracion_estimada_min
        ) x
        JOIN public.tarifas t ON t.cooperativa_id = x.cooperativa_id AND t.activa = true
       WHERE t.peso_max_kg >= p_peso_kg
    ) s;

  RETURN jsonb_build_object(
    'peso_max_kg', v_max_ruta,
    'tasa_bcv', v_tasa,
    'tasa_bcv_fecha', v_fecha,
    'opciones', v_opciones
  );
END $$;

-- ─── 5. Publicación, cancelación y cron por cooperativa ──────────────────────
CREATE OR REPLACE FUNCTION public.fn_publicar_tarifa(
  p_tarifa_por_kg numeric, p_factor_distancia_por_min numeric, p_dimensiones_max_cm integer,
  p_peso_max_kg numeric, p_vigente_desde timestamptz DEFAULT NULL, p_nota text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_ctx record;
  v_desde timestamptz := coalesce(p_vigente_desde, now());
  v_id uuid;
  v_programada boolean;
  v_tarifa_kg numeric := round(p_tarifa_por_kg, 2);
  v_factor numeric := round(p_factor_distancia_por_min, 4);
  v_peso_max numeric := round(p_peso_max_kg, 2);
BEGIN
  SELECT * INTO v_ctx FROM public._contexto_staff();
  IF v_ctx.o_rol <> 'admin_cooperativa' THEN
    PERFORM public._fallar('EB_SIN_PERMISO', 'Solo el administrador de la cooperativa puede publicar tarifas.');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('tarifas:' || v_ctx.o_cooperativa_id::text));

  IF v_tarifa_kg IS NULL OR v_tarifa_kg < 0.01 OR v_tarifa_kg > 1000 THEN
    PERFORM public._fallar('EB_DATOS_INVALIDOS', 'El precio por kilo debe ser mayor que 0.', '{"campo":"tarifa_por_kg"}');
  END IF;
  IF v_factor IS NULL OR v_factor < 0 OR v_factor > 1 THEN
    PERFORM public._fallar('EB_DATOS_INVALIDOS', 'El recargo por minuto de viaje debe estar entre 0 y 1.',
                           '{"campo":"factor_distancia_por_min"}');
  END IF;
  IF p_dimensiones_max_cm IS NULL OR p_dimensiones_max_cm < 10 OR p_dimensiones_max_cm > 300 THEN
    PERFORM public._fallar('EB_DATOS_INVALIDOS', 'La medida máxima debe estar entre 10 y 300 cm.',
                           '{"campo":"dimensiones_max_cm"}');
  END IF;
  IF v_peso_max IS NULL OR v_peso_max < 1 OR v_peso_max > 100 THEN
    PERFORM public._fallar('EB_DATOS_INVALIDOS', 'El peso máximo debe estar entre 1 y 100 kg.', '{"campo":"peso_max_kg"}');
  END IF;

  v_programada := v_desde > now() + interval '1 minute';

  -- Una programación nueva reemplaza a la anterior de la cooperativa que aún no entró en vigor.
  UPDATE public.tarifas
     SET reemplazada_at = now()
   WHERE cooperativa_id = v_ctx.o_cooperativa_id
     AND NOT activa AND publicada_at IS NOT NULL AND reemplazada_at IS NULL;

  IF NOT v_programada THEN
    UPDATE public.tarifas
       SET activa = false, reemplazada_at = now()
     WHERE cooperativa_id = v_ctx.o_cooperativa_id AND activa;
    v_desde := now();
  END IF;

  INSERT INTO public.tarifas (
    cooperativa_id, tarifa_por_kg, factor_distancia_por_min, dimensiones_max_cm,
    peso_max_kg, vigente_desde, activa, creada_por, publicada_at, nota
  )
  VALUES (
    v_ctx.o_cooperativa_id, v_tarifa_kg, v_factor,
    p_dimensiones_max_cm, v_peso_max, v_desde, NOT v_programada,
    v_ctx.o_uid, now(), nullif(left(btrim(coalesce(p_nota, '')), 300), '')
  )
  RETURNING id INTO v_id;

  RETURN jsonb_build_object(
    'id', v_id,
    'estado', CASE WHEN v_programada THEN 'PROGRAMADA' ELSE 'VIGENTE' END,
    'vigente_desde', v_desde
  );
END $$;

CREATE OR REPLACE FUNCTION public.fn_cancelar_tarifa_programada(p_tarifa_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_ctx record;
BEGIN
  SELECT * INTO v_ctx FROM public._contexto_staff();
  IF v_ctx.o_rol <> 'admin_cooperativa' THEN
    PERFORM public._fallar('EB_SIN_PERMISO', 'Solo el administrador de la cooperativa puede cancelar tarifas programadas.');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('tarifas:' || v_ctx.o_cooperativa_id::text));

  UPDATE public.tarifas
     SET reemplazada_at = now()
   WHERE id = p_tarifa_id
     AND cooperativa_id = v_ctx.o_cooperativa_id
     AND NOT activa AND publicada_at IS NOT NULL AND reemplazada_at IS NULL;
  IF NOT FOUND THEN
    PERFORM public._fallar('EB_ESTADO_CAMBIO', 'Esta tarifa ya no está programada. Actualiza la página.');
  END IF;

  RETURN jsonb_build_object('id', p_tarifa_id, 'estado', 'CANCELADA');
END $$;

CREATE OR REPLACE FUNCTION public.fn_activar_tarifas_programadas()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_rec record;
BEGIN
  FOR v_rec IN
    SELECT DISTINCT ON (cooperativa_id) id, cooperativa_id
      FROM public.tarifas
     WHERE cooperativa_id IS NOT NULL
       AND NOT activa AND publicada_at IS NOT NULL AND reemplazada_at IS NULL
       AND vigente_desde <= now()
     ORDER BY cooperativa_id, vigente_desde DESC, publicada_at DESC
  LOOP
    PERFORM pg_advisory_xact_lock(hashtext('tarifas:' || v_rec.cooperativa_id::text));

    PERFORM 1
      FROM public.tarifas
     WHERE id = v_rec.id
       AND cooperativa_id = v_rec.cooperativa_id
       AND NOT activa AND publicada_at IS NOT NULL AND reemplazada_at IS NULL
       AND vigente_desde <= now()
       FOR UPDATE;
    IF NOT FOUND THEN
      CONTINUE;
    END IF;

    UPDATE public.tarifas
       SET activa = false, reemplazada_at = now()
     WHERE cooperativa_id = v_rec.cooperativa_id AND activa;

    UPDATE public.tarifas
       SET reemplazada_at = now()
     WHERE cooperativa_id = v_rec.cooperativa_id
       AND id <> v_rec.id
       AND NOT activa AND publicada_at IS NOT NULL AND reemplazada_at IS NULL
       AND vigente_desde <= now();

    UPDATE public.tarifas
       SET activa = true
     WHERE id = v_rec.id;
  END LOOP;
END $$;

-- ─── 6. Checklist y validación de encomiendas desde la app ───────────────────
CREATE OR REPLACE FUNCTION public.fn_checklist_cooperativa()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_ctx record;
  v_c record;
BEGIN
  SELECT * INTO v_ctx FROM public._contexto_staff();
  SELECT estado, motivo_estado, estado_cambiado_at INTO v_c
    FROM public.cooperativas WHERE id = v_ctx.o_cooperativa_id;

  RETURN jsonb_build_object(
    'estado', v_c.estado, 'motivo_estado', v_c.motivo_estado, 'estado_cambiado_at', v_c.estado_cambiado_at,
    'sucursales', (SELECT count(*) FROM public.sucursales WHERE cooperativa_id = v_ctx.o_cooperativa_id AND activa),
    'metodos_pago', (SELECT count(*) FROM public.metodos_pago_cooperativa
                      WHERE cooperativa_id = v_ctx.o_cooperativa_id AND activo),
    'metodos_digitales', (SELECT count(*) FROM public.metodos_pago_cooperativa
                           WHERE cooperativa_id = v_ctx.o_cooperativa_id AND activo AND tipo <> 'EFECTIVO'),
    'rutas', (SELECT count(*) FROM public.rutas
               WHERE cooperativa_id = v_ctx.o_cooperativa_id AND activa AND coalesce(precio_pasaje, 0) > 0),
    'buses', (SELECT count(*) FROM public.buses WHERE cooperativa_id = v_ctx.o_cooperativa_id AND activo),
    'tarifas_activas', (SELECT count(*) FROM public.tarifas
                         WHERE cooperativa_id = v_ctx.o_cooperativa_id AND activa = true),
    'viajes_proximos', (SELECT count(*) FROM public.viajes
                         WHERE cooperativa_id = v_ctx.o_cooperativa_id AND estado = 'PROGRAMADO'
                           AND fecha_hora_salida > now()),
    'taquilleros', (SELECT count(*) FROM public.profiles
                     WHERE cooperativa_id = v_ctx.o_cooperativa_id AND role = 'taquillero'),
    'invitaciones_pendientes', (SELECT count(*) FROM public.invitaciones
                                 WHERE cooperativa_id = v_ctx.o_cooperativa_id AND NOT usado
                                   AND revocada_at IS NULL AND expira_at > now())
  );
END $$;

-- Helper SECURITY DEFINER para validar existencia de tarifa activa sin exponer filas
-- de public.tarifas a pasajeros (validar_encomienda_app_fn debe seguir siendo SECURITY INVOKER
-- para distinguir escrituras directas del cliente frente a RPCs SECURITY DEFINER).
CREATE OR REPLACE FUNCTION public._cooperativa_tiene_tarifa_activa(p_cooperativa_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tarifas t
     WHERE t.cooperativa_id = p_cooperativa_id AND t.activa = true
  );
$$;

CREATE OR REPLACE FUNCTION public.validar_encomienda_app_fn()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_dia integer;
  v_abiertas integer;
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
  IF NOT public._cooperativa_tiene_tarifa_activa(NEW.cooperativa_id) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'EB_TARIFA_NO_DISPONIBLE',
      HINT = 'Esta cooperativa todavía no tiene tarifas de encomiendas activas. Elige otra.';
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
    NEW.foto_cliente_path := NULL;
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

-- ─── 7. Permisos explícitos ──────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.fn_publicar_tarifa(numeric, numeric, integer, numeric, timestamptz, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_publicar_tarifa(numeric, numeric, integer, numeric, timestamptz, text) TO authenticated;

REVOKE ALL ON FUNCTION public.fn_cancelar_tarifa_programada(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_cancelar_tarifa_programada(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.fn_cotizar_encomienda(uuid, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_cotizar_encomienda(uuid, numeric) TO authenticated;

REVOKE ALL ON FUNCTION public.fn_checklist_cooperativa() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_checklist_cooperativa() TO authenticated;

GRANT EXECUTE ON FUNCTION public.fn_cotizar_envio_publico(numeric, text, text) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public._cooperativa_tiene_tarifa_activa(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._cooperativa_tiene_tarifa_activa(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public._costo_encomienda(uuid, numeric) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_activar_tarifas_programadas() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_activar_tarifas_programadas() TO service_role;
REVOKE ALL ON FUNCTION public.validar_encomienda_app_fn() FROM PUBLIC, anon, authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';
