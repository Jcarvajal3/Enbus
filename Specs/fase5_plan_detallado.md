# Fase 5 — Recepción en Destino y Entrega

> **Prerrequisito**: Fase 1 (auth/layout) + Fase 3 (ScanInput, tipos encomiendas).
> **Módulos**: Recepción en Destino + Entrega en Destino.

---

## Tarea 1: Recepción en Destino — Vista Principal

**Archivo**: `src/app/cooperativas/(panel)/recepcion-destino/page.tsx`

### 1.1 Query

```
supabase.from("encomiendas")
  .select(`
    id, tracking_id, receiver_nombre, receiver_telefono,
    estado_origen, ciudad_origen, estado,
    sender:profiles!sender_id(nombre_completo),
    viaje:viajes!viaje_id(
      id, fecha_hora_salida,
      ruta:rutas(ciudad_origen, ciudad_destino)
    )
  `)
  .eq("cooperativa_id", cooperativaId)
  .eq("estado", "EN_TRANSITO")
  .order("created_at", { ascending: false })
```

> [!NOTE]
> El spec dice filtrar por `sucursal_destino_id` coincidente con la sucursal del taquillero. Si el taquillero tiene una sucursal asignada en su perfil, filtrar por ella. Si no, mostrar todas las EN_TRANSITO de la cooperativa.

### 1.2 UI

- `PageHeader` con título "Recepción en Destino" y botón "Recibir Lote del Viaje"
- `ScanInput` (reutilizar de Fase 3) para escaneo individual
- Tabla con columnas:

| Columna | Formato |
|---|---|
| Tracking ID | Monospace |
| Remitente | `sender.nombre_completo` |
| Destinatario | `receiver_nombre` |
| Origen | `{ciudad_origen}` |
| Viaje | Fecha/hora salida del viaje asignado |

- Estado vacío: `Empty` con icono `Package` y texto "No hay encomiendas en tránsito hacia esta sucursal"

### Criterio de aceptación
- [ ] Tabla muestra solo encomiendas EN_TRANSITO de la cooperativa
- [ ] Campo de escaneo visible y funcional
- [ ] Botón "Recibir Lote del Viaje" visible

---

## Tarea 2: Recepción Individual por Escaneo

### 2.1 Lógica al escanear

Reutilizar `ScanInput`. Al detectar un código:

```
1. Buscar encomienda:
   supabase.from("encomiendas")
     .select("id, tracking_id, estado, receiver_nombre")
     .or(`tracking_id.eq.${code},qr_data.eq.${code}`)
     .eq("cooperativa_id", cooperativaId)
     .single()

2. Validaciones:
   a. No encontrada → toast error "Encomienda no encontrada"
   b. Estado ≠ EN_TRANSITO → toast error "Solo se pueden recibir encomiendas en tránsito.
      Estado actual: {estado}"
   c. Válida → mostrar confirmación
```

### 2.2 Confirmación rápida (inline o Dialog mínimo)

Opción A — **Confirmación inline** (más rápido para escaneo masivo):
- Al escanear válido, mostrar toast de éxito: "✅ {tracking_id} — {destinatario} — Recibida"
- Cambiar estado automáticamente sin modal adicional

Opción B — **Dialog de confirmación** (más seguro):
```
┌──────────────────────────────────────┐
│  📦 Confirmar Recepción              │
│                                       │
│  Tracking: EB-260510-A1B2C           │
│  Destinatario: María López            │
│  Origen: Caracas                      │
│                                       │
│  [Cancelar]  [Confirmar Recepción]    │
└──────────────────────────────────────┘
```

> **Recomendación**: Usar Opción A (inline) para velocidad operativa. El escaneo de recepción es una tarea repetitiva y rápida.

### 2.3 Server Action

```
async function recibirEncomienda(encomiendaId: string) {
  const supabase = await createClient();

  const { error } = await supabase
    .from("encomiendas")
    .update({ estado: "EN_OFICINA_DESTINO" })
    .eq("id", encomiendaId)
    .eq("estado", "EN_TRANSITO"); // Safety check

  // Notificaciones al destinatario (Push + WhatsApp con PIN)
  // se disparan via trigger/Edge Function automáticamente

  return { success: !error, error: error?.message };
}
```

