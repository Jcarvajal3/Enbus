# Auditoría de robustez · Base de datos (Supabase `tydpnvajwfzcsxsowctp`)

Zona: `supabase/migrations/` y esquema real. Fecha: 2026-11-03.

## 0. Resumen

- **Deriva repo ↔ base:** ninguna en funciones (cuerpos de las 98 funciones de `public` idénticos a la última definición del repo), políticas ni triggers. Única deriva: `20260719000006` (cierre de escrituras directas) estaba aplicada en la base pero condicionada a una variable de sesión, así que un `supabase db reset` no la aplicaba. Ahora la aplica sin condiciones `20261103000002`.
- Se aplicaron **10 migraciones nuevas**, registradas en `supabase_migrations.schema_migrations` con `statements`, y después `NOTIFY pgrst, 'reload schema'`.
- **Advisors: seguridad 106 → 50 y rendimiento 144 → 54.** Los avisos que quedan son intencionales (ver §2).
- **Pruebas:** 63 comprobaciones en 5 scripts (`supabase/tests/robustez/`), más una prueba de concurrencia real con dos conexiones a la vez. Todas pasan.

### Advisors antes / después

| Lint | Nivel | Antes | Después |
|---|---|---:|---:|
| authenticated_security_definer_function_executable | WARN | 59 | 48 (RPC pensadas para el cliente, todas validan rol y propiedad dentro) |
| anon_security_definer_function_executable | WARN | 18 | 1 (`fn_cotizar_envio_publico`, cotizador público) |
| function_search_path_mutable | WARN | 26 | 0 |
| extension_in_public (pg_net) | WARN | 1 | 0 |
| rls_enabled_no_policy (limites_uso) | INFO | 1 | 0 |
| auth_leaked_password_protection | WARN | 1 | 1 (configuración de Auth, ver §6) |
| auth_rls_initplan | WARN | 22 | 0 |
| multiple_permissive_policies | WARN | 80 | 0 |
| unindexed_foreign_keys | INFO | 14 | 0 |
| unused_index | INFO | 28 | 54 (índices nuevos sin uso todavía: hay pocos datos) |
| **Total seguridad / rendimiento** | | **106 / 144** | **50 / 54** |

### Migraciones aplicadas (en orden)

| Versión | Archivo | Contenido |
|---|---|---|
| 20261103000001 | `robustez_permisos.sql` | `search_path` fijo en todas las funciones; EXECUTE revocado a anon y authenticated en las funciones de trigger y de cron; `fn_tasa_bcv_vigente` y `fn_sucursales_en_ciudad` pasan a SECURITY INVOKER; `fn_rutas_populares` y `fn_estadisticas_publicas` solo para service role; anon sin INSERT/UPDATE/DELETE; nadie con TRUNCATE; pg_net movida a `extensions`; borrado de `vincular_pago_legado_fn` |
| 20261103000002 | `robustez_rls.sql` | RLS reescrita: una política por tabla y acción, `TO authenticated`, funciones dentro de `(select …)`; cierres de invitaciones, calificaciones, viajes, boletos y pagos, y Storage de fotos; anon sin EXECUTE en `user_role`, `user_cooperativa_id` e `is_super_admin` (incluye una comprobación de que ninguna política de anon las usa) |
| 20261103000003 | `robustez_integridad.sql` | PIN sin UNIQUE global y con aleatoriedad criptográfica; CHECK de montos y rangos; triggers de escritura directa (viajes, personal en encomiendas, alta desde la app); candado por referencia de pago; promedio de calificaciones sin carreras; `handle_new_user` a prueba de altas simultáneas; una sola alerta amarilla por encomienda |
| 20261103000004 | `robustez_concurrencia_crons.sql` | Orden de candados viaje → boleto (`fn_cancelar_boleto`, `fn_liberar_reserva`, `auto_expirar_reserva`); expiración por lotes; idempotencia simultánea en `fn_registrar_encomienda_taquilla`; `calcular_dias_habiles` en hora de Venezuela; devolución y alerta en una sola sentencia con SKIP LOCKED; `fn_tomar_notificaciones_pendientes` y limpieza diaria de la cola |
| 20261103000005 | `robustez_indices.sql` | Se quitan 8 índices duplicados; índices compuestos para las consultas de la app y del panel, para las búsquedas por código y para las FK |
| 20261103000006 | `robustez_avisos_encomienda.sql` | Avisos (bandeja y push) al pasar a EN_TRANSITO y a EN_OFICINA_DESTINO (este último con el PIN) |
| 20261103000007 | `robustez_push_y_crons_http.sql` | Pedidos de edge functions: `expo_ticket_id` y `receipt_revisado_at`; un token push en un solo perfil; crons HTTP con 30 s de espera; `tracking_id` aleatorio criptográfico y con reintentos acotados; `fn_rastrear_encomienda_publico` usa el índice |
| 20261103000008 | `robustez_admin.sql` | Pedidos del super admin: `fn_admin_totales_comision`, `fn_admin_dashboard_actividad`, EXCLUDE contra ciclos de comisión solapados, una sola pérdida abierta por encomienda, índices; las funciones de RLS ignoran perfiles eliminados |
| 20261103000009 | `robustez_app.sql` | Pedidos de la app: trigger de calificaciones, `fn_registrar_push_token`, `fn_validar_embarque` por índices (UNION) |
| 20261103000010 | `robustez_panel.sql` | Pedidos del panel: una cooperativa no ACTIVA no vende boletos ni acepta encomiendas nuevas; personal desactivado rechazado en `_contexto_staff`; `fn_cerrar_sesiones_usuario`; índices del panel |

