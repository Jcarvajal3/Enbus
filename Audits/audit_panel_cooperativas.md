# 🔍 Auditoría Panel Cooperativas

> **Fecha**: 2026-05-24  
> **Alcance**: 11 Specs `03_Web_Panel_Cooperativas/` vs implementación `PanelCooperativas/`  
> **Estado**: Primera Evaluación  

---

## 📊 Scorecard General

| Spec ID | Módulo de Especificación | Estado | Observaciones Clave |
|---|---|---|---|
| **01** | Autenticación y Onboarding | ⚠️ Parcial | Login y Onboarding de usuarios funcionando. Sin embargo, Métodos de Pago está mal enrutado en el sidebar. |
| **02** | Dashboard | ✅ Completo | Implementa KPIs del día, tabla de últimas 20 encomiendas y gráficos de actividad/comisiones en paralelo. |
| **03** | Despacho | 🔴 Crítico | Código implementado en ruta incorrecta y tiene un bug de lógica que hace imposible su ejecución (espera estado `"RECIBIDO"` inexistente). |
| **04** | Entrega | ⚠️ Parcial | Valida PIN (10 intentos), maneja cobros en destino. Falta el CRON job/lógica de vencimiento (5 días). |
| **05** | Gestión de Empleados | ✅ Completo | CRUD completo, invitaciones mediante enlaces mágicos de registro vinculados a sucursal y cooperativa. |
| **06** | Integración de Hardware | ⚠️ Parcial | Lector USB y Cámara (QR/Evidencia) integrados en el flujo. **La impresora Bluetooth está conectada pero nunca se invoca en los flujos de impresión**. |
| **07** | Modo Offline (PWA) | ⚠️ Parcial | Service worker y banner de conectividad activos. **Falta aplicar el wrapper `requireOnline` para bloquear mutations físicamente offline**. |
| **08** | Recepción en Destino | ⚠️ Parcial | Lógica de escaneo y Recepción por Lote del Viaje completada. **No está integrado en el menú lateral (Sidebar)**. |
| **09** | Rutas y Horarios | ⚠️ Parcial | Gestión de rutas con validación de viajes futuros y viajes recurrentes completa. **La sub-lista de pasajeros y encomiendas en el detalle de viaje está vacía (Módulo en construcción)**. |
| **10** | Taquilla de Boletos | ✅ Completo | Flujo de venta presencial interactivo con mapa de asientos (`SeatSelector`), validaciones de pago digital/efectivo y abordaje con QR. |
| **11** | Taquilla de Encomiendas | ✅ Completo | Flujo de recepción secuencial (RecepcionModal → PagoModal → PhotoCaptureModal) con carga de evidencia a Supabase Storage. |

**Calificación General: 🟡 ~75% de conformidad funcional.**  
El esqueleto de la aplicación y los flujos complejos están excepcionalmente diseñados (shadcn/ui, queries en paralelo en Next.js, escaneo reactivo por Bluetooth/USB). Sin embargo, existen **mismatch de rutas, exclusiones del menú y bugs en la lógica de estados de base de datos** que impiden usar la aplicación en un ambiente real.

---

## 🔴 Hallazgos Críticos / Bloqueantes (Prioridad Alta)

