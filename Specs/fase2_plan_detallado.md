# Fase 2 — Dashboard, Empleados, Rutas y Viajes

> **Prerrequisito**: Fase 1 completa (auth, layout, sidebar funcionando).

---

## Tarea 1: KPI Cards del Dashboard

**Archivo**: `src/app/cooperativas/(panel)/dashboard/page.tsx`

### 1.1 Queries (Server Component)

Usar `createClient()` server-side. Todas filtradas por `cooperativa_id` del usuario.

```
KPI 1 — Encomiendas recibidas hoy:
  supabase.from("encomiendas")
    .select("id", { count: "exact", head: true })
    .eq("cooperativa_id", cooperativaId)
    .gte("created_at", hoyInicio)    // hoy 00:00:00 UTC-4
    .lte("created_at", hoyFin)
    .not("estado", "eq", "PENDIENTE_DE_ESCANEO")

KPI 2 — Encomiendas despachadas hoy:
  supabase.from("encomienda_estado_historial")
    .select("id", { count: "exact", head: true })
    .eq("estado_nuevo", "EN_TRANSITO")
    .gte("created_at", hoyInicio)
    .lte("created_at", hoyFin)
  NOTA: filtrar por cooperativa via join o subquery con encomienda_id

KPI 3 — Boletos vendidos hoy:
  supabase.from("boletos")
    .select("id", { count: "exact", head: true })
    .eq("cooperativa_id", cooperativaId)
    .eq("estado", "PAGADO")
    .gte("created_at", hoyInicio)

KPI 4 — Ingresos del día:
  supabase.from("pagos")
    .select("monto")
    .eq("cooperativa_id", cooperativaId)
    .eq("verificado", true)
    .gte("created_at", hoyInicio)
  Sumar en JS: data.reduce((sum, p) => sum + p.monto, 0)
```

### 1.2 UI — 4 Cards en fila

- Grid `grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4`
- Cada card: `Card` > `CardHeader` > `CardTitle` (nombre métrica) + `CardDescription` ("Hoy")
- `CardContent`: número grande (`text-3xl font-bold`)
- Iconos Phosphor: `Package`, `TruckTrailer`, `Ticket`, `CurrencyDollar`
- Loading: `Skeleton` de shadcn mientras carga

### Criterio de aceptación
- [ ] 4 cards muestran datos correctos del día actual
- [ ] Datos filtrados por cooperativa del usuario logueado
- [ ] Skeleton durante carga

---

## Tarea 2: Tabla de Encomiendas Recientes

**Archivo**: Mismo `dashboard/page.tsx`, debajo de los KPIs.

### 2.1 Query

```
supabase.from("encomiendas")
  .select("tracking_id, receiver_nombre, estado, created_at, estado_origen, ciudad_origen, estado_destino, ciudad_destino, sender:profiles!sender_id(nombre_completo)")
  .eq("cooperativa_id", cooperativaId)
  .order("created_at", { ascending: false })
  .limit(20)
```

### 2.2 UI

- Componente: `Table` de shadcn (`Table`, `TableHeader`, `TableRow`, `TableHead`, `TableBody`, `TableCell`)
- Columnas: Tracking ID, Remitente, Destinatario, Ruta (origen→destino), Estado, Fecha
- Estado con `Badge` y color semántico:
  - `PENDIENTE_DE_ESCANEO` → `variant="outline"`
  - `POR_PAGAR` → `variant="secondary"` (amarillo)
  - `PAGADA` → `variant="default"` (verde)
  - `EN_TRANSITO` → `variant="default"` (azul)
  - `ENTREGADA` → gris
- Fecha formateada: `Intl.DateTimeFormat("es-VE", { dateStyle: "short", timeStyle: "short" })`

### Criterio de aceptación
- [ ] Tabla muestra las últimas 20 encomiendas
- [ ] Badges de estado con colores correctos
- [ ] Visible para admin y taquillero

---