### Criterio de aceptación
- [ ] Escanear QR de encomienda EN_TRANSITO la marca como EN_OFICINA_DESTINO
- [ ] Escanear encomienda en otro estado muestra error claro
- [ ] Tabla se actualiza inmediatamente (optimistic update o refetch)
- [ ] Encomienda desaparece de la lista tras recibir

---

## Tarea 3: Recepción por Lote

### 3.1 Dialog "Recibir Lote del Viaje"

Botón en el header → abre `Dialog`.

**Paso 1: Seleccionar viaje**

Query de viajes que tienen encomiendas EN_TRANSITO hacia esta sucursal:
```
supabase.from("viajes")
  .select(`
    id, fecha_hora_salida, numero_unidad,
    ruta:rutas(ciudad_origen, ciudad_destino),
    encomiendas:encomiendas!viaje_id(id, tracking_id, estado, receiver_nombre)
  `)
  .eq("cooperativa_id", cooperativaId)
  .eq("estado", "EN_CURSO")
  .order("fecha_hora_salida", { ascending: false })
```

Filtrar en JS: solo viajes con al menos una encomienda EN_TRANSITO.

UI: Lista de viajes como `Card` clickeables:
- Ruta + fecha + Nº unidad
- "N encomiendas pendientes de recepción"

**Paso 2: Confirmar lote**

Al seleccionar viaje, mostrar lista de encomiendas del viaje en estado EN_TRANSITO:
- Checkboxes (todas seleccionadas por default)
- Botón "Recibir {N} Encomiendas"

### 3.2 Server Action

```
async function recibirLote(encomiendaIds: string[]) {
  const supabase = await createClient();

  const { error } = await supabase
    .from("encomiendas")
    .update({ estado: "EN_OFICINA_DESTINO" })
    .in("id", encomiendaIds)
    .eq("estado", "EN_TRANSITO");

  return { success: !error, count: encomiendaIds.length };
}
```

Post-acción: toast "✅ {N} encomiendas recibidas exitosamente"

### Criterio de aceptación
- [ ] Dialog muestra viajes con encomiendas pendientes
- [ ] Seleccionar viaje muestra sus encomiendas EN_TRANSITO
- [ ] "Recibir Lote" actualiza todas a EN_OFICINA_DESTINO
- [ ] Toast de confirmación con conteo

---

## Tarea 4: Entrega — Vista Principal

**Archivo**: `src/app/cooperativas/(panel)/entrega/page.tsx`

### 4.1 Query

```
supabase.from("encomiendas")
  .select(`
    id, tracking_id, receiver_nombre, receiver_telefono,
    receiver_cedula_rif, modalidad_pago, costo_calculado,
    estado, updated_at, pin_bloqueado,
    sender:profiles!sender_id(nombre_completo)
  `)
  .eq("cooperativa_id", cooperativaId)
  .eq("estado", "EN_OFICINA_DESTINO")
  .order("updated_at", { ascending: true }) // Más antiguas primero
```

### 4.2 Cálculo de días en oficina

```typescript
function diasEnOficina(updatedAt: string): number {
  const llegada = new Date(updatedAt);
  const ahora = new Date();
  const diff = ahora.getTime() - llegada.getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}
```

### 4.3 Columnas de la tabla

| Columna | Formato |
|---|---|
| Tracking ID | Monospace, clickeable |
| Destinatario | `receiver_nombre` |
| Teléfono | `receiver_telefono` |
| Días en oficina | Número + alerta visual |
| Modalidad de pago | `Badge` ORIGEN / DESTINO |
| PIN | `Badge` "Bloqueado" rojo si `pin_bloqueado = true` |

### 4.4 Alertas visuales de retención

```tsx
function RetentionBadge({ dias }: { dias: number }) {
  if (dias > 4) return <Badge variant="destructive">{dias} días ⚠️</Badge>;
  if (dias > 3) return <Badge variant="secondary" className="bg-amber-100 text-amber-800">{dias} días</Badge>;
  return <Badge variant="outline">{dias} días</Badge>;
}
```

- **> 3 días**: Badge amarillo (advertencia)
- **> 4 días**: Badge rojo (urgente — próximo a devolución automática)
- Ordenar tabla: encomiendas más antiguas primero

### 4.5 Búsqueda

Campo de búsqueda (reutilizar `ScanInput` o input simple):
- Buscar por Tracking ID o nombre del destinatario
- Filtro client-side sobre los datos ya cargados

