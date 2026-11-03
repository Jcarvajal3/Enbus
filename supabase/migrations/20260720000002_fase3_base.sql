-- Fase 3 · Base: columnas nuevas, cobro de la encomienda visible para remitente y
-- destinatario, reportes de usuarios solo por RPC, fotos desde la app, protección de
-- cooperativas, alta de usuarios con Google y sucursales por ciudad.
-- Re-ejecutable. Compatible con la app y el panel de la fase 2.
-- Las columnas *_por nuevas NO llevan FK a profiles a propósito: una relación más entre
-- profiles y cooperativas/boletos/encomiendas vuelve ambiguos los embeds de PostgREST
-- (p. ej. `cooperativas(nombre, estado)` desde profiles en getUserProfile).
BEGIN;

-- ─── 1. Columnas ────────────────────────────────────────────────────────────
ALTER TABLE public.cooperativas
  ADD COLUMN IF NOT EXISTS representante       text,
  ADD COLUMN IF NOT EXISTS mensaje_registro    text,
  ADD COLUMN IF NOT EXISTS motivo_estado       text,
  ADD COLUMN IF NOT EXISTS estado_cambiado_at  timestamptz,
  ADD COLUMN IF NOT EXISTS estado_cambiado_por uuid;
COMMENT ON COLUMN public.cooperativas.motivo_estado IS
  'Motivo del último rechazo, suspensión o desactivación (lo ve la cooperativa en su panel). NULL si está ACTIVA o PENDIENTE.';

-- La landing guardaba "Representante: X. Mensaje: Y" en descripcion.
UPDATE public.cooperativas
   SET representante    = nullif(btrim(substring(descripcion FROM '^Representante: (.*?)(?:\. Mensaje: |$)')), ''),
       mensaje_registro = coalesce(mensaje_registro,
                                   nullif(btrim(substring(descripcion FROM '\. Mensaje: (.*)$')), ''))
 WHERE representante IS NULL AND descripcion LIKE 'Representante: %';

ALTER TABLE public.sucursales ADD COLUMN IF NOT EXISTS horario text;
COMMENT ON COLUMN public.sucursales.horario IS 'Horario de atención en texto libre, p. ej. "Lun a sáb 7:00 a. m. – 6:00 p. m.".';

ALTER TABLE public.boletos
  ADD COLUMN IF NOT EXISTS reembolso_procesado_at  timestamptz,
  ADD COLUMN IF NOT EXISTS reembolso_procesado_por uuid,
  ADD COLUMN IF NOT EXISTS reembolso_metodo        text,
  ADD COLUMN IF NOT EXISTS reembolso_referencia    text,
  ADD COLUMN IF NOT EXISTS reembolso_nota          text;

