-- Robustez · RLS: una política por tabla y acción, solo para "authenticated", con las funciones
-- envueltas en (select …) para que se evalúen una vez por consulta y no por fila (advisors
-- auth_rls_initplan y multiple_permissive_policies). Además cierra huecos:
--   · invitaciones: un admin de cooperativa podía insertar (por la API) una invitación para OTRA
--     cooperativa o con rol super_admin y aceptarla con otro correo (escalada de privilegios).
--   · calificaciones: se podía calificar a cualquier cooperativa con un boleto propio, o antes de
--     viajar, y cambiar boleto/cooperativa al editarla. Ahora: boleto propio, USADO y de esa
--     cooperativa.
--   · viajes: cualquier empleado (también el taquillero) podía actualizar o borrar viajes por la
--     API (estado, asientos_disponibles…) saltándose fn_cancelar_viaje/fn_editar_viaje. Ahora solo
--     el administrador inserta (el resto va por RPC).
--   · boletos y pagos: se aplica sin condiciones el cierre de escrituras directas de
--     20260719000006 (en la base real ya estaba aplicado; un `db reset` no lo aplicaba).
--   · fotos-encomiendas: cualquier usuario autenticado podía leer y listar las fotos de todos los
--     paquetes. Ahora: el dueño de la carpeta, las partes de la encomienda, el personal de su
--     cooperativa y el super admin. Las guías (con PIN) siguen solo para el personal.
--   · anon ya no evalúa políticas: user_role(), user_cooperativa_id() e is_super_admin() dejan de
--     ser ejecutables por anon.
-- Re-ejecutable.
BEGIN;

-- Convierte texto a uuid sin fallar (para comparar carpetas de Storage con ids).
CREATE OR REPLACE FUNCTION public.uuid_o_null(p text)
RETURNS uuid LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = public, pg_temp AS $$
  SELECT CASE WHEN p ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN p::uuid END;