### Criterio de aceptación
- [ ] Tabla muestra encomiendas EN_OFICINA_DESTINO
- [ ] Alertas visuales para >3 días (amarillo) y >4 días (rojo)
- [ ] Encomiendas con PIN bloqueado marcadas visualmente
- [ ] Búsqueda por tracking ID o nombre funciona
- [ ] Ordenadas por antigüedad (más vieja primero)

---

## Tarea 5: Flujo de Entrega — Modal

**Archivo**: `src/components/entrega/entrega-modal.tsx` (`"use client"`)

Se abre al hacer click en una fila de la tabla.

### 5.1 Estructura del modal (`Dialog` tamaño `lg`)

```
┌──────────────────────────────────────────────────┐
│  Entrega: EB-260510-A1B2C                         │
│                                                    │
│  ── Información del Envío ──                       │
│  Remitente: Juan Pérez                             │
│  Destinatario: María López | V-12345678            │
│  Teléfono: +58 414-1234567                         │
│  Contenido: Documentos                             │
│  Peso: 2.5 kg | Costo: $5.00                      │
│  Días en oficina: 2                                │
│                                                    │
│  ── Cobro en Destino ── (solo si aplica)           │
│  ⚠️ Cobro pendiente: $5.00                        │
│  [Aprobar Pago Digital]  [Cobrado en Efectivo]     │
│  ✅ Pago verificado (si ya se cobró)               │
│                                                    │
│  ── Validación de PIN ──                           │
│  [_] [_] [_] [_]    Intentos: 0/10                 │
│  ✅ PIN correcto (si validado)                     │
│  ❌ PIN incorrecto. Intentos restantes: 9          │
│  🔒 PIN bloqueado. Contactar soporte.              │
│                                                    │
│  [Cancelar]  [Confirmar Entrega] (disabled/enabled)│
└──────────────────────────────────────────────────────┘
```

### 5.2 Sección: Cobro en Destino

Solo visible si `modalidad_pago === "DESTINO"`.

```
// Verificar si hay pago verificado
const { data: pago } = await supabase.from("pagos")
  .select("*")
  .eq("encomienda_id", encomiendaId)
  .eq("verificado", true)
  .limit(1);

const pagoVerificado = !!pago;
```

**Si no hay pago verificado**:
- Verificar si el destinatario confirmó pago desde la app (pago no verificado):
  ```
  supabase.from("pagos")
    .select("*")
    .eq("encomienda_id", encomiendaId)
    .eq("verificado", false)
    .limit(1)
  ```
- Si hay pago pendiente: mostrar datos (referencia, fecha, banco) + botón "Aprobar Pago"
- Siempre: botón "Cobrado en Efectivo"

**Reutilizar lógica de pago de Fase 3** (Server Action `procesarPago`).

**Si hay pago verificado o modalidad es ORIGEN**:
- Mostrar ✅ "Pago verificado"

### 5.3 Estado del componente

```typescript
const [pagoOk, setPagoOk] = useState(false);  // true si ya pagó o no requiere cobro destino
const [pinOk, setPinOk] = useState(false);     // true si PIN validado
const [pinBloqueado, setPinBloqueado] = useState(encomienda.pin_bloqueado);
const [intentos, setIntentos] = useState(encomienda.intentos_pin);
```

Botón "Confirmar Entrega" → `disabled={!pagoOk || !pinOk}`

---

## Tarea 6: Validación de PIN

**Archivo**: `src/components/entrega/pin-input.tsx` (`"use client"`)

### 6.1 UI del PIN

Usar `InputOTP` de shadcn (4 dígitos):

```tsx
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";

<InputOTP maxLength={4} value={pin} onChange={setPin} disabled={pinBloqueado}>
  <InputOTPGroup>
    <InputOTPSlot index={0} />
    <InputOTPSlot index={1} />
    <InputOTPSlot index={2} />
    <InputOTPSlot index={3} />
  </InputOTPGroup>
</InputOTP>
```

Auto-submit cuando se completan los 4 dígitos.

### 6.2 Server Action: Validar PIN

