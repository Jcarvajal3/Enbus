# Auditoría de robustez — Panel de cooperativas (PanelCooperativas, excepto super admin)

Zona: `src/app/cooperativas/**`, `src/proxy.ts`, `src/lib/**` (sin `admin-*`), `src/hooks/**`, `src/components/**` (sin `admin/`), `src/app/layout.tsx`, `src/app/page.tsx`, archivos raíz y `tests/`.

## 0. Coherencia cliente ↔ base (prioritario)

Lo comprobé contra la base real con consultas de solo lectura a `pg_proc`, `information_schema.columns`, `pg_constraint`, `pg_policies`, `pg_trigger` y `pg_indexes`:

- **30 RPC** que llama el panel: todas existen, son `SECURITY DEFINER` con `search_path` fijo, y los nombres de parámetros coinciden con las llamadas (los opcionales tienen `DEFAULT`). `fn_email_registrado` y `fn_consumir_limite` solo tienen permiso para service role, y el panel las llama con `createAdminClient()`, que es lo correcto. Las RPC de mostrador validan con `_contexto_staff()`, que exige un rol de personal y la cooperativa del recurso.
- **33 `select` distintos** (tablas `boletos`, `encomiendas`, `viajes`, `rutas`, `pagos`, `profiles`, `invitaciones`, `sucursales`, `metodos_pago_cooperativa`, `cooperativas`, `comisiones_ciclo`, `encomienda_estado_historial`): todas las columnas existen, incluidas las de las relaciones embebidas. Los hints `!sender_id`, `!viaje_id`, `!ruta_id`, `!comprador_id`, `!boletos_pago_id_fkey` y `!pagos_encomienda_id_fkey` apuntan a FK reales. Los embebidos sin hint (`rutas(...)` desde viajes, `cooperativas(...)` desde profiles e invitaciones) tienen una sola FK posible, así que no hay ambigüedad (PGRST201).
- Las columnas de `insert` y `update` (viajes, rutas, sucursales, métodos de pago, cooperativas, invitaciones, profiles, encomiendas) también existen.
- Límite real de PostgREST en el proyecto: `max_rows = 1000`. Toda consulta sin tope se corta en 1000 filas **sin avisar**. Esto generó varios hallazgos (abajo).
- No pude ejecutar los `select` contra PostgREST porque usar la clave service role fue denegado. La verificación se hizo con el catálogo.

## 1. Bugs y riesgos encontrados

