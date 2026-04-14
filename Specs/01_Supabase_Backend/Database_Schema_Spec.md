# Base de Datos (Supabase): Esquema Completo

## 1. Objetivo
Definir la estructura relacional completa que sirve como cerebro del Ecosistema EnBus. Todas las tablas, columnas, relaciones, enums e índices se documentan aquí como fuente canonical.

## 2. Enums de Base de Datos

```sql
-- Estados de encomienda (ver State_Machines_Spec.md)
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
```

## 3. Tablas

### 3.1 `profiles` (Extiende auth.users)

| Columna | Tipo | Nullable | Default | Descripción |
|---|---|---|---|---|
| `id` | UUID PK | NO | `auth.uid()` | FK a `auth.users.id` |
| `role` | `rol_usuario` | NO | `'user'` | Rol del usuario en el sistema |
| `nombre_completo` | TEXT | NO | — | Nombre y apellido |
| `telefono` | TEXT | NO | — | Con código de país (+58...). Unique. |
| `cedula_rif` | TEXT | NO | — | Documento de identidad. Unique. |
| `cooperativa_id` | UUID FK | SÍ | NULL | Solo para taquilleros y admin_cooperativa |
| `expo_push_token` | TEXT | SÍ | NULL | Token para notificaciones push |
| `notif_encomiendas` | BOOLEAN | NO | `true` | Preferencia de notificaciones |
| `notif_boletos` | BOOLEAN | NO | `true` | Preferencia de notificaciones |
| `notif_recordatorios` | BOOLEAN | NO | `true` | Preferencia de notificaciones |
| `created_at` | TIMESTAMPTZ | NO | `now()` | — |
| `updated_at` | TIMESTAMPTZ | NO | `now()` | Auto-actualizado por trigger |

**Índices**: `telefono` (unique), `cedula_rif` (unique), `cooperativa_id`

---

### 3.2 `cooperativas`

| Columna | Tipo | Nullable | Default | Descripción |
|---|---|---|---|---|
| `id` | UUID PK | NO | `gen_random_uuid()` | — |
| `nombre` | TEXT | NO | — | Nombre comercial |
| `rif` | TEXT | NO | — | RIF de la empresa. Unique. |
| `logo_url` | TEXT | SÍ | NULL | Logo (Supabase Storage) |
| `comision_porcentaje` | DECIMAL(5,2) | NO | — | % que debe a EnBus |
| `estado` | `estado_cooperativa` | NO | `'ACTIVA'` | — |
| `calificacion_promedio` | DECIMAL(2,1) | NO | `0.0` | Promedio de estrellas (1-5) |
| `total_calificaciones` | INTEGER | NO | `0` | Cantidad de calificaciones |
| `created_at` | TIMESTAMPTZ | NO | `now()` | — |
| `updated_at` | TIMESTAMPTZ | NO | `now()` | — |

**Índices**: `rif` (unique), `estado`

---

### 3.3 `sucursales`

| Columna | Tipo | Nullable | Default | Descripción |
|---|---|---|---|---|
| `id` | UUID PK | NO | `gen_random_uuid()` | — |
| `cooperativa_id` | UUID FK | NO | — | → `cooperativas.id` ON DELETE CASCADE |
| `nombre` | TEXT | NO | — | Nombre de la sucursal |
| `estado_geografico` | TEXT | NO | — | Estado de Venezuela |
| `ciudad` | TEXT | NO | — | Ciudad |
| `direccion` | TEXT | NO | — | Dirección física |
| `telefono` | TEXT | SÍ | NULL | Teléfono de la sucursal |
| `activa` | BOOLEAN | NO | `true` | — |
| `created_at` | TIMESTAMPTZ | NO | `now()` | — |

**Índices**: `cooperativa_id`, `(estado_geografico, ciudad)`

---

### 3.4 `metodos_pago_cooperativa`

