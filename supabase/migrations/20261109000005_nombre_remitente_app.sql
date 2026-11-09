-- QA panel · Remitente "Sin nombre" en la taquilla de encomiendas.
-- Las pantallas del panel sacan el nombre de quien envía de dos sitios:
--   · Alta presencial (origen_registro = 'TAQUILLA'): remitente_nombre, que guarda
--     fn_registrar_encomienda_taquilla. Esto ya funcionaba.
--   · Encomiendas de la app (origen_registro = 'APP'): el embed sender:profiles!sender_id. La RLS
--     "Perfiles visibles" (20261103000002) solo deja leer el perfil propio, al super admin y, al
--     admin de la cooperativa, a sus empleados: el perfil del cliente llega vacío (null) y el panel
--     muestra "Sin nombre" en la lista, la recepción, el cobro, el detalle, el escaneo y la entrega.
-- Abrir profiles al personal expondría el perfil entero (cédula, teléfono, token de push). En su
-- lugar, las encomiendas de la app llevan una copia del nombre del cliente en remitente_nombre
-- (solo el nombre: la cédula y el teléfono siguen fuera, el destinatario lee la fila completa):
--   1. Al crearla, se copia de profiles.nombre_completo del remitente.
--   2. Si el cliente cambia su nombre o elimina su cuenta ("Cuenta eliminada"), se actualiza.
--   3. Esa copia no mueve updated_at (cuenta los días en oficina para la devolución automática).
--   4. Se rellenan las encomiendas de la app que ya existen.
-- Re-ejecutable.
BEGIN;

-- ─── 1. Al crear una encomienda desde la app ────────────────────────────────
-- "ac_" corre después de aa_proteger_encomiendas_cliente (que fija origen_registro = 'APP' y
-- borra remitente_* de lo que manda el cliente) y de las validaciones "ab_".
CREATE OR REPLACE FUNCTION public.nombre_remitente_app_fn()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.origen_registro = 'APP' THEN
    NEW.remitente_nombre := (SELECT left(nullif(btrim(p.nombre_completo), ''), 120)
                               FROM public.profiles p WHERE p.id = NEW.sender_id);
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS ac_nombre_remitente_app ON public.encomiendas;
CREATE TRIGGER ac_nombre_remitente_app BEFORE INSERT ON public.encomiendas
  FOR EACH ROW EXECUTE FUNCTION public.nombre_remitente_app_fn();

-- ─── 2. El cliente cambia su nombre o elimina su cuenta ─────────────────────
-- SECURITY DEFINER: los triggers aa_proteger_* dejan pasar al sistema (current_user no es
-- authenticated), y el cliente no puede escribir remitente_nombre por su cuenta.
CREATE OR REPLACE FUNCTION public.sincronizar_nombre_remitente_fn()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_nombre text := left(nullif(btrim(NEW.nombre_completo), ''), 120);
BEGIN
  IF NEW.nombre_completo IS DISTINCT FROM OLD.nombre_completo THEN
    UPDATE public.encomiendas e SET remitente_nombre = v_nombre
     WHERE e.sender_id = NEW.id AND e.origen_registro = 'APP'
       AND e.remitente_nombre IS DISTINCT FROM v_nombre;
  END IF;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  -- La copia nunca bloquea el cambio de perfil (ni la baja de la cuenta).
  RAISE WARNING 'sincronizar_nombre_remitente (%): %', NEW.id, SQLERRM;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS sincronizar_nombre_remitente ON public.profiles;
CREATE TRIGGER sincronizar_nombre_remitente AFTER UPDATE OF nombre_completo ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.sincronizar_nombre_remitente_fn();

-- ─── 3. updated_at: la copia del nombre no cuenta como cambio ───────────────
-- Igual que 20260721000001 (versión vigente) + remitente_nombre.
CREATE OR REPLACE FUNCTION public.encomiendas_updated_at_fn()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE c text[] := ARRAY['receiver_user_id','receiver_vinculado_por','receiver_vinculado_at',
                          'sucursal_origen_id','sucursal_destino_id','updated_at',
                          'intentos_pin','pin_bloqueado','pin_validado_at','pin_validado_por',
                          'foto_evidencia_url','foto_cliente_path','foto_omitida_motivo',
                          'remitente_nombre'];
BEGIN
  IF (to_jsonb(NEW) - c) IS DISTINCT FROM (to_jsonb(OLD) - c) THEN
    NEW.updated_at := now();
  END IF;
  RETURN NEW;
END $$;

-- ─── 4. Encomiendas de la app que ya existen ────────────────────────────────
-- Solo cambia remitente_nombre: no dispara avisos (UPDATE OF estado) ni mueve updated_at (paso 3);
-- los triggers aa_proteger_* dejan pasar la migración (current_user no es authenticated).
UPDATE public.encomiendas e
   SET remitente_nombre = left(nullif(btrim(p.nombre_completo), ''), 120)
  FROM public.profiles p
 WHERE p.id = e.sender_id
   AND e.origen_registro = 'APP'
   AND e.remitente_nombre IS DISTINCT FROM left(nullif(btrim(p.nombre_completo), ''), 120);

COMMENT ON COLUMN public.encomiendas.remitente_nombre IS
  'Nombre de quien envía. TAQUILLA: el remitente real (sender_id es el empleado). APP: copia de profiles.nombre_completo del remitente (triggers ac_nombre_remitente_app y sincronizar_nombre_remitente), para que el personal lo vea sin leer profiles.';

REVOKE ALL ON FUNCTION public.nombre_remitente_app_fn() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sincronizar_nombre_remitente_fn() FROM PUBLIC, anon, authenticated;

COMMIT;
