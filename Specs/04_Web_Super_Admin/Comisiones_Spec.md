# Super Admin: Comisiones y Liquidación

## 1. Objetivo
Gestión del ciclo de cobro de comisiones que las cooperativas deben a EnBus.

## 2. Interfaz
- URL: `/admin/comisiones`

### 2.1 Vista de Ciclos
- Lista de ciclos de liquidación con: Periodo, Cooperativa, Monto total de transacciones, Comisión %, Monto de comisión, Estado (Pendiente/Pagado).
- Filtros: Por cooperativa, por estado de pago, por periodo.

### 2.2 Generar Ciclo
1. Botón: **"Generar Ciclo"**.
2. Seleccionar: Periodo (fecha inicio - fecha fin) y Cooperativa (o todas).
3. El sistema calcula automáticamente:
   - Total de encomiendas pagadas en el periodo.
   - Total de boletos pagados en el periodo.
   - Comisión = (total_encomiendas + total_boletos) × comisión_% de la cooperativa.
4. Se crea un registro en `comisiones_ciclo`.

### 2.3 Marcar como Pagado
- Cuando la cooperativa transfiere su comisión a EnBus:
  - Botón **"Marcar como Solvente"**.
  - Se registra `pagado = true` y `pagado_at = now()`.

### 2.4 Historial
- Vista de todos los ciclos históricos con posibilidad de exportar a CSV.

## 3. Reglas
- Los ciclos son informativos; la cobranza se realiza por fuera del sistema.
- Una cooperativa con más de 2 ciclos impagos puede ser marcada como `SUSPENDIDA`.
