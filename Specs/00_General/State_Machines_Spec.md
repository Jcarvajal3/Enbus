# Máquinas de Estado

Este documento define las transiciones de estado válidas para todas las entidades del sistema. **Ninguna transición fuera de las aquí documentadas debe ser permitida por la base de datos.**

## 1. Encomienda

### 1.1 Estados

| Estado (enum DB) | Descripción | Quién lo activa |
|---|---|---|
| `PENDIENTE_DE_ESCANEO` | Encomienda creada en la app. QR generado. Esperando que el remitente se acerque a taquilla. | Sistema (al crear encomienda) |
| `EN_RECEPCION` | El taquillero escaneó el QR. Encomienda asociada a cooperativa/sucursal. | Taquillero (escaneo QR) |
| `POR_PAGAR` | El taquillero ingresó el peso y el sistema calculó el costo (USD de referencia). Esperando pago. Si el cliente ya reportó un pago, este queda en `pagos.estado_verificacion = 'PENDIENTE'` (no hay estado de encomienda "en verificación"). | Sistema (al calcular costo) |
| `PAGADA` | El pago fue verificado por la cooperativa. | Taquillero (aprueba o cobra en taquilla) |
| `EN_TRANSITO` | El lote de encomiendas fue despachado en un viaje. El estado del viaje no cambia al despachar. | Taquillero (despacho de lote) |
| `EN_OFICINA_DESTINO` | El bus llegó a destino y la oficina receptora escaneó las guías. | Taquillero destino (escaneo de llegada) |
| `ENTREGADA` | El destinatario (o un tercero autorizado) retiró la encomienda con su PIN y cédula verificada. Estado terminal. | Taquillero destino (`fn_entregar_encomienda`) |
| `CANCELADA` | Encomienda cancelada por el remitente, no recibida por la taquilla o cancelada por la cooperativa. Estado terminal. | Remitente (app), taquilla (`fn_rechazar_encomienda_origen`) o Sistema |
| `DEVUELTA` | Encomienda no retirada en 5 días hábiles, devuelta a origen. Estado terminal (hasta que se recoja). | Sistema (automático) |

### 1.2 Diagrama de Transiciones

```
PENDIENTE_DE_ESCANEO
    │
    ├──→ EN_RECEPCION (taquillero escanea QR)
    │       │
    │       ├──→ CANCELADA (no recibida en taquilla: fn_rechazar_encomienda_origen) ■
    │       │
    │       └──→ POR_PAGAR (sistema calcula costo)
    │               │
    │               ├──→ PAGADA (taquillero verifica pago)
    │               │       │
    │               │       └──→ EN_TRANSITO (taquillero despacha lote)
    │               │               │
    │               │               └──→ EN_OFICINA_DESTINO (taquillero destino escanea)
    │               │                       │
    │               │                       ├──→ ENTREGADA (PIN validado; con cobro en
    │               │                       │              destino exige pago aprobado) ■
    │               │                       │
    │               │                       └──→ DEVUELTA (5 días sin retirar) ■
    │               │
    │               ├──→ EN_TRANSITO (solo modalidad_pago = DESTINO: se cobra al retirar)
    │               │
    │               └──→ CANCELADA (no recibida o a pedido del remitente, sin pagos) ■
    │
    └──→ CANCELADA (remitente cancela antes de ir a taquilla, o la taquilla no la recibe) ■

■ = Estado terminal
```

Además, `EN_RECEPCION ──→ CANCELADA` cuando la taquilla **no recibe** la encomienda (sin ruta al destino, contenido prohibido, mal embalada…; `fn_rechazar_encomienda_origen`, fase 3).

### 1.3 Transiciones Válidas (para constraint en DB)

