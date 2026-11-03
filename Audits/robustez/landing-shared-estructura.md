# Auditoría de robustez: Landing + shared + estructura del monorepo

Zona: `LandingEnBus/`, `shared/`, estructura del monorepo (CI, `.gitignore`, `README`, `.env.example`).
Base consultada solo en lectura (`pg_proc`, `information_schema`, `pg_indexes`, `cron.job`, configuración de PostgREST).

## 0. Urgente (necesita al usuario)

**CRÍTICO: clave `service_role` vigente publicada en un repo PÚBLICO.**
`supabase/fetch_auth_users.js:1` contiene la clave `service_role` (JWT legacy) del proyecto `tydpnvajwfzcsxsowctp`.
Se comparó con la clave actual del proyecto y **es la misma**. El repo `github.com/Jcarvajal3/Enbus` es **público**
y el archivo entró en el commit `ec060d7`. Con esa clave cualquiera se salta todo el RLS (lee y modifica todas
las tablas, usuarios de Auth incluidos). No la borré del historial (instrucción) ni del árbol (`supabase/` no es
mi zona). Pasos:
1. Supabase Dashboard → Settings → API Keys: pasar panel, landing y edge functions a las claves nuevas
   (`sb_secret_…` / `sb_publishable_…`, ya existen en el proyecto) y **desactivar las claves legacy (JWT)**;
   o rotar el JWT secret (invalida también la anon y las sesiones). Actualizar las variables en Vercel/EAS y el
   `service_role_key` del Vault (lo usan los cron `procesar_notificaciones_pendientes` y `actualizar_tasa_bcv`).
2. Borrar `supabase/fetch_auth_users.js` (además es un script basura que imprime correos y teléfonos de usuarios).
3. Reescribir el historial es opcional: la clave ya debe darse por filtrada; lo que protege es la rotación.

Menores: la anon key está en `Specs/fase1_plan_detallado.md:48` (es pública por diseño, pero conviene quitarla);
el historial (`62ef955`) tiene un access token de usuario ya caducado.

## 1. Bugs y riesgos encontrados

| # | Severidad | Dónde | Problema |
|---|---|---|---|
| L1 | Alta | `LandingEnBus/package.json` (`next` 16.2.6) | Next con avisos críticos/altos que afectan a esta landing: RCE en `next/og` `ImageResponse` (`app/opengraph-image.tsx`), DoS en Server Actions (las acciones públicas), RCE/SSRF en Image Optimization, cache poisoning de ISR (la portada es ISR). |
| L2 | Alta | `app/rastrear/actions.ts:18` | `rastrearEncomienda` es un endpoint público (server action) sin límite de frecuencia: permite enumerar códigos `EB-AAMMDD-NNNNN` (solo 100 000 por día) y cargar la base. Además consultaba la base con cualquier texto (hasta 40 caracteres) y lanzaba si el argumento no era cadena (`toUpperCase` de un número). |
| L3 | Media | `app/rastrear/actions.ts:45` | `cotizarEnvio` (RPC pesada) sin límite de frecuencia. |
| L4 | Media | `app/registro-cooperativa/actions.ts:196` | Argumentos sin validar tipo: un POST con un número u objeto hacía lanzar `normalizeRif` fuera del `try` (500). Correo sin largo máximo. |
| L5 | Media | `app/registro-cooperativa/actions.ts:258` | Solo miraba invitaciones usadas; las cooperativas registradas desde el panel crean el admin sin invitación, así que se mandaba un enlace para crear un segundo administrador. |
| L6 | Media | `lib/email.ts:752,758,764` | Nombre de la cooperativa (lo escribe quien se registra) insertado sin escapar en el HTML del correo y en el asunto (inyección de HTML / saltos de línea). |
| L7 | Media | `lib/email.ts:745` | Remitente fijo `onboarding@resend.dev`: Resend solo entrega ese remitente al correo del dueño de la cuenta; en producción las invitaciones no llegan. |
| L8 | Baja | `lib/email.ts:739` | Sin `RESEND_API_KEY` se registraba en el log el enlace de invitación (token secreto). |
| L9 | Media | `lib/consultas.ts:676-692` | `origenesConDestinos`: `.in("cooperativa_id", ids)` mete un UUID por cooperativa activa en la URL (se rompe con cientos de cooperativas) y `.limit(2000)` en realidad devolvía 1000 (`max_rows` de PostgREST = 1000, comprobado): orígenes y destinos desaparecían en silencio de la calculadora. |
| L10 | Baja | `lib/limites` (antes en `registro-cooperativa/actions.ts:169`) | La IP se tomaba primero de `x-forwarded-for` (el cliente lo puede fijar fuera de Vercel); ahora primero `x-real-ip`. |
| L11 | Baja | `package.json` | Dependencias sin uso: `shadcn` (CLI pesado como dependencia de producción), `next-themes`, `@hugeicons/*`. |
| S1 | Media | `shared/ve.ts` `formatCedula` | Un RIF jurídico con ceros a la izquierda se mostraba mal: `J-00012345-6` → `J-123.456` (los ceros se quitan al normalizar). Afecta a app y panel. |
| S2 | Media | `shared/ve.ts` fechas | `formatHoraVE`/`formatFechaVE`/`fechaVE` dependían de Intl con `timeZone`: el texto cambia según la versión de ICU (espacio normal, U+00A0 o U+202F en "p. m.") → riesgo de errores de hidratación en el panel (SSR en Node vs navegador) y de soporte desigual de `timeZone`/`formatToParts` en Hermes. |
| S3 | Baja | `shared/ve.ts` `mascaraTelefono` | `+58 0414…` daba `0041-4…` (duplicaba el 0). |
| S4 | Baja | `shared/ve.ts` RIF | No había forma de comprobar el dígito verificador y el ejemplo de los formularios (`J-12345678-9`) tiene el dígito incorrecto (el correcto es 4). |
| S5 | Baja | `shared/artefactos.ts` `normalizarTracking` | `EB26100312345` (sin guiones, como se dicta) no se reconocía como código de seguimiento (`esTracking` → false). |
| E1 | Media | raíz | Sin CI. `.gitignore` raíz casi vacío (solo `.vercel` y `.env*`). `README.md` en UTF-16 con solo "# Enbus". Sin `.env.example`. `gradient-1.png` en la raíz (copia idéntica de `EnBusApp/assets/images/gradient-1.png`, sin referencias). |

