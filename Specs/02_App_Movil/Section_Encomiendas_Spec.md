# App Móvil: Módulo de Encomiendas

## 1. Objetivo del Módulo
Permitir a los usuarios enviar y recibir encomiendas. Facilita la creación de envíos mediante un Wizard (stepper form), provee códigos QR para escaneo rápido en taquilla y permite el seguimiento en tiempo real de los estados.

## 2. Actores
- **Usuario Remitente**: Crea el envío, genera QR, lleva a taquilla, paga.
- **Usuario Destinatario**: Ve el estado del envío, recibe PIN, retira en destino.

## 3. Interfaz de Usuario

### 3.1 Layout Principal (`/encomiendas`)
**Top Tabs** con 2 vistas: **Recibir** | **Enviar**.

Botón inferior fijo (full width): **"Crear Nuevo Envío"** → Abre Wizard.

---

### 3.2 Tab "Recibir"
**Listado** de encomiendas donde el `receiver_user_id` o `receiver_telefono` coincide con el usuario. Ordenadas por `created_at DESC`.

Cada item usa `<TransactionCard type="encomienda_recepcion" />` (ver `Shared_Components_Spec.md`§8).

#### Datos visibles en la Card
| Dato | Fuente |
|---|---|
| Tracking ID | `encomiendas.tracking_id` |
| Estado (badge color) | `encomiendas.estado` |
| Remitente | Nombre (teléfono oculto parcialmente: `+58 414 *** 1234`) |
| Fecha | `encomiendas.created_at` |

#### Pantalla de Detalle de Recepción (`/encomiendas/recibir/{id}`)

**Contenido**:
1. **`<StatusTimeline />`** — Timeline vertical de estados (ver `Shared_Components_Spec.md`§6).
2. **PIN de Retiro** — Tipografía grande, siempre visible. `encomiendas.pin_retiro`. Solo se muestra si el PIN ya fue generado (estado >= `EN_RECEPCION`).
3. **Detalles Logísticos**:
   - Tracking ID
   - Estado textual
   - Origen → Destino
   - Fecha de envío
   - Peso y costo (cuando disponible)
   - Remitente: nombre y teléfono parcialmente oculto (`+58 414 *** 1234`)
4. **Fotografía del Paquete** — Imagen subida por el taquillero. Visible desde estado `PAGADA`.
5. **Sección de Pago** — Solo visible si `estado = 'POR_PAGAR'` y `modalidad_pago = 'DESTINO'`:
   - Botón: **"Pagar Encomienda"** → Abre `<PaymentFlow />` (ver `Shared_Components_Spec.md`§7).
   - Texto alternativo: "O paga en efectivo al retirar en taquilla".

---

### 3.3 Tab "Enviar"
**Listado** de encomiendas donde `sender_id` = usuario actual. Ordenadas por `created_at DESC`.

Cada item usa `<TransactionCard type="encomienda_envio" />`.

#### Pantalla de Detalle de Envío (`/encomiendas/enviar/{id}`)

**Contenido dinámico según estado**:

| Estado | Contenido Principal |
|---|---|
| `PENDIENTE_DE_ESCANEO` | `<QRCodeViewer />` grande + lista compacta de próximas salidas `<ResultsList compact={true} mode="encomiendas" />` + Botón **"Cancelar Envío"** |
| `EN_RECEPCION` | Badge "Siendo procesada en taquilla" + Botón **"Cancelar Envío"** |
| `POR_PAGAR` | Resumen de costo + `<PaymentFlow />` (si cobro origen) + Botón **"Cancelar Envío"** |
| `PAGADA` → `ENTREGADA` | `<StatusTimeline />` + Detalles logísticos + Foto del paquete |
| `CANCELADA` | Badge "Cancelada" + motivo |
| `DEVUELTA` | Badge "Devuelta a origen" + instrucciones |

**Reglas UI**:
- El QR desaparece al salir de `PENDIENTE_DE_ESCANEO`.
- La lista de próximas salidas debajo del QR permite al usuario cambiar de opción de bus/cooperativa en el último minuto.
- El botón "Cancelar Envío" desaparece desde estado `PAGADA` en adelante.
- El `<QRCodeViewer />` se renderiza con `autoMaxBrightness = true`.