| # | Sev. | Dónde | Problema |
|---|------|-------|----------|
| 1 | **Crítica** | `app/cooperativas/invite/[token]/actions.ts:validateInviteToken/completeOnboarding` + política RLS `invitaciones.admin_insert_invitaciones` | La política de INSERT solo exige `user_role() IN (admin_cooperativa, super_admin)`: no limita `role`, `cooperativa_id`, `sucursal_id` ni `creado_por`. Un admin de cooperativa puede insertar desde la API una invitación con `role='super_admin'` o para otra cooperativa, abrir `/cooperativas/invite/<token>` y `completeOnboarding` (con service role) le crea la cuenta con ese rol. Es una escalada a super admin. |
| 2 | Alta | `lib/supabase/middleware.ts` (redirección login → panel) + `(panel)/layout.tsx` | Bucle infinito de redirecciones (ERR_TOO_MANY_REDIRECTS) con cualquier sesión sin acceso al panel: cuenta de pasajero, cuenta sin perfil o sin cooperativa, super admin que entra a `/cooperativas/*` o empleado que entra a `/admin/*`. El layout manda al login, el proxy ve sesión y manda al panel, y así sin fin. Pasaba también al recargar el login después de un "no se pudo cargar tu perfil". |
| 3 | Alta | `lib/supabase/middleware.ts`, `lib/supabase/cached.ts` | Se usaba `getSession()`, que **no verifica la firma** del JWT de la cookie. El comentario decía que el proxy validaba con `getUser()`, y no era así. |
| 4 | Alta | `(panel)/dashboard/page.tsx` (KPI ingresos) | El total del día leía todos los pagos verificados sin paginar. Con más de 1000 pagos al día el total salía recortado sin aviso. |
| 5 | Media | `(panel)/dashboard/page.tsx` (KPI y gráfico de boletos) | Solo contaba `PAGADO`. Un boleto embarcado pasa a `USADO` y desaparecía de "Boletos vendidos hoy", así que la cifra bajaba a lo largo del día. |
| 6 | Media | `(panel)/configuracion/actions.ts` (actualizar, activar o eliminar método de pago; activar o eliminar sucursal; logo) | `update`/`delete` filtrados por `id` y cooperativa sin comprobar cuántas filas cambiaron. Un id ajeno o inexistente, o un bloqueo de RLS, devolvía "ok" sin hacer nada (éxito falso). |
| 7 | Media | `(panel)/configuracion/actions.ts:uploadLogo` | El tipo del archivo lo declara el navegador y el bucket es público: no se comprobaba que el archivo fuera de verdad una imagen. Además, `formData.get` se convertía a `File` sin comprobarlo. |
| 8 | Media | `(panel)/rutas/actions.ts` | `rutaId` sin validar. `checkDesactivarRuta` no tenía filtro de cooperativa. Editar o activar devolvía éxito aunque no cambiara ninguna fila. Precio sin tope y textos sin límite de largo. |
| 9 | Media | `(panel)/rutas/page.tsx` | Si la consulta fallaba, el error se ignoraba y la pantalla decía que no había rutas. |
| 10 | Media | `(panel)/recepcion-destino/actions.ts` | Ids sin validar. `recibirLote` sin tope (un `in()` con cientos de ids rompe la URL) y la lectura no filtraba por cooperativa en la consulta. No se revalidaban Entrega ni Resumen. |
| 11 | Media | `components/scan-input.tsx:133` | `select("*")` al escanear: el **PIN de retiro** y la clave de idempotencia llegaban al navegador del taquillero. |
| 12 | Media | `hooks/use-encomiendas-realtime.ts` | Cada evento recargaba la lista entera: un despacho de 40 encomiendas eran 40 recargas por cada pantalla abierta. Al reconectarse el canal no se recargaba, así que se perdían los cambios ocurridos durante el corte. |
| 13 | Media | `taquilla/encomiendas/page.tsx`, `taquilla/boletos/page.tsx` | Carrera entre cargas: una respuesta lenta (otro filtro o una recarga en tiempo real) pisaba la lista más nueva, por ejemplo mostrando "todas" con el filtro "por pagar". |
| 14 | Media | `lib/printing/bluetooth.ts` | Paquetes BLE de 512 bytes: muchas impresoras térmicas genéricas (servicio 18F0, MTU 23–185) no aceptan escrituras largas, así que imprimían basura o fallaban a mitad del ticket. Dos impresiones a la vez mezclaban sus bytes. |
| 15 | Media | `components/app-sidebar.tsx`, `login/login-client.tsx` | `signOut()` global: cerrar sesión en una taquilla tumbaba la misma cuenta en las otras. En el login, a un pasajero que probaba su cuenta lo sacaba también de la app móvil. |
| 16 | Media | `login/login-client.tsx` | Sin `try/catch`: un error de red dejaba el botón bloqueado ("cargando") para siempre. Con perfil ilegible se quedaba una sesión a medias. |
| 17 | Media | `(panel)/empleados/page.tsx` | `getUserById` por empleado, todos a la vez (N llamadas simultáneas a Auth), y la consulta de perfiles sin tope. |
| 18 | Media | `lib/email.ts` | Remitente fijo `onboarding@resend.dev`: es el remitente de pruebas de Resend y solo entrega al dueño de la cuenta. En producción los correos de aprobación y rechazo no llegarían. |
| 19 | Baja | `components/boletos/venta-flow.tsx:736`, `entrega/page.tsx`, `recepcion-destino/page.tsx` | Listas sin tope que pasan de 1000 filas con salidas recurrentes o con encomiendas acumuladas, y PostgREST las corta sin avisar. |
| 20 | Baja | `components/entrega/pin-input.tsx` | No había bloqueo contra dos validaciones simultáneas del PIN, y cada fallo cuenta un intento en el servidor. |
| 21 | Baja | `taquilla/encomiendas/actions.ts` (`guardarFotoEncomienda`, `obtenerPdfGuia`) | La ruta de la foto admitía `..` o subcarpetas. `obtenerPdfGuia` no validaba el id. |
| 22 | Baja | `(panel)/viajes/actions.ts:guardarViaje` | `ruta_id` sin validar como UUID. Unidad y chofer sin `trim` ni límite de largo. Los asientos se leían con `parseInt`, que acepta "12abc". |
| 23 | Baja | `auth/callback/route.ts` | `next` aceptaba cualquier ruta interna, incluso con barra invertida. |
| 24 | Baja | `tests/auth.spec.ts` | Tests desactualizados: buscaban "Iniciar Sesión", "Sesión Inválida" e "Ir al Login", textos que ya no existen, así que fallaban. |
| 25 | **Crítica** | `package.json` | `next` 16.2.4 tenía avisos de seguridad críticos y altos (bypass del Proxy, DoS en Server Actions…). `npm audit --omit=dev` daba 23 vulnerabilidades (1 crítica, 12 altas). La mayoría venían de `shadcn` (un CLI con express, hono y el SDK de MCP), que estaba en `dependencies` aunque solo se usa al compilar (`@import "shadcn/tailwind.css"`). |
| 26 | Media | `taquilla/encomiendas/actions.ts` (`functions.invoke("generar-guia-pdf")`) | El cuerpo JSON `{error: "EB_*", hint}` de las edge functions no se leía (`FunctionsHttpError.context`): el `hint` nunca llegaba al usuario. Si la función respondía sin `pdf_url`, la acción daba éxito sin guía. |
| 27 | Media | `registro/limite.ts:hashIpCliente` | Tomaba la IP de `x-forwarded-for` antes que de `x-real-ip`. Fuera de Vercel el cliente puede falsificar esa cabecera y saltarse el límite de registros. |
| 28 | Media | `lib/supabase/auth-guards.ts` | `requireSuperAdmin` basado en `getSession()` (no verifica el JWT). Ya no lo usaba nadie: el admin usa `lib/data/admin-auth.ts`. |
| 29 | Baja | `components/admin-sidebar.tsx:86` | `signOut()` sin comprobar el error: sin red mandaba al login con la sesión todavía abierta. Además cerraba la sesión en todos los equipos. |

