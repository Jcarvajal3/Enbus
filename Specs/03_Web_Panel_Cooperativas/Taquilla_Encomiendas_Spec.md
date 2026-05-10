# Panel Cooperativas: Taquilla de Encomiendas

## 1. Objetivo
Interfaz web (PWA / Next.js) de operaciones diarias para recibir encomiendas, pesar, asignar precios, verificar pagos y tomar fotografías de evidencia.

## 2. Actores
- **Taquillero**: Personal en sucursal que usa teclado físico y escáner de QR/códigos de barras (lector USB).
- **Admin Cooperativa**: Puede realizar las mismas operaciones que el taquillero.

## 3. Interfaz de Usuario

### 3.1 Vista Principal: Lista de Encomiendas
- URL: `/cooperativas/taquilla/encomiendas`
- **Tabla/Lista** de todas las encomiendas de la cooperativa, filtrable por estado.
- Columnas: Tracking ID, Remitente, Destinatario, Estado (badge color), Fecha, Ruta.
- Filtros rápidos (tabs o chips): Pendientes | En Recepción | Por Pagar | Pagadas | Todas.
- **Campo de búsqueda/escaneo** siempre visible en la parte superior (ver §3.2).

### 3.2 Campo de Escaneo/Búsqueda
- **Input de texto** siempre enfocado (autofocus) en la parte superior de la pantalla.
- El **escáner USB** actúa como teclado: al escanear un QR, inyecta el código en el input y presiona Enter automáticamente.
- El taquillero también puede **teclear manualmente** un Tracking ID como fallback.
- Al detectar un código:
  1. Busca la encomienda en DB por `tracking_id` o `qr_data`.
  2. Si se encuentra → Abre el **Modal de Recepción**.
  3. Si no se encuentra → Muestra error "Encomienda no encontrada".

### 3.3 Modal de Recepción (Estado: PENDIENTE_DE_ESCANEO → EN_RECEPCION)
Se abre al escanear un QR válido.

**Validaciones al abrir**:
- Verifica que la cooperativa tenga una ruta activa hacia el destino de la encomienda. Si no → Error: "Esta cooperativa no tiene ruta al destino seleccionado."
- Verifica que la encomienda esté en estado `PENDIENTE_DE_ESCANEO`. Si no → Error: "Esta encomienda ya fue procesada."

**Contenido del modal**:
| Sección | Datos |
|---|---|
| Información del envío | Tracking ID, remitente, destinatario, origen → destino, descripción del contenido, modalidad de pago |
| Formulario de pesaje | Peso (kg) * (máximo 25 kg) |
| Costo calculado | Se calcula en tiempo real al ingresar el peso (llama a Edge Function `calcular-costo-encomienda`) |
| Alert informativa | "⚠️ Dimensiones máximas referenciales: 50 × 50 × 50 cm. Verificar visualmente." |
| Botón | **"Confirmar Recepción y Calcular"** |

**Al confirmar**:
1. Estado cambia a `EN_RECEPCION` → `POR_PAGAR` (automático).
2. Se genera el PIN de retiro (trigger DB).
3. Se genera la guía/etiqueta (Edge Function `generar-guia-pdf`).
4. Se imprime la guía automáticamente via Bluetooth (ver `Hardware_Integration_Spec.md`).
5. Se envían notificaciones según la matriz (ver `Notifications_Spec.md`).

### 3.4 Panel de Pago (Estado: POR_PAGAR)
Al abrir el detalle de una encomienda `POR_PAGAR`:

| Elemento | Descripción |
|---|---|
| Resumen | Datos del envío, peso, costo |
| Datos de pago del cliente | Si el cliente confirmó pago desde la app: referencia, fecha, banco emisor |
| Botón | **"Aprobar Pago"** (para pagos digitales verificados) |
| Botón | **"Cobrado en Efectivo"** (para pagos en taquilla) |

**Al aprobar/cobrar**:
1. Estado cambia a `PAGADA`.
2. Se requiere **tomar fotografía de evidencia** (ver §3.5).

### 3.5 Captura de Fotografía de Evidencia (Estado: PAGADA)
- Tras aprobar el pago, se abre un modal con acceso a la **cámara del dispositivo** (API HTML5 `navigator.mediaDevices`).
- El taquillero toma una foto del paquete con la etiqueta/guía pegada.
- La foto se sube a Supabase Storage (bucket `fotos-encomiendas`).
- Se almacena la URL en `encomiendas.foto_evidencia_url`.
- **Obligatoria**: No se puede cerrar el modal sin tomar la foto.

### 3.6 Notificaciones al Destinatario (Automático tras PAGADA)
- El sistema envía automáticamente WhatsApp al destinatario con: enlace de seguimiento, PIN de retiro.
- Email con PIN de retiro.
- Ver matriz completa en `Notifications_Spec.md`.

## 4. Reglas de Negocio
- Un taquillero solo puede operar sobre encomiendas de **su cooperativa**.
- El campo de escaneo **nunca pierde el foco** (intercepta todas las teclas).
- Los campos numéricos (peso) solo aceptan números decimales.
- El peso máximo permitido es **25 kg**. Si se excede, el sistema muestra un error bloqueante.
- El costo se calcula usando la tarifa estandarizada (no la define la cooperativa).

## 5. Vinculación con DB
- **Lee**: `encomiendas` (filtradas por `cooperativa_id`), `tarifas`, `rutas`.
- **Actualiza**: `encomiendas` (estado, peso, costo, foto).
- **Inserta**: `pagos`.
- **Trigger indirecto**: Al actualizar `encomiendas.estado`, el trigger `log_estado_encomienda` inserta automáticamente en `encomienda_estado_historial`.
- **Realtime**: Suscripción a `encomiendas` y `pagos` de la cooperativa.