---

### 3.4 Wizard "Crear Nuevo Envío" (`/encomiendas/nueva`)

Formulario de tipo **Stepper** (wizard multi-paso). Progreso visible con barra de pasos.

#### Paso 1: Destino y Cooperativa
**(Se omite visualmente si el usuario viene del módulo Inicio con datos pre-llenados)**

- `<LocationSelector label="Origen" />` — Origen del envío.
- `<LocationSelector label="Destino" />` — Destino del envío.
- Al llenar ambos, se muestra `<ResultsList mode="encomiendas" compact={true} />` filtrando cooperativas con rutas activas hacia ese destino.
- El usuario selecciona una opción de ruta/cooperativa **tentativa**.

#### Paso 2: Destinatario y Detalles del Paquete
El remitente ingresa datos del destinatario y describe el paquete en un solo paso.

**Datos del Destinatario**:
| Campo | Tipo | Obligatorio |
|---|---|---|
| Nombre Completo | TEXT | Sí |
| Cédula / RIF | TEXT | Sí |
| Teléfono (con código país) | TEXT | Sí |

**Detalles del Paquete**:
| Campo | Tipo | Obligatorio |
|---|---|---|
| Descripción del contenido | TEXT | Sí |
| Peso estimado (kg) | NUMBER | No (opcional) |
| Valor declarado ($) | NUMBER | No (opcional, para seguro) |

- Si el usuario ingresa peso, se muestra el **costo estimado** usando la fórmula de la Edge Function `calculadora-publica`.
- **Alert informativa** (visible siempre, no bloqueante): "⚠️ Límites referenciales: Peso máximo 25 kg. Dimensiones máximas 50 × 50 × 50 cm. Paquetes fuera de estos límites pueden ser rechazados en taquilla."
- **Checkbox obligatorio**: "Confirmo que el contenido coincide con mi declaración y no envío artículos prohibidos (armas, químicos, sustancias controladas, etc.)."

> **Nota**: No se incluyen campos para dimensiones (largo/ancho/alto). Las dimensiones solo son verificadas visualmente por el taquillero al recibir el paquete.

#### Paso 3: Modalidad de Pago y Resumen

| Campo | Tipo |
|---|---|
| Modalidad | Radio: **"Paga Remitente (Origen)"** o **"Paga Destinatario (Cobro en Destino)"** |

- Resumen completo del envío:
  - **Remitente**: Nombre, cédula y teléfono del usuario actual (auto-obtenidos de `profiles`, no editables).
  - **Destinatario**: Datos ingresados en Paso 2.
  - **Ruta**: Origen → Destino.
  - **Cooperativa**: Cooperativa tentativa seleccionada.
  - **Paquete**: Descripción, peso estimado (si fue ingresado) y costo estimado.
- **Disclaimer**: "El costo final será calculado en taquilla según el peso real medido por la cooperativa."
- Botón CTA: **"Generar Código QR"**

Al presionar el botón:
1. Se crea la encomienda en estado `PENDIENTE_DE_ESCANEO`.
2. Se genera el Tracking ID (`EB-YYMMDD-XXXXX`).
3. Se muestra la pantalla de Detalle de Envío con el QR.

## 4. Reglas de Negocio

- **Cancelación**: El remitente puede cancelar en estados `PENDIENTE_DE_ESCANEO`, `EN_RECEPCION` y `POR_PAGAR`.
- **Realtime**: La app se suscribe via Supabase Realtime a los cambios de estado de las encomiendas del usuario. La UI se actualiza automáticamente sin `pull-to-refresh`.
- **Privacidad**: En la tab "Recibir", los teléfonos de remitentes se muestran enmascarados (`+58 414 *** 1234`).

## 5. Vinculación con Base de Datos
- **Lee de**: `encomiendas` (donde `sender_id = user` OR `receiver_user_id = user` OR `receiver_telefono = user.telefono`), `cooperativas`, `rutas`, `viajes`.
- **Inserta**: `encomiendas` con estado `PENDIENTE_DE_ESCANEO`.
- **Actualiza**: `encomiendas.estado` a `CANCELADA` (cancelación por remitente).
- **Realtime**: Suscripción a `encomiendas` del usuario.