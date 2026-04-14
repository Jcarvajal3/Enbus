# Panel Cooperativas: Despacho

## 1. Objetivo
Interfaz para que el taquillero marque lotes de encomiendas como despachados cuando el bus parte de la sucursal de origen.

## 2. Interfaz

### 2.1 Vista Principal
- URL: `/cooperativas/despacho`
- Lista de encomiendas en estado `PAGADA`, agrupadas por viaje próximo.
- Cada grupo muestra: Ruta, Hora de salida, Cantidad de encomiendas.

### 2.2 Flujo de Despacho
1. El taquillero selecciona un viaje (bus que está por partir).
2. Ve la lista de encomiendas asignadas a ese viaje.
3. Puede seleccionar todas o seleccionar individualmente.
4. Presiona **"Despachar Seleccionadas"**.
5. Todas las encomiendas seleccionadas cambian a estado `EN_TRANSITO`.
6. Se envían notificaciones Push a remitentes y Push + WhatsApp a destinatarios.

### 2.3 Confirmación
- Modal de confirmación: "¿Despachar {N} encomiendas en el viaje {Ruta} - {Hora}?"
- Botón: "Confirmar Despacho".

## 3. Reglas
- Solo se pueden despachar encomiendas en estado `PAGADA`.
- El despacho es irreversible desde esta interfaz (solo Super Admin podría revertir).
- Al despachar, el viaje asociado cambia a estado `EN_CURSO`.