| Columna | Tipo | Nullable | Default | Descripción |
|---|---|---|---|---|
| `id` | UUID PK | NO | `gen_random_uuid()` | — |
| `cooperativa_id` | UUID FK | NO | — | → `cooperativas.id` ON DELETE CASCADE |
| `tipo` | `tipo_metodo_pago` | NO | — | Tipo de método |
| `banco` | TEXT | SÍ | NULL | Nombre del banco |
| `titular` | TEXT | NO | — | Nombre del titular |
| `numero_cuenta` | TEXT | SÍ | NULL | Número de cuenta o teléfono |
| `cedula_rif` | TEXT | SÍ | NULL | Cédula/RIF del titular |
| `email_zelle` | TEXT | SÍ | NULL | Email para Zelle |
| `instrucciones` | TEXT | SÍ | NULL | Instrucciones adicionales |
| `activo` | BOOLEAN | NO | `true` | Si visible para los clientes |
| `created_at` | TIMESTAMPTZ | NO | `now()` | — |

**Índices**: `cooperativa_id`

---

### 3.5 `rutas`

| Columna | Tipo | Nullable | Default | Descripción |
|---|---|---|---|---|
| `id` | UUID PK | NO | `gen_random_uuid()` | — |
| `cooperativa_id` | UUID FK | NO | — | → `cooperativas.id` ON DELETE CASCADE |
| `estado_origen` | TEXT | NO | — | Estado de Venezuela de origen |
| `ciudad_origen` | TEXT | NO | — | Ciudad de origen |
| `estado_destino` | TEXT | NO | — | Estado de Venezuela de destino |
| `ciudad_destino` | TEXT | NO | — | Ciudad de destino |
| `duracion_estimada_min` | INTEGER | NO | — | Duración estimada en minutos |
| `precio_pasaje` | DECIMAL(10,2) | SÍ | NULL | Precio del boleto para esta ruta |
| `activa` | BOOLEAN | NO | `true` | Si la ruta está operativa |
| `created_at` | TIMESTAMPTZ | NO | `now()` | — |

**Índices**: `cooperativa_id`, `(estado_origen, ciudad_origen)`, `(estado_destino, ciudad_destino)`, `activa`

---

### 3.6 `viajes` (Instancias de bus/ruta)

| Columna | Tipo | Nullable | Default | Descripción |
|---|---|---|---|---|
| `id` | UUID PK | NO | `gen_random_uuid()` | — |
| `ruta_id` | UUID FK | NO | — | → `rutas.id` ON DELETE CASCADE |
| `cooperativa_id` | UUID FK | NO | — | → `cooperativas.id` (denormalizado para queries rápidos) |
| `numero_unidad` | TEXT | SÍ | NULL | Número del bus. Visible postcompra. |
| `nombre_chofer` | TEXT | SÍ | NULL | Nombre del conductor. Visible postcompra. |
| `fecha_hora_salida` | TIMESTAMPTZ | NO | — | Fecha y hora de partida |
| `fecha_hora_llegada_est` | TIMESTAMPTZ | NO | — | Hora estimada de llegada |
| `asientos_totales` | INTEGER | NO | — | Capacidad del bus |
| `asientos_disponibles` | INTEGER | NO | — | Calculado: total - vendidos |
| `estado` | `estado_viaje` | NO | `'PROGRAMADO'` | — |
| `recurrente` | BOOLEAN | NO | `false` | Si el viaje se repite según un horario fijo |
| `created_at` | TIMESTAMPTZ | NO | `now()` | — |

**Índices**: `ruta_id`, `cooperativa_id`, `fecha_hora_salida`, `estado`

---

### 3.7 `encomiendas`

