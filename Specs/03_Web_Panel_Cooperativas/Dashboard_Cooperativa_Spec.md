# Panel Cooperativas: Dashboard

## 1. Objetivo
Vista de métricas diarias y resumen operativo para administradores de cooperativa.

## 2. Actores
- **Admin Cooperativa**: Acceso completo.
- **Taquillero**: Solo lectura (resumen del día).

## 3. Interfaz
- URL: `/cooperativas/dashboard`

### 3.1 KPIs del Día (Cards superiores)
| Métrica | Fuente |
|---|---|
| Encomiendas recibidas hoy | `encomiendas` WHERE `estado >= EN_RECEPCION` AND `created_at = hoy` |
| Encomiendas despachadas hoy | `encomienda_estado_historial` WHERE `estado_nuevo = EN_TRANSITO` AND `created_at = hoy` |
| Boletos vendidos hoy | `boletos` WHERE `estado = PAGADO` AND `created_at = hoy` |
| Ingresos del día | Suma de `pagos.monto` verificados hoy |

### 3.2 Tabla de Encomiendas Recientes
Las últimas 20 encomiendas procesadas con su estado actual.

### 3.3 Gráfico de Actividad (Solo Admin)
Gráfico de barras con encomiendas y boletos procesados en los últimos 7 días.

### 3.4 Comisiones Pendientes (Solo Admin)
Card con el balance de comisiones adeudadas a EnBus en el ciclo actual.
