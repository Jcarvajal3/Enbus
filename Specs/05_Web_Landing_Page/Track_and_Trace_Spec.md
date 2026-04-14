# Landing Page: Track & Trace

## 1. Objetivo
Permitir que cualquier persona (con o sin cuenta) rastree una encomienda usando su Tracking ID.

## 2. URL
- `/rastrear` (página dedicada)
- También embebido inline en la Home (ver `Home_Spec.md`§3.2).

## 3. Interfaz

### 3.1 Input de Búsqueda
- Campo de texto prominente, placeholder: "Ej: EB-260412-00123".
- Botón: **"Rastrear"**.

### 3.2 Resultado
Si se encuentra la encomienda:
| Dato | Visible |
|---|---|
| Tracking ID | ✅ |
| Estado actual | ✅ (badge con color y texto) |
| Origen → Destino | ✅ (solo estados/ciudades) |
| Cooperativa | ✅ (nombre) |
| Timeline de estados | ✅ (`<StatusTimeline />` con timestamps) |
| Remitente | ❌ (privacidad) |
| Destinatario | ❌ (privacidad) |
| PIN de retiro | ❌ (privacidad) |
| Peso / Costo | ❌ (privacidad) |
| Foto de evidencia | ❌ (privacidad) |

Si no se encuentra:
- Mensaje: "No encontramos una encomienda con ese número. Verifica el código e intenta de nuevo."

## 4. Implementación
- Llama a la Edge Function `track-and-trace` (ver `01_Supabase_Backend/Edge_Functions_Spec.md`).
- Rate-limited: 30 requests por IP por minuto.
- No requiere autenticación.
- SSR: La URL `/rastrear/{tracking_id}` permite compartir el link directo de seguimiento (la URL que recibe el destinatario por WhatsApp).

## 5. SEO
- Título: "Rastrea tu Envío — EnBus"
- Meta description: "Ingresa tu número de seguimiento para ver el estado de tu encomienda en tiempo real."
