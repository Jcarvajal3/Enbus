# Fase 4 — Taquilla de Boletos y Despacho

> **Prerrequisito**: Fase 1 (auth/layout) + Fase 2 (rutas/viajes) + Fase 3 (ScanInput reutilizable).

---

## Tarea 1: Tipos TypeScript para Boletos

**Archivo**: `src/lib/types/boletos.ts`

```typescript
export type EstadoBoleto = "RESERVADO" | "PAGADO" | "USADO" | "CANCELADO" | "EXPIRADO";

export interface Boleto {
  id: string;
  codigo_boleto: string;
  comprador_id: string | null; // NULL si venta presencial sin cuenta
  viaje_id: string;
  cooperativa_id: string;
  asiento: string;
  precio: number;
  estado: EstadoBoleto;
  qr_embarque_data: string | null;
  created_at: string;
  // Joined
  viaje?: {
    fecha_hora_salida: string;
    ruta: {
      ciudad_origen: string;
      estado_origen: string;
      ciudad_destino: string;
      estado_destino: string;
    };
  };
  // Datos manuales (pasajero sin cuenta) — almacenados en metadata o columnas extra
  pasajero_nombre?: string;
  pasajero_cedula?: string;
  pasajero_telefono?: string;
}
```

> [!WARNING]
> El schema actual de `boletos` tiene `comprador_id NOT NULL`. Para venta presencial sin cuenta, se necesita una migración:
> ```sql
> ALTER TABLE boletos ALTER COLUMN comprador_id DROP NOT NULL;
> ALTER TABLE boletos ADD COLUMN pasajero_nombre TEXT;
> ALTER TABLE boletos ADD COLUMN pasajero_cedula TEXT;
> ALTER TABLE boletos ADD COLUMN pasajero_telefono TEXT;
> ```

### Criterio de aceptación
- [ ] Tipos cubren todos los campos necesarios
- [ ] Migración aplicada si se requiere nullable `comprador_id`

---

## Tarea 2: Tabla de Boletos Vendidos

**Archivo**: `src/app/cooperativas/(panel)/taquilla/boletos/page.tsx`

### 2.1 Query

```
supabase.from("boletos")
  .select(`
    id, codigo_boleto, asiento, precio, estado, created_at,
    pasajero_nombre, pasajero_cedula,
    comprador:profiles!comprador_id(nombre_completo),
    viaje:viajes!viaje_id(
      fecha_hora_salida,
      ruta:rutas!ruta_id(ciudad_origen, estado_origen, ciudad_destino, estado_destino)
    )
  `)
  .eq("cooperativa_id", cooperativaId)
  .order("created_at", { ascending: false })
  .limit(50)
```

### 2.2 Filtros

- **Por estado**: `Select` con opciones: Todos, PAGADO, USADO, CANCELADO
- **Por fecha**: `Input` type date

### 2.3 Columnas

| Columna | Formato |
|---|---|
| Código | Monospace |
| Viaje | `{ciudad_origen} → {ciudad_destino}` + fecha/hora |
| Pasajero | `comprador.nombre_completo` o `pasajero_nombre` |
| Asiento | Texto |
| Estado | `StatusBadge` |
| Precio | Formato moneda |

### 2.4 Header de página

```tsx
<PageHeader title="Taquilla de Boletos" description="Venta y control de boletos">
  <Button onClick={() => setShowVentaFlow(true)}>
    <Ticket data-icon="inline-start" />
    Vender Boleto
  </Button>
</PageHeader>
```

### Criterio de aceptación
- [ ] Tabla lista boletos de la cooperativa
- [ ] Filtros por estado y fecha funcionan
- [ ] Botón "Vender Boleto" visible para admin y taquillero

---

## Tarea 3: Flujo de Venta — Paso 1: Selección de Viaje

**Archivo**: `src/components/boletos/venta-flow.tsx` (`"use client"`)

Implementar como un `Dialog` multi-step (wizard) o un `Sheet` lateral con steps.

### 3.1 Estado del wizard

