-- Buses de la cooperativa (sección "Buses" del panel, grupo Operación).
-- La cooperativa registra cada unidad una sola vez (número, placa, asientos y chofer) y al
-- programar un viaje la elige, igual que la ruta. `viajes` conserva numero_unidad, nombre_chofer y
-- asientos_totales como copia (snapshot) del bus al crear el viaje: manifiestos, app, embarque,
-- despacho y la hoja del viaje las siguen leyendo sin cambios. Editar un bus después no toca los
-- viajes ya programados.
--   1. Tabla buses: número de unidad único por cooperativa (sin espacios, guiones ni mayúsculas),
--      placa única por cooperativa, 1–80 asientos (lo mismo que acepta un viaje), chofer opcional.
--   2. RLS: lee el personal de la cooperativa (y el super admin); escribe solo su administrador.
--   3. viajes.bus_id (NULL en los viajes anteriores; ON DELETE SET NULL: el panel solo deja borrar
--      buses sin viajes, y si se borrara uno igual, los viajes conservan su copia).
--   4. proteger_viajes_cliente_fn: el bus de un INSERT del panel es de la cooperativa y está
--      activo; la unidad y los asientos se copian del bus (el chofer, si no se escribió otro).
--   5. fn_editar_viaje: acepta p_bus_id para cambiar de bus (nunca por debajo de los asientos ya
--      vendidos ni por encima de los del bus). Se borra la firma anterior para que PostgREST no
--      vea dos sobrecargas.
--   6. fn_checklist_cooperativa: cuenta los buses activos (paso "Registra tus buses").
-- Re-ejecutable.
BEGIN;

-- ─── 1. Tabla ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.buses (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cooperativa_id  uuid NOT NULL REFERENCES public.cooperativas(id) ON DELETE CASCADE,
  numero_unidad   text NOT NULL,
  placa           text,
  asientos        integer NOT NULL,
  chofer_nombre   text,
  chofer_telefono text,
  activo          boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  -- "Unidad 12", "U-045", "12": hasta 40 caracteres y al menos una letra o un número.
  CONSTRAINT chk_buses_numero_unidad
    CHECK (char_length(numero_unidad) BETWEEN 1 AND 40 AND numero_unidad ~ '[[:alnum:]]'),
  -- Placa venezolana sin separadores ("AB123CD", "A12BC3D"): 5 a 10 letras o números.
  CONSTRAINT chk_buses_placa
    CHECK (placa IS NULL OR placa ~ '^[A-Z0-9]{5,10}$'),
  -- Mismo rango que chk_viajes_asientos.
  CONSTRAINT chk_buses_asientos CHECK (asientos BETWEEN 1 AND 80),
  CONSTRAINT chk_buses_chofer
    CHECK ((chofer_nombre IS NULL OR char_length(chofer_nombre) BETWEEN 1 AND 80)
           AND (chofer_telefono IS NULL OR public.normalizar_telefono(chofer_telefono) IS NOT NULL))
);

COMMENT ON TABLE public.buses IS
  'Buses (unidades) de cada cooperativa. Un viaje guarda bus_id y una copia de unidad, chofer y asientos.';

-- "U-12", "u 12" y "U12" son la misma unidad dentro de una cooperativa.
CREATE UNIQUE INDEX IF NOT EXISTS uq_buses_coop_unidad
  ON public.buses (cooperativa_id, upper(regexp_replace(numero_unidad, '[^[:alnum:]]', '', 'g')));
CREATE UNIQUE INDEX IF NOT EXISTS uq_buses_coop_placa
  ON public.buses (cooperativa_id, placa) WHERE placa IS NOT NULL;
-- Selector de "Programar viaje": buses activos de la cooperativa.
CREATE INDEX IF NOT EXISTS idx_buses_coop_activo ON public.buses (cooperativa_id, activo);

DROP TRIGGER IF EXISTS set_buses_updated_at ON public.buses;
CREATE TRIGGER set_buses_updated_at BEFORE UPDATE ON public.buses
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ─── 2. RLS y privilegios ────────────────────────────────────────────────────
-- Como rutas (20261103000002), pero sin lectura pública: la app no necesita los buses (lee la
-- copia que guarda cada viaje) y el teléfono del chofer no debe salir de la cooperativa.
ALTER TABLE public.buses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Buses visibles para su cooperativa" ON public.buses;
DROP POLICY IF EXISTS "Admin crea buses" ON public.buses;
DROP POLICY IF EXISTS "Admin actualiza buses" ON public.buses;
DROP POLICY IF EXISTS "Admin borra buses" ON public.buses;

CREATE POLICY "Buses visibles para su cooperativa" ON public.buses FOR SELECT TO authenticated
  USING (cooperativa_id = (select public.user_cooperativa_id()) OR (select public.is_super_admin()));
