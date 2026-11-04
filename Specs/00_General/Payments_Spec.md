# Sistema de Pagos

## 1. Principio Fundamental
EnBus **no integra procesadores de pago** (Stripe, PayPal, etc.). Todos los pagos se realizan **por fuera de la app**, directamente entre el cliente y la cooperativa. La app solo:
1. Muestra los datos bancarios de la cooperativa.
2. Recibe la confirmación del pago por parte del cliente.
3. Permite al personal de la cooperativa verificar y aprobar el pago manualmente.

## 2. Métodos de Pago por Cooperativa
Cada cooperativa registra sus propios métodos de pago desde su Panel Administrativo. Los métodos de pago son almacenados en la tabla `metodos_pago_cooperativa` de la DB.

### 2.1 Estructura de un Método de Pago

| Campo | Tipo | Descripción |
|---|---|---|
| `id` | UUID | Identificador único |
| `cooperativa_id` | UUID FK | Cooperativa dueña del método |
| `tipo` | ENUM | `TRANSFERENCIA_BANCARIA`, `PAGO_MOVIL`, `ZELLE`, `EFECTIVO` |
| `banco` | TEXT | Nombre del banco (ej: "Banesco") |
| `titular` | TEXT | Nombre del titular de la cuenta |
| `numero_cuenta` | TEXT | Número de cuenta o teléfono (Pago Móvil) |
| `cedula_rif` | TEXT | Cédula o RIF del titular |
| `email_zelle` | TEXT | Email para Zelle (si aplica) |
| `instrucciones` | TEXT | Instrucciones adicionales (opcional) |
| `activo` | BOOLEAN | Si se muestra al público |

### 2.2 Quién los administra
- La **cooperativa misma** (rol `admin_cooperativa`) registra, edita y desactiva sus métodos de pago desde su Panel.
- El Super Admin puede verlos pero no editarlos.

## 3. Flujo de Pago Unificado (Encomiendas y Boletos)
El flujo de pago es **idéntico** para encomiendas y boletos:

```
┌─────────────────────────────────────────────────────────────┐
│  1. App muestra datos bancarios de la cooperativa           │
│     (todos los métodos de pago activos)                     │
│                                                             │
│  2. El cliente realiza el pago por fuera de la app          │
│     (transferencia, Pago Móvil, Zelle, efectivo)            │
│                                                             │
│  3. El cliente regresa a la app y confirma el pago:         │
│     ┌─────────────────────────────────────────────┐         │
│     │  • Número de referencia de la transacción   │         │
│     │  • Fecha de la transacción                  │         │
│     │  • Banco emisor (selección de lista)         │         │
│     └─────────────────────────────────────────────┘         │
│                                                             │
│  4. La información se envía al Panel de la Cooperativa      │
│                                                             │
│  5. El taquillero / admin cooperativa VERIFICA manualmente  │
│     el pago y presiona "Aprobar Pago"                       │
│                                                             │
│  6. El estado cambia: POR_PAGAR → PAGADA (encomienda)       │
│                       RESERVADO → PAGADO (boleto)           │
└─────────────────────────────────────────────────────────────┘
```

Desde la fase 2 cada paso es una **RPC de base de datos** (`SECURITY DEFINER`): el cliente nunca escribe `pagos` ni cambia estados directamente. El monto, la tasa y los estados se calculan en el servidor.

