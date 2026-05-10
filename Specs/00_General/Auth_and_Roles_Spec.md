# Autenticación y Roles

## 1. Proveedores de Autenticación

| Actor | Proveedores | Plataforma |
|---|---|---|
| Cliente / Usuario | Email + Password, Google Sign-In | App Móvil (React Native) |
| Taquillero / Empleado | Enlace de invitación generado por su Cooperativa | Panel Web (Next.js) |
| Administrador de Cooperativa | Enlace de invitación generado por Super Admin | Panel Web (Next.js) |
| Super Admin | Email + Password, Google Sign-In | Panel Web (Next.js) |

Todos los proveedores se gestionan a través de **Supabase Auth**.

## 2. Roles del Sistema

Los roles se almacenan en la tabla `profiles.role` y se validan mediante RLS y middleware.

| Rol (enum)          | Descripción                         | Acceso a                                 |
| ------------------- | ----------------------------------- | ---------------------------------------- |
| `user`              | Cliente final de la app móvil       | App Móvil                                |
| `taquillero`        | Empleado de sucursal de cooperativa | Panel Cooperativas (operaciones diarias) |
| `admin_cooperativa` | Administrador de una cooperativa    | Panel Cooperativas (gestión completa)    |
| `super_admin`       | Equipo interno de EnBus             | Panel Super Admin                        |

## 3. Flujos de Registro y Onboarding

### 3.1 Cliente / Usuario (App Móvil)

1. El usuario descarga la app e inicia el flujo de registro.
2. **Opción A — Email + Password**:
   - Ingresa email, contraseña (mín. 8 caracteres), nombre completo, teléfono y cédula/RIF.
   - Supabase envía un **email de verificación**.
   - El usuario debe verificar su email antes de poder usar la app completamente.
3. **Opción B — Google Sign-In**:
   - Autenticación OAuth via Google.
   - Si es su primera vez, se le pide completar datos obligatorios faltantes: teléfono y cédula/RIF.
4. Al completar el registro, Supabase Auth crea el row en `auth.users`. Un **trigger de base de datos** (`on_auth_user_created`) crea automáticamente el registro en `profiles` con `role = 'user'` usando los datos de `raw_user_meta_data`. Ver `Database_Schema_Spec.md` §4.1.
5. **Requisito del frontend**: El formulario de registro **debe** enviar `nombre_completo`, `telefono` y `cedula_rif` dentro del objeto `options.data` de `supabase.auth.signUp()`. Si falta alguno, el trigger fallará y el registro se revertirá.
6. **Google Sign-In**: Tras la autenticación OAuth, si es primera vez, el frontend **debe** presentar un formulario de datos obligatorios (teléfono, cédula/RIF) y actualizar `auth.updateUser({ data: { ... } })` **antes** de que el trigger se dispare. Alternativamente, el frontend puede crear el perfil manualmente vía una Edge Function de onboarding.

### 3.2 Taquillero / Empleado (Panel Cooperativas)

1. Un `admin_cooperativa` accede a su panel y navega a "Gestión de Empleados".
2. Genera un **enlace de invitación** (magic link con token temporal, expiración: 48 horas).
3. Comparte el enlace con el empleado (WhatsApp, email, etc.).
4. El empleado abre el enlace, establece su contraseña y completa sus datos.
5. Se crea un registro en `profiles` con `role = 'taquillero'` y `cooperativa_id` vinculada.

### 3.3 Administrador de Cooperativa

1. El `super_admin` crea una cooperativa en el panel de Super Admin.
2. Genera un **enlace de invitación** para el administrador de la cooperativa.
3. El administrador abre el enlace, establece sus credenciales y completa los datos de la cooperativa.
4. Se crea un registro en `profiles` con `role = 'admin_cooperativa'` y `cooperativa_id` vinculada.

### 3.4 Super Admin

1. El primer Super Admin se crea manualmente via Supabase Dashboard (seed inicial).
2. Super Admins adicionales se crean por invitación desde el Panel Super Admin.
3. Autenticación: Email + Password o Google Sign-In.
4. `role = 'super_admin'`, sin `cooperativa_id`.

## 4. Gestión de Sesiones

### 4.1 Tokens y Refresh

| Parámetro | Valor |
|---|---|
| Duración del Access Token (JWT) | 1 hora |
| Duración del Refresh Token | 30 días |
| Renovación automática | Sí — el cliente SDK de Supabase renueva el token automáticamente antes de expirar |
| Almacenamiento del token (Móvil) | `expo-secure-store` (almacenamiento encriptado nativo) |
| Almacenamiento del token (Web) | Cookie HttpOnly con SameSite=Lax (gestionado por `@supabase/ssr`) |

### 4.2 Protección de Rutas

- **App Móvil**: Middleware de navegación que verifica sesión activa. Si no hay sesión, redirige a pantalla de Login.
- **Panel Cooperativas** (`/cooperativas/*`): Middleware Next.js que verifica sesión + rol `taquillero` o `admin_cooperativa` + `cooperativa_id` válida.
- **Panel Super Admin** (`/admin/*`): Middleware Next.js que verifica sesión + rol `super_admin`.
- **Landing Page** (`/`): Pública. No requiere autenticación. Las consultas de Track & Trace usan APIs públicas rate-limited.

### 4.3 Cierre de Sesión

- El usuario puede cerrar sesión manualmente desde el Perfil (App) o el menú del Panel (Web).
- `supabase.auth.signOut()` invalida el refresh token en el servidor.

## 5. Recuperación de Contraseña

1. El usuario pulsa "Olvidé mi contraseña" en la pantalla de Login.
2. Ingresa su email registrado.
3. Supabase envía un **email con enlace de reseteo** (expiración: 1 hora).
4. El usuario establece una nueva contraseña (mín. 8 caracteres).

## 6. Reglas de Seguridad Transversales

- Todos los endpoints de Supabase están protegidos por RLS. Ver `01_Supabase_Backend/RLS_Policies_Spec.md`.
- Las contraseñas deben tener mínimo **8 caracteres**.
- Los enlaces de invitación tienen expiración de **48 horas** y son de un solo uso.
- Las sesiones inactivas por más de **30 días** requieren re-autenticación.
