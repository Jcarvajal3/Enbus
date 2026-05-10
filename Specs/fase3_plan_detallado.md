# Fase 3 — Taquilla de Encomiendas (Core Operacional)

> **Prerrequisito**: Fase 1 completa. Fase 2 no es bloqueante para esta fase.
> **URL**: `/cooperativas/taquilla/encomiendas`

---

## Tarea 1: Campo de Escaneo Inteligente

**Archivo**: `src/components/scan-input.tsx` (`"use client"`)

### 1.1 Comportamiento

- Input de texto siempre visible en la parte superior de la página
- `autoFocus` + re-focus automático: si el input pierde foco, lo recupera tras 2 segundos (excepto si hay un modal/dialog abierto)
- Placeholder: `"Escanear QR o escribir Tracking ID..."`
- Icono Phosphor `Barcode` a la izquierda

### 1.2 Detección de escáner USB vs tipeo manual

```typescript
// Hook: useBarcodeScan(onScan: (code: string) => void)
// Lógica:
let buffer = "";
let lastKeyTime = 0;

function handleKeyDown(e: KeyboardEvent) {
  const now = Date.now();

  if (e.key === "Enter") {
    if (buffer.length >= 6 && (now - lastKeyTime) < 500) {
      // Entrada de escáner: muchos chars rápido + Enter
      onScan(buffer.trim());
    }
    buffer = "";
    return;
  }

  if (now - lastKeyTime > 500) {
    buffer = ""; // Reset si pasó mucho tiempo
  }

  buffer += e.key;
  lastKeyTime = now;
}
```

- Si el usuario presiona Enter manualmente con texto en el input → también disparar búsqueda (fallback manual)
- Criterio escáner: >6 chars en <500ms (spec dice 100ms pero ser más permisivo en la práctica)

### 1.3 Acción al detectar código

```
1. Buscar encomienda:
   supabase.from("encomiendas")
     .select("*")
     .or(`tracking_id.eq.${code},qr_data.eq.${code}`)
     .single()

2. Si no encontrada → toast error "Encomienda no encontrada"
3. Si encontrada:
   a. Si estado = PENDIENTE_DE_ESCANEO → abrir Modal de Recepción (Tarea 3)
   b. Si estado = POR_PAGAR → abrir Panel de Pago (Tarea 4)
   c. Cualquier otro estado → abrir detalle read-only
4. Limpiar input después de procesar
```

### 1.4 Props del componente

```tsx
interface ScanInputProps {
  onEncomiendaFound: (encomienda: Encomienda) => void;
  cooperativaId: string;
  disabled?: boolean; // true cuando hay un modal abierto
}
```

### Criterio de aceptación
- [ ] Input mantiene autofocus (re-focus tras 2s si pierde foco)
- [ ] Escaneo USB detecta código y dispara búsqueda automáticamente
- [ ] Tipeo manual + Enter también funciona
- [ ] Encomienda no encontrada muestra toast de error
- [ ] Input se limpia después de cada búsqueda

---

## Tarea 2: Tabla de Encomiendas con Filtros

**Archivo**: `src/app/cooperativas/(panel)/taquilla/encomiendas/page.tsx`

### 2.1 Query principal

```
supabase.from("encomiendas")
  .select(`
    id, tracking_id, estado, modalidad_pago, peso_kg, costo_calculado,
    created_at, estado_origen, ciudad_origen, estado_destino, ciudad_destino,
    receiver_nombre, receiver_telefono,
    sender:profiles!sender_id(nombre_completo)
  `)
  .eq("cooperativa_id", cooperativaId)
  .order("created_at", { ascending: false })
  .limit(50)
```

### 2.2 Filtros rápidos

Usar `Tabs` de shadcn como filtros horizontales encima de la tabla:

| Tab | Filtro |
|---|---|
| Todas | Sin filtro de estado |
| Pendientes | `estado = PENDIENTE_DE_ESCANEO` |
| En Recepción | `estado = EN_RECEPCION` |
| Por Pagar | `estado = POR_PAGAR` |
| Pagadas | `estado = PAGADA` |

Al cambiar tab, re-ejecutar query con `.eq("estado", filtro)` añadido.

### 2.3 Columnas de la tabla

