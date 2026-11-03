# Base de Datos (Supabase): Esquema Completo

## 1. Objetivo
Definir la estructura relacional completa que sirve como cerebro del Ecosistema EnBus. Todas las tablas, columnas, relaciones, enums e índices se documentan aquí como fuente canonical.

## 1.1 Directrices de Implementación

### Estrategia de Migraciones
Usar **migraciones separadas** siguiendo la convención estándar de Supabase CLI (`supabase migration new`). Cada migración es un archivo SQL numerado en `supabase/migrations/`. Orden recomendado:

1. `001_enums.sql` — Todos los `CREATE TYPE ... AS ENUM`.
2. `002_tables.sql` — Todas las tablas con columnas, PKs, FKs y defaults.
3. `003_indexes.sql` — Índices secundarios.
4. `004_views.sql` — Vistas (`v_proximos_viajes`, `v_encomiendas_activas`, etc.).
5. `005_functions.sql` — Funciones helper reutilizables (`is_member_of()`, `get_cooperativa_id()`, etc.).
6. `006_triggers.sql` — Triggers (BEFORE/AFTER INSERT/UPDATE/DELETE).
7. `007_rls.sql` — Políticas RLS (ver `RLS_Policies_Spec.md`).
8. `008_cron.sql` — Jobs `pg_cron` (ver sección §4).
9. `009_storage.sql` — Buckets y políticas de Storage.
10. `010_seed.sql` — Datos iniciales (tarifa default, super_admin, etc.).

> **Regla**: Cada migración debe ser **idempotente** cuando sea posible (usar `IF NOT EXISTS`, `CREATE OR REPLACE`). Los cambios futuros se agregan como migraciones nuevas, nunca se editan migraciones ya aplicadas.

### Extensiones de PostgreSQL Requeridas
```sql
CREATE EXTENSION IF NOT EXISTS pg_cron;      -- CRON jobs en DB
CREATE EXTENSION IF NOT EXISTS pgcrypto;     -- gen_random_uuid()
```

### CRON Jobs (pg_cron)
Los CRON jobs descritos en este spec y en `Edge_Functions_Spec.md` se implementan **directamente en la base de datos con `pg_cron`**, ejecutando SQL puro. No invocan Edge Functions.

**Justificación**: Los 3 CRON jobs del sistema (`auto_expirar_reserva`, `auto_devolver_encomienda`, `alerta_amarilla_72h`) son operaciones SQL simples (UPDATE con WHERE). Ejecutarlos directamente en la DB es más fiable, más rápido y evita latencia de red o cold starts de Edge Functions.

| Job | Schedule | SQL |
|---|---|---|
| `auto_expirar_reserva` | `* * * * *` (cada 1 min) | `UPDATE boletos SET estado = 'EXPIRADO' WHERE estado = 'RESERVADO' AND reserva_expira_at < now();` |
| `auto_devolver_encomienda` | `0 0 * * *` (diario a medianoche) | `UPDATE encomiendas SET estado = 'DEVUELTA' WHERE estado = 'EN_OFICINA_DESTINO' AND updated_at < now() - interval '7 days';` + INSERT en `pending_notifications` |
| `alerta_amarilla_72h` | `0 * * * *` (cada hora) | `INSERT INTO incidencias (...) SELECT ... FROM encomiendas WHERE estado = 'EN_TRANSITO' AND updated_at < now() - interval '72 hours' AND id NOT IN (SELECT encomienda_id FROM incidencias WHERE tipo = 'ALERTA_AMARILLA');` |