```typescript
type VentaStep = "viaje" | "asiento" | "pasajero" | "pago" | "confirmacion";
const [step, setStep] = useState<VentaStep>("viaje");
const [selectedViaje, setSelectedViaje] = useState<Viaje | null>(null);
const [selectedAsiento, setSelectedAsiento] = useState<string | null>(null);
const [pasajeroData, setPasajeroData] = useState({ nombre: "", cedula: "", telefono: "" });
```

### 3.2 Paso "viaje": Selector de viajes próximos

Query:
```
supabase.from("viajes")
  .select(`
    id, fecha_hora_salida, fecha_hora_llegada_est, asientos_totales,
    asientos_disponibles, estado, numero_unidad,
    ruta:rutas(ciudad_origen, estado_origen, ciudad_destino, estado_destino, precio_pasaje)
  `)
  .eq("cooperativa_id", cooperativaId)
  .eq("estado", "PROGRAMADO")
  .gt("fecha_hora_salida", new Date().toISOString())
  .order("fecha_hora_salida", { ascending: true })
```

UI:
- Filtro opcional por ruta (`Select`)
- Lista de `Card` clickeables, cada una muestra:
  - Ruta: `{origen} → {destino}`
  - Fecha/hora de salida (formateada)
  - Asientos: `{disponibles}/{totales}` con `Badge` de color si quedan pocos
  - Precio del pasaje
- Al seleccionar → `setSelectedViaje(viaje)` → `setStep("asiento")`
- Viajes sin asientos disponibles: mostrar deshabilitado con badge "Agotado"

### Criterio de aceptación
- [ ] Solo muestra viajes futuros PROGRAMADOS de la cooperativa
- [ ] Viajes sin asientos están deshabilitados
- [ ] Click avanza al paso de asientos

---

## Tarea 4: Flujo de Venta — Paso 2: Selector de Asientos

**Archivo**: `src/components/boletos/seat-selector.tsx` (`"use client"`)

### 4.1 Query de asientos ocupados

```
supabase.from("boletos")
  .select("asiento")
  .eq("viaje_id", viajeId)
  .in("estado", ["RESERVADO", "PAGADO", "USADO"])
```

### 4.2 Componente visual de asientos

Renderizar un grid que simule la disposición de un bus:

```
Layout estándar (4 asientos por fila, 2+2 con pasillo):
  [1A] [1B]  |  [1C] [1D]
  [2A] [2B]  |  [2C] [2D]
  ...
```

```tsx
// Generar asientos basados en viaje.asientos_totales
const totalFilas = Math.ceil(viaje.asientos_totales / 4);
const asientos = [];
for (let fila = 1; fila <= totalFilas; fila++) {
  for (const col of ["A", "B", "C", "D"]) {
    const id = `${fila}${col}`;
    const num = (fila - 1) * 4 + "ABCD".indexOf(col) + 1;
    if (num <= viaje.asientos_totales) {
      asientos.push({ id, ocupado: ocupados.includes(id) });
    }
  }
}
```

UI de cada asiento:
- **Libre**: botón con borde, hover effect → al click seleccionar
- **Ocupado**: gris oscuro, disabled, cursor-not-allowed
- **Seleccionado**: color primario con checkmark
- Leyenda debajo: 🟢 Libre | 🔴 Ocupado | 🔵 Seleccionado

### 4.3 Props

```tsx
interface SeatSelectorProps {
  viajeId: string;
  totalAsientos: number;
  onSelect: (asiento: string) => void;
}
```

Al seleccionar → `setSelectedAsiento(id)` → `setStep("pasajero")`

### Criterio de aceptación
- [ ] Grid visual muestra disposición 2+2
- [ ] Asientos ocupados están deshabilitados
- [ ] Click en asiento libre lo selecciona visualmente
- [ ] Un solo asiento seleccionable a la vez

---

## Tarea 5: Flujo de Venta — Pasos 3 y 4: Pasajero y Pago

### 5.1 Paso "pasajero": Datos del pasajero

Campos (usar `FieldGroup` + `Field` de shadcn):

| Campo | Componente | Validación |
|---|---|---|
| Nombre Completo | `Input` text | Required, min 3 chars |
| Cédula/RIF | `Input` text | Required |
| Teléfono | `Input` tel | Opcional |

