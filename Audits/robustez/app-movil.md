# Auditoría de robustez — App móvil (`EnBusApp/`)

Zona: `EnBusApp/` (Expo SDK 54, expo-router). No toqué `*.generated.ts` ni la base. Cambios sin commit.

## 1. Bugs y riesgos encontrados (severidad)

| # | Sev. | Dónde | Problema |
|---|------|-------|----------|
| A1 | Alta | `src/utils/supabase.ts:8` | Sin `EXPO_PUBLIC_SUPABASE_URL/ANON_KEY` se lanzaba un error al importar el módulo: en un build de release la app se cierra al abrirla, sin ningún mensaje. |
| A2 | Alta | `src/utils/supabase.ts:12` | La sesión se guardaba en SecureStore, que admite valores de hasta 2048 bytes. Una sesión con los datos de Google suele pasar de 3 KB, así que SecureStore avisa y, según el SDK y el dispositivo, no la guarda: se pierde la sesión al reabrir la app. |
| A3 | Alta | `src/contexts/AuthContext.tsx` (signOut) | `profiles.expo_push_token` no se borraba al cerrar sesión. Si otra cuenta entraba en el mismo teléfono, recibía las push de las dos (con datos del boleto o del envío). |
| A4 | Alta | `app/encomiendas/nueva.tsx` (insert) | Crear una encomienda no era idempotente: si la respuesta se perdía y el usuario reintentaba, se creaban dos envíos. La base ya tiene `uq_encomiendas_idempotencia`, pero la app no mandaba `idempotency_key`. Además la foto se volvía a subir en cada reintento. |
| A5 | Media | `app/boletos/buscar.tsx` (viajes del día) | Se listaban salidas de hoy que ya habían salido: a las 3 p. m. aparecía la de las 6 a. m. Al elegirla, el servidor la rechazaba. |
| A6 | Media | `buscar.tsx`, `SearchForm.tsx`, `encomiendas/nueva.tsx` | Se mostraban salidas o rutas que el servidor no deja comprar: cooperativa no ACTIVA, ruta inactiva o sin precio (`_asegurar_asientos` exige las tres cosas). El usuario elegía y recibía un error. |
| A7 | Media | `buscar.tsx`, `SearchForm.tsx`, `viajes/[id].tsx` | El día de búsqueda usaba la zona horaria del teléfono, pero las horas se muestran en hora de Venezuela. Con el teléfono en otra zona (p. ej. alguien que paga por Zelle desde el exterior) salían salidas de otro día o faltaban algunas. |
| A8 | Media | `src/hooks/useRealtime.ts` | Cada recarga (pull-to-refresh, "Reintentar", UPDATE con embeds) cerraba y volvía a abrir el canal Realtime: se perdían eventos en el hueco y aumentaba la carga del servidor. Tampoco se recuperaban los eventos perdidos en segundo plano o tras una caída del socket. |
| A9 | Media | `useRealtime`, `useEncomiendas`, `(tabs)/boletos.tsx`, `(tabs)/encomiendas.tsx`, `notificaciones.tsx` | Las listas se cortaban en 30 o 50 filas sin forma de ver más. Cada cambio de asiento antes de pagar crea un boleto CANCELADO, así que boletos activos podían quedar fuera de "Mis boletos". |
| A10 | Media | `AuthContext.tsx` | Faltaba `startAutoRefresh`/`stopAutoRefresh` con AppState, que es lo que recomienda Supabase para React Native. |
| A11 | Media | `useEncomiendas.ts` (`fetchData`) | Sin control de respuestas viejas: dos lecturas en vuelo se pisaban, y había `setState` tras desmontar. |
| A12 | Media | `boletos/[id].tsx` (cancelar y calificar), `login.tsx`, `recuperar.tsx`, `revisa-correo.tsx`, `notificaciones.tsx` | El doble toque solo se frenaba con el estado de React, que llega un render tarde. Efectos: segunda cancelación con toast de error tras el éxito, segunda calificación, `signUp` o `resetPasswordForEmail` duplicados (con un límite de 2 correos por hora, el segundo falla), y dos pantallas de detalle apiladas. |
| A13 | Baja | `boletos/[id].tsx` (`totalUsd`) | La suma de precios en float (12,1 + 12,2 = 24,2999…) podía dar un total en Bs y un monto precargado distintos del servidor en un céntimo. |
| A14 | Baja | `boletos/compra/[id].tsx`, `buscar.tsx` (canal del viaje) | Una ráfaga de N eventos (uno por asiento) provocaba N recargas o N llamadas a `fn_asientos_ocupados` por cliente. Con muchos pasajeros mirando la misma salida, se multiplicaba. |
| A15 | Baja | `encomiendas/enviar/[id].tsx`, `recibir/[id].tsx` | El detalle no se actualizaba solo (la taquilla recibe o entrega y se seguía viendo el QR viejo). El historial en "enviar" se cortaba en las 20 filas más antiguas. |
| A16 | Baja | `AuthContext` / cierre de sesión | La caché `cache:*` (boletos, envíos y datos personales) solo se borraba desde el botón de Perfil, no cuando la sesión se cerraba por otra vía (refresh token revocado, cuenta eliminada). |
| A17 | Baja | `cuenta/eliminar.tsx` | `functions.invoke('eliminar-cuenta')` no lanza: devuelve un `FunctionsHttpError` con el cuerpo `{error, hint}` sin leer. El aviso `EB_BAJA_PENDIENTE` nunca se mostraba. |
| A18 | Baja | `package.json` | `expo-file-system/legacy` se importaba sin declarar el paquete; funcionaba solo porque `expo` lo instala como dependencia propia. |
| A19 | Baja | `app.json` | Los textos de permiso de cámara y fotos de iOS salían en inglés (plugin aplicado por defecto) y se pedía el micrófono sin usarlo. |

