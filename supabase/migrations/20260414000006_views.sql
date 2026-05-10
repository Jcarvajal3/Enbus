-- 5. Vistas (Views)

-- v_proximos_viajes
CREATE OR REPLACE VIEW public.v_proximos_viajes WITH (security_invoker = true) AS
SELECT 
  v.id AS viaje_id,
  v.fecha_hora_salida,
  v.fecha_hora_llegada_est,
  v.asientos_disponibles,
  v.asientos_totales,
  r.id AS ruta_id,
  r.estado_origen,
  r.ciudad_origen,
  r.estado_destino,
  r.ciudad_destino,
  r.duracion_estimada_min,
  r.precio_pasaje,
  c.id AS cooperativa_id,
  c.nombre AS cooperativa_nombre,
  c.logo_url AS cooperativa_logo,
  c.calificacion_promedio
FROM public.viajes v
JOIN public.rutas r ON v.ruta_id = r.id
JOIN public.cooperativas c ON v.cooperativa_id = c.id
WHERE v.estado = 'PROGRAMADO' 
  AND v.fecha_hora_salida > now()
  AND r.activa = true
  AND c.estado = 'ACTIVA';

-- v_encomiendas_activas
CREATE OR REPLACE VIEW public.v_encomiendas_activas WITH (security_invoker = true) AS
SELECT *
FROM public.encomiendas
WHERE estado NOT IN ('ENTREGADA', 'CANCELADA', 'DEVUELTA');

-- v_boletos_activos
CREATE OR REPLACE VIEW public.v_boletos_activos WITH (security_invoker = true) AS
SELECT b.*, v.fecha_hora_salida, v.fecha_hora_llegada_est
FROM public.boletos b
JOIN public.viajes v ON b.viaje_id = v.id
WHERE b.estado IN ('RESERVADO', 'PAGADO')
  AND v.fecha_hora_salida > now();

-- v_balance_cooperativa
CREATE OR REPLACE VIEW public.v_balance_cooperativa WITH (security_invoker = true) AS
SELECT 
  c.id AS cooperativa_id,
  c.nombre,
  (SELECT COALESCE(SUM(monto), 0) FROM public.pagos p JOIN public.encomiendas e ON p.encomienda_id = e.id WHERE p.cooperativa_id = c.id AND p.verificado = true AND e.estado != 'CANCELADA') AS total_ingresos_encomiendas,
  (SELECT COALESCE(SUM(monto), 0) FROM public.pagos p JOIN public.boletos b ON p.boleto_id = b.id WHERE p.cooperativa_id = c.id AND p.verificado = true AND b.estado != 'CANCELADO') AS total_ingresos_boletos,
  (SELECT COALESCE(SUM(monto_comision), 0) FROM public.comisiones_ciclo cc WHERE cc.cooperativa_id = c.id AND cc.pagado = false) AS total_comisiones_adeudadas
FROM public.cooperativas c;