Todas son re-ejecutables (`create or replace`, `if not exists`, `drop … if exists`). No se editó ninguna migración antigua. Las firmas de las RPC existentes no cambiaron; solo se añadieron funciones nuevas.

## 1. Bugs y riesgos encontrados (todos arreglados salvo §3)

| # | Severidad | Dónde | Problema | Arreglo |
|---|---|---|---|---|
| 1 | **Crítica** | `20260414000002_tables.sql:177` (`pin_retiro CHAR(4) UNIQUE`) y `20260414000005_triggers.sql:57-80` | El PIN era único en toda la tabla y solo hay 10.000 valores posibles. Cada encomienda conserva su PIN después de entregarse. Al llegar a unas 10.000 encomiendas con PIN, `generar_pin_retiro_fn` entra en un bucle infinito y la recepción de paquetes se cuelga. Antes de llegar ahí ya hay cada vez más reintentos. Ningún cliente ni RPC busca una encomienda solo por su PIN (verificado con grep). | 0003: se quita el UNIQUE. El PIN se genera con `gen_random_uuid()` (pg_strong_random), sin bucle, y hay un CHECK de formato |
| 2 | **Crítica** | `20260503000001_invitaciones.sql:20-24` | Un admin de cooperativa podía insertar por la API una invitación para **otra** cooperativa, o con rol `super_admin`, y aceptarla con otro correo: escalada de privilegios | 0002: la política exige `creado_por = auth.uid()`, rol taquillero o admin, la cooperativa propia y una sucursal de esa cooperativa |
| 3 | Alta | `20260414000004_rls_policies.sql:46` (`Modificar viajes cooperativa`, FOR ALL) | Cualquier empleado, también el taquillero, podía hacer UPDATE o DELETE de viajes (estado, `asientos_disponibles`, cancelar sin reembolsos) | 0002 + 0003: solo el admin inserta (un trigger valida la ruta propia y activa, la salida futura, el estado y los asientos). El resto va por RPC |
| 4 | Alta | `…_rls_policies.sql:56` (`Taquillero actualiza de su cooperativa`) | El personal podía cambiar por la API costo, peso, modalidad, datos del destinatario, o pasar POR_PAGAR → PAGADA sin pago | 0003: el trigger `aa_proteger_encomiendas_staff` solo deja cambiar la llegada (EN_TRANSITO → EN_OFICINA_DESTINO) y la foto |
| 5 | Alta | `…_rls_policies.sql:71` | Calificaciones: se podía calificar a cualquier cooperativa con un boleto propio, o antes de viajar, y cambiar boleto o cooperativa al editar | 0002 + 0009: boleto propio, USADO y de esa cooperativa; la cooperativa se toma del boleto; boleto, usuario y cooperativa no cambian al editar |
| 6 | Alta | `20260414000007_storage.sql:26-28` | Cualquier usuario autenticado leía y listaba las fotos de todos los paquetes | 0002: puede verlas la carpeta propia, las partes de la encomienda, el personal de su cooperativa y el super admin; las guías siguen solo para el personal |
| 7 | Alta | `20260719000003_fase2_rpc_boletos.sql:347,261,659` | Deadlock 40P01: `fn_cancelar_boleto`, `fn_liberar_reserva` y `auto_expirar_reserva` bloqueaban el boleto y luego, por el trigger `actualizar_asientos`, el viaje. `_asegurar_asientos` bloquea en orden contrario (viaje y luego boletos) | 0004: todas bloquean primero los viajes, ordenados por id |
| 8 | Alta | `20260719000004:87`, `20260720000003:256` | Dos pagos con la misma referencia a la vez pasaban los dos (comprobación seguida de inserción, sin candado) | 0003: trigger `aa_referencia_unica_pago` con `pg_advisory_xact_lock` por cooperativa y referencia. Probado con dos conexiones simultáneas |
| 9 | Alta | `_contexto_staff` (`20260719000001`) y las 4 RPC de venta y alta | Cooperativas SUSPENDIDA, DESACTIVADA o PENDIENTE seguían vendiendo en taquilla y recibiendo encomiendas nuevas (Spec State_Machines:210) | 0010: triggers sobre INSERT en boletos y encomiendas, y sobre la recepción en origen → `EB_COOPERATIVA_NO_OPERATIVA`. Lo que ya está en curso termina su ciclo |
| 10 | Alta | Spec Notifications §2, `recepcion-destino/actions.ts:105` | Nadie avisaba al despachar ni al llegar a la oficina de destino. El comentario del panel supone un trigger que no existía | 0006: trigger `avisar_estado_encomienda` (bandeja + push con PIN al destinatario) |
| 11 | Media | `20260414000005:32-49` y `…_triggers.sql` | `tracking_id` con la fecha UTC (de 8 p. m. a medianoche de Venezuela salía con la fecha de mañana), con `random()` predecible y con un bucle sin tope | 0003 + 0007: fecha de Venezuela, aleatoriedad criptográfica, 50 reintentos y luego `EB_TRACKING_NO_DISPONIBLE`. El formato `EB-AAMMDD-NNNNN` no cambia |
| 12 | Media | `20260524182500_exact_devolution_days.sql:2-26` | `calcular_dias_habiles` usaba la fecha UTC, así que la devolución automática y los "días en oficina" se desfasaban un día | 0004: fechas de America/Caracas |
| 13 | Media | `20260414000005:100-118` | Dos calificaciones simultáneas dejaban el promedio sin una de ellas | 0003: se bloquea la cooperativa antes de recalcular; al editar también se recalcula la cooperativa anterior |
| 14 | Media | `20260720000004:30` | Doble clic simultáneo en el alta de taquilla → error 23505 en lugar de la respuesta idempotente | 0004: candado consultivo por (empleado, clave) |
| 15 | Media | `20260721000003:112` | Dos registros simultáneos con la misma cédula o teléfono → "Database error saving new user" | 0003: si choca, guarda el marcador `PENDIENTE-<id>` |
| 16 | Media | `user_role()` / `is_super_admin()` (`…000003_rls_functions.sql`) | Una cuenta eliminada conservaba sus permisos | 0008: se ignoran los perfiles con `eliminada_at` |
| 17 | Media | Empleado desactivado (ban en Auth) | Su JWT seguía sirviendo para las RPC | 0010: `_contexto_staff` rechaza a los usuarios baneados; RPC `fn_cerrar_sesiones_usuario` |
| 18 | Media | `20260414000008` (funciones de cron) y triggers | anon y authenticated podían ejecutar por `/rest/v1/rpc` `auto_devolver_encomienda`, `alerta_amarilla_72h` y las funciones de trigger SECURITY DEFINER | 0001: revocado |
| 19 | Media | Encomiendas creadas desde la app (`proteger_encomiendas_cliente_fn`) | Se podían crear envíos a cooperativas suspendidas o sin ruta, con datos inválidos o sin límite (spam) | 0003: trigger `ab_validar_encomienda_app` (cooperativa ACTIVA, ruta activa, cédula y teléfono válidos, foto en la carpeta propia, máximo 30 por día y 15 abiertas) |
| 20 | Media | Cola `pending_notifications` | Dos ejecuciones solapadas de la edge function podían mandar el mismo push dos veces, y la cola crecía sin límite | 0004: `fn_tomar_notificaciones_pendientes` (SKIP LOCKED con plazo de reserva) y limpieza diaria |
| 21 | Media | Token push compartido entre dos perfiles en el mismo teléfono | El teléfono recibía los avisos (con PIN) de las dos cuentas | 0007 (trigger) + 0009 (`fn_registrar_push_token`) |
| 22 | Media | Rendimiento | 22 políticas evaluaban `auth.uid()` fila a fila; 80 políticas permisivas se solapaban; había recorridos completos en el rastreo público (`upper(tracking_id)`) y en el escaneo de embarque (4 OR); faltaban índices compuestos para las listas y 14 FK no tenían índice | 0002, 0005, 0007, 0009, 0010 |
| 23 | Baja | Deriva por `20260719000006` condicionada | Un `db reset` dejaba abiertos INSERT y UPDATE de boletos y pagos | 0002 lo aplica sin condiciones |
| 24 | Baja | CHECK que faltaban | No había restricciones de rango en asientos, montos, comisión, tarifas ni estado de incidencia, y `chk_pagos_montos` estaba NOT VALID | 0003 (los datos actuales ya las cumplían) |
| 25 | Baja | Cron de devolución a las 02:00 de Venezuela (`0 6 * * *` UTC) | Corría de madrugada y sin lotes | 0004: 06:05 VET y repaso cada hora hasta las 10:05; idempotente |

