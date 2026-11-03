# Pendientes de la fase 3

Rama `ux/mejoras-auditoria`, sin commit. Especificación: `Audits/fase3_spec.md`.

## Estado de la integración

Los tres proyectos compilan, pasan lint y hacen build en verde:

| Comando | Resultado |
|---|---|
| `EnBusApp: npx tsc --noEmit` | 0 errores |
| `EnBusApp: npx expo lint` | 0 errores, 0 avisos |
| `PanelCooperativas: npx tsc --noEmit` | 0 errores |
| `PanelCooperativas: npx eslint` | 0 errores, 0 avisos |
| `PanelCooperativas: npm run build` | OK (36 rutas, incluidas `/cooperativas/reembolsos` y `/admin/encomiendas`) |
| `LandingEnBus: npx tsc --noEmit` | 0 errores |
| `LandingEnBus: npx eslint` | 0 errores, 0 avisos |
| `LandingEnBus: npm run build` | OK (`/`, `/rastrear`, `/registro-cooperativa`) |

Nada se probó contra una base de datos real, en un dispositivo ni en un navegador. Las migraciones `20260720*` solo se validaron con PGlite (W1-DB).

### Ajustes del integrador

- **App**
  - `app/_layout.tsx`: `ayuda` tiene su `Stack.Screen` con `slide_from_bottom`, igual que perfil y notificaciones.
  - `useRealtime`: `refetch()` ahora se resuelve cuando termina la recarga y el hook expone `actualizadoAt`. `notificaciones.tsx` ya no espera 800 ms, y su `StaleBanner` y el de `(tabs)/boletos.tsx` dicen "hace X".
  - `AuthContext.signOut`: si el cierre global falla sin conexión, ya sea con `{ error }` o con una excepción, cierra la sesión localmente.
  - `encomiendas/recibir/[id]`: en `EN_OFICINA_DESTINO`, si el PIN no se puede leer, explica qué hacer en vez de decir "aparecerá cuando la cooperativa reciba el paquete".
- **Panel**
  - Nuevo `src/lib/ciudades.ts` (`formatCiudad`, `formatRuta`). Reemplaza las cinco copias locales (dashboard, viajes, despacho, recepción por lote, venta-flow y reembolsos). Ahora también se usa en recepcion-modal, detalle-sheet y la guía impresa, que mostraban `puerto_la_cruz`.
  - `lib/types/configuracion.ts`: `Sucursal` declara `estado_geografico` y `horario`, y `CooperativaData` declara `estado`. `SucursalGuardada` pasa a ser un alias.
  - `ConfirmDialog.confirmarEscribiendo` acepta `string | string[]`. "Desactivar cooperativa" acepta el nombre o el RIF, como pide la spec.
  - `next.config.ts`: `experimental.serverActions.bodySizeLimit: "3mb"`. Sin esto, los logos de entre 1 y 2 MB fallaban antes de llegar a la acción.
  - `components/ui/field.tsx`: `FieldError` usa `text-destructive-text` (contraste AA).
  - Etiquetas accesibles en inglés traducidas en `ui/breadcrumb.tsx` ("Más") y `ui/sidebar.tsx` ("Mostrar u ocultar el menú").
- **Landing**
  - `/registro-cooperativa`: `page.tsx` es ahora un server component con la metadata "Afilia tu cooperativa" y renderiza el cliente desde `registro-cooperativa.tsx`.
  - `components/ui/sheet.tsx`: el texto sr-only "Close" pasa a "Cerrar".
  - `lib/email.ts`: el asunto pasa a "Completa el registro de tu cooperativa · …" y el botón a "Completar el registro". Los errores internos ahora están en español; el usuario ve el mensaje de la acción.
  - En `ui/button.tsx` y `ui/badge.tsx`, la variante `link` usa texto `foreground` con subrayado amarillo en vez de texto amarillo.

## Pasos manuales (en orden)

1. **Migraciones** en una rama de Supabase o en staging, nunca directo a producción:
   - `20260720000001_fase3_estado_rechazada.sql` va sola. Añade el valor de enum que la 02 ya usa.
   - Luego van 02, 03, 04 y 05. Tras cada una, ejecuta `NOTIFY pgrst, 'reload schema';`.
   - Repite las pruebas de §2.6 contra PostgREST. `t_f3_pol.sql` y `t_email.sql` dependen de los usuarios que crea `t_f3.sql` y deben correr en la misma base, después de ese archivo.
   - Revisa en staging que `handle_new_user`, ahora versionado, sigue creando el perfil en el alta con correo y en el onboarding de empleados.
