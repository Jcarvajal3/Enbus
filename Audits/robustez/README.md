# Auditoría de robustez (03/11/2026)

Rama `claude/affectionate-bohr-vhcmsi`, creada sobre `ux/mejoras-auditoria`. Hubo un informe por zona; cada uno lista los hallazgos con `archivo:línea`, qué se arregló y qué no.

| Zona | Informe |
| --- | --- |
| Base de datos (10 migraciones `20261103000001`–`10`, aplicadas en Supabase) | `base-de-datos.md` |
| Edge functions (las 9 desplegadas) | `edge-functions.md` |
| App móvil | `app-movil.md` |
| Panel de cooperativas | `panel-cooperativas.md` |
| Super admin | `panel-admin.md` |
| Landing, shared, CI y estructura | `landing-shared-estructura.md` |

## Verificación final

- `node shared/generar.mjs --check`: OK. `shared` `npm test`: 17/17.
- EnBusApp: `tsc` y `expo lint` sin errores.
- PanelCooperativas y LandingEnBus: `tsc`, `eslint --max-warnings=0` y `npm run build` OK (Next 16.4.2).
- Pruebas SQL contra la base real (`supabase/tests/robustez/run.sh 01… 02… 03… 05…`): todas `ok`. `04_concurrencia.sh` prueba con dos conexiones simultáneas.
- Advisors de Supabase:
  - seguridad: 106 → 50 (48 son RPC pensadas para el cliente que validan rol y propiedad dentro);
  - rendimiento: 144 → 54 (quedan solo índices sin uso, porque son nuevos).

## Pasos manuales pendientes (los hace el dueño del proyecto)

1. **URGENTE: rotar la clave `service_role`.** Estuvo en el repo público (`supabase/fetch_auth_users.js`, commit `ec060d7`). Hay que:
   - pasar panel, landing y Vault a la clave `sb_secret_…` y la app a `sb_publishable_…`;
   - después, desactivar las claves legacy en Dashboard → Settings → API Keys.
   Para el Vault:
   `select vault.update_secret((select id from vault.secrets where name = 'service_role_key'), 'sb_secret_…');`
2. **Supabase Auth:**
   - Site URL y Redirect URLs (`enbus://auth/callback`, `exp://**`, dominios de Vercel);
   - proveedor Google;
   - SMTP propio;
   - protección de contraseñas filtradas y longitud mínima de 8.
3. **Correo:** `RESEND_FROM` con un dominio verificado en Resend (panel y landing).
4. **WhatsApp:** elegir proveedor. Si es Twilio, cargar `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM` y `TWILIO_CONTENT_SIDS` como secretos de las edge functions.
5. **Push en Android:** `google-services.json` y credenciales FCM V1 en EAS. Variables `EXPO_PUBLIC_*` con `eas env`.
6. **Activar GitHub Actions** (`.github/workflows/ci.yml`).
7. **Probar a mano:**
   - guía PDF desde el panel;
   - baja de cuenta desde la app;
   - impresora Bluetooth real (ahora en paquetes de 180 bytes).
8. **Decisiones de negocio:**
   - cooperativas SUSPENDIDA, PENDIENTE o RECHAZADA ya no venden ni reciben envíos;
   - límite de 30 encomiendas por día y 15 sin entregar por usuario;
   - ciclos de comisión por fecha de aprobación del pago;
   - si un super admin puede suspender a otro;
   - si se exige el dígito verificador del RIF;
   - si se permiten dos viajes de la misma ruta a la misma hora.
