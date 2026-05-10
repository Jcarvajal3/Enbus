CREATE TABLE public.invitaciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  token TEXT UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  role rol_usuario NOT NULL,
  cooperativa_id UUID NOT NULL REFERENCES public.cooperativas(id) ON DELETE CASCADE,
  sucursal_id UUID REFERENCES public.sucursales(id),
  usado BOOLEAN NOT NULL DEFAULT false,
  expira_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '48 hours'),
  creado_por UUID NOT NULL REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_invitaciones_token ON public.invitaciones(token);
CREATE INDEX idx_invitaciones_email ON public.invitaciones(email);

-- RLS
ALTER TABLE public.invitaciones ENABLE ROW LEVEL SECURITY;

-- Solo admin_cooperativa y super_admin pueden crear invitaciones
CREATE POLICY "admin_insert_invitaciones" ON public.invitaciones
  FOR INSERT WITH CHECK (
    public.user_role() IN ('admin_cooperativa', 'super_admin')
  );

-- Admin ve las invitaciones de su cooperativa
CREATE POLICY "admin_select_invitaciones" ON public.invitaciones
  FOR SELECT USING (
    public.is_super_admin()
    OR (public.user_role() = 'admin_cooperativa' AND cooperativa_id = public.user_cooperativa_id())
  );