## Tarea 3: Gráfico de Actividad (Solo Admin)

### 3.1 Instalar Recharts

```bash
npm install recharts
```

### 3.2 Query — últimos 7 días

```
Para cada día de los últimos 7:
  - Contar encomiendas creadas ese día
  - Contar boletos PAGADOS ese día
Resultado: [{ date: "28/04", encomiendas: 12, boletos: 8 }, ...]
```

Implementar como Server Action o helper que ejecute las queries agrupadas.

### 3.3 UI

- Envolver en `{user.role === "admin_cooperativa" && (...)}`
- `Card` con título "Actividad — Últimos 7 días"
- Gráfico de barras apiladas (`BarChart` de Recharts)
  - Eje X: fechas
  - Barras: encomiendas (color primario) + boletos (color secundario)
  - `Tooltip`, `Legend` incluidos
- Si shadcn tiene componente `Chart`, usarlo como wrapper

### Criterio de aceptación
- [ ] Solo visible para `admin_cooperativa`
- [ ] Muestra datos de los últimos 7 días
- [ ] Tooltip al hover muestra valores exactos

---

## Tarea 4: Card de Comisiones Pendientes (Solo Admin)

### 4.1 Query

```
supabase.from("comisiones_ciclo")
  .select("monto_comision, periodo_inicio, periodo_fin, pagado")
  .eq("cooperativa_id", cooperativaId)
  .eq("pagado", false)
  .order("periodo_inicio", { ascending: false })
  .limit(1)
```

### 4.2 UI

- Solo visible para `admin_cooperativa`
- `Card` con:
  - Título: "Comisiones Pendientes"
  - Monto en grande (`text-2xl font-bold text-destructive`)
  - Subtítulo: "Periodo: {inicio} — {fin}"
  - Si no hay comisiones pendientes: "Sin comisiones pendientes ✓" en verde

### Criterio de aceptación
- [ ] Solo visible para admin
- [ ] Muestra monto y periodo del ciclo actual
- [ ] Caso vacío manejado

---

## Tarea 5: Gestión de Empleados

**Archivo**: `src/app/cooperativas/(panel)/empleados/page.tsx`

### 5.1 Query de empleados

```
supabase.from("profiles")
  .select("id, nombre_completo, role, cooperativa_id, created_at, telefono,
           auth_user:id(email)")
  .eq("cooperativa_id", cooperativaId)
  .in("role", ["taquillero", "admin_cooperativa"])
  .order("created_at", { ascending: false })
```

> Para obtener el email, se necesita una función RPC o un join a `auth.users` (solo posible con `service_role`). **Alternativa**: guardar el email en `profiles` o crear un RPC `SECURITY DEFINER`.

### 5.2 Tabla de empleados

- Columnas: Nombre, Email, Rol (`Badge`), Sucursal, Fecha registro, Estado
- Estado: columna booleana — usar un campo `activo` en profiles (o verificar si el auth user está baneado)
- Acciones por fila (columna final):
  - `DropdownMenu` con opciones: "Desactivar" (rojo) / "Reactivar"
  - El admin NO puede ver la opción para sí mismo

### 5.3 Modal "Invitar Empleado"

Botón en header de la página → abre `Dialog` de shadcn.

**Campos del formulario**:
- Email (`Input`, type email, required)
- Sucursal (`Select` con opciones cargadas de `sucursales` de la cooperativa)

**Lógica al enviar** (Server Action):
```
1. Verificar que no exista invitación activa para ese email:
   supabase.from("invitaciones")
     .select("id")
     .eq("email", email)
     .eq("usado", false)
     .gt("expira_at", "now()")
   Si existe → error "Ya hay una invitación activa para este email"

2. Insertar invitación:
   supabase.from("invitaciones").insert({
     email,
     role: "taquillero",
     cooperativa_id: user.cooperativa_id,
     sucursal_id: selectedSucursal,
     creado_por: user.id,
   })

3. Generar URL: `${window.location.origin}/cooperativas/invite/${token}`

4. Mostrar modal con el enlace + botón "Copiar enlace"
   (navigator.clipboard.writeText)
```