Botón "Siguiente" → `setStep("pago")`

### 5.2 Paso "pago": Método de cobro

Dos opciones (usar `ToggleGroup` o botones):

**Opción A — Efectivo** (más común):
- Botón grande: "💵 Cobrado en Efectivo"
- Al click → confirmar directamente

**Opción B — Transferencia**:
- Campos adicionales: Nº referencia, Fecha, Banco emisor
- Botón: "Confirmar Pago Digital"

### 5.3 Server Action: Crear boleto

**Archivo**: `src/app/cooperativas/(panel)/taquilla/boletos/actions.ts`

```
"use server"

async function venderBoleto(data: {
  viajeId: string;
  asiento: string;
  pasajeroNombre: string;
  pasajeroCedula: string;
  pasajeroTelefono?: string;
  tipoPago: "EFECTIVO" | "DIGITAL";
  referenciaData?: { numero: string; fecha: string; banco: string };
}) {
  const supabase = await createClient();
  const user = await getAuthUser();

  // 1. Generar código de boleto: BL-YYMMDD-XXXXX
  const codigo = generarCodigoBoleto();

  // 2. Generar QR de embarque (UUID único)
  const qrData = crypto.randomUUID();

  // 3. Obtener precio del pasaje desde la ruta del viaje
  const { data: viaje } = await supabase
    .from("viajes")
    .select("ruta:rutas(precio_pasaje)")
    .eq("id", data.viajeId)
    .single();

  const precio = viaje.ruta.precio_pasaje;

  // 4. Insertar boleto — estado PAGADO directo (venta presencial)
  const { data: boleto, error } = await supabase.from("boletos").insert({
    codigo_boleto: codigo,
    comprador_id: null, // Presencial sin cuenta
    viaje_id: data.viajeId,
    cooperativa_id: user.cooperativa_id,
    asiento: data.asiento,
    precio,
    estado: "PAGADO", // Directo, sin RESERVADO
    qr_embarque_data: qrData,
    pasajero_nombre: data.pasajeroNombre,
    pasajero_cedula: data.pasajeroCedula,
    pasajero_telefono: data.pasajeroTelefono,
  }).select().single();

  // 5. Insertar pago
  await supabase.from("pagos").insert({
    boleto_id: boleto.id,
    pagador_id: user.id,  // Taquillero registra
    cooperativa_id: user.cooperativa_id,
    monto: precio,
    tipo_pago: data.tipoPago,
    numero_referencia: data.referenciaData?.numero,
    fecha_transaccion: data.referenciaData?.fecha,
    banco_emisor: data.referenciaData?.banco,
    verificado: true,
    verificado_por: user.id,
    verificado_at: new Date().toISOString(),
  });

  // 6. El trigger DB actualiza viajes.asientos_disponibles automáticamente

  return { success: true, boleto, qrData };
}
```

### 5.4 Paso "confirmacion": Resultado

Mostrar:
- ✅ "Boleto vendido exitosamente"
- Código del boleto (grande)
- Asiento, pasajero, ruta, fecha
- QR de embarque renderizado (para impresión)
- Botón "Imprimir Boleto" → impresión Bluetooth (Fase 6) o `window.print()` como fallback
- Botón "Vender Otro" → reset wizard
- Botón "Cerrar"

### Criterio de aceptación
- [ ] Boleto se crea con estado PAGADO directo
- [ ] Pago se registra correctamente
- [ ] QR de embarque se genera
- [ ] `asientos_disponibles` se actualiza vía trigger
- [ ] Pantalla de confirmación muestra todos los datos

---

## Tarea 6: Escaneo de Embarque

**Archivo**: Integrar en `src/app/cooperativas/(panel)/taquilla/boletos/page.tsx`

### 6.1 Reutilizar ScanInput de Fase 3

Agregar campo de escaneo en la vista principal de boletos (debajo del header, encima de la tabla).

### 6.2 Lógica al escanear QR de embarque