| Desde | Hacia | Condiciones |
|---|---|---|
| `PENDIENTE_DE_ESCANEO` | `EN_RECEPCION` | Cooperativa tiene ruta activa al destino |
| `PENDIENTE_DE_ESCANEO` | `CANCELADA` | Remitente cancela desde app, o la taquilla no la recibe (`fn_rechazar_encomienda_origen`) |
| `EN_RECEPCION` | `POR_PAGAR` | Peso ingresado y costo calculado |
| `EN_RECEPCION` | `CANCELADA` | **No recibida** en taquilla (`fn_rechazar_encomienda_origen`, motivo ≥ 5; `motivo_cancelacion = 'No recibida en taquilla: …'`; aviso `ENCOMIENDA_RECHAZADA` al remitente). Desde la fase 3 |
| `POR_PAGAR` | `PAGADA` | Pago aprobado (`fn_aprobar_pago`) o cobrado en taquilla (`fn_cobrar_encomienda_taquilla`) |
| `POR_PAGAR` | `EN_TRANSITO` | **Solo con `modalidad_pago = 'DESTINO'`**. Con `ORIGEN` la DB responde `EB_COBRO_PENDIENTE` |
| `POR_PAGAR` | `CANCELADA` | La cooperativa cancela a pedido del remitente (arrepentimiento por precio) o no la recibe (`fn_rechazar_encomienda_origen`). Solo sin pagos `PENDIENTE` ni `APROBADO` (`EB_PAGO_YA_REGISTRADO`) |
| `PAGADA` | `EN_TRANSITO` | Taquillero despacha el lote (`fn_despachar_encomiendas`, todo o nada) |
| `EN_TRANSITO` | `EN_OFICINA_DESTINO` | Taquillero destino escanea guía |
| `EN_OFICINA_DESTINO` | `ENTREGADA` | `fn_entregar_encomienda` (ver §1.5): PIN correcto y cédula verificada, o entrega sin PIN autorizada por el administrador de la cooperativa. Con `modalidad_pago = 'DESTINO'` exige un pago aprobado (`EB_COBRO_PENDIENTE`) |
| `EN_OFICINA_DESTINO` | `DEVUELTA` | 5 días hábiles sin retiro (automático) |

Implementado en el trigger `validar_transicion_encomienda` (`validar_transicion_encomienda_fn`, migraciones `20260719000004` y `20260720000002`, que añade `EN_RECEPCION → CANCELADA`).

### 1.4 Reglas Adicionales
- La cancelación desde la app **solo** es posible en `PENDIENTE_DE_ESCANEO` (el cliente no puede cambiar ningún otro estado: trigger `aa_proteger_encomiendas_cliente`). En `EN_RECEPCION` y `POR_PAGAR` cancela la cooperativa.
- **Alta presencial** (cliente sin la app): `fn_registrar_encomienda_taquilla` crea, recibe y pesa en una sola operación (`PENDIENTE_DE_ESCANEO → EN_RECEPCION → POR_PAGAR`), con `origen_registro = 'TAQUILLA'`, `sender_id` = empleado y el remitente real en `remitente_nombre`, `remitente_cedula`, `remitente_telefono`. Idempotente por `idempotency_key`.
- **Cobro vs. logística**: el estado de la encomienda describe dónde está el paquete; el estado del cobro vive en `pagos.estado_verificacion` (`PENDIENTE`, `APROBADO`, `RECHAZADO`). Con cobro en destino la encomienda viaja `EN_TRANSITO` / `EN_OFICINA_DESTINO` con el cobro pendiente hasta el retiro.
- El costo (`costo_calculado`, USD de referencia) lo calcula el servidor al recibir y pesar; se cobra en Bs a la tasa BCV del día (ver `Payments_Spec.md` §4).
- `updated_at` no se mueve por cambios automáticos (vínculo del destinatario, sucursales) ni, desde la fase 3, por `intentos_pin`, `pin_bloqueado`, la validación del PIN (`pin_validado_at`/`pin_validado_por`, fase 4) o las fotos (`foto_evidencia_url`, `foto_cliente_path`, `foto_omitida_motivo`), porque la devolución automática y los "días en oficina" cuentan desde `updated_at`.
- La devolución automática (`auto_devolver_encomienda`) solo avisa al remitente si la encomienda se creó en la app (`origen_registro = 'APP'`).
- El estado `DEVUELTA` genera una nueva encomienda de retorno con costo pendiente para el remitente.
- Cualquier encomienda que permanezca más de 72 horas en `EN_TRANSITO` genera una **Alerta Amarilla** en el Panel del Super Admin (ver `04_Web_Super_Admin/Incidencias_Spec.md`).

### 1.5 Entrega (`EN_OFICINA_DESTINO → ENTREGADA`)
La entrega se valida en el servidor (fase 3); el panel no actualiza la encomienda directamente. Desde la fase 4 la API **no puede** pasar una encomienda a `ENTREGADA`/`DEVUELTA` ni escribir el PIN, sus intentos, su validación o los datos de retiro con un UPDATE directo (trigger `aa_proteger_entrega_encomienda`, `EB_OPERACION_NO_PERMITIDA`).