$$;
REVOKE ALL ON FUNCTION public.uuid_o_null(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.uuid_o_null(text) TO authenticated, service_role;

-- ─── Borrar todas las políticas de las tablas de public que se redefinen ────
DO $$
DECLARE p record;
BEGIN
  FOR p IN SELECT schemaname, tablename, policyname FROM pg_policies
            WHERE schemaname = 'public' AND tablename IN (
              'profiles', 'cooperativas', 'sucursales', 'metodos_pago_cooperativa', 'rutas', 'viajes',
              'encomiendas', 'encomienda_estado_historial', 'boletos', 'pagos', 'calificaciones', 'tarifas',
              'notificaciones_log', 'notificaciones_usuario', 'comisiones_ciclo', 'incidencias',
              'invitaciones', 'pending_notifications', 'bajas_cuenta', 'tasas_bcv', 'limites_uso') LOOP
    EXECUTE format('DROP POLICY %I ON %I.%I', p.policyname, p.schemaname, p.tablename);
  END LOOP;
END $$;

-- Cierre de escrituras directas (20260719000006, sin la variable de sesión).
REVOKE INSERT, UPDATE, DELETE ON public.boletos, public.pagos, public.tasas_bcv FROM anon, authenticated;

-- ─── profiles ────────────────────────────────────────────────────────────────
CREATE POLICY "Perfiles visibles" ON public.profiles FOR SELECT TO authenticated
  USING (id = (select auth.uid())
         OR (select public.is_super_admin())
         OR ((select public.user_role()) = 'admin_cooperativa'
             AND cooperativa_id = (select public.user_cooperativa_id())));
CREATE POLICY "Cada uno actualiza su perfil" ON public.profiles FOR UPDATE TO authenticated
  USING (id = (select auth.uid())) WITH CHECK (id = (select auth.uid()));

-- ─── cooperativas ────────────────────────────────────────────────────────────
CREATE POLICY "Cooperativas visibles" ON public.cooperativas FOR SELECT TO authenticated USING (true);
CREATE POLICY "Super admin crea cooperativas" ON public.cooperativas FOR INSERT TO authenticated
  WITH CHECK ((select public.is_super_admin()));
CREATE POLICY "Super admin o su admin actualiza" ON public.cooperativas FOR UPDATE TO authenticated
  USING ((select public.is_super_admin())
         OR ((select public.user_role()) = 'admin_cooperativa' AND id = (select public.user_cooperativa_id())))
  WITH CHECK ((select public.is_super_admin())
         OR ((select public.user_role()) = 'admin_cooperativa' AND id = (select public.user_cooperativa_id())));
CREATE POLICY "Super admin borra cooperativas" ON public.cooperativas FOR DELETE TO authenticated
  USING ((select public.is_super_admin()));

-- ─── sucursales ──────────────────────────────────────────────────────────────
CREATE POLICY "Sucursales visibles" ON public.sucursales FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin crea sucursales" ON public.sucursales FOR INSERT TO authenticated
  WITH CHECK ((select public.is_super_admin())
              OR ((select public.user_role()) = 'admin_cooperativa'
                  AND cooperativa_id = (select public.user_cooperativa_id())));
CREATE POLICY "Admin actualiza sucursales" ON public.sucursales FOR UPDATE TO authenticated
  USING ((select public.is_super_admin())
         OR ((select public.user_role()) = 'admin_cooperativa' AND cooperativa_id = (select public.user_cooperativa_id())))
  WITH CHECK ((select public.is_super_admin())
         OR ((select public.user_role()) = 'admin_cooperativa' AND cooperativa_id = (select public.user_cooperativa_id())));
CREATE POLICY "Admin borra sucursales" ON public.sucursales FOR DELETE TO authenticated
  USING ((select public.is_super_admin())
         OR ((select public.user_role()) = 'admin_cooperativa' AND cooperativa_id = (select public.user_cooperativa_id())));

-- ─── metodos_pago_cooperativa ────────────────────────────────────────────────
CREATE POLICY "Metodos de pago visibles" ON public.metodos_pago_cooperativa FOR SELECT TO authenticated
  USING (activo OR cooperativa_id = (select public.user_cooperativa_id()) OR (select public.is_super_admin()));
CREATE POLICY "Admin crea metodos de pago" ON public.metodos_pago_cooperativa FOR INSERT TO authenticated
  WITH CHECK ((select public.user_role()) = 'admin_cooperativa'
              AND cooperativa_id = (select public.user_cooperativa_id()));
CREATE POLICY "Admin actualiza metodos de pago" ON public.metodos_pago_cooperativa FOR UPDATE TO authenticated
  USING ((select public.user_role()) = 'admin_cooperativa' AND cooperativa_id = (select public.user_cooperativa_id()))
  WITH CHECK ((select public.user_role()) = 'admin_cooperativa' AND cooperativa_id = (select public.user_cooperativa_id()));
CREATE POLICY "Admin borra metodos de pago" ON public.metodos_pago_cooperativa FOR DELETE TO authenticated
  USING ((select public.user_role()) = 'admin_cooperativa' AND cooperativa_id = (select public.user_cooperativa_id()));

-- ─── rutas ───────────────────────────────────────────────────────────────────
CREATE POLICY "Rutas visibles" ON public.rutas FOR SELECT TO authenticated
  USING (activa OR cooperativa_id = (select public.user_cooperativa_id()) OR (select public.is_super_admin()));
CREATE POLICY "Admin crea rutas" ON public.rutas FOR INSERT TO authenticated
  WITH CHECK ((select public.is_super_admin())
              OR ((select public.user_role()) = 'admin_cooperativa'
                  AND cooperativa_id = (select public.user_cooperativa_id())));
CREATE POLICY "Admin actualiza rutas" ON public.rutas FOR UPDATE TO authenticated
  USING ((select public.is_super_admin())
         OR ((select public.user_role()) = 'admin_cooperativa' AND cooperativa_id = (select public.user_cooperativa_id())))
  WITH CHECK ((select public.is_super_admin())
         OR ((select public.user_role()) = 'admin_cooperativa' AND cooperativa_id = (select public.user_cooperativa_id())));
CREATE POLICY "Admin borra rutas" ON public.rutas FOR DELETE TO authenticated
  USING ((select public.is_super_admin())
         OR ((select public.user_role()) = 'admin_cooperativa' AND cooperativa_id = (select public.user_cooperativa_id())));

-- ─── viajes ──────────────────────────────────────────────────────────────────
-- Lectura: cualquier autenticado (buscador de la app). Escritura: el admin programa viajes con
-- INSERT; editar, salir, llegar y cancelar van por RPC. El super admin conserva todo.
CREATE POLICY "Viajes visibles" ON public.viajes FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin programa viajes" ON public.viajes FOR INSERT TO authenticated
  WITH CHECK ((select public.is_super_admin())
              OR ((select public.user_role()) = 'admin_cooperativa'
                  AND cooperativa_id = (select public.user_cooperativa_id())));
CREATE POLICY "Super admin actualiza viajes" ON public.viajes FOR UPDATE TO authenticated
  USING ((select public.is_super_admin())) WITH CHECK ((select public.is_super_admin()));
CREATE POLICY "Super admin borra viajes" ON public.viajes FOR DELETE TO authenticated
  USING ((select public.is_super_admin()));

-- ─── encomiendas ─────────────────────────────────────────────────────────────
-- Las columnas que cada rol puede cambiar las limitan los triggers aa_proteger_* .
CREATE POLICY "Encomiendas visibles" ON public.encomiendas FOR SELECT TO authenticated
  USING (sender_id = (select auth.uid())
         OR receiver_user_id = (select auth.uid())
         OR cooperativa_id = (select public.user_cooperativa_id())
         OR (select public.is_super_admin()));
CREATE POLICY "Pasajero registra encomiendas" ON public.encomiendas FOR INSERT TO authenticated
  WITH CHECK ((select public.user_role()) = 'user' AND sender_id = (select auth.uid()));
CREATE POLICY "Remitente o personal actualiza" ON public.encomiendas FOR UPDATE TO authenticated
  USING (sender_id = (select auth.uid()) OR cooperativa_id = (select public.user_cooperativa_id()))
  WITH CHECK (sender_id = (select auth.uid()) OR cooperativa_id = (select public.user_cooperativa_id()));

CREATE POLICY "Historial visible" ON public.encomienda_estado_historial FOR SELECT TO authenticated
  USING ((select public.is_super_admin())
         OR EXISTS (SELECT 1 FROM public.encomiendas e
                     WHERE e.id = encomienda_estado_historial.encomienda_id
                       AND (e.sender_id = (select auth.uid())
                            OR e.receiver_user_id = (select auth.uid())
                            OR e.cooperativa_id = (select public.user_cooperativa_id()))));

-- ─── boletos y pagos (solo lectura; se escriben por RPC) ─────────────────────
CREATE POLICY "Boletos visibles" ON public.boletos FOR SELECT TO authenticated
  USING (comprador_id = (select auth.uid())
         OR cooperativa_id = (select public.user_cooperativa_id())
         OR (select public.is_super_admin()));
CREATE POLICY "Pagos visibles" ON public.pagos FOR SELECT TO authenticated
  USING (pagador_id = (select auth.uid())
         OR cooperativa_id = (select public.user_cooperativa_id())
         OR (select public.is_super_admin())
         OR (encomienda_id IS NOT NULL AND EXISTS (
               SELECT 1 FROM public.encomiendas e
                WHERE e.id = pagos.encomienda_id
                  AND (e.sender_id = (select auth.uid()) OR e.receiver_user_id = (select auth.uid())))));

-- ─── calificaciones ──────────────────────────────────────────────────────────
CREATE POLICY "Calificaciones visibles" ON public.calificaciones FOR SELECT TO authenticated USING (true);
CREATE POLICY "Pasajero califica su viaje" ON public.calificaciones FOR INSERT TO authenticated
  WITH CHECK (usuario_id = (select auth.uid())
              AND EXISTS (SELECT 1 FROM public.boletos b
                           WHERE b.id = calificaciones.boleto_id AND b.comprador_id = (select auth.uid())
                             AND b.cooperativa_id = calificaciones.cooperativa_id AND b.estado = 'USADO'));
CREATE POLICY "Autor edita su calificacion" ON public.calificaciones FOR UPDATE TO authenticated
  USING (usuario_id = (select auth.uid()))
  WITH CHECK (usuario_id = (select auth.uid())
              AND EXISTS (SELECT 1 FROM public.boletos b
                           WHERE b.id = calificaciones.boleto_id AND b.comprador_id = (select auth.uid())
                             AND b.cooperativa_id = calificaciones.cooperativa_id AND b.estado = 'USADO'));
CREATE POLICY "Super admin borra calificaciones" ON public.calificaciones FOR DELETE TO authenticated
  USING ((select public.is_super_admin()));

-- ─── tarifas ─────────────────────────────────────────────────────────────────
CREATE POLICY "Tarifas visibles" ON public.tarifas FOR SELECT TO authenticated USING (true);
CREATE POLICY "Super admin crea tarifas" ON public.tarifas FOR INSERT TO authenticated
  WITH CHECK ((select public.is_super_admin()));
CREATE POLICY "Super admin actualiza tarifas" ON public.tarifas FOR UPDATE TO authenticated
  USING ((select public.is_super_admin())) WITH CHECK ((select public.is_super_admin()));
CREATE POLICY "Super admin borra tarifas" ON public.tarifas FOR DELETE TO authenticated
  USING ((select public.is_super_admin()));

-- ─── notificaciones ──────────────────────────────────────────────────────────
CREATE POLICY "Super admin ve el log" ON public.notificaciones_log FOR SELECT TO authenticated
  USING ((select public.is_super_admin()));
CREATE POLICY "Ver mis notificaciones" ON public.notificaciones_usuario FOR SELECT TO authenticated
  USING (usuario_id = (select auth.uid()));
CREATE POLICY "Marcar mis notificaciones" ON public.notificaciones_usuario FOR UPDATE TO authenticated
  USING (usuario_id = (select auth.uid())) WITH CHECK (usuario_id = (select auth.uid()));
CREATE POLICY "Super admin gestiona la cola" ON public.pending_notifications FOR ALL TO authenticated
  USING ((select public.is_super_admin())) WITH CHECK ((select public.is_super_admin()));

-- ─── comisiones ──────────────────────────────────────────────────────────────
CREATE POLICY "Comisiones visibles" ON public.comisiones_ciclo FOR SELECT TO authenticated
  USING ((select public.is_super_admin())
         OR ((select public.user_role()) = 'admin_cooperativa'
             AND cooperativa_id = (select public.user_cooperativa_id())));
CREATE POLICY "Super admin crea comisiones" ON public.comisiones_ciclo FOR INSERT TO authenticated
  WITH CHECK ((select public.is_super_admin()));
CREATE POLICY "Super admin actualiza comisiones" ON public.comisiones_ciclo FOR UPDATE TO authenticated
  USING ((select public.is_super_admin())) WITH CHECK ((select public.is_super_admin()));
CREATE POLICY "Super admin borra comisiones" ON public.comisiones_ciclo FOR DELETE TO authenticated
  USING ((select public.is_super_admin()));

-- ─── incidencias ─────────────────────────────────────────────────────────────
CREATE POLICY "Incidencias visibles" ON public.incidencias FOR SELECT TO authenticated
  USING ((select public.is_super_admin()) OR reportado_por = (select auth.uid()));
CREATE POLICY "Super admin registra incidencias" ON public.incidencias FOR INSERT TO authenticated
  WITH CHECK ((select public.is_super_admin()));
CREATE POLICY "Super admin actualiza incidencias" ON public.incidencias FOR UPDATE TO authenticated
  USING ((select public.is_super_admin())) WITH CHECK ((select public.is_super_admin()));

-- ─── invitaciones ────────────────────────────────────────────────────────────
CREATE POLICY "Invitaciones visibles" ON public.invitaciones FOR SELECT TO authenticated
  USING ((select public.is_super_admin())
         OR ((select public.user_role()) = 'admin_cooperativa'
             AND cooperativa_id = (select public.user_cooperativa_id())));
CREATE POLICY "Admin invita a su cooperativa" ON public.invitaciones FOR INSERT TO authenticated
  WITH CHECK (creado_por = (select auth.uid())
              AND ((select public.is_super_admin())
                   OR ((select public.user_role()) = 'admin_cooperativa'
                       AND cooperativa_id = (select public.user_cooperativa_id())
                       AND role IN ('taquillero', 'admin_cooperativa')))
              AND (sucursal_id IS NULL OR EXISTS (SELECT 1 FROM public.sucursales s
                                                   WHERE s.id = invitaciones.sucursal_id
                                                     AND s.cooperativa_id = invitaciones.cooperativa_id)));

-- ─── otras ───────────────────────────────────────────────────────────────────
CREATE POLICY "Super admin ve bajas" ON public.bajas_cuenta FOR SELECT TO authenticated
  USING ((select public.is_super_admin()));
CREATE POLICY "Lectura publica tasas BCV" ON public.tasas_bcv FOR SELECT TO anon, authenticated USING (true);
-- limites_uso: solo service role (fn_consumir_limite). Política explícita de "nadie".
CREATE POLICY "Sin acceso desde la API" ON public.limites_uso FOR SELECT TO authenticated USING (false);

-- ─── Storage ─────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Super Admin insert logos-cooperativas" ON storage.objects;
DROP POLICY IF EXISTS "Super Admin update logos-cooperativas" ON storage.objects;
DROP POLICY IF EXISTS "Super Admin delete logos-cooperativas" ON storage.objects;
DROP POLICY IF EXISTS "Admin de cooperativa sube su logo" ON storage.objects;
DROP POLICY IF EXISTS "Admin de cooperativa reemplaza su logo" ON storage.objects;
DROP POLICY IF EXISTS "Lectura fotos-encomiendas" ON storage.objects;
DROP POLICY IF EXISTS "Taquillero insert fotos-encomiendas" ON storage.objects;
DROP POLICY IF EXISTS "Taquillero update fotos-encomiendas" ON storage.objects;
DROP POLICY IF EXISTS "Taquillero delete fotos-encomiendas" ON storage.objects;
DROP POLICY IF EXISTS "Usuario sube fotos de sus envios" ON storage.objects;
DROP POLICY IF EXISTS "Usuario reemplaza fotos de sus envios" ON storage.objects;
DROP POLICY IF EXISTS "Guias solo para el personal de su cooperativa" ON storage.objects;
DROP POLICY IF EXISTS "Logos: subir" ON storage.objects;
DROP POLICY IF EXISTS "Logos: reemplazar" ON storage.objects;
DROP POLICY IF EXISTS "Logos: borrar" ON storage.objects;
DROP POLICY IF EXISTS "Fotos: ver" ON storage.objects;
DROP POLICY IF EXISTS "Fotos: subir" ON storage.objects;
DROP POLICY IF EXISTS "Fotos: reemplazar" ON storage.objects;
DROP POLICY IF EXISTS "Fotos: borrar" ON storage.objects;
-- "Public Access for logos-cooperativas" (SELECT, bucket público) se mantiene.

CREATE POLICY "Logos: subir" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'logos-cooperativas'
              AND ((select public.is_super_admin())
                   OR ((select public.user_role()) = 'admin_cooperativa'
                       AND (storage.foldername(name))[1] = (select public.user_cooperativa_id())::text)));
