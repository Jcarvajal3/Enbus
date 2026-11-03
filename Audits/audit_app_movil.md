# 🔍 Auditoría App Móvil — Segunda Ronda

> **Fecha**: 2026-04-14  
> **Alcance**: 7 Specs `02_App_Movil/` vs implementación `EnBusApp/`  
> **Baseline**: Ronda 1 (25% conformidad) → Ronda 2

---

## 📊 Scorecard Ronda 1 → Ronda 2

| ID R1 | Hallazgo | Ronda 1 | Ronda 2 |
|---|---|---|---|
| C-01 | Auth Stack (Login/Register) | ❌ | ⚠️ Parcial |
| C-02 | Datos hardcodeados / sin Supabase | ❌ | ⚠️ Parcial |
| C-03 | Falta `<SearchForm />` | ❌ | ✅ Resuelto |
| C-04 | Árbol de rutas incompleto | ❌ | ⚠️ Parcial |
| C-05 | Tab Encomiendas sin Top Tabs ni botón Crear | ❌ | ✅ Resuelto |
| M-01 | Sección "Activos" de Inicio | ❌ | ✅ Resuelto |
| M-02 | Botón "Viajar" en Tab Boletos | ❌ | ✅ Resuelto |
| M-03 | Tracking ID formato incorrecto en mocks | ❌ | ⚠️ Sigue en detalle screens |
| M-04 | Header Global (campana + perfil) | ❌ | ⚠️ Solo perfil avatar parcial |
| M-05 | `constants/theme.ts` legacy sin uso | ❌ | ❌ Sin resolver |
| M-06 | Tab bar con colores hardcodeados | ❌ | ❌ Sin resolver |
| M-07 | Fuente `minion-pro` referenciada | ❌ | ✅ Eliminada |
| M-08 | `SafeAreaView` con inline colors inconsistentes | ❌ | ⚠️ Mejorado, persiste |
| M-09 | Emoji en lugar de Phosphor Icon | ❌ | ✅ Resuelto |

**Ronda 2: ~12/14 issues de Ronda 1 parcialmente o totalmente resueltos.**

**Nuevos hallazgos Ronda 2: 7 identificados (1 crítico de seguridad).**

**Calificación: 🟡 ~62% de conformidad. Avance significativo, flujos principales esqueléticos pero presentes.**

---

## ✅ Correcciones Verificadas y Aprobadas

