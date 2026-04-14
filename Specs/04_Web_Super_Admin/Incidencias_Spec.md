# Super Admin: Incidencias y Alertas

## 1. Objetivo
Panel de gestión de alertas automáticas y reportes de usuarios.

## 2. Interfaz
- URL: `/admin/incidencias`

### 2.1 Lista de Incidencias
- Tabla con todas las incidencias.
- Columnas: ID, Tipo, Encomienda (Tracking ID), Reportado por, Estado, Fecha.
- Filtros: Por tipo, por estado.

### 2.2 Tipos de Incidencia

| Tipo | Origen | Descripción |
|---|---|---|
| `ALERTA_AMARILLA` | Sistema (CRON) | Encomienda en `EN_TRANSITO` por más de 72 horas |
| `REPORTE_USUARIO` | App Móvil | Usuario reporta un problema con su envío |
| `PERDIDA` | Manual (Super Admin) | Encomienda declarada como perdida |

### 2.3 Detalle de Incidencia
| Campo | Descripción |
|---|---|
| Encomienda vinculada | Link al detalle de la encomienda |
| Descripción | Texto del reporte |
| Estado | ABIERTA → EN_PROCESO → RESUELTA |
| Resolución | Texto libre del Super Admin |
| Historial de cambios | Quién y cuándo cambió el estado |

### 2.4 Acciones
| Acción | Descripción |
|---|---|
| Tomar Caso | Cambia a EN_PROCESO, asigna al admin actual |
| Resolver | Ingresa resolución y marca como RESUELTA |
| Activar Seguro | Para incidencias tipo PERDIDA: genera registro de indemnización |

### 2.5 Reportar Incidencia desde la App
- El usuario tiene un botón "Reportar Problema" en el detalle de su encomienda.
- Al presionar, llena un formulario (descripción del problema) y se crea una incidencia tipo `REPORTE_USUARIO`.

## 3. Reglas
- Las alertas amarillas se generan automáticamente cada hora (CRON).
- Una alerta amarilla no se duplica para la misma encomienda.
- Las incidencias tipo PERDIDA activan el seguro (cobertura: 3× valor declarado).