## 2. Qué arreglé y cómo

1. **Invitaciones (n.º 1):** `validateInviteToken` ahora lee `creado_por` y solo acepta una invitación si:
   - el rol es `taquillero` o `admin_cooperativa`;
   - quien la creó es super admin, o admin de **esa misma** cooperativa;
   - la sucursal, si tiene, pertenece a esa cooperativa.

   Si no, responde con el mismo mensaje de "enlace inválido" y lo registra en el log. Esto cierra la escalada a super admin. **Ojo:** queda abierto el caso de un `creado_por` falsificado con el UUID de un super admin (se ve en `cooperativas.estado_cambiado_por`). Para cerrarlo hace falta el arreglo de base (sección 4.1).
2. **Proxy y sesión (n.º 2 y 3):**
   - `middleware.ts` usa `getClaims()`. Las claves del proyecto son ES256 y el JWKS queda en caché global, así que no hay llamada de red por petición. Sigue renovando el token como antes.
   - Las redirecciones conservan las cookies renovadas.
   - Las rutas públicas se comparan por segmento, así que `/cooperativas/loginx` ya no cuenta como pública.
   - Se quitó la redirección "con sesión, del login al panel", que causaba el bucle.
   - `cached.ts:getUserProfile` usa `getClaims()` (misma firma exportada, que también usa el admin) y registra en el log los errores que no son "sin perfil".
   - `(panel)/layout.tsx`: un super admin va a `/admin/dashboard`; cualquier otra cuenta sin acceso va a `/cooperativas/login?error=sin-acceso`.
   - `login/page.tsx` (servidor): si la sesión tiene acceso, redirige al panel (el taquillero a encomiendas); si viene `?error`, muestra el motivo.
3. **Dashboard (n.º 4 y 5):** los pagos del día se leen por páginas de 1000 ordenadas por id, con un máximo de 50 páginas. Boletos vendidos = `PAGADO` + `USADO` en el KPI y en el gráfico.
4. **Configuración (n.º 6 y 7):** todo `update`/`delete` lleva `.select("id")` y, si no cambió ninguna fila, devuelve "No encontramos…". El logo se valida por su firma (PNG, JPEG o WebP) además del tipo declarado y el tamaño.
5. **Rutas (n.º 8 y 9):**
   - Se valida el UUID.
   - El filtro de cooperativa se aplica también en `checkDesactivarRuta`.
   - Se comprueba que el cambio tocó alguna fila.
   - Precio ≤ 1000 USD y claves de estado/ciudad recortadas.
   - Al activar o desactivar se revalida también `/viajes`.
   - La página lanza el error a `error.tsx`, que ofrece "Reintentar", y lleva `limit(500)`.