### 🔴 C-01 — Bug Crítico en Lógica de Despacho (Estado Inexistente `"RECIBIDO"`)
* **Archivos afectados**: 
  - [page.tsx:84](file:///c:/Users/Javie/Documents/Dev/Panas%20Cargo/PanelCooperativas/src/app/cooperativas/(panel)/taquilla/encomiendas/despacho/page.tsx#L84)
  - [actions.ts:22](file:///c:/Users/Javie/Documents/Dev/Panas%20Cargo/PanelCooperativas/src/app/cooperativas/(panel)/taquilla/encomiendas/despacho/actions.ts#L22)
* **Descripción del problema**:
  En el flujo de Despacho, el código de cliente de la taquilla verifica que la encomienda escaneada tenga el estado `"RECIBIDO"` antes de agregarla:
  ```typescript
  if (encomienda.estado !== "RECIBIDO") {
    toast.error('Solo se pueden despachar encomiendas "RECIBIDO".');
    return;
  }
  ```
  Y en la Server Action `despacharEncomiendas`, se filtra la actualización por:
  ```typescript
  .eq("estado", "RECIBIDO")
  ```
  Sin embargo, en el tipo [EstadoEncomienda](file:///c:/Users/Javie/Documents/Dev/Panas%20Cargo/PanelCooperativas/src/lib/types/encomiendas.ts#L1-10) y en la definición del Enum en Supabase, **no existe el estado `"RECIBIDO"`**. Las encomiendas procesadas y pagadas quedan en estado `"PAGADA"`.
* **Impacto**: Ningún taquillero podrá realizar despachos, ya que el sistema rechazará todas las encomiendas leídas con error de estado, y la base de datos actualizará `0` registros.
* **Solución**: Reemplazar `"RECIBIDO"` por `"PAGADA"` tanto en la validación del frontend como en la Server Action de despacho.

---

### 🔴 C-02 — Desalineación Crítica de Ruta de Despacho en el Sidebar
* **Archivos afectados**: 
  - [navigation.ts:27](file:///c:/Users/Javie/Documents/Dev/Panas%20Cargo/PanelCooperativas/src/lib/navigation.ts#L27)
  - [despacho/page.tsx](file:///c:/Users/Javie/Documents/Dev/Panas%20Cargo/PanelCooperativas/src/app/cooperativas/(panel)/despacho/page.tsx)
* **Descripción del problema**:
  La barra lateral (`NAV_ITEMS`) define el acceso a Despacho en `/cooperativas/despacho`. Dicha ruta carga el archivo [despacho/page.tsx](file:///c:/Users/Javie/Documents/Dev/Panas%20Cargo/PanelCooperativas/src/app/cooperativas/(panel)/despacho/page.tsx), el cual es únicamente un esqueleto placeholder que indica *"Próximamente — Fase 2"*.
  
  Sin embargo, el panel de Despacho funcional (11KB) se encuentra implementado bajo la sub-ruta [/cooperativas/taquilla/encomiendas/despacho](file:///c:/Users/Javie/Documents/Dev/Panas%20Cargo/PanelCooperativas/src/app/cooperativas/(panel)/taquilla/encomiendas/despacho/page.tsx).
* **Impacto**: Los usuarios finales (taquilleros/admins) llegarán a una página en blanco al hacer clic en "Despacho", a pesar de que la funcionalidad de despacho ya fue programada.
* **Solución**: Mover el contenido de `src/app/cooperativas/(panel)/taquilla/encomiendas/despacho` a `src/app/cooperativas/(panel)/despacho` (y ajustar sus Server Actions), o actualizar `navigation.ts` para que apunte directamente a `/cooperativas/taquilla/encomiendas/despacho`. *Nota: El Spec indica que la URL debe ser `/cooperativas/despacho`, por lo que reubicar los archivos es la opción correcta.*

---

### 🔴 C-03 — Pantalla "Recepción en Destino" Omitida del Sidebar
* **Archivos afectados**: 
  - [navigation.ts](file:///c:/Users/Javie/Documents/Dev/Panas%20Cargo/PanelCooperativas/src/lib/navigation.ts)
* **Descripción del problema**:
  La pantalla para registrar la llegada de un lote de paquetes ([recepcion-destino/page.tsx](file:///c:/Users/Javie/Documents/Dev/Panas%20Cargo/PanelCooperativas/src/app/cooperativas/(panel)/recepcion-destino/page.tsx)) está completamente implementada, incluyendo escaneo individual, soporte WebSocket realtime y la modal para recibir lotes por viaje. Sin embargo, no se añadió ninguna entrada en `NAV_ITEMS` para esta ruta.
* **Impacto**: La funcionalidad es inaccesible a través de la interfaz de usuario, obligando a los taquilleros a escribir la URL manualmente en el navegador.
* **Solución**: Agregar la ruta `/cooperativas/recepcion-destino` en `NAV_ITEMS` dentro de [navigation.ts](file:///c:/Users/Javie/Documents/Dev/Panas%20Cargo/PanelCooperativas/src/lib/navigation.ts) con sus respectivos roles (`admin_cooperativa`, `taquillero`) e ícono (ej. `ArrowDown` o `Package`).

---

### 🔴 C-04 — Omisión de Cambio de Estado del Viaje a `"EN_CURSO"` al Despachar
* **Archivos afectados**: 
  - [actions.ts](file:///c:/Users/Javie/Documents/Dev/Panas%20Cargo/PanelCooperativas/src/app/cooperativas/(panel)/taquilla/encomiendas/despacho/actions.ts)
* **Descripción del problema**:
  El spec de Despacho indica explícitamente: *"Al despachar, el viaje asociado cambia a estado `EN_CURSO`."*
  La Server Action `despacharEncomiendas` solo actualiza las encomiendas seleccionadas a `"EN_TRANSITO"`, pero no realiza ninguna mutación sobre la tabla `viajes` para cambiar su estado a `"EN_CURSO"`.
* **Impacto**: Los viajes quedarán eternamente en estado `"PROGRAMADO"`, impidiendo que la pantalla de "Recepción en Destino" los liste correctamente en su modal de lote (que filtra viajes con `estado = 'EN_CURSO'`).
* **Solución**: Dentro de `despacharEncomiendas`, añadir un `UPDATE` a la tabla `viajes` para cambiar su estado a `"EN_CURSO"` usando el `viajeId` provisto.

---

## 🟡 Hallazgos Moderados (Prioridad Media)

### 🟡 M-01 — Métodos de Pago Duplicados y Desalineados
* **Archivos afectados**: 
  - [navigation.ts](file:///c:/Users/Javie/Documents/Dev/Panas%20Cargo/PanelCooperativas/src/lib/navigation.ts)
  - [metodos-pago/page.tsx](file:///c:/Users/Javie/Documents/Dev/Panas%20Cargo/PanelCooperativas/src/app/cooperativas/(panel)/metodos-pago/page.tsx)
* **Descripción del problema**:
  En el menú lateral se incluye "Métodos de Pago" apuntando a `/cooperativas/metodos-pago` (un esqueleto vacío). Sin embargo, el componente de gestión de métodos de pago (`MetodosPagoTab`) está totalmente implementado como una pestaña (Tab) de la ruta principal de Configuración ([configuracion/page.tsx](file:///c:/Users/Javie/Documents/Dev/Panas%20Cargo/PanelCooperativas/src/app/cooperativas/(panel)/configuracion/page.tsx)).
* **Impacto**: Experiencia de usuario confusa y enlaces rotos en el sidebar.
* **Solución**: Redirigir `/cooperativas/metodos-pago` a `/cooperativas/configuracion?tab=metodos-pago` o eliminar esta entrada del sidebar y educar al usuario de que está dentro de Configuración.

---

### 🟡 M-02 — Impresora Térmica Bluetooth no Integrada en Flujos Operativos
* **Archivos afectados**:
  - [venta-flow.tsx:450](file:///c:/Users/Javie/Documents/Dev/Panas%20Cargo/PanelCooperativas/src/components/boletos/venta-flow.tsx#L450)
  - [recepcion-modal.tsx:154](file:///c:/Users/Javie/Documents/Dev/Panas%20Cargo/PanelCooperativas/src/components/encomiendas/recepcion-modal.tsx#L154)
* **Descripción del problema**:
  La API de impresión Bluetooth mediante comandos ESC/POS y emparejamiento por Web Bluetooth está completamente desarrollada en `src/lib/printing`. Sin embargo:
  - En la confirmación de venta de boletos (`venta-flow.tsx`), el botón "Imprimir Boleto" ejecuta directamente `window.print()`.
  - En la confirmación de recepción de paquetes (`recepcion-modal.tsx`), el código no realiza ninguna llamada a imprimir la guía de envío física (el spec de encomiendas indica que la guía debe imprimirse automáticamente tras confirmar la recepción).
* **Impacto**: La integración con hardware térmico Bluetooth está inactiva en el uso cotidiano de la taquilla.
* **Solución**: Importar `printBoleto` de `src/lib/printing/print-helpers` en `VentaFlow` y ejecutarlo al confirmar venta si el navegador lo soporta y está configurado. Importar `printGuiaEncomienda` en `RecepcionModal` para disparar la impresión térmica del código de barras tras la Server Action exitosa.

---

### 🟡 M-03 — Falta de Bloqueo Client-Side ante Operaciones Offline
* **Archivos afectados**:
  - [recepcion-modal.tsx](file:///c:/Users/Javie/Documents/Dev/Panas%20Cargo/PanelCooperativas/src/components/encomiendas/recepcion-modal.tsx)
  - [entrega-modal.tsx](file:///c:/Users/Javie/Documents/Dev/Panas%20Cargo/PanelCooperativas/src/components/entrega/entrega-modal.tsx)
  - [venta-flow.tsx](file:///c:/Users/Javie/Documents/Dev/Panas%20Cargo/PanelCooperativas/src/components/boletos/venta-flow.tsx)
* **Descripción del problema**:
  El spec de contingencia offline indica que operaciones que modifiquen base de datos (vender boletos, confirmar entregas, recibir encomiendas) no deben permitirse estando sin conexión. En `connectivity-banner.tsx` se provee el wrapper `requireOnline` para este fin. No obstante, **ninguna Server Action o manejador de formulario hace uso de este helper**.
* **Impacto**: Si un taquillero presiona "Confirmar" estando sin internet, el sistema se quedará cargando indefinidamente o fallará con un error de red no controlado de Supabase, en lugar de recibir un mensaje amigable inmediato de "Esta operación requiere conexión".
* **Solución**: Envolver las funciones de envío en el frontend (`handleSubmit` / `handleConfirmar`) con el helper `requireOnline` para cancelar la acción inmediatamente si `navigator.onLine` es false.

---

### 🟡 M-04 — Sub-listas de Detalle de Viaje Incompletas
* **Archivos afectados**:
  - [viajes/client.tsx:380-387](file:///c:/Users/Javie/Documents/Dev/Panas%20Cargo/PanelCooperativas/src/app/cooperativas/(panel)/viajes/client.tsx#L380-L387)
* **Descripción del problema**:
  En la vista detallada de un Viaje Programado (modal tipo Sheet), la sección de "Boletos Vendidos" y "Encomiendas Asignadas" muestra una caja de texto gris fija que dice: *"Módulo en construcción o pendiente de carga..."*.
* **Impacto**: Incumple el spec `Rutas_y_Horarios_Spec.md §3.3` que requiere mostrar la lista de boletos vendidos y encomiendas del viaje para control operativo del taquillero.
* **Solución**: Hacer una sub-query en Supabase (o por relación) para traer los boletos (`pasajero_nombre`, `asiento`, `estado`) y encomiendas asociadas a ese `viaje_id` e imprimirlos en una tabla sencilla dentro del Sheet.

---

## 🟢 Hallazgos Menores (Prioridad Baja / Deuda Técnica)

### 🟢 N-01 — Ausencia de CRON Job para Devolución Automática de Encomiendas
* **Archivos afectados**:
  - Ninguno (Falta componente en backend/Base de Datos).
* **Descripción**:
  El spec de Entrega exige que las encomiendas que permanezcan más de 5 días hábiles en oficina de destino sean marcadas automáticamente como `DEVUELTA`. No existe código en Next.js ni script de migración SQL que cree esta tarea automática.
* **Solución**: Implementar una función de PostgreSQL y calendarizarla mediante pg_cron o un Edge Function de Supabase invocado vía cron externo (ej. GitHub Actions / Vercel Cron) para ejecutar:
  ```sql
  UPDATE encomiendas 
  SET estado = 'DEVUELTA' 
  WHERE estado = 'EN_OFICINA_DESTINO' 
    AND updated_at < NOW() - INTERVAL '5 days';
  ```

---

## 📋 Plan de Acción Priorizado

### Fase 1: Correcciones de Bloqueo Crítico (Inmediato)
1. **Corregir estados en Despacho**: Reemplazar `"RECIBIDO"` por `"PAGADA"` en [page.tsx](file:///c:/Users/Javie/Documents/Dev/Panas%20Cargo/PanelCooperativas/src/app/cooperativas/(panel)/taquilla/encomiendas/despacho/page.tsx#L84) y [actions.ts](file:///c:/Users/Javie/Documents/Dev/Panas%20Cargo/PanelCooperativas/src/app/cooperativas/(panel)/taquilla/encomiendas/despacho/actions.ts#L22).
2. **Reubicar Despacho**: Mover los archivos desde la ruta de taquilla a `src/app/cooperativas/(panel)/despacho` para cumplir con las URL especificadas y eliminar el archivo esquelético.
3. **Sidebar**: Añadir la ruta `/cooperativas/recepcion-destino` en [navigation.ts](file:///c:/Users/Javie/Documents/Dev/Panas%20Cargo/PanelCooperativas/src/lib/navigation.ts) y reajustar los enlaces hacia despacho.
4. **Estado de Viaje en Transito**: Modificar la Server Action `despacharEncomiendas` para que actualice la tabla `viajes` a `"EN_CURSO"`.

### Fase 2: Integración de Hardware y Contingencias
1. **Llamadas a Impresión**: Enlazar los métodos de `src/lib/printing/print-helpers` en los disparadores exitosos de venta de boletos (`venta-flow.tsx`) y recepción (`recepcion-modal.tsx`).
2. **Offline Guards**: Importar y aplicar el wrapper `requireOnline` en los callbacks de confirmación de formularios de taquilla y entregas.

### Fase 3: Completar Vistas Auxiliares
1. **Sub-listas de Viaje**: Implementar el fetching y renderizado de boletos y encomiendas en el panel lateral detallado de viajes programados.
2. **Alinear Menús**: Corregir el botón "Métodos de Pago" del sidebar para que redirija al Tab correspondiente en lugar de la página vacía.
