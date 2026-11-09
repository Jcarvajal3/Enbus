# Notificaciones push del panel (Web Push)

Rama `qa/mejoras-panel-app`. Avisa al personal de la cooperativa (admin y taquilleros) cuando un cliente reporta desde la app un pago digital por verificar (boletos o encomienda). Al tocar el aviso se abre «Pagos por verificar» con ese pago (`/cooperativas/pagos?id=<pago>`). **Nada de esto está aplicado ni desplegado todavía, ni probado en un dispositivo.**

## Cómo funciona

1. **Evento.** `fn_checkout_boletos` (un pago por compra, aunque tenga varios boletos) y `fn_registrar_pago_encomienda` (también al volver a reportar tras un rechazo) insertan en `pagos` una fila `DIGITAL` sin verificar ni rechazar. El disparador `zz_push_pago_por_verificar` (AFTER INSERT) la encola en `panel_push_cola` (un aviso por pago, `UNIQUE (pago_id, tipo)`), solo si la cooperativa tiene algún equipo suscrito. Si algo falla, el pago se guarda igual.
2. **Envío inmediato.** El mismo disparador llama a la edge function `push-panel` con `pg_net` (la petición sale después del COMMIT) usando `project_url` y `service_role_key` del vault, como los demás cron HTTP.
3. **Respaldo.** El cron `procesar_push_panel` (cada minuto) llama a la función solo si quedan avisos pendientes.
4. **Función `push-panel`.** Reclama la cola con `fn_tomar_push_panel` (`FOR UPDATE SKIP LOCKED` + reserva de 2 min), arma el texto («Pago por verificar» · «2 boletos · Bs 1.250,00 · María G.»), cifra el mensaje para cada equipo (VAPID ES256 + `aes128gcm`, con WebCrypto, sin dependencias: `supabase/functions/push-panel/webpush.ts`, verificado contra `http_ece`, la librería que usa `web-push`) y guarda el resultado con `fn_resultado_push_panel`: borra las suscripciones con 404/410, cuenta fallos (10 seguidos = se borra) y reintenta con espera si ningún equipo lo recibió por un fallo transitorio (máx. 6 intentos o 2 h).
5. **Service worker** (`public/sw.js`, caché `v4`). `push` muestra el aviso con `/icon-192.png`; varios seguidos se agrupan en uno («3 pagos por verificar», `tag` `pagos-por-verificar`, sin contar dos veces el mismo pago). Al abrir «Pagos por verificar» (o volver a esa pestaña) el panel cierra esos avisos (`components/push/cerrar-avisos-pagos.tsx`), para que el siguiente no sume pagos ya resueltos; y un aviso de más de 2 h tampoco se suma. `notificationclick` enfoca la ventana del panel abierta (prefiere la que ya está en Pagos) y la lleva al pago, o abre una nueva. `pushsubscriptionchange` vuelve a suscribirse.
6. **Panel.** «Impresora y lector» → tarjeta «Notificaciones»: activar (el permiso se pide solo con ese clic), desactivar, enviar una de prueba (local) y estados: activadas / bloqueadas (con pasos para permitirlas) / no soportado / iPhone sin instalar (con pasos) / sin configurar. Con el panel instalado, una invitación única por equipo (aviso breve con «Activar» / «Ahora no»). Al abrir el panel, si el navegador ya tenía la suscripción, se vuelve a guardar para la sesión actual (otra persona pudo entrar en el mismo equipo).

Destinatarios: suscripciones de perfiles `admin_cooperativa` y `taquillero` de la cooperativa del pago, sin eliminar ni desactivados (`auth.users.banned_until`). Solo se envía a servicios de push conocidos (FCM, Mozilla, Apple, Windows): la base y la función rechazan otros endpoints.

## Pasos manuales

1. **Generar las claves VAPID** (una sola vez; guárdalas en el gestor de contraseñas):

   ```bash
   npx web-push generate-vapid-keys
   ```

   Da una «Public Key» (87 caracteres) y una «Private Key» (43). Si se cambian después, cada equipo tiene que volver a abrir el panel (se vuelve a suscribir solo) o activarlas de nuevo.