**Revisado y correcto:** reserva y compra de asientos (candado del viaje + índice único parcial), aprobar y rechazar pagos (FOR UPDATE del pago), doble reembolso (FOR UPDATE + `NOT reembolso_procesado`), entrega con PIN (validación de 15 minutos), límites de uso (`INSERT … ON CONFLICT` atómico) y unicidad de comisiones.

## 2. Avisos que quedan (intencionales)

- **48 RPC SECURITY DEFINER ejecutables por authenticated:** son las RPC que llaman la app y el panel. Revisé que cada una valida dentro el rol y la propiedad: `_uid_usuario`, `_contexto_staff` (que ahora también rechaza baneados), `is_super_admin()`, o la condición `auth.uid() IN (sender, receiver)`. `user_role`, `user_cooperativa_id` e `is_super_admin` tienen que seguir siendo ejecutables por authenticated porque las usa la RLS.
- **`fn_cotizar_envio_publico` ejecutable por anon:** es el cotizador público.

## 3. No arreglado, y por qué

- **El personal puede leer `encomiendas.pin_retiro` con SELECT** (lo señaló el panel). La taquilla de origen ya conoce el PIN por diseño: lo devuelve `fn_registrar_encomienda_taquilla` y va impreso en la guía. Revocar la columna rompe todos los `select('*')` de la app y del panel. Propuesta, que exige cambiar clientes: `REVOKE SELECT ON encomiendas FROM authenticated`, dar GRANT por columnas sin `pin_retiro` y crear una RPC `fn_pin_retiro(id)` para el remitente y el destinatario.
- **Cualquier autenticado puede leer columnas de negocio de `cooperativas`** (`comision_porcentaje`, `motivo_estado`, `mensaje_registro`). Restringirlo por columna rompería al panel, que lee la cooperativa con el cliente de usuario. Requiere una vista pública.
- **`viajes` y `rutas` de cooperativas no ACTIVA siguen visibles en la RLS:** hacen falta para "Mis boletos" y para el historial. Las RPC de venta ya las bloquean. El buscador de la app debería filtrar `cooperativas.estado = 'ACTIVA'`, como hace `v_proximos_viajes`.
- **Normalizar ciudades con un trigger en `rutas` y `sucursales`:** las rutas ya están normalizadas (0 de 2 sin normalizar). En sucursales el texto se muestra tal cual, y todas las comparaciones usan `normalizar_localidad()`.
- **Formato del `tracking_id`:** se mantienen 100.000 códigos por día y por formato, porque lo validan `shared/artefactos.ts`, la app, el panel, la landing y las funciones. El rastreo público no expone datos personales. Si se quiere más espacio hay que cambiar `TRACKING_RE` en todos los clientes.
- **Ya no se puede registrar dos invitaciones vigentes para el mismo correo:** no lo restringí; el admin lo comprueba antes de insertar. **`fn_resumen_cooperativa`** y **`fn_admin_datos_auth`** (son de prioridad baja u opcionales) no se crearon.
- **Recordatorio de viaje 24 h antes (Spec §3):** no existe ningún cron que lo envíe. Es una funcionalidad nueva, no un bug.
- **`supabase db reset` desde cero no se probó:** no hay Docker ni un Postgres 17 con los esquemas de Supabase en este entorno. Cada migración se ejecutó primero en seco en la base real (transacción con ROLLBACK) y luego se aplicó.

