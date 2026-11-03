-- APLICAR SOLO cuando: (1) el panel nuevo esté desplegado, (2) la app nueva sea la versión mínima,
-- y (3) `grep` confirme que ningún cliente hace .from('boletos'|'pagos').insert/update/delete.
--
-- Protección: este archivo vive en supabase/migrations, así que `supabase db reset` / `db push`
-- lo ejecutarían sin preguntar. Por eso NO hace nada salvo que se active a propósito en la misma sesión:
--
--   SET enbus.aplicar_cierre_fase2 = 'si';
--   -- (pegar y ejecutar este archivo en el SQL Editor)
--   NOTIFY pgrst, 'reload schema';
--
-- Sin esa variable deja un NOTICE y termina sin cambios. Es re-ejecutable.
BEGIN;

DO $$
BEGIN
  IF coalesce(current_setting('enbus.aplicar_cierre_fase2', true), '') <> 'si' THEN
    RAISE NOTICE 'Migración 06 (cierre de escrituras directas) OMITIDA: ejecuta SET enbus.aplicar_cierre_fase2 = ''si''; cuando la app vieja ya no esté en uso.';
    RETURN;
  END IF;

  DROP POLICY IF EXISTS "Usuario compra boleto" ON public.boletos;
  DROP POLICY IF EXISTS "Comprador cancela propio boleto" ON public.boletos;
  DROP POLICY IF EXISTS "Taquillero actualiza boletos" ON public.boletos;
  DROP POLICY IF EXISTS "Pagador inserta pago digital pendiente" ON public.pagos;
  DROP POLICY IF EXISTS "Personal registra pagos de su cooperativa" ON public.pagos;
  DROP POLICY IF EXISTS "Taquillero/Admin verifica pago" ON public.pagos;
  REVOKE INSERT, UPDATE, DELETE ON public.boletos   FROM anon, authenticated;
  REVOKE INSERT, UPDATE, DELETE ON public.pagos     FROM anon, authenticated;
  REVOKE INSERT, UPDATE, DELETE ON public.tasas_bcv FROM anon, authenticated;
  DROP TRIGGER IF EXISTS vincular_pago_legado ON public.pagos;
  RAISE NOTICE 'Migración 06 aplicada: boletos, pagos y tasas_bcv solo se escriben por RPC.';
END $$;

COMMIT;
