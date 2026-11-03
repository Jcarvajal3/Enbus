-- Robustez · Índices para las consultas típicas con miles de usuarios.
--   · Se quitan índices duplicados (UNIQUE ya crea su índice) o cubiertos por uno compuesto: cada
--     índice de más encarece todos los INSERT/UPDATE.
--   · Compuestos para las listas de los clientes: boletos y encomiendas del usuario, notificaciones,
--     buscador de viajes por ruta y fecha, encomiendas/boletos/pagos de la cooperativa por fecha y
--     estado, reservas por vencer (cron cada minuto), cola de notificaciones.
--   · Búsquedas por código que hacían recorrido completo: rastreo público (upper(tracking_id)) y
--     escaneo de embarque (upper(qr_embarque_data), 'PASS-' || codigo_boleto).
--   · Índices de las FK sin índice (advisor unindexed_foreign_keys).
-- Re-ejecutable. Las tablas son pequeñas hoy: sin CONCURRENTLY (va dentro de la transacción).
BEGIN;

-- ─── Duplicados ──────────────────────────────────────────────────────────────
DROP INDEX IF EXISTS public.idx_boletos_codigo;               -- = boletos_codigo_boleto_key
DROP INDEX IF EXISTS public.idx_encomiendas_tracking_id;      -- = encomiendas_tracking_id_key
DROP INDEX IF EXISTS public.idx_cooperativas_rif;             -- = cooperativas_rif_key
DROP INDEX IF EXISTS public.idx_invitaciones_token;           -- = invitaciones_token_key
DROP INDEX IF EXISTS public.idx_profiles_cedula_rif;          -- = profiles_cedula_rif_key
DROP INDEX IF EXISTS public.idx_profiles_telefono;            -- = profiles_telefono_key
DROP INDEX IF EXISTS public.idx_comisiones_ciclo_overlap;     -- = uq_comisiones_ciclo_cooperativa_periodo
DROP INDEX IF EXISTS public.idx_comisiones_cooperativa_id;    -- prefijo del UNIQUE anterior

-- ─── boletos ─────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_boletos_comprador_fecha ON public.boletos (comprador_id, created_at DESC);
DROP INDEX IF EXISTS public.idx_boletos_comprador_id;
CREATE INDEX IF NOT EXISTS idx_boletos_cooperativa_fecha ON public.boletos (cooperativa_id, created_at DESC);
DROP INDEX IF EXISTS public.idx_boletos_cooperativa_id;
CREATE INDEX IF NOT EXISTS idx_boletos_reservas_por_vencer ON public.boletos (reserva_expira_at)
  WHERE estado = 'RESERVADO';
CREATE INDEX IF NOT EXISTS idx_boletos_reembolsos_pendientes ON public.boletos (cooperativa_id, updated_at)
  WHERE estado = 'CANCELADO' AND monto_reembolso > 0 AND NOT reembolso_procesado;
CREATE INDEX IF NOT EXISTS idx_boletos_qr_upper ON public.boletos (upper(qr_embarque_data));
CREATE INDEX IF NOT EXISTS idx_boletos_codigo_pass ON public.boletos (('PASS-' || codigo_boleto));
CREATE INDEX IF NOT EXISTS idx_boletos_embarcado_por ON public.boletos (embarcado_por);