Coherencia cliente↔base (verificado contra la base real): `fn_consumir_limite(p_clave, p_maximo, p_ventana_segundos)`,
`fn_rastrear_encomienda_publico(p_tracking)`, `fn_cotizar_envio_publico(p_peso_kg, p_ciudad_origen, p_ciudad_destino)`,
`fn_rutas_populares(p_limite)`, `fn_estadisticas_publicas()`, `fn_tasa_bcv_vigente()` existen con esas firmas y
`service_role` puede ejecutarlas. Tablas/columnas usadas (`cooperativas.id,nombre,estado,email,rif`;
`invitaciones.created_at,usado,email,role,cooperativa_id,creado_por,expira_at,token,id,revocada_at`;
`profiles.id,role,cooperativa_id,eliminada_at`; `rutas.ciudad_origen,ciudad_destino,activa,cooperativa_id` y la FK
`rutas_cooperativa_id_fkey`) existen; enums `PENDIENTE`/`ACTIVA` y `admin_cooperativa`/`super_admin` existen.
El rastreo público no expone datos personales (solo estado, ciudades, cooperativa e historial de estados).
`normalizarCedula`, `normalizarTelefono` y `normalizarCiudad` dan lo mismo que `normalizar_cedula`,
`normalizar_telefono` y `normalizar_localidad` de SQL en 32 casos de prueba (consulta de solo lectura, 0 diferencias).
`fn_limpiar_limites_uso` limpia `limites_uso` a diario (cron `limpiar_limites_uso`).

## 2. Qué arreglé

