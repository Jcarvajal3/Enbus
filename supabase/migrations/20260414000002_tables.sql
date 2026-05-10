-- 3.1 profiles (Extiende auth.users)
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role rol_usuario NOT NULL DEFAULT 'user',
  nombre_completo TEXT NOT NULL,
  telefono TEXT UNIQUE NOT NULL,
  cedula_rif TEXT UNIQUE NOT NULL,
  cooperativa_id UUID,
  expo_push_token TEXT,
  notif_encomiendas BOOLEAN NOT NULL DEFAULT true,
  notif_boletos BOOLEAN NOT NULL DEFAULT true,
  notif_recordatorios BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indices
CREATE INDEX idx_profiles_telefono ON public.profiles(telefono);
CREATE INDEX idx_profiles_cedula_rif ON public.profiles(cedula_rif);
CREATE INDEX idx_profiles_cooperativa_id ON public.profiles(cooperativa_id);

-- 3.2 cooperativas
CREATE TABLE public.cooperativas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL,
  rif TEXT UNIQUE NOT NULL,
  logo_url TEXT,
  comision_porcentaje DECIMAL(5,2) NOT NULL,
  estado estado_cooperativa NOT NULL DEFAULT 'ACTIVA',
  calificacion_promedio DECIMAL(2,1) NOT NULL DEFAULT 0.0,
  total_calificaciones INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_cooperativas_rif ON public.cooperativas(rif);
CREATE INDEX idx_cooperativas_estado ON public.cooperativas(estado);

-- Modificar profiles para agregar FK de cooperativa_id ahora que existe
ALTER TABLE public.profiles
ADD CONSTRAINT fk_profiles_cooperativa_id FOREIGN KEY (cooperativa_id) REFERENCES public.cooperativas(id) ON DELETE SET NULL;