Lo que verifiqué y está bien:
- **Coherencia con la base.** Revisé todas las consultas contra PostgREST real: los 21 `select` (embeds, hints `pagos!boletos_pago_id_fkey`, `profiles!comprador_id`, `!inner` con filtros) responden 200. Las 13 RPC coinciden con `pg_proc` en nombre y parámetros, y `authenticated` puede ejecutarlas. Las tablas de las suscripciones Realtime están en `supabase_realtime`. El bucket y las edge functions existen.
- **Flujos con buena base.** La lógica de checkout ya era sólida: idempotencia del pago, `EB_TASA_CAMBIO`, liberación de la reserva al salir, offset de la hora del servidor. También PKCE con un solo canje por código, la deduplicación de respuestas push y la fecha de pago en hora de Caracas.

## 2. Qué arreglé

- **A1.** `supabase.ts` exporta `configuracionFaltante` y escribe un `console.error` claro. El cliente se crea con valores provisionales y `app/_layout.tsx` muestra la pantalla "La app no está configurada" con las variables que faltan.
- **A2.** Un adaptador de SecureStore en trozos: 600 caracteres, a lo sumo 1800 bytes, sin cortar pares sustitutos. En la clave queda un marcador con el número de trozos y los trozos se escriben antes que el marcador. Lee los valores antiguos sin trozos, así que no hay que migrar nada. Lo probé con un SecureStore falso que rechaza más de 2048 bytes, con acentos y emoji.
- **A3.** `src/utils/sesionLocal.ts`:
  - `desvincularPushDeEsteTelefono` pone `expo_push_token = null` antes del `signOut`. Si conoce el token de este teléfono, solo lo borra si sigue siendo ese; si no, lo borra igual.
  - Tiene un tope de 3 s y nunca lanza, así que sin red no bloquea el cierre de sesión.
  - `usePushNotifications` anota el token registrado y lo vuelve a registrar con cada sesión, porque el efecto depende de `userId`.
- **A4.** La clave `idempotency_key` se genera una vez por envío. Ante un `23505 uq_encomiendas_idempotencia`, la app busca el envío ya creado por `sender_id + idempotency_key` y lo abre. La ruta de la foto ya subida se reutiliza.
- **A5, A6, A7.**
  - La lista de salidas del día usa `rangoDiaVE` y `gt('fecha_hora_salida', max(inicio del día, ahora))`.
  - En las listas y en el calendario de fechas, `cooperativas!inner` con `estado = ACTIVA`, `rutas.activa = true` y `rutas.precio_pasaje > 0`.
  - Las fechas con salidas se calculan con `fechaVE`.
  - Agregué `limit` a las consultas que no lo tenían (fechas 1000, salidas 200, rutas 50).
  - El enlace `viajes/[id]` pasa el día en hora de Venezuela.
- **A8, A9.** `useRealtime` reescrito:
  - La lectura y el canal van en efectos separados.
  - La caché se lee una sola vez por consulta y se vacía si cambia la consulta (otra cuenta).
  - Relee al volver a primer plano (más de 30 s) y cuando el canal se vuelve a suscribir.
  - Agregué `hayMas`, `cargandoMas` y `cargarMas` (tope de 1000 filas) y `refetch` estable.
  - `useEncomiendas` recibe lo mismo: turno anti-carrera, recarga al reconectar o al volver, y paginación.
  - Mis boletos, Encomiendas y Notificaciones usan `onEndReached`.
