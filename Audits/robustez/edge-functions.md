# Auditoría de robustez — Edge functions

Zona: `supabase/functions/*` (9 funciones + nuevo `_shared/`) y bloques `[functions.*]` de `supabase/config.toml`.
Las 9 funciones quedaron **desplegadas** en `tydpnvajwfzcsxsowctp` (versiones actuales: generar-guia-pdf 6, calcular-costo-encomienda 6, calculadora-publica 5, procesar-notificaciones-pendientes 5, track-and-trace 4, enviar-push 4, enviar-whatsapp 4, actualizar-tasa-bcv 3, eliminar-cuenta 2).

Dato clave del entorno (comprobado con una función temporal ya borrada): en el runtime `SUPABASE_SERVICE_ROLE_KEY` es la clave nueva `sb_secret_…` y `SUPABASE_ANON_KEY` es `sb_publishable_…`; pg_cron manda el JWT legacy `service_role` del vault. Con `verify_jwt = true` la pasarela valida la firma de los JWT y rechaza claves `sb_` inexistentes, pero **deja pasar la publishable**. Por eso las funciones internas ahora comprueban la clave/rol ellas mismas.

## 1. Bugs y riesgos encontrados (líneas del código original)

| Sev. | Dónde | Problema |
|---|---|---|
| **Crítica** | `enviar-push/index.ts:9-24` | Sin autorización: cualquiera con la clave pública (anon/publishable) podía mandar push con texto arbitrario a cualquier `user_id` y escribir en su bandeja (phishing). Comprobado en vivo antes del arreglo (404 "Usuario no encontrado" con la anon key). |
| **Crítica** | `enviar-whatsapp/index.ts:9-35` | Sin autorización y **simulado con `Math.random()`**: el ~97 % de las veces respondía `enviado: true` sin enviar nada, y el panel decía "Le reenviamos el PIN por WhatsApp". Además guardaba el **PIN en claro** en `notificaciones_log.contenido` (l. 70) y lo escribía en logs con el teléfono (l. 35). |
| Alta | `procesar-notificaciones-pendientes/index.ts:30-35,96` | Sin reclamo atómico: dos ejecuciones solapadas (cron cada minuto, pg_net corta a los 5 s) leían las mismas 50 filas `procesado = false` → push duplicados. Además una llamada HTTP a `enviar-push` por aviso (50 invocaciones + 50 lecturas de perfil + 50 POST a Expo en serie). |
| Alta | `procesar-notificaciones-pendientes/index.ts:20-23` | Solo exigía que hubiera cabecera `Authorization`: cualquiera con la clave pública podía dispararla. |
| Alta | `enviar-push/index.ts:55-71` | Sin timeout en el fetch a Expo, sin lotes, sin leer los tickets: `pushSent = true` aunque Expo devolviera error; nunca se limpiaba un token `DeviceNotRegistered`; sin recibos. |
| Alta | `generar-guia-pdf/index.ts:80-112` | Cualquier usuario con acceso RLS (remitente/destinatario) podía generar guías: cada llamada **subía un PDF nuevo** (`…_guia_${Date.now()}.pdf`, l. 183) → almacenamiento sin tope por abuso o reimpresiones. |
| Media | `generar-guia-pdf/index.ts:160-161` | QR pedido a `api.qrserver.com` sin timeout (cuelga la función) y enviando el código de seguimiento a un tercero. |
| Media | `calcular-costo-encomienda/index.ts:117-136` | Lógica duplicada de la RPC con `UPDATE` directos: saltaba `fn_confirmar_recepcion_origen` (sucursales origen/destino, idempotencia, `FOR UPDATE`) y la fórmula podía divergir; errores siempre 500. |
| Media | `track-and-trace/index.ts:73,63` | Devolvía `nota` del historial (texto libre interno) y buscaba el código con `=` exacto (mayúsculas/espacios fallaban). |
| Media | `calculadora-publica/index.ts:79-89`, `track-and-trace` | Fórmula/consulta propia distinta de la landing (`fn_cotizar_envio_publico`): incluía rutas de cooperativas no activas y normalizaba distinto. |
| Media | `calculadora-publica:4-16`, `track-and-trace:4-16` | Rate limit en un `Map` por isolate: inútil con varias instancias, crece sin límite (fuga de memoria) y tomaba `x-forwarded-for` completo (con proxies). |
| Media | todas | Sin límite de tamaño ni validación de tipos del cuerpo; `req.json()` inválido → 500 con el mensaje interno; respuestas de error sin `Content-Type` ni el formato `error` + `hint`; OPTIONS respondía 200 "ok" sin `Allow-Methods`. |
| Media | `actualizar-tasa-bcv/index.ts:81-88` | Sin reintentos; aceptaba cualquier número > 0 (un 0,0001 o 1e12 de la fuente se guardaba si no había tasa previa) y fechas viejas. |
| Baja | todas (`deno.json`, imports) | `jsr:@supabase/functions-js@^2` sin fijar; `supabase-js@2.39.0` (dic. 2023) y `pdf-lib` vía esm.sh. |
| Baja | `eliminar-cuenta/index.ts:82-83` | `catch` devolvía `error.message` crudo; aceptaba cualquier token que `getUser` resolviera. |