6. **Recepción en destino (n.º 10):** valida los UUID, quita duplicados, acepta hasta 200 por lote (cabe en la URL), filtra por cooperativa en la consulta y revalida recepción, entrega y resumen.
7. **Escaneo (n.º 11):** lista explícita de columnas, sin `pin_retiro` ni `idempotency_key`.
8. **Tiempo real (n.º 12):**
   - Las ráfagas de eventos se agrupan con 700 ms de espera.
   - El callback se guarda en una ref, así que el canal no se vuelve a crear.
   - Al reconectarse el canal se recarga una vez.
   - Al desmontar se limpian el temporizador y el canal.
9. **Carreras de carga (n.º 13):** un contador de carga en taquilla de encomiendas y de boletos descarta las respuestas viejas.
10. **Impresora (n.º 14):** paquetes de 180 bytes y una cola que imprime los trabajos uno detrás de otro; un trabajo fallido no bloquea los siguientes.
11. **Cierre de sesión (n.º 15 y 16):** `signOut({ scope: "local" })` en la barra lateral y en el login. El login tiene `try/catch`, bloquea el doble envío y cierra la sesión si no se puede leer el perfil. Después de cerrar sesión se hace `router.replace` + `refresh`.
12. **Empleados (n.º 17):** las cuentas se piden de 10 en 10 y los perfiles llevan `limit(500)`.
13. **Correo (n.º 18):** el remitente sale de `RESEND_FROM` (con respaldo al de pruebas) y la variable está documentada en `.env.example`.
14. **Topes explícitos (n.º 19):** `limit(300)` en los viajes de venta y `limit(1000)` en entrega y recepción. Las que queden fuera se abren escaneando.
15. **Validaciones menores:**
   - PIN: un `useRef` impide dos validaciones a la vez (n.º 20).
   - Foto: la ruta tiene que ser exactamente `<uuid>/<archivo>` (n.º 21).
   - PDF: se valida el UUID antes de pedir la guía (n.º 21).
   - Viajes: se valida el UUID de la ruta; unidad (40) y chofer (120) se recortan; los asientos se validan con `Number.isInteger` (n.º 22).
   - Callback: `next` solo puede ser una ruta `/cooperativas/...` sin barra invertida (n.º 23).
16. **Tests (n.º 24):** `tests/auth.spec.ts` ya busca los textos actuales y añadí 2 casos: sin sesión el panel lleva al login (sin bucle), y el login explica `?error=sin-acceso`.
17. **Seguridad de dependencias (n.º 25):** `next` y `eslint-config-next` pasan a `16.4.2` exacto (como la landing), `shadcn` pasa a `devDependencies` y se ejecutó `npm audit fix` sin `--force`. `npm audit --omit=dev` da **0 vulnerabilidades**. El `audit` completo, con las dependencias de desarrollo, aún lista las de shadcn y ESLint: no llegan a producción.
18. **Errores de edge functions (n.º 26):** nuevo `errorDeFuncion(error)` en `lib/errores.ts`. Hace `await error.context.clone().json()` dentro de `try/catch` y devuelve `{message: "EB_*", hint, details}` para que `humanizeError` y `codigoEB` funcionen; si no hay `EB_*` pero sí `hint`, muestra el hint. Se usa en las dos llamadas a `generar-guia-pdf`, y una respuesta sin `pdf_url` ahora es un error claro. El panel de cooperativas no invoca otras funciones: `enviar-whatsapp` solo la llama el admin, en `app/admin/(panel)/usuarios/actions.ts`.
19. **IP del límite (n.º 27):** se usa primero `x-real-ip` (lo fija la plataforma) y después el primer valor de `x-forwarded-for`.
20. **`auth-guards.ts` (n.º 28):** borrado (no lo importaba nadie).
21. **`admin-sidebar.tsx` (n.º 29):** `signOut({ scope: "local" })`; si falla, se avisa con un toast y no se navega. Después se hace `router.replace` + `refresh`.
22. **Remitente de correo:** ahora la variable se llama `RESEND_FROM` (pedido del coordinador; documentada en `.env.example`, que conservé junto con el `!.env.example` de `.gitignore`). Los datos de usuario que van en el HTML de los correos (nombre de la cooperativa, motivo, enlace) ya se escapaban con `escaparHtml`; el asunto es texto plano.