| Columna | Formato |
|---|---|
| Tracking ID | Texto monospace, clickeable (abre detalle) |
| Remitente | `sender.nombre_completo` |
| Destinatario | `receiver_nombre` |
| Ruta | `{ciudad_origen} → {ciudad_destino}` |
| Estado | `StatusBadge` (componente de Fase 2) |
| Fecha | `Intl.DateTimeFormat("es-VE")` relativo |

### 2.4 Click en fila

Al hacer clic en una fila:
- `PENDIENTE_DE_ESCANEO` → abrir Modal de Recepción
- `POR_PAGAR` → abrir Panel de Pago
- `PAGADA` o posterior → abrir detalle read-only (Sheet lateral)

### 2.5 Layout de la página

```
<PageHeader title="Taquilla de Encomiendas" />
<ScanInput onEncomiendaFound={handleFound} />
<Tabs> filtros de estado </Tabs>
<DataTable> tabla de encomiendas </DataTable>
```

### Criterio de aceptación
- [ ] Tabla muestra encomiendas de la cooperativa
- [ ] Filtros por estado funcionan
- [ ] Click en fila abre modal/panel según estado
- [ ] Se integra con ScanInput de Tarea 1

---

## Tarea 3: Modal de Recepción

**Archivo**: `src/components/encomiendas/recepcion-modal.tsx` (`"use client"`)

### 3.1 Validaciones al abrir

```
1. Verificar estado === "PENDIENTE_DE_ESCANEO"
   Si no → Alert error "Esta encomienda ya fue procesada"

2. Verificar que la cooperativa tenga ruta activa al destino:
   supabase.from("rutas")
     .select("id")
     .eq("cooperativa_id", cooperativaId)
     .eq("activa", true)
     .eq("estado_destino", encomienda.estado_destino)
     .eq("ciudad_destino", encomienda.ciudad_destino)
     .limit(1)
   Si no hay → Alert error "No hay ruta activa al destino"
```

### 3.2 Contenido del modal (`Dialog` de shadcn, tamaño `lg`)

**Sección 1: Información del envío** (read-only, grid de 2 columnas)
- Tracking ID
- Remitente (nombre)
- Destinatario (nombre + teléfono)
- Ruta: origen → destino
- Contenido: `descripcion_contenido`
- Modalidad de pago: `Badge` ORIGEN / DESTINO

**Sección 2: Formulario de pesaje**
- `Input` type number, step 0.01, min 0, max 25, label "Peso (kg)"
- Validación: si > 25 → mostrar error inline "Peso máximo: 25 kg"
- Al cambiar el peso → debounce 500ms → llamar cálculo de costo

**Sección 3: Costo calculado**
- Mostrar resultado del cálculo en texto grande
- Loading: `Spinner` mientras calcula
- Si no hay peso aún → "Ingrese el peso para calcular"

**Sección 4: Alert informativa**
- `Alert` de shadcn: "⚠️ Dimensiones máximas referenciales: 50 × 50 × 50 cm. Verificar visualmente."

**Footer del Dialog**:
- Botón "Cancelar" (secondary)
- Botón "Confirmar Recepción" (default) — disabled si no hay peso o costo

### 3.3 Cálculo de costo (Edge Function)

```typescript
// Llamar Edge Function existente: calcular-costo-encomienda
const { data } = await supabase.functions.invoke("calcular-costo-encomienda", {
  body: {
    peso_kg: peso,
    duracion_estimada_min: ruta.duracion_estimada_min,
  },
});
// data.costo → número decimal
```

Si la Edge Function no acepta esos params exactos, verificar su implementación y adaptar.

### 3.4 Server Action al confirmar

**Archivo**: `src/app/cooperativas/(panel)/taquilla/encomiendas/actions.ts`