2. **Publicación Realtime**: confirma que `viajes` y `pagos` están en `supabase_realtime`. Ninguna migración los añade.
   - Sin `viajes`, los asientos ocupados no se actualizan en vivo; solo al entrar al paso 2, tras un conflicto y con "Reintentar".
   - Sin `pagos`, el contador "Pagos por verificar (n)" del panel no se mueve solo.
3. **Supabase Auth**:
   - En Redirect URLs, añade `enbus://auth/callback`, `enbus://**` y `exp://**`.
   - Activa Google, con el redirect `https://<proyecto>.supabase.co/auth/v1/callback`.
   - Comprueba que las plantillas de correo usan `{{ .ConfirmationURL }}`.
4. **Variables de entorno**:
   - App (`.env.local` y EAS): `EXPO_PUBLIC_SOPORTE_WHATSAPP`.
   - Panel: `NEXT_PUBLIC_SOPORTE_WHATSAPP`, `NEXT_PUBLIC_COOPERATIVAS_URL` (enlace del correo del admin; sin ella, el correo sale sin botón) y `RESEND_API_KEY` (sin ella, el admin ofrece "Copiar mensaje").
   - Landing:
     - `NEXT_PUBLIC_COOPERATIVAS_URL`. Sin ella se ocultan "Afilia tu cooperativa" y "Entrar al panel".
     - `NEXT_PUBLIC_SOPORTE_WHATSAPP`.
     - `SUPABASE_URL` o `NEXT_PUBLIC_SUPABASE_URL`, y `SUPABASE_SERVICE_ROLE_KEY`.
     - `RESEND_API_KEY`.
5. **Desplegar el panel y la landing solo después de las migraciones.**
   - Las pantallas de taquilla, recepción y entrega leen columnas de la fase 3 (`origen_registro`, `remitente_*`, `foto_cliente_path`, `foto_omitida_motivo`, `entregada_at`). Sin la 02 y la 04 muestran `ErrorState` (42703).
   - El dashboard, empleados, la invitación, el registro y el admin tienen respaldos para no romperse, pero rechazar, reabrir, descartar, suspender y desbloquear PIN exigen las RPC.
   - Sin las RPC, el rastreo de la landing dice "no disponible" y se ocultan la calculadora y las rutas populares.
6. **Nuevo build de la app (EAS)**, por PKCE y las rutas nuevas `/ayuda` y `/boletos/compra/[id]`. Sigue recomendado `npx expo install expo-crypto` (fase 2). Expo regenera `router.d.ts` al arrancar.
7. Opcional: para el brillo automático del QR, ejecuta `npx expo install expo-brightness` y actívalo en `QRCodeViewer` (hoy ignora `autoMaxBrightness`).
8. **Fotos antiguas**: revisa con `select id, foto_evidencia_url from encomiendas where foto_evidencia_url like 'http%';` y pasa a `foto_cliente_path` las que no siguen el patrón `<sender_id>/…`.
9. **Negocio**:
   - Confirmar la lista de artículos prohibidos (`ARTICULOS_PROHIBIDOS`) y el texto del seguro (3 veces el valor declarado).
   - Confirmar el texto de reembolso al cancelar un boleto: hoy promete "Te devolveremos Bs …" incluso a quien pagó con Zelle.
10. **Pruebas en staging** (spec §8 paso 10), además de:
    - Subir un logo de entre 1 y 2 MB, desde la configuración y desde el admin.
    - Desactivar una cooperativa escribiendo el RIF.
    - Cerrar sesión en la app sin conexión.

## Pendientes abiertos

### Base de datos (no tocada por el integrador)

- **Seguridad, prioridad alta:** `fn_entregar_encomienda` (`20260720000004`) no cuenta el intento fallido. Al lanzar `EB_PIN_INCORRECTO` se revierte el UPDATE del contador.
  - El panel siempre llama antes a `fn_validar_pin_retiro`, que sí bloquea a los 10 intentos.
  - Pero un empleado que llame la RPC directamente puede probar los 10.000 PIN sin que se bloquee.
  - Posible arreglo: exigir que `fn_validar_pin_retiro` haya devuelto válido en la misma transacción o en una ventana corta, o devolver jsonb en vez de lanzar error. Necesita una migración nueva.
- `comisiones_ciclo` no tiene `pago_referencia`. `marcarCicloComoPagado` guarda solo la fecha y avisa que la referencia no se guardó. Sugerencia: `ALTER TABLE public.comisiones_ciclo ADD COLUMN IF NOT EXISTS pago_referencia text;` en una migración `20260720…`. La tabla y el CSV ya la muestran si existe.
- `fn_reembolsos`:
  - Marca `cancelado_por = 'COOPERATIVA'` cuando `motivo_cancelacion` empieza por "Viaje cancelado por la cooperativa". Un pasajero que escriba ese texto aparece como cancelado por la cooperativa; el monto (95 %) no cambia. El arreglo real es una columna `cancelado_por`.
  - `cancelado_at` es `boletos.updated_at`, no el momento exacto de la cancelación.
  - `ruta` sale sin formato. El panel la formatea con `formatRuta`.
