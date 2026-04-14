# Sistema de Notificaciones

## 1. Canales Disponibles

| Canal | Tecnología | Uso |
|---|---|---|
| **Push** | Expo Push Notifications | Notificaciones nativas en la app móvil |
| **WhatsApp** | Twilio API for WhatsApp | Mensajes a destinatarios (tengan o no la app) |
| **Email** | Supabase Auth (transaccional) | Verificación de cuenta, reseteo de contraseña, envío de PIN |
| **SMS** | Twilio SMS | **Solo como fallback** si WhatsApp falla. No es canal principal. |

## 2. Matriz de Notificaciones: Encomiendas

### 2.1 Notificaciones al Remitente

| Evento / Transición | Push | WhatsApp | Email | Contenido |
|---|---|---|---|---|
| `PAGADA` → `EN_TRANSITO` | ✅ | ❌ | ❌ | "Tu encomienda {tracking_id} ha sido despachada hacia {destino}." |
| `EN_OFICINA_DESTINO` → `DEVUELTA` | ✅ | ❌ | ❌ | "La encomienda {tracking_id} no fue retirada y fue devuelta a {origen}. Debes pagar el envío de regreso para recuperarla." |
| Cualquier estado → `CANCELADA` (por sistema) | ✅ | ❌ | ❌ | "La encomienda {tracking_id} fue cancelada. Motivo: {motivo}." |

> **Nota**: El remitente **NO recibe notificación** en los estados `EN_RECEPCION`, `POR_PAGAR`, `PAGADA`, `EN_OFICINA_DESTINO` ni `ENTREGADA` porque: en los primeros está presente físicamente en la taquilla, y en los últimos la información relevante es para el destinatario.

### 2.2 Notificaciones al Destinatario

| Evento / Transición | Push | WhatsApp | Email | Contenido |
|---|---|---|---|---|
| `EN_RECEPCION` → `POR_PAGAR` (solo si cobro destino) | ✅ | ✅ | ❌ | "Tienes una encomienda de {remitente} con cobro en destino. Monto: {costo}. Puedes pagar desde la app o al retirar." |
| `PAGADA` → `EN_TRANSITO` | ✅ | ✅ | ❌ | "Tu encomienda {tracking_id} de {remitente} está en camino hacia {destino}." |
| `EN_TRANSITO` → `EN_OFICINA_DESTINO` | ✅ | ✅ | ✅ | "Tu encomienda {tracking_id} está lista para retirar en {sucursal_destino}. Tu PIN de retiro: {pin}. Enlace de seguimiento: {url}" |

> **El destinatario NO recibe notificación** en estado `PAGADA` (solo) ni `ENTREGADA`.

### 2.3 Notificaciones al Taquillero / Cooperativa

**No se envían notificaciones push ni WhatsApp al personal de la cooperativa en la V1.** La información se refleja en tiempo real en su Panel Web mediante suscripciones Realtime de Supabase.

## 3. Matriz de Notificaciones: Boletos

| Evento | Push | WhatsApp | Email | A quién | Contenido |
|---|---|---|---|---|---|
| Boleto `PAGADO` | ✅ | ❌ | ❌ | Comprador | "Tu boleto para {ruta} el {fecha} a las {hora} ha sido confirmado. Asiento: {asiento}." |
| Boleto `CANCELADO` (con reembolso) | ✅ | ❌ | ❌ | Comprador | "Tu boleto {codigo} fue cancelado. Se procesará un reembolso del 95% en 1-2 días hábiles." |
| Viaje próximo (recordatorio) | ✅ | ❌ | ❌ | Comprador | "Recuerda: tu viaje {ruta} sale mañana a las {hora}. Tu asiento es el {asiento}." |

> **Nota**: El recordatorio de viaje se envía **24 horas antes** de la hora de salida.

## 4. Notificaciones de Sistema (No transaccionales)

| Evento | Canal | A quién | Contenido |
|---|---|---|---|
| Verificación de email | Email | Nuevos usuarios | "Verifica tu cuenta de EnBus: {enlace}" |
| Reseteo de contraseña | Email | Cualquier usuario | "Resetea tu contraseña: {enlace}" |
| Invitación de empleado | Email (magic link) | Nuevos taquilleros | "Has sido invitado a unirte a {cooperativa} en EnBus: {enlace}" |
| Invitación de admin cooperativa | Email (magic link) | Nuevos admins cooperativa | "Has sido invitado como administrador de {cooperativa}: {enlace}" |

## 5. Centro de Notificaciones (App Móvil)

- La app tendrá una **sección de notificaciones** accesible desde un ícono de campana en el header.
- Muestra un **historial** de todas las notificaciones push recibidas, ordenadas cronológicamente.
- Cada notificación tiene: título, mensaje, timestamp y enlace directo al recurso (encomienda o boleto).
- Las notificaciones no leídas muestran un **badge contador** en el ícono de campana.

### 5.1 Configuración de Notificaciones
- El usuario puede **activar/desactivar** categorías específicas de notificaciones desde Perfil > Notificaciones:
  - Actualizaciones de encomiendas: On/Off
  - Actualizaciones de boletos: On/Off
  - Recordatorios de viaje: On/Off

## 6. Fallback de Canales

```
WhatsApp falla → Reintentar 1 vez (esperar 60 seg) → Si falla → Enviar SMS como fallback
Push falla → No hay fallback (el usuario verá la notificación en el Centro de Notificaciones al abrir la app)
Email falla → Reintentar 3 veces con backoff exponencial (1min, 5min, 15min)
```

## 7. Auditoría
- Todas las notificaciones enviadas se registran en la tabla `notificaciones_log` con: `id`, `tipo_canal`, `destinatario`, `contenido`, `estado_envio` (enviado/fallido/fallback_sms), `timestamp`.
- Esta tabla es consultable por el Super Admin para debugging y métricas.
