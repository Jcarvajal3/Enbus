-- Horarios fijos y asignación de unidades (Specs/03_Web_Panel_Cooperativas/Horarios_y_Asignacion_Spec.md).
-- Hasta ahora el panel obligaba a elegir el bus al programar cada viaje y copiaba su capacidad. En la
-- realidad la cooperativa tiene fijos la ruta, el día y la hora (su itinerario de terminal); el bus y
-- el chofer se deciden cada día o cada semana, y se vende antes de saber qué bus va. Esta migración:
--   1. Crea dias_no_laborables (fechas sin salidas; pueden repetirse cada año) y horarios (ruta + hora
--      + días de la semana + capacidad + vigencia). Solo se escriben por RPC (admin_cooperativa).
--   2. viajes.horario_id (qué horario generó la salida), viajes.fecha_servicio (día nominal en hora de
--      Venezuela: clave de idempotencia, no cambia si el admin mueve la hora de esa salida) y
--      viajes.fuera_de_horario (salida con pasajeros que ya no corresponde a ningún horario).
--      Índice único (horario_id, fecha_servicio): generar es idempotente y un viaje cancelado a mano
--      no se vuelve a crear.
--   3. _generar_salidas: crea las salidas de los próximos 30 días (sin bus), adopta los viajes
--      recurrentes que ya existían y reconcilia las salidas fuera de horario. Cron diario 00:15 VE.
--      También se dispara al reactivar una ruta o una cooperativa.
--      Si a un horario solo se le cambia la hora, sus salidas futuras sin movimiento se mueven en el
--      lugar (conservan unidad y chofer; si la unidad choca a la hora nueva, quedan por asignar).
--   4. _retirar_salidas: borra las salidas sin movimiento, cancela las que solo tienen boletos
--      CANCELADO/EXPIRADO (liberando el hueco) y conserva, marcadas fuera_de_horario, las que ya
--      tienen pasajeros o encomiendas (el admin las cancela con el flujo existente: reembolsa y avisa).
--   5. RPC de horarios y días no laborables: fn_guardar_horario, fn_cambiar_estado_horario,
--      fn_guardar_dia_no_laborable, fn_borrar_dia_no_laborable.
--   6. Asignación de unidad: _validar_bus_para_viaje (con regla de choque de bus), _aplicar_bus,
--      fn_asignar_bus, fn_copiar_asignaciones. fn_editar_viaje y proteger_viajes_cliente_fn añaden la
--      regla de choque; el INSERT directo del panel ya no puede fijar horario_id/recurrente.
--   7. fn_marcar_salida_viaje exige unidad (EB_SIN_UNIDAD) y fn_bandeja_cooperativa suma
--      salidas_sin_unidad y salidas_fuera_de_horario.
-- Días de la semana: 0 = domingo … 6 = sábado (como extract(dow …)). Hora de Venezuela:
-- America/Caracas (sin horario de verano). Los horarios arrancan vacíos: no se genera nada aquí.
-- Re-ejecutable.
BEGIN;

-- ─── 1. Tablas ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.dias_no_laborables (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cooperativa_id uuid NOT NULL REFERENCES public.cooperativas(id) ON DELETE CASCADE,
  fecha          date NOT NULL,                       -- si cada_anio, solo importan el mes y el día
  nombre         text,
  cada_anio      boolean NOT NULL DEFAULT false,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_dias_no_laborables_nombre CHECK (nombre IS NULL OR char_length(nombre) BETWEEN 1 AND 60),
  CONSTRAINT uq_dias_no_laborables_coop_fecha UNIQUE (cooperativa_id, fecha)
);
COMMENT ON TABLE public.dias_no_laborables IS
  'Fechas en que una cooperativa no sale: sus horarios no generan salidas ese día. Los viajes extra no se afectan.';

-- Validador puro de los días de un horario. Lo evalúa el CHECK con el rol que escribe la fila, y
-- `horarios` solo se escribe desde las RPC (SECURITY DEFINER) o con service_role: por eso también se
-- le quita EXECUTE a PUBLIC, anon y authenticated (§15), como al resto de helpers.
CREATE OR REPLACE FUNCTION public._dias_horario_validos(p smallint[])
RETURNS boolean LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT p IS NOT NULL
         AND cardinality(p) BETWEEN 1 AND 7
         AND p <@ ARRAY[0, 1, 2, 3, 4, 5, 6]::smallint[]
         AND cardinality(p) = (SELECT count(DISTINCT x) FROM unnest(p) AS x);
$$;

CREATE TABLE IF NOT EXISTS public.horarios (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cooperativa_id uuid NOT NULL REFERENCES public.cooperativas(id) ON DELETE CASCADE,
  ruta_id        uuid NOT NULL REFERENCES public.rutas(id) ON DELETE CASCADE,
  hora_salida    time NOT NULL,                       -- hora de Venezuela, minutos exactos
  dias           smallint[] NOT NULL,                 -- 0 = domingo … 6 = sábado
  capacidad      integer NOT NULL,
  vigente_desde  date NOT NULL,
  vigente_hasta  date,
  activo         boolean NOT NULL DEFAULT true,
  creado_por     uuid,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_horarios_hora CHECK (extract(second FROM hora_salida) = 0),
  CONSTRAINT chk_horarios_dias CHECK (public._dias_horario_validos(dias)),
  CONSTRAINT chk_horarios_capacidad CHECK (capacidad BETWEEN 1 AND 80),
  CONSTRAINT chk_horarios_vigencia CHECK (vigente_hasta IS NULL OR vigente_hasta >= vigente_desde)
);
COMMENT ON TABLE public.horarios IS
  'Itinerario fijo de una cooperativa: ruta + hora + días de la semana + capacidad + vigencia. Genera salidas (viajes) solas.';
CREATE INDEX IF NOT EXISTS idx_horarios_coop_activo ON public.horarios (cooperativa_id, activo);
CREATE INDEX IF NOT EXISTS idx_horarios_ruta ON public.horarios (ruta_id);

DROP TRIGGER IF EXISTS set_horarios_updated_at ON public.horarios;
CREATE TRIGGER set_horarios_updated_at BEFORE UPDATE ON public.horarios
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ─── 2. RLS y privilegios (lee el personal; escribe solo por RPC) ────────────
ALTER TABLE public.dias_no_laborables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.horarios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Dias no laborables visibles para su cooperativa" ON public.dias_no_laborables;
CREATE POLICY "Dias no laborables visibles para su cooperativa" ON public.dias_no_laborables
  FOR SELECT TO authenticated
  USING (cooperativa_id = (select public.user_cooperativa_id()) OR (select public.is_super_admin()));

DROP POLICY IF EXISTS "Horarios visibles para su cooperativa" ON public.horarios;
CREATE POLICY "Horarios visibles para su cooperativa" ON public.horarios
  FOR SELECT TO authenticated
  USING (cooperativa_id = (select public.user_cooperativa_id()) OR (select public.is_super_admin()));

REVOKE ALL ON public.dias_no_laborables, public.horarios FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER, REFERENCES ON public.dias_no_laborables, public.horarios FROM authenticated;
GRANT SELECT ON public.dias_no_laborables, public.horarios TO authenticated;
GRANT ALL ON public.dias_no_laborables, public.horarios TO service_role;

-- ─── 3. viajes: horario_id, fecha_servicio, fuera_de_horario ─────────────────
ALTER TABLE public.viajes
  ADD COLUMN IF NOT EXISTS horario_id uuid REFERENCES public.horarios(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS fecha_servicio date,
  ADD COLUMN IF NOT EXISTS fuera_de_horario boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.viajes.horario_id IS 'Horario que generó la salida; NULL en viajes extra y en los anteriores.';
COMMENT ON COLUMN public.viajes.fecha_servicio IS
  'Día nominal de la salida en hora de Venezuela. Clave de idempotencia con horario_id: no cambia si se mueve la hora.';
COMMENT ON COLUMN public.viajes.fuera_de_horario IS
  'Salida con pasajeros o encomiendas que ya no corresponde a ningún horario: el admin debe revisarla.';

-- Un día de servicio, una sola salida por horario (incluye las canceladas a mano: no se recrean).
CREATE UNIQUE INDEX IF NOT EXISTS uq_viajes_horario_servicio
  ON public.viajes (horario_id, fecha_servicio) WHERE horario_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_viajes_fuera_de_horario
  ON public.viajes (cooperativa_id) WHERE fuera_de_horario;

-- ─── 4. Utilidades internas ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._horizonte_salidas()
RETURNS integer LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$ SELECT 30 $$;

CREATE OR REPLACE FUNCTION public._lock_horarios(p_coop uuid)
RETURNS void LANGUAGE sql AS $$
  SELECT pg_advisory_xact_lock(hashtextextended('horarios:' || p_coop::text, 0));
$$;

-- ¿La cooperativa no sale ese día? Coincide la fecha exacta o, si se repite cada año, el mismo mes y
-- día (el 29 de febrero solo coincide en años bisiestos).
CREATE OR REPLACE FUNCTION public._es_no_laborable(p_coop uuid, p_fecha date)
RETURNS boolean LANGUAGE sql STABLE SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.dias_no_laborables d
     WHERE d.cooperativa_id = p_coop
       AND (d.fecha = p_fecha
            OR (d.cada_anio AND extract(month FROM d.fecha) = extract(month FROM p_fecha)
                            AND extract(day FROM d.fecha) = extract(day FROM p_fecha))));
$$;

-- ¿Hay otro horario ACTIVO de la misma ruta, a la misma hora, que comparta algún día y cuya vigencia se solape?
CREATE OR REPLACE FUNCTION public._horario_solapado(
  p_coop uuid, p_id uuid, p_ruta uuid, p_hora time, p_dias smallint[], p_desde date, p_hasta date)
RETURNS boolean LANGUAGE sql STABLE SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.horarios h
     WHERE h.cooperativa_id = p_coop AND h.ruta_id = p_ruta AND h.hora_salida = p_hora AND h.activo
       AND h.id IS DISTINCT FROM p_id
       AND h.dias && p_dias
       AND h.vigente_desde <= coalesce(p_hasta, 'infinity'::date)
       AND coalesce(h.vigente_hasta, 'infinity'::date) >= p_desde);
