-- Activar RLS en todas las tablas
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cooperativas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sucursales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.metodos_pago_cooperativa ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rutas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.viajes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.encomiendas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.encomienda_estado_historial ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.boletos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pagos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calificaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tarifas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notificaciones_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notificaciones_usuario ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comisiones_ciclo ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.incidencias ENABLE ROW LEVEL SECURITY;

-- 3.1 profiles
CREATE POLICY "Propio perfil" ON public.profiles FOR SELECT USING (id = auth.uid());
CREATE POLICY "Super Admin ve todos" ON public.profiles FOR SELECT USING (public.is_super_admin());
CREATE POLICY "Admin cooperativa ve empleados de su cooperativa" ON public.profiles FOR SELECT USING (public.user_role() = 'admin_cooperativa' AND cooperativa_id = public.user_cooperativa_id());
CREATE POLICY "Update Solo propio perfil" ON public.profiles FOR UPDATE USING (id = auth.uid());
-- El insert de profiles lo maneja automáticamente el trigger de Supabase Auth.

-- 3.2 cooperativas
CREATE POLICY "Lectura pública de datos básicos" ON public.cooperativas FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Insert Solo Super Admin" ON public.cooperativas FOR INSERT WITH CHECK (public.is_super_admin());
CREATE POLICY "Update Super Admin o Admin de cooperativa" ON public.cooperativas FOR UPDATE USING (public.is_super_admin() OR (public.user_role() = 'admin_cooperativa' AND id = public.user_cooperativa_id()));
CREATE POLICY "Delete Solo Super Admin" ON public.cooperativas FOR DELETE USING (public.is_super_admin());

-- 3.3 sucursales
CREATE POLICY "Lectura sucursales" ON public.sucursales FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Modificar sucursales" ON public.sucursales FOR ALL USING (public.is_super_admin() OR (public.user_role() = 'admin_cooperativa' AND cooperativa_id = public.user_cooperativa_id()));

-- 3.4 metodos_pago_cooperativa
CREATE POLICY "Lectura pública métodos activos" ON public.metodos_pago_cooperativa FOR SELECT USING (auth.uid() IS NOT NULL AND activo = true);
CREATE POLICY "Lectura total para empleados" ON public.metodos_pago_cooperativa FOR SELECT USING (cooperativa_id = public.user_cooperativa_id());
CREATE POLICY "Modificar metodos de pago" ON public.metodos_pago_cooperativa FOR ALL USING (public.user_role() = 'admin_cooperativa' AND cooperativa_id = public.user_cooperativa_id());

-- 3.5 rutas
CREATE POLICY "Lectura rutas activas" ON public.rutas FOR SELECT USING (auth.uid() IS NOT NULL AND activa = true);
CREATE POLICY "Lectura total rutas para empresa o Super Admin" ON public.rutas FOR SELECT USING (public.is_super_admin() OR cooperativa_id = public.user_cooperativa_id());
CREATE POLICY "Modificar rutas" ON public.rutas FOR ALL USING (public.is_super_admin() OR (public.user_role() = 'admin_cooperativa' AND cooperativa_id = public.user_cooperativa_id()));

-- 3.6 viajes
CREATE POLICY "Lectura viajes programados" ON public.viajes FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Modificar viajes cooperativa" ON public.viajes FOR ALL USING (cooperativa_id = public.user_cooperativa_id());
CREATE POLICY "Modificar viajes Super Admin" ON public.viajes FOR ALL USING (public.is_super_admin());

-- 3.7 encomiendas
CREATE POLICY "Remitente ve las suyas" ON public.encomiendas FOR SELECT USING (sender_id = auth.uid());
CREATE POLICY "Destinatario ve las suyas" ON public.encomiendas FOR SELECT USING (receiver_user_id = auth.uid());
CREATE POLICY "Taquillero ve las de su cooperativa" ON public.encomiendas FOR SELECT USING (cooperativa_id = public.user_cooperativa_id());
CREATE POLICY "Super Admin ve todas las encomiendas" ON public.encomiendas FOR SELECT USING (public.is_super_admin());
CREATE POLICY "Cualquier usuario autenticado inserta" ON public.encomiendas FOR INSERT WITH CHECK (auth.uid() IS NOT NULL AND public.user_role() = 'user');
CREATE POLICY "Remitente actualiza propia" ON public.encomiendas FOR UPDATE USING (sender_id = auth.uid());
CREATE POLICY "Taquillero actualiza de su cooperativa" ON public.encomiendas FOR UPDATE USING (cooperativa_id = public.user_cooperativa_id());