```
async function validarPin(encomiendaId: string, pinIngresado: string) {
  const supabase = await createClient();

  // 1. Obtener encomienda con PIN real
  const { data: enc } = await supabase
    .from("encomiendas")
    .select("pin_retiro, intentos_pin, pin_bloqueado")
    .eq("id", encomiendaId)
    .single();

  // 2. Verificar bloqueo
  if (enc.pin_bloqueado) {
    return { success: false, bloqueado: true, mensaje: "PIN bloqueado. Contactar soporte." };
  }

  // 3. Comparar PIN
  if (enc.pin_retiro === pinIngresado) {
    return { success: true, bloqueado: false };
  }

  // 4. PIN incorrecto — incrementar intentos
  const nuevosIntentos = enc.intentos_pin + 1;
  const nuevoBloqueado = nuevosIntentos >= 10;

  await supabase
    .from("encomiendas")
    .update({
      intentos_pin: nuevosIntentos,
      pin_bloqueado: nuevoBloqueado,
    })
    .eq("id", encomiendaId);

  return {
    success: false,
    bloqueado: nuevoBloqueado,
    intentosRestantes: 10 - nuevosIntentos,
    mensaje: nuevoBloqueado
      ? "PIN bloqueado. El destinatario debe contactar a soporte."
      : `PIN incorrecto. Intentos restantes: ${10 - nuevosIntentos}`,
  };
}
```

### 6.3 Feedback visual

- **Correcto**: InputOTP se pone verde + ✅ "PIN validado" + `setPinOk(true)`
- **Incorrecto**: InputOTP se pone rojo brevemente + mensaje error + limpiar input + mostrar intentos restantes
- **Bloqueado**: InputOTP se deshabilita + 🔒 mensaje fijo rojo + deshabilitar botón entrega

### Criterio de aceptación
- [ ] Input de 4 dígitos con auto-submit al completar
- [ ] PIN correcto muestra confirmación verde
- [ ] PIN incorrecto muestra error + intentos restantes
- [ ] Tras 10 intentos fallidos, PIN se bloquea permanentemente
- [ ] PIN bloqueado deshabilita el input y el botón de entrega

---

## Tarea 7: Confirmar Entrega + Server Actions

### 7.1 Server Action: Confirmar entrega

```
async function confirmarEntrega(encomiendaId: string) {
  const supabase = await createClient();

  const { error } = await supabase
    .from("encomiendas")
    .update({ estado: "ENTREGADA" })
    .eq("id", encomiendaId)
    .eq("estado", "EN_OFICINA_DESTINO"); // Safety check

  // No se envían notificaciones (spec lo indica explícitamente)

  return { success: !error, error: error?.message };
}
```

### 7.2 Post-entrega

- Toast: "✅ Encomienda {tracking_id} entregada exitosamente"
- Cerrar modal
- Encomienda desaparece de la tabla (ya no es EN_OFICINA_DESTINO)

### 7.3 Flujo completo resumido

```
1. Taquillero busca encomienda (tabla o búsqueda)
2. Click en fila → abre entrega-modal
3. Si modalidad_pago = DESTINO y no pagada:
   a. Taquillero cobra (aprobar digital o efectivo)
   b. pagoOk = true
4. Si modalidad_pago = ORIGEN → pagoOk = true automáticamente
5. Destinatario dicta PIN → taquillero lo ingresa
   a. PIN correcto → pinOk = true
   b. PIN incorrecto → error + reintentar
6. Botón "Confirmar Entrega" se habilita (pagoOk && pinOk)
7. Click → estado = ENTREGADA → cerrar → toast
```

### Criterio de aceptación
- [ ] Confirmar entrega solo funciona si PIN validado Y pago verificado
- [ ] Estado cambia a ENTREGADA
- [ ] No se envían notificaciones
- [ ] Encomienda desaparece de la tabla
- [ ] Flujo completo funciona end-to-end

---

## Resumen de Archivos

| Archivo | Tarea |
|---|---|
| `(panel)/recepcion-destino/page.tsx` | 1, 2 |
| `(panel)/recepcion-destino/actions.ts` | 2, 3 |
| `components/entrega/entrega-modal.tsx` | 5 |
| `components/entrega/pin-input.tsx` | 6 |
| `(panel)/entrega/page.tsx` | 4 |
| `(panel)/entrega/actions.ts` | 6, 7 |

## Orden de Ejecución

```
Tarea 1 (Vista recepción) → Tarea 2 (Escaneo individual)
→ Tarea 3 (Recepción por lote)
→ Tarea 4 (Vista entrega con alertas)
→ Tarea 5 (Modal de entrega) → Tarea 6 (Validación PIN)
→ Tarea 7 (Confirmar entrega)
```

> [!TIP]
> Recepción (Tareas 1-3) y Entrega (Tareas 4-7) son independientes entre sí y podrían desarrollarse en paralelo.