```
"use server"

async function confirmarRecepcion(encomiendaId: string, peso: number, costo: number) {
  const supabase = await createClient(); // server client

  // 1. Actualizar encomienda: peso, costo, estado → POR_PAGAR
  const { error } = await supabase
    .from("encomiendas")
    .update({
      peso_kg: peso,
      costo_calculado: costo,
      estado: "POR_PAGAR",  // El trigger de transición validará EN_RECEPCION → POR_PAGAR
    })
    .eq("id", encomiendaId);

  // NOTA: El estado pasa PENDIENTE_DE_ESCANEO → EN_RECEPCION → POR_PAGAR
  // Puede que necesitemos 2 updates secuenciales o un RPC que haga ambos.
  // Verificar si el trigger de transición permite saltar EN_RECEPCION.
  // Si no, hacer:
  //   UPDATE estado = EN_RECEPCION (trigger genera PIN)
  //   UPDATE estado = POR_PAGAR, peso_kg, costo_calculado

  // 2. Llamar Edge Function generar-guia-pdf
  await supabase.functions.invoke("generar-guia-pdf", {
    body: { encomienda_id: encomiendaId },
  });

  // 3. Retornar resultado
  return { success: !error, error: error?.message };
}
```

### Criterio de aceptación
- [ ] Modal muestra info del envío correctamente
- [ ] Peso > 25kg muestra error bloqueante
- [ ] Costo se calcula en tiempo real al ingresar peso
- [ ] Confirmar actualiza estado a POR_PAGAR con peso y costo
- [ ] PIN se genera automáticamente (trigger DB)
- [ ] Guía PDF se genera (Edge Function)
- [ ] Modal se cierra y tabla se refresca tras confirmación

---

## Tarea 4: Panel de Verificación de Pago

**Archivo**: `src/components/encomiendas/pago-modal.tsx` (`"use client"`)

### 4.1 Cuándo se abre

- Al escanear/clickear una encomienda en estado `POR_PAGAR`
- Usar `Dialog` de shadcn, tamaño `md`

### 4.2 Contenido

**Sección 1: Resumen** (read-only)
- Tracking ID, remitente, destinatario, ruta, peso, costo

**Sección 2: Datos de pago del cliente**

Query al abrir:
```
supabase.from("pagos")
  .select("*")
  .eq("encomienda_id", encomiendaId)
  .order("created_at", { ascending: false })
  .limit(1)
```

Si hay pago registrado (el cliente confirmó desde la app):
- Mostrar: Nº referencia, fecha, banco emisor, monto
- Botón: **"Aprobar Pago"** (variante `default`)

Si no hay pago registrado:
- Texto: "El cliente aún no ha confirmado pago desde la app"

**Siempre visible**:
- Botón: **"Cobrado en Efectivo"** (variante `outline`)

### 4.3 Server Action: Aprobar/Cobrar pago

```
async function procesarPago(
  encomiendaId: string,
  tipoPago: "DIGITAL" | "EFECTIVO",
  pagoExistenteId?: string
) {
  // 1. Si DIGITAL y hay pago existente → marcar como verificado
  if (tipoPago === "DIGITAL" && pagoExistenteId) {
    await supabase.from("pagos")
      .update({ verificado: true, verificado_por: userId, verificado_at: new Date() })
      .eq("id", pagoExistenteId);
  }

  // 2. Si EFECTIVO → insertar nuevo pago
  if (tipoPago === "EFECTIVO") {
    await supabase.from("pagos").insert({
      encomienda_id: encomiendaId,
      pagador_id: userId, // el taquillero registra
      cooperativa_id: cooperativaId,
      monto: encomienda.costo_calculado,
      tipo_pago: "EFECTIVO",
      verificado: true,
      verificado_por: userId,
      verificado_at: new Date(),
    });
  }

  // 3. Cambiar estado encomienda → PAGADA
  await supabase.from("encomiendas")
    .update({ estado: "PAGADA" })
    .eq("id", encomiendaId);

  // 4. Abrir modal de foto de evidencia (retornar señal al client)
  return { success: true, requiresPhoto: true };
}
```

### Criterio de aceptación
- [ ] Si hay pago digital registrado, muestra datos y botón "Aprobar"
- [ ] "Cobrado en Efectivo" crea registro de pago + marca verificado
- [ ] Ambas acciones cambian estado a PAGADA
- [ ] Tras pago, se dispara el modal de foto (Tarea 5)

---

## Tarea 5: Captura de Fotografía de Evidencia

**Archivo**: `src/components/encomiendas/photo-capture-modal.tsx` (`"use client"`)

### 5.1 Cuándo se abre

- Automáticamente después de aprobar/cobrar pago (estado → PAGADA)
- Es **obligatorio**: el modal no tiene botón de cerrar (no `closeable`)

### 5.2 Implementación de cámara