- **A10.** `startAutoRefresh`/`stopAutoRefresh` según AppState.
- **A12.** Guardas con `useRef` en cancelar, calificar, login (correo y Google), recuperar, reenviar correo y abrir una notificación.
- **A13.** El total se suma en centavos.
- **A14.** Debounce de 400 a 500 ms y relectura al volver a suscribirse, en compra, en el mapa de asientos y en el detalle del boleto.
- **A15.** Hook nuevo `src/hooks/useRecargaEnVivo.ts` (UPDATE por id, con debounce, reconexión y primer plano), usado en los dos detalles de encomienda. El historial ahora trae hasta 100 filas.
- **A16.** `onAuthStateChange('SIGNED_OUT')` llama a `limpiarCacheLocal()`.
- **A17.** `errorDeFuncion(err)` en `errores.ts` lee `error.context.json()` y lo convierte en `{message: 'EB_*', hint}`, así que `codigoEB` y `humanizeError` funcionan igual que con una RPC. Agregué `EB_BAJA_PENDIENTE` y `eliminar.tsx` muestra su `hint`.
- **A18.** `expo-file-system ~19.0.23` agregado a `package.json`. El lockfile solo cambia en la entrada raíz y `npm ci` pasa.
- **A19.** Plugin `expo-image-picker` con los textos en español y `microphonePermission: false`.

## 3. Qué NO arreglé y por qué

- **Contador de activos de `ActivityContext`.** Sigue contando solo los 30 boletos más recientes. Para que sea exacto haría falta un filtro por estado o un `count`, y `useRealtime` no admite filtros extra. El impacto es bajo: solo afecta al número del badge.
- **Calendario en otra zona horaria.** Con el teléfono fuera de Venezuela, `minimumDate` del calendario sigue en la hora del teléfono. Es un caso marginal.
- **Recarga de páginas.** `cargarMas` vuelve a pedir todas las filas ya cargadas (rango creciente) en lugar de añadir solo la página nueva. Es simple y correcto, y cuesta poco hasta unos cientos de filas.
- **Registro de push en Android.** No puedo arreglarlo desde el código: falta `google-services.json` y las credenciales FCM V1 (ver §6).

## 4. Problemas fuera de mi zona

### Base de datos (para el agente de BD)

1. **`calificaciones` sin protección.** Hoy cualquier usuario autenticado puede:
   - Insertar con cualquier `boleto_id` y cualquier `cooperativa_id`. La política solo comprueba `usuario_id = auth.uid()`.
   - Calificar boletos que no son suyos o que no están en `USADO`, e inflar o hundir el promedio de cualquier cooperativa.
   - Bloquear la calificación de otro pasajero, por el `UNIQUE(boleto_id)`.
   - Cambiar `cooperativa_id` o `boleto_id` con UPDATE, y la cooperativa anterior no se recalcula.

   Arreglo propuesto: un trigger `BEFORE INSERT OR UPDATE` que exija `boletos.comprador_id = auth.uid()` y `estado = 'USADO'`, fije `NEW.cooperativa_id := boletos.cooperativa_id` e impida cambiar `boleto_id`, `cooperativa_id` y `usuario_id` en el UPDATE. Con un trigger la app no cambia. `calcular_calificacion_fn` debería recalcular también `OLD.cooperativa_id`.
2. **Storage `fotos-encomiendas`.** La política "Lectura fotos-encomiendas" deja leer cualquier foto del bucket (salvo `guias/`) a cualquier usuario autenticado. Propuesta: el usuario solo lee `(storage.foldername(name))[1] = auth.uid()::text` o las fotos de encomiendas donde es remitente o destinatario, y el personal las de su cooperativa.
3. **Token de push exclusivo por teléfono.** Propuesta: una RPC `fn_registrar_push_token(p_token text)` `SECURITY DEFINER` que haga `UPDATE profiles SET expo_push_token = NULL WHERE expo_push_token = p_token AND id <> auth.uid()` y luego lo asigne al usuario. Así un token no queda en dos perfiles si el cierre de sesión se hizo sin red. Si se crea, en la app se cambia `usePushNotifications.ts:117` por esa RPC. Aparte: es una sola columna por usuario, así que solo recibe avisos el último dispositivo.
4. **Índices compuestos para las listas de la app.** Ahora hay índices de una sola columna, con ordenación aparte:
   - `boletos(comprador_id, created_at DESC)`
   - `notificaciones_usuario(usuario_id, created_at DESC)`
   - `encomiendas(sender_id, created_at DESC)` y `encomiendas(receiver_user_id, created_at DESC)`
   - `viajes(ruta_id, estado, fecha_hora_salida)`
   - `rutas(ciudad_origen, ciudad_destino)`: `idx_rutas_origen` empieza por `estado_origen` y la app filtra solo por ciudad.