| Paso | RPC | Efecto |
|---|---|---|
| Apartar asientos (app) | `fn_reservar_asientos` | Crea o renueva boletos `RESERVADO` por 30 min (sin pago). También es "Apartar y pagar en taquilla". |
| Soltar asientos (app) | `fn_liberar_reserva` | Cancela las reservas sin pago al salir del asistente. |
| Reportar pago de boletos (app) | `fn_checkout_boletos` | En una transacción: re-asegura asientos, calcula total USD y Bs, inserta **un** pago `PENDIENTE` y lo vincula a todos los boletos de la compra (`boletos.compra_id`, `boletos.pago_id`). Con pago pendiente la reserva **no vence**. Idempotente por `idempotency_key`. |
| Reportar pago de encomienda (app) | `fn_registrar_pago_encomienda` | Remitente (origen) o remitente/destinatario (destino). Un solo pago pendiente por encomienda. |
| Aprobar (panel) | `fn_aprobar_pago` | Boletos `RESERVADO → PAGADO` (con QR) o encomienda `POR_PAGAR → PAGADA`. Si los boletos ya vencieron o se cancelaron no aprueba (`EB_BOLETOS_NO_ACTIVABLES`). Notifica al cliente. |
| Rechazar (panel) | `fn_rechazar_pago` | Motivo obligatorio (≥ 5 caracteres) que se envía al cliente. Los boletos `RESERVADO` de ese pago pasan a `CANCELADO` y sus asientos **quedan libres al momento**; para viajar, el cliente vuelve a elegirlos. La encomienda sigue por pagar y se puede volver a reportar. |
| Bandeja "Pagos por verificar" | `fn_pagos_por_verificar` | Esperado vs declarado, método, cuenta destino, banco, referencia, aviso de referencia repetida y capture del pago. |

Los errores llegan como `message = 'EB_<CODIGO>'` y `hint` con el texto para el usuario (ver `Audits/fase2_spec.md` §3.1).

### 3.1 Caso especial: Pago en Efectivo
- Si el cliente paga en efectivo directamente en la taquilla, **no necesita confirmar en la app**.
- El taquillero registra el cobro en su Panel (`fn_vender_boletos_taquilla`, `fn_cobrar_reserva_taquilla`, `fn_cobrar_encomienda_taquilla`): el pago queda **aprobado** de inmediato.
- El efectivo puede recibirse en **Bs o en USD**; el panel calcula el vuelto en la misma moneda.
- La app **no** crea pagos en efectivo: "Pagar en taquilla" solo aparta el asiento. Los pagos `EFECTIVO` sin verificar creados por versiones anteriores de la app se anularon en la migración de la fase 2.

### 3.2 Caso especial: Cobro en Destino (Encomiendas)
- Con `modalidad_pago = 'DESTINO'` la encomienda puede despacharse en `POR_PAGAR` (`POR_PAGAR → EN_TRANSITO`).
- El destinatario recibe notificación con el monto a pagar.
- **Opción A**: Paga desde la app (mismo flujo: ve datos bancarios, paga externamente, confirma en app). El taquillero de destino verifica.
- **Opción B**: Paga al retirar (efectivo Bs/USD, Pago Móvil, transferencia o Zelle). El taquillero de destino registra el cobro.
- La base de datos **impide marcar `ENTREGADA`** una encomienda con cobro en destino sin un pago aprobado (`EB_COBRO_PENDIENTE`).

## 4. Moneda: USD de referencia, cobro en Bs a la tasa BCV

### 4.1 Regla
- Todos los precios se definen y guardan en **USD de referencia**: `rutas.precio_pasaje`, `boletos.precio`, `boletos.monto_reembolso`, `tarifas.*`, `encomiendas.costo_calculado` / `valor_declarado`, `comisiones_ciclo.*` y `pagos.monto`.
- El cliente **paga en bolívares** a la **tasa oficial BCV del día** (Pago Móvil, transferencia, efectivo Bs). Zelle y el efectivo en divisas se pagan en USD.
- `pagos.monto` (USD esperado) es la base de comisiones y balances; no se convierte ningún dato histórico.

### 4.2 Fuente de la tasa
- Tabla `tasas_bcv` (una fila por día de vigencia, Bs por 1 USD). Lectura pública.
- La edge function `actualizar-tasa-bcv` la actualiza cada 30 min desde dolarapi (misma fuente que la app) mediante `fn_guardar_tasa_bcv` (solo `service_role`). Rechaza saltos de más de 25 % respecto del día anterior (`EB_TASA_SOSPECHOSA`).
- El Super Admin puede cargarla a mano con `fn_registrar_tasa_bcv_manual` (fecha, tasa, motivo). La carga manual **no la pisa** el cron.
- App, panel, landing y RPC leen la misma tasa: `fn_tasa_bcv_vigente()` (la última con fecha ≤ hoy en Caracas).
- Para **cobrar** se exige una tasa de 4 días o menos; si no hay, el cobro se bloquea con `EB_TASA_NO_DISPONIBLE`.
- Si la tasa cambia mientras el cliente paga, el servidor responde `EB_TASA_CAMBIO` con el total nuevo; la app lo muestra y reintenta. El servidor nunca acepta una tasa elegida por el cliente.