Landing:
- **L1**: `next` y `eslint-config-next` → `16.4.2` (exacto; corrige todos los avisos listados, publicado hace más de 2 semanas) y `npm audit fix` sin `--force`: `npm audit --omit=dev` = 0 vulnerabilidades (quedan avisos moderados solo de herramientas de desarrollo).
- **L11**: quitadas `shadcn`, `next-themes`, `@hugeicons/react`, `@hugeicons/core-free-icons` (sin uso; `package-lock` −3 000 líneas).
- Nuevo `lib/limites.ts` (solo servidor): `consumirLimite` (atómico con `fn_consumir_limite`, nunca lanza), `consumirLimitePorIp` (HMAC de la IP, `x-real-ip` primero — **L10**), `minutosTexto`, `textoEntrada` (acepta solo cadenas y recorta).
- **L2**: `rastrearEncomienda(codigo: unknown)`: valida el tipo, normaliza, **no consulta la base si el código no tiene la forma `EB-AAMMDD-NNNNN`** (responde "no encontrada"), y límite de **30 consultas / 10 min por IP**; nuevo estado `{ tipo: "limite" }` con su aviso en `app/rastrear/page.tsx` ("Hiciste muchas búsquedas seguidas. Intenta de nuevo en N minutos.").
- **L3**: `cotizarEnvio`: límite de **40 cálculos / 10 min por IP**, entradas leídas solo como cadena, peso con a lo sumo 6 cifras enteras.
- **L4/L5**: `reenviarInvitacion(rif: unknown, email: unknown)`: tipos y largos validados (correo ≤ 254); si la cooperativa ya tiene un `admin_cooperativa` activo en `profiles`, responde `cuentaCreada` ("Tu cooperativa ya tiene una cuenta de administrador. Inicia sesión en el panel.") en vez de mandar otro enlace. Se mantiene el límite atómico por RIF (1 / 5 min) y por IP (5 / hora) y la revocación después del envío.
- **L6/L7/L8**: `lib/email.ts`: nombre y enlace escapados en el HTML, asunto sin saltos de línea; remitente configurable con `RESEND_FROM` (por defecto el de antes); ya no se registra el enlace con el token.
- **L9**: `origenesConDestinos` filtra con join (`cooperativas!inner(estado)` + `cooperativas.estado=eq.ACTIVA`, probado contra la API real) y pagina de 1000 en 1000 hasta 20 000 rutas.
- `lib/estados.ts` `normalizarCodigoSeguimiento` usa `normalizarTracking` de shared; `app/rastrear/page.tsx` usa `formatFechaHoraVE` de shared en lugar de su propio `Intl`.
- `LandingEnBus/README.md` (era la plantilla de shadcn) con cómo correrla; `.env.example`.

shared (regenerado con `node shared/generar.mjs`; los 6 `*.generated.ts` de app, panel y landing):
- **S1**: `formatCedula` formatea J/G/C de 9 dígitos con los ceros tal como se escribieron (`J-00012345-6`). `normalizarCedula` no cambia (sigue igual a SQL).
- **S2**: `fechaVE`, `formatFechaVE` (sin opciones), `formatHoraVE`, `formatFechaHoraVE` calculados a mano con UTC-4 fijo, sin Intl: mismo texto en Node, navegador y Hermes (idéntico al de Intl es-VE de Node, comprobado en 500 instantes 2016–2030). Con `opciones`, `formatFechaVE` sigue usando Intl. `fechaVE` sigue lanzando `RangeError` con una fecha inválida. Nota: fechas de 2007-12 a 2016-04 (UTC-4:30) salen 30 min corridas; no hay datos de esa época.
- **S3**: `mascaraTelefono("+58 0414…")` → `0414-…`.
- **S4**: nuevos `digitoVerificadorRif`, `rifDigitoValido` (módulo 11 del SENIAT; verificado con G-20000303-0 y J-00124134-5; la letra C se acepta con cualquier dígito por no haber tabla oficial) y `RIF_DIGITO_ERROR`. `normalizeRif`/`isValidRif` **no** cambian (no rechazan RIF por el dígito). El ejemplo pasa a `J-12345678-4` (`RIF_PLACEHOLDER`, `RIF_AYUDA`, `RIF_ERROR`).
- **S5**: `normalizarTracking` añade los guiones si el texto es `EB` + 11 dígitos con o sin separadores.
- Pruebas: `shared/tests/ve.test.ts` y `shared/tests/artefactos.test.ts` (17 pruebas, `node:test` + `--experimental-strip-types`, sin dependencias), `shared/package.json` (`type: module`, `npm test`). Pasan también con `TZ=Asia/Tokyo` y `TZ=Pacific/Kiritimati`.
- `shared/README.md` actualizado (pruebas, CI, nuevas funciones, fechas sin Intl).

