# Super Admin: Dashboard

## 1. Objetivo
Panel de control global del ecosistema EnBus para el equipo administrativo.

## 2. Actores
- **Super Admin**: Acceso exclusivo.

## 3. Interfaz
- URL: `/admin/dashboard`

### 3.1 KPIs Globales (Cards superiores)
| Métrica | Descripción |
|---|---|
| Encomiendas Hoy | Total de encomiendas creadas en todas las cooperativas hoy |
| Boletos Hoy | Total de boletos vendidos hoy (app + taquilla) |
| Ingresos Brutos Hoy | Suma de todos los pagos verificados hoy |
| Comisiones Estimadas Hoy | Ingresos brutos × comisión promedio |
| Cooperativas Activas | Cantidad de cooperativas en estado ACTIVA |
| Alertas Amarillas Abiertas | Incidencias tipo ALERTA_AMARILLA sin resolver |

### 3.2 Gráficos
| Gráfico | Tipo | Datos |
|---|---|---|
| Actividad de los últimos 30 días | Línea | Encomiendas + Boletos por día |
| Top 5 Cooperativas por volumen | Barras horizontal | Cooperativas con más transacciones del mes |
| Distribución por ruta | Mapa de calor o barras | Rutas más populares |

### 3.3 Tabla de Incidencias Recientes
Últimas 10 alertas/incidencias abiertas con enlace directo a `Incidencias_Spec.md`.

### 3.4 Tabla de Cooperativas con Balance
Lista de cooperativas con su balance de comisiones del ciclo actual (lo que deben a EnBus).

## 4. Navegación del Super Admin (Sidebar)
| Item | URL | Descripción |
|---|---|---|
| Dashboard | `/admin/dashboard` | Este módulo |
| Cooperativas | `/admin/cooperativas` | CRUD de cooperativas |
| Tarifas | `/admin/tarifas` | Gestión de precios estandarizados |
| Comisiones | `/admin/comisiones` | Ciclos de liquidación |
| Incidencias | `/admin/incidencias` | Alertas y reportes |
| Usuarios | `/admin/usuarios` | Gestión de usuarios del sistema |
