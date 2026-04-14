# App Móvil: Perfil y Configuración

## 1. Objetivo
Pantalla de gestión de cuenta personal del usuario. Accesible desde el ícono de perfil (👤) en la esquina superior derecha del Header.

## 2. Interfaz

### 2.1 Header del Perfil
- Ícono de perfil genérico (👤 con inicial del nombre).
- Nombre completo del usuario.
- Email (no editable, solo visual).

### 2.2 Secciones

#### Datos Personales
| Campo | Editable | Validación |
|---|---|---|
| Nombre Completo | Sí | Mín. 2 caracteres |
| Teléfono | Sí | Formato +58... |
| Cédula / RIF | Sí | Formato V-XXXXXXXX o J-XXXXXXXX |
| Email | No | — |

Botón: **"Guardar Cambios"** (visible solo si hay cambios).

#### Notificaciones
Switches On/Off para cada categoría:

| Categoría | Default |
|---|---|
| Actualizaciones de encomiendas | ✅ On |
| Actualizaciones de boletos | ✅ On |
| Recordatorios de viaje | ✅ On |

Estas preferencias se guardan en `profiles.notif_encomiendas`, `profiles.notif_boletos`, `profiles.notif_recordatorios`.

#### Seguridad
- **Cambiar Contraseña**: Abre flujo de cambio (contraseña actual + nueva contraseña ×2).
- Solo visible si el usuario se registró con Email+Password (no aplica para Google Sign-In).

#### Información
- Versión de la app.
- Términos y condiciones (enlace externo).
- Política de privacidad (enlace externo).

#### Sesión
- Botón: **"Cerrar Sesión"** (rojo, con confirmación).
- Ejecuta `supabase.auth.signOut()`.
- Limpia tokens locales y navega al Auth Stack.

## 3. Vinculación con DB
- **Lee/Actualiza**: `profiles` (propio perfil).
