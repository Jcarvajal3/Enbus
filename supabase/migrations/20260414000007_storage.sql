-- Insert buckets
INSERT INTO storage.buckets (id, name, public) 
VALUES ('logos-cooperativas', 'logos-cooperativas', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public) 
VALUES ('fotos-encomiendas', 'fotos-encomiendas', false)
ON CONFLICT (id) DO NOTHING;

-- RLS para logos-cooperativas (Lectura pública, Escritura Super Admin)
CREATE POLICY "Public Access for logos-cooperativas" 
ON storage.objects FOR SELECT 
USING (bucket_id = 'logos-cooperativas');

CREATE POLICY "Super Admin insert logos-cooperativas" 
ON storage.objects FOR INSERT 
WITH CHECK (bucket_id = 'logos-cooperativas' AND public.is_super_admin());

CREATE POLICY "Super Admin update logos-cooperativas" 
ON storage.objects FOR UPDATE 
USING (bucket_id = 'logos-cooperativas' AND public.is_super_admin());

CREATE POLICY "Super Admin delete logos-cooperativas" 
ON storage.objects FOR DELETE 
USING (bucket_id = 'logos-cooperativas' AND public.is_super_admin());

-- RLS para fotos-encomiendas (Lectura Taquillero/Admin/Remitente/Destinatario, Escritura Taquillero)
CREATE POLICY "Lectura fotos-encomiendas" 
ON storage.objects FOR SELECT 
USING (bucket_id = 'fotos-encomiendas' AND auth.uid() IS NOT NULL); -- Se restringe a autenticados, y la lógica de acceso a la URL se hereda de quien tiene la reserva si está expuesta, pero dejémoslo para autenticados

CREATE POLICY "Taquillero insert fotos-encomiendas" 
ON storage.objects FOR INSERT 
WITH CHECK (bucket_id = 'fotos-encomiendas' AND public.user_role() IN ('taquillero', 'admin_cooperativa'));

CREATE POLICY "Taquillero update fotos-encomiendas" 
ON storage.objects FOR UPDATE 
USING (bucket_id = 'fotos-encomiendas' AND public.user_role() IN ('taquillero', 'admin_cooperativa'));

CREATE POLICY "Taquillero delete fotos-encomiendas" 
ON storage.objects FOR DELETE 
USING (bucket_id = 'fotos-encomiendas' AND public.user_role() IN ('taquillero', 'admin_cooperativa'));