| Columna | Tipo | Nullable | Default | Descripción |
|---|---|---|---|---|
| `id` | UUID PK | NO | `gen_random_uuid()` | — |
| `tracking_id` | TEXT | NO | — | Formato: `EB-YYMMDD-XXXXX`. Unique. Amigable. |
| `sender_id` | UUID FK | NO | — | → `profiles.id`. Quien envía. |
| `receiver_nombre` | TEXT | NO | — | Nombre del destinatario |
| `receiver_telefono` | TEXT | NO | — | Teléfono del destinatario |
| `receiver_cedula_rif` | TEXT | NO | — | Cédula/RIF del destinatario |
| `receiver_user_id` | UUID FK | SÍ | NULL | → `profiles.id`. Solo si el destinatario tiene cuenta. |
| `cooperativa_id` | UUID FK | SÍ | NULL | → `cooperativas.id`. Se llena al escanear QR. |
| `viaje_id` | UUID FK | SÍ | NULL | → `viajes.id`. Viaje tentativo o asignado. |
| `sucursal_origen_id` | UUID FK | SÍ | NULL | → `sucursales.id`. Donde se escaneó. |
| `sucursal_destino_id` | UUID FK | SÍ | NULL | → `sucursales.id`. Donde se retira. |
| `estado_origen` | TEXT | NO | — | Estado geográfico de origen |
| `ciudad_origen` | TEXT | NO | — | Ciudad de origen |
| `estado_destino` | TEXT | NO | — | Estado geográfico de destino |
| `ciudad_destino` | TEXT | NO | — | Ciudad de destino |
| `descripcion_contenido` | TEXT | NO | — | Qué contiene el paquete |
| `peso_kg` | DECIMAL(6,2) | SÍ | NULL | Ingresado por taquillero. Máx 25 kg. |
| `costo_calculado` | DECIMAL(10,2) | SÍ | NULL | Calculado tras pesaje |
| `valor_declarado` | DECIMAL(10,2) | SÍ | NULL | Valor declarado (para seguro) |
| `modalidad_pago` | `modalidad_pago` | NO | — | ORIGEN o DESTINO |
| `estado` | `estado_encomienda` | NO | `'PENDIENTE_DE_ESCANEO'` | — |
| `pin_retiro` | CHAR(4) | SÍ | NULL | 4 dígitos numéricos. **Unique**. Generado al estado EN_RECEPCION. Inmutable (no se regenera). |
| `intentos_pin` | INTEGER | NO | `0` | Intentos fallidos de PIN |
| `pin_bloqueado` | BOOLEAN | NO | `false` | True si intentos >= 10 |
| `qr_data` | TEXT | SÍ | NULL | Datos codificados en el QR |
| `foto_evidencia_url` | TEXT | SÍ | NULL | Foto del paquete (Supabase Storage) |
| `motivo_cancelacion` | TEXT | SÍ | NULL | Si fue cancelada |
| `created_at` | TIMESTAMPTZ | NO | `now()` | — |
| `updated_at` | TIMESTAMPTZ | NO | `now()` | Auto-actualizado |

**Índices**: `tracking_id` (unique), `sender_id`, `receiver_user_id`, `receiver_telefono`, `cooperativa_id`, `viaje_id`, `estado`, `created_at DESC`

---

### 3.8 `encomienda_estado_historial`

| Columna | Tipo | Nullable | Default | Descripción |
|---|---|---|---|---|
| `id` | UUID PK | NO | `gen_random_uuid()` | — |
| `encomienda_id` | UUID FK | NO | — | → `encomiendas.id` ON DELETE CASCADE |
| `estado_anterior` | `estado_encomienda` | SÍ | NULL | Estado previo (NULL si es el primero) |
| `estado_nuevo` | `estado_encomienda` | NO | — | Nuevo estado |
| `cambiado_por` | UUID FK | SÍ | NULL | → `profiles.id`. Usuario que hizo el cambio. |
| `nota` | TEXT | SÍ | NULL | Texto libre (ej: motivo cancelación) |
| `created_at` | TIMESTAMPTZ | NO | `now()` | — |

**Índices**: `encomienda_id`, `created_at`

---

### 3.9 `boletos`

