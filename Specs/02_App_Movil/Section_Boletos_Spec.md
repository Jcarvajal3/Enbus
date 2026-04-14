# App Móvil: Módulo de Boletos

## 1. Objetivo del Módulo
Gestión completa de pasajes interurbanos: historial de boletos adquiridos, flujo de nueva compra con selector de asientos, calificación post-viaje de cooperativas.

## 2. Actores
- **Usuario Viajero**: Cliente que compra, usa y califica sus viajes.

## 3. Interfaz de Usuario

### 3.1 Vista Principal (Listado Histórico)
Pantalla con **todos** los boletos del usuario (activos, usados, expirados, cancelados). Formato: lista vertical de `<TransactionCard type="boleto" />` (ver `Shared_Components_Spec.md`§8). Ordenados por `created_at DESC`.

### 3.2 Botón Inferior Fijo
- Botón de ancho completo anclado en la zona inferior: **"Viajar"**.
- Diseño: color primario, tipografía bold, ícono de bus.

### 3.3 Detalle de Boleto (`/boletos/{codigo_boleto}`)

**Contenido según estado**:

#### Estado `RESERVADO`
| Elemento | Descripción |
|---|---|
| Badge | "Reservado — Pendiente de Pago" (amarillo) |
| Timer | Countdown de expiración de reserva (30 min) |
| Info del viaje | Ruta, fecha, hora, cooperativa, asiento |
| `<PaymentFlow />` | Flujo de pago integrado |
| Botón | "Cancelar Reserva" (sin costo) |

#### Estado `PAGADO`
| Elemento | Descripción |
|---|---|
| Badge | "Confirmado" (verde) |
| `<QRCodeViewer />` | QR de embarque. `autoMaxBrightness = true`. |
| Info completa | Ruta, fecha, hora, cooperativa, asiento, **número de unidad (bus)**, **nombre del chófer** |
| Botón | "Cancelar Boleto" (reembolso 95%) |

#### Estado `USADO`
| Elemento | Descripción |
|---|---|
| Badge | "Viaje completado" (gris) |
| Info completa | Todos los datos del viaje |
| `<StarRating />` | Si no ha calificado: modo editable `size="lg"` con campo de comentario opcional y botón "Enviar Calificación". Si ya calificó: modo `readonly` con su calificación. |

#### Estado `CANCELADO`
| Elemento | Descripción |
|---|---|
| Badge | "Cancelado" (rojo) |
| Info | Motivo de cancelación, monto de reembolso, estado del reembolso |

#### Estado `EXPIRADO`
| Elemento | Descripción |
|---|---|
| Badge | "Expirado" (gris oscuro) |
| Info | Datos del viaje |

---

## 4. Flujo de Nueva Compra

### 4.1 Inicio del Flujo
Al presionar **"Viajar"**, se abre una pantalla (o modal) con `<SearchForm />`:
```
mode: 'boletos'
showModeToggle: false    // Solo boletos, no se permite alternar
```
Campos: Origen (`<LocationSelector />`), Destino (`<LocationSelector />`), Fecha (`<DatePicker />`).

### 4.2 Resultados
Al presionar **"Buscar"**, navega a `<ResultsList mode="boletos" />` (componente compartido, ver `Shared_Components_Spec.md`§4).

Muestra todos los viajes disponibles para la ruta y fecha seleccionada. Incluye:
- Filtro por cooperativa
- Ordenamiento por hora de salida / precio
- Cada card muestra: cooperativa (con calificación ★), hora salida/llegada, duración, asientos disponibles, precio

### 4.3 Selección de Viaje y Asientos
Al seleccionar un viaje del listado, navega a la pantalla de **Detalle del Viaje** que incluye `<SeatSelector />` (ver `Shared_Components_Spec.md`§5).

- Vista superior del bus con asientos interactivos.
- El usuario selecciona su(s) asiento(s).
- Se muestra un resumen con asiento(s) seleccionado(s) y precio total.
- Botón: **"Continuar al Pago"**.

### 4.4 Pago
Al confirmar asiento(s), navega a `<PaymentFlow />` (ver `Shared_Components_Spec.md`§7).

Flujo:
1. Se crea el boleto con estado `RESERVADO` y `reserva_expira_at = now() + 15min`.
2. Se bloquean los asientos seleccionados.
3. Se muestran los métodos de pago de la cooperativa.
4. El usuario paga externamente y confirma en la app (referencia, fecha, banco emisor).
5. La cooperativa verifica → Boleto pasa a `PAGADO`.
6. Se genera el QR de embarque y se revelan datos sensibles (número de bus, nombre del chófer).

### 4.5 Post-Pago
- El boleto aparece en el listado con estado `PAGADO`.
- 24 horas antes del viaje, el usuario recibe una notificación push de recordatorio.

---

## 5. Flujo de Cancelación

### 5.1 Cancelar Reserva (estado `RESERVADO`)
- Sin costo. El asiento se libera inmediatamente.
- No requiere motivo.

### 5.2 Cancelar Boleto Pagado (estado `PAGADO`)
1. El usuario presiona "Cancelar Boleto".
2. Se muestra un modal con:
   - Texto informativo: "Se procesará un reembolso del 95% del valor del boleto (${monto_reembolso}). El reembolso será procesado por la cooperativa en 1-2 días hábiles."
   - Campo de texto obligatorio: **"Motivo de cancelación"**.
   - Botón: "Confirmar Cancelación" (rojo) + "Volver" (outline).
3. Al confirmar:
   - El boleto cambia a `CANCELADO`.
   - Se registra `motivo_cancelacion` y `monto_reembolso` (95% de `precio`).
   - El asiento se libera.
   - El usuario recibe notificación Push de confirmación.

---

## 6. Calificación Post-Viaje

### 6.1 Cuándo se solicita
- Solo cuando el boleto cambia a estado `USADO` (QR escaneado por la cooperativa).
- Se muestra en la pantalla de Detalle del Boleto.
- **No se solicita con un popup invasivo**; es una sección integrada en el detalle.

### 6.2 UI de Calificación
| Elemento | Descripción |
|---|---|
| `<StarRating size="lg" />` | 5 estrellas interactivas (1-5) |
| Campo comentario | Texto opcional, placeholder: "¿Cómo fue tu experiencia?" |
| Botón | "Enviar Calificación" (habilitado solo si se seleccionaron estrellas) |

### 6.3 Reglas
- **Una sola calificación por boleto** (UNIQUE constraint en DB).
- Una vez enviada, se muestra en modo `readonly`.
- No se puede editar ni eliminar (solo el Super Admin podría borrarla).
- La calificación actualiza automáticamente el promedio de la cooperativa (trigger en DB).

### 6.4 Impacto
Las calificaciones son visibles en:
- `<ResultsList>`: cada cooperativa muestra su promedio (★ 4.3 con total de calificaciones).
- Landing Page: información pública de cooperativas.

---

## 7. Vinculación con Base de Datos
- **Lee de**: `boletos` (donde `comprador_id = user`), `viajes`, `rutas`, `cooperativas`, `calificaciones`.
- **Inserta**: `boletos` con estado `RESERVADO`, `pagos`, `calificaciones`.
- **Actualiza**: `boletos.estado` a `CANCELADO`.
- **Realtime**: Suscripción a `boletos` del usuario para actualizar estados.
