-- Helper Functions (SQL)

-- Obtener rol del usuario actual
CREATE OR REPLACE FUNCTION public.user_role() RETURNS rol_usuario AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Obtener cooperativa del usuario actual
CREATE OR REPLACE FUNCTION public.user_cooperativa_id() RETURNS UUID AS $$
  SELECT cooperativa_id FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Verificar si es super admin
CREATE OR REPLACE FUNCTION public.is_super_admin() RETURNS BOOLEAN AS $$
  SELECT public.user_role() = 'super_admin';
$$ LANGUAGE sql SECURITY DEFINER STABLE;
