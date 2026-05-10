# App Móvil: Navegación

## 1. Estructura de Navegación

```
App Root
├── Auth Stack (sin sesión)
│   ├── Auth Screen (Login / Register en una sola pantalla con toggle)
│   └── Forgot Password Screen
│
└── Main Stack (con sesión activa)
    ├── Bottom Tab Navigator (3 tabs)
    │   ├── Tab 1: Inicio
    │   │   └── Home Screen
    │   │       └── → Resultados Screen (push)
    │   │           └── → Detalle Viaje / Selector Asientos (push)
    │   │
    │   ├── Tab 2: Encomiendas
    │   │   └── Encomiendas Screen (Top Tabs: Recibir | Enviar)
    │   │       ├── → Detalle Recepción Screen (push)
    │   │       ├── → Detalle Envío Screen (push)
    │   │       └── → Wizard Nueva Encomienda Screen (push/modal)
    │   │
    │   └── Tab 3: Boletos
    │       └── Boletos Screen (Listado)
    │           ├── → Búsqueda Boleto Screen (push/modal)
    │           │   └── → Resultados Screen (push, componente compartido)
    │           │       └── → Detalle Viaje / Selector Asientos (push)
    │           ├── → Detalle Boleto Screen (push)
    │           └── → Calificación Screen (modal)
    │
    ├── Header Actions (siempre visibles)
    │   ├── Notificaciones (🔔 badge) → Notificaciones Screen
    │   └── Perfil (👤 ícono) → Perfil Screen
    │       ├── → Editar Perfil
    │       ├── → Configuración Notificaciones
    │       └── → Cerrar Sesión
    │
    └── Shared Screens (accesibles desde múltiples flujos)
        ├── Resultados Screen (compartido: Inicio y Boletos) ✅
        ├── Detalle Viaje + Selector Asientos (compartido) ⏳ PENDIENTE
        └── Pago Screen (compartido: Encomiendas y Boletos) ⏳ PENDIENTE
```

## 2. Bottom Tab Bar

| Posición | Label | Ícono Phosphor | Badge |
|---|---|---|---|
| 1 (izquierda) | Inicio | `<House weight="fill" />` | — |
| 2 (centro) | Encomiendas | `<Package weight="fill" />` | Número de encomiendas activas |
| 3 (derecha) | Boletos | `<Ticket weight="fill" />` | Número de viajes próximos |

## 3. Header Global

| Posición | Elemento | Comportamiento |
|---|---|---|
| Izquierda | Logo EnBus (compact) | — |
| Derecha | 🔔 Campana de notificaciones | Muestra badge con contador de no leídas. Navega a pantalla de Notificaciones. |
| Derecha | 👤 Ícono de perfil (circular con inicial) | Navega a pantalla de Perfil/Configuración. |

## 4. Reglas de Navegación

- Los **componentes compartidos** (Resultados, Selector Asientos, Pago) reciben parámetros de navegación (`mode: 'boletos' | 'encomiendas'`, `origen`, `destino`, `fecha`, etc.) para renderizar la variante correcta.
- El **Wizard de Encomiendas** se puede invocar desde el Tab de Encomiendas (flujo completo) o desde el Tab de Inicio (Paso 1 pre-llenado, ver `Section_Inicio_Spec.md`).
- La pantalla de **Resultados** es un componente reutilizable. Ver `Shared_Components_Spec.md`.
- **Deep links** deben soportarse para: detalle de encomienda (`/encomiendas/{tracking_id}`) y detalle de boleto (`/boletos/{codigo_boleto}`).

## 4.1 Estado de Implementación de Rutas

| Ruta | Pantalla | Estado |
|---|---|---|
| `/` (tabs) | Home, Encomiendas, Boletos | ✅ Implementada |
| `/encomiendas/nueva` | Wizard Nueva Encomienda | ✅ Implementada (parcial, ver §nota) |
| `/encomiendas/enviar/[id]` | Detalle de Envío | ✅ Implementada |
| `/encomiendas/recibir/[id]` | Detalle de Recepción | ✅ Implementada |
| `/resultados` | ResultsList | ✅ Implementada |
| `/viajes/[id]` | Detalle Viaje + SeatSelector | ⏳ **Pendiente** — Actualmente `ResultsList.onSelect` muestra un `alert()` placeholder. Requiere crear la pantalla con `<SeatSelector />` integrado. |
| `/pago` | PaymentFlow | ⏳ **Pendiente** — Depende de `/viajes/[id]` para boletos. |
| `/boletos/[codigo]` | Detalle Boleto | ⏳ **Pendiente** |
| `/perfil` | Pantalla de Perfil | ⏳ **Pendiente** |
| `/notificaciones` | Bandeja de Notificaciones | ⏳ **Pendiente** |

## 5. Auth Screen (Login / Register)

Login y Register se implementan en **una sola pantalla** con un toggle (dos opciones tipo `SegmentedControl` o tabs): `Iniciar Sesión` | `Registrarse`.

### 5.1 Modo: Iniciar Sesión
| Campo | Tipo | Validación |
|---|---|---|
| Email | TextInput (email) | Formato válido |
| Contraseña | TextInput (password, oculta) | Mín. 8 caracteres |

- Botón: **"Iniciar Sesión"** (primario).
- Link: **"¿Olvidaste tu contraseña?"** → navega a `Forgot Password Screen` (pantalla separada en el stack).
- Botón secundario: **"Continuar con Google"** (OAuth).

### 5.2 Modo: Registrarse
| Campo | Tipo | Validación |
|---|---|---|
| Nombre completo | TextInput | Mín. 2 caracteres |
| Email | TextInput (email) | Formato válido |
| Teléfono | TextInput (tel) | Formato +58... |
| Cédula / RIF | TextInput | Formato V-XXXXXXXX o J-XXXXXXXX |
| Contraseña | TextInput (password) | Mín. 8 caracteres |
| Confirmar contraseña | TextInput (password) | Igual a contraseña |

- Botón: **"Crear Cuenta"** (primario).

### 5.3 Comportamiento del Toggle
- Al cambiar de modo, los campos del formulario se limpian completamente.
- El estado del toggle puede recibirse como parámetro de navegación (`initialMode: 'login' | 'register'`) para pre-seleccionar el modo. Por ejemplo, el botón "Crear cuenta" del onboarding llega con `initialMode: 'register'`.
- El formulario mantiene el estado mientras el usuario está en la misma pantalla (no navega atrás).

### 5.4 Manejo de Errores
- Credenciales inválidas: toast de error con mensaje de Supabase Auth traducido al español.
- Email ya registrado: mensaje inline bajo el campo Email.
- Validaciones de campo: se muestran inmediatamente al perder el foco (`onBlur`).