| Columna | Tipo | Nullable | Default | Descripción |
|---|---|---|---|---|
| `id` | UUID PK | NO | `gen_random_uuid()` | — |
| `codigo_boleto` | TEXT | NO | — | Código amigable. Unique. |
| `comprador_id` | UUID FK | NO | — | → `profiles.id` |
| `viaje_id` | UUID FK | NO | — | → `viajes.id` |
| `cooperativa_id` | UUID FK | NO | — | → `cooperativas.id` (denormalizado) |
| `asiento` | TEXT | NO | — | Número o código de asiento |
| `precio` | DECIMAL(10,2) | NO | — | Precio del boleto |
| `estado` | `estado_boleto` | NO | `'RESERVADO'` | — |
| `qr_embarque_data` | TEXT | SÍ | NULL | Datos del QR de embarque. Generado al pagar. |
| `motivo_cancelacion` | TEXT | SÍ | NULL | Si fue cancelado |
| `monto_reembolso` | DECIMAL(10,2) | SÍ | NULL | 95% del precio si cancelado |
| `reembolso_procesado` | BOOLEAN | NO | `false` | Si la cooperativa procesó |
| `reserva_expira_at` | TIMESTAMPTZ | SÍ | NULL | Cuándo expira la reserva sin pago |
| `created_at` | TIMESTAMPTZ | NO | `now()` | — |
| `updated_at` | TIMESTAMPTZ | NO | `now()` | — |

**Índices**: `codigo_boleto` (unique), `comprador_id`, `viaje_id`, `cooperativa_id`, `estado`, `created_at DESC`

---

### 3.10 `pagos`

| Columna | Tipo | Nullable | Default | Descripción |
|---|---|---|---|---|
| `id` | UUID PK | NO | `gen_random_uuid()` | — |
| `encomienda_id` | UUID FK | SÍ | NULL | → `encomiendas.id` (uno de los dos) |
| `boleto_id` | UUID FK | SÍ | NULL | → `boletos.id` (uno de los dos) |
| `pagador_id` | UUID FK | NO | — | → `profiles.id`. Quien pagó. |
| `cooperativa_id` | UUID FK | NO | — | → `cooperativas.id` |
| `metodo_pago_id` | UUID FK | SÍ | NULL | → `metodos_pago_cooperativa.id` |
| `monto` | DECIMAL(10,2) | NO | — | — |
| `tipo_pago` | `tipo_pago` | NO | — | DIGITAL o EFECTIVO |
| `numero_referencia` | TEXT | SÍ | NULL | Solo para DIGITAL |
| `fecha_transaccion` | DATE | SÍ | NULL | Solo para DIGITAL |
| `banco_emisor` | TEXT | SÍ | NULL | Solo para DIGITAL |
| `verificado` | BOOLEAN | NO | `false` | Marcado por taquillero |
| `verificado_por` | UUID FK | SÍ | NULL | → `profiles.id`. Taquillero que verificó. |
| `verificado_at` | TIMESTAMPTZ | SÍ | NULL | — |
| `created_at` | TIMESTAMPTZ | NO | `now()` | — |

**Constraint**: CHECK (`encomienda_id IS NOT NULL OR boleto_id IS NOT NULL`) — siempre vinculado a algo.
**Índices**: `encomienda_id`, `boleto_id`, `cooperativa_id`, `verificado`

---

### 3.11 `calificaciones`

| Columna | Tipo | Nullable | Default | Descripción |
|---|---|---|---|---|
| `id` | UUID PK | NO | `gen_random_uuid()` | — |
| `boleto_id` | UUID FK | NO | — | → `boletos.id`. Unique. Una calificación por boleto. |
| `usuario_id` | UUID FK | NO | — | → `profiles.id` |
| `cooperativa_id` | UUID FK | NO | — | → `cooperativas.id` |
| `estrellas` | SMALLINT | NO | — | 1-5. CHECK(estrellas >= 1 AND estrellas <= 5) |
| `comentario` | TEXT | SÍ | NULL | Comentario opcional |
| `created_at` | TIMESTAMPTZ | NO | `now()` | — |