## 4. Fuera de mi zona (para otros agentes)

- **Edge functions:**
  - `fn_tomar_notificaciones_pendientes(p_limite, p_segundos)` ya está aplicada (solo service role).
  - `calcular-costo-encomienda` (función antigua, ningún cliente la llama) **ahora falla**: hace UPDATE directo de `costo_calculado` y `estado` con el JWT del empleado, y el trigger 0003 lo bloquea. Hay que borrarla o redirigirla a `fn_confirmar_recepcion_origen`.
  - WhatsApp al destinatario sin cuenta cuando la encomienda llega (§2.2 de la Spec): sigue pendiente; el trigger 0006 solo avisa por bandeja y push a quien tiene cuenta.
- **App:**
  - Usar `rpc('fn_registrar_push_token', { p_token })` al iniciar sesión y `p_token: null` al cerrarla (ya está creada).
  - Códigos nuevos que mostrar con su `hint`: `EB_COOPERATIVA_NO_DISPONIBLE`, `EB_SIN_RUTA`, `EB_DEMASIADAS_ENCOMIENDAS`, `EB_DATOS_INVALIDOS` (al crear encomiendas) y `EB_COOPERATIVA_NO_OPERATIVA`.
  - El buscador de viajes debería filtrar las cooperativas ACTIVA.
