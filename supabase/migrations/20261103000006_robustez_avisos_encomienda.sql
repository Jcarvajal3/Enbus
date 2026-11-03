-- Robustez · Avisos de cambio de estado de encomiendas (Specs/00_General/Notifications_Spec.md §2).
-- Nadie avisaba al despachar (EN_TRANSITO) ni al llegar a la oficina de destino
-- (EN_OFICINA_DESTINO): el panel marca la llegada con un UPDATE directo y su comentario supone que
-- "se disparan vía trigger", pero el trigger no existía. Ahora, en la misma transacción del cambio:
--   · EN_TRANSITO: al remitente (si la creó en la app) y al destinatario con cuenta.
--   · EN_OFICINA_DESTINO: al destinatario con cuenta, con la sucursal y el PIN de retiro.
-- Bandeja in-app + push encolado (_notificar_usuario; solo cuentas de pasajero). WhatsApp/SMS al
-- destinatario sin cuenta sigue pendiente (edge functions). DEVUELTA y CANCELADA ya avisan desde
-- auto_devolver_encomienda y fn_rechazar_encomienda_origen. Re-ejecutable.
BEGIN;

CREATE OR REPLACE FUNCTION public.avisar_estado_encomienda_fn()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_destino text; v_remitente text; v_sucursal text;
BEGIN
  IF NEW.estado IS NOT DISTINCT FROM OLD.estado OR NEW.estado NOT IN ('EN_TRANSITO', 'EN_OFICINA_DESTINO') THEN
    RETURN NULL;
  END IF;
  v_destino := initcap(replace(NEW.ciudad_destino, '_', ' '));
  v_remitente := CASE WHEN NEW.origen_registro = 'TAQUILLA'
                      THEN split_part(coalesce(nullif(btrim(NEW.remitente_nombre), ''), 'Alguien'), ' ', 1)
                      ELSE (SELECT split_part(p.nombre_completo, ' ', 1) FROM public.profiles p WHERE p.id = NEW.sender_id)
                 END;
  BEGIN
    IF NEW.estado = 'EN_TRANSITO' THEN
      IF NEW.origen_registro = 'APP' THEN
        PERFORM public._notificar_usuario(NEW.sender_id, 'ENCOMIENDA_EN_CAMINO', 'Tu envío va en camino',
          format('Tu encomienda %s fue despachada hacia %s.', NEW.tracking_id, v_destino), 'encomienda', NEW.id);
      END IF;
      IF NEW.receiver_user_id IS NOT NULL AND NEW.receiver_user_id IS DISTINCT FROM NEW.sender_id THEN
        PERFORM public._notificar_usuario(NEW.receiver_user_id, 'ENCOMIENDA_EN_CAMINO', 'Tu paquete va en camino',
          format('La encomienda %s de %s está en camino hacia %s.', NEW.tracking_id,
                 coalesce(v_remitente, 'Alguien'), v_destino), 'encomienda', NEW.id);
      END IF;
    ELSIF NEW.receiver_user_id IS NOT NULL THEN   -- EN_OFICINA_DESTINO
      SELECT s.nombre INTO v_sucursal FROM public.sucursales s WHERE s.id = NEW.sucursal_destino_id;
      PERFORM public._notificar_usuario(NEW.receiver_user_id, 'ENCOMIENDA_LISTA_RETIRO', 'Tu paquete llegó',
        format('Tu encomienda %s está lista para retirar en %s.%s Lleva tu cédula.', NEW.tracking_id,
               coalesce(v_sucursal, 'la oficina de ' || v_destino),
               CASE WHEN NEW.pin_retiro IS NOT NULL THEN ' Tu PIN de retiro: ' || NEW.pin_retiro || '.' ELSE '' END),
        'encomienda', NEW.id);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    -- Un aviso nunca debe impedir despachar o recibir la encomienda.
    RAISE WARNING 'avisar_estado_encomienda (%): %', NEW.id, SQLERRM;
  END;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.avisar_estado_encomienda_fn() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS avisar_estado_encomienda ON public.encomiendas;
CREATE TRIGGER avisar_estado_encomienda AFTER UPDATE OF estado ON public.encomiendas
  FOR EACH ROW EXECUTE FUNCTION public.avisar_estado_encomienda_fn();

COMMIT;