## 2. Qué se arregló y cómo

- **`_shared/` nuevo** (lo empaqueta la CLI en cada función; verificado en el deploy):
  - `http.ts`: CORS con `Allow-Methods`/`Max-Age`, preflight 204, 405 si no es POST, `leerJson` con tope (16 KB por defecto, 2–4 KB en las públicas) → 413/400, validadores (`esUuid`, `texto`, `numero`), IP real (`cf-connecting-ip`), 500 genérico `EB_ERROR_INTERNO` (detalle solo al log), `fetchConReintentos` (timeout + backoff con jitter en red/429/5xx).
  - `supabase.ts`: clientes (admin reutilizado por isolate, usuario con su JWT), `esServiceRole` (acepta `sb_secret` del runtime con comparación de tiempo constante o JWT con `role = service_role`; documentado que exige `verify_jwt = true`), `usuarioDelToken` (exige `role = authenticated` + `auth.getUser`), `aplicarLimite` sobre `fn_consumir_limite` (compartido entre instancias) con respaldo en memoria acotado, y `respuestaErrorRpc` (EB_* → 401/403/404/409/400/503 con el `hint` del servidor).
  - `push.ts`: envío a Expo en **lotes de 100**, perfiles leídos en bloque (100 ids por consulta), bandeja escrita en un solo insert, preferencias, validación de formato del token, recorte de título/cuerpo, `channelId`/`priority`, `EXPO_ACCESS_TOKEN` opcional; tickets: `ok` → ENVIADO, `DeviceNotRegistered` → **borra el token** (solo si sigue siendo el mismo), `MessageRateExceeded` → reintentar; log en un solo insert. `revisarRecibos` consulta `getReceipts` (15 min–24 h) si existen las columnas del punto 4A; si no, no hace nada.
- **enviar-push**: solo service role (anon/publishable → 401 `EB_SIN_PERMISO`); validación; usa `push.ts`. Mismo contrato para el panel (`{ enviado }`).
- **procesar-notificaciones-pendientes**: solo service role; reclama con `fn_tomar_notificaciones_pendientes` (la que añade el agente de BD en `20261103000004`, `FOR UPDATE SKIP LOCKED` + `tomada_hasta`), y **mientras no exista** usa un `UPDATE … SET procesado = true WHERE id IN (…) AND procesado = false RETURNING` (cada fila la toma una sola ejecución; vuelve a re-probar la RPC cada 5 min). Hasta 5 lotes de 100 en ≤ 25 s; fallo transitorio → reintento con espera exponencial (1, 2, 4… min; tope 8 intentos o 24 h); si la bandeja ya se escribió, el reintento lleva `sin_bandeja: true` (sin duplicados). Ya no invoca `enviar-push` por HTTP.
- **enviar-whatsapp**: solo service role; teléfono a E.164 (formatos VE), plantillas conocidas con variables obligatorias; envío real por **Twilio** (WhatsApp con 1 reintento + respaldo SMS) solo si están los secretos; si no, `enviado: false` + `reason` (el panel ya muestra "No pudimos enviar el WhatsApp…"); límite 5/hora por teléfono; el PIN se guarda enmascarado (`••••`) en el log.
- **actualizar-tasa-bcv**: 3 intentos con backoff; acepta número o texto con coma; rango plausible 0,01–10.000.000 Bs/USD; rechaza tasas con más de 10 días; `EB_TASA_INVALIDA`/`EB_TASA_SOSPECHOSA` → 422; errores con `error` + `hint`.
- **track-and-trace**: usa `fn_rastrear_encomienda_publico` (misma que la landing: sin notas, sin PIN/cédula/teléfono/nombres, sin distinguir mayúsculas); valida formato y tamaño; 30/min por IP vía `fn_consumir_limite`. Mismo formato de respuesta (sin `nota`).
- **calculadora-publica**: usa `fn_cotizar_envio_publico` (solo cooperativas activas); devuelve los campos de siempre con la opción más barata + `opciones`; 60/min por IP; errores EB_* (`EB_PESO_INVALIDO`, `EB_SIN_RUTA`…). Se quitó `dimensiones_max_referencia` (ningún cliente la usaba).
- **calcular-costo-encomienda**: delega en `fn_cotizar_encomienda` (preview) y `fn_confirmar_recepcion_origen` con el JWT del empleado; mismo contrato (`costo`, `costo_calculado`, `estado`, `moneda`) + `costo_bs`/tasa.
- **generar-guia-pdf**: solo personal (`taquillero`/`admin_cooperativa`) de la cooperativa de la encomienda o `super_admin` (403/404 si no); QR dibujado localmente con `qrcode-generator` (verificado: el PNG renderizado se decodifica como `EB-260609-64257`); ruta fija `guias/<coop>/<tracking>_guia.pdf` con `upsert` (reimprimir no acumula archivos).
- **eliminar-cuenta**: solo el usuario del JWT (`role = authenticated`), 502 `EB_BAJA_PENDIENTE` si Auth falla, `bajas_cuenta` solo se marca si aún no lo estaba, errores sin detalle interno.
- **Dependencias fijadas**: `npm:@supabase/supabase-js@2.110.3` (la misma que la landing), `jsr:@supabase/functions-js@2.110.3`, `npm:pdf-lib@1.17.1`, `npm:qrcode-generator@2.0.4`. Sin esm.sh. Sin secretos en el código.
- **config.toml**: comentarios por función con quién la llama y por qué `verify_jwt = true` es obligatorio (todas siguen en `true`).