CREATE POLICY "Admin crea buses" ON public.buses FOR INSERT TO authenticated
  WITH CHECK ((select public.is_super_admin())
              OR ((select public.user_role()) = 'admin_cooperativa'
                  AND cooperativa_id = (select public.user_cooperativa_id())));
CREATE POLICY "Admin actualiza buses" ON public.buses FOR UPDATE TO authenticated
  USING ((select public.is_super_admin())
         OR ((select public.user_role()) = 'admin_cooperativa' AND cooperativa_id = (select public.user_cooperativa_id())))
  WITH CHECK ((select public.is_super_admin())
         OR ((select public.user_role()) = 'admin_cooperativa' AND cooperativa_id = (select public.user_cooperativa_id())));
CREATE POLICY "Admin borra buses" ON public.buses FOR DELETE TO authenticated
  USING ((select public.is_super_admin())
         OR ((select public.user_role()) = 'admin_cooperativa' AND cooperativa_id = (select public.user_cooperativa_id())));

-- Igual que el resto de public (20261103000001 §4): anon no toca la tabla; nadie hace TRUNCATE.
REVOKE ALL ON public.buses FROM anon;
REVOKE TRUNCATE, TRIGGER, REFERENCES ON public.buses FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.buses TO authenticated;
GRANT ALL ON public.buses TO service_role;

-- ─── 3. viajes.bus_id ────────────────────────────────────────────────────────
ALTER TABLE public.viajes
  ADD COLUMN IF NOT EXISTS bus_id uuid REFERENCES public.buses(id) ON DELETE SET NULL;
-- "¿El bus tiene viajes?" (antes de borrarlo) y el ON DELETE SET NULL.
CREATE INDEX IF NOT EXISTS idx_viajes_bus_salida
  ON public.viajes (bus_id, fecha_hora_salida) WHERE bus_id IS NOT NULL;

-- ─── 4. viajes: INSERT directo del panel (20261103000003 §4 + el bus) ────────
CREATE OR REPLACE FUNCTION public.proteger_viajes_cliente_fn()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE v_coop uuid; v_activa boolean; v_bus record;
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
    NEW.numero_unidad := v_bus.numero_unidad;
    NEW.asientos_totales := v_bus.asientos;
    NEW.nombre_chofer := coalesce(nullif(left(btrim(coalesce(NEW.nombre_chofer, '')), 80), ''), v_bus.chofer_nombre);
  END IF;
  NEW.estado := 'PROGRAMADO';
  NEW.asientos_disponibles := NEW.asientos_totales;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.proteger_viajes_cliente_fn() FROM PUBLIC, anon, authenticated;

-- ─── 5. Editar viaje: también el bus (20260721000002 §7 + p_bus_id) ──────────
-- Un argumento NULL no cambia ese dato; '' en unidad o chofer lo borra. Con bus asignado, la
-- unidad es la del bus (p_numero_unidad se ignora). Al cambiar de bus se copian su unidad, su
-- chofer (salvo p_nombre_chofer) y sus asientos (salvo p_asientos_totales, que no puede pasar de
-- los del bus). Nunca por debajo del asiento más alto ya vendido ni de los boletos activos.
DROP FUNCTION IF EXISTS public.fn_editar_viaje(uuid, text, text, timestamptz, integer, text);

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
         asientos_totales = v_totales, asientos_disponibles = v_disponibles
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
REVOKE ALL ON FUNCTION public.fn_editar_viaje(uuid, text, text, timestamptz, integer, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_editar_viaje(uuid, text, text, timestamptz, integer, text, uuid) TO authenticated;

-- ─── 6. Checklist de puesta en marcha (20260720000005 §4 + buses) ───────────
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
    'buses', (SELECT count(*) FROM public.buses WHERE cooperativa_id = v_ctx.o_cooperativa_id AND activo),
    'viajes_proximos', (SELECT count(*) FROM public.viajes
                         WHERE cooperativa_id = v_ctx.o_cooperativa_id AND estado = 'PROGRAMADO'
                           AND fecha_hora_salida > now()),
    'taquilleros', (SELECT count(*) FROM public.profiles
                     WHERE cooperativa_id = v_ctx.o_cooperativa_id AND role = 'taquillero'),
    'invitaciones_pendientes', (SELECT count(*) FROM public.invitaciones
                                 WHERE cooperativa_id = v_ctx.o_cooperativa_id AND NOT usado
                                   AND revocada_at IS NULL AND expira_at > now()));
END $$;
REVOKE ALL ON FUNCTION public.fn_checklist_cooperativa() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_checklist_cooperativa() TO authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';