- Para encomiendas `TAQUILLA`, `sender_id` es el empleado. Esto afecta a dos funciones:
  - `fn_rechazar_encomienda_origen` notifica al empleado. El panel le pide "Explícale el motivo al cliente".
  - `fn_remitente_de_encomienda` devuelve el perfil del empleado. La app lo compensa con `remitente_*`, pero la RPC debería devolver esos campos.
- La edge function `generar-guia-pdf` no imprime `remitente_*` ni el PIN. En el alta presencial, la guía PDF (botón de la fila o del detalle) muestra al empleado como remitente. La guía térmica o del navegador del diálogo de alta sí imprime los datos correctos.
- `fn_rutas_populares` cuenta `salidas_proximas` sin filtrar cooperativas `ACTIVA`, así que puede inflar el número.
- Las columnas `profiles.cedula_rif` y `telefono` tienen `UNIQUE` sobre el texto crudo. Las filas antiguas en otro formato (`V12345678`, `04141234567`) no chocan con las nuevas (`V-12345678`, `0414-1234567`). Hace falta una migración de normalización o un índice único sobre el valor normalizado.
- Storage: solo el super admin escribe en el bucket `logos-cooperativas`. "Cambiar logo" de `admin_cooperativa` fallará con RLS (hoy con un mensaje humanizado) hasta que exista una política para la carpeta `<cooperativa_id>/`.
- `invitaciones` no tiene política UPDATE. Renovar y revocar usan el cliente de servicio después de comprobar la pertenencia. Si se prefiere RLS, hace falta una migración.
- El motivo de suspensión de un usuario solo queda en `auth app_metadata` (`suspension_motivo`, `suspension_at`, `suspension_por`). No hay columna ni auditoría en `profiles`.
- Días hábiles de devolución: el panel los calcula en hora de Venezuela y el SQL con la fecha de la base (UTC). Pueden diferir en un día cerca de medianoche.

### App

- `buscar.tsx`: si se toca "Apartar asientos" mientras `usePerfil` todavía carga, no se abre `CompletarPerfilSheet`. El hueco es pequeño: `PasajerosForm` y el checkout exigen nombre y cédula válidos en cada asiento.
- `StepIndicator` no muestra los nombres de los pasos ("Salida · Asientos · Pasajeros · Pago" va en el subtítulo). Para mostrarlos haría falta una prop `labels` en `ui/ScreenHeader`.
- `canjearCodigo` devuelve ok cuando el canje falla pero ya hay sesión (es necesario por la doble entrega en Android). Alguien con sesión que abra un enlace vencido no ve el error. Es un riesgo aceptado.
- En `nueva.tsx`, la sucursal de entrega es solo informativa: el trigger `proteger_encomiendas_cliente_fn` borra `sucursal_origen_id`.
- `storage.getSignedPhotoUrl` sigue exportada como `@deprecated` y nadie la usa. Se puede borrar.

### Panel y admin

- `verificarCorreoRegistro` es una server action pública que revela si un correo tiene cuenta en EnBus. La spec la pide (`fn_email_registrado`); conviene limitar la frecuencia.
- La bandeja de reembolsos carga sus datos desde el cliente con una server action (`listarReembolsos`). Funciona, con `ErrorState` y "Reintentar", pero el primer render llega vacío y con spinner.
- `invite/[token]`: si el servidor responde con un error (por ejemplo, contraseña débil), React 19 reinicia el formulario no controlado.
- Cancelar un viaje con `EB_PAGOS_PENDIENTES`: se ven a la vez el error en línea y el aviso "Ir a Pagos por verificar", que se repiten un poco.
- Incidencias: el código del boleto relacionado no es un enlace, porque el admin no tiene página de detalle de boleto.
- `ScanInput` borra el campo cuando la búsqueda no encuentra nada, así que hay que volver a escribir el código.
- `src/components/landing/*` ya no la usa el panel (LP-09). Se puede borrar.
- `hooks/use-encomiendas-realtime.ts` depende de `onUpdate`. Quien lo use debe pasar un callback estable; los consumidores actuales ya lo hacen.

### Landing

- `reenviarInvitacion`: el límite de una invitación por RIF cada 5 minutos no es atómico, y las invitaciones anteriores sin usar siguen válidas. Se podrían revocar con `revocada_at` al crear la nueva.
- Sin `RESEND_API_KEY`, el reenvío crea la invitación pero dice "No pudimos enviar el correo". El mensaje es correcto: el correo no salió.