## 3. Qué NO se arregló y por qué

- **Pruebas en vivo con sesión de usuario** (eliminar-cuenta, generar-guia-pdf, calcular-costo-encomienda): solo se probaron OPTIONS, sin auth, anon, service role (todas → 401 `EB_NO_AUTENTICADO`). No hay contraseñas de prueba y no se firmaron JWT a mano. El PDF/QR se probó en local con el mismo código. **Hay que probar desde el panel**: recibir una encomienda e imprimir/reimprimir la guía, y la baja de cuenta desde la app.
- **Rate limit 429**: el conteo por IP en `limites_uso` se verificó en vivo (`rastreo:<ip>`), pero el proxy de salida de este entorno rota de IP y no se llegó a 30/min en una sola.
- **Reclamo de cola con la RPC**: el modo RPC se activará solo cuando el agente de BD aplique `20261103000004`; hoy funciona el modo de respaldo (cola vacía: cron 200).
- **Recibos de Expo**: código listo, inactivo hasta que existan las columnas (4A).
- **Twilio**: no hay cuenta ni plantillas aprobadas; sin secretos la función responde `enviado: false` en vez de simular.
- Garantía de entrega: con la RPC es "al menos una vez" (si la función muere tras enviar y antes de marcar, el aviso se reenvía al vencer la reserva de 120 s); en el modo de respaldo es "como mucho una vez".

## 4. Fuera de mi zona (para otros agentes)

**Base de datos**

A. Recibos de Expo (activa `revisarRecibos`, sin redeploy):
```sql
ALTER TABLE public.notificaciones_log
  ADD COLUMN IF NOT EXISTS expo_ticket_id text,
  ADD COLUMN IF NOT EXISTS receipt_revisado_at timestamptz;
CREATE INDEX IF NOT EXISTS idx_notificaciones_log_tickets_pendientes
  ON public.notificaciones_log (created_at)
  WHERE expo_ticket_id IS NOT NULL AND receipt_revisado_at IS NULL;
```
B. **Token push compartido entre cuentas (fuga de privacidad)**: la app guarda `expo_push_token` al iniciar sesión y nunca lo borra al cerrar sesión; si otra persona inicia sesión en el mismo teléfono, ambos perfiles quedan con el mismo token y el teléfono recibe los avisos de las dos cuentas. Arreglo en BD:
```sql
CREATE OR REPLACE FUNCTION public.expo_token_unico_fn()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  UPDATE public.profiles SET expo_push_token = NULL
   WHERE expo_push_token = NEW.expo_push_token AND id <> NEW.id;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS expo_token_unico ON public.profiles;
CREATE TRIGGER expo_token_unico AFTER INSERT OR UPDATE OF expo_push_token ON public.profiles
  FOR EACH ROW WHEN (NEW.expo_push_token IS NOT NULL) EXECUTE FUNCTION public.expo_token_unico_fn();
CREATE INDEX IF NOT EXISTS idx_profiles_expo_push_token ON public.profiles (expo_push_token)
  WHERE expo_push_token IS NOT NULL;
```
C. Crons que llaman a funciones (`procesar_notificaciones_pendientes`, `actualizar_tasa_bcv`): `net.http_post` usa el timeout por defecto de 5 s; con reintentos a Expo/dolarapi la función puede tardar más y pg_net lo registra como `timed_out` aunque termine bien. Añadir `timeout_milliseconds := 30000` a ambos `net.http_post`.
D. `generar_tracking_id_fn` (`20260414000005_triggers.sql:42-45`): parte aleatoria de solo 5 dígitos por día (100.000 combinaciones; enumerable por quien conoce la fecha) y fecha en UTC (de 8 p. m. a medianoche de Venezuela sale con el día siguiente). Sugerido: 6–8 caracteres alfanuméricos y `now() AT TIME ZONE 'America/Caracas'`.
E. Si se revoca la clave JWT legacy (HS256 figura como `previously_used`), los crons darán 401: cambiar el secreto `service_role_key` del vault por la `sb_secret_…` (las funciones ya la aceptan; la pasarela también).