$$;

-- ─── 5. Retirar salidas que ya no corresponden ───────────────────────────────
-- Para cada viaje PROGRAMADO con salida futura (bloqueados en orden de id, antes de contar boletos,
-- como auto_expirar_reserva):
--   · sin movimiento (ningún boleto en ningún estado ni encomienda que lo referencie; son las únicas
--     FK hacia viajes y no tienen ON DELETE) → DELETE;
--   · con boletos RESERVADO/PAGADO/USADO o encomiendas → no se toca el viaje salvo marcarlo
--     fuera_de_horario y soltarlo del horario (horario_id = NULL) para que su día pueda tener la salida
--     nueva; se devuelve en `conservadas`;
--   · solo con boletos CANCELADO/EXPIRADO → estado CANCELADO y horario_id = NULL (el hueco queda libre
--     y se regenera si el día vuelve a corresponder).
CREATE OR REPLACE FUNCTION public._retirar_salidas(p_viaje_ids uuid[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v record; v_ocupados integer; v_total integer; v_enc integer;
  v_quitadas integer := 0; v_conservadas jsonb := '[]'::jsonb;
BEGIN
  IF p_viaje_ids IS NULL OR cardinality(p_viaje_ids) = 0 THEN
    RETURN jsonb_build_object('quitadas', 0, 'conservadas', v_conservadas);
  END IF;
  FOR v IN
    SELECT vj.id, vj.fecha_hora_salida FROM public.viajes vj
     WHERE vj.id = ANY (p_viaje_ids) AND vj.estado = 'PROGRAMADO' AND vj.fecha_hora_salida > now()
     ORDER BY vj.id FOR UPDATE
  LOOP
    SELECT count(*) FILTER (WHERE b.estado IN ('RESERVADO', 'PAGADO', 'USADO')), count(*)
      INTO v_ocupados, v_total FROM public.boletos b WHERE b.viaje_id = v.id;
    SELECT count(*) INTO v_enc FROM public.encomiendas e WHERE e.viaje_id = v.id;
    IF v_ocupados > 0 OR v_enc > 0 THEN
      UPDATE public.viajes SET fuera_de_horario = true, horario_id = NULL WHERE id = v.id;
      v_conservadas := v_conservadas || jsonb_build_object(
        'viaje_id', v.id, 'fecha_hora_salida', v.fecha_hora_salida, 'ocupados', v_ocupados, 'encomiendas', v_enc);
    ELSIF v_total = 0 THEN
      DELETE FROM public.viajes WHERE id = v.id;
      v_quitadas := v_quitadas + 1;
    ELSE
      UPDATE public.viajes SET estado = 'CANCELADO', horario_id = NULL, fuera_de_horario = false WHERE id = v.id;
      v_quitadas := v_quitadas + 1;
    END IF;
  END LOOP;
  RETURN jsonb_build_object('quitadas', v_quitadas, 'conservadas', v_conservadas);
END $$;

-- ─── 6. Generar salidas ──────────────────────────────────────────────────────
-- Trabajo de una cooperativa (el que llama ya tiene su candado): para cada horario activo con ruta
-- activa, cada día de hoy_VE a hoy_VE + 30 que corresponda y no sea no laborable:
--   · si ese día ya tiene salida de ese horario (en cualquier estado), no hace nada;
--   · si hay un viaje PROGRAMADO de la misma ruta en ese instante exacto sin horario (p. ej. un
--     recurrente creado antes de existir los horarios, o una salida con pasajeros que quedó "fuera
--     de horario" al desactivar el horario o marcar el día no laborable y vuelve a corresponder),
--     lo adopta (conserva bus y capacidad, y deja de estar fuera de horario) en vez de duplicarlo;
--   · si no, crea la salida sin bus con la capacidad del horario.
-- Devuelve cuántas creó. El INSERT lo hace el dueño de la función: proteger_viajes_cliente_fn no actúa.
CREATE OR REPLACE FUNCTION public._generar_salidas_coop(p_coop uuid, p_horario_id uuid DEFAULT NULL)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_hoy date := (now() AT TIME ZONE 'America/Caracas')::date;
  v_creadas integer := 0; v_n integer; h record; d date; i integer; v_salida timestamptz; v_adoptable uuid;
BEGIN
  FOR h IN
    SELECT hh.id, hh.ruta_id, hh.hora_salida, hh.dias, hh.capacidad, hh.vigente_desde, hh.vigente_hasta,
           r.duracion_estimada_min
      FROM public.horarios hh JOIN public.rutas r ON r.id = hh.ruta_id
     WHERE hh.cooperativa_id = p_coop AND hh.activo AND r.activa AND r.duracion_estimada_min > 0
       AND (p_horario_id IS NULL OR hh.id = p_horario_id)
     ORDER BY hh.id
  LOOP
    FOR i IN 0..public._horizonte_salidas() LOOP
      d := v_hoy + i;
      CONTINUE WHEN extract(dow FROM d)::smallint <> ALL (h.dias);
      CONTINUE WHEN d < h.vigente_desde OR (h.vigente_hasta IS NOT NULL AND d > h.vigente_hasta);
      CONTINUE WHEN public._es_no_laborable(p_coop, d);
      v_salida := (d + h.hora_salida) AT TIME ZONE 'America/Caracas';
      CONTINUE WHEN v_salida <= now();
      CONTINUE WHEN EXISTS (SELECT 1 FROM public.viajes x WHERE x.horario_id = h.id AND x.fecha_servicio = d);

      -- Adopción de un viaje existente en ese instante (sin horario y programado). Incluye los
      -- "fuera de horario": si no, reactivar un horario o quitar un día no laborable crearía una
      -- salida vacía gemela junto a la que ya tiene pasajeros.
      SELECT x.id INTO v_adoptable FROM public.viajes x
       WHERE x.cooperativa_id = p_coop AND x.ruta_id = h.ruta_id AND x.fecha_hora_salida = v_salida
         AND x.estado = 'PROGRAMADO' AND x.horario_id IS NULL
       ORDER BY x.fuera_de_horario DESC, x.created_at, x.id LIMIT 1 FOR UPDATE;
      IF v_adoptable IS NOT NULL THEN
        UPDATE public.viajes SET horario_id = h.id, fecha_servicio = d, fuera_de_horario = false
         WHERE id = v_adoptable;
        CONTINUE;
      END IF;

      INSERT INTO public.viajes (ruta_id, cooperativa_id, fecha_hora_salida, fecha_hora_llegada_est,
                                 asientos_totales, asientos_disponibles, estado, recurrente, horario_id, fecha_servicio)
      VALUES (h.ruta_id, p_coop, v_salida, v_salida + make_interval(mins => h.duracion_estimada_min),
              h.capacidad, h.capacidad, 'PROGRAMADO', true, h.id, d)
      ON CONFLICT DO NOTHING;
      GET DIAGNOSTICS v_n = ROW_COUNT;
      v_creadas := v_creadas + v_n;
    END LOOP;
  END LOOP;
  RETURN v_creadas;
END $$;

-- Reconciliación: reintenta retirar las salidas fuera de horario (las reservas sin pagar ya
-- expiraron, o el admin canceló los boletos): las que quedan sin pasajeros se retiran solas.
CREATE OR REPLACE FUNCTION public._reconciliar_fuera_de_horario(p_coop uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_ids uuid[];
BEGIN
  SELECT array_agg(v.id) INTO v_ids FROM public.viajes v
   WHERE v.cooperativa_id = p_coop AND v.fuera_de_horario AND v.estado = 'PROGRAMADO' AND v.fecha_hora_salida > now();
  RETURN public._retirar_salidas(v_ids);
END $$;

-- Crea las salidas que falten (todas las cooperativas ACTIVA, o una, o un solo horario) y devuelve
-- cuántas creó. Sin cooperativa (cron): cada una en su subtransacción, para que una que falle no
-- aborte a las demás, y además reconcilia las salidas fuera de horario. Con cooperativa: los
-- errores se propagan.
CREATE OR REPLACE FUNCTION public._generar_salidas(p_cooperativa_id uuid DEFAULT NULL, p_horario_id uuid DEFAULT NULL)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_total integer := 0; c record;
BEGIN
  FOR c IN
    SELECT co.id FROM public.cooperativas co
     WHERE co.estado = 'ACTIVA' AND (p_cooperativa_id IS NULL OR co.id = p_cooperativa_id)
       AND (EXISTS (SELECT 1 FROM public.horarios h WHERE h.cooperativa_id = co.id AND h.activo)
            OR (p_cooperativa_id IS NULL AND EXISTS (SELECT 1 FROM public.viajes v
                                                       WHERE v.cooperativa_id = co.id AND v.fuera_de_horario)))
     ORDER BY co.id
  LOOP
    IF p_cooperativa_id IS NULL THEN
      BEGIN
        PERFORM public._lock_horarios(c.id);
        v_total := v_total + public._generar_salidas_coop(c.id, p_horario_id);
        IF p_horario_id IS NULL THEN PERFORM public._reconciliar_fuera_de_horario(c.id); END IF;
      EXCEPTION WHEN others THEN
        RAISE WARNING '_generar_salidas: la cooperativa % falló: %', c.id, SQLERRM;
      END;
    ELSE
      PERFORM public._lock_horarios(c.id);
      v_total := v_total + public._generar_salidas_coop(c.id, p_horario_id);
    END IF;
  END LOOP;
  RETURN v_total;
END $$;

-- Cron diario 00:15 hora de Venezuela (04:15 UTC).
DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'generar_salidas') THEN
    PERFORM cron.unschedule('generar_salidas');
  END IF;
  PERFORM cron.schedule('generar_salidas', '15 4 * * *', 'SELECT public._generar_salidas()');
END $do$;

-- Reactivar una ruta o una cooperativa vuelve a generar sus salidas (un fallo nunca bloquea el cambio).
CREATE OR REPLACE FUNCTION public.generar_salidas_ruta_fn()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.activa AND NOT coalesce(OLD.activa, false) THEN
    BEGIN
      PERFORM public._generar_salidas(NEW.cooperativa_id);
    EXCEPTION WHEN others THEN
      RAISE WARNING 'generar_salidas_ruta_fn: %', SQLERRM;
    END;
  END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS zz_generar_salidas_ruta ON public.rutas;
CREATE TRIGGER zz_generar_salidas_ruta AFTER UPDATE OF activa ON public.rutas
  FOR EACH ROW WHEN (NEW.activa AND OLD.activa IS DISTINCT FROM NEW.activa)
  EXECUTE FUNCTION public.generar_salidas_ruta_fn();

CREATE OR REPLACE FUNCTION public.generar_salidas_coop_fn()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.estado = 'ACTIVA' AND OLD.estado IS DISTINCT FROM NEW.estado THEN
    BEGIN
      PERFORM public._generar_salidas(NEW.id);
    EXCEPTION WHEN others THEN
      RAISE WARNING 'generar_salidas_coop_fn: %', SQLERRM;
    END;
  END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS zz_generar_salidas_coop ON public.cooperativas;
CREATE TRIGGER zz_generar_salidas_coop AFTER UPDATE OF estado ON public.cooperativas
  FOR EACH ROW WHEN (NEW.estado = 'ACTIVA' AND OLD.estado IS DISTINCT FROM NEW.estado)
  EXECUTE FUNCTION public.generar_salidas_coop_fn();

-- ─── 7. Asignación de unidad: helpers ────────────────────────────────────────
-- Valida un bus para una salida: de la cooperativa, activo (salvo p_exigir_activo = false, al
-- conservar un bus que ya estaba), con puestos para lo ya vendido y sin choque con otra salida
-- PROGRAMADO de ese bus. Bloquea el bus (FOR UPDATE) para que dos asignaciones simultáneas del mismo
-- bus no pasen la comprobación a la vez. Devuelve la fila del bus.
CREATE OR REPLACE FUNCTION public._validar_bus_para_viaje(
  p_coop uuid, p_bus_id uuid, p_viaje_id uuid, p_salida timestamptz, p_llegada timestamptz, p_minimo integer,
  p_exigir_activo boolean DEFAULT true
) RETURNS public.buses LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_bus public.buses; v_ch record;
BEGIN
  SELECT * INTO v_bus FROM public.buses b WHERE b.id = p_bus_id AND b.cooperativa_id = p_coop FOR UPDATE;
  IF NOT FOUND THEN
    PERFORM public._fallar('EB_DATOS_INVALIDOS',
      'No encontramos esa unidad en tu cooperativa. Actualiza la página y vuelve a elegirla.', '{"campo":"bus"}');
  END IF;
  IF p_exigir_activo AND NOT v_bus.activo THEN
    PERFORM public._fallar('EB_DATOS_INVALIDOS',
      format('La unidad %s está desactivada. Reactívala en Buses o elige otra.', v_bus.numero_unidad), '{"campo":"bus"}');
  END IF;
  IF v_bus.asientos < coalesce(p_minimo, 0) THEN
    PERFORM public._fallar('EB_DATOS_INVALIDOS',
      format('La unidad %s tiene %s puestos y ya hay vendido el puesto %s.', v_bus.numero_unidad, v_bus.asientos, p_minimo),
      jsonb_build_object('campo', 'bus', 'minimo', p_minimo));
  END IF;
  SELECT v.id, v.fecha_hora_salida, r.ciudad_origen, r.ciudad_destino INTO v_ch
    FROM public.viajes v JOIN public.rutas r ON r.id = v.ruta_id
   WHERE v.bus_id = p_bus_id AND v.estado = 'PROGRAMADO' AND v.id IS DISTINCT FROM p_viaje_id
     AND v.fecha_hora_salida < p_llegada AND v.fecha_hora_llegada_est > p_salida
   ORDER BY v.fecha_hora_salida LIMIT 1;
  IF FOUND THEN
    PERFORM public._fallar('EB_DATOS_INVALIDOS',
      format('La unidad %s ya hace la salida %s → %s el %s.', v_bus.numero_unidad,
             initcap(replace(v_ch.ciudad_origen, '_', ' ')), initcap(replace(v_ch.ciudad_destino, '_', ' ')),
             public._fecha_hora_ve(v_ch.fecha_hora_salida)),
      jsonb_build_object('campo', 'bus', 'viaje_choque', v_ch.id));
  END IF;
  RETURN v_bus;
END $$;

-- Pone (o quita, con p_bus_id NULL) la unidad de una salida. El viaje ya está bloqueado por quien llama.
-- Capacidad: sin ocupados, la del bus; con ocupados nunca sube sola, solo baja a la del bus si es
-- menor (y alcanza para lo vendido: lo valida _validar_bus_para_viaje). El contador se recalcula con la
-- regla única: disponibles = max(totales − boletos RESERVADO/PAGADO/USADO, 0).
CREATE OR REPLACE FUNCTION public._aplicar_bus(p_viaje_id uuid, p_bus_id uuid, p_nombre_chofer text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v record; v_bus public.buses; v_ocupados integer; v_mayor integer; v_minimo integer;
  v_totales integer; v_chofer text; v_unidad text;
BEGIN
  SELECT x.id, x.cooperativa_id, x.fecha_hora_salida, x.fecha_hora_llegada_est, x.asientos_totales INTO v
    FROM public.viajes x WHERE x.id = p_viaje_id;
  IF NOT FOUND THEN
    PERFORM public._fallar('EB_NO_ENCONTRADO', 'No encontramos ese viaje en tu cooperativa.');
  END IF;
  SELECT count(*), coalesce(max(CASE WHEN b.asiento ~ '^[0-9]+$' THEN b.asiento::integer END), 0)
    INTO v_ocupados, v_mayor
    FROM public.boletos b WHERE b.viaje_id = p_viaje_id AND b.estado IN ('RESERVADO', 'PAGADO', 'USADO');
  v_minimo := greatest(v_mayor, v_ocupados);

  IF p_bus_id IS NULL THEN
    v_totales := v.asientos_totales; v_chofer := NULL; v_unidad := NULL;
  ELSE
    SELECT * INTO v_bus FROM public._validar_bus_para_viaje(
      v.cooperativa_id, p_bus_id, p_viaje_id, v.fecha_hora_salida, v.fecha_hora_llegada_est, v_minimo);
    v_totales := CASE WHEN v_ocupados = 0 THEN v_bus.asientos
                      WHEN v_bus.asientos < v.asientos_totales THEN v_bus.asientos
                      ELSE v.asientos_totales END;
    v_unidad := v_bus.numero_unidad;
    v_chofer := coalesce(nullif(left(btrim(coalesce(p_nombre_chofer, '')), 80), ''), v_bus.chofer_nombre);
  END IF;

  UPDATE public.viajes
     SET bus_id = p_bus_id, numero_unidad = v_unidad, nombre_chofer = v_chofer,
         asientos_totales = v_totales, asientos_disponibles = greatest(v_totales - v_ocupados, 0)
   WHERE id = p_viaje_id;
  RETURN jsonb_build_object('viaje_id', p_viaje_id, 'bus_id', p_bus_id, 'numero_unidad', v_unidad,
                            'nombre_chofer', v_chofer, 'asientos_totales', v_totales,
                            'asientos_disponibles', greatest(v_totales - v_ocupados, 0));
END $$;

-- ─── 8. RPC de horarios (administrador de la cooperativa) ────────────────────
-- Guarda un horario (crea con p_id NULL, o edita) y lo sincroniza con sus salidas:
--   · si cambió la hora del horario, las salidas futuras PROGRAMADO sin movimiento (ningún boleto ni
--     encomienda) cuyo día sigue correspondiendo se MUEVEN en el lugar a la hora nueva, conservando
--     unidad y chofer; si a la hora nueva la unidad choca con otra salida PROGRAMADO, esa salida
--     queda sin unidad (se cuentan en `sin_unidad_por_choque`);
--   · retira las salidas futuras PROGRAMADO que ya no corresponden (día, vigencia, ruta, no laborable
--     y, si cambió la hora del horario, las que no se pudieron mover);
--   · las que siguen y no tienen unidad toman la nueva capacidad (nunca por debajo de lo vendido);
--   · genera las que falten.
CREATE OR REPLACE FUNCTION public.fn_guardar_horario(
  p_id uuid, p_ruta_id uuid, p_hora_salida time, p_dias smallint[], p_capacidad integer,
  p_vigente_desde date, p_vigente_hasta date
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_ctx record; v_hoy date := (now() AT TIME ZONE 'America/Caracas')::date;
  v_h public.horarios; v_ruta record; v_hora time; v_dias smallint[]; v_id uuid;
  v_hora_cambio boolean := false; v_ids uuid[]; v_ret jsonb := '{"quitadas":0,"conservadas":[]}'::jsonb;
  v_creadas integer := 0; v_hasta date;
  m record; v_nueva timestamptz; v_mov_ids uuid[] := ARRAY[]::uuid[]; v_sin_unidad integer := 0;
BEGIN
  SELECT * INTO v_ctx FROM public._contexto_staff();
  IF v_ctx.o_rol <> 'admin_cooperativa' THEN
    PERFORM public._fallar('EB_SIN_PERMISO', 'Solo el administrador de la cooperativa puede crear horarios.');
  END IF;
  PERFORM public._lock_horarios(v_ctx.o_cooperativa_id);

  IF p_id IS NOT NULL THEN
    SELECT * INTO v_h FROM public.horarios h WHERE h.id = p_id AND h.cooperativa_id = v_ctx.o_cooperativa_id FOR UPDATE;
    IF NOT FOUND THEN
      PERFORM public._fallar('EB_NO_ENCONTRADO', 'No encontramos ese horario en tu cooperativa.');
    END IF;
  END IF;

  -- Ruta
  IF p_ruta_id IS NULL THEN
    PERFORM public._fallar('EB_DATOS_INVALIDOS', 'Elige la ruta del horario.', '{"campo":"ruta"}');
  END IF;
  SELECT r.id, r.activa, r.duracion_estimada_min INTO v_ruta
    FROM public.rutas r WHERE r.id = p_ruta_id AND r.cooperativa_id = v_ctx.o_cooperativa_id;
  IF NOT FOUND THEN
    PERFORM public._fallar('EB_DATOS_INVALIDOS',
      'No encontramos esa ruta en tu cooperativa. Actualiza la página y vuelve a elegirla.', '{"campo":"ruta"}');
  END IF;
  IF NOT v_ruta.activa AND (p_id IS NULL OR v_h.activo OR v_h.ruta_id <> p_ruta_id) THEN
    PERFORM public._fallar('EB_DATOS_INVALIDOS', 'Esa ruta está desactivada. Reactívala en Rutas o elige otra.',
                           '{"campo":"ruta"}');
  END IF;

  -- Hora (minutos exactos)
  IF p_hora_salida IS NULL THEN
    PERFORM public._fallar('EB_DATOS_INVALIDOS', 'Elige la hora de salida.', '{"campo":"hora"}');
  END IF;
  v_hora := make_time(extract(hour FROM p_hora_salida)::integer, extract(minute FROM p_hora_salida)::integer, 0);

  -- Días (sin repetidos, ordenados)
  SELECT array_agg(DISTINCT x ORDER BY x) INTO v_dias FROM unnest(p_dias) AS x;
  IF v_dias IS NULL THEN
    PERFORM public._fallar('EB_DATOS_INVALIDOS', 'Elige al menos un día de la semana.', '{"campo":"dias"}');
  END IF;
  IF NOT public._dias_horario_validos(v_dias) THEN
    PERFORM public._fallar('EB_DATOS_INVALIDOS', 'Los días de la semana no son válidos. Elige entre lunes y domingo.',
                           '{"campo":"dias"}');
  END IF;

  -- Capacidad
  IF p_capacidad IS NULL OR p_capacidad < 1 OR p_capacidad > 80 THEN
    PERFORM public._fallar('EB_DATOS_INVALIDOS', 'La capacidad debe estar entre 1 y 80 puestos.', '{"campo":"capacidad"}');
  END IF;

  -- Vigencia
  IF p_vigente_desde IS NULL THEN
    PERFORM public._fallar('EB_DATOS_INVALIDOS', 'Elige desde qué día vale el horario.', '{"campo":"desde"}');
  END IF;
  IF p_vigente_desde < v_hoy AND (p_id IS NULL OR p_vigente_desde IS DISTINCT FROM v_h.vigente_desde) THEN
    PERFORM public._fallar('EB_DATOS_INVALIDOS', 'El horario no puede empezar en una fecha que ya pasó.', '{"campo":"desde"}');
  END IF;
  IF p_vigente_hasta IS NOT NULL AND p_vigente_hasta < p_vigente_desde THEN
    PERFORM public._fallar('EB_DATOS_INVALIDOS', 'La fecha final no puede ser anterior a la inicial.', '{"campo":"hasta"}');
  END IF;

  -- Solape con otro horario activo (si este lo es)
  IF (p_id IS NULL OR v_h.activo)
     AND public._horario_solapado(v_ctx.o_cooperativa_id, p_id, p_ruta_id, v_hora, v_dias, p_vigente_desde, p_vigente_hasta) THEN
    PERFORM public._fallar('EB_DATOS_INVALIDOS',
      'Ya hay otro horario de esta ruta a esa hora que comparte alguno de esos días. Cámbialo o edita el existente.',
      '{"campo":"hora"}');
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.horarios (cooperativa_id, ruta_id, hora_salida, dias, capacidad, vigente_desde, vigente_hasta, creado_por)
    VALUES (v_ctx.o_cooperativa_id, p_ruta_id, v_hora, v_dias, p_capacidad, p_vigente_desde, p_vigente_hasta, v_ctx.o_uid)
    RETURNING id INTO v_id;
  ELSE
    v_id := p_id;
    v_hora_cambio := v_h.hora_salida IS DISTINCT FROM v_hora;
    UPDATE public.horarios
       SET ruta_id = p_ruta_id, hora_salida = v_hora, dias = v_dias, capacidad = p_capacidad,
           vigente_desde = p_vigente_desde, vigente_hasta = p_vigente_hasta
     WHERE id = v_id;

    IF v_h.activo THEN
      -- Solo cambió la hora: las salidas futuras sin movimiento cuyo día (fecha_servicio) sigue
      -- correspondiendo se mueven en el lugar, con su unidad y su chofer. Candado en orden de id
      -- antes de mirar boletos y encomiendas. Las que no se pueden mover (tienen movimiento, o la
      -- hora nueva de hoy ya pasó) siguen el camino de siempre: _retirar_salidas.
      IF v_hora_cambio THEN
        FOR m IN
          SELECT v.id, v.fecha_servicio, v.fecha_hora_salida, v.fecha_hora_llegada_est
            FROM public.viajes v
           WHERE v.horario_id = v_id AND v.estado = 'PROGRAMADO' AND v.fecha_hora_salida > now()
             AND v.ruta_id = p_ruta_id AND v.fecha_servicio IS NOT NULL
             AND extract(dow FROM v.fecha_servicio)::smallint = ANY (v_dias)
             AND v.fecha_servicio >= p_vigente_desde
             AND (p_vigente_hasta IS NULL OR v.fecha_servicio <= p_vigente_hasta)
           ORDER BY v.id FOR UPDATE
        LOOP
          v_nueva := (m.fecha_servicio + v_hora) AT TIME ZONE 'America/Caracas';
          CONTINUE WHEN v_nueva = m.fecha_hora_salida OR v_nueva <= now();
          CONTINUE WHEN public._es_no_laborable(v_ctx.o_cooperativa_id, m.fecha_servicio);
          CONTINUE WHEN EXISTS (SELECT 1 FROM public.boletos b WHERE b.viaje_id = m.id)
                     OR EXISTS (SELECT 1 FROM public.encomiendas e WHERE e.viaje_id = m.id);
          -- Si a la hora nueva ya espera una salida "fuera de horario" (con pasajeros) de esta ruta
          -- (p. ej. la hora vuelve a ser la de antes), no se mueve: esta vacía se retira abajo y
          -- _generar_salidas adopta la que tiene pasajeros, en vez de dejar dos a la misma hora.
          CONTINUE WHEN EXISTS (SELECT 1 FROM public.viajes x
                                 WHERE x.cooperativa_id = v_ctx.o_cooperativa_id AND x.ruta_id = p_ruta_id
                                   AND x.fecha_hora_salida = v_nueva AND x.estado = 'PROGRAMADO'
                                   AND x.horario_id IS NULL AND x.fuera_de_horario);
          UPDATE public.viajes
             SET fecha_hora_salida = v_nueva,
                 fecha_hora_llegada_est = v_nueva + coalesce(make_interval(mins => v_ruta.duracion_estimada_min),
                                                             m.fecha_hora_llegada_est - m.fecha_hora_salida)
           WHERE id = m.id;
          v_mov_ids := v_mov_ids || m.id;
        END LOOP;

        -- Choque de unidad a la hora nueva, ya con todas movidas (así dos salidas hermanas del mismo
        -- bus no chocan entre sí a medio mover). Se bloquean los buses (orden de id) como hace
        -- _validar_bus_para_viaje; la salida movida que choca con otra PROGRAMADO queda por asignar.
        IF cardinality(v_mov_ids) > 0 THEN
          PERFORM 1 FROM public.buses b
            WHERE b.id IN (SELECT v.bus_id FROM public.viajes v WHERE v.id = ANY (v_mov_ids) AND v.bus_id IS NOT NULL)
            ORDER BY b.id FOR UPDATE;
          FOR m IN
            SELECT v.id, v.bus_id, v.fecha_hora_salida, v.fecha_hora_llegada_est
              FROM public.viajes v
             WHERE v.id = ANY (v_mov_ids) AND v.bus_id IS NOT NULL
             ORDER BY v.fecha_hora_salida, v.id
          LOOP
            IF EXISTS (SELECT 1 FROM public.viajes o
                        WHERE o.bus_id = m.bus_id AND o.estado = 'PROGRAMADO' AND o.id <> m.id
                          AND o.fecha_hora_salida < m.fecha_hora_llegada_est
                          AND o.fecha_hora_llegada_est > m.fecha_hora_salida) THEN
              UPDATE public.viajes SET bus_id = NULL, numero_unidad = NULL, nombre_chofer = NULL WHERE id = m.id;
              v_sin_unidad := v_sin_unidad + 1;
            END IF;
          END LOOP;
        END IF;
      END IF;

      -- Salidas futuras que ya no coinciden con el horario. El día se compara por fecha_servicio
      -- (día nominal): una salida a la que el admin movió la hora sigue siendo de ese día.
      SELECT array_agg(x.id) INTO v_ids
        FROM (SELECT v.id, v.ruta_id, v.fecha_hora_salida,
                     coalesce(v.fecha_servicio, (v.fecha_hora_salida AT TIME ZONE 'America/Caracas')::date) AS fs
                FROM public.viajes v
               WHERE v.horario_id = v_id AND v.estado = 'PROGRAMADO' AND v.fecha_hora_salida > now()) x
       WHERE NOT (x.ruta_id = p_ruta_id
                  AND extract(dow FROM x.fs)::smallint = ANY (v_dias)
                  AND x.fs >= p_vigente_desde AND (p_vigente_hasta IS NULL OR x.fs <= p_vigente_hasta)
                  AND NOT public._es_no_laborable(v_ctx.o_cooperativa_id, x.fs)
                  AND (NOT v_hora_cambio
                       OR (x.fecha_hora_salida AT TIME ZONE 'America/Caracas')::time = v_hora));
      v_ret := public._retirar_salidas(v_ids);

      -- Las que siguen y no tienen unidad toman la capacidad nueva (nunca por debajo de lo vendido).
      UPDATE public.viajes v
         SET asientos_totales = z.tot, asientos_disponibles = greatest(z.tot - z.ocu, 0)
        FROM (SELECT l.id, o.ocu, greatest(p_capacidad, o.mayor, o.ocu) AS tot
                FROM (SELECT vj.id FROM public.viajes vj
                       WHERE vj.horario_id = v_id AND vj.estado = 'PROGRAMADO' AND vj.fecha_hora_salida > now()
                         AND vj.bus_id IS NULL AND vj.numero_unidad IS NULL
                       ORDER BY vj.id FOR UPDATE) l
                CROSS JOIN LATERAL (
                  SELECT count(*)::integer AS ocu,
                         coalesce(max(CASE WHEN b.asiento ~ '^[0-9]+$' THEN b.asiento::integer END), 0) AS mayor
                    FROM public.boletos b
                   WHERE b.viaje_id = l.id AND b.estado IN ('RESERVADO', 'PAGADO', 'USADO')) o) z
       WHERE v.id = z.id;
    END IF;
  END IF;

  IF p_id IS NULL OR v_h.activo THEN
    v_creadas := public._generar_salidas(v_ctx.o_cooperativa_id, v_id);
    v_hasta := least(v_hoy + public._horizonte_salidas(), coalesce(p_vigente_hasta, v_hoy + public._horizonte_salidas()));
  END IF;

  RETURN jsonb_build_object('id', v_id, 'creadas', v_creadas, 'quitadas', (v_ret->>'quitadas')::integer,
                            'conservadas', v_ret->'conservadas', 'hasta', v_hasta,
                            'movidas', cardinality(v_mov_ids), 'sin_unidad_por_choque', v_sin_unidad);
END $$;

-- Activa o desactiva un horario. Desactivar retira sus salidas futuras sin movimiento (las que ya
-- tienen pasajeros quedan "fuera de horario" y se devuelven en `conservadas`); activar genera.
CREATE OR REPLACE FUNCTION public.fn_cambiar_estado_horario(p_id uuid, p_activo boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_ctx record; v_hoy date := (now() AT TIME ZONE 'America/Caracas')::date;
  v_h public.horarios; v_ruta_activa boolean; v_ids uuid[]; v_ret jsonb := '{"quitadas":0,"conservadas":[]}'::jsonb;
  v_creadas integer := 0; v_hasta date;
BEGIN
  SELECT * INTO v_ctx FROM public._contexto_staff();
  IF v_ctx.o_rol <> 'admin_cooperativa' THEN
    PERFORM public._fallar('EB_SIN_PERMISO', 'Solo el administrador de la cooperativa puede cambiar los horarios.');
  END IF;
  IF p_activo IS NULL THEN
    PERFORM public._fallar('EB_DATOS_INVALIDOS', 'Indica si el horario queda activo o inactivo.', '{"campo":"activo"}');
  END IF;
  PERFORM public._lock_horarios(v_ctx.o_cooperativa_id);
  SELECT * INTO v_h FROM public.horarios h WHERE h.id = p_id AND h.cooperativa_id = v_ctx.o_cooperativa_id FOR UPDATE;
  IF NOT FOUND THEN
    PERFORM public._fallar('EB_NO_ENCONTRADO', 'No encontramos ese horario en tu cooperativa.');
  END IF;

  IF p_activo THEN
    SELECT r.activa INTO v_ruta_activa FROM public.rutas r WHERE r.id = v_h.ruta_id;
    IF NOT coalesce(v_ruta_activa, false) THEN
      PERFORM public._fallar('EB_DATOS_INVALIDOS',
        'La ruta de este horario está desactivada. Reactívala en Rutas antes de activar el horario.', '{"campo":"ruta"}');
    END IF;
    IF public._horario_solapado(v_ctx.o_cooperativa_id, p_id, v_h.ruta_id, v_h.hora_salida, v_h.dias,
                                v_h.vigente_desde, v_h.vigente_hasta) THEN
      PERFORM public._fallar('EB_DATOS_INVALIDOS',
        'Ya hay otro horario activo de esta ruta a esa hora que comparte alguno de esos días.', '{"campo":"hora"}');
    END IF;
    UPDATE public.horarios SET activo = true WHERE id = p_id;
    v_creadas := public._generar_salidas(v_ctx.o_cooperativa_id, p_id);
    v_hasta := least(v_hoy + public._horizonte_salidas(),
                     coalesce(v_h.vigente_hasta, v_hoy + public._horizonte_salidas()));
  ELSE
    UPDATE public.horarios SET activo = false WHERE id = p_id;
    SELECT array_agg(v.id) INTO v_ids FROM public.viajes v
     WHERE v.horario_id = p_id AND v.estado = 'PROGRAMADO' AND v.fecha_hora_salida > now();
    v_ret := public._retirar_salidas(v_ids);
  END IF;

  -- Misma forma que fn_guardar_horario (aquí nunca se mueve ninguna salida).
  RETURN jsonb_build_object('id', p_id, 'creadas', v_creadas, 'quitadas', (v_ret->>'quitadas')::integer,
                            'conservadas', v_ret->'conservadas', 'hasta', v_hasta,
                            'movidas', 0, 'sin_unidad_por_choque', 0);
END $$;

-- ─── 9. RPC de días no laborables (administrador de la cooperativa) ──────────
-- Agrega (o actualiza, por cooperativa + fecha) un día sin salidas y retira las salidas futuras
-- PROGRAMADO generadas por horario de ese día (si se repite cada año, de todos los días con ese mes y
-- día). Los viajes extra (sin horario) no se tocan.
CREATE OR REPLACE FUNCTION public.fn_guardar_dia_no_laborable(p_fecha date, p_nombre text, p_cada_anio boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_ctx record; v_hoy date := (now() AT TIME ZONE 'America/Caracas')::date;
  v_nombre text := nullif(btrim(coalesce(p_nombre, '')), ''); v_cada boolean := coalesce(p_cada_anio, false);
  v_id uuid; v_ids uuid[]; v_ret jsonb; v_creadas integer;
BEGIN
  SELECT * INTO v_ctx FROM public._contexto_staff();
  IF v_ctx.o_rol <> 'admin_cooperativa' THEN
    PERFORM public._fallar('EB_SIN_PERMISO', 'Solo el administrador de la cooperativa puede cambiar los días no laborables.');
  END IF;
  IF p_fecha IS NULL THEN
    PERFORM public._fallar('EB_DATOS_INVALIDOS', 'Elige la fecha.', '{"campo":"fecha"}');
  END IF;
  IF p_fecha < v_hoy AND NOT v_cada THEN
    PERFORM public._fallar('EB_DATOS_INVALIDOS', 'Elige una fecha de hoy en adelante.', '{"campo":"fecha"}');
  END IF;
  IF v_nombre IS NOT NULL AND char_length(v_nombre) > 60 THEN
    PERFORM public._fallar('EB_DATOS_INVALIDOS', 'El nombre puede tener hasta 60 letras.', '{"campo":"nombre"}');
  END IF;
  PERFORM public._lock_horarios(v_ctx.o_cooperativa_id);

  INSERT INTO public.dias_no_laborables (cooperativa_id, fecha, nombre, cada_anio)
  VALUES (v_ctx.o_cooperativa_id, p_fecha, v_nombre, v_cada)
  ON CONFLICT (cooperativa_id, fecha) DO UPDATE SET nombre = EXCLUDED.nombre, cada_anio = EXCLUDED.cada_anio
  RETURNING id INTO v_id;

  SELECT array_agg(x.id) INTO v_ids
    FROM (SELECT v.id, coalesce(v.fecha_servicio, (v.fecha_hora_salida AT TIME ZONE 'America/Caracas')::date) AS fs
            FROM public.viajes v
           WHERE v.cooperativa_id = v_ctx.o_cooperativa_id AND v.horario_id IS NOT NULL
             AND v.estado = 'PROGRAMADO' AND v.fecha_hora_salida > now()) x
   WHERE x.fs = p_fecha
      OR (v_cada AND extract(month FROM x.fs) = extract(month FROM p_fecha)
                 AND extract(day FROM x.fs) = extract(day FROM p_fecha));
  v_ret := public._retirar_salidas(v_ids);
  -- Si el día ya existía y dejó de repetirse cada año, vuelven las salidas de los demás años.
  v_creadas := public._generar_salidas(v_ctx.o_cooperativa_id);

  RETURN jsonb_build_object('id', v_id, 'quitadas', (v_ret->>'quitadas')::integer,
                            'conservadas', v_ret->'conservadas', 'creadas', v_creadas);
END $$;

-- Borra un día no laborable y genera las salidas que habían quedado sin crear.
CREATE OR REPLACE FUNCTION public.fn_borrar_dia_no_laborable(p_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_ctx record; v_creadas integer;
BEGIN
  SELECT * INTO v_ctx FROM public._contexto_staff();
  IF v_ctx.o_rol <> 'admin_cooperativa' THEN
    PERFORM public._fallar('EB_SIN_PERMISO', 'Solo el administrador de la cooperativa puede cambiar los días no laborables.');
  END IF;
  PERFORM public._lock_horarios(v_ctx.o_cooperativa_id);
  DELETE FROM public.dias_no_laborables WHERE id = p_id AND cooperativa_id = v_ctx.o_cooperativa_id;
  IF NOT FOUND THEN
    PERFORM public._fallar('EB_NO_ENCONTRADO', 'No encontramos ese día. Puede que ya lo hayas borrado.');
  END IF;
  v_creadas := public._generar_salidas(v_ctx.o_cooperativa_id);
  RETURN jsonb_build_object('creadas', v_creadas);
END $$;

-- ─── 10. Asignar unidad (administrador y taquillero: es operación diaria) ────
CREATE OR REPLACE FUNCTION public.fn_asignar_bus(p_viaje_id uuid, p_bus_id uuid, p_nombre_chofer text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_ctx record; v_v record;
BEGIN
  SELECT * INTO v_ctx FROM public._contexto_staff();
  SELECT v.id, v.cooperativa_id, v.estado INTO v_v FROM public.viajes v WHERE v.id = p_viaje_id FOR UPDATE;
  IF NOT FOUND OR v_v.cooperativa_id <> v_ctx.o_cooperativa_id THEN
    PERFORM public._fallar('EB_NO_ENCONTRADO', 'No encontramos ese viaje en tu cooperativa.');
  END IF;
  IF v_v.estado <> 'PROGRAMADO' THEN
    PERFORM public._fallar('EB_ESTADO_CAMBIO', 'Solo se puede asignar unidad a los viajes programados.');
  END IF;
  RETURN public._aplicar_bus(p_viaje_id, p_bus_id, p_nombre_chofer);
END $$;

-- Repite la semana anterior: a cada salida PROGRAMADO sin unidad del rango (hora de Venezuela, futura,
-- hasta 14 días) le pone el bus y el chofer que tuvo la salida de 7 días antes (mismo horario o, si no
-- tiene, misma ruta y misma hora local; sin contar las canceladas). Cada una en su subtransacción:
-- las que no se puedan (choque, bus desactivado…) se omiten con su motivo.
CREATE OR REPLACE FUNCTION public.fn_copiar_asignaciones(p_desde date, p_hasta date)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_ctx record; v_ids uuid[]; v_id uuid; v_v record; v_o record;
  v_asignadas integer := 0; v_omitidas jsonb := '[]'::jsonb; v_motivo text;
BEGIN
  SELECT * INTO v_ctx FROM public._contexto_staff();
  IF p_desde IS NULL OR p_hasta IS NULL OR p_hasta < p_desde THEN
    PERFORM public._fallar('EB_DATOS_INVALIDOS', 'Elige el día (o el rango de días) al que quieres copiar las unidades.',
                           '{"campo":"fecha"}');
  END IF;
  IF p_hasta - p_desde > 13 THEN
    PERFORM public._fallar('EB_DATOS_INVALIDOS', 'Puedes copiar hasta 14 días a la vez.', '{"campo":"fecha"}');
  END IF;

  -- Candado de los viajes destino en orden de id (antes de mirar boletos o buses).
  SELECT array_agg(t.id ORDER BY t.id) INTO v_ids FROM (
    SELECT vj.id FROM public.viajes vj
     WHERE vj.cooperativa_id = v_ctx.o_cooperativa_id AND vj.estado = 'PROGRAMADO'
       AND vj.bus_id IS NULL AND vj.numero_unidad IS NULL AND vj.fecha_hora_salida > now()
       AND vj.fecha_hora_salida >= (p_desde::timestamp AT TIME ZONE 'America/Caracas')
       AND vj.fecha_hora_salida < ((p_hasta + 1)::timestamp AT TIME ZONE 'America/Caracas')
     ORDER BY vj.id FOR UPDATE) t;

  FOREACH v_id IN ARRAY coalesce(v_ids, ARRAY[]::uuid[]) LOOP
    SELECT x.id, x.ruta_id, x.horario_id, x.fecha_servicio, x.fecha_hora_salida INTO v_v
      FROM public.viajes x WHERE x.id = v_id;
    -- Origen: la salida de hace 7 días con unidad.
    IF v_v.horario_id IS NOT NULL AND v_v.fecha_servicio IS NOT NULL THEN
      SELECT s.bus_id, s.nombre_chofer INTO v_o FROM public.viajes s
       WHERE s.horario_id = v_v.horario_id AND s.fecha_servicio = v_v.fecha_servicio - 7
         AND s.estado <> 'CANCELADO' AND s.bus_id IS NOT NULL
       ORDER BY s.fecha_hora_salida LIMIT 1;
    ELSE
      SELECT s.bus_id, s.nombre_chofer INTO v_o FROM public.viajes s
       WHERE s.cooperativa_id = v_ctx.o_cooperativa_id AND s.ruta_id = v_v.ruta_id
         AND s.estado <> 'CANCELADO' AND s.bus_id IS NOT NULL
         AND (s.fecha_hora_salida AT TIME ZONE 'America/Caracas')
             = (v_v.fecha_hora_salida AT TIME ZONE 'America/Caracas') - interval '7 days'
       ORDER BY s.fecha_hora_salida LIMIT 1;
    END IF;
    IF v_o.bus_id IS NULL THEN
      v_omitidas := v_omitidas || jsonb_build_object('viaje_id', v_id,
        'motivo', 'La salida de la semana anterior no tenía unidad asignada.');
      CONTINUE;
    END IF;
    BEGIN
      PERFORM public._aplicar_bus(v_id, v_o.bus_id, v_o.nombre_chofer);
      v_asignadas := v_asignadas + 1;
    EXCEPTION WHEN others THEN
      GET STACKED DIAGNOSTICS v_motivo = PG_EXCEPTION_HINT;
      v_omitidas := v_omitidas || jsonb_build_object('viaje_id', v_id,
        'motivo', coalesce(nullif(v_motivo, ''), 'No se pudo asignar la unidad.'));
    END;
  END LOOP;
  RETURN jsonb_build_object('asignadas', v_asignadas, 'omitidas', v_omitidas);
END $$;

-- ─── 11. fn_editar_viaje (20261109000001 §5 + regla de choque) ───────────────
-- Igual que la vigente (misma firma de 7 argumentos); al cambiar de bus o de hora con bus asignado
-- se valida con _validar_bus_para_viaje (otra salida PROGRAMADO del mismo bus que se solape = error).
-- Si el viaje no viene de un horario, su fecha_servicio sigue a la salida.
CREATE OR REPLACE FUNCTION public.fn_editar_viaje(
  p_viaje_id uuid, p_numero_unidad text DEFAULT NULL, p_nombre_chofer text DEFAULT NULL,
  p_fecha_hora_salida timestamptz DEFAULT NULL, p_asientos_totales integer DEFAULT NULL,
  p_motivo text DEFAULT NULL, p_bus_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_ctx record; v_v record; v_cambia_hora boolean; v_ocupados integer; v_mayor integer;
  v_motivo text := left(btrim(coalesce(p_motivo, '')), 300); v_avisados integer := 0; r record;
  v_salida timestamptz; v_llegada timestamptz; v_totales integer; v_disponibles integer;
  -- Bus nuevo en variables sueltas: un `record` sin asignar no se puede leer ni en una rama de
  -- CASE que no se evalúa.
  v_bus_coop uuid; v_bus_activo boolean; v_bus_unidad text; v_bus_asientos integer; v_bus_chofer text;
  v_cambia_bus boolean := false; v_bus_final uuid; v_pedidos integer; v_minimo integer;
  v_capacidad integer; v_unidad text; v_chofer text;
BEGIN
  SELECT * INTO v_ctx FROM public._contexto_staff();
  IF v_ctx.o_rol <> 'admin_cooperativa' THEN
    PERFORM public._fallar('EB_SIN_PERMISO', 'Solo el administrador de la cooperativa puede editar viajes.');
  END IF;
  SELECT v.*, ru.ciudad_origen, ru.ciudad_destino, ru.duracion_estimada_min INTO v_v
    FROM public.viajes v JOIN public.rutas ru ON ru.id = v.ruta_id
   WHERE v.id = p_viaje_id FOR UPDATE OF v;
  IF NOT FOUND OR v_v.cooperativa_id <> v_ctx.o_cooperativa_id THEN
    PERFORM public._fallar('EB_NO_ENCONTRADO', 'No encontramos ese viaje en tu cooperativa.');
  END IF;
  IF v_v.estado <> 'PROGRAMADO' THEN
    PERFORM public._fallar('EB_ESTADO_CAMBIO', 'Solo se pueden editar los viajes programados.');
  END IF;

  -- Bus nuevo: de la cooperativa y activo.
  IF p_bus_id IS NOT NULL AND p_bus_id IS DISTINCT FROM v_v.bus_id THEN
    SELECT b.cooperativa_id, b.activo, b.numero_unidad, b.asientos, b.chofer_nombre
      INTO v_bus_coop, v_bus_activo, v_bus_unidad, v_bus_asientos, v_bus_chofer
      FROM public.buses b WHERE b.id = p_bus_id;
    IF NOT FOUND OR v_bus_coop <> v_ctx.o_cooperativa_id THEN
      PERFORM public._fallar('EB_DATOS_INVALIDOS',
        'No encontramos ese bus en tu cooperativa. Actualiza la página y vuelve a elegirlo.', '{"campo":"bus"}');
    END IF;
    IF NOT v_bus_activo THEN
      PERFORM public._fallar('EB_DATOS_INVALIDOS', 'Ese bus está desactivado. Reactívalo en Buses o elige otro.',
                             '{"campo":"bus"}');
    END IF;
    v_cambia_bus := true;
  END IF;
  v_bus_final := CASE WHEN v_cambia_bus THEN p_bus_id ELSE v_v.bus_id END;

  SELECT count(*), max(CASE WHEN b.asiento ~ '^[0-9]+$' THEN b.asiento::integer END) INTO v_ocupados, v_mayor
    FROM public.boletos b
   WHERE b.viaje_id = p_viaje_id AND b.estado IN ('RESERVADO', 'PAGADO', 'USADO');
  v_minimo := greatest(coalesce(v_mayor, 0), v_ocupados);

  v_cambia_hora := p_fecha_hora_salida IS NOT NULL AND p_fecha_hora_salida <> v_v.fecha_hora_salida;
  IF v_cambia_hora AND p_fecha_hora_salida <= now() THEN
    PERFORM public._fallar('EB_DATOS_INVALIDOS', 'La nueva salida tiene que ser más tarde que ahora.',
                           '{"campo":"salida"}');
  END IF;
  IF v_cambia_hora AND v_ocupados > 0 AND length(v_motivo) < 5 THEN
    PERFORM public._fallar('EB_MOTIVO_REQUERIDO',
      'Este viaje tiene pasajeros: explica por qué cambia la hora. Les enviaremos tu mensaje.', '{"campo":"motivo"}');
  END IF;

  -- Asientos pedidos: los escritos o, al cambiar de bus, los del bus nuevo.
  v_pedidos := CASE WHEN p_asientos_totales IS NOT NULL THEN p_asientos_totales
                    WHEN v_cambia_bus THEN v_bus_asientos END;
  IF v_pedidos IS NOT NULL THEN
    IF v_pedidos < 1 OR v_pedidos > 80 THEN
      PERFORM public._fallar('EB_DATOS_INVALIDOS', 'El bus debe tener entre 1 y 80 asientos.', '{"campo":"asientos"}');
    END IF;
    IF v_pedidos < v_minimo THEN
      PERFORM public._fallar('EB_DATOS_INVALIDOS',
        CASE WHEN v_cambia_bus AND p_asientos_totales IS NULL
             THEN format('Ese bus tiene %s asientos y ya hay pasajeros hasta el asiento %s: elige un bus de al menos %s asientos.',
                         v_pedidos, v_minimo, v_minimo)
             ELSE format('Ya hay pasajeros hasta el asiento %s: el bus debe tener al menos %s asientos.', v_minimo, v_minimo)
        END,
        jsonb_build_object('campo', CASE WHEN v_cambia_bus AND p_asientos_totales IS NULL THEN 'bus' ELSE 'asientos' END,
                           'minimo', v_minimo));
    END IF;
    IF v_bus_final IS NOT NULL THEN
      v_capacidad := CASE WHEN v_cambia_bus THEN v_bus_asientos
                          ELSE (SELECT b.asientos FROM public.buses b WHERE b.id = v_bus_final) END;
      IF v_capacidad IS NOT NULL AND v_pedidos > v_capacidad THEN
        PERFORM public._fallar('EB_DATOS_INVALIDOS',
          format('El bus tiene %s asientos: el viaje no puede tener más.', v_capacidad),
          jsonb_build_object('campo', 'asientos', 'maximo', v_capacidad));
      END IF;
    END IF;
  END IF;

  v_salida := CASE WHEN v_cambia_hora THEN p_fecha_hora_salida ELSE v_v.fecha_hora_salida END;
  v_llegada := CASE WHEN v_cambia_hora
                    THEN p_fecha_hora_salida + make_interval(mins => coalesce(v_v.duracion_estimada_min, 0))
                    ELSE v_v.fecha_hora_llegada_est END;

  -- Regla de choque: el bus no puede hacer otra salida PROGRAMADO que se solape con esta.
  IF v_bus_final IS NOT NULL AND (v_cambia_bus OR v_cambia_hora) THEN
    PERFORM public._validar_bus_para_viaje(v_ctx.o_cooperativa_id, v_bus_final, p_viaje_id, v_salida, v_llegada, 0,
                                           v_cambia_bus);
  END IF;

  v_totales := coalesce(v_pedidos, v_v.asientos_totales);
  v_disponibles := CASE WHEN v_pedidos IS NULL THEN v_v.asientos_disponibles
                        ELSE greatest(v_pedidos - v_ocupados, 0) END;
  v_unidad := CASE WHEN v_cambia_bus THEN v_bus_unidad
                   WHEN v_bus_final IS NOT NULL OR p_numero_unidad IS NULL THEN v_v.numero_unidad
                   ELSE nullif(left(btrim(p_numero_unidad), 40), '') END;
  v_chofer := CASE WHEN p_nombre_chofer IS NOT NULL THEN nullif(left(btrim(p_nombre_chofer), 80), '')
                   WHEN v_cambia_bus THEN v_bus_chofer
                   ELSE v_v.nombre_chofer END;

  UPDATE public.viajes
     SET bus_id = v_bus_final, numero_unidad = v_unidad, nombre_chofer = v_chofer,
         fecha_hora_salida = v_salida, fecha_hora_llegada_est = v_llegada,
         asientos_totales = v_totales, asientos_disponibles = v_disponibles,
         fecha_servicio = CASE WHEN horario_id IS NULL THEN (v_salida AT TIME ZONE 'America/Caracas')::date
                               ELSE fecha_servicio END
   WHERE id = p_viaje_id;

  IF v_cambia_hora THEN
    FOR r IN SELECT DISTINCT ON (b.comprador_id) b.comprador_id, b.id
               FROM public.boletos b
              WHERE b.viaje_id = p_viaje_id AND b.estado IN ('RESERVADO', 'PAGADO')
              ORDER BY b.comprador_id, b.created_at LOOP
      PERFORM public._notificar_usuario(r.comprador_id, 'VIAJE_REPROGRAMADO', 'Cambió la hora de tu viaje',
        format('Tu viaje %s → %s ahora sale el %s (antes: %s). Motivo: %s. Si la nueva hora no te sirve, escríbele a la cooperativa.',
               initcap(replace(v_v.ciudad_origen, '_', ' ')), initcap(replace(v_v.ciudad_destino, '_', ' ')),
               public._fecha_hora_ve(v_salida), public._fecha_hora_ve(v_v.fecha_hora_salida),
               coalesce(nullif(v_motivo, ''), 'ajuste de horario')),
        'boleto', r.id);
      v_avisados := v_avisados + 1;
    END LOOP;
  END IF;

  RETURN jsonb_build_object('viaje_id', p_viaje_id, 'salida', v_salida, 'llegada_estimada', v_llegada,
                            'asientos_totales', v_totales, 'asientos_disponibles', v_disponibles,
                            'bus_id', v_bus_final, 'numero_unidad', v_unidad, 'nombre_chofer', v_chofer,
                            'pasajeros_avisados', v_avisados);
END $$;

-- ─── 12. proteger_viajes_cliente_fn (20261109000001 §4 + horario y choque) ───
-- INSERT directo del panel (viaje extra): nunca fija horario_id, recurrente ni fuera_de_horario;
-- fecha_servicio es el día de la salida (hora de Venezuela); y si trae bus, no puede chocar con otra
-- salida PROGRAMADO de ese bus. (No usa _validar_bus_para_viaje: esta función corre con el rol del
-- usuario, que no tiene EXECUTE sobre los helpers; la consulta de choque va en línea.)
CREATE OR REPLACE FUNCTION public.proteger_viajes_cliente_fn()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE v_coop uuid; v_activa boolean; v_bus record; v_ch record;
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
  -- Bus elegido: de la cooperativa y activo. La unidad y los asientos salen del bus; el chofer
  -- también, salvo que se haya escrito otro para este viaje.
  IF NEW.bus_id IS NOT NULL THEN
    SELECT b.cooperativa_id, b.activo, b.numero_unidad, b.asientos, b.chofer_nombre INTO v_bus
      FROM public.buses b WHERE b.id = NEW.bus_id;
    IF NOT FOUND OR v_bus.cooperativa_id IS DISTINCT FROM NEW.cooperativa_id THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'EB_DATOS_INVALIDOS',
        HINT = 'No encontramos ese bus en tu cooperativa. Actualiza la página y vuelve a elegirlo.',
        DETAIL = '{"campo":"bus"}';
    END IF;
    IF NOT v_bus.activo THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'EB_DATOS_INVALIDOS',
        HINT = 'Ese bus está desactivado. Reactívalo en Buses o elige otro.', DETAIL = '{"campo":"bus"}';
    END IF;
    SELECT v.id, v.fecha_hora_salida, r.ciudad_origen, r.ciudad_destino INTO v_ch
      FROM public.viajes v JOIN public.rutas r ON r.id = v.ruta_id
     WHERE v.bus_id = NEW.bus_id AND v.estado = 'PROGRAMADO'
       AND v.fecha_hora_salida < NEW.fecha_hora_llegada_est AND v.fecha_hora_llegada_est > NEW.fecha_hora_salida
     ORDER BY v.fecha_hora_salida LIMIT 1;
    IF FOUND THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'EB_DATOS_INVALIDOS',
        HINT = format('La unidad %s ya hace la salida %s → %s el %s a las %s.', v_bus.numero_unidad,
                      initcap(replace(v_ch.ciudad_origen, '_', ' ')), initcap(replace(v_ch.ciudad_destino, '_', ' ')),
                      to_char(v_ch.fecha_hora_salida AT TIME ZONE 'America/Caracas', 'DD/MM'),
                      ltrim(to_char(v_ch.fecha_hora_salida AT TIME ZONE 'America/Caracas', 'HH12:MI'), '0')
                      || CASE WHEN extract(hour FROM v_ch.fecha_hora_salida AT TIME ZONE 'America/Caracas') < 12
                              THEN ' a. m.' ELSE ' p. m.' END),
        DETAIL = jsonb_build_object('campo', 'bus', 'viaje_choque', v_ch.id)::text;
    END IF;
    NEW.numero_unidad := v_bus.numero_unidad;
    NEW.asientos_totales := v_bus.asientos;
    NEW.nombre_chofer := coalesce(nullif(left(btrim(coalesce(NEW.nombre_chofer, '')), 80), ''), v_bus.chofer_nombre);
  END IF;
  NEW.estado := 'PROGRAMADO';
  NEW.asientos_disponibles := NEW.asientos_totales;
  -- Un viaje extra no pertenece a ningún horario.
  NEW.horario_id := NULL;
  NEW.recurrente := false;
  NEW.fuera_de_horario := false;
  NEW.fecha_servicio := (NEW.fecha_hora_salida AT TIME ZONE 'America/Caracas')::date;
  RETURN NEW;
END $$;

-- ─── 13. fn_marcar_salida_viaje (20260719000004 + exige unidad) ──────────────
CREATE OR REPLACE FUNCTION public.fn_marcar_salida_viaje(p_viaje_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_ctx record; v_viaje record; v_liberadas integer; v_en_verificacion integer;
BEGIN
  SELECT * INTO v_ctx FROM public._contexto_staff();
  SELECT id, cooperativa_id, estado, bus_id, numero_unidad INTO v_viaje FROM public.viajes WHERE id = p_viaje_id FOR UPDATE;
  IF NOT FOUND OR v_viaje.cooperativa_id <> v_ctx.o_cooperativa_id THEN
    PERFORM public._fallar('EB_NO_ENCONTRADO', 'No encontramos ese viaje en tu cooperativa.');
  END IF;
  IF v_viaje.estado = 'EN_CURSO' THEN RETURN jsonb_build_object('estado', 'EN_CURSO', 'ya_procesado', true); END IF;
  IF v_viaje.estado <> 'PROGRAMADO' THEN
    PERFORM public._fallar('EB_ESTADO_CAMBIO', 'Este viaje no está programado.');
  END IF;
  IF v_viaje.bus_id IS NULL AND v_viaje.numero_unidad IS NULL THEN
    PERFORM public._fallar('EB_SIN_UNIDAD', 'Asigna la unidad antes de marcar la salida.', '{"campo":"bus"}');
  END IF;
  UPDATE public.viajes SET estado = 'EN_CURSO' WHERE id = p_viaje_id;
  UPDATE public.boletos b SET estado = 'EXPIRADO'
   WHERE b.viaje_id = p_viaje_id AND b.estado = 'RESERVADO'
     AND NOT EXISTS (SELECT 1 FROM public.pagos p WHERE p.id = b.pago_id AND p.estado_verificacion = 'PENDIENTE');
  GET DIAGNOSTICS v_liberadas = ROW_COUNT;
  SELECT count(*) INTO v_en_verificacion
    FROM public.boletos b JOIN public.pagos p ON p.id = b.pago_id
   WHERE b.viaje_id = p_viaje_id AND b.estado = 'RESERVADO' AND p.estado_verificacion = 'PENDIENTE';
  RETURN jsonb_build_object('estado', 'EN_CURSO', 'reservas_liberadas', v_liberadas,
                            'pagos_en_verificacion', v_en_verificacion);
END $$;

-- ─── 14. fn_bandeja_cooperativa (20260721000002 §6 + salidas sin unidad y fuera de horario) ──
CREATE OR REPLACE FUNCTION public.fn_bandeja_cooperativa()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_ctx record; v_ciudad text;
  v_pagos integer; v_reemb integer; v_reemb_usd numeric;
  v_vencer integer; v_dias_min integer; v_despachar integer; v_en_camino integer;
  v_prox record; v_prox_enc integer; v_prox_vendidos integer; v_proxima jsonb;
  v_sin_unidad integer; v_fuera integer;
  v_fin_manana timestamptz := (((now() AT TIME ZONE 'America/Caracas')::date + 2)::timestamp AT TIME ZONE 'America/Caracas');
BEGIN
  SELECT * INTO v_ctx FROM public._contexto_staff();
  SELECT s.ciudad INTO v_ciudad FROM public.sucursales s WHERE s.id = v_ctx.o_sucursal_id;

  SELECT count(*) INTO v_pagos
    FROM public.pagos p
   WHERE p.cooperativa_id = v_ctx.o_cooperativa_id AND p.tipo_pago = 'DIGITAL'
     AND NOT p.verificado AND p.rechazado_at IS NULL;

  SELECT count(*), coalesce(sum(b.monto_reembolso), 0) INTO v_reemb, v_reemb_usd
    FROM public.boletos b
   WHERE b.cooperativa_id = v_ctx.o_cooperativa_id AND b.estado = 'CANCELADO'
     AND coalesce(b.monto_reembolso, 0) > 0 AND NOT b.reembolso_procesado;

  -- En oficina de destino con 3 o más días hábiles (se devuelven a los 5).
  SELECT count(*), min(5 - public.calcular_dias_habiles(e.updated_at, now())) INTO v_vencer, v_dias_min
    FROM public.encomiendas e
   WHERE e.cooperativa_id = v_ctx.o_cooperativa_id AND e.estado = 'EN_OFICINA_DESTINO'
     AND (v_ctx.o_sucursal_id IS NULL OR e.sucursal_destino_id = v_ctx.o_sucursal_id
          OR (e.sucursal_destino_id IS NULL
              AND public.normalizar_localidad(e.ciudad_destino) = public.normalizar_localidad(v_ciudad)))
     AND public.calcular_dias_habiles(e.updated_at, now()) >= 3;

  -- Listas para salir desde aquí: pagadas, o por cobrar en destino.
  SELECT count(*) INTO v_despachar
    FROM public.encomiendas e
   WHERE e.cooperativa_id = v_ctx.o_cooperativa_id
     AND (e.estado = 'PAGADA' OR (e.estado = 'POR_PAGAR' AND e.modalidad_pago = 'DESTINO'))
     AND (v_ctx.o_sucursal_id IS NULL OR e.sucursal_origen_id = v_ctx.o_sucursal_id
          OR (e.sucursal_origen_id IS NULL
              AND public.normalizar_localidad(e.ciudad_origen) = public.normalizar_localidad(v_ciudad)));

  SELECT count(*) INTO v_en_camino
    FROM public.encomiendas e
   WHERE e.cooperativa_id = v_ctx.o_cooperativa_id AND e.estado = 'EN_TRANSITO'
     AND (v_ctx.o_sucursal_id IS NULL OR e.sucursal_destino_id = v_ctx.o_sucursal_id
          OR (e.sucursal_destino_id IS NULL
              AND public.normalizar_localidad(e.ciudad_destino) = public.normalizar_localidad(v_ciudad)));

  SELECT v.id, v.fecha_hora_salida, v.asientos_disponibles, r.ciudad_origen, r.ciudad_destino INTO v_prox
    FROM public.viajes v JOIN public.rutas r ON r.id = v.ruta_id
   WHERE v.cooperativa_id = v_ctx.o_cooperativa_id AND v.estado = 'PROGRAMADO'
     AND v.fecha_hora_salida > now() - interval '30 minutes'
     AND (v_ciudad IS NULL OR public.normalizar_localidad(r.ciudad_origen) = public.normalizar_localidad(v_ciudad))
   ORDER BY v.fecha_hora_salida
   LIMIT 1;
  IF v_prox.id IS NOT NULL THEN
    SELECT count(*) INTO v_prox_enc
      FROM public.encomiendas e
     WHERE e.cooperativa_id = v_ctx.o_cooperativa_id
       AND (e.estado = 'PAGADA' OR (e.estado = 'POR_PAGAR' AND e.modalidad_pago = 'DESTINO'))
       AND public.normalizar_localidad(e.ciudad_origen) = public.normalizar_localidad(v_prox.ciudad_origen)
       AND public.normalizar_localidad(e.ciudad_destino) = public.normalizar_localidad(v_prox.ciudad_destino);
    SELECT count(*) INTO v_prox_vendidos
      FROM public.boletos b WHERE b.viaje_id = v_prox.id AND b.estado IN ('PAGADO', 'USADO');
    v_proxima := jsonb_build_object(
      'viaje_id', v_prox.id, 'ciudad_origen', v_prox.ciudad_origen, 'ciudad_destino', v_prox.ciudad_destino,
      'salida', v_prox.fecha_hora_salida,
      'minutos_para_salir', floor(extract(epoch FROM (v_prox.fecha_hora_salida - now())) / 60)::integer,
      'boletos_vendidos', v_prox_vendidos, 'asientos_disponibles', v_prox.asientos_disponibles,
      'encomiendas_por_despachar', v_prox_enc);
  END IF;

  -- Salidas de hoy y mañana (VE) sin unidad, y salidas fuera de horario con pasajeros.
  -- Mismo filtro por ciudad de la sucursal que "próxima salida"; solo salidas que aún no pasaron.
  SELECT count(*) INTO v_sin_unidad
    FROM public.viajes v JOIN public.rutas r ON r.id = v.ruta_id
   WHERE v.cooperativa_id = v_ctx.o_cooperativa_id AND v.estado = 'PROGRAMADO'
     AND v.bus_id IS NULL AND v.numero_unidad IS NULL
     AND v.fecha_hora_salida > now() AND v.fecha_hora_salida < v_fin_manana
     AND (v_ciudad IS NULL OR public.normalizar_localidad(r.ciudad_origen) = public.normalizar_localidad(v_ciudad));
  SELECT count(*) INTO v_fuera
    FROM public.viajes v JOIN public.rutas r ON r.id = v.ruta_id
   WHERE v.cooperativa_id = v_ctx.o_cooperativa_id AND v.estado = 'PROGRAMADO' AND v.fuera_de_horario
     AND v.fecha_hora_salida > now()
     AND (v_ciudad IS NULL OR public.normalizar_localidad(r.ciudad_origen) = public.normalizar_localidad(v_ciudad));

  RETURN jsonb_build_object(
    'pagos_por_verificar', v_pagos,
    'reembolsos_por_devolver', v_reemb, 'reembolsos_usd', round(v_reemb_usd, 2),
    'encomiendas_por_vencer', v_vencer, 'dias_minimos_para_devolucion', greatest(coalesce(v_dias_min, 0), 0),
    'encomiendas_por_despachar', v_despachar, 'encomiendas_en_camino', v_en_camino,
    'salidas_sin_unidad', v_sin_unidad, 'salidas_fuera_de_horario', v_fuera,
    'proxima_salida', v_proxima, 'generado_at', now());
END $$;

-- ─── 15. Permisos ────────────────────────────────────────────────────────────
-- Helpers internos: nadie los llama por la API.
REVOKE ALL ON FUNCTION public._dias_horario_validos(smallint[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._horizonte_salidas() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._lock_horarios(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._es_no_laborable(uuid, date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._horario_solapado(uuid, uuid, uuid, time, smallint[], date, date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._retirar_salidas(uuid[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._generar_salidas_coop(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._reconciliar_fuera_de_horario(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._generar_salidas(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._validar_bus_para_viaje(uuid, uuid, uuid, timestamptz, timestamptz, integer, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._aplicar_bus(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.generar_salidas_ruta_fn() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.generar_salidas_coop_fn() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.proteger_viajes_cliente_fn() FROM PUBLIC, anon, authenticated;

-- RPC públicas: solo usuarios con sesión (la función valida su rol).
REVOKE ALL ON FUNCTION public.fn_guardar_horario(uuid, uuid, time, smallint[], integer, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_guardar_horario(uuid, uuid, time, smallint[], integer, date, date) TO authenticated;
REVOKE ALL ON FUNCTION public.fn_cambiar_estado_horario(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_cambiar_estado_horario(uuid, boolean) TO authenticated;
REVOKE ALL ON FUNCTION public.fn_guardar_dia_no_laborable(date, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_guardar_dia_no_laborable(date, text, boolean) TO authenticated;
REVOKE ALL ON FUNCTION public.fn_borrar_dia_no_laborable(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_borrar_dia_no_laborable(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.fn_asignar_bus(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_asignar_bus(uuid, uuid, text) TO authenticated;
REVOKE ALL ON FUNCTION public.fn_copiar_asignaciones(date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_copiar_asignaciones(date, date) TO authenticated;
REVOKE ALL ON FUNCTION public.fn_editar_viaje(uuid, text, text, timestamptz, integer, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_editar_viaje(uuid, text, text, timestamptz, integer, text, uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.fn_marcar_salida_viaje(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_marcar_salida_viaje(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.fn_bandeja_cooperativa() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_bandeja_cooperativa() TO authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';