CREATE POLICY "Logos: reemplazar" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'logos-cooperativas'
         AND ((select public.is_super_admin())
              OR ((select public.user_role()) = 'admin_cooperativa'
                  AND (storage.foldername(name))[1] = (select public.user_cooperativa_id())::text)))
  WITH CHECK (bucket_id = 'logos-cooperativas'
         AND ((select public.is_super_admin())
              OR ((select public.user_role()) = 'admin_cooperativa'
                  AND (storage.foldername(name))[1] = (select public.user_cooperativa_id())::text)));
CREATE POLICY "Logos: borrar" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'logos-cooperativas' AND (select public.is_super_admin()));

-- Rutas en fotos-encomiendas:
--   <user_id>/<archivo>        foto que sube el remitente desde la app (foto_cliente_path)
--   <encomienda_id>/<archivo>  foto que toma la taquilla (foto_evidencia_url)
--   guias/<cooperativa_id>/…   guía PDF con el PIN (la sube generar-guia-pdf con service role);
--   guias/<archivo>            guías antiguas, sin PIN
CREATE POLICY "Fotos: ver" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'fotos-encomiendas' AND (
           (select public.is_super_admin())
           OR (storage.foldername(name))[1] = (select auth.uid())::text
           OR ((storage.foldername(name))[1] = 'guias'
               AND (select public.user_role()) IN ('taquillero', 'admin_cooperativa')
               AND coalesce((storage.foldername(name))[2], (select public.user_cooperativa_id())::text)
                   = (select public.user_cooperativa_id())::text)
           OR EXISTS (SELECT 1 FROM public.encomiendas e
                       WHERE (e.id = public.uuid_o_null((storage.foldername(objects.name))[1])
                              OR e.foto_cliente_path = objects.name OR e.foto_evidencia_url = objects.name)
                         AND (e.sender_id = (select auth.uid())
                              OR e.receiver_user_id = (select auth.uid())
                              OR e.cooperativa_id = (select public.user_cooperativa_id())))));