1. **Cobro**: con `modalidad_pago = 'DESTINO'`, primero se registra el cobro (si falta, `EB_COBRO_PENDIENTE`).
2. **PIN**: `fn_validar_pin_retiro(p_encomienda_id, p_pin)` devuelve `{valido, bloqueado, intentos_restantes}` sin lanzar error, para que el intento fallido quede guardado (`intentos_pin`). Al décimo intento fallido el PIN queda bloqueado (`pin_bloqueado = true`). **Fase 4**: si el PIN es correcto deja una **validación de 15 minutos** para el empleado que la hizo (`pin_validado_at`, `pin_validado_por`); un intento fallido la borra.
3. **Identidad y entrega**: `fn_entregar_encomienda(p_encomienda_id, p_pin, p_cedula_verificada, p_retira_tercero, p_retiro_nombre, p_retiro_cedula, p_sin_pin_motivo)`:
   - **Con PIN**: si está bloqueado, `EB_PIN_BLOQUEADO`. Luego exige la validación vigente **del mismo empleado** (`EB_PIN_NO_VALIDADO`, `{campo:'pin'}`: "Valida el PIN de retiro antes de entregar. La validación dura 15 minutos."); se comprueba **antes** que el PIN, para que esta RPC no sirva para probar PIN. Después vuelve a comparar el PIN (`EB_PIN_INCORRECTO`). Al entregar, la validación se consume.
   - **Cédula**: `p_cedula_verificada` es obligatorio (`EB_CEDULA_NO_VERIFICADA`): el taquillero confirma que revisó la cédula de quien retira.
   - **Tercero autorizado**: con `p_retira_tercero = true` exige nombre (≥ 3) y cédula válida de quien retira (`EB_DATOS_INVALIDOS`, campo `tercero`).
   - **Sin PIN**: solo el `admin_cooperativa` (`EB_SIN_PERMISO` para el taquillero) y con motivo de al menos 10 caracteres (`EB_MOTIVO_REQUERIDO`); se guarda en `entrega_sin_pin_motivo`.
   - Guarda `entregada_at`, `entregada_por`, `retiro_tercero`, `retiro_nombre`, `retiro_cedula`. Idempotente (`ya_procesado`).
4. **PIN bloqueado**: `fn_desbloquear_pin(p_encomienda_id, p_motivo)` lo desbloquea (vuelve `intentos_pin` a 0 y, desde la fase 4, borra cualquier validación); solo el `admin_cooperativa` de esa cooperativa o el `super_admin`, con motivo (≥ 5). El taquillero no puede desbloquear ni entregar sin PIN.

---

## 2. Boleto

### 2.1 Estados

| Estado (enum DB) | Descripción | Quién lo activa |
|---|---|---|
| `RESERVADO` | El usuario apartó el asiento (al confirmar asientos, antes de pagar). Asiento bloqueado. Ver subestados en 2.2. | Sistema (`fn_reservar_asientos`) |
| `PAGADO` | El pago fue verificado por la cooperativa. Boleto confirmado. | Taquillero o Sistema |
| `USADO` | El pasajero abordó el bus. QR de embarque escaneado. | Taquillero (escaneo QR embarque) |
| `CANCELADO` | El usuario canceló el boleto, o la cooperativa canceló el viaje. Estado terminal. | Usuario (app, `fn_cancelar_boleto`) o administrador de la cooperativa (`fn_cancelar_viaje`) |
| `EXPIRADO` | La reserva venció sin pago, o la fecha del viaje pasó sin que el pasajero abordara. Estado terminal. | Sistema (solo el servidor: cron `auto_expirar_reserva` o salida del bus) |

### 2.2 Subestados de `RESERVADO` (sin valores nuevos en el enum)

La app y el panel muestran el estado con `estado_ui_boleto(boleto.estado, pago.estado_verificacion)`:

| Subestado | Condición | Vence |
|---|---|---|
| `RESERVA_SIN_PAGAR` | `RESERVADO` sin pago (o pagará en taquilla) | Sí: 30 min (`reserva_expira_at`), nunca después de la salida |
| `PAGO_EN_VERIFICACION` | `RESERVADO` con pago `PENDIENTE` | **No** (`reserva_expira_at = NULL`) mientras la cooperativa decide |
| `PAGO_RECHAZADO` | `RESERVADO` con el último pago `RECHAZADO`. Solo en reservas rechazadas antes de que el rechazo liberara los asientos | Sí: la reserva vence con los 30 min que recibió entonces |

Para los demás estados `estado_ui` es el mismo valor del enum.

### 2.3 Diagrama de Transiciones

```
RESERVADO
    │
    ├──→ PAGADO (cooperativa verifica pago)
    │       │
    │       ├──→ USADO (QR escaneado al abordar) ■
    │       │
    │       ├──→ CANCELADO (usuario cancela: reembolso 95%;
    │       │               la cooperativa cancela el viaje: reembolso 100%) ■
    │       │
    │       └──→ EXPIRADO (fecha del viaje pasó) ■
    │
    ├──→ CANCELADO (usuario cancela antes de pagar, la cooperativa rechaza el pago o cancela el viaje; sin costo) ■
    │
    └──→ EXPIRADO (reserva no pagada, tiempo agotado) ■

■ = Estado terminal
```

### 2.4 Transiciones Válidas

| Desde | Hacia | Condiciones |
|---|---|---|
| `RESERVADO` | `PAGADO` | Cooperativa aprueba el pago (`fn_aprobar_pago`) o lo cobra en taquilla (`fn_cobrar_reserva_taquilla`) |
| `RESERVADO` | `CANCELADO` | Usuario cancela (sin costo, asiento se libera). No se permite con un pago en verificación (`EB_PAGO_EN_VERIFICACION`). También al cancelar el viaje (`fn_cancelar_viaje`), que exige no tener pagos en verificación (`EB_PAGOS_PENDIENTES`), y cuando la cooperativa rechaza el pago (`fn_rechazar_pago`, el asiento se libera) |
| `RESERVADO` | `EXPIRADO` | Reserva sin pago pendiente vencida (30 minutos), o el viaje salió / fue cancelado sin pago pendiente |
| `PAGADO` | `USADO` | QR de embarque validado y confirmado por el personal (`fn_validar_embarque` + `fn_confirmar_embarque`) |
| `PAGADO` | `CANCELADO` | Usuario cancela antes de la salida (reembolso del 95%, procesado por cooperativa en 1-2 días hábiles), o la cooperativa cancela el viaje (`fn_cancelar_viaje`, reembolso del **100 %**) |
| `PAGADO` | `EXPIRADO` | Fecha/hora del viaje pasó sin abordar |

Venta en taquilla: `fn_vender_boletos_taquilla` crea los boletos directamente en `PAGADO` (pago aprobado, código `BOL-XXXXXXXX` y QR `PASS-<codigo>` generados en el servidor).

### 2.5 Reglas Adicionales
- Al cancelar un boleto `PAGADO`, el usuario debe escribir un **motivo de cancelación** (campo de texto obligatorio).
- El reembolso del **95%** (USD de referencia, pagado en Bs a la tasa BCV del día) es procesado por la cooperativa mediante los mismos canales de pago.
- Al cancelar, el asiento se libera automáticamente.
- La reserva sin pago tiene un **tiempo límite de 30 minutos**; con un pago en verificación **no vence**. Un rechazo cancela la reserva y libera los asientos.
- **Solo el servidor** escribe `EXPIRADO`; la app nunca lo hace. El cliente solo puede cancelar (trigger `aa_proteger_boletos_cliente`).
- Un asiento solo puede estar ocupado (`RESERVADO`, `PAGADO` o `USADO`) por un boleto por viaje (índice único `uq_boletos_asiento_ocupado`). Los asientos se guardan como número (`"1"`..`"N"`).
- Al marcar la salida del bus (`fn_marcar_salida_viaje`, `PROGRAMADO → EN_CURSO`) se liberan las reservas sin pago pendiente.
- **Viaje cancelado por la cooperativa** (`fn_cancelar_viaje`, solo viajes `PROGRAMADO`, solo `admin_cooperativa`, motivo ≥ 5): viaje `CANCELADO`; boletos `PAGADO → CANCELADO` con `monto_reembolso = precio` (100 %); reservas `RESERVADO → CANCELADO`; un aviso por comprador con el motivo. Ver `Payments_Spec.md` §9.
- **Reembolso** (no es un estado del enum): un boleto `CANCELADO` con `monto_reembolso > 0` está "por devolver" hasta que la cooperativa registra la devolución (`fn_registrar_reembolso` → `reembolso_procesado = true`).
- Desde la fase 3, `fn_checkout_boletos` exige nombre y cédula válidos en cada asiento (`EB_DATOS_PASAJERO`); se asignan con `fn_asignar_pasajeros` antes del pago.