Estructura:
- `.github/workflows/ci.yml` (push y PR, Node 22, `permissions: contents: read`, cancelación de ejecuciones viejas): job `shared` (`generar.mjs --check` + `npm test`); `LandingEnBus` (`npm ci`, `tsc --noEmit`, `eslint . --max-warnings=0`, `build` sin variables); `PanelCooperativas` (`npm ci`, `tsc`, `npm run lint`, `build` con `NEXT_PUBLIC_SUPABASE_URL/ANON_KEY/COOPERATIVAS_URL/SITIO_URL` ficticias, sin service role); `EnBusApp` (`npm ci`, `tsc`, `npm run lint`).
- `.gitignore` raíz completo (`.env*` con `!.env.example`, `node_modules/`, `.next/`, `out/`, `build/`, `dist/`, `.expo/`, `*.tsbuildinfo`, claves `*.pem/*.p8/*.p12/*.jks/*.key`, `supabase/.temp`, …). `!.env.example` también en `LandingEnBus/.gitignore` y `PanelCooperativas/.gitignore` (si no, su `.env*` ignoraba la plantilla). `EnBusApp/.gitignore` solo ignoraba `.env*.local`: ahora `.env` también queda ignorado por la raíz.
- `.env.example` en `EnBusApp/`, `PanelCooperativas/` y `LandingEnBus/` (variables de `pendientes_fase4.md` § Pasos manuales y de `process.env`).
- `README.md` raíz en UTF-8 con la descripción del monorepo y cómo correr y comprobar cada parte.
- Borrado `gradient-1.png` de la raíz (copia idéntica sin referencias; la app usa `EnBusApp/assets/images/gradient-1.png`).

## 3. Qué NO arreglé y por qué

- `supabase/fetch_auth_users.js` (secreto + script basura): fuera de mi zona (`supabase/`) y el historial no se toca; ver §0.
- `.agents/` (386 archivos) y `skills-lock.json` en la raíz, `EnBusApp/task.md`, `EnBusApp/scripts/reset-project.js` (plantilla de Expo): herramientas/notas, no rompen nada; decidir si se quedan.
- Exigir el dígito verificador del RIF en los formularios: es decisión de negocio (hay RIF antiguos sin él, `pendientes_fase4.md` §8). La función ya está lista (`rifDigitoValido`, `RIF_DIGITO_ERROR`).
- `normalizarTelefono` no acepta `+58 0414…` (13 dígitos) para seguir idéntico a `normalizar_telefono` de SQL.
- `lib/dinero.ts` está copiado a mano en app, panel y landing (iguales salvo `tasaRefDe` de la app): moverlo a `shared/` tocaría imports de app y panel.
- No probé las acciones contra la base real porque `fn_consumir_limite` escribe en `limites_uso` (solo lectura permitida); sí probé la consulta de rutas con join y el rastreo (`null` para un código inexistente) por REST, y la landing en `next start` sin variables (código mal formado → "No encontramos ese código" sin consultar; código bien formado sin guiones → se normaliza).

## 4. Problemas fuera de mi zona