CREATE POLICY "Fotos: subir" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'fotos-encomiendas' AND (
                ((select public.user_role()) = 'user'
                 AND (storage.foldername(name))[1] = (select auth.uid())::text)
                OR ((select public.user_role()) IN ('taquillero', 'admin_cooperativa')
                    AND EXISTS (SELECT 1 FROM public.encomiendas e
                                 WHERE e.id = public.uuid_o_null((storage.foldername(objects.name))[1])
                                   AND e.cooperativa_id = (select public.user_cooperativa_id())))));
CREATE POLICY "Fotos: reemplazar" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'fotos-encomiendas' AND (
           ((select public.user_role()) = 'user'
            AND (storage.foldername(name))[1] = (select auth.uid())::text)
           OR ((select public.user_role()) IN ('taquillero', 'admin_cooperativa')
               AND EXISTS (SELECT 1 FROM public.encomiendas e
                            WHERE e.id = public.uuid_o_null((storage.foldername(objects.name))[1])
                              AND e.cooperativa_id = (select public.user_cooperativa_id())))))
  WITH CHECK (bucket_id = 'fotos-encomiendas' AND (
           ((select public.user_role()) = 'user'
            AND (storage.foldername(name))[1] = (select auth.uid())::text)
           OR ((select public.user_role()) IN ('taquillero', 'admin_cooperativa')
               AND EXISTS (SELECT 1 FROM public.encomiendas e
                            WHERE e.id = public.uuid_o_null((storage.foldername(objects.name))[1])
                              AND e.cooperativa_id = (select public.user_cooperativa_id())))));