5. **`fn_validar_embarque`.** El `WHERE` con `OR` (`upper(qr_embarque_data) = …`, `'PASS-' || codigo_boleto = …`) impide usar índices: hace un seq scan de `boletos` en cada escaneo. Propuesta: normalizar el código y buscar solo por `codigo_boleto` o por `idx_boletos_codigo_norm`, o indexar `upper(qr_embarque_data)`.
6. **RLS de `viajes` y `rutas`.** Exponen las salidas de cooperativas no ACTIVA y de cualquier estado; la app ahora las filtra. Conviene que la RLS o una vista pública lo haga también (afecta a la landing y a terceros).
7. **Normalización de ciudades en `rutas`.** No hay trigger que la normalice. La búsqueda de la app filtra `rutas.ciudad_origen = 'merida'`: si el panel guarda "Mérida" sin normalizar, la ruta no aparece. Propuesta: un trigger `normalizar_localidad` en `rutas.ciudad_*` y en `sucursales.ciudad`.
8. **Encomiendas a cooperativas inactivas.** `proteger_encomiendas_cliente_fn` no valida que `cooperativa_id` sea una cooperativa ACTIVA con una ruta activa para ese trayecto: un cliente puede crear un envío para una cooperativa suspendida.

### Edge functions

- Nada nuevo. El cuerpo `{error, hint}` de `eliminar-cuenta` ya se lee en la app (A17).

### Configuración de Supabase Auth (la cambia el usuario en el dashboard)

Lo leí de `GET /config/auth`:

- **`uri_allow_list` está vacío y `site_url = http://localhost:3000`.** Los enlaces de confirmar correo y de recuperar contraseña (`enbus://auth/callback?...`) se rechazan y redirigen a localhost: en el móvil los dos flujos están rotos. Hay que añadir `enbus://auth/callback` (y `enbus://**`, más `exp://**` para Expo Go) a Redirect URLs y poner la URL real de la landing como Site URL.
- **`external_google_enabled = false`.** El botón "Entrar con Google" falla siempre.
- **Sin SMTP propio.** `rate_limit_email_sent = 2` por hora, y el servicio integrado solo envía a correos del equipo: con miles de usuarios el registro y la recuperación de contraseña no funcionan. Hay que configurar un SMTP (Resend, SES…) y subir el límite.

## 5. Verificación

- `npm ci`: OK (exit 0).
- `npx tsc --noEmit`: 0 errores.
- `npx expo lint`: 0 errores y 0 avisos.
- `npx expo install --check`: "Dependencies are up to date" (offline, con el mapa local del SDK).
- `npx expo export --platform android`: OK, bundle Hermes de 12,9 MB.
- Los 21 `select` validados contra PostgREST real: todos 200.
- Las firmas de las 13 RPC comprobadas contra `pg_proc`.
- Prueba del adaptador SecureStore en trozos: ida y vuelta correcta, ningún valor supera 2048 bytes, encoge, borra y lee valores antiguos.

## 6. Lo que necesito del usuario

1. **Supabase Auth.** Redirect URLs y Site URL, activar Google (Client ID y secret de Google Cloud con el callback de Supabase) y configurar SMTP propio (ver §4).
2. **Push en Android.** Añadir `google-services.json` (`android.googleServicesFile` en `app.json`) y subir las credenciales FCM V1 con `eas credentials`. Sin esto, `getExpoPushTokenAsync` falla en Android y nadie recibe notificaciones.
3. **Variables de los builds de EAS.** Definir `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_SOPORTE_WHATSAPP` y `EXPO_PUBLIC_SITIO_URL` con `eas env` en los perfiles preview y production. `.env*.local` no se sube y `eas.json` no las define. Sin ellas el build muestra la pantalla "La app no está configurada".
4. **Decisión de producto.** "Cerrar sesión" usa `signOut()` global: cierra la sesión en todos los dispositivos de la cuenta. Si se prefiere cerrar solo en este teléfono, se cambia a `{ scope: 'local' }` en `AuthContext.signOut`.
