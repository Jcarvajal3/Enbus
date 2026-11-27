-- Auditoría de escalabilidad E1: Realtime por Broadcast desde la base, un canal privado por usuario.
--
-- Antes, cada pasajero con la app abierta tenía 4–5 suscripciones postgres_changes (boletos ×2,
-- encomiendas enviadas, encomiendas recibidas, notificaciones). Con postgres_changes, Realtime
-- revisa el RLS de cada suscriptor por cada cambio, en un solo hilo: es el cuello de botella con
-- muchos usuarios.
--
-- Ahora un trigger publica cada cambio con realtime.send() en el canal privado del dueño:
--   · usuario:<uuid>  → boletos (comprador), encomiendas (remitente y destinatario, también el
--                        anterior si cambió) y notificaciones_usuario (usuario).
--   · viaje:<uuid>    → cambios de cupo o de estado de una salida (para la pantalla de asientos);
--                        el mensaje solo lleva id, cupo y estado.
-- El permiso se revisa UNA vez, al unirse al canal (política en realtime.messages), no por mensaje.
--
-- Formato del mensaje (evento 'cambio'):
--   { tabla, op: 'INSERT'|'UPDATE'|'DELETE', nuevo: <fila o null>, viejo: {id} o null }
-- La fila es la misma que el usuario ya puede leer por RLS (ninguna columna de estas tablas está
-- oculta a authenticated), así que el canal no expone nada nuevo.
--
-- realtime.send() captura sus propios errores (RAISE WARNING): un fallo de Realtime nunca
-- revierte una venta, un pago ni un cambio de estado.
--
-- La publicación supabase_realtime NO se toca aquí: las versiones de la app ya instaladas siguen
-- usando postgres_changes y el panel usa encomiendas. Quitar boletos, pagos, viajes y
-- notificaciones_usuario de la publicación cuando todas las instalaciones estén actualizadas.

-- ─── Usuario ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._rt_difundir_a_usuarios()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_nuevo jsonb := CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE to_jsonb(NEW) END;
  v_viejo jsonb := CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE to_jsonb(OLD) END;
  v_payload jsonb;
  v_usuario uuid;
BEGIN
  v_payload := jsonb_build_object(
    'tabla', TG_TABLE_NAME,
    'op', TG_OP,
    'nuevo', v_nuevo,
    'viejo', CASE WHEN v_viejo IS NULL THEN NULL ELSE jsonb_build_object('id', v_viejo->'id') END);

  -- TG_ARGV: columnas con el id del usuario dueño de la fila (p. ej. 'comprador_id').
  -- Se avisa al de la fila nueva y al de la vieja (si cambió, el anterior la quita de su lista).
  FOR v_usuario IN
    SELECT DISTINCT u
      FROM unnest(TG_ARGV) AS col,
           LATERAL (VALUES ((v_nuevo->>col)::uuid), ((v_viejo->>col)::uuid)) AS x(u)
     WHERE u IS NOT NULL
  LOOP
    PERFORM realtime.send(v_payload, 'cambio', 'usuario:' || v_usuario::text, true);
  END LOOP;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public._rt_difundir_a_usuarios() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS zz_rt_usuario ON public.boletos;
CREATE TRIGGER zz_rt_usuario AFTER INSERT OR UPDATE OR DELETE ON public.boletos
  FOR EACH ROW EXECUTE FUNCTION public._rt_difundir_a_usuarios('comprador_id');

DROP TRIGGER IF EXISTS zz_rt_usuario ON public.encomiendas;
CREATE TRIGGER zz_rt_usuario AFTER INSERT OR UPDATE OR DELETE ON public.encomiendas
  FOR EACH ROW EXECUTE FUNCTION public._rt_difundir_a_usuarios('sender_id', 'receiver_user_id');

DROP TRIGGER IF EXISTS zz_rt_usuario ON public.notificaciones_usuario;
CREATE TRIGGER zz_rt_usuario AFTER INSERT OR UPDATE OR DELETE ON public.notificaciones_usuario
  FOR EACH ROW EXECUTE FUNCTION public._rt_difundir_a_usuarios('usuario_id');

-- ─── Viaje (cupo) ───────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._rt_difundir_viaje()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM realtime.send(
    jsonb_build_object('tabla', 'viajes', 'op', 'UPDATE',
                       'nuevo', jsonb_build_object('id', NEW.id,
                                                   'asientos_disponibles', NEW.asientos_disponibles,
                                                   'estado', NEW.estado),
                       'viejo', jsonb_build_object('id', OLD.id)),
    'cambio', 'viaje:' || NEW.id::text, true);
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public._rt_difundir_viaje() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS zz_rt_viaje ON public.viajes;
CREATE TRIGGER zz_rt_viaje AFTER UPDATE OF asientos_disponibles, estado ON public.viajes
  FOR EACH ROW
  WHEN (OLD.asientos_disponibles IS DISTINCT FROM NEW.asientos_disponibles
        OR OLD.estado IS DISTINCT FROM NEW.estado)
  EXECUTE FUNCTION public._rt_difundir_viaje();

-- ─── Quién puede escuchar ───────────────────────────────────────────────────
-- Sin política de INSERT: ningún cliente puede publicar en estos canales, solo la base.
DROP POLICY IF EXISTS "EnBus: escuchar mi canal y los de viajes" ON realtime.messages;
CREATE POLICY "EnBus: escuchar mi canal y los de viajes" ON realtime.messages
  FOR SELECT TO authenticated
  USING (
    realtime.messages.extension = 'broadcast'
    AND (realtime.topic() = 'usuario:' || (SELECT auth.uid())::text
         OR realtime.topic() LIKE 'viaje:%')
  );
