# Panel Cooperativas: Recepción en Destino

## 1. Objetivo
Interfaz para que la sucursal de destino registre la llegada de encomiendas cuando el bus arriba.

## 2. Interfaz

### 2.1 Vista Principal
- URL: `/cooperativas/recepcion-destino`
- Lista de encomiendas en estado `EN_TRANSITO` cuyo destino corresponda a la sucursal actual.
- Cada item muestra: Tracking ID, remitente, destinatario, origen.

### 2.2 Flujo de Recepción
1. El taquillero escanea las guías/etiquetas físicas de las encomiendas que llegan.
2. El escáner lee el tracking ID del QR impreso.
3. El sistema valida que la encomienda esté en estado `EN_TRANSITO`.
4. Cambia el estado a `EN_OFICINA_DESTINO`.
5. Se envían notificaciones al destinatario (Push + WhatsApp con PIN de retiro).

### 2.3 Recepción por Lote
- Alternativa al escaneo individual: botón **"Recibir Lote del Viaje"** que permite seleccionar un viaje y marcar todas sus encomiendas como recibidas.

## 3. Reglas
- Solo encomiendas en `EN_TRANSITO` pueden marcarse como recibidas.
- La sucursal de destino debe coincidir con `encomiendas.sucursal_destino_id`.