```typescript
// Estado
const [stream, setStream] = useState<MediaStream | null>(null);
const [capturedImage, setCapturedImage] = useState<Blob | null>(null);
const videoRef = useRef<HTMLVideoElement>(null);
const canvasRef = useRef<HTMLCanvasElement>(null);

// Iniciar cámara al montar
useEffect(() => {
  async function startCamera() {
    const mediaStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment", width: 1280, height: 720 },
    });
    setStream(mediaStream);
    if (videoRef.current) videoRef.current.srcObject = mediaStream;
  }
  startCamera();
  return () => stream?.getTracks().forEach(t => t.stop());
}, []);

// Capturar frame
function capturePhoto() {
  const canvas = canvasRef.current!;
  const video = videoRef.current!;
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext("2d")!.drawImage(video, 0, 0);
  canvas.toBlob((blob) => setCapturedImage(blob!), "image/jpeg", 0.8);
}
```

### 5.3 UI del modal

- **Estado 1**: Cámara activa
  - `<video>` mostrando feed en vivo (estilizado con rounded corners)
  - `<canvas>` oculto (para captura)
  - Botón "📷 Capturar Foto" centrado debajo del video
  - Texto: "Tome una foto del paquete con la guía/etiqueta visible"

- **Estado 2**: Foto capturada (preview)
  - Mostrar imagen capturada (`URL.createObjectURL(blob)`)
  - Botón "Reintentar" (secondary) → volver a Estado 1
  - Botón "Confirmar y Subir" (default) → subir a Storage

### 5.4 Subir a Supabase Storage

```typescript
async function uploadPhoto(blob: Blob, encomiendaId: string) {
  const fileName = `${encomiendaId}/${Date.now()}.jpg`;

  // 1. Subir a Storage
  const { data, error } = await supabase.storage
    .from("fotos-encomiendas")
    .upload(fileName, blob, { contentType: "image/jpeg" });

  if (error) throw error;

  // 2. Obtener URL pública
  const { data: urlData } = supabase.storage
    .from("fotos-encomiendas")
    .getPublicUrl(fileName);

  // 3. Guardar URL en encomienda
  await supabase.from("encomiendas")
    .update({ foto_evidencia_url: urlData.publicUrl })
    .eq("id", encomiendaId);

  // 4. Cerrar modal
}
```

### 5.5 Manejo de errores

- Si el usuario niega acceso a cámara → mostrar Alert con instrucciones para habilitarla
- Si falla el upload → toast error + botón reintentar

### Criterio de aceptación
- [ ] Cámara se activa al abrir el modal
- [ ] Botón captura toma foto del frame actual
- [ ] Preview permite reintentar o confirmar
- [ ] Foto se sube a `fotos-encomiendas` en Storage
- [ ] URL se guarda en `encomiendas.foto_evidencia_url`
- [ ] Modal no se puede cerrar sin foto (no hay X de cierre)
- [ ] Cámara se detiene al cerrar modal

---

## Tarea 6: Suscripción Realtime

**Archivo**: `src/hooks/use-encomiendas-realtime.ts` (`"use client"`)

### 6.1 Hook

```typescript
export function useEncomiendasRealtime(
  cooperativaId: string,
  onUpdate: () => void  // callback para refrescar tabla
) {
  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel("encomiendas-changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "encomiendas",
          filter: `cooperativa_id=eq.${cooperativaId}`,
        },
        () => onUpdate()
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "pagos",
          filter: `cooperativa_id=eq.${cooperativaId}`,
        },
        () => onUpdate()
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [cooperativaId, onUpdate]);
}
```

### 6.2 Uso en la página

```tsx
// En taquilla/encomiendas/page.tsx (client component)
const [refreshKey, setRefreshKey] = useState(0);

useEncomiendasRealtime(cooperativaId, () => {
  setRefreshKey(k => k + 1); // Forzar re-fetch
});
```

O mejor: usar React Query con `invalidateQueries` en el callback.

### Criterio de aceptación
- [ ] Cuando otro taquillero cambia estado de una encomienda, la tabla se actualiza sola
- [ ] Cuando un cliente confirma pago desde la app, la tabla refleja el cambio
- [ ] No hay memory leaks (channel se limpia al desmontar)

---

## Tarea 7: Tipos TypeScript

