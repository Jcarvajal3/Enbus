# Pendientes de la fase 4

Rama `ux/mejoras-auditoria`. Especificación: `Audits/fase4_spec.md`. Con esta fase el plan de 60 mejoras queda implementado.

## Estado de la integración

Los tres proyectos compilan, pasan lint y hacen build (tabla en `ESTADO_IMPLEMENTACION.md`). Las reglas nuevas de lint (`no-restricted-syntax` para colores sueltos y las de `jsx-a11y`) ya están en `error` en panel y landing, con 0 avisos. Las migraciones están aplicadas en Supabase y las edge functions desplegadas. **Nada se probó todavía en un dispositivo ni en un navegador contra la base real.**

### Lo que hizo el integrador

- **Supabase:** comprobó que las fases 2 y 3 no estaban aplicadas y aplicó, en orden y sin errores, `20260719000001`–`05`, `20260720000001`–`05`, `20260721000001`–`04` y al final la `20260719000006` (antes, `grep` sin escrituras directas a `boletos`/`pagos` en ningún cliente). `NOTIFY pgrst` tras cada una. Registró en el historial las migraciones `20260503`–`20260718`, que ya estaban aplicadas a mano. Desplegó las 9 edge functions.
- **`actualizar-tasa-bcv`:** respondía 401 desde pg_cron aunque la clave del vault era la `service_role` correcta (en proyectos con las API keys nuevas, `SUPABASE_SERVICE_ROLE_KEY` del runtime no coincide con la legacy). Ahora `verify_jwt = true` (la pasarela verifica la firma) y la función exige el rol `service_role` en los claims. Verificado: 200 y tasa guardada.
- `supabase/config.toml`: bloque `[functions.eliminar-cuenta]`.
- Landing `lib/estados.ts` (`CLASES_TONO`) pasado a tokens; `components/ui/spinner.tsx` del panel con `motion-safe:`; comentario obsoleto en `src/app/page.tsx` del panel; `boletos/[id]` y `boletos/compra/[id]` de la app con `formatDuracion` ("8 h 30 min").

## Desviaciones de la spec (decididas por los clusters)

**Base de datos**
- Migración nueva `20260721000004_fase4_guias_privadas.sql`: el bucket `fotos-encomiendas` lo puede listar cualquier usuario autenticado y la guía PDF ahora lleva el PIN. `generar-guia-pdf` sube a `guias/<cooperativa_id>/` y una política restrictiva deja leer esa carpeta solo al personal de esa cooperativa y al super admin.
- `eliminar-cuenta` devuelve `hint` además de `error`. Etiquetas de tarifas en el Glosario: «Vigente / Programada / Anterior».

**Shared**
- `tokens.generated.ts` exporta también `palette`; `formatters.ts` de la app reexporta fecha, duración y ciudad. `formatCedula` formatea el RIF J/G/C como `J-12345678-9`.
- Textos de estado unificados con la app: `success-text` `#147638`, `warning-text` `#A34B08` (cambio leve de tono en el panel).

**App**
- Cédula del pasajero con V, E **y P** (pasaporte), para no bloquear a extranjeros.
- En primer plano, la push no muestra el banner del sistema (solo el toast con «Ver»), para no duplicar.
- `CalendarModal` elige con un toque también en la fecha de pago de `PaymentFlow`. `Field` en tono `light` tiene borde visible en reposo (afecta a todos los formularios).
- «Marcar todo como leído» va en una franja bajo la cabecera (en 360 pt cortaba el título). En eliminar cuenta, la casilla «Entiendo que no se puede deshacer» hace de confirmación.
- Solo se guardan como recientes las búsquedas de viaje (no las de encomienda).

**Panel**
- `ScanInput` tiene `onError` para que la pantalla decida el aviso (un solo sonido). Taquilla de boletos suena al confirmar el embarque, no al escanear.
- Entrega: además de volver al paso del PIN con `EB_PIN_NO_VALIDADO`, muestra «Entrega antes de las …» y pide el PIN otra vez si faltan menos de 30 s.
- `/cooperativas/hardware` vive en `(panel)/hardware` (misma URL, con el layout del panel).
- «Hoy» en viajes incluye los EN_CURSO de días anteriores (para marcar su llegada); `?fecha=` tiene prioridad sobre la pestaña; las salidas ya pasadas no se crean; «Marcar llegada» pide confirmación.
- `ve-fields.tsx` mantiene su propia máscara de teléfono y separación de cédula: se comportan mejor al borrar que las de `shared/ve.ts`.
- `connectivity-banner`: «Sin conexión a internet. No podrás guardar cambios hasta que vuelva la conexión.» (decía «Sincronizando…» sin sincronizar nada).

**Admin**
- Solo Ingresos, Comisiones, Encomiendas y Boletos llevan delta frente a ayer (los demás son conteos de estado sin histórico). Con ayer en 0: «▲ Ayer: 0».
- La búsqueda de usuarios no busca por correo (el correo vive en Auth, no en `profiles`). La de incidencias filtra en el cliente sobre las 500 más recientes.

**Landing**
- La revocación de invitaciones anteriores va después de enviar el correo (nadie se queda sin enlace si el envío falla). Si falta la RPC de límites, se usa la comprobación antigua como respaldo.
- La imagen OG usa la fuente por defecto: `RoobertVF.ttf` (740 KB) supera el límite de 500 KB de `next/og`.
- Variable nueva opcional `NEXT_PUBLIC_SOPORTE_CORREO`.

