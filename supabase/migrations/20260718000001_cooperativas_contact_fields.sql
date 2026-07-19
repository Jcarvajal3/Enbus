-- Agregar campos de contacto a cooperativas para el flujo de registro
ALTER TABLE public.cooperativas
  ADD COLUMN telefono TEXT,
  ADD COLUMN email TEXT,
  ADD COLUMN descripcion TEXT;
