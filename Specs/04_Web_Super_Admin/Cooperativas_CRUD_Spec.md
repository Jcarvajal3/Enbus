# Super Admin: Gestión de Cooperativas

## 1. Objetivo
CRUD completo de cooperativas afiliadas al ecosistema EnBus.

## 2. Interfaz
- URL: `/admin/cooperativas`

### 2.1 Lista de Cooperativas
- Tabla con todas las cooperativas.
- Columnas: Logo, Nombre, RIF, Estado (badge), Comisión %, Calificación ★, Fecha de registro.
- Filtros: Por estado (Activa, Suspendida, Desactivada).
- Búsqueda: Por nombre o RIF.

### 2.2 Crear Cooperativa
- Botón: **"Nueva Cooperativa"** → Formulario.

| Campo | Tipo | Obligatorio |
|---|---|---|
| Nombre Comercial | Text | Sí |
| RIF | Text (validación formato J-XXXXXXXX) | Sí |
| Logo | File upload (imagen) | No |
| Comisión (%) | Number (decimal, ej: 10.50) | Sí |

- Al crear, se genera un **enlace de invitación** para el administrador de la cooperativa.
- El admin de la cooperativa completa los datos restantes (sucursales, métodos de pago, rutas).

### 2.3 Detalle de Cooperativa
- URL: `/admin/cooperativas/{id}`
- Vista completa con tabs:

| Tab | Contenido |
|---|---|
| General | Datos básicos, logo, RIF, estado, comisión |
| Sucursales | Lista de sucursales (solo lectura para Super Admin) |
| Métodos de Pago | Lista de métodos (solo lectura) |
| Rutas | Lista de rutas activas (solo lectura) |
| Empleados | Lista de empleados (solo lectura) |
| Calificaciones | Promedio + últimas calificaciones recibidas |
| Balance | Comisiones pendientes del ciclo actual |

### 2.4 Acciones sobre Cooperativa
| Acción | Descripción |
|---|---|
| Editar | Modificar nombre, RIF, comisión |
| Suspender | Cambia estado a SUSPENDIDA. Bloquea nuevas transacciones. |
| Reactivar | Cambia de SUSPENDIDA a ACTIVA. |
| Desactivar | Cambia a DESACTIVADA. Permanente (reversible solo por DB). |
| Invitar Admin | Genera nuevo enlace de invitación para admin de la cooperativa. |

## 3. Reglas
- Solo el Super Admin puede crear, suspender o desactivar cooperativas.
- La comisión es configurable por cooperativa (no es global).
- Suspender una cooperativa no cancela operaciones en curso; solo bloquea nuevas.