### ✅ C-03 — `<SearchForm />` implementado
**Archivo**: [SearchForm.tsx](file:///c:/Users/Javie/Documents/Dev/Panas%20Cargo/EnBusApp/src/components/SearchForm.tsx)

Implementación completa con:
- Segmented Control (toggle Boletos/Encomiendas) ✅
- `<LocationSelector />` para Origen y Destino ✅
- Campo de Fecha (placeholder estático — ver N-03) ⚠️
- Props `mode`, `showModeToggle`, `initialOrigen`, `initialDestino`, `onSubmit` ✅
- CTA dinámico "Buscar Boletos" / "Enviar Paquete" ✅
- Deshabilitado hasta que origen y destino están llenos ✅

---

### ✅ C-05 — Tab Encomiendas con Top Tabs y botón "Crear Nuevo Envío"
**Archivo**: [encomiendas.tsx](file:///c:/Users/Javie/Documents/Dev/Panas%20Cargo/EnBusApp/app/(tabs)/encomiendas.tsx)

- Toggle "Para Mí" / "Enviados" implementado como Segmented Control ✅
- Botón flotante "Crear Nuevo Envío" con ícono `<Plus />` de Phosphor ✅
- Navega a `/encomiendas/nueva` ✅
- Estado vacío con diseño limpio ✅
- `<TransactionCard />` usado correctamente ✅

> [!NOTE]
> El spec dice **"Recibir"** y **"Enviar"** como labels de los tabs. La implementación usa **"Para Mí"** y **"Enviados"**. No es un error funcional, pero se desvía del spec. Recomendable alinear etiquetas.

---

### ✅ M-01 — Sección "Activos" en Inicio con Realtime y carrusel horizontal
**Archivo**: [index.tsx](file:///c:/Users/Javie/Documents/Dev/Panas%20Cargo/EnBusApp/app/(tabs)/index.tsx)

- Suscripción Realtime via `useRealtime` hook ✅
- `<TransactionCard />` en ScrollView horizontal ✅
- `<ActivityIndicator />` durante carga ✅
- Sección invisible cuando no hay datos (condición `length > 0`) ✅
- Saludo con email del usuario autenticado ✅

---

### ✅ M-02 — Tab Boletos con botón CTA y listado con Realtime
**Archivo**: [boletos.tsx](file:///c:/Users/Javie/Documents/Dev/Panas%20Cargo/EnBusApp/app/(tabs)/boletos.tsx)

- Botón flotante "Viajar (Ver Pase)" ✅ (ver N-02 para observación)
- `useRealtime` con filtro por `comprador_id` ✅
- Estado vacío con diseño y ícono Phosphor ✅

---

### ✅ C-03 — `<LocationSelector />` funcional con catálogo estático
**Archivo**: [LocationSelector.tsx](file:///c:/Users/Javie/Documents/Dev/Panas%20Cargo/EnBusApp/src/components/LocationSelector.tsx)

- Modal `pageSheet` con búsqueda en tiempo real ✅
- Catálogo estático `VENEZUELA_LOCATIONS` en `venezuela.ts` ✅
- Spec dice: "datos embebidos en la app (no de DB)" ✅

> [!NOTE]
> El catálogo solo tiene **10 ciudades**. Venezuela tiene 335+ municipios. Esto es suficiente para desarrollo, pero debe expandirse antes de producción. El spec no define la lista exacta, por lo que es una deuda técnica de contenido, no de arquitectura.

---

### ✅ Auth — `AuthContext` + redirección condicional en root layout
**Archivos**: [AuthContext.tsx](file:///c:/Users/Javie/Documents/Dev/Panas Cargo/EnBusApp/src/contexts/AuthContext.tsx), [_layout.tsx](file:///c:/Users/Javie/Documents/Dev/Panas%20Cargo/EnBusApp/app/_layout.tsx)

```tsx
if (!session && !inAuthGroup) router.replace('/(auth)/login');
else if (session && inAuthGroup) router.replace('/(tabs)');
```

Patrón correcto de redirección. `onAuthStateChange` con cleanup de subscription ✅. Estado `initialized` para evitar flash de contenido ✅.

---

### ✅ `global.css` — Dark mode corregido con media query estándar
**Archivo**: [global.css:86-112](file:///c:/Users/Javie/Documents/Dev/Panas%20Cargo/EnBusApp/app/global.css)

Cambio importante: la versión anterior usaba `light-dark()` CSS function (experimental), la nueva usa `@media (prefers-color-scheme: dark)` estándar. Más compatible con React Native. ✅

---

### ✅ `useRealtime` — Hook genérico con suscripción Realtime
**Archivo**: [useRealtime.ts](file:///c:/Users/Javie/Documents/Dev/Panas%20Cargo/EnBusApp/src/hooks/useRealtime.ts)

- Fetch inicial + suscripción WebSocket ✅
- Manejo de INSERT/UPDATE/DELETE optimista ✅
- Cleanup correcto (`isMounted`, `channel.unsubscribe()`) ✅
- `setData` expuesto para mutación optimista ✅

---

### ✅ Login screen — Funcional con Supabase Auth
**Archivo**: [login.tsx](file:///c:/Users/Javie/Documents/Dev/Panas%20Cargo/EnBusApp/app/(auth)/login.tsx)

- `signInWithPassword` ✅
- `signUp` con confirmación de email ✅
- Loading state en botón ✅
- Diseño con tokens Maia (primario, tarjeta, inputs) ✅

---

## 🔴 Hallazgo Crítico Nuevo

### 🔴 N-00 — ANON KEY expuesta directamente en el código fuente (hardcoded en repositorio)

**Archivo**: [supabase.ts:6](file:///c:/Users/Javie/Documents/Dev/Panas%20Cargo/EnBusApp/src/utils/supabase.ts)

```typescript
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 
  '<ANON_KEY>'
```

La JWT ANON KEY completa está hardcodeada como fallback en el código fuente y será enviada al repositorio Git.

> [!CAUTION]
> **Impacto**: La ANON KEY de Supabase debe tratarse como una clave semi-secreta. Aunque es diseñada para ser pública al frontend, exponerla en el código git:
> 1. Viola la gestión de secretos del proyecto (`.env` pattern)
> 2. Cualquier fork o colaborador las ve directamente
> 3. Si se rota la clave (común en breaches), el código queda desactualizado y roto
>
> **Acción**: Mover a `.env.local` (que está en `.gitignore`):
> ```
> EXPO_PUBLIC_SUPABASE_URL=https://tydpnvajwfzcsxsowctp.supabase.co
> EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJhbGci...
> ```
> Y en `supabase.ts`:
> ```typescript
> const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
> if (!supabaseAnonKey) throw new Error('EXPO_PUBLIC_SUPABASE_ANON_KEY not set');
> ```

---

## 🟡 Hallazgos Moderados Nuevos

### N-01 — `encomiendas.tsx` filtra por receptor con valor dummy hardcodeado

**Archivo**: [encomiendas.tsx:20-22](file:///c:/Users/Javie/Documents/Dev/Panas%20Cargo/EnBusApp/app/(tabs)/encomiendas.tsx)

```typescript
const { data: historial } = useRealtime<any>(
  'encomiendas', 
  tab === 'enviar' ? 'sender_id' : 'receiver_telefono', 
  tab === 'enviar' ? user?.id : '+580000000000' // dummy mock receiver
);
```

El tab "Para Mí" **nunca mostrará encomiendas reales** porque filtra por `receiver_telefono = '+580000000000'` (un número inventado). La lógica correcta es filtrar por `receiver_user_id = user.id` OR `receiver_telefono = user.phone`.

El hook `useRealtime` solo soporta **un filtro por columna**. Esta arquitectura tiene una limitación de diseño: no soporta condiciones `OR`. Para el tab "Para Mí" se necesita una query custom.

> [!WARNING]
> **Acción**: Crear un hook específico `useEncomiendas()` que maneje las dos condiciones de receptor.

---

### N-02 — Tab Boletos: botón "Viajar" navega a ruta hardcodeada

**Archivo**: [boletos.tsx:63](file:///c:/Users/Javie/Documents/Dev/Panas%20Cargo/EnBusApp/app/(tabs)/boletos.tsx)

```typescript
onPress={() => router.push('/boletos/BOL-DEMO')}
```

El spec dice que "Viajar" debería abrir un `<SearchForm mode="boletos" showModeToggle={false}>` para buscar nuevos boletos. Actualmente navega directamente a un detalle de boleto demo inexistente.

**Además**: El ícono usado es `<AirplaneTilt />` (avión). El spec [Section_Boletos_Spec.md §3.2](file:///c:/Users/Javie/Documents/Dev/Panas%20Cargo/Specs/02_App_Movil/Section_Boletos_Spec.md) dice ícono de **bus**.

---

### N-03 — `<SearchForm />` — Campo de fecha es un botón estático no funcional

**Archivo**: [SearchForm.tsx:28,87-93](file:///c:/Users/Javie/Documents/Dev/Panas%20Cargo/EnBusApp/src/components/SearchForm.tsx)

```typescript
const [fecha, setFecha] = useState('Mañana');
// ...
<Pressable className="bg-secondary flex-row items-center px-4 h-14 rounded-2xl">
  <Text>{fecha}</Text>  {/* No abre ningún DatePicker */}
</Pressable>
```

El `<DatePicker />` no existe. El botón de fecha en el SearchForm no hace nada al presionarlo.

**Spec**: `<DatePicker />` es un componente compartido requerido en el flujo de Boletos.

---

### N-04 — Wizard `nueva.tsx` mezcla imports inconsistentes

**Archivo**: [nueva.tsx:4-6](file:///c:/Users/Javie/Documents/Dev/Panas%20Cargo/EnBusApp/app/encomiendas/nueva.tsx)

```typescript
import { ScrollView, View, Text, Pressable, TextInput } from 'react-native'; // vanilla RN
import { View as TwView, Text as TwText, Pressable as TwPressable } from '@/tw'; // wrappers CSS
```

El mismo archivo usa tanto los wrappers de NativeWind (`@/tw`) como los componentes vanilla de React Native (`react-native`). Los `TextInput` del paso 2 están en vanilla RN con `style={}` inline, ignorando el sistema de diseño y perdiendo dark mode.

**Especificación**: Todo debe usar `@/tw` para consistencia de estilos CSS.

---

### N-05 — `encomiendas/[id].tsx` — Timeline totalmente hardcodeado, no carga datos reales

**Archivo**: [encomiendas/[id].tsx:9-15](file:///c:/Users/Javie/Documents/Dev/Panas%20Cargo/EnBusApp/app/encomiendas/%5Bid%5D.tsx)

```typescript
const mockTimeline = [
  { estado: 'PENDIENTE', label: 'Orden Creada', ... },
  // etc.
];
```

La pantalla de detalle de encomienda:
- Muestra el `{id}` de la URL en el header ✅
- Pero carga un timeline mockeado fijo
- No consulta `encomienda_estado_historial` de Supabase
- No consulta los campos reales de la encomienda (peso, costo, remitente, destinatario, PIN)
- El estado del QR se muestra siempre (debería solo mostrarse en `PENDIENTE_DE_ESCANEO`)

---

### N-06 — `boletos/[id].tsx` — 100% hardcodeado, no carga datos reales

**Archivo**: [boletos/[id].tsx](file:///c:/Users/Javie/Documents/Dev/Panas%20Cargo/EnBusApp/app/boletos/%5Bid%5D.tsx)

El diseño de Boarding Pass es visualmente excelente (✅ estética), pero los datos son completamente inventados:
- "Expresos Panamericana" hardcodeado
- "CCS" / "VLN" (no son datos reales)
- "Tu Nombre" literal hardcodeado
- "Nov 15, 2026" fija
- "12A" hardcodeado
- "042 • Carlos Díaz" hardcodeado

Adicionalmente, el badge usa colores raw (`bg-green-100`, `text-green-800`) en vez de tokens semánticos, igual que en Ronda 1.

---

### N-07 — Wizard `nueva.tsx` — Paso 3 no crea encomienda en Supabase

**Archivo**: [nueva.tsx:91-95](file:///c:/Users/Javie/Documents/Dev/Panas%20Cargo/EnBusApp/app/encomiendas/nueva.tsx)

```typescript
onPress={() => {
  if (step < 3) setStep(step + 1);
  else {
    router.replace({ pathname: '/encomiendas/[id]', params: { id: 'NUEVO-1234' } });
  }
}}
```

Al presionar "Generar Código QR" en el paso 3:
- **No inserta** la encomienda en Supabase
- Navega con `id: 'NUEVO-1234'` (string literal hardcodeado)
- El tracking ID real viene del trigger de la DB (`EB-YYMMDD-XXXXX`)

**Spec**: Al presionar "Generar Código QR" → `INSERT INTO encomiendas` → DB genera tracking_id → navegar con ese ID real.

---

## 🟢 Hallazgos Sin Resolver de Ronda 1 (No nuevos)

### M-05 — `constants/theme.ts` legacy sigue presente
Archivo con paleta incorrecta (`#0a7ea4` azul) del template Expo. No es usado por nada del código nuevo, pero genera confusión. **Eliminar**.

### M-06 — Tab bar con colores hardcodeados
**Archivo**: [(tabs)/_layout.tsx:7-8](file:///c:/Users/Javie/Documents/Dev/Panas%20Cargo/EnBusApp/app/(tabs)/_layout.tsx)
```tsx
const activeColor = '#e2b714';
const inactiveColor = '#a3a3a3';
backgroundColor: '#ffffff',
```
Deben usar `useCSSVariable` del `@/tw`. El hook está disponible pero no se usa en la tab bar.

### M-08 — Backgrounds inline inconsistentes aún presentes en algunas pantallas
`login.tsx` usa `backgroundColor: '#ffffff'`. `boletos.tsx` y otros usan `#f5f5f5`. Debe usar el token semántico apropiado.

---

## 📊 Estado de los 10 Shared Components (Ronda 1 → 2)

| # | Componente | Ronda 1 | Ronda 2 |
|---|---|---|---|
| 1 | `<SearchForm />` | ❌ | ✅ Implementado |
| 2 | `<LocationSelector />` | ❌ | ✅ Implementado (catálogo parcial) |
| 3 | `<ResultsList />` | ❌ | ❌ No existe |
| 4 | `<SeatSelector />` | ❌ | ❌ No existe |
| 5 | `<StatusTimeline />` | ❌ | ✅ Implementado (con datos mock) |
| 6 | `<PaymentFlow />` | ❌ | ❌ No existe |
| 7 | `<TransactionCard />` | ❌ | ✅ Implementado (3 variantes + badges) |
| 8 | `<StarRating />` | ❌ | ❌ No existe |
| 9 | `<QRCodeViewer />` | ❌ | ⚠️ Placeholder visual (sin lib real) |
| 10 | `<DatePicker />` (equivalente) | ❌ | ❌ No existe |

**4/10 implementados (aunque algunos parcialmente). Ronda 1: 0/10.**

---

## 🔄 Specs que Deben Actualizarse

### Spec 1: `Navigation_Spec.md` — App/(auth) no incluye Register ni ForgotPassword como pantallas separadas

**Estado actual del spec**:
```
Auth Stack
├── Login Screen
├── Register Screen       ← No existe en implementación
└── Forgot Password Screen ← No existe en implementación
```

**Estado de la implementación**: Solo existe `app/(auth)/login.tsx`. La pantalla tiene un botón "Registrarse" que llama `signUp` **desde la misma pantalla de Login**, mezclando Login y Registro en un solo archivo.

**Recomendación para el spec**: Documentar esta decisión de UX. El patrón "Login + botón Registrarme en la misma pantalla" es válido (estilo Airbnb/Uber), pero el spec asume pantallas separadas. **Se debe actualizar el `Navigation_Spec.md`** para reflejar si el register irá en pantalla separada o en la misma pantalla de login.

---

### Spec 2: `Section_Encomiendas_Spec.md §3.1` — Labels de Top Tabs

**Spec**: "Top Tabs con 2 vistas: **Recibir** | **Enviar**"  
**Implementación**: "**Para Mí** | **Enviados**"

Si el equipo prefiere los nuevos labels (más descriptivos en español coloquial venezolano), actualizar el spec. Si no, la implementación debe usar "Recibir" y "Enviar".

---

### Spec 3: `Section_Boletos_Spec.md §3.2` — Ícono del botón "Viajar"

**Spec**: "ícono de bus"  
**Implementación**: `<AirplaneTilt />` (avión)

Phosphor Icons tiene: `Bus`, `VanFront`, `Truck` para opciones de bus. El spec debe confirmarse: ¿ícono `Bus` de Phosphor? Actualizar el spec con el nombre exacto del ícono Phosphor para evitar ambigüedad.

---

## 📋 Plan de Acción Priorizado (Ronda 3)

### Prioridad 🔴 P0 — Bloquea funcionalidad real
| ID | Acción |
|---|---|
| **N-00** | Mover ANON KEY a `.env.local`, eliminar hardcode del repo |
| **N-01** | Crear `useEncomiendas()` con OR para `sender_id` / `receiver_user_id` |
| **N-07** | Implementar INSERT real en Supabase al finalizar wizard |
| **N-05** | Cargar datos reales de encomienda en pantalla de detalle desde Supabase |

### Prioridad 🟡 P1 — Completa los flujos principales
| ID | Acción |
|---|---|
| **N-02** | Botón "Viajar" → abrir `<SearchForm mode="boletos">` (no detalle demo) |
| **N-03** | Integrar `<DatePicker />` real (ej: `@react-native-community/datetimepicker`) |
| **N-04** | Migrar `nueva.tsx` paso 2 a imports `@/tw` + `<TextInput />` con tokens CSS |
| **N-06** | Cargar datos reales de boleto en pantalla de detalle. Eliminar datos hardcodeados |
| — | Implementar `<ResultsList />` — pantalla de resultados de búsqueda |

### Prioridad 🟢 P2 — Calidad y specs
| ID | Acción |
|---|---|
| **M-05** | Eliminar `constants/theme.ts` y archivos legacy del template |
| **M-06** | Hacer tab bar usar `useCSSVariable` o tokens CSS |
| **M-08** | Unificar backgrounds a token `--background` |
| — | Integrar `react-native-qrcode-svg` en `<QRCodeViewer />` para QR real |
| — | Expandir `VENEZUELA_LOCATIONS` a todos los municipios de Venezuela |
| — | Implementar `<PaymentFlow />`, `<SeatSelector />`, `<StarRating />` |

---

## 🏁 Estado Final Ronda 2

```
Infraestructura:     ████████████████████ 98% ✅ (Solo falta .env file)
Design Tokens:       ████████████████████ 98% ✅
Auth Flow:           ████████████████░░░░ 70% ⚠️ (Solo login, falta register/forgot)
Navegación:          ████████████░░░░░░░░ 55% ⚠️ (Tabs OK, faltan ~8 rutas)
Tab Inicio:          ████████████████░░░░ 75% ✅
Tab Encomiendas:     ████████████████░░░░ 75% ✅
Tab Boletos:         █████████████░░░░░░░ 60% ⚠️
Shared Components:   ████████░░░░░░░░░░░░ 40% ⚠️ (4/10)
Data Real (Supabase): █████░░░░░░░░░░░░░░ 30% ❌ (Tabs cargando, detalles no)
Flujos completos:    ████░░░░░░░░░░░░░░░░ 20% ❌ (Wizard sin insert, detalles mock)
──────────────────────────────────────────────
TOTAL:               ████████████░░░░░░░░ ~62% (+37% vs Ronda 1)
```