-- ─── encomiendas ─────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_encomiendas_sender_fecha ON public.encomiendas (sender_id, created_at DESC);
DROP INDEX IF EXISTS public.idx_encomiendas_sender_id;
CREATE INDEX IF NOT EXISTS idx_encomiendas_receiver_fecha ON public.encomiendas (receiver_user_id, created_at DESC);
DROP INDEX IF EXISTS public.idx_encomiendas_receiver_user_id;
CREATE INDEX IF NOT EXISTS idx_encomiendas_coop_fecha ON public.encomiendas (cooperativa_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_encomiendas_coop_estado ON public.encomiendas (cooperativa_id, estado);
DROP INDEX IF EXISTS public.idx_encomiendas_cooperativa_id;
CREATE INDEX IF NOT EXISTS idx_encomiendas_estado_updated ON public.encomiendas (estado, updated_at);
DROP INDEX IF EXISTS public.idx_encomiendas_estado;
CREATE INDEX IF NOT EXISTS idx_encomiendas_tracking_upper ON public.encomiendas (upper(tracking_id));
CREATE INDEX IF NOT EXISTS idx_encomiendas_sucursal_origen ON public.encomiendas (sucursal_origen_id);
CREATE INDEX IF NOT EXISTS idx_encomiendas_sucursal_destino ON public.encomiendas (sucursal_destino_id);
DROP INDEX IF EXISTS public.idx_encomiendas_receiver_telefono;  -- se busca por el valor normalizado

CREATE INDEX IF NOT EXISTS idx_historial_cambiado_por ON public.encomienda_estado_historial (cambiado_por)
 ;
CREATE INDEX IF NOT EXISTS idx_historial_encomienda_fecha ON public.encomienda_estado_historial (encomienda_id, created_at);
DROP INDEX IF EXISTS public.idx_encomienda_historial_encomienda_id;

-- ─── viajes y rutas (buscador) ───────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_viajes_ruta_salida ON public.viajes (ruta_id, fecha_hora_salida);
DROP INDEX IF EXISTS public.idx_viajes_ruta_id;
CREATE INDEX IF NOT EXISTS idx_viajes_coop_salida ON public.viajes (cooperativa_id, fecha_hora_salida);
DROP INDEX IF EXISTS public.idx_viajes_cooperativa_id;
CREATE INDEX IF NOT EXISTS idx_viajes_programados_salida ON public.viajes (fecha_hora_salida)
  WHERE estado = 'PROGRAMADO';
DROP INDEX IF EXISTS public.idx_viajes_estado;
CREATE INDEX IF NOT EXISTS idx_rutas_ciudades_activas ON public.rutas (ciudad_origen, ciudad_destino) WHERE activa;

-- ─── pagos ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_pagos_cooperativa_fecha ON public.pagos (cooperativa_id, created_at DESC);
DROP INDEX IF EXISTS public.idx_pagos_cooperativa_id;
CREATE INDEX IF NOT EXISTS idx_pagos_pagador_fecha ON public.pagos (pagador_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pagos_metodo_pago ON public.pagos (metodo_pago_id);
CREATE INDEX IF NOT EXISTS idx_pagos_verificado_por ON public.pagos (verificado_por);
CREATE INDEX IF NOT EXISTS idx_pagos_rechazado_por ON public.pagos (rechazado_por);
DROP INDEX IF EXISTS public.idx_pagos_verificado;               -- booleano: lo cubre idx_pagos_por_verificar

-- ─── notificaciones ──────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_notificaciones_usuario_fecha ON public.notificaciones_usuario (usuario_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notificaciones_usuario_no_leidas ON public.notificaciones_usuario (usuario_id)
  WHERE NOT leida;
DROP INDEX IF EXISTS public.idx_notificaciones_usuario_usuario;
DROP INDEX IF EXISTS public.idx_notificaciones_usuario_leida;
DROP INDEX IF EXISTS public.idx_notificaciones_usuario_created_at;
CREATE INDEX IF NOT EXISTS idx_pending_notifications_cola ON public.pending_notifications (created_at)
  WHERE NOT procesado;
CREATE INDEX IF NOT EXISTS idx_pending_notifications_destinatario ON public.pending_notifications (destinatario_id);

-- ─── FK restantes ────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_incidencias_boleto ON public.incidencias (boleto_id);
CREATE INDEX IF NOT EXISTS idx_incidencias_resuelta_por ON public.incidencias (resuelta_por);
CREATE INDEX IF NOT EXISTS idx_invitaciones_cooperativa ON public.invitaciones (cooperativa_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_invitaciones_creado_por ON public.invitaciones (creado_por);
CREATE INDEX IF NOT EXISTS idx_invitaciones_sucursal ON public.invitaciones (sucursal_id);
CREATE INDEX IF NOT EXISTS idx_tarifas_creada_por ON public.tarifas (creada_por);
CREATE INDEX IF NOT EXISTS idx_tasas_bcv_registrada_por ON public.tasas_bcv (registrada_por);

ANALYZE public.boletos, public.encomiendas, public.viajes, public.rutas, public.pagos,
        public.notificaciones_usuario, public.pending_notifications;

COMMIT;