**Constraint**: UNIQUE(`boleto_id`) — una sola calificación por viaje.
**Índices**: `cooperativa_id`, `usuario_id`
**Trigger**: Al insertar, recalcular `cooperativas.calificacion_promedio` y `cooperativas.total_calificaciones`.

---

### 3.12 `tarifas`

| Columna | Tipo | Nullable | Default | Descripción |
|---|---|---|---|---|
| `id` | UUID PK | NO | `gen_random_uuid()` | — |
| `tarifa_por_kg` | DECIMAL(10,2) | NO | — | Precio base por kilogramo |
| `factor_distancia_por_min` | DECIMAL(6,4) | NO | — | Multiplicador por minuto de recorrido |
| `dimensiones_max_cm` | INTEGER | NO | `50` | Dimensión máxima referencial por lado en cm (informativo) |
| `peso_max_kg` | DECIMAL(6,2) | NO | `25` | Peso máximo por encomienda en kg |
| `vigente_desde` | TIMESTAMPTZ | NO | `now()` | Cuándo entra en vigor |
| `activa` | BOOLEAN | NO | `true` | Solo una tarifa activa a la vez |
| `creada_por` | UUID FK | NO | — | → `profiles.id` (super_admin) |
| `created_at` | TIMESTAMPTZ | NO | `now()` | — |

**Constraint**: Solo puede haber una tarifa con `activa = true`.

---

### 3.13 `notificaciones_log`

| Columna | Tipo | Nullable | Default | Descripción |
|---|---|---|---|---|
| `id` | UUID PK | NO | `gen_random_uuid()` | — |
| `destinatario_id` | UUID FK | SÍ | NULL | → `profiles.id` (si tiene cuenta) |
| `destinatario_contacto` | TEXT | NO | — | Teléfono o email |
| `canal` | `canal_notificacion` | NO | — | PUSH, WHATSAPP, SMS, EMAIL |
| `titulo` | TEXT | SÍ | NULL | — |
| `contenido` | TEXT | NO | — | Mensaje enviado |
| `estado_envio` | `estado_notificacion` | NO | — | ENVIADO, FALLIDO, FALLBACK_SMS |
| `recurso_tipo` | TEXT | SÍ | NULL | 'encomienda' o 'boleto' |
| `recurso_id` | UUID | SÍ | NULL | ID del recurso relacionado |
| `created_at` | TIMESTAMPTZ | NO | `now()` | — |

**Índices**: `destinatario_id`, `created_at DESC`

---

### 3.14 `notificaciones_usuario` (Bandeja del usuario en app)

| Columna | Tipo | Nullable | Default | Descripción |
|---|---|---|---|---|
| `id` | UUID PK | NO | `gen_random_uuid()` | — |
| `usuario_id` | UUID FK | NO | — | → `profiles.id` ON DELETE CASCADE |
| `titulo` | TEXT | NO | — | — |
| `mensaje` | TEXT | NO | — | — |
| `leida` | BOOLEAN | NO | `false` | — |
| `recurso_tipo` | TEXT | SÍ | NULL | 'encomienda' o 'boleto' |
| `recurso_id` | UUID | SÍ | NULL | ID para deep link |
| `created_at` | TIMESTAMPTZ | NO | `now()` | — |

**Índices**: `usuario_id`, `leida`, `created_at DESC`

---

### 3.15 `comisiones_ciclo`

| Columna | Tipo | Nullable | Default | Descripción |
|---|---|---|---|---|
| `id` | UUID PK | NO | `gen_random_uuid()` | — |
| `cooperativa_id` | UUID FK | NO | — | → `cooperativas.id` |
| `periodo_inicio` | DATE | NO | — | Inicio del ciclo |
| `periodo_fin` | DATE | NO | — | Fin del ciclo |
| `total_encomiendas` | DECIMAL(10,2) | NO | `0` | Ingresos del periodo |
| `total_boletos` | DECIMAL(10,2) | NO | `0` | Ingresos del periodo |
| `comision_porcentaje` | DECIMAL(5,2) | NO | — | % aplicado |
| `monto_comision` | DECIMAL(10,2) | NO | — | Lo que debe la cooperativa |
| `pagado` | BOOLEAN | NO | `false` | Si la cooperativa pagó |
| `pagado_at` | TIMESTAMPTZ | SÍ | NULL | Cuándo pagó |
| `created_at` | TIMESTAMPTZ | NO | `now()` | — |