> **Nota**: El job `auto_devolver_encomienda` además debe disparar el trigger `log_estado_encomienda` para registrar el historial. Como es un UPDATE directo, el trigger existente en `encomiendas` lo captura automáticamente. Para las notificaciones Push que requiere, el job inserta un registro en una cola `pending_notifications` que una Edge Function procesa periódicamente, o se usa `pg_net` para llamar al endpoint de notificación.
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
-- PENDIENTE: 20260713000001. RECHAZADA: 20260720000001 (va sola, sin BEGIN/COMMIT).
CREATE TYPE estado_cooperativa AS ENUM (
  'PENDIENTE',
  'RECHAZADA',
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
| `representante` | TEXT | SÍ | NULL | Representante legal (registro). Fase 3; se rellenó desde `descripcion` ("Representante: X. Mensaje: Y") en las solicitudes antiguas |
| `mensaje_registro` | TEXT | SÍ | NULL | Mensaje o rutas de interés del registro; `fn_solicitar_revision_cooperativa` lo actualiza. Fase 3 |
| `motivo_estado` | TEXT | SÍ | NULL | *Comentario SQL*: "Motivo del último rechazo, suspensión o desactivación (lo ve la cooperativa en su panel). NULL si está ACTIVA o PENDIENTE." Fase 3 |
| `estado_cambiado_at` | TIMESTAMPTZ | SÍ | NULL | Último cambio de estado. Fase 3 |
| `estado_cambiado_por` | UUID | SÍ | NULL | Quién cambió el estado. **Sin FK** a `profiles` (ver nota). Fase 3 |
| `created_at` | TIMESTAMPTZ | NO | `now()` | — |
| `updated_at` | TIMESTAMPTZ | NO | `now()` | — |

**Índices**: `rif` (unique), `estado`

**Protección** (trigger `aa_proteger_cooperativa` → `proteger_cooperativa_fn`, fase 3): solo el Super Admin (o `service_role`) cambia `estado`, `comision_porcentaje`, `motivo_estado`, `estado_cambiado_at`, `estado_cambiado_por`, `calificacion_promedio` y `total_calificaciones`; `nombre` y `rif` solo se cambian en `PENDIENTE` o `RECHAZADA`. El estado se cambia con `fn_cambiar_estado_cooperativa` y `fn_solicitar_revision_cooperativa` (ver `State_Machines_Spec.md` §3).

> **Nota (columnas `*_por` de la fase 3)**: `estado_cambiado_por`, `boletos.reembolso_procesado_por` y `encomiendas.entregada_por` **no tienen FK** a `profiles` a propósito: una relación más entre `profiles` y `cooperativas`/`boletos`/`encomiendas` vuelve ambiguos los embeds de PostgREST (por ejemplo `cooperativas(nombre, estado)` desde `profiles` en `getUserProfile`, error PGRST201).

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
| `horario` | TEXT | SÍ | NULL | *Comentario SQL*: "Horario de atención en texto libre, p. ej. "Lun a sáb 7:00 a. m. – 6:00 p. m."". Fase 3 |
| `activa` | BOOLEAN | NO | `true` | — |
| `created_at` | TIMESTAMPTZ | NO | `now()` | — |

**Índices**: `cooperativa_id`, `(estado_geografico, ciudad)`

**RPC**: `fn_sucursales_en_ciudad(p_cooperativa_id, p_ciudad)` (authenticated, fase 3) devuelve las sucursales activas de una cooperativa en una ciudad (comparación con `normalizar_localidad`): `{id, nombre, direccion, telefono, horario, ciudad, estado_geografico}`.

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
| `foto_evidencia_url` | TEXT | SÍ | NULL | *Comentario SQL*: "Foto que toma la taquilla. Ruta del objeto en el bucket privado fotos-encomiendas (se muestra con URL firmada). Filas antiguas pueden tener la URL completa." |
| `foto_cliente_path` | TEXT | SÍ | NULL | *Comentario SQL*: "Foto que subió el remitente desde la app (ruta del objeto en fotos-encomiendas, carpeta = id del usuario)." Fase 3 |
| `foto_omitida_motivo` | TEXT | SÍ | NULL | Por qué la taquilla omitió la foto ("La cámara no funciona", "El cliente tiene prisa", "Otro"). Fase 3 |
| `origen_registro` | TEXT | NO | `'APP'` | `CHECK (origen_registro IN ('APP', 'TAQUILLA'))` (`chk_encomiendas_origen_registro`). *Comentario SQL*: "APP: la creó el remitente en la app. TAQUILLA: alta presencial; sender_id es el empleado y el remitente real va en remitente_*." Fase 3 |
| `remitente_nombre` | TEXT | SÍ | NULL | Remitente real en altas de taquilla (`origen_registro = 'TAQUILLA'`). Fase 3 |
| `remitente_cedula` | TEXT | SÍ | NULL | Ídem. Fase 3 |
| `remitente_telefono` | TEXT | SÍ | NULL | Ídem. Fase 3 |
| `idempotency_key` | TEXT | SÍ | NULL | Clave de la operación de alta presencial (`fn_registrar_encomienda_taquilla`). Fase 3 |
| `entregada_at` | TIMESTAMPTZ | SÍ | NULL | Cuándo se entregó (`fn_entregar_encomienda`). Fase 3 |
| `entregada_por` | UUID | SÍ | NULL | Empleado que entregó. **Sin FK** (ver nota en §3.2). Fase 3 |
| `retiro_tercero` | BOOLEAN | NO | `false` | Retiró otra persona autorizada. Fase 3 |
| `retiro_nombre` | TEXT | SÍ | NULL | Nombre de quien retiró (destinatario o tercero). Fase 3 |
| `retiro_cedula` | TEXT | SÍ | NULL | Cédula de quien retiró. Fase 3 |
| `entrega_sin_pin_motivo` | TEXT | SÍ | NULL | Motivo de la entrega sin PIN (solo `admin_cooperativa`, ≥ 10 caracteres). Fase 3 |
| `motivo_cancelacion` | TEXT | SÍ | NULL | Si fue cancelada ("No recibida en taquilla: …" si la rechazó la taquilla) |
| `created_at` | TIMESTAMPTZ | NO | `now()` | — |
| `updated_at` | TIMESTAMPTZ | NO | `now()` | Auto-actualizado (`encomiendas_updated_at_fn`); **no** lo mueven el vínculo del destinatario, las sucursales, `intentos_pin`, `pin_bloqueado` ni las fotos |

**Índices**: `tracking_id` (unique), `sender_id`, `receiver_user_id`, `receiver_telefono`, `cooperativa_id`, `viaje_id`, `estado`, `created_at DESC`, `uq_encomiendas_idempotencia` (unique `(sender_id, idempotency_key) WHERE idempotency_key IS NOT NULL`, fase 3)

**Clientes** (trigger `aa_proteger_encomiendas_cliente`): al crear desde la app el servidor fuerza `origen_registro = 'APP'`, mueve una foto enviada en `foto_evidencia_url` a `foto_cliente_path` y limpia `remitente_*`, `foto_omitida_motivo` y las columnas de entrega.

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
| `monto_reembolso` | DECIMAL(10,2) | SÍ | NULL | USD de referencia: 95 % del precio si cancela el pasajero (`fn_cancelar_boleto`); 100 % si la cooperativa cancela el viaje (`fn_cancelar_viaje`) |
| `reembolso_procesado` | BOOLEAN | NO | `false` | Si la cooperativa registró la devolución (`fn_registrar_reembolso`) |
| `reembolso_procesado_at` | TIMESTAMPTZ | SÍ | NULL | Cuándo se registró la devolución. Fase 3 |
| `reembolso_procesado_por` | UUID | SÍ | NULL | Empleado que la registró. **Sin FK** (ver nota en §3.2). Fase 3 |
| `reembolso_metodo` | TEXT | SÍ | NULL | `PAGO_MOVIL`, `TRANSFERENCIA_BANCARIA`, `ZELLE` o `EFECTIVO`. Fase 3 |
| `reembolso_referencia` | TEXT | SÍ | NULL | Referencia de la devolución (obligatoria salvo efectivo). Fase 3 |
| `reembolso_nota` | TEXT | SÍ | NULL | Nota opcional (máx. 300). Fase 3 |
| `reserva_expira_at` | TIMESTAMPTZ | SÍ | NULL | Cuándo expira la reserva sin pago |
| `created_at` | TIMESTAMPTZ | NO | `now()` | — |
| `updated_at` | TIMESTAMPTZ | NO | `now()` | — |

**Índices**: `codigo_boleto` (unique), `comprador_id`, `viaje_id`, `cooperativa_id`, `estado`, `created_at DESC`, `idx_boletos_codigo_norm` (`regexp_replace(upper(codigo_boleto), '[^A-Z0-9]', '', 'g')`, fase 3: `fn_validar_embarque` acepta el código con espacios, guiones o en minúsculas)

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
| `boleto_id` | UUID FK | SÍ | NULL | → `boletos.id` ON DELETE SET NULL. Boleto del reporte. Fase 3 |
| `reportado_por` | UUID FK | SÍ | NULL | → `profiles.id` |
| `tipo` | TEXT | NO | — | 'ALERTA_AMARILLA', 'REPORTE_USUARIO', 'PERDIDA' |
| `categoria` | TEXT | SÍ | NULL | Reportes de usuario: 'PAGO', 'BOLETO', 'ENCOMIENDA', 'CUENTA', 'OTRO'. Fase 3 |
| `descripcion` | TEXT | NO | — | — |
| `estado` | TEXT | NO | `'ABIERTA'` | ABIERTA, EN_PROCESO, RESUELTA |
| `resolucion` | TEXT | SÍ | NULL | — |
| `resuelta_por` | UUID FK | SÍ | NULL | → `profiles.id` (super_admin) |
| `created_at` | TIMESTAMPTZ | NO | `now()` | — |
| `updated_at` | TIMESTAMPTZ | NO | `now()` | — |

**Índices**: `encomienda_id`, `estado`, `tipo`, `idx_incidencias_reportado_por (reportado_por, created_at)` (fase 3)

Los usuarios crean reportes **solo** con `fn_reportar_problema(p_categoria, p_descripcion, p_boleto_id, p_encomienda_id)` (tipo `REPORTE_USUARIO`, descripción ≥ 10, boleto o encomienda propios, máximo 5 por 24 horas: `EB_DEMASIADOS_REPORTES`); devuelve `{id, codigo: 'INC-XXXXXX', creada_at}`.

---

### 3.17 `invitaciones` (cambios de la fase 3)

| Columna | Tipo | Nullable | Default | Descripción |
|---|---|---|---|---|
| `revocada_at` | TIMESTAMPTZ | SÍ | NULL | Cuándo la revocó el administrador. Una invitación revocada no es válida aunque no haya vencido. Fase 3 |

## 4. Triggers Principales

| Trigger | Tabla | Evento | Acción |
|---|---|---|---|
| `update_updated_at` | Múltiples | BEFORE UPDATE | Set `updated_at = now()` |
| `validar_transicion_encomienda` | `encomiendas` | BEFORE UPDATE on `estado` | Valida que la transición `OLD.estado → NEW.estado` esté en la lista de transiciones permitidas (ver `State_Machines_Spec.md §1.3`). Si la transición no es válida, lanza excepción y rechaza el UPDATE. |
| `validar_transicion_boleto` | `boletos` | BEFORE UPDATE on `estado` | Valida que la transición `OLD.estado → NEW.estado` esté en la lista de transiciones permitidas (ver `State_Machines_Spec.md §2.4`). Si la transición no es válida, lanza excepción y rechaza el UPDATE. |
| `on_auth_user_created` | `auth.users` | AFTER INSERT | Ejecuta `handle_new_user()`: crea registro en `profiles` usando `raw_user_meta_data` (nombre, teléfono, cédula; marcador `PENDIENTE-<id>` si faltan o están repetidos). `SECURITY DEFINER`. Versionado en `20260720000002`. Ver §4.1. |
| `aa_proteger_cooperativa` | `cooperativas` | BEFORE UPDATE | `proteger_cooperativa_fn`: estado, comisión y calificación solo los cambia el Super Admin; nombre y RIF solo en `PENDIENTE`/`RECHAZADA` (`EB_SIN_PERMISO`). Fase 3 |
| `log_estado_encomienda` | `encomiendas` | AFTER UPDATE on `estado` | Inserta en `encomienda_estado_historial` (`SECURITY DEFINER`) |
| `generar_tracking_id` | `encomiendas` | BEFORE INSERT | Genera `EB-YYMMDD-XXXXX` auto |
| `generar_pin_retiro` | `encomiendas` | AFTER UPDATE to `EN_RECEPCION` | Genera PIN **único** aleatorio de 4 dígitos (verifica unicidad antes de asignar, reintenta si hay colisión). El PIN es inmutable tras su creación. |
| `calcular_calificacion` | `calificaciones` | AFTER INSERT/UPDATE/DELETE | Recalcula promedio en `cooperativas` |
| `actualizar_asientos` | `boletos` | AFTER INSERT/UPDATE/DELETE | Actualiza `viajes.asientos_disponibles` |
| `auto_expirar_reserva` | `boletos` | CRON (cada 1 min) | Expira reservas donde `reserva_expira_at < now()` |
| `auto_devolver_encomienda` | `encomiendas` | CRON (diario, medianoche) | Marca DEVUELTA si lleva 5 días hábiles o más en EN_OFICINA_DESTINO (`calcular_dias_habiles(updated_at, now())`); avisa al remitente solo si `origen_registro = 'APP'` (fase 3) |
| `alerta_amarilla_72h` | `encomiendas` | CRON (cada 1 hora) | Crea incidencia si EN_TRANSITO > 72 horas |

### 4.1 Función `handle_new_user()` (Crítica)

Esta función es el **puente obligatorio** entre `auth.users` y `public.profiles`. Sin ella, los usuarios recién registrados no pueden operar en el sistema (RLS los bloquea).

**Versionada por primera vez en `20260720000002_fase3_base.sql`** (antes solo existía en el proyecto desplegado). Google no envía teléfono ni cédula, y ambos son `UNIQUE NOT NULL` en `profiles`: la versión anterior hacía fallar el alta con Google ("Database error saving new user") o dejaba datos basura.

```sql
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  m jsonb := coalesce(NEW.raw_user_meta_data, '{}'::jsonb);
  v_nombre text; v_tel text; v_ced text;
BEGIN
  v_nombre := coalesce(nullif(btrim(m->>'nombre_completo'), ''), nullif(btrim(m->>'full_name'), ''),
                       nullif(btrim(m->>'name'), ''), nullif(split_part(coalesce(NEW.email, ''), '@', 1), ''),
                       'Usuario EnBus');
  v_tel := nullif(btrim(m->>'telefono'), '');
  v_ced := nullif(btrim(m->>'cedula_rif'), '');
  IF v_tel IS NULL OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.telefono = v_tel) THEN
    v_tel := 'PENDIENTE-' || NEW.id::text;
  END IF;
  IF v_ced IS NULL OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.cedula_rif = v_ced) THEN
    v_ced := 'PENDIENTE-' || NEW.id::text;
  END IF;
  INSERT INTO public.profiles (id, role, nombre_completo, telefono, cedula_rif)
  VALUES (NEW.id, 'user', v_nombre, v_tel, v_ced)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END $$;
```

**Reglas**:
- **Nombre**: `nombre_completo` → `full_name` → `name` (Google) → parte local del correo → "Usuario EnBus".
- **Teléfono y cédula ausentes o ya usados por otra cuenta** → marcador único **`PENDIENTE-<id>`** (id del usuario). Así el alta nunca aborta. `normalizar_cedula` y `normalizar_telefono` tratan cualquier valor que empiece por `PENDIENTE` como vacío, y la app pide nombre, cédula y teléfono (`CompletarPerfilSheet`) antes de la primera compra o del primer envío; el servidor exige cédula válida por pasajero en `fn_checkout_boletos` (`EB_DATOS_PASAJERO`).
- `_asegurar_asientos` solo copia del perfil al boleto datos válidos: un perfil con `PENDIENTE-…` deja el boleto sin cédula hasta `fn_asignar_pasajeros`.
- `ON CONFLICT (id) DO NOTHING`: compatible con el onboarding de empleados (invitaciones), que crea o ajusta el perfil por su cuenta.
- La función usa `SECURITY DEFINER` para poder escribir en `profiles` sin depender de RLS.
- Solo aplica `role = 'user'`. Los roles `taquillero`, `admin_cooperativa` y `super_admin` se crean mediante funciones de invitación independientes que asignan el rol y `cooperativa_id` correctos.

**Trigger** (la migración lo crea **solo si** no existe ya un trigger en `auth.users` que llame a `handle_new_user()`):
```sql
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```

**Correo ya registrado**: `fn_email_registrado(p_email)` (solo `service_role`, sin distinguir mayúsculas) responde si existe una cuenta en `auth.users`; la usa el registro de cooperativas en lugar de `listUsers()` sin paginar.

**Rescate de usuarios huérfanos** (ejecutar una sola vez en migración):
```sql
INSERT INTO public.profiles (id, role, nombre_completo, telefono, cedula_rif)
SELECT 
  u.id, 
  'user', 
  COALESCE(u.raw_user_meta_data->>'nombre_completo', u.email),
  COALESCE(u.raw_user_meta_data->>'telefono', 'PENDIENTE'),
  COALESCE(u.raw_user_meta_data->>'cedula_rif', 'PENDIENTE')
FROM auth.users u
WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = u.id);
```
> Los usuarios rescatados con datos `PENDIENTE` deberán completar su perfil al iniciar sesión (el frontend debe detectar esto y forzar el flujo de onboarding).

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

**`fotos-encomiendas` (fase 3)**: el bucket es privado, así que en la base se guarda la **ruta** del objeto (no una URL pública) y las pantallas la muestran con una URL firmada.
- Foto del remitente (app): `<id del usuario>/<archivo>` → `encomiendas.foto_cliente_path` (políticas "Usuario sube fotos de sus envios" y "Usuario reemplaza fotos de sus envios", ver `RLS_Policies_Spec.md`).
- Foto de la taquilla (panel): `<id de la encomienda>/<ts>.jpg` → `encomiendas.foto_evidencia_url`; si se omite, `foto_omitida_motivo`.
- La migración `20260720000002` movió a `foto_cliente_path` las fotos del remitente que la app anterior guardaba en `foto_evidencia_url`.

## 7. RPC de la fase 3

Contratos completos en `Audits/fase3_spec.md` §3.2. Todas son `SECURITY DEFINER`; errores `P0001` con `message = 'EB_<CODIGO>'` y `hint` para el usuario.

| Migración | RPC |
|---|---|
| `20260720000002_fase3_base.sql` | `fn_sucursales_en_ciudad` |
| `20260720000003_fase3_rpc_boletos.sql` | `fn_asientos_ocupados`, `fn_asignar_pasajeros`, `fn_checkout_boletos` (redefinida), `fn_validar_embarque` (redefinida), `fn_cancelar_viaje`, `fn_reembolsos`, `fn_registrar_reembolso`; internas `_fecha_hora_ve`, `_resumen_compra`, `_asegurar_asientos`, `_resultado_embarque` |
| `20260720000004_fase3_rpc_encomiendas.sql` | `fn_registrar_encomienda_taquilla`, `fn_rechazar_encomienda_origen`, `fn_validar_pin_retiro`, `fn_entregar_encomienda`, `fn_desbloquear_pin`, `fn_cotizar_envio_publico`, `fn_rastrear_encomienda_publico` (solo `service_role`), `fn_rutas_populares`, `fn_estadisticas_publicas` |
| `20260720000005_fase3_rpc_cuenta_soporte.sql` | `fn_reportar_problema`, `fn_cambiar_estado_cooperativa`, `fn_solicitar_revision_cooperativa`, `fn_checklist_cooperativa`, `fn_email_registrado` (solo `service_role`) |

Las funciones internas (`_…`) no tienen `EXECUTE` para `anon` ni `authenticated`.