**Archivo**: `src/lib/types/encomiendas.ts`

```typescript
export type EstadoEncomienda =
  | "PENDIENTE_DE_ESCANEO"
  | "EN_RECEPCION"
  | "POR_PAGAR"
  | "PAGADA"
  | "EN_TRANSITO"
  | "EN_OFICINA_DESTINO"
  | "ENTREGADA"
  | "CANCELADA"
  | "DEVUELTA";

export type ModalidadPago = "ORIGEN" | "DESTINO";
export type TipoPago = "DIGITAL" | "EFECTIVO";

export interface Encomienda {
  id: string;
  tracking_id: string;
  sender_id: string;
  receiver_nombre: string;
  receiver_telefono: string;
  receiver_cedula_rif: string;
  cooperativa_id: string | null;
  estado_origen: string;
  ciudad_origen: string;
  estado_destino: string;
  ciudad_destino: string;
  descripcion_contenido: string;
  peso_kg: number | null;
  costo_calculado: number | null;
  modalidad_pago: ModalidadPago;
  estado: EstadoEncomienda;
  foto_evidencia_url: string | null;
  created_at: string;
  // Joined
  sender?: { nombre_completo: string };
}

export interface Pago {
  id: string;
  encomienda_id: string | null;
  monto: number;
  tipo_pago: TipoPago;
  numero_referencia: string | null;
  fecha_transaccion: string | null;
  banco_emisor: string | null;
  verificado: boolean;
}
```

### Criterio de aceptación
- [ ] Todos los componentes de esta fase usan estos tipos (no `any`)

---

## Tarea 8: Integración Completa y Estado de Página

**Archivo**: `src/app/cooperativas/(panel)/taquilla/encomiendas/page.tsx`

### 8.1 Estado del componente principal

```tsx
"use client";

// Estados del modal
const [modalState, setModalState] = useState<
  | { type: "closed" }
  | { type: "recepcion"; encomienda: Encomienda }
  | { type: "pago"; encomienda: Encomienda }
  | { type: "photo"; encomiendaId: string }
  | { type: "detail"; encomienda: Encomienda }
>({ type: "closed" });
```

### 8.2 Flujo completo de estados

```
1. Taquillero escanea QR
2. ScanInput busca encomienda → setModalState({ type: "recepcion", encomienda })
3. RecepcionModal confirma → actualiza estado a POR_PAGAR → cierra
4. Taquillero escanea de nuevo (o click en tabla) → setModalState({ type: "pago", encomienda })
5. PagoModal aprueba/cobra → actualiza estado a PAGADA → setModalState({ type: "photo", encomiendaId })
6. PhotoCaptureModal sube foto → cierra → setModalState({ type: "closed" })
7. Tabla se refresca via Realtime
```

### 8.3 Transición automática Recepción → Pago (si modalidad ORIGEN)

Si `modalidad_pago === "ORIGEN"`, tras confirmar recepción se puede abrir directamente el panel de pago sin necesidad de re-escanear (flujo continuo para el taquillero).

### Criterio de aceptación
- [ ] Flujo completo funciona: escanear → pesar → calcular → confirmar → pagar → foto
- [ ] Todos los modales se abren y cierran correctamente
- [ ] La tabla se refresca en tiempo real
- [ ] El campo de escaneo recupera foco cuando no hay modal abierto

---

## Resumen de Archivos

| Archivo | Tarea |
|---|---|
| `components/scan-input.tsx` | 1 |
| `(panel)/taquilla/encomiendas/page.tsx` | 2, 8 |
| `(panel)/taquilla/encomiendas/actions.ts` | 3, 4 |
| `components/encomiendas/recepcion-modal.tsx` | 3 |
| `components/encomiendas/pago-modal.tsx` | 4 |
| `components/encomiendas/photo-capture-modal.tsx` | 5 |
| `hooks/use-encomiendas-realtime.ts` | 6 |
| `lib/types/encomiendas.ts` | 7 |

## Orden de Ejecución

```
Tarea 7 (Tipos) → Tarea 1 (ScanInput) → Tarea 2 (Tabla)
→ Tarea 3 (Recepción) → Tarea 4 (Pago) → Tarea 5 (Foto)
→ Tarea 6 (Realtime) → Tarea 8 (Integración)
```
