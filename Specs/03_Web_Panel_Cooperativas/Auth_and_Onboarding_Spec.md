# Panel Cooperativas: Autenticación y Onboarding

## 1. Objetivo
Definir cómo los empleados y administradores de cooperativas acceden al Panel Web.

## 2. Flujos de Acceso

### 2.1 Login
- URL: `/cooperativas/login`
- Campos: Email + Password.
- No hay Google Sign-In para panel de cooperativas (solo invitación).
- Al autenticarse, el middleware verifica que `profiles.role` sea `taquillero` o `admin_cooperativa`.
- Si el rol no es válido, muestra error: "No tienes permisos para acceder a este panel."

### 2.2 Onboarding de Administrador de Cooperativa
1. Super Admin crea la cooperativa y genera enlace de invitación.
2. El admin abre el enlace → Pantalla de registro con campos: Nombre, Password.
3. Se crea `profiles` con `role = 'admin_cooperativa'` y `cooperativa_id` vinculada.
4. Redirige al Dashboard de la cooperativa.
5. El admin debe completar los datos de la cooperativa: RIF, logo, métodos de pago, sucursales.

### 2.3 Onboarding de Taquillero
1. Admin cooperativa genera enlace de invitación desde "Gestión de Empleados".
2. Taquillero abre el enlace → Pantalla de registro: Nombre, Password.
3. Se crea `profiles` con `role = 'taquillero'` y `cooperativa_id` vinculada.
4. Redirige a la vista de Taquilla.

## 3. Navegación Post-Login

| Rol | Vista por defecto | Menú lateral |
|---|---|---|
| `taquillero` | Taquilla de Encomiendas | Taquilla Encomiendas, Taquilla Boletos, Despacho |
| `admin_cooperativa` | Dashboard | Dashboard, Taquilla Encomiendas, Taquilla Boletos, Despacho, Rutas y Horarios, Gestión Empleados, Métodos de Pago, Configuración |

## 4. Sesiones
- Gestionadas por `@supabase/ssr` con cookies HttpOnly.
- Middleware Next.js en todas las rutas `/cooperativas/*`.
- Cierre de sesión: botón en el menú lateral.
