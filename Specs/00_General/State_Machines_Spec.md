# Máquinas de Estado

Este documento define las transiciones de estado válidas para todas las entidades del sistema. **Ninguna transición fuera de las aquí documentadas debe ser permitida por la base de datos.**

## 1. Encomienda

### 1.1 Estados

| Estado (enum DB) | Descripción | Quién lo activa |
|---|---|---|
| `PENDIENTE_DE_ESCANEO` | Encomienda creada en la app. QR generado. Esperando que el remitente se acerque a taquilla. | Sistema (al crear encomienda) |
| `EN_RECEPCION` | El taquillero escaneó el QR. Encomienda asociada a cooperativa/sucursal. | Taquillero (escaneo QR) |
| `POR_PAGAR` | El taquillero ingresó el peso y el sistema calculó el costo. Esperando pago. | Sistema (al calcular costo) |
| `PAGADA` | El pago fue verificado por la cooperativa. | Taquillero (marca como pagado) |
| `EN_TRANSITO` | El lote de encomiendas fue despachado. El bus partió. | Taquillero (despacho de lote) |
| `EN_OFICINA_DESTINO` | El bus llegó a destino y la oficina receptora escaneó las guías. | Taquillero destino (escaneo de llegada) |
| `ENTREGADA` | El destinatario retiró la encomienda con su PIN. Estado terminal. | Taquillero destino (validación PIN) |
| `CANCELADA` | Encomienda cancelada por el remitente o el sistema. Estado terminal. | Remitente (app) o Sistema |
| `DEVUELTA` | Encomienda no retirada en 5 días hábiles, devuelta a origen. Estado terminal (hasta que se recoja). | Sistema (automático) |

### 1.2 Diagrama de Transiciones

```
PENDIENTE_DE_ESCANEO
    │
    ├──→ EN_RECEPCION (taquillero escanea QR)
    │       │
    │       └──→ POR_PAGAR (sistema calcula costo)
    │               │
    │               ├──→ PAGADA (taquillero verifica pago)
    │               │       │
    │               │       └──→ EN_TRANSITO (taquillero despacha lote)
    │               │               │
    │               │               └──→ EN_OFICINA_DESTINO (taquillero destino escanea)
    │               │                       │
    │               │                       ├──→ ENTREGADA (PIN validado) ■
    │               │                       │
    │               │                       └──→ DEVUELTA (5 días sin retirar) ■
    │               │
    │               └──→ CANCELADA (remitente se arrepiente) ■
    │
    └──→ CANCELADA (remitente cancela antes de ir a taquilla) ■

■ = Estado terminal
```

### 1.3 Transiciones Válidas (para constraint en DB)

| Desde | Hacia | Condiciones |
|---|---|---|
| `PENDIENTE_DE_ESCANEO` | `EN_RECEPCION` | Cooperativa tiene ruta activa al destino |
| `PENDIENTE_DE_ESCANEO` | `CANCELADA` | Remitente cancela desde app |
| `EN_RECEPCION` | `POR_PAGAR` | Peso ingresado y costo calculado |
| `POR_PAGAR` | `PAGADA` | Taquillero marca pago como verificado |
| `POR_PAGAR` | `CANCELADA` | Remitente cancela (arrepentimiento por precio) |
| `PAGADA` | `EN_TRANSITO` | Taquillero despacha el lote |
| `EN_TRANSITO` | `EN_OFICINA_DESTINO` | Taquillero destino escanea guía |
| `EN_OFICINA_DESTINO` | `ENTREGADA` | PIN validado correctamente |
| `EN_OFICINA_DESTINO` | `DEVUELTA` | 5 días hábiles sin retiro (automático) |

### 1.4 Reglas Adicionales
- La cancelación **solo** es posible en estados `PENDIENTE_DE_ESCANEO`, `EN_RECEPCION` y `POR_PAGAR`.
- El estado `DEVUELTA` genera una nueva encomienda de retorno con costo pendiente para el remitente.
- Cualquier encomienda que permanezca más de 72 horas en `EN_TRANSITO` genera una **Alerta Amarilla** en el Panel del Super Admin (ver `04_Web_Super_Admin/Incidencias_Spec.md`).