**Índices**: `cooperativa_id`, `pagado`, `periodo_inicio`

---

### 3.16 `incidencias`

| Columna | Tipo | Nullable | Default | Descripción |
|---|---|---|---|---|
| `id` | UUID PK | NO | `gen_random_uuid()` | — |
| `encomienda_id` | UUID FK | SÍ | NULL | → `encomiendas.id` |
| `reportado_por` | UUID FK | SÍ | NULL | → `profiles.id` |
| `tipo` | TEXT | NO | — | 'ALERTA_AMARILLA', 'REPORTE_USUARIO', 'PERDIDA' |
| `descripcion` | TEXT | NO | — | — |
| `estado` | TEXT | NO | `'ABIERTA'` | ABIERTA, EN_PROCESO, RESUELTA |
| `resolucion` | TEXT | SÍ | NULL | — |
| `resuelta_por` | UUID FK | SÍ | NULL | → `profiles.id` (super_admin) |
| `created_at` | TIMESTAMPTZ | NO | `now()` | — |
| `updated_at` | TIMESTAMPTZ | NO | `now()` | — |

**Índices**: `encomienda_id`, `estado`, `tipo`

## 4. Triggers Principales

| Trigger | Tabla | Evento | Acción |
|---|---|---|---|
| `update_updated_at` | Múltiples | BEFORE UPDATE | Set `updated_at = now()` |
| `log_estado_encomienda` | `encomiendas` | AFTER UPDATE on `estado` | Inserta en `encomienda_estado_historial` |
| `generar_tracking_id` | `encomiendas` | BEFORE INSERT | Genera `EB-YYMMDD-XXXXX` auto |
| `generar_pin_retiro` | `encomiendas` | AFTER UPDATE to `EN_RECEPCION` | Genera PIN **único** aleatorio de 4 dígitos (verifica unicidad antes de asignar, reintenta si hay colisión). El PIN es inmutable tras su creación. |
| `calcular_calificacion` | `calificaciones` | AFTER INSERT/UPDATE/DELETE | Recalcula promedio en `cooperativas` |
| `actualizar_asientos` | `boletos` | AFTER INSERT/UPDATE/DELETE | Actualiza `viajes.asientos_disponibles` |
| `auto_expirar_reserva` | `boletos` | CRON (cada 1 min) | Expira reservas donde `reserva_expira_at < now()` |
| `auto_devolver_encomienda` | `encomiendas` | CRON (diario) | Marca DEVUELTA si EN_OFICINA_DESTINO > 5 días hábiles |
| `alerta_amarilla_72h` | `encomiendas` | CRON (cada 1 hora) | Crea incidencia si EN_TRANSITO > 72 horas |

## 5. Vistas (Views)

| Vista | Descripción | Uso |
|---|---|---|
| `v_proximos_viajes` | Viajes con estado PROGRAMADO y fecha_hora_salida > now(), join con rutas y cooperativas | App: lista de resultados de búsqueda |
| `v_encomiendas_activas` | Encomiendas no terminales (excluye ENTREGADA, CANCELADA, DEVUELTA) | App: sección "Activos" en Inicio |
| `v_boletos_activos` | Boletos con estado RESERVADO o PAGADO y viaje futuro | App: sección "Activos" en Inicio |
| `v_balance_cooperativa` | Resumen financiero por cooperativa (ingresos, comisiones pendientes) | Panel Super Admin |

## 6. Storage Buckets (Supabase Storage)

| Bucket | Acceso | Contenido |
|---|---|---|
| `logos-cooperativas` | Público (lectura) | Logos de cooperativas |
| `fotos-encomiendas` | Privado (RLS) | Fotos de evidencia de embalaje |
