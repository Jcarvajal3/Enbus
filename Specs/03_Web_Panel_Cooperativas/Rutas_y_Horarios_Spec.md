# Panel Cooperativas: Rutas y Horarios

## 1. Objetivo
Interfaz para que el administrador de la cooperativa gestione sus rutas y programe viajes (buses).

## 2. Actores
- **Admin Cooperativa**: CRUD completo.
- **Taquillero**: Solo lectura.

## 3. Interfaz

### 3.1 Gestión de Rutas
- URL: `/cooperativas/rutas`
- Tabla con todas las rutas de la cooperativa.
- Columnas: Origen → Destino, Duración estimada, Precio de pasaje, Estado (Activa/Inactiva).
- CRUD: Crear, editar, activar/desactivar rutas.

#### Formulario de Ruta
| Campo | Tipo | Obligatorio |
|---|---|---|
| Estado Origen | Select (estados de Venezuela) | Sí |
| Ciudad Origen | Select (filtrado por estado) | Sí |
| Estado Destino | Select | Sí |
| Ciudad Destino | Select | Sí |
| Duración Estimada (minutos) | Number | Sí |
| Precio del Pasaje | Number (decimal) | Sí |
| Activa | Toggle | Sí (default: Sí) |

### 3.2 Gestión de Viajes (Buses)
- URL: `/cooperativas/viajes`
- Tabla con todos los viajes programados.
- Filtros: Por ruta, por fecha, por estado.
- Columnas: Ruta, Fecha/Hora Salida, Hora Llegada Est., Asientos Totales, Asientos Disponibles, Estado.

#### Formulario de Viaje
| Campo | Tipo | Obligatorio |
|---|---|---|
| Ruta | Select (rutas activas de la cooperativa) | Sí |
| Fecha y Hora de Salida | DateTime picker | Sí |
| Hora Estimada de Llegada | DateTime picker (auto-calculada desde ruta) | Sí |
| Asientos Totales | Number | Sí |
| Número de Unidad (Bus) | Text | No (se puede agregar después) |
| Nombre del Chófer | Text | No (se puede agregar después) |
| Recurrente | Toggle | No |

#### Viajes Recurrentes
- Si se marca como "Recurrente", se configura:
  - Días de la semana (checkboxes: L, M, Mi, J, V, S, D).
  - Hora de salida fija.
  - Periodo de vigencia (desde - hasta).
- El sistema genera automáticamente los viajes individuales para el periodo.

### 3.3 Detalle de Viaje
- Muestra la lista de boletos vendidos + encomiendas asignadas al viaje.
- Permite editar datos del bus (número de unidad, chófer) hasta el momento del despacho.

## 4. Reglas
- No se puede eliminar una ruta con viajes futuros activos (solo desactivar).
- No se puede eliminar un viaje con boletos vendidos (solo cancelar, lo cual activa reembolsos).
- Los datos sensibles (número de unidad, nombre del chófer) son visibles para el admin y taquillero, pero solo se revelan al usuario final después de pagar su boleto.