## Pasos manuales (en orden)

1. **Supabase Auth** (Dashboard → Authentication). Hoy `site_url` es `http://localhost:3000`, no hay ninguna Redirect URL y Google está apagado, así que la confirmación de correo y el «restablecer contraseña» de la app terminan en localhost.
   - **URL Configuration → Site URL:** la URL pública del panel de cooperativas (o la landing mientras tanto).
   - **Redirect URLs:** `enbus://auth/callback`, `enbus://**`, `exp://**`, `https://enbus-hazel.vercel.app/**` y `https://<dominio-del-panel>/**`.
   - **Providers → Google:** activarlo con su Client ID y Secret; redirect `https://tydpnvajwfzcsxsowctp.supabase.co/auth/v1/callback`.
   - **SMTP propio** (Resend u otro): el SMTP de Supabase por defecto solo envía unos pocos correos por hora.
2. **Variables de entorno**
   - App (`.env.local` y EAS): `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_SOPORTE_WHATSAPP`, `EXPO_PUBLIC_SITIO_URL=https://enbus-hazel.vercel.app`.
   - Panel (Vercel): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SOPORTE_WHATSAPP`, `NEXT_PUBLIC_COOPERATIVAS_URL`, `NEXT_PUBLIC_SITIO_URL=https://enbus-hazel.vercel.app`, `RESEND_API_KEY`.
   - Landing (Vercel): `NEXT_PUBLIC_SUPABASE_URL` (o `SUPABASE_URL`), `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_COOPERATIVAS_URL`, `NEXT_PUBLIC_SOPORTE_WHATSAPP`, `NEXT_PUBLIC_SITIO_URL=https://enbus-hazel.vercel.app`, `RESEND_API_KEY` y, opcional, `NEXT_PUBLIC_SOPORTE_CORREO`.
3. **Desplegar** panel y landing desde esta rama (o tras fusionarla) y hacer un **build nuevo de la app en EAS** (rutas `/cuenta/*`, PKCE, push). Recomendado `npx expo install expo-crypto`.
4. **Pruebas** (§8 paso 10 de `fase4_spec.md`), además de las de fases anteriores:
   - Entrega con PIN validado hace más de 15 min; un empleado no puede usar la validación de otro.
   - Push que abre el boleto o la encomienda, con la app cerrada y abierta.
   - Eliminar una cuenta con un boleto activo y sin actividad; cambiar y crear contraseña.
   - Editar la hora de un viaje con pasajeros (llega el aviso); marcar llegada; imprimir el manifiesto.
   - Programar una tarifa y verla activarse; registrar el pago de una comisión con método y referencia.
   - Asientos que se actualizan solos en dos teléfonos; contador «Pagos por verificar» que se mueve solo.
   - Impresora que se reconecta al recargar el panel; sonido del escáner; ancho de papel 58/80 mm.
   - Logo subido por el admin de la cooperativa; guía PDF con el PIN visible solo para el personal.
5. **Google Play Console:** URL de privacidad `https://enbus-hazel.vercel.app/privacidad`, URL de eliminación de cuenta `https://enbus-hazel.vercel.app/eliminar-cuenta` y el formulario de seguridad de los datos.
6. **Revisión legal** de `/terminos` y `/privacidad`; al aprobarlos, quitar la nota «Este texto está en revisión legal.».
7. **Decisiones de negocio** (documentadas, sin implementar): texto del reembolso a quien pagó con Zelle (hoy «Te devolveremos Bs …»); lista de artículos prohibidos y texto del seguro (3 veces el valor declarado); si un cambio de hora hecho por la cooperativa da derecho a reembolso del 100 % (hoy el aviso dice «escríbele a la cooperativa»).
8. **Datos:** confirmar con cada cooperativa que `rutas.precio_pasaje` está en USD (revisar los mayores de 200); revisar RIF antiguos sin dígito verificador; pasar a `foto_cliente_path` las fotos antiguas guardadas como URL.
9. **Opcionales:** convertir `RoobertVF.ttf` a woff2 con subconjunto latino; `npx expo install expo-brightness` para el brillo del QR; quitar `next-themes` de `LandingEnBus/package.json` (ya no se usa); añadir `node shared/generar.mjs --check` y los lint al CI cuando exista.

## Pendientes abiertos (no bloquean)

- `fn_reembolsos` deduce `cancelado_por` del texto del motivo y usa `updated_at` como fecha de cancelación (§6 de la spec, no entra).
- Días hábiles de devolución en UTC en SQL y en hora VE en el panel (pueden diferir cerca de medianoche).
- «Mis boletos» ordena las 30 filas que carga `useRealtime`, que se piden por `created_at`: con muchos boletos, uno antiguo con salida próxima podría no aparecer arriba.
- `PressableScale` no acepta `accessibilityRole="checkbox"`; la casilla de eliminar cuenta usa `Pressable`.
- Carrera poco probable en eliminar cuenta: si la revisión de `AuthContext` termina después de `limpiarAvisoSesion()`, el login mostraría también «Esta cuenta fue eliminada.».
- `encomiendas/nueva.tsx` todavía pasa `initial` a `EntityCard` (se ve la píldora con la inicial).
- La búsqueda de usuarios del admin no encuentra por correo.