### 5.4 Desactivar/Reactivar empleado

**Desactivar** (Server Action):
```
1. Verificar que el target NO sea el usuario actual (prevenir auto-desactivación)
2. Llamar: supabase.auth.admin.updateUserById(targetId, { ban_duration: "876000h" })
   NOTA: Requiere service_role. Alternativa: agregar campo "activo" a profiles y verificar en middleware.
3. Refrescar tabla
```

**Reactivar**:
```
supabase.auth.admin.updateUserById(targetId, { ban_duration: "none" })
```

> [!WARNING]
> Las operaciones admin de auth requieren `SUPABASE_SERVICE_ROLE_KEY`. Deben ejecutarse SOLO en Server Actions, nunca en el client.

### 5.5 Protección de acceso

- Toda la página solo accesible por `admin_cooperativa`
- Verificar en el layout o al inicio del componente
- Si `taquillero` intenta acceder → redirect o mensaje "Sin permisos"

### Criterio de aceptación
- [ ] Tabla muestra todos los empleados de la cooperativa
- [ ] Modal de invitación valida email único y genera enlace
- [ ] Botón "Copiar enlace" funciona
- [ ] Desactivar bloquea acceso del empleado
- [ ] Reactivar restaura acceso
- [ ] Admin no puede desactivarse a sí mismo
- [ ] Taquillero no puede acceder a esta página

---

## Tarea 6: CRUD de Rutas

**Archivo**: `src/app/cooperativas/(panel)/rutas/page.tsx`

### 6.1 Datos de estados/ciudades de Venezuela

Crear `src/lib/data/venezuela.ts`:

```typescript
export const ESTADOS_VENEZUELA = [
  { value: "amazonas", label: "Amazonas" },
  { value: "anzoategui", label: "Anzoátegui" },
  { value: "aragua", label: "Aragua" },
  // ... todos los 23 estados + Distrito Capital
];

export const CIUDADES_POR_ESTADO: Record<string, { value: string; label: string }[]> = {
  "aragua": [
    { value: "maracay", label: "Maracay" },
    { value: "turmero", label: "Turmero" },
    // ...
  ],
  "carabobo": [
    { value: "valencia", label: "Valencia" },
    // ...
  ],
  // ... principales ciudades por estado
};
```

> Incluir al menos las 5 ciudades principales de cada estado.

### 6.2 Query de rutas

```
supabase.from("rutas")
  .select("*")
  .eq("cooperativa_id", cooperativaId)
  .order("created_at", { ascending: false })
```

### 6.3 Tabla de rutas

- Columnas: Origen → Destino, Duración, Precio pasaje, Estado
- Formato origen: `"{ciudad_origen}, {estado_origen}"`
- Duración: `"{duracion_estimada_min} min"` o convertir a horas si >60
- Precio: formateado con `Intl.NumberFormat("es-VE", { style: "currency", currency: "USD" })`
- Estado: `Badge` verde "Activa" / gris "Inactiva"
- Acciones: Editar, Activar/Desactivar

### 6.4 Modal Crear/Editar Ruta

Reutilizar mismo `Dialog` para crear y editar (pasar `ruta` prop para modo edición).

**Campos** (usar `FieldGroup` + `Field` de shadcn):

| Campo | Componente | Comportamiento |
|---|---|---|
| Estado Origen | `Select` con `ESTADOS_VENEZUELA` | Al cambiar, filtra ciudades |
| Ciudad Origen | `Select` con `CIUDADES_POR_ESTADO[estadoOrigen]` | Disabled hasta seleccionar estado |
| Estado Destino | `Select` | Mismo comportamiento |
| Ciudad Destino | `Select` | Idem |
| Duración (min) | `Input` type number, min=1 | Obligatorio |
| Precio Pasaje | `Input` type number, step=0.01, min=0 | Obligatorio |
| Activa | `Switch` de shadcn | Default: true |