2. **Aplicar la migración** `supabase/migrations/20261109000004_push_panel.sql` (después de las `20261109000001`–`03`). Requiere los secretos `project_url` y `service_role_key` en el vault (ya existen para los otros cron).

3. **Secretos de la función:**

   ```bash
   supabase secrets set VAPID_PUBLIC_KEY=<Public Key> VAPID_PRIVATE_KEY=<Private Key> VAPID_SUBJECT=mailto:soporte@<dominio>
   ```

   `VAPID_SUBJECT` debe empezar por `mailto:` o `https://` (Apple rechaza los avisos sin un contacto válido).

4. **`supabase/config.toml`** — añadir (lo hace quien tenga ese archivo):

   ```toml
   [functions.push-panel]
   enabled = true
   # Interna: la invocan el disparador de pagos (pg_net) y pg_cron con la service role (vault).
   # verify_jwt = true es obligatorio (ver _shared/supabase.ts, esServiceRole).
   verify_jwt = true
   import_map = "./functions/push-panel/deno.json"
   entrypoint = "./functions/push-panel/index.ts"
   ```

5. **Desplegar la función:** `supabase functions deploy push-panel`.

6. **Vercel (panel):** variable `NEXT_PUBLIC_VAPID_PUBLIC_KEY` = la misma Public Key, en Production (y Preview si se prueba ahí). Se incrusta al compilar: **hay que volver a desplegar** después de crearla.

## Cómo probarlo

1. En el panel publicado (el service worker solo se registra en producción o con `NEXT_PUBLIC_SW_ENABLED=true`, y Push exige HTTPS o `localhost`), entra como taquillero → «Impresora y lector» → «Activar notificaciones» → «Enviar una de prueba». Debe aparecer el aviso y, al tocarlo, abrir Pagos.
2. `select * from panel_push_suscripciones;` debe tener la fila del equipo.
3. Desde la app, reporta un pago de boleto con Pago Móvil. En segundos debe llegar «Pago por verificar». Revisa `panel_push_cola` (`procesado = true`, `enviados`) y los logs de `push-panel`.
4. Reporta otro pago sin tocar el primer aviso: debe quedar uno solo, «2 pagos por verificar».
5. Desactiva en el equipo: la fila desaparece. Bloquea el permiso en el navegador: la tarjeta lo muestra con los pasos.
6. iPhone (iOS 16.4+): Safari → Compartir → «Añadir a pantalla de inicio» → abrir desde el ícono → activar.

## Limitaciones

- **iPhone/iPad:** solo con el panel instalado en la pantalla de inicio e iOS 16.4 o posterior. En Safari sin instalar la tarjeta explica cómo instalarlo.
- **Permiso por equipo y por navegador:** hay que activarlas en cada teléfono o computadora. Si la persona las bloquea, solo se pueden volver a permitir desde la configuración del navegador o del sistema (la tarjeta da los pasos).
- **Navegador cerrado:** en computadora, Chrome/Edge tienen que estar abiertos (en segundo plano basta); en Android llegan con la app cerrada. Si el equipo está apagado, el servicio de push guarda el aviso 12 h.
- **Cerrar sesión no borra todavía la suscripción** (ver abajo): el equipo sigue recibiendo los avisos de esa cooperativa hasta que otra persona inicie sesión en él (se reasigna) o se desactiven. Los avisos no llevan datos sensibles (tipo, monto y nombre + inicial del cliente).
- El `badge` usa `/icon-192.png`; en Android conviene un ícono monocromo con transparencia (p. ej. `/badge-72.png`) para la barra de estado.

## Pendiente fuera de esta tarea (otros archivos)

- **Cerrar sesión** (`src/components/app-sidebar.tsx`): antes de `signOut`, `await olvidarPushDeEsteEquipo()` de `@/components/push/push-navegador` (nunca lanza y tarda como mucho 3 s).
- **`supabase/config.toml`:** bloque del paso 4.
- **Resumen (`dashboard`)**, opcional: una tarjeta discreta que lleve a «Impresora y lector» cuando `usePushPanel().estado === "desactivadas"`. Hoy la invitación es el aviso único del panel instalado.
