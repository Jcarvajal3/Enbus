# Edge Functions (Supabase)

## 1. Objetivo
Catálogo de funciones serverless en TypeScript ejecutadas en Supabase Edge Functions. Manejan lógica que no debe vivir en el cliente: integraciones externas, cálculos sensibles y automatizaciones.

## 2. Catálogo de Funciones

### 2.1 `calcular-costo-encomienda`
- **Trigger**: Invocada desde el Panel de Cooperativas al ingresar peso.
- **Input**: `{ encomienda_id, peso_kg }`
- **Lógica**:
  1. Obtiene la tarifa activa de la tabla `tarifas`.
  2. Obtiene la ruta para calcular `duracion_estimada_min`.
  3. Valida que `peso_kg` no exceda `tarifas.peso_max_kg` (default 25 kg). Si excede, retorna error.
  4. Calcula: `costo = peso_kg × tarifa_por_kg × (1 + factor_distancia_por_min × duracion_estimada_min)`.
  5. Actualiza `encomiendas.costo_calculado` y `peso_kg`.
  6. Cambia estado a `POR_PAGAR`.
- **Output**: `{ costo_calculado, estado: 'POR_PAGAR' }`

### 2.2 `enviar-whatsapp`
- **Trigger**: Invocada por triggers de base de datos tras cambios de estado.
- **Input**: `{ telefono, template_id, variables: { ... } }`
- **Lógica**: Envía mensaje via Twilio WhatsApp API. Si falla, reintenta 1 vez. Si falla de nuevo, envía SMS como fallback y registra en `notificaciones_log`.
- **Output**: `{ enviado: boolean, canal_usado: 'WHATSAPP' | 'SMS', error?: string }`

### 2.3 `enviar-push`
- **Trigger**: Invocada tras cambios de estado.
- **Input**: `{ user_id, titulo, mensaje, recurso_tipo, recurso_id }`
- **Lógica**:
  1. Obtiene `expo_push_token` del usuario.
  2. Verifica preferencias de notificación del usuario.
  3. Envía via Expo Push API.
  4. Inserta registro en `notificaciones_usuario` (bandeja in-app).
  5. Registra en `notificaciones_log`.
- **Output**: `{ enviado: boolean }`

### 2.4 `generar-guia-pdf`
- **Trigger**: Invocada al confirmar datos de encomienda (estado `POR_PAGAR`).
- **Input**: `{ encomienda_id }`
- **Lógica**:
  1. Obtiene datos de la encomienda, remitente, destinatario y cooperativa.
  2. Genera PDF con: tracking ID, QR de rastreo, datos del envío, peso, costo.
  3. Formatea para impresión térmica (ancho de ticket).
  4. Almacena PDF en Supabase Storage.
- **Output**: `{ pdf_url: string }`

### 2.5 `track-and-trace`
- **Trigger**: Endpoint público (rate-limited) para consultas desde la Landing Page.
- **Input**: `{ tracking_id: string }`
- **Lógica**: Busca la encomienda por `tracking_id`. Retorna datos públicos (sin datos sensibles del remitente/destinatario).
- **Rate Limit**: 30 requests por IP por minuto.
- **Output**: `{ tracking_id, estado, origen, destino, fechas, historial_estados[] }`

### 2.6 `calculadora-publica`
- **Trigger**: Endpoint público (rate-limited) para la calculadora de la Landing Page y la App.
- **Input**: `{ peso_kg, estado_origen, ciudad_origen, estado_destino, ciudad_destino }`
- **Lógica**: Calcula costo estimado usando la tarifa activa y la duración estimada de la ruta más corta disponible. Valida que `peso_kg` no exceda 25 kg.
- **Rate Limit**: 60 requests por IP por minuto.
- **Output**: `{ costo_estimado, peso_max_kg, dimensiones_max_referencia: '50x50x50cm', disclaimer: "Precio aproximado, sujeto a pesaje en taquilla" }`

### 2.7 `procesar-devolucion-automatica`
- **Trigger**: CRON job diario.
- **Lógica**:
  1. Busca encomiendas en estado `EN_OFICINA_DESTINO` con más de 5 días hábiles.
  2. Cambia estado a `DEVUELTA`.
  3. Notifica al remitente (Push).
- **Output**: `{ procesadas: number }`

### 2.8 `alerta-amarilla`
- **Trigger**: CRON job cada hora.
- **Lógica**:
  1. Busca encomiendas en estado `EN_TRANSITO` con más de 72 horas.
  2. Crea registro en tabla `incidencias` con tipo `ALERTA_AMARILLA`.
- **Output**: `{ alertas_creadas: number }`

## 3. Seguridad
- Todas las funciones (excepto `track-and-trace` y `calculadora-publica`) requieren un JWT válido de Supabase Auth.
- Las funciones validan el rol del usuario antes de ejecutar (ej: `calcular-costo-encomienda` requiere `taquillero` o `admin_cooperativa`).
- Los endpoints públicos están protegidos por rate-limiting.
