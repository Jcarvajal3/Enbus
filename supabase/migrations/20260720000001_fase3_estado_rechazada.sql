-- Fase 3 · #37: una solicitud rechazada deja de ser "baja permanente".
-- Va sola y sin BEGIN/COMMIT: un valor de enum nuevo no se puede usar en la misma
-- transacción en la que se crea. Re-ejecutable (IF NOT EXISTS).
ALTER TYPE public.estado_cooperativa ADD VALUE IF NOT EXISTS 'RECHAZADA' AFTER 'PENDIENTE';