---

## 3. Cooperativa

### 3.1 Estados

| Estado (enum DB) | Descripción |
|---|---|
| `PENDIENTE` | Solicitud en revisión: la cooperativa ya tiene cuenta y configura su panel, pero no vende en la app |
| `RECHAZADA` | Solicitud rechazada **con motivo**. Reversible: la cooperativa corrige sus datos y pide una nueva revisión (fase 3, migración `20260720000001`) |
| `ACTIVA` | Cooperativa operativa en la plataforma |
| `SUSPENDIDA` | Cooperativa suspendida temporalmente (ej: deuda de comisiones) |
| `DESACTIVADA` | Cooperativa retirada permanentemente. Estado terminal |

### 3.2 Transiciones Válidas

Los cambios del Super Admin pasan por `fn_cambiar_estado_cooperativa(p_cooperativa_id, p_estado, p_motivo)`; una transición fuera de la tabla devuelve `EB_ESTADO_CAMBIO`. El motivo (≥ 5 caracteres) es **obligatorio** para `RECHAZADA`, `SUSPENDIDA` y `DESACTIVADA` (`EB_MOTIVO_REQUERIDO`) y se guarda en `motivo_estado` (se limpia al pasar a `ACTIVA` o `PENDIENTE`). Cada cambio guarda `estado_cambiado_at` y `estado_cambiado_por`. Pedir el estado que ya tiene devuelve `ya_procesado`.

```
PENDIENTE ──→ ACTIVA ⇄ SUSPENDIDA
  │   ▲          │         │
  ▼   │          ▼         ▼
RECHAZADA ──→ DESACTIVADA ■ ←── (también desde PENDIENTE)
```

| Desde | Hacia | Quién |
|---|---|---|
| `PENDIENTE` | `ACTIVA` | Super Admin (aprueba la solicitud) |
| `PENDIENTE` | `RECHAZADA` | Super Admin, con motivo (la cooperativa lo ve en su panel y por correo) |
| `PENDIENTE` | `DESACTIVADA` | Super Admin ("Descartar solicitud"), con motivo |
| `RECHAZADA` | `PENDIENTE` | Admin de la cooperativa (`fn_solicitar_revision_cooperativa(p_mensaje)`, que actualiza `mensaje_registro`) o Super Admin ("Reabrir solicitud") |
| `RECHAZADA` | `DESACTIVADA` | Super Admin, con motivo |
| `ACTIVA` | `SUSPENDIDA` | Super Admin, con motivo |
| `SUSPENDIDA` | `ACTIVA` | Super Admin (tras pago de deuda) |
| `ACTIVA` | `DESACTIVADA` | Super Admin, con motivo |
| `SUSPENDIDA` | `DESACTIVADA` | Super Admin, con motivo |

Protección (trigger `aa_proteger_cooperativa`, función `proteger_cooperativa_fn`): fuera de las RPC, quien no sea Super Admin no puede cambiar `estado`, `comision_porcentaje`, `motivo_estado`, `estado_cambiado_at`, `estado_cambiado_por`, `calificacion_promedio` ni `total_calificaciones` (`EB_SIN_PERMISO`); `nombre` y `rif` solo se corrigen mientras la cooperativa está `PENDIENTE` o `RECHAZADA`.

### 3.3 Impacto en Operaciones
- Una cooperativa `PENDIENTE`, `RECHAZADA`, `SUSPENDIDA` o `DESACTIVADA` **no aparece** en los resultados de búsqueda de la app.
- El panel muestra un aviso persistente con el estado y el motivo (`fn_checklist_cooperativa` devuelve `estado`, `motivo_estado`, `estado_cambiado_at` y los conteos de la puesta en marcha).
- Las encomiendas en curso de una cooperativa suspendida **deben completar su ciclo** (no se cancelan automáticamente).
- No se pueden crear nuevas encomiendas ni vender boletos para cooperativas suspendidas/desactivadas.