Base de datos (para el agente de BD):
1. **CRÍTICO – `encomiendas.pin_retiro` es UNIQUE global** (`encomiendas_pin_retiro_key`) con 4 dígitos y `generar_pin_retiro_fn` repite `random()` hasta encontrar uno libre: solo pueden existir 10 000 encomiendas con PIN en toda la historia (el PIN nunca se libera). Cerca del tope el trigger hace miles de vueltas y al llegar a 10 000 **entra en un bucle infinito** al pasar a `EN_RECEPCION` (bloquea la fila y la conexión). Arreglo: `ALTER TABLE encomiendas DROP CONSTRAINT encomiendas_pin_retiro_key;` y generar el PIN sin comprobar unicidad (`fn_validar_pin_retiro` ya valida por `encomienda_id`), con un generador seguro, p. ej. `lpad(((('x'||encode(extensions.gen_random_bytes(4),'hex'))::bit(32)::bigint) % 10000)::text, 4, '0')` (probado en la base con una consulta de solo lectura).
2. **ALTO – `generar_tracking_id_fn`**: `EB-YYMMDD-` + 5 dígitos con `random()` y bucle hasta que no exista: capacidad 100 000 por día (bucle infinito si se supera), choques crecientes con el volumen y carrera entre el `PERFORM` y el `INSERT` (dos inserciones simultáneas con el mismo código → error 23505 sin reintento). La fecha usa `now()` en UTC: después de las 20:00 de Venezuela sale el día siguiente. Arreglo propuesto: fecha con `now() AT TIME ZONE 'America/Caracas'`, número de intentos acotado y, si se quiere más espacio, más dígitos (habría que cambiar `TRACKING_RE` en `shared/artefactos.ts` y el formato en specs; coordinar).
3. **MEDIO – `fn_rastrear_encomienda_publico`** filtra con `upper(e.tracking_id) = upper(btrim(p_tracking))`: no usa el índice único de `tracking_id` (recorre toda la tabla en cada rastreo público). Arreglo: `WHERE e.tracking_id = upper(btrim(coalesce(p_tracking, '')))` (el trigger siempre lo genera en mayúsculas) o índice sobre `upper(tracking_id)`.
4. **BAJO – índices duplicados** (cada escritura los mantiene dos veces): `idx_boletos_codigo` (= `boletos_codigo_boleto_key`), `idx_encomiendas_tracking_id` (= `encomiendas_tracking_id_key`), `idx_cooperativas_rif` (= `cooperativas_rif_key`), `idx_invitaciones_token` (= `invitaciones_token_key`). `DROP INDEX` de los `idx_*`.
5. Opcional: `fn_cotizar_envio_publico` compara `normalizar_localidad(r.ciudad_origen/destino)` sin índice de expresión; con muchas rutas, índice `ON rutas (normalizar_localidad(ciudad_origen), normalizar_localidad(ciudad_destino)) WHERE activa`. Y una RPC `fn_origenes_destinos_publicos()` con los pares distintos evitaría que la landing pagine `rutas`.

Panel (para el agente del panel):
- `PanelCooperativas/package.json`: `next` 16.2.4 con los mismos avisos críticos/altos (incluido **bypass de Proxy/middleware** con Turbopack, que es justo `src/proxy.ts`, y DoS de Server Actions). Subir a `next@16.4.2` + `eslint-config-next@16.4.2`.
- `src/lib/email.ts:70` y `src/app/cooperativas/registro/email-helper.ts:38`: remitente fijo `onboarding@resend.dev` (no entrega en producción); revisar también que los nombres que se insertan en el HTML se escapen.
- `src/app/cooperativas/registro/limite.ts` `hashIpCliente`: usa `x-forwarded-for` antes que `x-real-ip` (falsificable fuera de Vercel).
- En la copia de trabajo actual (edición en curso de otro agente) `tsc` falla en `src/app/admin/(panel)/incidencias/page.tsx:33` y `src/lib/data/admin-incidencias.ts:149`; con `HEAD` + los generados nuevos, `tsc` y `build` pasan.

## 5. Verificación

- `LandingEnBus`: `npm ci` (desde cero) OK; `npx tsc --noEmit` OK; `npx eslint . --max-warnings=0` 0 errores, 0 avisos; `npm run build` OK (Next.js 16.4.2, 12 páginas; `/` ISR 30 min, `/rastrear` dinámica); `npm audit --omit=dev` 0 vulnerabilidades.
- `node shared/generar.mjs --check` → "OK: los 9 archivos generados coinciden con shared/."
- `cd shared && npm test` → 17 pruebas, 17 pasan (también con otras `TZ`).
- Paridad TS↔SQL de normalizadores: 32 casos, 0 diferencias.
- Los generados nuevos no rompen a nadie: `npx tsc --noEmit` pasa en `PanelCooperativas` y `EnBusApp` (árbol actual).
- Receta del CI probada en copias limpias: panel `npm ci` + `npm run lint` OK y `npm run build` OK (con `HEAD` + generados nuevos, variables ficticias y sin service role); app `npm ci` + `tsc` + `npm run lint` OK.

## 6. Necesita al usuario

1. **Rotar la clave `service_role` / desactivar las claves legacy** (§0) y borrar `supabase/fetch_auth_users.js`.
2. Configurar `RESEND_FROM` (dominio verificado en Resend) en la landing — y lo mismo en el panel cuando se corrija.
3. Decidir si los formularios de RIF exigen el dígito verificador (`rifDigitoValido`).
4. Decidir si se quedan `.agents/`, `skills-lock.json`, `EnBusApp/task.md` y `EnBusApp/scripts/reset-project.js`.
5. Activar GitHub Actions en el repo (el workflow no necesita secretos).
