# Super Admin: Gestión de Usuarios

## 1. Objetivo
Vista administrativa de todos los usuarios del sistema para soporte y auditoría.

## 2. Interfaz
- URL: `/admin/usuarios`

### 2.1 Tabla de Usuarios
- Columnas: Iniciales, Nombre, Email, Teléfono, Rol, Cooperativa (si aplica), Fecha de registro.
- Filtros: Por rol, por cooperativa.
- Búsqueda: Por nombre, email, teléfono o cédula.

### 2.2 Detalle de Usuario
- URL: `/admin/usuarios/{id}`
- Datos del perfil.
- Historial de encomiendas (como remitente y destinatario).
- Historial de boletos.
- Historial de pagos.
- Log de notificaciones.

### 2.3 Acciones
| Acción | Descripción |
|---|---|
| Desbloquear PIN | Resetea `intentos_pin` y `pin_bloqueado` de una encomienda específica |
| Reenviar PIN | Reenvía la notificación (WhatsApp + Email) al destinatario con el **mismo PIN original**. No se genera un PIN nuevo. |
| Desactivar Usuario | Revoca acceso (soft delete) |

## 3. Reglas
- El Super Admin **no puede** modificar datos del perfil de un usuario (privacidad).
- Las acciones de desbloqueo/reenvío de PIN se registran en un log de auditoría.
- El PIN **nunca se regenera**. Es único e inmutable por encomienda. Si el destinatario lo pierde, se reenvía el original.