### 4.3 Presentación
- Principal en Bs, secundario en USD con la fecha de la tasa: **"Bs 1.250,00"** / **"≈ USD 12,40 · BCV 02/10"**. Si se paga en USD, al revés.
- Mismo formateador (`dinero.ts`) en app, panel y landing. En tickets impresos no se usan "≈" ni "$": "Total: Bs 1.250,00" / "Ref.: USD 12,40 BCV 02/10".

## 5. Datos de un Pago (`pagos`)

Lo que el cliente envía desde la app:

| Campo | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| `numero_referencia` | TEXT | Sí | Referencia bancaria (solo números, mínimo 4) o código de confirmación Zelle |
| `fecha_transaccion` | DATE | Sí | Fecha del pago: entre hoy y los últimos 30 días |
| `banco_emisor` | TEXT | Sí (salvo Zelle) | Banco desde el cual se realizó el pago |
| `metodo_pago_id` | UUID FK | Sí | Método de pago de la cooperativa que se utilizó (no `EFECTIVO`) |
| `monto_declarado` | DECIMAL | No | Lo que el cliente dice que pagó, en `moneda` (por defecto, el esperado) |
| `comprobante_path` | TEXT | Sí en Pago Móvil | Capture del pago: ruta en el bucket privado `comprobantes-pago` (`<usuario>/<archivo>`; JPG, PNG o WEBP de hasta 5 MB). Sin él, `EB_COMPROBANTE_REQUERIDO`. Los demás métodos no lo usan |
| `idempotency_key` | TEXT | Sí | Clave única de la operación (evita pagos duplicados por doble toque) |

Lo que calcula el servidor:

| Campo | Descripción |
|---|---|
| `monto` | USD de referencia esperado (base de comisiones) |
| `monto_bs` | Bs esperados = `monto × tasa_bcv` |
| `tasa_bcv`, `tasa_bcv_fecha` | Tasa usada y su día de vigencia |
| `moneda` | `VES` o `USD` (Zelle / efectivo en divisas) |
| `tipo_pago` | `DIGITAL` o `EFECTIVO` |
| `verificado`, `verificado_por`, `verificado_at` | Aprobación |
| `rechazado_at`, `rechazado_por`, `motivo_rechazo` | Rechazo |
| `estado_verificacion` | Columna generada: `APROBADO`, `RECHAZADO` o `PENDIENTE` |

Reglas:
- Una referencia no puede repetirse en otro pago digital no rechazado de la misma cooperativa (`EB_REFERENCIA_REPETIDA`).
- Por encomienda hay como máximo **un** pago pendiente y **un** pago aprobado.
- Un pago no puede estar aprobado y rechazado a la vez.
- No hay borrado de pagos ni de boletos (registros financieros de solo alta).

## 6. Tarifas Estandarizadas (Encomiendas)

### 6.1 Definición
Las tarifas de encomiendas son **estandarizadas por EnBus** y aceptadas por todas las cooperativas al afiliarse. No varían por cooperativa. Se expresan en **USD de referencia**.

### 6.2 Fórmula de Cálculo
```
costo_envio_usd = peso_kg × tarifa_por_kg × (1 + factor_distancia_por_min × duracion_estimada_min)
```

Donde:
- `peso_kg`: Peso real de la encomienda (ingresado por el taquillero; máximo `peso_max_kg`).
- `tarifa_por_kg`: Precio base por kilogramo en USD (definido por Super Admin en la tabla `tarifas`).
- `factor_distancia_por_min` × `duracion_estimada_min`: recargo por el **tiempo estimado de recorrido** de la ruta activa más corta de la cooperativa entre las mismas ciudades.

