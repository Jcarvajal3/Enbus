-- Estados de encomienda
CREATE TYPE estado_encomienda AS ENUM (
  'PENDIENTE_DE_ESCANEO',
  'EN_RECEPCION',
  'POR_PAGAR',
  'PAGADA',
  'EN_TRANSITO',
  'EN_OFICINA_DESTINO',
  'ENTREGADA',
  'CANCELADA',
  'DEVUELTA'
);

-- Estados de boleto
CREATE TYPE estado_boleto AS ENUM (
  'RESERVADO',
  'PAGADO',
  'USADO',
  'CANCELADO',
  'EXPIRADO'
);

-- Estados de cooperativa
CREATE TYPE estado_cooperativa AS ENUM (
  'ACTIVA',
  'SUSPENDIDA',
  'DESACTIVADA'
);

-- Roles del sistema
CREATE TYPE rol_usuario AS ENUM (
  'user',
  'taquillero',
  'admin_cooperativa',
  'super_admin'
);

-- Modalidad de pago de encomienda
CREATE TYPE modalidad_pago AS ENUM (
  'ORIGEN',
  'DESTINO'
);

-- Tipo de pago
CREATE TYPE tipo_pago AS ENUM (
  'DIGITAL',
  'EFECTIVO'
);

-- Tipo de método de pago
CREATE TYPE tipo_metodo_pago AS ENUM (
  'TRANSFERENCIA_BANCARIA',
  'PAGO_MOVIL',
  'ZELLE',
  'EFECTIVO'
);

-- Canal de notificación
CREATE TYPE canal_notificacion AS ENUM (
  'PUSH',
  'WHATSAPP',
  'SMS',
  'EMAIL'
);

-- Estado de envío de notificación
CREATE TYPE estado_notificacion AS ENUM (
  'ENVIADO',
  'FALLIDO',
  'FALLBACK_SMS'
);

-- Estado de viaje
CREATE TYPE estado_viaje AS ENUM (
  'PROGRAMADO',
  'EN_CURSO',
  'COMPLETADO',
  'CANCELADO'
);
