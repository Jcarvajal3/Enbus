# App Móvil: Módulo de Inicio (Home)

## 1. Objetivo del Módulo
Punto de entrada ágil de la aplicación. Permite a los usuarios buscar boletos o cotizar envíos rápidamente, y visualizar transacciones activas (encomiendas en curso y boletos próximos).

## 2. Actores
- **Cualquier Usuario Logueado**: Necesita accionar rápidamente una necesidad de viaje o mensajería.

## 3. Arquitectura de la Interfaz (UI)

### 3.1 Header
- **Izquierda**: Logo de EnBus (versión compacta).
- **Derecha**: Ícono 🔔 (notificaciones con badge) + Ícono de perfil 👤 (perfil).
- Referencia: `Navigation_Spec.md` § Header Global.

### 3.2 Widget Central: `<SearchForm />`
Componente compartido (ver `Shared_Components_Spec.md`§2) con las siguientes props:
```
mode: 'boletos' (default)
showModeToggle: true   // Muestra toggle Boletos | Encomiendas
```

**Comportamiento del toggle**:
- Al alternar a **Boletos**: Aparece el campo de Fecha. CTA dice "Buscar".
- Al alternar a **Encomiendas**: El campo de Fecha desaparece. CTA dice "Enviar".

### 3.3 Sección "Activos" (Dinámica)
Ubicada debajo del widget de búsqueda. **Solo visible si hay contenido.**

| Subsección | Visible si... | Contenido |
|---|---|---|
| **Encomiendas Activas** | Existen encomiendas del usuario en estados no terminales | Lista horizontal scrolleable de `<TransactionCard type="encomienda_envio" \| "encomienda_recepcion" />` |
| **Boletos Activos** | Existen boletos del usuario con estado `RESERVADO` o `PAGADO` y fecha futura | Lista horizontal scrolleable de `<TransactionCard type="boleto" />` |

**Reglas**:
- Si no hay ningún ítem activo, la sección desaparece por completo dando un diseño limpio.
- Se obtiene de las vistas de Supabase `v_encomiendas_activas` y `v_boletos_activos`.
- Se actualiza automáticamente via suscripción Realtime.

## 4. Flujo Lógico: Búsqueda y Resultados

### 4.1 Flujo "Buscar" (Boletos)
1. Usuario llena Origen, Destino, Fecha.
2. Presiona **"Buscar"**.
3. Navega a `<ResultsList mode="boletos" />` (componente compartido).
4. Selecciona un viaje → Navega a **Detalle Viaje** con `<SeatSelector />`.
5. Selecciona asiento(s) → Navega a `<PaymentFlow />`.
6. Completa pago → Boleto creado, aparece en Tab Boletos.

### 4.2 Flujo "Enviar" (Encomiendas)
1. Usuario llena Origen, Destino.
2. Presiona **"Enviar"**.
3. Navega a `<ResultsList mode="encomiendas" />` (componente compartido).
4. Selecciona una opción de ruta/cooperativa **tentativamente**.
5. Es redirigido al **Wizard de Encomiendas** (ver `Section_Encomiendas_Spec.md`).
6. **Relleno Inteligente**: El Paso 1 del Wizard (Origen, Destino, Cooperativa) se llena automáticamente con las selecciones previas y **se omite visualmente**, llevando al usuario directamente al Paso 2.

## 5. Vinculación con Base de Datos
- **Lee de**: `v_proximos_viajes` (para resultados), `v_encomiendas_activas`, `v_boletos_activos`.
- **Realtime**: Suscripción a `encomiendas` y `boletos` del usuario para actualizar la sección "Activos".