El costo lo calcula **el servidor** al recibir y pesar la encomienda (`fn_confirmar_recepcion_origen`; vista previa con `fn_cotizar_encomienda`). El panel no envía el costo.

### 6.3 Administración de Tarifas
- La tabla `tarifas` es gestionada exclusivamente por el **Super Admin**.
- La cooperativa **no puede** modificar las tarifas.
- Los cambios de tarifas aplican solo a encomiendas nuevas (no retroactivos).

### 6.4 Calculadora Estimada (App y Landing)
La app ofrece una calculadora para que el usuario estime el costo antes de ir a taquilla:
- Inputs: Peso estimado (kg), Origen, Destino.
- Output: Costo estimado en USD y su equivalente en Bs a la tasa BCV vigente (`calculadora-publica` devuelve `costo_estimado_usd`, `costo_estimado_bs`, `tasa_bcv`, `tasa_bcv_fecha`), indicando que es aproximado y que el precio final se determina en taquilla con el peso real.
- Desde la fase 3 también existe la RPC pública `fn_cotizar_envio_publico(p_peso_kg, p_ciudad_origen, p_ciudad_destino)` (anon y authenticated; misma fórmula que `_costo_encomienda`): devuelve `{peso_max_kg, tasa_bcv, tasa_bcv_fecha, opciones:[{cooperativa_id, cooperativa, calificacion, duracion_min, costo_usd, costo_bs}]}`. La usan la app ("Desde Bs X (1 kg)") y la calculadora de la landing.

## 7. Precios de Boletos
- Los precios de los boletos son definidos por cada **cooperativa** al crear sus rutas y viajes, en **USD de referencia**.
- No están estandarizados pues dependen del tipo de servicio (ejecutivo, económico, etc.).
- El precio se muestra en la lista de resultados de búsqueda y en la página de detalles del viaje, en Bs a la tasa BCV del día con el USD de referencia.
- `boletos.precio` copia `rutas.precio_pasaje` al reservar; el servidor ignora cualquier precio enviado por el cliente.

## 8. Comisiones (EnBus ← Cooperativas)
- EnBus cobra una **comisión porcentual** por cada transacción procesada (encomienda o boleto).
- El porcentaje de comisión es configurable por cooperativa desde el Panel Super Admin.
- Al final de cada ciclo (semanal/mensual), se genera un balance de lo que la cooperativa debe a EnBus.
- Las comisiones se calculan sobre `pagos.monto` (USD de referencia) de los pagos aprobados; los Bs se muestran como referencia a la tasa del día.
- Ver `04_Web_Super_Admin/Comisiones_Spec.md` para el flujo completo de liquidación.

## 9. Reembolsos (Boletos)

### 9.1 Cuánto se devuelve
| Quién cancela | RPC | Monto (`boletos.monto_reembolso`, USD de referencia) |
|---|---|---|
| El **pasajero** (app), boleto `PAGADO` antes de la salida | `fn_cancelar_boleto` | **95 %** del valor del boleto (penalidad del 5 %). Motivo obligatorio. |
| La **cooperativa** cancela el viaje (panel, solo `admin_cooperativa`) | `fn_cancelar_viaje(p_viaje_id, p_motivo)` | **100 %** del valor de cada boleto `PAGADO` (sin penalidad). |
| Reserva sin pagar (cualquiera de los dos) | `fn_cancelar_boleto` / `fn_cancelar_viaje` | Sin reembolso: no hubo cobro. |