**Panel (PanelCooperativas)**
- `src/lib/errores.ts` (`humanizeError`) no lee el cuerpo de `FunctionsHttpError` (`error.context.json()`), así que el `hint` de las funciones (p. ej. "Solo el personal de la cooperativa…", "Hiciste demasiadas consultas…") no llega al usuario: se muestra el texto genérico.

**App (EnBusApp)**
- Al cerrar sesión, poner `expo_push_token = null` en el perfil antes del `signOut` (complementa 4B).

## 5. Verificación

- `deno check --config <fn>/deno.json index.ts` en las 9 funciones (Deno 2.9.6): sin errores. `deno lint _shared */index.ts`: "Checked 12 files", sin avisos.
- Prueba local de `push.ts` con Expo y Supabase simulados (240 avisos): 3 lotes de ≤ 100 + 1 reintento tras un 503; resultados correctos por caso (sin usuario / eliminada 6, preferencia 2, sin token 5, enviados 225, `DeviceNotRegistered` 1 → token borrado, `MessageRateExceeded` 1 → reintentar); log en un insert con respaldo sin `expo_ticket_id`.
- Prueba local del PDF: se genera y el QR se decodifica con zxing (`EB-260609-64257`).
- Deploy: `supabase functions deploy … --use-api --yes` desde una copia en el scratchpad con solo los bloques `[functions.*]` (la CLI actual rechaza `[inbucket]` del `config.toml` del repo; no lo toqué por ser de otra zona). Las 9 funciones `ACTIVE`, `verify_jwt = true`.
- HTTP en vivo:
  - track-and-trace: válido con publishable (en minúsculas) 200 sin datos personales; inexistente 404; formato 400; vacío 400; JSON roto 400; 5 KB 413; GET 405; OPTIONS 204 con CORS; sin auth 401 (pasarela).
  - calculadora-publica: válido 200 (USD, Bs, tasa, opciones); peso "2,5" 200; peso > máx 400 `EB_PESO_INVALIDO` con el hint de la RPC; negativo 400; sin ruta 404 `EB_SIN_RUTA`; sin ciudades 400; array 400.
  - enviar-push / enviar-whatsapp / procesar / actualizar-tasa-bcv con anon y con publishable: 401 `EB_SIN_PERMISO`. Con service role (JWT legacy y `sb_secret`): enviar-push 400/404/200 (`enviado: false`, sin token); enviar-whatsapp 400 (teléfono, plantilla, variables) y 200 `enviado: false` "no está configurado", log con PIN `••••`; procesar 200; tasa 200 `{"tasa":891.1054,"fecha":"2026-11-03"}`.
  - eliminar-cuenta / generar-guia-pdf / calcular-costo-encomienda: OPTIONS 204; sin auth, anon y service role → 401.
  - Cron: `net._http_response` tras el deploy → `procesar-notificaciones-pendientes` 200 cada minuto con el nuevo formato (`{"procesadas":0,"fallidas":0,"reintentar":0,"descartadas":0}`).

## 6. Necesita al usuario

- **WhatsApp**: decidir proveedor. Para Twilio, cargar como secretos de funciones `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM`, `TWILIO_CONTENT_SIDS` (`{"pin_retiro_encomienda":"HX…"}`, plantilla con {{1}} = código y {{2}} = PIN) y opcionalmente `TWILIO_SMS_FROM`. Hasta entonces el reenvío de PIN por WhatsApp responde "no enviado".
- **Expo**: si se activa "Enhanced Push Security" en el proyecto de Expo, cargar `EXPO_ACCESS_TOKEN` como secreto de funciones.
- Probar desde el panel la recepción + guía PDF y desde la app la baja de cuenta (no se pudo con sesión real aquí).
- Al aplicar las migraciones del agente de BD, no hace falta redeploy: la función detecta `fn_tomar_notificaciones_pendientes` sola.
