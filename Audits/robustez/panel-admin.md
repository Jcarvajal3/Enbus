# Auditoría de robustez — Panel Super Admin (`PanelCooperativas/src/app/admin`)

Zona: `src/app/admin/**`, `src/components/admin/**`, `src/lib/data/admin-*`, `src/lib/types/admin-*`, `src/lib/admin-navigation.ts`.
Verificación contra la base real (solo lectura: `information_schema`, `pg_proc`, `pg_policies`, `pg_indexes`, y peticiones REST con la clave anon para validar la sintaxis de los filtros y relaciones embebidas). Todos los `.from()/.select()/.rpc()` de la zona existen con esas columnas, relaciones (`boletos!pagos_boleto_id_fkey`, `profiles!reportado_por`, `profiles!sender_id`, `comisiones_ciclo.pagado`…) y parámetros. Las RPC de admin (`fn_cambiar_estado_cooperativa`, `fn_publicar_tarifa`, `fn_cancelar_tarifa_programada`, `fn_registrar_tasa_bcv_manual`, `fn_desbloquear_pin`) validan `is_super_admin()` en la base.

## 1. Bugs y riesgos encontrados

| # | Sev. | Dónde (original) | Problema |
|---|---|---|---|
| 1 | **Crítica** | `lib/data/admin-usuarios.ts`, `admin-cooperativas.ts:38`, `admin-solicitudes.ts:61`, `admin-incidencias.ts:92` | Las funciones de datos que usan la **service role** no verificaban el rol: dependían del layout, que **no se vuelve a renderizar al navegar** (partial rendering) y corre en paralelo con la página. Una petición RSC a `/admin/usuarios` con el árbol del layout ya montado ejecuta la página sin el chequeo del layout → correos de Auth, métodos de pago, invitaciones. |
| 2 | Alta | `lib/supabase/auth-guards.ts` (usado por todas las actions) | `requireSuperAdmin` se basaba en `getSession()` (JWT de la cookie **sin verificar**; `session.user` sale del JSON de la cookie). Hoy lo salvaba que la RLS de `profiles` no deja leer el perfil de otro, pero cualquier cambio de política lo abre. |
| 3 | Alta | `(panel)/layout.tsx:23` + `lib/supabase/middleware.ts` | **Bucle de redirecciones**: un admin de cooperativa (misma cookie) que abre `/admin/...` → layout redirige a `/admin/login` → el proxy, al ver sesión, redirige a `/admin/dashboard` → … `ERR_TOO_MANY_REDIRECTS`. |
| 4 | Alta | `comisiones/actions.ts:111` | Comisión calculada sobre `pagos` **sin paginar**: PostgREST corta en 1000 filas (`max_rows=1000`) → con >1000 pagos en el período la comisión sale **de menos, sin error**. Además 2 consultas por cooperativa en serie (N+1) y suma en float. |
| 5 | Alta | `comisiones/actions.ts:124` | El ciclo filtraba por `pagos.created_at`: un pago registrado el último día y **aprobado después** de generar el ciclo no entraba en ningún ciclo (comisión perdida). La spec dice "pagos aprobados". |
| 6 | Media | `comisiones/actions.ts:69` | "Todas" solo procesaba cooperativas `ACTIVA`: una cooperativa suspendida durante el período no generaba su ciclo (deja de cobrarse lo vendido). |
| 7 | Media | `comisiones/actions.ts:54` | Fechas validadas solo con regex (`2026-02-31` pasaba); se podía generar un ciclo que incluye hoy o el futuro (congela un total incompleto; el siguiente ciclo choca por solape); `cooperativa_id` sin validar. |
| 8 | Alta | `lib/data/admin-dashboard.ts:118-205` | Gráficas de 30 días, top de cooperativas y rutas con `.limit(5000/10000)` → PostgREST devuelve 1000 → **gráficas mal** en cuanto hay >1000 movimientos al mes. Las sumas de ingresos/comisiones del día también sin paginar. |
| 9 | Media | `admin-dashboard.ts:41,127,170` | Boletos contados solo con `estado = PAGADO`: al embarcar pasan a `USADO` y **desaparecen** del KPI de hoy y del histórico. |
| 10 | Media | `admin-incidencias.ts:54` | Lista = las 500 **más recientes** y luego orden por prioridad/antigüedad en el cliente: con >500 pendientes, las más antiguas (las primeras a atender) no aparecían y la búsqueda no las encontraba. |
| 11 | Media | `solicitudes/actions.ts:79-103` | Aprobación concurrente: ambos admins pasaban el chequeo `PENDIENTE`, ambos escribían su comisión y **ambos enviaban el correo** (la RPC devuelve `ya_procesado` y no se miraba). Igual en el rechazo (correo duplicado). |
| 12 | Media | `incidencias/actions.ts:116` | `crearIncidenciaPerdida`: doble clic o dos admins → dos incidencias de pérdida de la misma encomienda (y dos seguros). `activarSeguro` aceptaba cualquier estado no resuelto (ABIERTA) en el UPDATE. |
| 13 | Media | `usuarios/actions.ts:26` | `reenviarPIN` sin límite (cada clic = un WhatsApp pagado) y permitía reenviar en encomiendas cerradas. |
| 14 | Media | `admin-usuarios.ts:192-216` | Detalle de usuario sin límite (5 listas de hasta 1000 filas cada una) y `or(receiver_telefono.eq.${telefono})` sin comillas: un teléfono con coma/paréntesis rompe la consulta. El **PIN de retiro** viajaba al navegador (solo se usaba como booleano). |
| 15 | Baja | `admin-usuarios.ts:54` / `admin-cooperativas.ts:183` | `getUserById` en paralelo sin tope (50 peticiones simultáneas a Auth por página). |
| 16 | Baja | `admin-solicitudes.ts:310` | `.in("cooperativa_id", ids)` con todas las solicitudes rechazadas: con cientos, la URL supera el límite y la consulta falla entera. |
| 17 | Baja | `cooperativas/actions.ts` | Invitación: no se validaba el correo ni la cooperativa (existe / no desactivada); el chequeo de invitación vigente contaba las revocadas; `createCooperativa` creaba invitaciones duplicadas; extensión del logo tomada del nombre del archivo; `nuevoEstado` sin lista blanca; `update` de un id inexistente devolvía éxito. |
| 18 | Baja | `admin-comisiones.ts:16` | Ciclos sin paginar (corte silencioso en 1000) y `fetchCooperativasList` tragaba el error (selector vacío = "no hay cooperativas"). |
| 19 | Baja | `admin-tarifas.ts:192`, `admin-cooperativas.ts:160` | Historial de tarifas y calificaciones sin límite. |
| 20 | Baja | `auth/callback/route.ts:8` | `next` aceptaba cualquier ruta interna (p. ej. `/\evil.com` o salir del panel); error al leer el perfil dejaba la sesión abierta. |
| 21 | Baja | `tarifas/actions.ts:399` | Simulador sin el redondeo de `_costo_encomienda` (podía diferir un centavo del cobro real); ids sin validar en varias actions. |
| 22 | Baja | Dashboard / ciclos | Sumas de dinero en float (`+=` sobre miles de montos). |