- El monto lo calcula siempre **el servidor**; la app solo muestra el estimado.
- Se paga en Bs a la **tasa BCV del día en que la cooperativa hace la devolución**, por el **mismo medio** con que pagó el pasajero (si pagó por Zelle o en divisas, se devuelve el monto en USD).
- La cancelación desde la app es **inmediata** (el asiento se libera y el pase deja de servir); el reembolso queda **pendiente** hasta que la cooperativa lo registre.
- `fn_cancelar_viaje` solo cancela viajes `PROGRAMADO` (si no, `EB_ESTADO_CAMBIO`; si ya estaba cancelado devuelve `ya_procesado: true`) y exige un motivo (≥ 5 caracteres, `EB_MOTIVO_REQUERIDO`) que se envía a cada comprador. Si el viaje tiene pagos en verificación responde `EB_PAGOS_PENDIENTES` (`detail.pendientes`): primero se aprueban o rechazan en "Pagos por verificar". Pasa los boletos `PAGADO` a `CANCELADO` con `monto_reembolso = precio`, anula las reservas, marca el viaje `CANCELADO`, avisa a cada comprador (`VIAJE_CANCELADO`) y devuelve `{estado, boletos_reembolso, reservas_anuladas, total_reembolso_usd, encomiendas_en_transito}`. Las encomiendas ya despachadas siguen `EN_TRANSITO`.
- `motivo_cancelacion` de los boletos cancelados por la cooperativa empieza por "Viaje cancelado por la cooperativa: …"; así `fn_reembolsos` distingue `cancelado_por = 'COOPERATIVA'` de `'PASAJERO'`.

### 9.2 Bandeja y registro de la devolución
EnBus **no mueve dinero**: la cooperativa devuelve el dinero por fuera de la app y lo **registra** en el panel ("Reembolsos"). No hay tabla nueva: el registro vive en `boletos`.

| Paso | RPC | Efecto |
|---|---|---|
| Bandeja (panel, taquillero y admin) | `fn_reembolsos(p_estado 'PENDIENTE' \| 'PROCESADO' \| 'TODOS')` | Boletos `CANCELADO` con `monto_reembolso > 0` de la cooperativa: boleto, asiento, pasajero, contacto (teléfono del comprador), viaje, motivo, `cancelado_por`, monto, cómo pagó (`pago_metodo`, `pago_banco_emisor`, `pago_referencia`, `pago_moneda`, `pago_estado`) y, si ya se devolvió, `reembolso_metodo`, `reembolso_referencia`, `reembolso_nota`, `procesado_at`. |
| Registrar devolución (panel) | `fn_registrar_reembolso(p_boleto_ids, p_metodo, p_referencia, p_nota)` | Uno o varios boletos de la cooperativa. `p_metodo`: `PAGO_MOVIL`, `TRANSFERENCIA_BANCARIA`, `ZELLE` o `EFECTIVO`; referencia de al menos 4 caracteres salvo en efectivo (`EB_DATOS_PAGO_INVALIDOS`). Marca `reembolso_procesado = true` y guarda `reembolso_procesado_at`, `reembolso_procesado_por`, `reembolso_metodo`, `reembolso_referencia`, `reembolso_nota`; avisa al pasajero (`REEMBOLSO_ENVIADO`, "Te devolvimos tu dinero"). Idempotente: devuelve `{procesados, ya_procesados}`. |

- El cliente no puede escribir las columnas de reembolso (trigger `aa_proteger_boletos_cliente`).
- La app muestra el estado del reembolso con `reembolso_procesado`, `reembolso_procesado_at`, `reembolso_metodo` y `reembolso_referencia`: "Reembolso pendiente" / "Reembolsado" (operador: "Por devolver" / "Devuelto"; ver `Glosario.md`).

### 9.3 Pagos de encomienda: visibles para ambas partes
- Remitente y destinatario ven **todos** los pagos de su encomienda (política RLS "Partes de la encomienda ven su cobro" en `pagos`): si quien envía ya registró el pago, quien recibe lo ve "en verificación" o "pagado por quien envía" y no se le pide pagar de nuevo.
- Para saber si el pago es propio se compara `pagos.pagador_id` con el usuario.
- Alta presencial en taquilla (`fn_registrar_encomienda_taquilla`): la encomienda queda `POR_PAGAR` con su costo; se cobra con el flujo normal (§3.1, §3.2).

## 10. Seguro de Encomiendas
- Todo envío procesado por EnBus incluye un **seguro gratuito** contra pérdida.
- Cobertura: **3 veces el valor declarado del paquete**.
- El costo del seguro lo **absorbe EnBus** (no se cobra al cliente ni a la cooperativa).
- La activación del seguro requiere apertura de incidencia (ver `04_Web_Super_Admin/Incidencias_Spec.md`).