```
1. Buscar boleto por QR:
   supabase.from("boletos")
     .select("id, codigo_boleto, asiento, estado, pasajero_nombre,
              comprador:profiles!comprador_id(nombre_completo)")
     .eq("qr_embarque_data", scannedCode)
     .eq("cooperativa_id", cooperativaId)
     .single()

2. Si no encontrado → toast error "Boleto no encontrado"
3. Si encontrado:
   a. Si estado = PAGADO → proceder con embarque
   b. Si estado = USADO → toast warning "Este boleto ya fue usado"
   c. Si estado = CANCELADO/EXPIRADO → toast error "Boleto inválido"
```

### 6.3 Confirmación de embarque

Al encontrar boleto válido (PAGADO), mostrar `Dialog` de confirmación:

```
┌──────────────────────────────────────┐
│  ✅ Boleto Válido                     │
│                                       │
│  Asiento: 3B                          │
│  Pasajero: Juan Pérez                 │
│  Ruta: Caracas → Valencia             │
│  Código: BL-260510-A3F2K              │
│                                       │
│  [Confirmar Embarque]  [Cancelar]     │
└──────────────────────────────────────┘
```

- Fondo verde para feedback visual positivo
- Al confirmar: `UPDATE boletos SET estado = 'USADO' WHERE id = boletoId`

### 6.4 Server Action

```
async function confirmarEmbarque(boletoId: string) {
  await supabase.from("boletos")
    .update({ estado: "USADO" })
    .eq("id", boletoId);
  return { success: true };
}
```

### Criterio de aceptación
- [ ] Escaneo de QR encuentra boleto y muestra confirmación verde
- [ ] Boleto ya usado muestra warning
- [ ] Boleto inválido muestra error
- [ ] Confirmar cambia estado a USADO
- [ ] ScanInput recupera foco tras cerrar diálogo

---

## Tarea 7: Lista de Pasajeros por Viaje

**Archivo**: `src/components/boletos/pasajeros-viaje-sheet.tsx`

### 7.1 Acceso

- Desde la tabla de boletos: botón/link "Ver pasajeros del viaje" en cada fila
- O desde un selector de viaje dedicado en la página

### 7.2 Query

```
supabase.from("boletos")
  .select(`
    id, codigo_boleto, asiento, estado, pasajero_nombre, pasajero_cedula,
    comprador:profiles!comprador_id(nombre_completo, cedula_rif)
  `)
  .eq("viaje_id", viajeId)
  .in("estado", ["PAGADO", "USADO"])
  .order("asiento", { ascending: true })
```

### 7.3 UI — Sheet lateral

Usar `Sheet` de shadcn (lado derecho).

- **Header**: Ruta + fecha del viaje
- **Contador**: `{usados}/{total} embarcados`
- **Tabla**:
  | Asiento | Pasajero | Cédula | Estado |
  |---|---|---|---|
  | 1A | Juan Pérez | V-12345678 | ✅ Embarcado |
  | 1B | María López | V-87654321 | ⏳ Pendiente |

- Estado visual:
  - `USADO` → ícono ✅ verde + "Embarcado"
  - `PAGADO` → ícono ⏳ amarillo + "Pendiente"

### Criterio de aceptación
- [ ] Sheet muestra todos los pasajeros del viaje seleccionado
- [ ] Contador de embarcados se actualiza
- [ ] Distinción visual clara entre embarcado y pendiente

---

## Tarea 8: Vista de Despacho

**Archivo**: `src/app/cooperativas/(panel)/despacho/page.tsx`

### 8.1 Query — Encomiendas agrupadas por viaje

```
// Paso 1: Obtener viajes próximos con encomiendas PAGADAS
supabase.from("viajes")
  .select(`
    id, fecha_hora_salida, estado, numero_unidad,
    ruta:rutas(ciudad_origen, ciudad_destino),
    encomiendas:encomiendas!viaje_id(
      id, tracking_id, receiver_nombre, estado
    )
  `)
  .eq("cooperativa_id", cooperativaId)
  .eq("estado", "PROGRAMADO")
  .order("fecha_hora_salida", { ascending: true })

// Filtrar en JS: solo viajes que tengan encomiendas en estado PAGADA
const viajesConEncomiendas = data.filter(v =>
  v.encomiendas.some(e => e.estado === "PAGADA")
);
```