**Validaciones**:
- Origen ≠ Destino (al menos estado o ciudad diferente)
- Duración > 0
- Precio > 0

**Server Action al guardar**:
```
Crear:
  supabase.from("rutas").insert({ cooperativa_id, estado_origen, ciudad_origen, ... })

Editar:
  supabase.from("rutas").update({ ... }).eq("id", rutaId)
```

### 6.5 Activar/Desactivar ruta

- Toggle inline o via dropdown action
- Al desactivar: verificar si tiene viajes futuros programados
  ```
  supabase.from("viajes")
    .select("id", { count: "exact", head: true })
    .eq("ruta_id", rutaId)
    .eq("estado", "PROGRAMADO")
    .gt("fecha_hora_salida", "now()")
  ```
  Si count > 0 → `AlertDialog`: "Esta ruta tiene {N} viajes futuros. ¿Desactivar de todos modos?"

### 6.6 Protección

- `admin_cooperativa`: CRUD completo
- `taquillero`: solo lectura (ocultar botones de crear/editar/desactivar)

### Criterio de aceptación
- [ ] Tabla lista todas las rutas de la cooperativa
- [ ] Crear ruta con selects cascadeados (estado→ciudad) funciona
- [ ] Editar ruta pre-llena los campos correctamente
- [ ] Desactivar ruta con viajes futuros muestra confirmación
- [ ] Taquillero ve la tabla pero no puede modificar

---

## Tarea 7: CRUD de Viajes

**Archivo**: `src/app/cooperativas/(panel)/viajes/page.tsx`

> [!NOTE]
> Rutas y Viajes comparten la URL base `/cooperativas/rutas` en el spec pero son secciones separadas. Implementar como **Tabs** dentro de la misma página o como sub-rutas: `/cooperativas/rutas` y `/cooperativas/viajes`.

### 7.1 Tabla de viajes

**Query**:
```
supabase.from("viajes")
  .select("*, ruta:rutas(estado_origen, ciudad_origen, estado_destino, ciudad_destino)")
  .eq("cooperativa_id", cooperativaId)
  .order("fecha_hora_salida", { ascending: false })
```

**Filtros** (encima de tabla):
- Por ruta: `Select` con rutas activas
- Por fecha: `Input` type date
- Por estado: `Select` con opciones PROGRAMADO, EN_CURSO, COMPLETADO, CANCELADO

**Columnas**: Ruta (origen→destino), Fecha/Hora Salida, Llegada Est., Asientos (disponibles/total), Estado (`Badge`), Acciones

### 7.2 Modal Crear/Editar Viaje

**Campos**:

| Campo | Componente | Detalle |
|---|---|---|
| Ruta | `Select` (rutas activas) | Al seleccionar, auto-calcula hora llegada |
| Fecha/Hora Salida | `Input` type datetime-local | Obligatorio |
| Hora Llegada Est. | `Input` type datetime-local | Auto: salida + ruta.duracion_estimada_min |
| Asientos Totales | `Input` type number, min=1 | Obligatorio |
| Nº de Unidad | `Input` type text | Opcional |
| Nombre del Chófer | `Input` type text | Opcional |
| Recurrente | `Switch` | Muestra campos adicionales si true |

**Auto-cálculo de hora llegada**:
```javascript
// Al cambiar ruta o fecha_hora_salida:
const salida = new Date(fechaHoraSalida);
const llegada = new Date(salida.getTime() + ruta.duracion_estimada_min * 60000);
setFechaHoraLlegada(llegada.toISOString());
```

### 7.3 Viajes Recurrentes (campos extra si `recurrente = true`)

- Checkboxes de días: L, M, Mi, J, V, S, D (usar `ToggleGroup` de shadcn)
- Hora de salida fija: `Input` type time
- Periodo desde: `Input` type date
- Periodo hasta: `Input` type date