- **Panel:**
  - Al desactivar un empleado, llamar a `rpc('fn_cerrar_sesiones_usuario', { p_usuario_id })` (sirve el cliente del admin o el service role).
  - Mostrar el hint de `EB_COOPERATIVA_NO_OPERATIVA` y `EB_OPERACION_NO_PERMITIDA`.
  - Ya existen `fn_admin_totales_comision` y `fn_admin_dashboard_actividad` (con las firmas y JSON que espera el código) y el EXCLUDE `ex_comisiones_ciclo_solape` (23P01).
  - Programar viajes con UPDATE o DELETE directo ya no está permitido: solo INSERT del admin.
- **Landing:** `fn_rutas_populares` y `fn_estadisticas_publicas` solo se pueden ejecutar con service role (ya las usa así).

## 5. Verificación

- Antes de aplicar cada migración: ejecución en seco en la base real dentro de BEGIN … ROLLBACK, sin errores. Aplicación en orden, filas en `schema_migrations` (versiones 20261103000001…10, con `statements`) y `NOTIFY pgrst`.
- `supabase/tests/robustez/run.sh 01_… 02_… 03_… 05_…` → **63 `ok`, 0 fallos**. Las pruebas usan BEGIN … ROLLBACK, `set local role authenticated`/`anon` y los claims del JWT. Cubren, entre otros:
  - no se vende dos veces el mismo asiento y el contador de asientos cuadra;
  - P2 no ve los boletos de P1;
  - la cooperativa B no ve encomiendas, fotos ni guías de A;
  - el taquillero no cambia viajes ni costos;
  - las invitaciones no escalan privilegios;
  - anon no lee tablas;
  - los PIN y los tracking se generan sin choques;
  - días hábiles, avisos y referencia repetida;
  - una cooperativa suspendida no vende;
  - un empleado baneado queda rechazado;
  - token push, calificaciones y RPC de admin.
- `supabase/tests/robustez/04_concurrencia.sh` (dos conexiones reales a la vez; confirma los datos de prueba y los borra al final):
  - mismo asiento → uno lo obtiene y el otro recibe `EB_ASIENTO_OCUPADO`; contador 30 → 29;
  - misma referencia → el segundo recibe `EB_REFERENCIA_REPETIDA`.

  Limpieza comprobada: 0 filas restantes.
- Las pruebas encontraron un error mío: el primer trigger 0010 fallaba en todo INSERT de boletos (literal de enum de encomiendas evaluado con el tipo de boletos). Estuvo activo unos minutos, sin usuarios. Lo corregí (IF anidados), lo volví a aplicar y lo registré.
- Tras los cambios: los crons corren bien (`cron.job_run_details` en `succeeded`) y pg_net en `extensions` responde HTTP 200 con `timed_out = false`.
- Advisors: ver la tabla de §0.

## 6. Necesita al usuario

- **Contraseñas filtradas (HIBP):** activar en Auth → Settings → "Leaked password protection" (depende del plan). Hoy `password_min_length = 6`, aunque el panel exige 8.
- **Cambiar la clave de los crons a `sb_secret_…`** (la service_role JWT legacy quedó expuesta en el repo). Los crons leen el secreto del vault y no lo incrustan, así que basta con una sentencia:
  ```sql
  select vault.update_secret((select id from vault.secrets where name = 'service_role_key'), 'sb_secret_XXXXXXXX');
  ```
  Después, comprobar `select status_code from net._http_response order by created desc limit 3;` (debe dar 200).
- **Decisiones de negocio:**
  - Con estos cambios, una cooperativa **SUSPENDIDA** tampoco vende en taquilla ni recibe envíos nuevos (antes la etiqueta decía "no puede vender en la app"). Lo mismo PENDIENTE y RECHAZADA.
  - La devolución automática corre a las 06:05 de Venezuela.
  - Límite de la app: 30 encomiendas por día y 15 sin llevar a la taquilla por usuario.
