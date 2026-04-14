# Panel Cooperativas: Gestión de Empleados

## 1. Objetivo
Interfaz para que el administrador de la cooperativa gestione los taquilleros de sus sucursales.

## 2. Actores
- **Admin Cooperativa**: CRUD completo.

## 3. Interfaz
- URL: `/cooperativas/empleados`
- Tabla con todos los empleados de la cooperativa.
- Columnas: Nombre, Email, Rol, Sucursal, Fecha de registro, Estado (Activo/Inactivo).

### 3.1 Invitar Empleado
1. Botón: **"Invitar Empleado"**.
2. Modal con campo de email y selector de sucursal.
3. Se genera un **enlace de invitación** (magic link, expira en 48 horas).
4. Se envía por email o el admin puede copiar el enlace y compartirlo manualmente (WhatsApp, etc).

### 3.2 Desactivar Empleado
- Botón rojo: "Desactivar".
- El empleado pierde acceso al panel pero su registro se mantiene en DB.
- No se elimina de la base de datos (auditoría).

### 3.3 Reactivar Empleado
- Botón: "Reactivar".
- El empleado recupera acceso.

## 4. Reglas
- Un admin cooperativa solo ve y gestiona empleados de **su cooperativa**.
- Un admin no puede eliminarse a sí mismo ni desactivar su propia cuenta.
- Máximo 1 invitación activa por email (previene spam).
