-- Fase 4 · Guías PDF privadas (complemento de la 01; no estaba en la especificación).
-- Desde la fase 4 la guía PDF lleva el PIN de retiro. Las guías se guardan en el bucket
-- fotos-encomiendas, que cualquier usuario autenticado puede leer y listar ("Lectura
-- fotos-encomiendas", 20260414000007): sin esto, cualquiera con cuenta podría listar guias/ y
-- leer los PIN. generar-guia-pdf ahora sube a guias/<cooperativa_id>/… con el service role, y esta
-- política RESTRICTIVA deja leer guias/ solo al personal de esa cooperativa y al equipo de EnBus.
-- Las guías antiguas (guias/<archivo>.pdf, sin PIN) quedan para el personal de cualquier
-- cooperativa, como antes. Los enlaces firmados no pasan por RLS. Requiere 20260414000007.
-- Re-ejecutable.
BEGIN;

DROP POLICY IF EXISTS "Guias solo para el personal de su cooperativa" ON storage.objects;
CREATE POLICY "Guias solo para el personal de su cooperativa" ON storage.objects
  AS RESTRICTIVE FOR SELECT
  USING (
    bucket_id IS DISTINCT FROM 'fotos-encomiendas'
    OR coalesce((storage.foldername(name))[1], '') <> 'guias'
    OR coalesce(public.is_super_admin(), false)
    OR (public.user_role() IN ('taquillero', 'admin_cooperativa')
        AND coalesce((storage.foldername(name))[2], public.user_cooperativa_id()::text)
            = public.user_cooperativa_id()::text)
  );

COMMIT;