---

## 4. Viaje (fase 4)

| Estado (enum DB) | Descripción | Quién lo activa |
|---|---|---|
| `PROGRAMADO` | Salida publicada; se venden boletos y se despachan encomiendas. | Admin de la cooperativa (crea el viaje) |
| `EN_CURSO` | El bus salió (se liberan las reservas sin pago pendiente). | Personal de la cooperativa (`fn_marcar_salida_viaje`) |
| `COMPLETADO` | El bus llegó. Estado terminal. | Personal de la cooperativa (`fn_completar_viaje`, "Marcar llegada") |
| `CANCELADO` | La cooperativa canceló la salida (reembolso del 100 %). Estado terminal. | Admin de la cooperativa (`fn_cancelar_viaje`) |

```
PROGRAMADO ──→ EN_CURSO ──→ COMPLETADO ■
     │
     └──→ CANCELADO ■
```

- `fn_completar_viaje(p_viaje_id)`: solo desde `EN_CURSO` (en `PROGRAMADO`: `EB_ESTADO_CAMBIO`, "Marca primero la salida del bus…"); devuelve `{estado: 'COMPLETADO', no_embarcados}`; repetido → `ya_procesado`.
- **Editar** (`fn_editar_viaje`, solo `admin_cooperativa` y solo `PROGRAMADO`): unidad, chofer, hora de salida (> ahora; la llegada estimada se recalcula con la duración de la ruta) y asientos (1–80, nunca menos que el mayor asiento ocupado: `EB_DATOS_INVALIDOS` con `minimo`). Si cambia la hora y hay boletos `RESERVADO`/`PAGADO`, el motivo (≥ 5) es obligatorio (`EB_MOTIVO_REQUERIDO`) y cada comprador recibe un aviso `VIAJE_REPROGRAMADO` ("Si la nueva hora no te sirve, escríbele a la cooperativa."). No hay reembolso automático por el cambio de hora.

## 5. Tarifa de encomiendas (fase 4)

Sin enum; se deduce de las columnas de `tarifas`:

| Estado | Condición |
|---|---|
| Vigente | `activa = true` (una sola) |
| Programada | `activa = false`, `publicada_at` no nulo, `reemplazada_at` nulo, `vigente_desde` futura |
| Histórica | `reemplazada_at` no nulo |

```
fn_publicar_tarifa (fecha ≤ ahora + 1 min) ──→ Vigente ──→ Histórica ■ (al publicarse o activarse otra)
fn_publicar_tarifa (fecha futura) ──→ Programada ──→ Vigente (cron activar_tarifas_programadas, cada 5 min)
                                          └──→ Histórica ■ (fn_cancelar_tarifa_programada o una programación nueva)
```

Solo el Super Admin publica o cancela (`EB_SIN_PERMISO`). Cancelar una tarifa que ya no está programada → `EB_ESTADO_CAMBIO`.

## 6. Cuenta de pasajero: baja (fase 4)

```
Activa ──fn_eliminar_mi_cuenta──→ Baja solicitada (profiles.eliminada_at, perfil anonimizado)
                                       │
                                       └──eliminar-cuenta (edge) o Super Admin──→ Baja completa ■
                                                                                 (bajas_cuenta.auth_eliminada_at)
```

- Solo el rol `user` (`EB_SIN_PERMISO` para el personal: lo da de baja su cooperativa).
- Bloquean la baja (`EB_CUENTA_CON_ACTIVIDAD`, con el detalle `{boletos, pagos, encomiendas_enviadas, encomiendas_por_recibir, reembolsos}`): boletos `RESERVADO`/`PAGADO` de viajes `PROGRAMADO`/`EN_CURSO`, pagos en verificación, encomiendas enviadas o por recibir que no estén `ENTREGADA`/`CANCELADA`/`DEVUELTA` y reembolsos pendientes.
- Al aceptarla: nombre "Cuenta eliminada", `telefono`/`cedula_rif` = `PENDIENTE-BAJA-<id>` (quedan libres para otra cuenta), sin token push ni preferencias, se borran sus notificaciones y los avisos pendientes, y se registra en `bajas_cuenta`. Los boletos y encomiendas históricos se conservan. Repetir → `ya_procesado`. El usuario no puede deshacerla con un UPDATE (`aa_proteger_perfil`).
