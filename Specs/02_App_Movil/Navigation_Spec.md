# App Móvil: Navegación

## 1. Estructura de Navegación

```
App Root
├── Auth Stack (sin sesión)
│   ├── Login Screen
│   ├── Register Screen
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
        ├── Resultados Screen (compartido: Inicio y Boletos)
        ├── Detalle Viaje + Selector Asientos (compartido)
        └── Pago Screen (compartido: Encomiendas y Boletos)
```

## 2. Bottom Tab Bar

| Posición | Label | Ícono | Badge |
|---|---|---|---|
| 1 (izquierda) | Inicio | 🏠 Casa | — |
| 2 (centro) | Encomiendas | 📦 Paquete | Número de encomiendas activas |
| 3 (derecha) | Boletos | 🎫 Ticket | Número de viajes próximos |

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
