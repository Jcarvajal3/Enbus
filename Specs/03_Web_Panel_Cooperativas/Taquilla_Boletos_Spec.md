# Panel Cooperativas: Taquilla de Boletos

## 1. Objetivo
Interfaz para la venta presencial de boletos de bus en la taquilla física de la cooperativa.

## 2. Actores
- **Taquillero**: Vende boletos a clientes que se acercan a la ventanilla.
- **Admin Cooperativa**: Mismas capacidades.

## 3. Interfaz de Usuario

### 3.1 Vista Principal
- URL: `/cooperativas/taquilla/boletos`
- **Tabla/Lista** de todos los boletos vendidos por la cooperativa, filtrable por estado y fecha.
- Columnas: Código, Viaje (ruta + fecha), Pasajero, Asiento, Estado, Precio.
- Botón: **"Vender Boleto"** → Abre flujo de venta.

### 3.2 Flujo de Venta Presencial
1. **Selección de Viaje**: Selector de viajes próximos de la cooperativa (filtrable por ruta y fecha).
2. **Selector de Asiento**: Mapa visual de asientos del bus seleccionado (mismo componente lógico que `<SeatSelector />`de la app, adaptado a web).
3. **Datos del Pasajero**: Nombre completo, Cédula/RIF, Teléfono.
4. **Pago**: 
   - Botón **"Cobrado en Efectivo"** (más común en taquilla presencial).
   - Alternativa: registrar datos de transferencia si el cliente pagó digitalmente.
5. **Confirmación**: Se genera el boleto con estado `PAGADO` (pago verificado en el acto, ya que el taquillero recibió el dinero). Se genera QR de embarque.
6. **Impresión**: Se imprime el boleto via impresora Bluetooth (ver `Hardware_Integration_Spec.md`).

### 3.3 Escaneo de Embarque
- Campo de escaneo (igual que en taquilla de encomiendas).
- El escáner lee el QR de embarque del pasajero.
- El sistema valida el boleto y cambia el estado a `USADO`.
- Muestra confirmación visual: "✓ Boleto válido — Asiento {N} — {Nombre del pasajero}".

### 3.4 Lista de Boletos por Viaje
- El taquillero puede ver la lista de todos los pasajeros de un viaje específico.
- Útil para control de embarque: muestra quién abordó (USADO) y quién no.

## 4. Reglas de Negocio
- Los boletos vendidos presencialmente se crean directamente en estado `PAGADO` (sin pasar por `RESERVADO`).
- El taquillero solo ve viajes de su cooperativa.
- Al vender presencialmente, el `comprador_id` puede ser NULL si el pasajero no tiene cuenta en la app. En ese caso, se registran los datos manuales.

## 5. Vinculación con DB
- **Lee**: `viajes` (de su cooperativa), `boletos`.
- **Inserta**: `boletos`, `pagos`.
- **Actualiza**: `boletos.estado` (a USADO al escanear embarque), `viajes.asientos_disponibles`.