**Lógica de generación** (Server Action):
```
1. Iterar desde periodo_inicio hasta periodo_fin
2. Para cada día que coincida con los días seleccionados:
   a. Crear viaje con fecha_hora_salida = ese día + hora fija
   b. fecha_hora_llegada = salida + duracion ruta
   c. asientos_disponibles = asientos_totales (todos libres)
   d. estado = PROGRAMADO
3. Batch insert: supabase.from("viajes").insert(viajes[])
4. Mostrar toast: "Se crearon {N} viajes"
```

### 7.4 Detalle de Viaje

Al hacer clic en una fila → abrir `Sheet` (panel lateral) o `Dialog` con:
- Info del viaje (ruta, fecha, bus, chófer)
- **Boletos vendidos**: tabla con pasajero, asiento, estado
- **Encomiendas asignadas**: tabla con tracking_id, remitente, destinatario, estado
- Campos editables: Nº de unidad, nombre del chófer (solo si estado = PROGRAMADO)

### 7.5 Reglas de negocio

- No eliminar viaje con boletos vendidos:
  ```
  supabase.from("boletos")
    .select("id", { count: "exact", head: true })
    .eq("viaje_id", viajeId)
    .in("estado", ["RESERVADO", "PAGADO"])
  ```
  Si count > 0 → solo permitir "Cancelar" (no eliminar), y mostrar alert de reembolsos
- Solo admin puede crear/editar. Taquillero: solo lectura.

### Criterio de aceptación
- [ ] Tabla lista viajes con filtros funcionales
- [ ] Crear viaje individual calcula hora llegada automáticamente
- [ ] Viajes recurrentes generan múltiples viajes correctamente
- [ ] Detalle muestra boletos y encomiendas del viaje
- [ ] No se puede eliminar viaje con boletos vendidos
- [ ] Taquillero solo lectura

---

## Tarea 8: Componentes Compartidos

Crear componentes reutilizables que se usan en múltiples tareas:

### 8.1 `src/components/page-header.tsx`
```tsx
// Título de página + descripción + acciones (slot para botones)
<div className="flex items-center justify-between">
  <div>
    <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
    <p className="text-muted-foreground">{description}</p>
  </div>
  {actions}
</div>
```

### 8.2 `src/components/status-badge.tsx`
```tsx
// Badge reutilizable para estados de encomienda, boleto, viaje
// Mapea estado → variant + label
```

### 8.3 `src/components/empty-state.tsx`
- Usar componente `Empty` de shadcn
- Props: icon, title, description, action (botón opcional)

### 8.4 `src/components/data-table.tsx`
- Wrapper sobre `Table` de shadcn con soporte para: loading (skeletons), empty state, y paginación básica

---

## Resumen de Archivos

| Archivo | Tarea |
|---|---|
| `(panel)/dashboard/page.tsx` | 1, 2, 3, 4 |
| `(panel)/empleados/page.tsx` | 5 |
| `(panel)/empleados/actions.ts` | 5 (Server Actions) |
| `(panel)/rutas/page.tsx` | 6 |
| `(panel)/rutas/actions.ts` | 6 |
| `(panel)/viajes/page.tsx` | 7 |
| `(panel)/viajes/actions.ts` | 7 |
| `lib/data/venezuela.ts` | 6 |
| `components/page-header.tsx` | 8 |
| `components/status-badge.tsx` | 8 |
| `components/empty-state.tsx` | 8 |
| `components/data-table.tsx` | 8 |

## Orden de Ejecución

```
Tarea 8 (Componentes compartidos) → Tarea 1 (KPIs) → Tarea 2 (Tabla recientes)
→ Tarea 3 (Gráfico) → Tarea 4 (Comisiones) → Tarea 5 (Empleados)
→ Tarea 6 (Rutas) → Tarea 7 (Viajes)
```

> [!TIP]
> Tarea 8 primero porque los componentes compartidos se usan en todas las demás tareas.
