# Panel Cooperativas: Modo Offline (Contingencia)

## 1. Objetivo
Definir el comportamiento del Panel Web cuando la conexión a internet falla en la taquilla. Se prioriza la **estabilidad y prevención de errores** sobre la funcionalidad amplia.

## 2. Filosofía
El modo offline es **mínimo y conservador**. No se intenta replicar funcionalidad completa offline para evitar conflictos de sincronización.

## 3. Comportamiento

### 3.1 Detección de Conectividad
- El panel monitorea la conexión a internet cada **10 segundos** (`navigator.onLine` + ping a Supabase).
- Al detectar pérdida de conexión:
  - Se muestra un **banner rojo fijo** en la parte superior: "⚠️ Sin conexión a internet. Funcionalidad limitada."
  - Se persiste en pantalla hasta que se restaure la conexión.

### 3.2 Operaciones BLOQUEADAS offline
Las siguientes operaciones **no se permiten** sin conexión (se muestra un error amigable):
- Escanear QR de encomiendas (no se puede validar ni cambiar estados)
- Verificar/aprobar pagos
- Despachar encomiendas
- Vender boletos
- Escanear QR de embarque
- Cualquier escritura a la base de datos

### 3.3 Operaciones PERMITIDAS offline
- **Consulta de datos en caché**: Los datos ya cargados en la sesión actual siguen visibles (tabla de encomiendas, lista de viajes).
- **Consulta de datos de la cooperativa**: Métodos de pago, rutas, información básica almacenada en caché local.
- **Impresión de guías previamente generadas**: Si la guía PDF ya fue descargada, se puede reimprimir.

### 3.4 Restauración de Conexión
- Al detectar que la conexión volvió, el banner cambia a verde: "✓ Conexión restaurada. Sincronizando..."
- Se refresca automáticamente la data desde Supabase.
- Se reactivan las suscripciones Realtime.

## 4. Implementación
- **Cache**: Service Worker con cache-first para assets estáticos (JS, CSS, imágenes) y network-first para datos de API.
- **StorageLocal**: Los datos de la cooperativa (nombre, métodos de pago, rutas) se cachean en `localStorage` al iniciar sesión.
- **No se usa IndexedDB** para encolamiento de operaciones (decisión deliberada para evitar conflictos de sincronización).

## 5. Comunicación al Taquillero
El taquillero debe saber claramente que está offline y que no puede operar. El banner rojo es persistente y no se puede cerrar manualmente.
