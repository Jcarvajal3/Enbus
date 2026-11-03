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
- **Input**: `{ user_id, titulo, mensaje, recurso_tipo, recurso_id, sin_bandeja?, tipo? }`
- **Lógica**:
  1. Obtiene `expo_push_token` del usuario.
  2. Verifica preferencias de notificación del usuario.
  3. Envía via Expo Push API con `data: { recurso_tipo, recurso_id, tipo }` (la app abre el boleto o la encomienda y elige el icono por `tipo`).
  4. Inserta registro en `notificaciones_usuario` (bandeja in-app, con `tipo`), salvo `sin_bandeja = true` (la RPC ya la escribió).
  5. Registra en `notificaciones_log`.
- **Output**: `{ enviado: boolean }`

### 2.4 `generar-guia-pdf`
- **Trigger**: Invocada al confirmar datos de encomienda (estado `POR_PAGAR`).
- **Input**: `{ encomienda_id }`
- **Lógica**:
  1. Obtiene datos de la encomienda, remitente, destinatario y cooperativa con el JWT de quien llama (RLS).
  2. Genera PDF con: código de seguimiento grande, QR (= código de seguimiento), ruta con nombres legibles ("Puerto La Cruz - Mérida": la fuente estándar de pdf-lib no tiene "→"), peso, costo en USD, modalidad del glosario ("Paga al enviar" / "Paga al retirar"), contenido, remitente y destinatario. **Remitente**: `remitente_nombre`/`remitente_cedula`/`remitente_telefono` si `origen_registro = 'TAQUILLA'` (en esas altas `sender_id` es el empleado); si no, el perfil del remitente. **PIN**: "PIN de retiro: 1854 — dáselo solo a quien recibe" si existe (fase 4).
  3. Formatea para impresión térmica (ancho de ticket).
  4. Almacena el PDF con el `service_role` en `fotos-encomiendas/guias/<cooperativa_id>/` (solo lo lee el personal de esa cooperativa: migración `20260721000004`) y firma una URL de 1 hora.
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
### 2.7 `procesar-notificaciones-pendientes`
- **Trigger**: CRON job cada 1 minuto (invocado via `pg_cron` + `pg_net`).
- **Lógica**:
  1. Lee registros pendientes de la tabla `pending_notifications` (insertados por triggers/CRON de DB).
  2. Para cada registro, invoca `enviar-whatsapp` o `enviar-push` según el canal indicado.
  3. Marca el registro como procesado o fallido.
- **Output**: `{ procesadas: number, fallidas: number }`
- **Fase 4**: pasa `tipo: tipo_notificacion` a `enviar-push`. Aviso de devolución automática: título "Tu encomienda volvió a origen", mensaje "Nadie retiró la encomienda {código} a tiempo y la devolvimos a la oficina de origen. Pasa a buscarla con tu cédula.".
- **Nota**: Los CRON jobs de negocio (`auto_expirar_reserva`, `auto_devolver_encomienda`, `alerta_amarilla_72h`) ejecutan SQL puro directamente en `pg_cron` (ver `Database_Schema_Spec.md` §1.1). **No son Edge Functions**. Esta función solo se encarga de la cola de notificaciones derivada de esos jobs.

### 2.8 `eliminar-cuenta` (fase 4)
- **Trigger**: La app, después de `fn_eliminar_mi_cuenta` (segundo paso de la baja de cuenta, requisito de Google Play).
- **Input**: `POST` sin cuerpo, con el JWT del usuario.
- **Lógica**:
  1. `auth.getUser()` con el JWT; sin usuario → 401 `{ error: 'EB_NO_AUTENTICADO' }`.
  2. Con el `service_role` lee `profiles.eliminada_at`; si es NULL → 409 `{ error: 'EB_ESTADO_CAMBIO', hint: 'Primero confirma la baja desde la app.' }`.
  3. `auth.admin.deleteUser(id, true)` (**borrado suave**: el perfil, sus boletos y encomiendas se conservan anonimizados para la contabilidad de las cooperativas); si falla → 500 `{ error: 'EB_BAJA_PENDIENTE' }` y el Super Admin la completa desde Usuarios › "Bajas por completar".
  4. `bajas_cuenta.auth_eliminada_at = now()`.
- **Output**: `{ ok: true }`

## 3. Rate Limiting

### 3.1 Estrategia
Los endpoints públicos (`track-and-trace` y `calculadora-publica`) usan **rate limiting en memoria** con un `Map<string, { count, timestamp }>` dentro de la Edge Function (Deno Deploy).

**Justificación**: Las Edge Functions de Supabase corren en Deno Deploy. Un `Map` en memoria es suficiente porque:
- El volumen esperado en V1 no justifica Redis.
- Cada instancia de Edge Function mantiene su propio Map, lo cual es aceptable (el rate limit será "por instancia", no global exacto, pero sigue protegiendo contra abuso).
- Si el tráfico crece significativamente en V2+, se puede migrar a Upstash Redis sin cambiar la interfaz.

### 3.2 Límites Aplicados

| Endpoint | Límite | Ventana |
|---|---|---|
| `track-and-trace` | 30 requests | 1 minuto por IP |
| `calculadora-publica` | 60 requests | 1 minuto por IP |

### 3.2.1 Límites de las server actions (fase 4)
Las acciones públicas del panel y la landing usan un contador **global y atómico** en la base: `fn_consumir_limite(p_clave, p_maximo, p_ventana_segundos)` (solo `service_role`, tabla `limites_uso`, ventana fija con `INSERT … ON CONFLICT`). Devuelve `{permitido, restantes, reintentar_en_segundos}`; con `permitido: false` la acción responde `EB_DEMASIADOS_INTENTOS`.

| Acción | Clave | Límite |
|---|---|---|
| `verificarCorreoRegistro` (panel) | `correo:<hash de la IP>` | 10 cada 10 minutos |
| `registrarCooperativa` (panel) | por IP (hash) | 5 por hora |
| `reenviarInvitacion` (landing) | `invitacion:<rif>` y por IP | 1 cada 5 minutos por RIF y 5 por hora por IP; revoca las invitaciones anteriores sin usar |

### 3.3 Implementación Referencia
```typescript
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string, maxRequests: number, windowMs: number): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (entry.count >= maxRequests) return false;
  entry.count++;
  return true;
}
```

## 4. Seguridad
- Todas las funciones (excepto `track-and-trace`, `calculadora-publica` y `procesar-notificaciones-pendientes`) requieren un JWT válido de Supabase Auth. `eliminar-cuenta` solo actúa sobre el usuario del JWT.
- Las funciones validan el rol del usuario antes de ejecutar (ej: `calcular-costo-encomienda` requiere `taquillero` o `admin_cooperativa`).
- Los endpoints públicos están protegidos por rate-limiting en memoria (ver §3).
- `procesar-notificaciones-pendientes` se invoca internamente via `pg_net` con un `service_role` key, nunca expuesta al público.