### 8.2 UI — Lista agrupada

```
Para cada viaje:
┌─────────────────────────────────────────────────┐
│ 🚌 Caracas → Valencia  |  Salida: 10/05 14:00  │
│ Unidad: BUS-042  |  3 encomiendas               │
│                                                  │
│ ☐ EB-260510-A1B2C  →  María López               │
│ ☐ EB-260510-D3E4F  →  Pedro Gómez               │
│ ☐ EB-260510-G5H6I  →  Ana Torres                │
│                                                  │
│ [☑ Seleccionar Todas]   [Despachar Seleccionadas]│
└─────────────────────────────────────────────────┘
```

Componentes:
- Cada viaje es un `Card` con `Checkbox` por encomienda
- `Checkbox` "Seleccionar Todas" en el header del grupo
- Botón "Despachar Seleccionadas" — disabled si ninguna seleccionada

### 8.3 Modal de confirmación

Al presionar "Despachar Seleccionadas":

```
AlertDialog:
  Título: "¿Despachar encomiendas?"
  Descripción: "Se despacharán {N} encomiendas en el viaje
                {ciudad_origen} → {ciudad_destino} - {hora_salida}.
                Esta acción no se puede deshacer."
  Botones: [Cancelar] [Confirmar Despacho (destructive)]
```

### 8.4 Server Action: Despachar

```
"use server"

async function despacharEncomiendas(
  encomiendaIds: string[],
  viajeId: string
) {
  const supabase = await createClient();

  // 1. Actualizar todas las encomiendas a EN_TRANSITO
  const { error: encError } = await supabase
    .from("encomiendas")
    .update({ estado: "EN_TRANSITO" })
    .in("id", encomiendaIds)
    .eq("estado", "PAGADA"); // Safety check

  if (encError) return { success: false, error: encError.message };

  // 2. Cambiar viaje a EN_CURSO
  await supabase
    .from("viajes")
    .update({ estado: "EN_CURSO" })
    .eq("id", viajeId);

  // 3. Las notificaciones se envían via triggers/Edge Functions
  // (Push a remitentes, Push+WhatsApp a destinatarios)

  return { success: true, count: encomiendaIds.length };
}
```

### 8.5 Post-despacho

- Toast: "✅ {N} encomiendas despachadas exitosamente"
- El viaje desaparece de la lista (ya no tiene encomiendas PAGADAS)
- La tabla se refresca

### 8.6 Estado vacío

Si no hay viajes con encomiendas pendientes de despacho:
- Componente `Empty` de shadcn
- Icono `TruckTrailer`, texto: "No hay encomiendas pendientes de despacho"

### Criterio de aceptación
- [ ] Encomiendas PAGADAS aparecen agrupadas por viaje
- [ ] Selección individual y "seleccionar todas" funciona
- [ ] Modal de confirmación muestra resumen correcto
- [ ] Despachar cambia encomiendas a EN_TRANSITO
- [ ] Viaje cambia a EN_CURSO
- [ ] Acción irreversible desde esta interfaz
- [ ] Estado vacío cuando no hay pendientes

---

## Resumen de Archivos

| Archivo | Tarea |
|---|---|
| `lib/types/boletos.ts` | 1 |
| `(panel)/taquilla/boletos/page.tsx` | 2, 6 |
| `(panel)/taquilla/boletos/actions.ts` | 5, 6 |
| `components/boletos/venta-flow.tsx` | 3, 5 |
| `components/boletos/seat-selector.tsx` | 4 |
| `components/boletos/pasajeros-viaje-sheet.tsx` | 7 |
| `(panel)/despacho/page.tsx` | 8 |
| `(panel)/despacho/actions.ts` | 8 |
| Migración SQL (nullable comprador_id) | 1 |

## Orden de Ejecución

```
Tarea 1 (Tipos + migración) → Tarea 2 (Tabla boletos)
→ Tarea 3 (Selector viaje) → Tarea 4 (Selector asientos)
→ Tarea 5 (Pasajero + pago + confirmación)
→ Tarea 6 (Escaneo embarque) → Tarea 7 (Lista pasajeros)
→ Tarea 8 (Despacho)
```