CREATE POLICY "Fotos: borrar" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'fotos-encomiendas'
         AND (select public.user_role()) IN ('taquillero', 'admin_cooperativa')
         AND EXISTS (SELECT 1 FROM public.encomiendas e
                      WHERE e.id = public.uuid_o_null((storage.foldername(objects.name))[1])
                        AND e.cooperativa_id = (select public.user_cooperativa_id())));

-- ─── Funciones de las políticas: solo authenticated (anon ya no evalúa ninguna) ─
REVOKE ALL ON FUNCTION public.user_role() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.user_cooperativa_id() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_super_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.user_role() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.user_cooperativa_id() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated, service_role;

-- Comprobación: ninguna política que anon evalúe puede llamar a esas funciones.
DO $$
DECLARE v text;
BEGIN
  SELECT string_agg(schemaname || '.' || tablename || ' «' || policyname || '»', ', ') INTO v
    FROM pg_policies
   WHERE schemaname IN ('public', 'storage')
     AND (roles @> ARRAY['public']::name[] OR roles @> ARRAY['anon']::name[])
     AND (coalesce(qual, '') || coalesce(with_check, '')) ~ '(user_role|user_cooperativa_id|is_super_admin)\(';
  IF v IS NOT NULL THEN
    RAISE EXCEPTION 'Políticas para anon/public que llaman a funciones revocadas: %', v;
  END IF;
END $$;

COMMIT;