## 2. Qué se arregló y cómo

- **Guard verificado propio del admin** — `src/lib/data/admin-auth.ts`: `verificarSuperAdmin()` (React `cache`) usa `supabase.auth.getClaims()` (valida firma/vencimiento; con secreto simétrico valida contra Auth), lee el rol del perfil de **ese** `sub` y rechaza cuentas con `eliminada_at`. `requireSuperAdmin()` lanza con `code` (`session_not_found` / `42501`) para que `humanizeError` dé el texto correcto. `esUuid()` para validar ids que llegan del cliente.
  - Todas las actions del admin (cooperativas, solicitudes, usuarios, tarifas, comisiones, encomiendas, incidencias) usan este guard (comisiones tenía uno propio con `getUser`, unificado).
  - **Cada función de datos `lib/data/admin-*` llama `requireSuperAdmin()` antes de leer**, sobre todo antes de crear el cliente service role. Ya no se depende del layout.
- **Layout sin bucle** — `(panel)/layout.tsx`: sin sesión → `/admin/login`; con sesión pero sin rol → pantalla `SinAccesoAdmin` (`components/admin/sin-acceso.tsx`) con "Ir al panel de cooperativas" y "Cerrar sesión" (POST a la nueva ruta `app/admin/auth/salir/route.ts`, 303 al login). El usuario del shell se arma del perfil verificado.
- **Callback OAuth** — `next` solo acepta rutas `/admin…` (ni `\`, ni `/admin/login`, ni `/admin/auth`); error al leer el perfil → cierra sesión; rechaza cuentas eliminadas.
- **Utilidades** — `src/lib/data/admin-consultas.ts`: `leerTodas()` (lee todas las páginas de 1000 con orden estable y tope, informa `truncado`), `enLotes()` (concurrencia limitada), dinero en **centavos enteros** (`aCentavos`, `porcentajeCentavos`), `esFechaValida()`, `rpcNoDisponible()`.
- **Comisiones** (`comisiones/actions.ts`): cálculo compartido preview/generación con **una** consulta de solapes y **una** lectura paginada de pagos para todas las cooperativas (sin N+1); por **`verificado_at`** (aprobación, hora VE); sumas en centavos; incluye `SUSPENDIDA`/`DESACTIVADA` con ventas; validación de fechas reales, período ≤ 1 año, **no se genera un ciclo que incluya hoy**, `cooperativa_id` uuid o `all`; si el respaldo sin RPC supera 200 000 pagos devuelve un error claro en vez de un total recortado. Intenta primero la RPC `fn_admin_totales_comision` (propuesta abajo) y cae al respaldo si no existe. `marcarCicloComoPagado` valida uuid y fecha real (el doble pago ya estaba cubierto con `UPDATE … WHERE pagado = false`).
- **Ciclos** (`admin-comisiones.ts`, `ciclos-table.tsx`, `comisiones/page.tsx`): lectura paginada (tope 20 000, aviso si se recorta), totales de la tabla en centavos, selector con activas/suspendidas/desactivadas y error propagado a `error.tsx`.
- **Dashboard** (`admin-dashboard.ts`): pagos del día leídos completos (paginados); actividad, top 5 y rutas desde una sola función cacheada por petición que usa la RPC `fn_admin_dashboard_actividad` si existe, y si no: 60 conteos HEAD exactos (10 en paralelo) para la actividad y lectura paginada con tope 20 000 para top/rutas (aviso en el log si se recorta); boletos vendidos = `PAGADO` + `USADO`; balance con filtro embebido `comisiones_ciclo.pagado = false` y suma en centavos; KPIs de conteo muestran "—" si la consulta falla (antes 0).
- **Incidencias** (server-side completo): `fetchIncidencias` pagina de 50 en el servidor con el orden de atención exacto (un conteo por grupo de prioridad alta/media/baja con las mismas reglas que `prioridadIncidencia`, y solo se leen las filas de la página, antigüedad ascendente). Búsqueda en el servidor: descripción, `INC-XXXXXX` (rango de uuid por prefijo), `EB-…` y `BOL-…` (resueltos a ids) y nombre de quien reportó. `incidencias-table.tsx` pasa a formulario de búsqueda + paginación por URL (`?q=&pagina=`), como Usuarios. Actions: uuid, largo máximo de textos, no se abre una segunda pérdida sin resolver de la misma encomienda, el seguro solo se aplica `EN_PROCESO`, monto redondeado al centavo.
- **Solicitudes**: la aprobación cambia primero el estado (RPC con `FOR UPDATE`) y, si la RPC responde `ya_procesado`, devuelve "ya resuelta" sin tocar la comisión ni enviar correo; luego guarda la comisión. El rechazo tampoco repite el correo. `fetchSolicitudes` consulta perfiles/invitaciones en grupos de 100 ids y filtra las invitaciones vigentes en la base.
- **Usuarios**: detalle con las 100 más recientes por lista + conteo exacto (pestañas con el total y aviso si se recorta), teléfono entre comillas en el `or`, `tiene_pin` en vez del PIN, Auth con concurrencia 10, bajas pendientes con conteo exacto y `.in()` acotado a 300 ids. `reenviarPIN`: no en encomiendas cerradas, límite de 3 reenvíos por encomienda cada 15 min con `fn_consumir_limite` (service role; si falla, no bloquea). Suspensión: uuid y motivo ≤ 500.
- **Cooperativas**: validación de nombre/correo, invitación vigente (sin revocadas) antes de crear otra (también en el alta), cooperativa existente y no desactivada para invitar, extensión del logo por MIME, lista blanca de estados, update de id inexistente → error; detalle con las 50 reseñas más recientes (el título usa `total_calificaciones`), Auth con concurrencia 10, comisiones pendientes en centavos.
- **Tarifas**: historial limitado a 200, rutas del simulador ordenadas, simulador con el mismo redondeo que `_costo_encomienda`, ids validados.
- **Encomiendas**: uuid y largo del código/motivo validados.

## 3. Qué NO se arregló y por qué

- **Suspender una cuenta no corta la sesión ya abierta**: `ban_duration` impide refrescar, pero el access token sigue valiendo hasta su vencimiento (≤ 1 h). Supabase no permite cerrar las sesiones de otro usuario sin su JWT; hacerlo bien requiere una RPC/edge function que borre sus filas de `auth.sessions` (ver §4).
- **Un super admin puede suspender a otro super admin** (solo se impide suspenderse a sí mismo): es decisión de negocio.
- **Correos de Auth por perfil** (`getUserById` uno a uno, ahora con concurrencia 10): no hay consulta por lote sin una RPC (ver §4).
- **Ciclos de comisiones**: la tabla sigue filtrando en el cliente (ahora sobre todos los ciclos hasta 20 000); paginarla en el servidor implica rehacer los totales y el CSV. Con 50 cooperativas semanales son ~2 600 ciclos/año: margen de años.
- **Pago de un boleto múltiple**: el ciclo usa `pagos.boleto_id` (un boleto); si una compra de varios asientos cancela justo ese boleto, todo el pago queda fuera. Regla de negocio a definir junto con la RPC.
- Las RPC/índices propuestos no se aplicaron (solo el agente de base de datos escribe en la base); el código funciona sin ellos con los respaldos descritos.

## 4. Problemas fuera de mi zona

### Base de datos (para el agente de BD)

1. **RPC `fn_admin_totales_comision`** (el código ya la llama y cae al respaldo con `PGRST202`): suma en Postgres en vez de leer todos los pagos.
   ```sql
   create or replace function public.fn_admin_totales_comision(p_desde date, p_hasta date, p_cooperativa_id uuid default null)
   returns table(cooperativa_id uuid, total_boletos numeric, total_encomiendas numeric)
   language plpgsql stable security definer set search_path = public, pg_temp as $$
   begin
     if not coalesce(public.is_super_admin(), false) then
       perform public._fallar('EB_SIN_PERMISO', 'Solo el equipo de EnBus puede calcular comisiones.');
     end if;
     return query
     select p.cooperativa_id,
            coalesce(sum(p.monto) filter (where p.boleto_id is not null and b.estado <> 'CANCELADO'), 0),
            coalesce(sum(p.monto) filter (where p.boleto_id is null and p.encomienda_id is not null and e.estado <> 'CANCELADA'), 0)
       from public.pagos p
       left join public.boletos b on b.id = p.boleto_id
       left join public.encomiendas e on e.id = p.encomienda_id
      where p.verificado
        and p.verificado_at >= (p_desde::timestamp at time zone 'America/Caracas')
        and p.verificado_at <  ((p_hasta + 1)::timestamp at time zone 'America/Caracas')
        and (p_cooperativa_id is null or p.cooperativa_id = p_cooperativa_id)
      group by p.cooperativa_id;
   end $$;
   revoke all on function public.fn_admin_totales_comision(date, date, uuid) from public, anon;
   grant execute on function public.fn_admin_totales_comision(date, date, uuid) to authenticated;
   ```
2. **RPC `fn_admin_dashboard_actividad(p_dias integer default 30) returns jsonb`** (el código ya la llama): `{actividad:[{fecha:'YYYY-MM-DD',encomiendas,boletos}], top_cooperativas:[{cooperativa_id,nombre,total}], rutas:[{ciudad_origen,ciudad_destino,total}]}`. Guard `is_super_admin()`, `v_hoy := (now() at time zone 'America/Caracas')::date`, `v_desde := (v_hoy - (least(greatest(p_dias,1),90) - 1))::timestamp at time zone 'America/Caracas'`. Cuerpo probado como SELECT de solo lectura contra la base (ver `scratchpad/admin/test_dash.sql`): actividad con `generate_series` + `count(*)` agrupado por `(created_at at time zone 'America/Caracas')::date` (boletos con `estado in ('PAGADO','USADO')`); top 5 = `cooperativas` left join conteos de encomiendas y boletos vendidos desde `v_desde`, `order by total desc, nombre limit 5`; rutas = encomiendas desde `v_desde` agrupadas por `normalizar_localidad(ciudad_origen), normalizar_localidad(ciudad_destino)` con `min(ciudad_*)`, top 5. `revoke … from public, anon; grant execute … to authenticated`.
3. **Índices**: `pagos (verificado_at) where verificado` (KPIs del día y comisiones; hoy no hay índice en `verificado_at`), `incidencias (estado, created_at)` (lista paginada por antigüedad), y si no se crea la RPC 2, `boletos (estado, created_at)`.
4. **Solape de ciclos**: hoy solo hay `UNIQUE (cooperativa_id, periodo_inicio, periodo_fin)`; dos generaciones simultáneas con períodos solapados distintos se insertan las dos. Propuesta: `create extension if not exists btree_gist; alter table comisiones_ciclo add constraint ex_comisiones_ciclo_solape exclude using gist (cooperativa_id with =, daterange(periodo_inicio, periodo_fin, '[]') with &&);` (el código ya trata `23P01` como "otro admin lo generó").
5. **Pérdida duplicada**: `create unique index uq_incidencia_perdida_abierta on incidencias (encomienda_id) where tipo = 'PERDIDA' and estado <> 'RESUELTA';` (el código ya lo comprueba, pero con carrera).
6. `user_role()` / `is_super_admin()` no miran `profiles.eliminada_at`: una cuenta de super admin eliminada desde la app conserva permisos en las RPC/RLS hasta que se borra de Auth. Propuesta: `… where id = auth.uid() and eliminada_at is null`.
7. (Opcional) RPC `fn_admin_datos_auth(p_ids uuid[])` SECURITY DEFINER (solo super admin) que devuelva `id, email, banned_until` desde `auth.users`, para quitar el `getUserById` por perfil en Usuarios y en el detalle de cooperativa; y otra para cerrar sesiones de un usuario suspendido (`delete from auth.sessions where user_id = …`).
8. `invitaciones`: no hay restricción contra dos invitaciones vigentes para el mismo correo (carrera entre dos admins); el código lo comprueba antes de insertar.

### Archivos compartidos (para el otro agente)

- `src/lib/supabase/auth-guards.ts`: ya **no lo usa nadie** en el admin (usaba `getSession()` sin verificar). Conviene borrarlo o reescribirlo con `getClaims()` como `lib/data/admin-auth.ts`.
- `src/lib/supabase/cached.ts` (`getUserProfile`) y `src/lib/supabase/middleware.ts`: el comentario "Safe because middleware already validated with getUser()" es falso (el middleware usa `getSession()`, que no valida el JWT). Si el panel de cooperativas autoriza con `getUserProfile`, tiene el mismo riesgo que el #2.
- `src/lib/supabase/middleware.ts:39`: con sesión en `/admin/login` redirige a `/admin/dashboard` sin mirar el rol (origen del bucle #3; ya resuelto en el layout, pero sería más limpio no redirigir desde el login si no es super admin).
- `src/components/admin-sidebar.tsx:86` (fuera de `components/admin/**`): `handleSignOut` no mira el error de `signOut()` (sin red, navega al login con la sesión abierta); el de cooperativas (`app-sidebar.tsx:51`) sí lo hace.

## 5. Verificación (en `PanelCooperativas/`)

- `npx tsc --noEmit` → sin errores.
- `npx eslint` → 0 errores, 0 avisos.
- `npm run build` → OK (Next 16.2.4; rutas `/admin/*` dinámicas, nueva `ƒ /admin/auth/salir`).
- Consultas de solo lectura a la base para columnas/relaciones/RPC; filtros `or` anidados y embebidos validados con la API REST (respuesta 200).
- No hay `.env.local` en el subproyecto, así que no se probó en ejecución (login real).

## 6. Para el usuario

- Decidir si un super admin puede suspender a otro super admin.
- Decidir la regla de comisión para compras de varios boletos con un boleto cancelado (ver §3).
- Que el agente de BD aplique las RPC 1 y 2 y los índices de §4 (sin ellas el panel funciona con los respaldos, más lentos con mucho volumen).
- Cambio de comportamiento: los ciclos se calculan por **fecha de aprobación** del pago (`verificado_at`) y ya no se puede generar un ciclo que termine hoy o después.