---

## 2. Boleto

### 2.1 Estados

| Estado (enum DB) | Descripción | Quién lo activa |
|---|---|---|
| `RESERVADO` | El usuario seleccionó un asiento y procedió al pago. Asiento bloqueado temporalmente. | Sistema (al seleccionar asiento) |
| `PAGADO` | El pago fue verificado por la cooperativa. Boleto confirmado. | Taquillero o Sistema |
| `USADO` | El pasajero abordó el bus. QR de embarque escaneado. | Taquillero (escaneo QR embarque) |
| `CANCELADO` | El usuario canceló el boleto. Estado terminal. | Usuario (app) |
| `EXPIRADO` | La fecha del viaje pasó sin que el pasajero abordara. Estado terminal. | Sistema (automático, post fecha viaje) |

### 2.2 Diagrama de Transiciones

```
RESERVADO
    │
    ├──→ PAGADO (cooperativa verifica pago)
    │       │
    │       ├──→ USADO (QR escaneado al abordar) ■
    │       │
    │       ├──→ CANCELADO (usuario cancela, reembolso 95%) ■
    │       │
    │       └──→ EXPIRADO (fecha del viaje pasó) ■
    │
    ├──→ CANCELADO (usuario cancela antes de pagar, sin costo) ■
    │
    └──→ EXPIRADO (reserva no pagada, tiempo agotado) ■

■ = Estado terminal
```

### 2.3 Transiciones Válidas

| Desde | Hacia | Condiciones |
|---|---|---|
| `RESERVADO` | `PAGADO` | Cooperativa verifica el pago |
| `RESERVADO` | `CANCELADO` | Usuario cancela (sin costo, asiento se libera) |
| `RESERVADO` | `EXPIRADO` | Tiempo de reserva sin pago expiró (30 minutos) |
| `PAGADO` | `USADO` | QR de embarque escaneado por personal de cooperativa |
| `PAGADO` | `CANCELADO` | Usuario cancela (reembolso del 95%, procesado por cooperativa en 1-2 días hábiles) |
| `PAGADO` | `EXPIRADO` | Fecha/hora del viaje pasó sin abordar |

### 2.4 Reglas Adicionales
- Al cancelar un boleto `PAGADO`, el usuario debe escribir un **motivo de cancelación** (campo de texto obligatorio).
- El reembolso del **95%** es procesado por la cooperativa mediante los mismos canales de pago.
- Al cancelar, el asiento se libera automáticamente.
- La reserva (`RESERVADO`) sin pago tiene un **tiempo límite de 30 minutos** antes de expirar automáticamente.

---

## 3. Cooperativa

### 3.1 Estados

| Estado (enum DB) | Descripción |
|---|---|
| `ACTIVA` | Cooperativa operativa en la plataforma |
| `SUSPENDIDA` | Cooperativa suspendida temporalmente (ej: deuda de comisiones) |
| `DESACTIVADA` | Cooperativa retirada permanentemente |

### 3.2 Transiciones Válidas

| Desde | Hacia | Quién |
|---|---|---|
| `ACTIVA` | `SUSPENDIDA` | Super Admin |
| `SUSPENDIDA` | `ACTIVA` | Super Admin (tras pago de deuda) |
| `ACTIVA` | `DESACTIVADA` | Super Admin |
| `SUSPENDIDA` | `DESACTIVADA` | Super Admin |

### 3.3 Impacto en Operaciones
- Una cooperativa `SUSPENDIDA` o `DESACTIVADA` **no aparece** en los resultados de búsqueda de la app.
- Las encomiendas en curso de una cooperativa suspendida **deben completar su ciclo** (no se cancelan automáticamente).
- No se pueden crear nuevas encomiendas ni vender boletos para cooperativas suspendidas/desactivadas.