## 3. Lo que NO arreglé y por qué

- **Viajes duplicados** (misma ruta y misma hora, por ejemplo al programar dos veces la misma recurrencia): no hay índice único y una cooperativa puede tener dos buses a la misma hora a propósito. Es una decisión de negocio (sección 6). El doble clic ya está bloqueado en la UI.
- **Empleado desactivado (ban):** conserva su access token hasta que vence (1 h por defecto). Se arregla en la base o en Auth (sección 4.6).
- **Editar origen o destino de una ruta que ya tiene viajes con boletos** cambia el trayecto de lo ya vendido. Es una regla de negocio; propongo bloquearlo si hay viajes `PROGRAMADO` con boletos.
- **`registro/email-helper.ts:sendInvitationEmail`** no lo usa nadie (código muerto). Solo le cambié el remitente.
- **Paginación de bandejas largas** (pagos por verificar y reembolsos vía RPC, también cortadas en 1000): con el volumen actual no llegan a ese número. Si crecen, las RPC deberían aceptar `limit`/`offset`.
- **Playwright:** no lo ejecuté porque necesita un `.env.local` con las claves de Supabase y los navegadores instalados. Los tests se actualizaron leyendo el código actual.

## 4. Problemas fuera de mi zona

### Base de datos (para el agente de BD)

1. **CRÍTICO — `invitaciones`, política `admin_insert_invitaciones` (INSERT):** `WITH CHECK (user_role() IN ('admin_cooperativa','super_admin'))` no limita la fila (ver n.º 1). Todas las inserciones legítimas (panel y super admin) ya usan service role, así que el arreglo más simple es `DROP POLICY admin_insert_invitaciones ON public.invitaciones;`. Si se quiere mantener, la condición debería ser:
   ```sql
   WITH CHECK (
     creado_por = auth.uid()
     AND role IN ('taquillero','admin_cooperativa')
     AND (is_super_admin() OR (user_role()='admin_cooperativa' AND cooperativa_id = user_cooperativa_id()))
     AND (sucursal_id IS NULL OR EXISTS (SELECT 1 FROM sucursales s WHERE s.id = sucursal_id AND s.cooperativa_id = invitaciones.cooperativa_id))
   )
   ```