ALTER TABLE public.encomiendas
  ADD COLUMN IF NOT EXISTS origen_registro        text NOT NULL DEFAULT 'APP',
  ADD COLUMN IF NOT EXISTS remitente_nombre       text,
  ADD COLUMN IF NOT EXISTS remitente_cedula       text,
  ADD COLUMN IF NOT EXISTS remitente_telefono     text,
  ADD COLUMN IF NOT EXISTS idempotency_key        text,
  ADD COLUMN IF NOT EXISTS foto_cliente_path      text,
  ADD COLUMN IF NOT EXISTS foto_omitida_motivo    text,
  ADD COLUMN IF NOT EXISTS entregada_at           timestamptz,
  ADD COLUMN IF NOT EXISTS entregada_por          uuid,
  ADD COLUMN IF NOT EXISTS retiro_tercero         boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS retiro_nombre          text,
  ADD COLUMN IF NOT EXISTS retiro_cedula          text,
  ADD COLUMN IF NOT EXISTS entrega_sin_pin_motivo text;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_encomiendas_origen_registro') THEN
    ALTER TABLE public.encomiendas ADD CONSTRAINT chk_encomiendas_origen_registro
      CHECK (origen_registro IN ('APP', 'TAQUILLA'));
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS uq_encomiendas_idempotencia
  ON public.encomiendas (sender_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
COMMENT ON COLUMN public.encomiendas.origen_registro IS
  'APP: la creó el remitente en la app. TAQUILLA: alta presencial; sender_id es el empleado y el remitente real va en remitente_*.';
COMMENT ON COLUMN public.encomiendas.foto_evidencia_url IS
  'Foto que toma la taquilla. Ruta del objeto en el bucket privado fotos-encomiendas (se muestra con URL firmada). Filas antiguas pueden tener la URL completa.';
COMMENT ON COLUMN public.encomiendas.foto_cliente_path IS
  'Foto que subió el remitente desde la app (ruta del objeto en fotos-encomiendas, carpeta = id del usuario).';

-- ─── 2. updated_at de encomiendas: tampoco lo mueven el PIN ni las fotos ────
-- (auto_devolver_encomienda y "días en oficina" cuentan desde updated_at).
CREATE OR REPLACE FUNCTION public.encomiendas_updated_at_fn()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE c text[] := ARRAY['receiver_user_id','receiver_vinculado_por','receiver_vinculado_at',
                          'sucursal_origen_id','sucursal_destino_id','updated_at',
                          'intentos_pin','pin_bloqueado','foto_evidencia_url','foto_cliente_path',
                          'foto_omitida_motivo'];
BEGIN
  IF (to_jsonb(NEW) - c) IS DISTINCT FROM (to_jsonb(OLD) - c) THEN
    NEW.updated_at := now();
  END IF;
  RETURN NEW;
END $$;

-- Fotos del remitente que la app guardó en foto_evidencia_url (carpeta = id del remitente).
UPDATE public.encomiendas
   SET foto_cliente_path = foto_evidencia_url, foto_evidencia_url = NULL
 WHERE foto_cliente_path IS NULL AND foto_evidencia_url IS NOT NULL
   AND (foto_evidencia_url LIKE sender_id::text || '/%'
        OR foto_evidencia_url LIKE '%/fotos-encomiendas/' || sender_id::text || '/%');

ALTER TABLE public.incidencias
  ADD COLUMN IF NOT EXISTS boleto_id uuid REFERENCES public.boletos(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS categoria text;
CREATE INDEX IF NOT EXISTS idx_incidencias_reportado_por ON public.incidencias (reportado_por, created_at);

ALTER TABLE public.invitaciones ADD COLUMN IF NOT EXISTS revocada_at timestamptz;

-- ─── 3. Pagos: remitente y destinatario ven el cobro de su encomienda ───────
-- (pendiente fase 2: con "Pagador ve los suyos" una parte no veía el pago de la otra).
DROP POLICY IF EXISTS "Partes de la encomienda ven su cobro" ON public.pagos;
CREATE POLICY "Partes de la encomienda ven su cobro" ON public.pagos FOR SELECT
  USING (encomienda_id IS NOT NULL AND EXISTS (
           SELECT 1 FROM public.encomiendas e
            WHERE e.id = pagos.encomienda_id
              AND (e.sender_id = auth.uid() OR e.receiver_user_id = auth.uid())));

-- ─── 4. Incidencias: los usuarios reportan solo con fn_reportar_problema ────
DROP POLICY IF EXISTS "Cualquier usuario reporta" ON public.incidencias;
DROP POLICY IF EXISTS "Super admin registra incidencias" ON public.incidencias;
CREATE POLICY "Super admin registra incidencias" ON public.incidencias FOR INSERT
  WITH CHECK (public.is_super_admin());
DROP POLICY IF EXISTS "Usuario ve sus reportes" ON public.incidencias;
CREATE POLICY "Usuario ve sus reportes" ON public.incidencias FOR SELECT
  USING (reportado_por = auth.uid());

-- ─── 5. Fotos: el remitente sube la foto de su paquete en su carpeta ────────
DROP POLICY IF EXISTS "Usuario sube fotos de sus envios" ON storage.objects;
CREATE POLICY "Usuario sube fotos de sus envios" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'fotos-encomiendas' AND public.user_role() = 'user'
              AND (storage.foldername(name))[1] = auth.uid()::text);
DROP POLICY IF EXISTS "Usuario reemplaza fotos de sus envios" ON storage.objects;
CREATE POLICY "Usuario reemplaza fotos de sus envios" ON storage.objects FOR UPDATE
  USING (bucket_id = 'fotos-encomiendas' AND public.user_role() = 'user'
         AND (storage.foldername(name))[1] = auth.uid()::text);

-- ─── 6. Encomiendas creadas por clientes: columnas nuevas saneadas ──────────
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
    -- La foto del cliente va en foto_cliente_path (la app anterior la mandaba en foto_evidencia_url).
    NEW.foto_cliente_path := coalesce(NEW.foto_cliente_path, NEW.foto_evidencia_url);
    NEW.foto_evidencia_url := NULL; NEW.foto_omitida_motivo := NULL;
    NEW.origen_registro := 'APP';
    NEW.remitente_nombre := NULL; NEW.remitente_cedula := NULL; NEW.remitente_telefono := NULL;
    NEW.entregada_at := NULL; NEW.entregada_por := NULL; NEW.retiro_tercero := false;
    NEW.retiro_nombre := NULL; NEW.retiro_cedula := NULL; NEW.entrega_sin_pin_motivo := NULL;
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

-- ─── 7. Máquina de estados de encomienda: la taquilla puede rechazar en recepción ─
CREATE OR REPLACE FUNCTION public.validar_transicion_encomienda_fn()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.estado IS DISTINCT FROM NEW.estado THEN
    IF OLD.estado IN ('ENTREGADA', 'CANCELADA', 'DEVUELTA') THEN
      RAISE EXCEPTION 'No se permite salir de un estado terminal: %', OLD.estado;
    ELSIF OLD.estado = 'PENDIENTE_DE_ESCANEO' AND NEW.estado NOT IN ('EN_RECEPCION', 'CANCELADA') THEN
      RAISE EXCEPTION 'Transición no válida: % -> %', OLD.estado, NEW.estado;
    ELSIF OLD.estado = 'EN_RECEPCION' AND NEW.estado NOT IN ('POR_PAGAR', 'CANCELADA') THEN
      RAISE EXCEPTION 'Transición no válida: % -> %', OLD.estado, NEW.estado;
    ELSIF OLD.estado = 'POR_PAGAR' AND NEW.estado = 'EN_TRANSITO' AND NEW.modalidad_pago <> 'DESTINO' THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'EB_COBRO_PENDIENTE',
        HINT = format('La encomienda %s está por pagar en origen. Cóbrala antes de despacharla.', NEW.tracking_id);
    ELSIF OLD.estado = 'POR_PAGAR' AND NEW.estado NOT IN ('PAGADA', 'CANCELADA', 'EN_TRANSITO') THEN
      RAISE EXCEPTION 'Transición no válida: % -> %', OLD.estado, NEW.estado;
    ELSIF OLD.estado = 'PAGADA' AND NEW.estado NOT IN ('EN_TRANSITO') THEN
      RAISE EXCEPTION 'Transición no válida: % -> %', OLD.estado, NEW.estado;
    ELSIF OLD.estado = 'EN_TRANSITO' AND NEW.estado NOT IN ('EN_OFICINA_DESTINO') THEN
      RAISE EXCEPTION 'Transición no válida: % -> %', OLD.estado, NEW.estado;
    ELSIF OLD.estado = 'EN_OFICINA_DESTINO' AND NEW.estado NOT IN ('ENTREGADA', 'DEVUELTA') THEN
      RAISE EXCEPTION 'Transición no válida: % -> %', OLD.estado, NEW.estado;
    END IF;
    IF NEW.estado = 'ENTREGADA' AND NEW.modalidad_pago = 'DESTINO'
       AND NOT EXISTS (SELECT 1 FROM public.pagos p WHERE p.encomienda_id = NEW.id AND p.verificado) THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'EB_COBRO_PENDIENTE',
        HINT = 'Falta cobrar el envío: regístralo antes de entregarlo.';
    END IF;
  END IF;
  RETURN NEW;
END $$;

-- ─── 8. Devolución automática: sin aviso push al empleado en altas de taquilla ─
CREATE OR REPLACE FUNCTION public.auto_devolver_encomienda()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE pkg record;
BEGIN
  FOR pkg IN
    SELECT id, tracking_id, sender_id, origen_registro
      FROM public.encomiendas
     WHERE estado = 'EN_OFICINA_DESTINO'
       AND public.calcular_dias_habiles(updated_at, now()) >= 5
  LOOP
    UPDATE public.encomiendas SET estado = 'DEVUELTA' WHERE id = pkg.id;
    IF pkg.origen_registro = 'APP' THEN
      INSERT INTO public.pending_notifications (destinatario_id, recurso_tipo, recurso_id, tipo_notificacion, payload)
      VALUES (pkg.sender_id, 'encomienda', pkg.id, 'DEVOLUCION_AUTOMATICA',
              jsonb_build_object('tracking_id', pkg.tracking_id));
    END IF;
  END LOOP;
END $$;

-- ─── 9. Cooperativas: estado, comisión y calificación solo los cambia EnBus ──
CREATE OR REPLACE FUNCTION public.proteger_cooperativa_fn()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') OR coalesce(public.is_super_admin(), false) THEN
    RETURN NEW;
  END IF;
  IF (NEW.estado, NEW.comision_porcentaje, NEW.motivo_estado, NEW.estado_cambiado_at, NEW.estado_cambiado_por,
      NEW.calificacion_promedio, NEW.total_calificaciones)
     IS DISTINCT FROM
     (OLD.estado, OLD.comision_porcentaje, OLD.motivo_estado, OLD.estado_cambiado_at, OLD.estado_cambiado_por,
      OLD.calificacion_promedio, OLD.total_calificaciones) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'EB_SIN_PERMISO',
      HINT = 'El estado y la comisión de la cooperativa los cambia el equipo de EnBus.';
  END IF;
  IF (NEW.nombre, NEW.rif) IS DISTINCT FROM (OLD.nombre, OLD.rif)
     AND OLD.estado::text NOT IN ('PENDIENTE', 'RECHAZADA') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'EB_SIN_PERMISO',
      HINT = 'El nombre y el RIF solo se corrigen mientras la solicitud está en revisión. Escríbenos para cambiarlos.';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS aa_proteger_cooperativa ON public.cooperativas;
CREATE TRIGGER aa_proteger_cooperativa BEFORE UPDATE ON public.cooperativas
  FOR EACH ROW EXECUTE FUNCTION public.proteger_cooperativa_fn();

-- ─── 10. Alta de usuarios (versionada por primera vez) ──────────────────────
-- Google no manda teléfono ni cédula: se guarda un marcador único 'PENDIENTE-<id>'
-- (normalizar_cedula/telefono lo tratan como vacío) y la app los pide antes de la
-- primera compra. Si la cédula o el teléfono ya los usa otra cuenta, también se deja el
-- marcador en lugar de abortar el registro con "Database error saving new user".
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  m jsonb := coalesce(NEW.raw_user_meta_data, '{}'::jsonb);
  v_nombre text; v_tel text; v_ced text;
BEGIN
  v_nombre := coalesce(nullif(btrim(m->>'nombre_completo'), ''), nullif(btrim(m->>'full_name'), ''),
                       nullif(btrim(m->>'name'), ''), nullif(split_part(coalesce(NEW.email, ''), '@', 1), ''),
                       'Usuario EnBus');
  v_tel := nullif(btrim(m->>'telefono'), '');
  v_ced := nullif(btrim(m->>'cedula_rif'), '');
  IF v_tel IS NULL OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.telefono = v_tel) THEN
    v_tel := 'PENDIENTE-' || NEW.id::text;
  END IF;
  IF v_ced IS NULL OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.cedula_rif = v_ced) THEN
    v_ced := 'PENDIENTE-' || NEW.id::text;
  END IF;
  INSERT INTO public.profiles (id, role, nombre_completo, telefono, cedula_rif)
  VALUES (NEW.id, 'user', v_nombre, v_tel, v_ced)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger t
                  WHERE t.tgrelid = 'auth.users'::regclass AND NOT t.tgisinternal
                    AND t.tgfoid = 'public.handle_new_user()'::regprocedure) THEN
    CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
      FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
  END IF;
END $$;

-- ─── 11. Sucursales de una cooperativa en una ciudad (pase, entrega y envío) ─
CREATE OR REPLACE FUNCTION public.fn_sucursales_en_ciudad(p_cooperativa_id uuid, p_ciudad text)
RETURNS TABLE (id uuid, nombre text, direccion text, telefono text, horario text,
               ciudad text, estado_geografico text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT s.id, s.nombre, s.direccion, s.telefono, s.horario, s.ciudad, s.estado_geografico
    FROM public.sucursales s
   WHERE s.cooperativa_id = p_cooperativa_id AND s.activa
     AND public.normalizar_localidad(s.ciudad) = public.normalizar_localidad(p_ciudad)
   ORDER BY s.nombre;
$$;
REVOKE ALL ON FUNCTION public.fn_sucursales_en_ciudad(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_sucursales_en_ciudad(uuid, text) TO authenticated;

COMMIT;
