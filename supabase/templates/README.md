# Plantillas de correo de Supabase Auth

Generadas por `node shared/correos-auth.ts` con el diseño de `shared/correo.ts` (el mismo de
los correos del panel y de los avisos al pasajero). **No editar a mano:** cambia el script y
vuelve a generarlas.

`supabase/config.toml` las usa en local. En producción hay que pegarlas en
**Supabase › Authentication › Emails**:

| Pestaña en Supabase | Archivo | Asunto |
|:---|:---|:---|
| Confirm signup | `confirmacion.html` | Confirma tu correo en EnBus |
| Reset password | `recuperacion.html` | Restablece tu contraseña de EnBus |
| Change email address | `cambio-correo.html` | Confirma tu nuevo correo en EnBus |
| Magic link | `enlace-magico.html` | Tu enlace para entrar a EnBus |
| Invite user | `invitacion.html` | Te invitaron a EnBus |
| Reauthentication | `reautenticacion.html` | Tu código de verificación de EnBus |
| Password changed (Security notifications) | `aviso-contrasena.html` | Cambiaste tu contraseña de EnBus |
| Email address changed (Security notifications) | `aviso-correo.html` | Cambiaste el correo de tu cuenta de EnBus |

Para cada una: abre la pestaña, pega el asunto, cambia el editor a **Source**, pega el
contenido completo del `.html` y guarda.