2. **ALTA — cooperativas `SUSPENDIDA` o `DESACTIVADA` siguen vendiendo en taquilla.** `Specs/00_General/State_Machines_Spec.md:210` dice "No se pueden crear nuevas encomiendas ni vender boletos para cooperativas suspendidas/desactivadas". Ni `_contexto_staff` ni `fn_vender_boletos_taquilla`, `fn_cobrar_reserva_taquilla`, `fn_registrar_encomienda_taquilla` o `fn_confirmar_recepcion_origen` miran `cooperativas.estado` (solo lo hacen `fn_cambiar_estado_cooperativa`, `fn_solicitar_revision_cooperativa` y las públicas). Propuesta: un helper `_exigir_cooperativa_operativa(p_coop)` que lance `EB_COOPERATIVA_NO_OPERATIVA` con hint ("Tu cooperativa está suspendida: no puede vender ni recibir envíos nuevos"), llamado desde esas RPC. Las encomiendas ya en curso deben poder terminar su ciclo, así que despacho, recepción y entrega no se bloquean. Hay que decidir si `PENDIENTE` puede vender en taquilla.
3. **ALTA — `encomiendas.pin_retiro` lo puede leer el personal** con su política de SELECT. Cualquier taquillero lo saca desde la API y entrega sin que el destinatario dé el PIN, lo que vacía el control. Propuesta: `REVOKE SELECT (pin_retiro) ON encomiendas FROM authenticated` (con grants por columna para el resto) y exponer el PIN solo al remitente o destinatario mediante RPC. Antes, revisar cómo lo lee hoy `EnBusApp`.
4. **MEDIA — `viajes`, política `Modificar viajes cooperativa` (ALL, `cooperativa_id = user_cooperativa_id()`):** también deja al taquillero insertar, editar y borrar viajes directamente, incluidos `asientos_disponibles` y `estado`. Propuesta: limitarla a `user_role()='admin_cooperativa'` y añadir un trigger que impida cambiar `estado` o `asientos_disponibles` fuera de las RPC (`fn_editar_viaje`, `fn_marcar_salida_viaje`, etc.).
5. **MEDIA — `encomiendas`, política `Taquillero actualiza de su cooperativa` (UPDATE):** el personal puede cambiar cualquier columna no protegida (`costo_calculado`, `modalidad_pago`, `peso_kg`, datos del destinatario…) con un PATCH directo. El panel solo actualiza directamente `foto_*` y la recepción `EN_TRANSITO → EN_OFICINA_DESTINO`. Propuesta: una RPC `fn_recibir_encomiendas_destino(p_ids uuid[])` atómica que valide la sucursal en el servidor (hoy esa comprobación está **solo** en la app) y un trigger que limite el UPDATE directo del personal a `foto_evidencia_url` y `foto_omitida_motivo`.
6. **MEDIA — empleado desactivado:** el ban de Auth no revoca las sesiones abiertas. Propuesta: que `_contexto_staff` rechace a los usuarios con `auth.users.banned_until > now()`, o una RPC de service role que borre `auth.sessions` / `auth.refresh_tokens` del usuario al desactivarlo (la llamaría `toggleEmpleado`).
7. **MEDIA — índices para las consultas del panel**, que crecen con los datos:
   - `encomiendas (cooperativa_id, estado, created_at DESC)` y `(cooperativa_id, created_at DESC)`;
   - `boletos (cooperativa_id, estado, created_at)` y `(viaje_id, estado)`;
   - `viajes (cooperativa_id, estado, fecha_hora_salida)`;
   - `pagos (cooperativa_id, verificado_at) WHERE verificado`;
   - `encomienda_estado_historial (estado_nuevo, created_at)`.

   Hoy solo hay índices de una columna.
8. **BAJA — resumen del día:** 14 consultas de conteo para el gráfico y la paginación de pagos se podrían reemplazar por una RPC `fn_resumen_cooperativa(p_dias int)` que devuelva conteos y sumas (`sum(monto)`, `sum(monto_bs)`) agregados en SQL.

### Super admin (para el agente del admin)

- El proxy **ya no** redirige de `/admin/login` a `/admin/dashboard` cuando hay sesión: con una sesión de empleado eso creaba un bucle con `admin/(panel)/layout.tsx`. Si se quiere que un super admin con sesión salte el login, hay que hacerlo en `app/admin/login/page.tsx` en el servidor, igual que en `app/cooperativas/login/page.tsx`: `getUserProfile()` y `redirect` solo si `role === 'super_admin'`.
- `getUserProfile()` mantiene su firma; ahora verifica el JWT con `getClaims()`.
- Durante mi trabajo vi errores de tsc pasajeros en `components/admin/usuarios/usuario-detail-tabs.tsx`, `components/admin/incidencias/incidencias-table.tsx` y `lib/data/admin-incidencias.ts` (TS2589), del trabajo en curso del otro agente. En la verificación final ya no aparecían.

### Edge functions

- `generar-guia-pdf`: solo vi que verifica el JWT. Que el agente de edge functions confirme que exige que la encomienda sea de la cooperativa del usuario, porque la guía lleva el PIN.

## 5. Verificación

- `npm ci`: OK.
- `npx tsc --noEmit`: 0 errores (verificación final).
- `npx eslint`: 0 errores, 0 avisos.
- `npm run build`: OK (todas las rutas compiladas; el proxy aparece como Middleware).
- Playwright: no ejecutado (motivo en la sección 3).

## 6. Pendiente del usuario

- Configurar en Vercel `RESEND_FROM` con un dominio verificado en Resend. Sin eso, los correos de aprobación y rechazo no llegan a las cooperativas.
- Decidir:
  - si se permiten dos viajes de la misma ruta a la misma hora (índice único parcial o no);
  - si una cooperativa `PENDIENTE` puede vender en taquilla;
  - si se permite editar origen o destino de una ruta con viajes vendidos.
- Probar la impresión Bluetooth con la impresora real de las taquillas: el tamaño de paquete bajó de 512 a 180 bytes y aquí no se puede probar con hardware.