-- 3.8 boletos
CREATE POLICY "Comprador ve los suyos" ON public.boletos FOR SELECT USING (comprador_id = auth.uid());
CREATE POLICY "Taquillero ve los boletos de su cooperativa" ON public.boletos FOR SELECT USING (cooperativa_id = public.user_cooperativa_id());
CREATE POLICY "Super Admin ve boletos" ON public.boletos FOR SELECT USING (public.is_super_admin());
CREATE POLICY "Usuario compra boleto" ON public.boletos FOR INSERT WITH CHECK (public.user_role() = 'user');
CREATE POLICY "Comprador cancela propio boleto" ON public.boletos FOR UPDATE USING (comprador_id = auth.uid());
CREATE POLICY "Taquillero actualiza boletos" ON public.boletos FOR UPDATE USING (cooperativa_id = public.user_cooperativa_id());

-- 3.9 pagos
CREATE POLICY "Pagador ve los suyos" ON public.pagos FOR SELECT USING (pagador_id = auth.uid());
CREATE POLICY "Taquillero ve de su cooperativa" ON public.pagos FOR SELECT USING (cooperativa_id = public.user_cooperativa_id());
CREATE POLICY "Super Admin ve pagos" ON public.pagos FOR SELECT USING (public.is_super_admin());
CREATE POLICY "Cualquier usuario inserta pago" ON public.pagos FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Taquillero/Admin verifica pago" ON public.pagos FOR UPDATE USING (cooperativa_id = public.user_cooperativa_id());

-- 3.10 calificaciones
CREATE POLICY "Lectura publica de calificaciones" ON public.calificaciones FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Comprador inserta su calificacion" ON public.calificaciones FOR INSERT WITH CHECK (usuario_id = auth.uid());
CREATE POLICY "Autor actualiza su calificacion" ON public.calificaciones FOR UPDATE USING (usuario_id = auth.uid());
CREATE POLICY "Super admin elimina calificacion" ON public.calificaciones FOR DELETE USING (public.is_super_admin());

-- 3.11 tarifas
CREATE POLICY "Todos los autenticados ven tarifas" ON public.tarifas FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Modificar tarifas Super Admin" ON public.tarifas FOR ALL USING (public.is_super_admin());

-- 3.12 notificaciones_usuario
CREATE POLICY "Ver propias notificaciones" ON public.notificaciones_usuario FOR SELECT USING (usuario_id = auth.uid());
CREATE POLICY "Actualizar propias notificaciones" ON public.notificaciones_usuario FOR UPDATE USING (usuario_id = auth.uid());

-- 3.13 notificaciones_log (Solo del sistema, no requiere exposed, pero añadimos RLS safe fallback)
CREATE POLICY "Notificaciones_log sistema" ON public.notificaciones_log FOR ALL USING (false); -- Access is typically via security definer edge function, so disable direct client access

-- 3.14 incidencias
CREATE POLICY "Super admin ve incidencias" ON public.incidencias FOR SELECT USING (public.is_super_admin());
CREATE POLICY "Cualquier usuario reporta" ON public.incidencias FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Solo super admin actualiza" ON public.incidencias FOR UPDATE USING (public.is_super_admin());

-- 3.15 comisiones_ciclo
CREATE POLICY "Lectura comisiones" ON public.comisiones_ciclo FOR SELECT USING (public.is_super_admin() OR (public.user_role() = 'admin_cooperativa' AND cooperativa_id = public.user_cooperativa_id()));
CREATE POLICY "Super Admin modifica comisiones" ON public.comisiones_ciclo FOR ALL USING (public.is_super_admin());

-- 3.16 encomienda_estado_historial
CREATE POLICY "Lectura historial" ON public.encomienda_estado_historial FOR SELECT USING (
  public.is_super_admin() OR 
  (EXISTS (
    SELECT 1 FROM public.encomiendas 
    WHERE public.encomiendas.id = encomienda_estado_historial.encomienda_id 
    AND (
      public.encomiendas.sender_id = auth.uid() OR 
      public.encomiendas.receiver_user_id = auth.uid() OR 
      public.encomiendas.cooperativa_id = public.user_cooperativa_id()
    )
  ))
);