-- 3.3 sucursales
CREATE TABLE public.sucursales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cooperativa_id UUID NOT NULL REFERENCES public.cooperativas(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  estado_geografico TEXT NOT NULL,
  ciudad TEXT NOT NULL,
  direccion TEXT NOT NULL,
  telefono TEXT,
  activa BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_sucursales_cooperativa_id ON public.sucursales(cooperativa_id);
CREATE INDEX idx_sucursales_ubicacion ON public.sucursales(estado_geografico, ciudad);

-- 3.4 metodos_pago_cooperativa
CREATE TABLE public.metodos_pago_cooperativa (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cooperativa_id UUID NOT NULL REFERENCES public.cooperativas(id) ON DELETE CASCADE,
  tipo tipo_metodo_pago NOT NULL,
  banco TEXT,
  titular TEXT NOT NULL,
  numero_cuenta TEXT,
  cedula_rif TEXT,
  email_zelle TEXT,
  instrucciones TEXT,
  activo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_metodos_pago_cooperativa_id ON public.metodos_pago_cooperativa(cooperativa_id);

-- 3.5 rutas
CREATE TABLE public.rutas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cooperativa_id UUID NOT NULL REFERENCES public.cooperativas(id) ON DELETE CASCADE,
  estado_origen TEXT NOT NULL,
  ciudad_origen TEXT NOT NULL,
  estado_destino TEXT NOT NULL,
  ciudad_destino TEXT NOT NULL,
  duracion_estimada_min INTEGER NOT NULL,
  precio_pasaje DECIMAL(10,2),
  activa BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_rutas_cooperativa_id ON public.rutas(cooperativa_id);
CREATE INDEX idx_rutas_origen ON public.rutas(estado_origen, ciudad_origen);
CREATE INDEX idx_rutas_destino ON public.rutas(estado_destino, ciudad_destino);
CREATE INDEX idx_rutas_activa ON public.rutas(activa);

-- 3.6 viajes (Instancias de bus/ruta)
CREATE TABLE public.viajes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ruta_id UUID NOT NULL REFERENCES public.rutas(id) ON DELETE CASCADE,
  cooperativa_id UUID NOT NULL REFERENCES public.cooperativas(id),
  numero_unidad TEXT,
  nombre_chofer TEXT,
  fecha_hora_salida TIMESTAMPTZ NOT NULL,
  fecha_hora_llegada_est TIMESTAMPTZ NOT NULL,
  asientos_totales INTEGER NOT NULL,
  asientos_disponibles INTEGER NOT NULL,
  estado estado_viaje NOT NULL DEFAULT 'PROGRAMADO',
  recurrente BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_viajes_ruta_id ON public.viajes(ruta_id);
CREATE INDEX idx_viajes_cooperativa_id ON public.viajes(cooperativa_id);
CREATE INDEX idx_viajes_fecha_hora_salida ON public.viajes(fecha_hora_salida);
CREATE INDEX idx_viajes_estado ON public.viajes(estado);

-- 3.7 encomiendas
CREATE TABLE public.encomiendas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tracking_id TEXT UNIQUE NOT NULL,
  sender_id UUID NOT NULL REFERENCES public.profiles(id),
  receiver_nombre TEXT NOT NULL,
  receiver_telefono TEXT NOT NULL,
  receiver_cedula_rif TEXT NOT NULL,
  receiver_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  cooperativa_id UUID REFERENCES public.cooperativas(id),
  viaje_id UUID REFERENCES public.viajes(id),
  sucursal_origen_id UUID REFERENCES public.sucursales(id),
  sucursal_destino_id UUID REFERENCES public.sucursales(id),
  estado_origen TEXT NOT NULL,
  ciudad_origen TEXT NOT NULL,
  estado_destino TEXT NOT NULL,
  ciudad_destino TEXT NOT NULL,
  descripcion_contenido TEXT NOT NULL,
  peso_kg DECIMAL(6,2),
  costo_calculado DECIMAL(10,2),
  valor_declarado DECIMAL(10,2),
  modalidad_pago modalidad_pago NOT NULL,
  estado estado_encomienda NOT NULL DEFAULT 'PENDIENTE_DE_ESCANEO',
  pin_retiro CHAR(4) UNIQUE,
  intentos_pin INTEGER NOT NULL DEFAULT 0,
  pin_bloqueado BOOLEAN NOT NULL DEFAULT false,
  qr_data TEXT,
  foto_evidencia_url TEXT,
  motivo_cancelacion TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_encomiendas_tracking_id ON public.encomiendas(tracking_id);
CREATE INDEX idx_encomiendas_sender_id ON public.encomiendas(sender_id);
CREATE INDEX idx_encomiendas_receiver_user_id ON public.encomiendas(receiver_user_id);
CREATE INDEX idx_encomiendas_receiver_telefono ON public.encomiendas(receiver_telefono);
CREATE INDEX idx_encomiendas_cooperativa_id ON public.encomiendas(cooperativa_id);
CREATE INDEX idx_encomiendas_viaje_id ON public.encomiendas(viaje_id);
CREATE INDEX idx_encomiendas_estado ON public.encomiendas(estado);
CREATE INDEX idx_encomiendas_created_at ON public.encomiendas(created_at DESC);

-- 3.8 encomienda_estado_historial
CREATE TABLE public.encomienda_estado_historial (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  encomienda_id UUID NOT NULL REFERENCES public.encomiendas(id) ON DELETE CASCADE,
  estado_anterior estado_encomienda,
  estado_nuevo estado_encomienda NOT NULL,
  cambiado_por UUID REFERENCES public.profiles(id),
  nota TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_encomienda_historial_encomienda_id ON public.encomienda_estado_historial(encomienda_id);
CREATE INDEX idx_encomienda_historial_created_at ON public.encomienda_estado_historial(created_at);

-- 3.9 boletos
CREATE TABLE public.boletos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo_boleto TEXT UNIQUE NOT NULL,
  comprador_id UUID NOT NULL REFERENCES public.profiles(id),
  viaje_id UUID NOT NULL REFERENCES public.viajes(id),
  cooperativa_id UUID NOT NULL REFERENCES public.cooperativas(id),
  asiento TEXT NOT NULL,
  precio DECIMAL(10,2) NOT NULL,
  estado estado_boleto NOT NULL DEFAULT 'RESERVADO',
  qr_embarque_data TEXT,
  motivo_cancelacion TEXT,
  monto_reembolso DECIMAL(10,2),
  reembolso_procesado BOOLEAN NOT NULL DEFAULT false,
  reserva_expira_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_boletos_codigo ON public.boletos(codigo_boleto);
CREATE INDEX idx_boletos_comprador_id ON public.boletos(comprador_id);
CREATE INDEX idx_boletos_viaje_id ON public.boletos(viaje_id);
CREATE INDEX idx_boletos_cooperativa_id ON public.boletos(cooperativa_id);
CREATE INDEX idx_boletos_estado ON public.boletos(estado);
CREATE INDEX idx_boletos_created_at ON public.boletos(created_at DESC);

-- 3.10 pagos
CREATE TABLE public.pagos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  encomienda_id UUID REFERENCES public.encomiendas(id),
  boleto_id UUID REFERENCES public.boletos(id),
  pagador_id UUID NOT NULL REFERENCES public.profiles(id),
  cooperativa_id UUID NOT NULL REFERENCES public.cooperativas(id),
  metodo_pago_id UUID REFERENCES public.metodos_pago_cooperativa(id),
  monto DECIMAL(10,2) NOT NULL,
  tipo_pago tipo_pago NOT NULL,
  numero_referencia TEXT,
  fecha_transaccion DATE,
  banco_emisor TEXT,
  verificado BOOLEAN NOT NULL DEFAULT false,
  verificado_por UUID REFERENCES public.profiles(id),
  verificado_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT check_pago_referencia CHECK (encomienda_id IS NOT NULL OR boleto_id IS NOT NULL)
);

CREATE INDEX idx_pagos_encomienda_id ON public.pagos(encomienda_id);
CREATE INDEX idx_pagos_boleto_id ON public.pagos(boleto_id);
CREATE INDEX idx_pagos_cooperativa_id ON public.pagos(cooperativa_id);
CREATE INDEX idx_pagos_verificado ON public.pagos(verificado);

-- 3.11 calificaciones
CREATE TABLE public.calificaciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  boleto_id UUID UNIQUE NOT NULL REFERENCES public.boletos(id),
  usuario_id UUID NOT NULL REFERENCES public.profiles(id),
  cooperativa_id UUID NOT NULL REFERENCES public.cooperativas(id),
  estrellas SMALLINT NOT NULL CHECK (estrellas >= 1 AND estrellas <= 5),
  comentario TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_calificaciones_cooperativa_id ON public.calificaciones(cooperativa_id);
CREATE INDEX idx_calificaciones_usuario_id ON public.calificaciones(usuario_id);

-- 3.12 tarifas
CREATE TABLE public.tarifas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tarifa_por_kg DECIMAL(10,2) NOT NULL,
  factor_distancia_por_min DECIMAL(6,4) NOT NULL,
  dimensiones_max_cm INTEGER NOT NULL DEFAULT 50,
  peso_max_kg DECIMAL(6,2) NOT NULL DEFAULT 25,
  vigente_desde TIMESTAMPTZ NOT NULL DEFAULT now(),
  activa BOOLEAN NOT NULL DEFAULT true,
  creada_por UUID NOT NULL REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_tarifas_activa ON public.tarifas (activa) WHERE activa = true;

-- 3.13 notificaciones_log
CREATE TABLE public.notificaciones_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  destinatario_id UUID REFERENCES public.profiles(id),
  destinatario_contacto TEXT NOT NULL,
  canal canal_notificacion NOT NULL,
  titulo TEXT,
  contenido TEXT NOT NULL,
  estado_envio estado_notificacion NOT NULL,
  recurso_tipo TEXT,
  recurso_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_notificaciones_log_destinatario ON public.notificaciones_log(destinatario_id);
CREATE INDEX idx_notificaciones_log_created_at ON public.notificaciones_log(created_at DESC);

-- 3.14 notificaciones_usuario (Bandeja del usuario en app)
CREATE TABLE public.notificaciones_usuario (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  titulo TEXT NOT NULL,
  mensaje TEXT NOT NULL,
  leida BOOLEAN NOT NULL DEFAULT false,
  recurso_tipo TEXT,
  recurso_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_notificaciones_usuario_usuario ON public.notificaciones_usuario(usuario_id);
CREATE INDEX idx_notificaciones_usuario_leida ON public.notificaciones_usuario(leida);
CREATE INDEX idx_notificaciones_usuario_created_at ON public.notificaciones_usuario(created_at DESC);

-- 3.15 comisiones_ciclo
CREATE TABLE public.comisiones_ciclo (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cooperativa_id UUID NOT NULL REFERENCES public.cooperativas(id),
  periodo_inicio DATE NOT NULL,
  periodo_fin DATE NOT NULL,
  total_encomiendas DECIMAL(10,2) NOT NULL DEFAULT 0,
  total_boletos DECIMAL(10,2) NOT NULL DEFAULT 0,
  comision_porcentaje DECIMAL(5,2) NOT NULL,
  monto_comision DECIMAL(10,2) NOT NULL,
  pagado BOOLEAN NOT NULL DEFAULT false,
  pagado_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_comisiones_cooperativa_id ON public.comisiones_ciclo(cooperativa_id);
CREATE INDEX idx_comisiones_pagado ON public.comisiones_ciclo(pagado);
CREATE INDEX idx_comisiones_periodo_inicio ON public.comisiones_ciclo(periodo_inicio);

-- 3.16 incidencias
CREATE TABLE public.incidencias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  encomienda_id UUID REFERENCES public.encomiendas(id),
  reportado_por UUID REFERENCES public.profiles(id),
  tipo TEXT NOT NULL,
  descripcion TEXT NOT NULL,
  estado TEXT NOT NULL DEFAULT 'ABIERTA',
  resolucion TEXT,
  resuelta_por UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_incidencias_encomienda ON public.incidencias(encomienda_id);
CREATE INDEX idx_incidencias_estado ON public.incidencias(estado);
CREATE INDEX idx_incidencias_tipo ON public.incidencias(tipo);
