# Fase 4 (P2 y P3) — Especificación de implementación

Repositorio: `C:\Users\Javie\Documents\Dev\Panas Cargo` · rama `ux/mejoras-auditoria` (fases 1, 2 y 3 aplicadas sin commit).
Alcance: mejoras P2 #43–#55, P3 #56–#60 y los pendientes de `Audits/pendientes_fase3.md` que se deciden en §6. Es la última fase del plan.
Decisión de negocio vigente: **precios de referencia en USD, cobro en Bs a la tasa BCV del día** (`dinero.ts`, `<Monto>`, `fn_tasa_bcv_vigente`).

Reglas para todos los clusters (iguales a la fase 3): editar solo los archivos propios; nada de git commit/checkout/stash/reset; no tocar `EnBusApp/app.json` ni `.gitignore`; sin Docker, sin `supabase start`, sin `db push`/`link`/`functions deploy`/`--linked`; sin servidores de desarrollo; sin dependencias nuevas. En Next.js 16 leer `node_modules/next/dist/docs/` antes de usar APIs de servidor, caché, revalidación, `headers()`, `opengraph-image`, `robots` o `sitemap`. Copy en español de Venezuela, con tildes, claro y accionable. Reutilizar (no duplicar): `EnBusApp/src/utils/{errores,dinero,estados,formatters,validation,ids,codigos,soporte,fotos}.ts`, `src/components/ui/*` (`Monto`, `Badge`, `Text` con `primaryText/successText/warningText/infoText/dangerText`, `ErrorState`, `StaleBanner`), `src/hooks/{useTasaBCV,useWizardBack,useCheckoutBoletos,usePerfil,useRealtime}.ts`; `PanelCooperativas/src/lib/{errores,fechas,rif,dinero,tasa-bcv,estados,ve,bancos,fotos,ciudades}.ts`, `components/{monto,status-badge,tasa-bcv-provider,confirm-dialog,error-state,empty-state,page-header}.tsx`, `components/pagos/verificar-pago-dialog.tsx`; `LandingEnBus/lib/{rif,dinero,estados,urls,consultas}.ts`.

---

## 0. Qué está realmente pendiente (verificado en el código actual)

| # | Ya hecho en fases 1–3 (no repetir) | Pendiente que cubre esta fase |
|---|---|---|
| 43 Escaneo experto en el panel | `ScanInput` solo se reenfoca con el foco libre (P-12), placeholder en español y búsqueda en mayúsculas (P-13), escáner deshabilitado con cualquier diálogo abierto en taquilla de boletos (PC-20), `autoFocus` + Enter en "Confirmar embarque" (PC-19, opción B), peso con `autoFocus` y Enter en recepción (PC-27), PIN con `autoFocus`. | No hay sonido en todo el panel; "Último escaneo" es solo una línea de texto en taquilla de boletos ("Último embarque") y no existe en encomiendas, despacho, recepción ni entrega; `ScanInput` borra el código cuando no encuentra la encomienda (pendiente fase 3); revisar Enter/Esc en los diálogos de despacho, recepción por lote y entrega. |
| 44 Inicio | Campana y perfil en la cabecera de Inicio; tarjetas "Boletos activos" / "Encomiendas activas". | Tarjeta "Tu próximo viaje" con acceso al pase (APP-16); campana y perfil también en Boletos y Encomiendas (APP-09); espaciador del hero de 96 pt (APP-17). |
| 45 Búsqueda | Misma ciudad bloquea con motivo; el botón deshabilitado dice qué falta; si fallan las fechas no se bloquea; aviso de fecha ajustada. | Origen y destino lado a lado (truncan) y swap de 34 pt (APP-14); selector sin recientes, populares ni foco automático, y no excluye la ciudad ya elegida (APP-15, M-08); ruta sin salidas sin alternativa (M-09, APP-13); copy "Próxima salida disponible…" (APP-13); calendario sin atajos, con "Confirmar fecha" y meses pasados (APP-18). |
| 46 Resultados | `<Monto>` con USD y Bs; error de red con "Reintentar". | Hora de llegada (ya existe `viajes.fecha_hora_llegada_est`); "Quedan 3" (APP-20); tocar la tarjeta lleva a asientos, hoy hacen falta dos toques (APP-21); orden escondido en una hoja (APP-21); códigos de ciudad tipo aeropuerto en `RouteSummary` (APP-58); píldora con la inicial de la cooperativa sin valor. |
| 47 Asientos en tiempo real | Reserva antes del pago (fase 2), `ReservaEstado` con temporizador en los pasos 3 y 4 (M-18), aviso "El asiento 14 acaba de ser tomado" (M-14), ocupados por `fn_asientos_ocupados`, canal realtime de `viajes` en `buscar`. **Verificado.** | `viajes` y `pagos` no están en la publicación `supabase_realtime` (migración 02); W2-APP-VIAJES confirma que los ocupados se limpian al cambiar de salida (M-17) y el hueco de `usePerfil` cargando (pendiente fase 3). |
| 48 Mis boletos | Subtítulo con la salida (M-34), iconos por tipo en vez de letras (M-35). **Verificado.** | Orden: activos por salida ascendente, historial descendente (APP-36; hoy por `created_at`). |
| 49 Notificaciones | `ErrorState`/`StaleBanner`; tocar una fila con recurso abre el boleto o la encomienda. | La push abre la lista (M-53, APP-49); todos con el mismo icono, sin agrupar por día, fecha sin hora, `PulseDot` infinito (APP-50); mensaje cortado a 2 líneas y "Marcar todas" solo como icono (M-54); los toasts de error desaparecen a los 3,5 s (APP-51); no hay columna de tipo en `notificaciones_usuario`. |
| 50 Perfil | Cierre de sesión con confirmación (M-55), versión con `expo-constants`, sección Ayuda. | Cambiar contraseña, eliminar cuenta (Google Play), términos y privacidad, preferencias de notificación (las columnas `notif_*` existen y nadie las edita) (M-56, APP-52). |
| 51 Resumen de la cooperativa | Checklist de puesta en marcha (fase 3), ciudades con `formatCiudad`. | Bandeja "Requiere tu atención" (PC-14); filas de "Encomiendas recientes" sin enlace (PC-16); comisión en rojo (PC-16); etiquetas de KPI ambiguas (P-15); skeleton distinto del layout (PC-16). |
| 52 Viajes y rutas | Menú "Rutas" (P-11), cancelar viaje con `ConfirmDialog` (fase 3), rutas con `ConfirmDialog` y precio USD + Bs (P-53, PC-46 moneda), labels con `htmlFor`. | Editar viaje y marcar llegada (P-48); días "L M Mi" (P-48, PC-44); resumen de salidas, validación de fechas y "Cancelar" (PC-44); pestañas Hoy/Próximos/Historial y orden ascendente (PC-43); manifiesto imprimible (PC-45); duración en minutos (P-52); origen igual a destino y vacío sin CTA en rutas (PC-46). |
| 53 Hardware | Textos y errores de Bluetooth en español en `configuracion/hardware`. | Solo se llega desde Configuración (admin) (P-60, PC-51); sin reconexión automática; sin "Probar sonido" ni ancho de papel. |
| 54 Admin operativo | Vocabulario de comisiones ("Registrar pago", "Período previsualizado"), seguro con monto, suspensión con motivo, desbloqueo de PIN por RPC, `ConfirmDialog`. | Dashboard de 7 KPIs en una fila, sin deltas y tarjetas no clicables (A-05, AD-06, AD-07); tarifa sin revisión, sin programación real y no transaccional (A-07, AD-15, AD-16); el pago de comisión no guarda referencia ni método (AD-18, falta columna); usuarios cortados en 500 y búsqueda en cliente (AD-21); incidencias solo por fecha (AD-19); filas sin teclado, filtros fuera de la URL, "0.0 (0)", pestañas sin `?tab=` (AD-14); tabla de usuarios de 9 columnas (AD-22). |
| 55 Admin en el sistema visual | `error.tsx`/`not-found.tsx` con tokens (fase 3). | Superficies y acentos fijos restantes (`orange-600`, `emerald-600`, `slate-*`), tres estilos de H1, breadcrumb de un nivel, icono `Shield` como marca, rol "super admin" (AD-01…AD-04). |
| 56 Tokens compartidos | `--success-text`, `--primary-text`, etc. en el panel; tokens de texto en la app. | Los mismos hex en tres archivos; ~400 clases de color sueltas en el panel y 16 en la landing; sin regla de lint (DS-02). |
| 57 Formatos venezolanos | Mismas reglas copiadas a mano: app `validation.ts`, panel `ve.ts`/`rif.ts`/`ciudades.ts`/`fechas.ts`, landing `rif.ts`. | Una sola fuente; el panel muestra "Merida" sin tilde; no hay `CedulaField`/`TelefonoField` (APP-05, APP-43, PC-04, DS-06); `UNIQUE` de cédula y teléfono sobre el texto crudo (pendiente fase 3). |
| 58 Artefactos compartidos | App muestra `BOL-7CAB-E4AD`; QR de encomienda = código de seguimiento; `fn_validar_embarque` acepta cualquier forma. | El panel muestra el código sin formato en tickets, listas, reembolsos y admin; no hay documento de artefactos; la guía PDF muestra al empleado como remitente y no trae el PIN (P-25, DS-09). |
| 59 Accesibilidad base | Etiquetas en español en `ui/*`, `Chip` con `accessibilityLabel`. | `Field` de la app no asocia la etiqueta ni anuncia el error (APP-57); nada respeta "reducir movimiento"; filas `onClick` sin teclado en 5 tablas del panel/admin; botones de icono sin nombre en admin; reglas `jsx-a11y` extra no activadas (vienen con `eslint-config-next`: 4 avisos hoy) (PC-25, AD-14, AD-22, DS-10). |
| 60 Limpieza | `viajes/[id]` ya es un enlace que abre el asistente de `buscar` (M-57, APP-11: **se conserva** como deep link); la raíz del panel redirige a `/cooperativas/login`. | Borrar `EnBusApp/src/components/Spinner.tsx`, `PanelCooperativas/src/components/landing/*`, `LandingEnBus/LandingEnBus/` (copia duplicada), `LandingEnBus/components/{testimonials,theme-provider}.tsx` (sin uso), `storage.getSignedPhotoUrl` (deprecado); `Specs/02_App_Movil/Design_System_Spec.md` desactualizado; SEO de la landing: `metadataBase`, imagen OG, canonical, `robots`, `sitemap`, JSON-LD, animaciones sin uso (LP-08, APP-59). |

---

## 1. Decisiones

| Tema | Decisión | Motivo |
|---|---|---|
| PIN en la entrega (seguridad) | `fn_validar_pin_retiro` deja una **validación de 15 minutos** para el empleado que la hizo (`pin_validado_at/por`). `fn_entregar_encomienda` con PIN exige esa validación **antes** de comparar el PIN (`EB_PIN_NO_VALIDADO`) y la consume. Un trigger `aa_proteger_entrega_encomienda` impide que la API (rol `authenticated`) escriba el PIN, sus intentos, la validación, los datos de retiro o pase la encomienda a ENTREGADA/DEVUELTA. | El contador solo existe en el camino que no lanza error; así no se puede probar PIN contra `fn_entregar_encomienda` ni con un UPDATE directo. Firma y respuesta de las RPC sin cambios. |
| Tiempo real | La migración 02 añade `boletos`, `encomiendas`, `viajes`, `pagos` y `notificaciones_usuario` a `supabase_realtime` si faltan (o avisa si la publicación no existe). Realtime respeta RLS. | Pendiente fase 3: los asientos y "Pagos por verificar (n)" dependían de un paso manual. |
| Tokens (#56) | Fuente única `shared/tokens.json` + script Node propio `shared/generar.mjs` (sin dependencias) que genera `EnBusApp/src/tokens.generated.ts`, `PanelCooperativas/src/app/tokens.generated.css` y `LandingEnBus/app/tokens.generated.css`. `theme.ts` y los `globals.css` consumen lo generado sin cambiar sus nombres públicos. Lint con lo instalado: `no-restricted-syntax` (clases de paleta de Tailwind en panel y landing; hex/rgba literales en la app). | Sin paquete npm nuevo ni workspaces; los tres proyectos siguen compilando por separado. |
| Formatos y artefactos (#57, #58) | `shared/ve.ts` (cédula, teléfono, RIF, ciudad, fechas VE, duración) y `shared/artefactos.ts` (código de boleto, QR, seguimiento, PIN) son la fuente; el mismo script los copia como `ve.generated.ts` / `artefactos.generated.ts` en los tres proyectos. Los módulos actuales (`validation.ts`, `codigos.ts`, `formatters.formatCity`, `lib/ve.ts`, `lib/rif.ts`, `lib/ciudades.ts`, `lib/fechas.ts`, `LandingEnBus/lib/rif.ts`) pasan a reexportar **con los mismos nombres y firmas**. `--check` falla si una copia no coincide. | Metro y Next no resuelven bien imports fuera de su raíz; una copia generada y verificada es lo más simple y no rompe a nadie. |
| Implementación canónica | Cédula/teléfono: la del panel (`lib/ve.ts`, idéntica a la app). RIF: `lib/rif.ts`. Ciudad: la de la app (`formatCity` con tildes, "Mérida", "San Juan de los Morros") + `normalizar_localidad` de SQL. Fechas: `lib/fechas.ts` del panel (zona `America/Caracas`). Sin `\p{L}` ni lookbehind en `shared/*` (Hermes). | Cada pieza ya estaba probada en su proyecto. |
| Unicidad de cédula y teléfono | Migración 03: normaliza los perfiles antiguos a la forma única (`V-12345678`, `0414-1234567`) cuando no chocan, crea índices únicos por valor normalizado **solo si los datos lo permiten** (si no, NOTICE con la consulta de revisión) y `handle_new_user` compara por valor normalizado. | Pendiente fase 3: "V12345678" y "V-12345678" no chocaban. |
| Eliminar cuenta | `fn_eliminar_mi_cuenta(motivo)` (usuario `user`): si tiene boletos por usar, pagos en verificación, encomiendas en curso (enviadas o por recibir) o reembolsos pendientes devuelve `EB_CUENTA_CON_ACTIVIDAD` con el detalle; si no, anonimiza el perfil (`Cuenta eliminada`, marcadores `PENDIENTE-BAJA-<id>`, sin token push), borra sus notificaciones y registra `bajas_cuenta`. Luego la app llama a la edge function nueva `eliminar-cuenta`, que borra la identidad de Auth (borrado suave); si no está desplegada, el admin la completa desde Usuarios. `AuthContext` cierra la sesión de un perfil con `eliminada_at`. | Requisito de Google Play; los boletos y encomiendas son registros contables de las cooperativas y no se borran (las FK lo impedirían). |
| Términos y privacidad | Páginas en la landing (`/terminos`, `/privacidad`, `/eliminar-cuenta`) con texto en lenguaje claro basado en los datos que de verdad se guardan; la app y el panel las enlazan con `EXPO_PUBLIC_SITIO_URL` / `NEXT_PUBLIC_SITIO_URL` (si falta, el enlace no se muestra). **Revisión legal = paso manual.** | Google Play pide URL de privacidad y una página web para pedir la baja. |
| Cambiar contraseña | Pantalla propia: con proveedor `email` pide la contraseña actual y la verifica con `signInWithPassword` antes de `updateUser`; cuenta solo de Google: "Crear una contraseña". | `updateUser` no pide la actual; verificarla evita cambios con el teléfono desbloqueado ajeno. |
| Límite de frecuencia | Tabla `limites_uso` + `fn_consumir_limite(clave, máximo, ventana)` (solo service role, atómica). `verificarCorreoRegistro`: 10 por 10 min por IP (hash); `registrarCooperativa`: 5 por hora por IP; `reenviarInvitacion` (landing): 1 cada 5 min por RIF y 5 por hora por IP, y revoca las invitaciones anteriores sin usar. | Pendientes de la fase 3; sin Redis ni servicios nuevos. |
| Bandeja del Resumen | `fn_bandeja_cooperativa()` devuelve en una llamada los conteos (pagos por verificar, reembolsos por devolver, encomiendas por vencer en oficina, listas para despachar, en camino, próxima salida con sus boletos y encomiendas), filtrados por la sucursal del empleado si la tiene. | Un solo viaje a la base; las reglas (días hábiles, sucursal) quedan en SQL. |
| Editar viaje | `fn_editar_viaje` (solo admin, solo PROGRAMADO): unidad, chofer, hora y asientos; no deja bajar los asientos por debajo del mayor vendido; si cambia la hora y hay pasajeros, motivo obligatorio y aviso a cada comprador. `fn_completar_viaje` (EN_CURSO → COMPLETADO). | P-48; la escritura directa a `viajes` no avisa a nadie. |
| Reembolso al cambiar la hora | El aviso dice "Si la nueva hora no te sirve, escríbele a la cooperativa." No se ofrece reembolso automático del 100 %. | Decisión de negocio pendiente (§8). |
| Tarifas | `fn_publicar_tarifa` (una transacción): fecha ≤ ahora + 1 min → vigente al instante; fecha futura → **programada** (`activa=false`, `publicada_at`), que el cron `activar_tarifas_programadas` (cada 5 min) activa a su hora. `fn_cancelar_tarifa_programada`. El historial anterior queda marcado `reemplazada_at`. | AD-15: hoy una fecha futura activaba la tarifa al instante; `createTarifa` era de dos pasos. |
| Tipo de notificación | Columna `notificaciones_usuario.tipo` que llena `_notificar_usuario` (y `enviar-push` si la recibe). La app elige icono y tono por tipo y, si falta, por `recurso_tipo`. | APP-50 sin heurísticas sobre el texto. |
| Sonido en el panel | Web Audio (`OscillatorNode`), sin archivos: éxito = dos tonos cortos agudos, error = tono grave de 300 ms, aviso = tono medio. Preferencia por equipo en `localStorage` (`enbus.sonido`), activada por defecto, con interruptor en "Impresora y lector". | PC-19 sin assets ni dependencias. |
| Hardware | Ruta nueva `/cooperativas/hardware` ("Impresora y lector") en el menú de **ambos roles**; la vieja `/cooperativas/configuracion/hardware` redirige. Reconexión con `navigator.bluetooth.getDevices()` si existe y reintentos ante `gattserverdisconnected`. Ancho de papel 58/80 mm en `localStorage` (`enbus.papel`). | P-60, PC-51. |
| Filas navegables | Patrón único `CeldaEnlace`: la primera celda lleva un `<Link>` (o `<button>` si abre una hoja) con nombre accesible y un pseudo-elemento que cubre la fila (`TableRow` con `relative`); **sin `onClick` en `<tr>`**. | Teclado y lector de pantalla sin JS extra (AD-14, DS-10). |
| Reglas de lint nuevas | Se añaden en la oleada 1 como `warn`; cada cluster de la oleada 2 deja **0 avisos** en sus archivos; al integrar se pasan a `error` (paso manual 9). | Hay ~400 clases sueltas repartidas entre clusters de la oleada 2. |
| Pendientes que no entran | Ver §6. | — |

---

## 2. Migraciones SQL (nuevas, idempotentes)

Orden: **01 → 02 → 03**, después de las de `20260720` (01–05). En el SQL Editor: ejecutar cada archivo y luego `NOTIFY pgrst, 'reload schema';`. Ninguna usa valores de enum nuevos, así que no hace falta separarlas.

**Validación estática**: aplicadas con PGlite 0.4 (Postgres 17, misma instalación de la fase 3) sobre las 29 migraciones existentes, dos pasadas seguidas sin error, y una tercera pasada de la 03 **con datos** (normaliza `04140000002` → `0414-0000002` y `V-12.345.678` → `V-12345678`, crea los dos índices únicos). Runner y pruebas en `C:\Users\Javie\AppData\Local\Temp\claude\C--Users-Javie-Documents-Dev-Panas-Cargo\d0b08de0-2077-4df0-9a37-5cfd3aaa9310\scratchpad\f4\` (`node run4.mjs ./dataX full`, luego `node run4.mjs ./dataX test t_setup.sql` y `t_f4.sql`, `t_extra.sql`, `t_logo.sql`). Resultados en §2.4.

Notas de despliegue:
- 01 redefine `encomiendas_updated_at_fn`, `fn_validar_pin_retiro`, `fn_entregar_encomienda` y `fn_desbloquear_pin` con **las mismas firmas** que en `20260720000004`. El panel actual sigue funcionando: siempre valida el PIN antes de entregar. Un `confirmarEntrega` que llegue más de 15 minutos después de validar recibe `EB_PIN_NO_VALIDADO` (el panel nuevo vuelve al paso del PIN).
- 02 redefine `_notificar_usuario`, `fn_remitente_de_encomienda` (añade la clave `origen_registro`, aditivo) y `fn_rutas_populares` (misma firma). Programa el cron `activar_tarifas_programadas`.
- 03 desactiva un momento el trigger `vincular_encomiendas_de_perfil` para normalizar formatos sin re-vincular ni avisar (el valor normalizado no cambia). Redefine `handle_new_user` y `proteger_perfil_fn`. Añade políticas de Storage para el logo del admin de cooperativa. Programa el cron `limpiar_limites_uso`.
- Si un NOTICE dice que no se crearon `uq_profiles_cedula_normalizada` o `uq_profiles_telefono_normalizado`, resolver los duplicados con la consulta del NOTICE y volver a ejecutar la 03.

### 2.1 `supabase/migrations/20260721000001_fase4_seguridad_entrega.sql` — PIN validado antes de entregar

```sql
-- Fase 4 · Seguridad de la entrega (pendiente de la fase 3, prioridad alta).
-- fn_entregar_encomienda no contaba el PIN fallido: al lanzar EB_PIN_INCORRECTO se revertía el
-- UPDATE del contador, así que un empleado podía probar los 10.000 PIN llamándola directamente.
-- Ahora:
--   1. fn_validar_pin_retiro (cuenta y bloquea a los 10 intentos) deja una validación de 15 minutos
--      para el empleado que la hizo (pin_validado_at / pin_validado_por).
--   2. fn_entregar_encomienda con PIN exige esa validación ANTES de mirar el PIN (no revela si el PIN
--      es correcto) y la consume al entregar.
--   3. Los clientes de la API (rol authenticated) ya no pueden escribir el PIN, sus intentos, la
--      validación ni los datos de la entrega, ni pasar una encomienda a ENTREGADA o DEVUELTA: solo las
--      RPC (SECURITY DEFINER), el cron y el service role.
-- Requiere 20260720000004. Re-ejecutable. Contrato de las RPC sin cambios salvo el error nuevo
-- EB_PIN_NO_VALIDADO.
BEGIN;

ALTER TABLE public.encomiendas
  ADD COLUMN IF NOT EXISTS pin_validado_at  timestamptz,
  ADD COLUMN IF NOT EXISTS pin_validado_por uuid;          -- sin FK a profiles (ver 20260720000002)

-- La validación del PIN tampoco mueve updated_at (cuenta los días en oficina).
CREATE OR REPLACE FUNCTION public.encomiendas_updated_at_fn()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE c text[] := ARRAY['receiver_user_id','receiver_vinculado_por','receiver_vinculado_at',
                          'sucursal_origen_id','sucursal_destino_id','updated_at',
                          'intentos_pin','pin_bloqueado','pin_validado_at','pin_validado_por',
                          'foto_evidencia_url','foto_cliente_path','foto_omitida_motivo'];
BEGIN
  IF (to_jsonb(NEW) - c) IS DISTINCT FROM (to_jsonb(OLD) - c) THEN
    NEW.updated_at := now();
  END IF;
  RETURN NEW;
END $$;

-- Escrituras directas de la API: el PIN y la entrega solo los cambia el sistema.
-- "aa_" para correr antes que generar_pin_retiro (que asigna el PIN al pasar a EN_RECEPCION).
CREATE OR REPLACE FUNCTION public.proteger_entrega_encomienda_fn()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;
  IF NEW.estado IS DISTINCT FROM OLD.estado AND NEW.estado IN ('ENTREGADA', 'DEVUELTA') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'EB_OPERACION_NO_PERMITIDA',
      HINT = 'La entrega se registra desde la pantalla Entrega, con el PIN de retiro.';
  END IF;
  IF (NEW.pin_retiro, NEW.intentos_pin, NEW.pin_bloqueado, NEW.pin_validado_at, NEW.pin_validado_por,
      NEW.entregada_at, NEW.entregada_por, NEW.retiro_tercero, NEW.retiro_nombre, NEW.retiro_cedula,
      NEW.entrega_sin_pin_motivo)
     IS DISTINCT FROM
     (OLD.pin_retiro, OLD.intentos_pin, OLD.pin_bloqueado, OLD.pin_validado_at, OLD.pin_validado_por,
      OLD.entregada_at, OLD.entregada_por, OLD.retiro_tercero, OLD.retiro_nombre, OLD.retiro_cedula,
      OLD.entrega_sin_pin_motivo) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'EB_OPERACION_NO_PERMITIDA',
      HINT = 'El PIN de retiro y los datos de la entrega solo los cambia el sistema.';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS aa_proteger_entrega_encomienda ON public.encomiendas;
CREATE TRIGGER aa_proteger_entrega_encomienda BEFORE UPDATE ON public.encomiendas
  FOR EACH ROW EXECUTE FUNCTION public.proteger_entrega_encomienda_fn();

-- Validar el PIN: igual que en la fase 3 (cuenta el intento sin lanzar error) y, si es correcto,
-- deja la validación para este empleado. Un intento fallido borra cualquier validación previa.
CREATE OR REPLACE FUNCTION public.fn_validar_pin_retiro(p_encomienda_id uuid, p_pin text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_ctx record; v_e record; v_intentos integer; v_max constant integer := 10;
BEGIN
  SELECT * INTO v_ctx FROM public._contexto_staff();
  SELECT id, cooperativa_id, estado, pin_retiro, intentos_pin, pin_bloqueado INTO v_e
    FROM public.encomiendas WHERE id = p_encomienda_id FOR UPDATE;
  IF NOT FOUND OR v_e.cooperativa_id IS DISTINCT FROM v_ctx.o_cooperativa_id THEN
    PERFORM public._fallar('EB_NO_ENCONTRADO', 'No encontramos esta encomienda en tu cooperativa.');
  END IF;
  IF v_e.estado <> 'EN_OFICINA_DESTINO' THEN
    PERFORM public._fallar('EB_ESTADO_CAMBIO', 'Esta encomienda no está lista para entregar. Actualiza la lista.');
  END IF;
  IF v_e.pin_bloqueado THEN
    RETURN jsonb_build_object('valido', false, 'bloqueado', true, 'intentos_restantes', 0);
  END IF;
  IF v_e.pin_retiro IS NOT NULL AND v_e.pin_retiro = btrim(coalesce(p_pin, '')) THEN
    UPDATE public.encomiendas SET pin_validado_at = now(), pin_validado_por = v_ctx.o_uid
     WHERE id = p_encomienda_id;
    RETURN jsonb_build_object('valido', true, 'bloqueado', false, 'intentos_restantes', v_max - v_e.intentos_pin);
  END IF;
  v_intentos := v_e.intentos_pin + 1;
  UPDATE public.encomiendas
     SET intentos_pin = v_intentos, pin_bloqueado = (v_intentos >= v_max),
         pin_validado_at = NULL, pin_validado_por = NULL
   WHERE id = p_encomienda_id;
  RETURN jsonb_build_object('valido', false, 'bloqueado', v_intentos >= v_max,
                            'intentos_restantes', greatest(v_max - v_intentos, 0));
END $$;

-- Entregar: misma firma y respuesta que en 20260720000004. Con PIN exige la validación vigente
-- del mismo empleado (se comprueba antes que el PIN para no revelar si es correcto).
CREATE OR REPLACE FUNCTION public.fn_entregar_encomienda(
  p_encomienda_id uuid, p_pin text, p_cedula_verificada boolean,
  p_retira_tercero boolean DEFAULT false, p_retiro_nombre text DEFAULT NULL, p_retiro_cedula text DEFAULT NULL,
  p_sin_pin_motivo text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_ctx record; v_e record; v_tercero boolean := coalesce(p_retira_tercero, false);
  v_sin_pin text := nullif(left(btrim(coalesce(p_sin_pin_motivo, '')), 300), '');
  v_nombre text; v_cedula text;
BEGIN
  SELECT * INTO v_ctx FROM public._contexto_staff();
  SELECT * INTO v_e FROM public.encomiendas WHERE id = p_encomienda_id FOR UPDATE;
  IF NOT FOUND OR v_e.cooperativa_id IS DISTINCT FROM v_ctx.o_cooperativa_id THEN
    PERFORM public._fallar('EB_NO_ENCONTRADO', 'No encontramos esta encomienda en tu cooperativa.');
  END IF;
  IF v_e.estado = 'ENTREGADA' THEN
    RETURN jsonb_build_object('estado', 'ENTREGADA', 'ya_procesado', true, 'entregada_at', v_e.entregada_at);
  END IF;
  IF v_e.estado <> 'EN_OFICINA_DESTINO' THEN
    PERFORM public._fallar('EB_ESTADO_CAMBIO', 'Esta encomienda no está lista para entregar. Actualiza la lista.');
  END IF;
  IF NOT coalesce(p_cedula_verificada, false) THEN
    PERFORM public._fallar('EB_CEDULA_NO_VERIFICADA', 'Confirma que revisaste la cédula de quien retira.', '{"campo":"cedula"}');
  END IF;
  IF v_tercero AND (length(btrim(coalesce(p_retiro_nombre, ''))) < 3 OR public.normalizar_cedula(p_retiro_cedula) IS NULL) THEN
    PERFORM public._fallar('EB_DATOS_INVALIDOS', 'Escribe el nombre y la cédula de quien retira.', '{"campo":"tercero"}');
  END IF;
  IF v_sin_pin IS NOT NULL THEN
    IF v_ctx.o_rol <> 'admin_cooperativa' THEN
      PERFORM public._fallar('EB_SIN_PERMISO', 'Solo el administrador de la cooperativa puede entregar sin PIN.');
    END IF;
    IF length(v_sin_pin) < 10 THEN
      PERFORM public._fallar('EB_MOTIVO_REQUERIDO', 'Explica por qué entregas sin PIN (mínimo 10 caracteres).',
                             '{"campo":"motivo"}');
    END IF;
  ELSIF v_e.pin_bloqueado THEN
    PERFORM public._fallar('EB_PIN_BLOQUEADO',
      'El PIN está bloqueado. Pídele al administrador de tu cooperativa que lo desbloquee o que autorice la entrega sin PIN.');
  ELSIF v_e.pin_validado_por IS DISTINCT FROM v_ctx.o_uid OR v_e.pin_validado_at IS NULL
        OR v_e.pin_validado_at < now() - interval '15 minutes' THEN
    PERFORM public._fallar('EB_PIN_NO_VALIDADO',
      'Valida el PIN de retiro antes de entregar. La validación dura 15 minutos.', '{"campo":"pin"}');
  ELSIF v_e.pin_retiro IS NULL OR v_e.pin_retiro <> btrim(coalesce(p_pin, '')) THEN
    PERFORM public._fallar('EB_PIN_INCORRECTO', 'El PIN no coincide. Valídalo de nuevo.', '{"campo":"pin"}');
  END IF;
  v_nombre := CASE WHEN v_tercero THEN btrim(p_retiro_nombre) ELSE v_e.receiver_nombre END;
  v_cedula := CASE WHEN v_tercero THEN btrim(p_retiro_cedula) ELSE v_e.receiver_cedula_rif END;
  UPDATE public.encomiendas
     SET estado = 'ENTREGADA', entregada_at = now(), entregada_por = v_ctx.o_uid,
         retiro_tercero = v_tercero, retiro_nombre = v_nombre, retiro_cedula = v_cedula,
         entrega_sin_pin_motivo = v_sin_pin, pin_validado_at = NULL, pin_validado_por = NULL
   WHERE id = p_encomienda_id;                 -- el trigger exige el cobro si paga quien recibe
  RETURN jsonb_build_object('estado', 'ENTREGADA', 'entregada_at', now(), 'retiro_nombre', v_nombre,
                            'retiro_cedula', v_cedula, 'sin_pin', v_sin_pin IS NOT NULL);
END $$;

-- Desbloquear: además borra cualquier validación previa.
CREATE OR REPLACE FUNCTION public.fn_desbloquear_pin(p_encomienda_id uuid, p_motivo text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_uid uuid := auth.uid(); v_rol public.rol_usuario; v_coop uuid; v_e record;
BEGIN
  IF v_uid IS NULL THEN
    PERFORM public._fallar('EB_NO_AUTENTICADO', 'Tu sesión expiró. Inicia sesión de nuevo.');
  END IF;
  SELECT role, cooperativa_id INTO v_rol, v_coop FROM public.profiles WHERE id = v_uid;
  SELECT id, cooperativa_id, estado, pin_bloqueado, intentos_pin INTO v_e
    FROM public.encomiendas WHERE id = p_encomienda_id FOR UPDATE;
  IF NOT FOUND OR NOT (v_rol = 'super_admin' OR (v_rol = 'admin_cooperativa' AND v_coop = v_e.cooperativa_id)) THEN
    PERFORM public._fallar('EB_SIN_PERMISO',
      'Solo el administrador de la cooperativa o el equipo de EnBus pueden desbloquear el PIN.');
  END IF;
  IF v_e.estado IN ('ENTREGADA', 'CANCELADA', 'DEVUELTA') THEN
    PERFORM public._fallar('EB_ESTADO_CAMBIO', 'Esta encomienda ya está cerrada.');
  END IF;
  IF length(btrim(coalesce(p_motivo, ''))) < 5 THEN
    PERFORM public._fallar('EB_MOTIVO_REQUERIDO', 'Escribe por qué desbloqueas el PIN.', '{"campo":"motivo"}');
  END IF;
  UPDATE public.encomiendas
     SET pin_bloqueado = false, intentos_pin = 0, pin_validado_at = NULL, pin_validado_por = NULL
   WHERE id = p_encomienda_id;
  RETURN jsonb_build_object('ok', true, 'intentos_previos', v_e.intentos_pin);
END $$;

-- Permisos (CREATE OR REPLACE conserva los anteriores; se repiten por si se aplicó fuera de orden).
DO $$
DECLARE f record;
BEGIN
  FOR f IN SELECT p.oid::regprocedure AS sig FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public' AND p.proname IN ('fn_validar_pin_retiro', 'fn_entregar_encomienda',
                                                         'fn_desbloquear_pin') LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', f.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', f.sig);
  END LOOP;
END $$;

COMMIT;
```

### 2.2 `supabase/migrations/20260721000002_fase4_operacion.sql` — Realtime, bandeja, viajes, tarifas, comisiones, notificaciones

```sql
-- Fase 4 · Operación: bandeja "Requiere tu atención" (#51), editar y cerrar viajes (#52),
-- tarifas con revisión y programación (#54, AD-15), registro del pago de comisiones (AD-18),
-- tipo de notificación para iconos (#49), Realtime de viajes y pagos, y arreglos pendientes de la
-- fase 3 (remitente de taquilla en fn_remitente_de_encomienda, rutas populares solo de
-- cooperativas activas). Requiere 20260720000001…05. Re-ejecutable.
BEGIN;

-- ─── 1. Publicación Realtime (pendiente fase 3) ─────────────────────────────
-- Sin viajes, los asientos no se actualizan en vivo; sin pagos, "Pagos por verificar (n)" no se mueve.
-- Realtime respeta la RLS de cada tabla.
DO $$
DECLARE t text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    RAISE NOTICE 'No existe la publicación supabase_realtime: actívala en Database > Publications y vuelve a ejecutar este archivo.';
    RETURN;
  END IF;
  IF (SELECT puballtables FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    RETURN;
  END IF;
  FOREACH t IN ARRAY ARRAY['boletos', 'encomiendas', 'viajes', 'pagos', 'notificaciones_usuario'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
                    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
      RAISE NOTICE 'Realtime: public.% añadida a supabase_realtime.', t;
    END IF;
  END LOOP;
END $$;

-- ─── 2. Notificaciones con tipo (iconos por tipo en la app, #49) ────────────
ALTER TABLE public.notificaciones_usuario ADD COLUMN IF NOT EXISTS tipo text;

CREATE OR REPLACE FUNCTION public._notificar_usuario(p_usuario uuid, p_tipo text, p_titulo text,
                                                     p_mensaje text, p_recurso_tipo text, p_recurso_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF p_usuario IS NULL
     OR (SELECT role FROM public.profiles WHERE id = p_usuario) IS DISTINCT FROM 'user' THEN
    RETURN;
  END IF;
  INSERT INTO public.notificaciones_usuario (usuario_id, tipo, titulo, mensaje, recurso_tipo, recurso_id)
  VALUES (p_usuario, p_tipo, p_titulo, p_mensaje, p_recurso_tipo, p_recurso_id);
  INSERT INTO public.pending_notifications (destinatario_id, recurso_tipo, recurso_id, tipo_notificacion, payload)
  VALUES (p_usuario, p_recurso_tipo, p_recurso_id, p_tipo,
          jsonb_build_object('titulo', p_titulo, 'mensaje', p_mensaje, 'sin_bandeja', true));
END $$;

-- ─── 3. Remitente de una encomienda de taquilla (pendiente fase 3) ──────────
-- En las altas presenciales sender_id es el empleado: se devuelve el remitente real (remitente_*).
CREATE OR REPLACE FUNCTION public.fn_remitente_de_encomienda(p_encomienda_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_nombre text; v_tel text; v_origen text;
BEGIN
  SELECT e.origen_registro,
         CASE WHEN e.origen_registro = 'TAQUILLA'
              THEN coalesce(nullif(btrim(e.remitente_nombre), ''), 'Cliente de taquilla')
              ELSE pr.nombre_completo END,
         CASE WHEN e.origen_registro = 'TAQUILLA' THEN e.remitente_telefono ELSE pr.telefono END
    INTO v_origen, v_nombre, v_tel
    FROM public.encomiendas e LEFT JOIN public.profiles pr ON pr.id = e.sender_id
   WHERE e.id = p_encomienda_id AND auth.uid() IN (e.sender_id, e.receiver_user_id);
  IF v_nombre IS NULL THEN RETURN NULL; END IF;
  -- Teléfono enmascarado ("•••••••1234"); el marcador 'PENDIENTE-…' no es un teléfono.
  v_tel := CASE WHEN public.normalizar_telefono(v_tel) IS NULL THEN ''
                ELSE '0' || public.normalizar_telefono(v_tel) END;
  RETURN jsonb_build_object('nombre', v_nombre, 'origen_registro', v_origen,
    'telefono', CASE WHEN length(v_tel) > 4 THEN repeat('•', length(v_tel) - 4) || right(v_tel, 4) END);
END $$;

-- ─── 4. Rutas populares: las salidas cuentan solo si la cooperativa está activa ─
CREATE OR REPLACE FUNCTION public.fn_rutas_populares(p_limite integer DEFAULT 6)
RETURNS TABLE (ciudad_origen text, estado_origen text, ciudad_destino text, estado_destino text,
               desde_usd numeric, duracion_min integer, cooperativas integer, salidas_proximas integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT r.ciudad_origen, min(r.estado_origen), r.ciudad_destino, min(r.estado_destino),
         min(r.precio_pasaje)::numeric, min(r.duracion_estimada_min), count(DISTINCT r.cooperativa_id)::integer,
         (SELECT count(*)::integer FROM public.viajes v
            JOIN public.rutas r2 ON r2.id = v.ruta_id
            JOIN public.cooperativas c2 ON c2.id = r2.cooperativa_id AND c2.estado = 'ACTIVA'
           WHERE r2.ciudad_origen = r.ciudad_origen AND r2.ciudad_destino = r.ciudad_destino AND r2.activa
             AND v.estado = 'PROGRAMADO' AND v.fecha_hora_salida > now())
    FROM public.rutas r JOIN public.cooperativas c ON c.id = r.cooperativa_id AND c.estado = 'ACTIVA'
   WHERE r.activa AND coalesce(r.precio_pasaje, 0) > 0
   GROUP BY r.ciudad_origen, r.ciudad_destino
   ORDER BY 8 DESC, 7 DESC, 5
   LIMIT greatest(1, least(coalesce(p_limite, 6), 12));
$$;

-- ─── 5. Comisiones: soporte del pago (AD-18, pendiente fase 3) ──────────────
ALTER TABLE public.comisiones_ciclo
  ADD COLUMN IF NOT EXISTS pago_referencia     text,
  ADD COLUMN IF NOT EXISTS pago_metodo         text,
  ADD COLUMN IF NOT EXISTS pago_registrado_por uuid;      -- sin FK (embeds)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_comisiones_pago_metodo') THEN
    ALTER TABLE public.comisiones_ciclo ADD CONSTRAINT chk_comisiones_pago_metodo
      CHECK (pago_metodo IS NULL OR pago_metodo IN ('PAGO_MOVIL', 'TRANSFERENCIA_BANCARIA', 'ZELLE', 'EFECTIVO'));
  END IF;
END $$;

-- ─── 6. Bandeja "Requiere tu atención" del Resumen (#51, PC-14) ─────────────
-- Conteos del trabajo pendiente de la cooperativa (y de la sucursal del empleado, si tiene).
CREATE OR REPLACE FUNCTION public.fn_bandeja_cooperativa()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_ctx record; v_ciudad text;
  v_pagos integer; v_reemb integer; v_reemb_usd numeric;
  v_vencer integer; v_dias_min integer; v_despachar integer; v_en_camino integer;
  v_prox record; v_prox_enc integer; v_prox_vendidos integer; v_proxima jsonb;
BEGIN
  SELECT * INTO v_ctx FROM public._contexto_staff();
  SELECT s.ciudad INTO v_ciudad FROM public.sucursales s WHERE s.id = v_ctx.o_sucursal_id;

  SELECT count(*) INTO v_pagos
    FROM public.pagos p
   WHERE p.cooperativa_id = v_ctx.o_cooperativa_id AND p.tipo_pago = 'DIGITAL'
     AND NOT p.verificado AND p.rechazado_at IS NULL;

  SELECT count(*), coalesce(sum(b.monto_reembolso), 0) INTO v_reemb, v_reemb_usd
    FROM public.boletos b
   WHERE b.cooperativa_id = v_ctx.o_cooperativa_id AND b.estado = 'CANCELADO'
     AND coalesce(b.monto_reembolso, 0) > 0 AND NOT b.reembolso_procesado;

  -- En oficina de destino con 3 o más días hábiles (se devuelven a los 5).
  SELECT count(*), min(5 - public.calcular_dias_habiles(e.updated_at, now())) INTO v_vencer, v_dias_min
    FROM public.encomiendas e
   WHERE e.cooperativa_id = v_ctx.o_cooperativa_id AND e.estado = 'EN_OFICINA_DESTINO'
     AND (v_ctx.o_sucursal_id IS NULL OR e.sucursal_destino_id = v_ctx.o_sucursal_id
          OR (e.sucursal_destino_id IS NULL
              AND public.normalizar_localidad(e.ciudad_destino) = public.normalizar_localidad(v_ciudad)))
     AND public.calcular_dias_habiles(e.updated_at, now()) >= 3;

  -- Listas para salir desde aquí: pagadas, o por cobrar en destino.
  SELECT count(*) INTO v_despachar
    FROM public.encomiendas e
   WHERE e.cooperativa_id = v_ctx.o_cooperativa_id
     AND (e.estado = 'PAGADA' OR (e.estado = 'POR_PAGAR' AND e.modalidad_pago = 'DESTINO'))
     AND (v_ctx.o_sucursal_id IS NULL OR e.sucursal_origen_id = v_ctx.o_sucursal_id
          OR (e.sucursal_origen_id IS NULL
              AND public.normalizar_localidad(e.ciudad_origen) = public.normalizar_localidad(v_ciudad)));

  SELECT count(*) INTO v_en_camino
    FROM public.encomiendas e
   WHERE e.cooperativa_id = v_ctx.o_cooperativa_id AND e.estado = 'EN_TRANSITO'
     AND (v_ctx.o_sucursal_id IS NULL OR e.sucursal_destino_id = v_ctx.o_sucursal_id
          OR (e.sucursal_destino_id IS NULL
              AND public.normalizar_localidad(e.ciudad_destino) = public.normalizar_localidad(v_ciudad)));

  SELECT v.id, v.fecha_hora_salida, v.asientos_disponibles, r.ciudad_origen, r.ciudad_destino INTO v_prox
    FROM public.viajes v JOIN public.rutas r ON r.id = v.ruta_id
   WHERE v.cooperativa_id = v_ctx.o_cooperativa_id AND v.estado = 'PROGRAMADO'
     AND v.fecha_hora_salida > now() - interval '30 minutes'
     AND (v_ciudad IS NULL OR public.normalizar_localidad(r.ciudad_origen) = public.normalizar_localidad(v_ciudad))
   ORDER BY v.fecha_hora_salida
   LIMIT 1;
  IF v_prox.id IS NOT NULL THEN
    SELECT count(*) INTO v_prox_enc
      FROM public.encomiendas e
     WHERE e.cooperativa_id = v_ctx.o_cooperativa_id
       AND (e.estado = 'PAGADA' OR (e.estado = 'POR_PAGAR' AND e.modalidad_pago = 'DESTINO'))
       AND public.normalizar_localidad(e.ciudad_origen) = public.normalizar_localidad(v_prox.ciudad_origen)
       AND public.normalizar_localidad(e.ciudad_destino) = public.normalizar_localidad(v_prox.ciudad_destino);
    SELECT count(*) INTO v_prox_vendidos
      FROM public.boletos b WHERE b.viaje_id = v_prox.id AND b.estado IN ('PAGADO', 'USADO');
    v_proxima := jsonb_build_object(
      'viaje_id', v_prox.id, 'ciudad_origen', v_prox.ciudad_origen, 'ciudad_destino', v_prox.ciudad_destino,
      'salida', v_prox.fecha_hora_salida,
      'minutos_para_salir', floor(extract(epoch FROM (v_prox.fecha_hora_salida - now())) / 60)::integer,
      'boletos_vendidos', v_prox_vendidos, 'asientos_disponibles', v_prox.asientos_disponibles,
      'encomiendas_por_despachar', v_prox_enc);
  END IF;

  RETURN jsonb_build_object(
    'pagos_por_verificar', v_pagos,
    'reembolsos_por_devolver', v_reemb, 'reembolsos_usd', round(v_reemb_usd, 2),
    'encomiendas_por_vencer', v_vencer, 'dias_minimos_para_devolucion', greatest(coalesce(v_dias_min, 0), 0),
    'encomiendas_por_despachar', v_despachar, 'encomiendas_en_camino', v_en_camino,
    'proxima_salida', v_proxima, 'generado_at', now());
END $$;

-- ─── 7. Viajes: editar y marcar la llegada (#52, P-48) ──────────────────────
-- Solo el administrador de la cooperativa y solo viajes PROGRAMADO. Un argumento NULL no cambia
-- ese dato; '' en unidad o chofer lo borra. Si cambia la hora y hay pasajeros, el motivo es
-- obligatorio y se avisa a cada comprador.
CREATE OR REPLACE FUNCTION public.fn_editar_viaje(
  p_viaje_id uuid, p_numero_unidad text DEFAULT NULL, p_nombre_chofer text DEFAULT NULL,
  p_fecha_hora_salida timestamptz DEFAULT NULL, p_asientos_totales integer DEFAULT NULL,
  p_motivo text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_ctx record; v_v record; v_cambia_hora boolean; v_ocupados integer; v_mayor integer;
  v_motivo text := left(btrim(coalesce(p_motivo, '')), 300); v_avisados integer := 0; r record;
  v_salida timestamptz; v_llegada timestamptz; v_totales integer; v_disponibles integer;
BEGIN
  SELECT * INTO v_ctx FROM public._contexto_staff();
  IF v_ctx.o_rol <> 'admin_cooperativa' THEN
    PERFORM public._fallar('EB_SIN_PERMISO', 'Solo el administrador de la cooperativa puede editar viajes.');
  END IF;
  SELECT v.*, ru.ciudad_origen, ru.ciudad_destino, ru.duracion_estimada_min INTO v_v
    FROM public.viajes v JOIN public.rutas ru ON ru.id = v.ruta_id
   WHERE v.id = p_viaje_id FOR UPDATE OF v;
  IF NOT FOUND OR v_v.cooperativa_id <> v_ctx.o_cooperativa_id THEN
    PERFORM public._fallar('EB_NO_ENCONTRADO', 'No encontramos ese viaje en tu cooperativa.');
  END IF;
  IF v_v.estado <> 'PROGRAMADO' THEN
    PERFORM public._fallar('EB_ESTADO_CAMBIO', 'Solo se pueden editar los viajes programados.');
  END IF;

  SELECT count(*), max(CASE WHEN b.asiento ~ '^[0-9]+$' THEN b.asiento::integer END) INTO v_ocupados, v_mayor
    FROM public.boletos b
   WHERE b.viaje_id = p_viaje_id AND b.estado IN ('RESERVADO', 'PAGADO', 'USADO');

  v_cambia_hora := p_fecha_hora_salida IS NOT NULL AND p_fecha_hora_salida <> v_v.fecha_hora_salida;
  IF v_cambia_hora AND p_fecha_hora_salida <= now() THEN
    PERFORM public._fallar('EB_DATOS_INVALIDOS', 'La nueva salida tiene que ser más tarde que ahora.',
                           '{"campo":"salida"}');
  END IF;
  IF v_cambia_hora AND v_ocupados > 0 AND length(v_motivo) < 5 THEN
    PERFORM public._fallar('EB_MOTIVO_REQUERIDO',
      'Este viaje tiene pasajeros: explica por qué cambia la hora. Les enviaremos tu mensaje.', '{"campo":"motivo"}');
  END IF;
  IF p_asientos_totales IS NOT NULL THEN
    IF p_asientos_totales < 1 OR p_asientos_totales > 80 THEN
      PERFORM public._fallar('EB_DATOS_INVALIDOS', 'El bus debe tener entre 1 y 80 asientos.', '{"campo":"asientos"}');
    END IF;
    IF p_asientos_totales < greatest(coalesce(v_mayor, 0), v_ocupados) THEN
      PERFORM public._fallar('EB_DATOS_INVALIDOS',
        format('Ya hay pasajeros hasta el asiento %s: el bus debe tener al menos %s asientos.',
               greatest(coalesce(v_mayor, 0), v_ocupados), greatest(coalesce(v_mayor, 0), v_ocupados)),
        jsonb_build_object('campo', 'asientos', 'minimo', greatest(coalesce(v_mayor, 0), v_ocupados)));
    END IF;
  END IF;

  v_salida := CASE WHEN v_cambia_hora THEN p_fecha_hora_salida ELSE v_v.fecha_hora_salida END;
  v_llegada := CASE WHEN v_cambia_hora
                    THEN p_fecha_hora_salida + make_interval(mins => coalesce(v_v.duracion_estimada_min, 0))
                    ELSE v_v.fecha_hora_llegada_est END;
  v_totales := coalesce(p_asientos_totales, v_v.asientos_totales);
  v_disponibles := CASE WHEN p_asientos_totales IS NULL THEN v_v.asientos_disponibles
                        ELSE greatest(p_asientos_totales - v_ocupados, 0) END;

  UPDATE public.viajes
     SET numero_unidad = CASE WHEN p_numero_unidad IS NULL THEN numero_unidad
                              ELSE nullif(left(btrim(p_numero_unidad), 40), '') END,
         nombre_chofer = CASE WHEN p_nombre_chofer IS NULL THEN nombre_chofer
                              ELSE nullif(left(btrim(p_nombre_chofer), 80), '') END,
         fecha_hora_salida = v_salida, fecha_hora_llegada_est = v_llegada,
         asientos_totales = v_totales, asientos_disponibles = v_disponibles
   WHERE id = p_viaje_id;

  IF v_cambia_hora THEN
    FOR r IN SELECT DISTINCT ON (b.comprador_id) b.comprador_id, b.id
               FROM public.boletos b
              WHERE b.viaje_id = p_viaje_id AND b.estado IN ('RESERVADO', 'PAGADO')
              ORDER BY b.comprador_id, b.created_at LOOP
      PERFORM public._notificar_usuario(r.comprador_id, 'VIAJE_REPROGRAMADO', 'Cambió la hora de tu viaje',
        format('Tu viaje %s → %s ahora sale el %s (antes: %s). Motivo: %s. Si la nueva hora no te sirve, escríbele a la cooperativa.',
               initcap(replace(v_v.ciudad_origen, '_', ' ')), initcap(replace(v_v.ciudad_destino, '_', ' ')),
               public._fecha_hora_ve(v_salida), public._fecha_hora_ve(v_v.fecha_hora_salida),
               coalesce(nullif(v_motivo, ''), 'ajuste de horario')),
        'boleto', r.id);
      v_avisados := v_avisados + 1;
    END LOOP;
  END IF;

  RETURN jsonb_build_object('viaje_id', p_viaje_id, 'salida', v_salida, 'llegada_estimada', v_llegada,
                            'asientos_totales', v_totales, 'asientos_disponibles', v_disponibles,
                            'pasajeros_avisados', v_avisados);
END $$;

-- El bus llegó: EN_CURSO → COMPLETADO (cualquier empleado de la cooperativa).
CREATE OR REPLACE FUNCTION public.fn_completar_viaje(p_viaje_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_ctx record; v_v record; v_no_embarcados integer;
BEGIN
  SELECT * INTO v_ctx FROM public._contexto_staff();
  SELECT id, cooperativa_id, estado INTO v_v FROM public.viajes WHERE id = p_viaje_id FOR UPDATE;
  IF NOT FOUND OR v_v.cooperativa_id <> v_ctx.o_cooperativa_id THEN
    PERFORM public._fallar('EB_NO_ENCONTRADO', 'No encontramos ese viaje en tu cooperativa.');
  END IF;
  IF v_v.estado = 'COMPLETADO' THEN
    RETURN jsonb_build_object('estado', 'COMPLETADO', 'ya_procesado', true);
  END IF;
  IF v_v.estado <> 'EN_CURSO' THEN
    PERFORM public._fallar('EB_ESTADO_CAMBIO', 'Marca primero la salida del bus; luego podrás marcar su llegada.');
  END IF;
  UPDATE public.viajes SET estado = 'COMPLETADO' WHERE id = p_viaje_id;
  SELECT count(*) INTO v_no_embarcados FROM public.boletos b WHERE b.viaje_id = p_viaje_id AND b.estado = 'PAGADO';
  RETURN jsonb_build_object('estado', 'COMPLETADO', 'no_embarcados', v_no_embarcados);
END $$;

-- ─── 8. Tarifas: publicar en una operación, con programación (#54, AD-15) ────
-- Antes se desactivaba la vigente y luego se insertaba la nueva en dos pasos (sin transacción), y
-- una fecha futura activaba la tarifa al instante. Ahora:
--   vigente     activa = true (una sola, idx_tarifas_activa)
--   programada  activa = false, publicada_at NOT NULL, reemplazada_at NULL, vigente_desde > now()
--   histórica   reemplazada_at NOT NULL
ALTER TABLE public.tarifas
  ADD COLUMN IF NOT EXISTS publicada_at   timestamptz,
  ADD COLUMN IF NOT EXISTS reemplazada_at timestamptz,
  ADD COLUMN IF NOT EXISTS nota           text;
UPDATE public.tarifas SET publicada_at = created_at WHERE activa AND publicada_at IS NULL;
UPDATE public.tarifas SET reemplazada_at = created_at
 WHERE NOT activa AND publicada_at IS NULL AND reemplazada_at IS NULL;   -- histórico anterior

CREATE OR REPLACE FUNCTION public.fn_publicar_tarifa(
  p_tarifa_por_kg numeric, p_factor_distancia_por_min numeric, p_dimensiones_max_cm integer,
  p_peso_max_kg numeric, p_vigente_desde timestamptz DEFAULT NULL, p_nota text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_uid uuid := auth.uid(); v_desde timestamptz := coalesce(p_vigente_desde, now()); v_id uuid;
        v_programada boolean;
BEGIN
  IF v_uid IS NULL OR NOT coalesce(public.is_super_admin(), false) THEN
    PERFORM public._fallar('EB_SIN_PERMISO', 'Solo el equipo de EnBus puede publicar tarifas.');
  END IF;
  IF p_tarifa_por_kg IS NULL OR p_tarifa_por_kg <= 0 OR p_tarifa_por_kg > 1000 THEN
    PERFORM public._fallar('EB_DATOS_INVALIDOS', 'El precio por kilo debe ser mayor que 0.', '{"campo":"tarifa_por_kg"}');
  END IF;
  IF p_factor_distancia_por_min IS NULL OR p_factor_distancia_por_min < 0 OR p_factor_distancia_por_min > 1 THEN
    PERFORM public._fallar('EB_DATOS_INVALIDOS', 'El recargo por minuto de viaje debe estar entre 0 y 1.',
                           '{"campo":"factor_distancia_por_min"}');
  END IF;
  IF p_dimensiones_max_cm IS NULL OR p_dimensiones_max_cm < 10 OR p_dimensiones_max_cm > 300 THEN
    PERFORM public._fallar('EB_DATOS_INVALIDOS', 'La medida máxima debe estar entre 10 y 300 cm.',
                           '{"campo":"dimensiones_max_cm"}');
  END IF;
  IF p_peso_max_kg IS NULL OR p_peso_max_kg < 1 OR p_peso_max_kg > 100 THEN
    PERFORM public._fallar('EB_DATOS_INVALIDOS', 'El peso máximo debe estar entre 1 y 100 kg.', '{"campo":"peso_max_kg"}');
  END IF;
  v_programada := v_desde > now() + interval '1 minute';
  -- Una programación nueva reemplaza a la anterior que aún no entró en vigor.
  UPDATE public.tarifas SET reemplazada_at = now()
   WHERE NOT activa AND publicada_at IS NOT NULL AND reemplazada_at IS NULL;
  IF NOT v_programada THEN
    UPDATE public.tarifas SET activa = false, reemplazada_at = now() WHERE activa;
    v_desde := now();
  END IF;
  INSERT INTO public.tarifas (tarifa_por_kg, factor_distancia_por_min, dimensiones_max_cm, peso_max_kg,
                              vigente_desde, activa, creada_por, publicada_at, nota)
  VALUES (round(p_tarifa_por_kg, 2), round(p_factor_distancia_por_min, 4), p_dimensiones_max_cm,
          round(p_peso_max_kg, 2), v_desde, NOT v_programada, v_uid, now(),
          nullif(left(btrim(coalesce(p_nota, '')), 300), ''))
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('id', v_id, 'estado', CASE WHEN v_programada THEN 'PROGRAMADA' ELSE 'VIGENTE' END,
                            'vigente_desde', v_desde);
END $$;

CREATE OR REPLACE FUNCTION public.fn_cancelar_tarifa_programada(p_tarifa_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT coalesce(public.is_super_admin(), false) THEN
    PERFORM public._fallar('EB_SIN_PERMISO', 'Solo el equipo de EnBus puede cambiar las tarifas.');
  END IF;
  UPDATE public.tarifas SET reemplazada_at = now()
   WHERE id = p_tarifa_id AND NOT activa AND publicada_at IS NOT NULL AND reemplazada_at IS NULL;
  IF NOT FOUND THEN
    PERFORM public._fallar('EB_ESTADO_CAMBIO', 'Esta tarifa ya no está programada. Actualiza la página.');
  END IF;
  RETURN jsonb_build_object('id', p_tarifa_id, 'estado', 'CANCELADA');
END $$;

-- Cron: activa la tarifa programada cuando llega su fecha.
CREATE OR REPLACE FUNCTION public.fn_activar_tarifas_programadas()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_id uuid;
BEGIN
  SELECT id INTO v_id FROM public.tarifas
   WHERE NOT activa AND publicada_at IS NOT NULL AND reemplazada_at IS NULL AND vigente_desde <= now()
   ORDER BY vigente_desde DESC, publicada_at DESC LIMIT 1 FOR UPDATE;
  IF v_id IS NULL THEN RETURN; END IF;
  UPDATE public.tarifas SET activa = false, reemplazada_at = now() WHERE activa;
  UPDATE public.tarifas SET reemplazada_at = now()
   WHERE id <> v_id AND NOT activa AND publicada_at IS NOT NULL AND reemplazada_at IS NULL AND vigente_desde <= now();
  UPDATE public.tarifas SET activa = true WHERE id = v_id;
END $$;

DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'activar_tarifas_programadas') THEN
    PERFORM cron.unschedule('activar_tarifas_programadas');
  END IF;
  PERFORM cron.schedule('activar_tarifas_programadas', '*/5 * * * *',
                        'SELECT public.fn_activar_tarifas_programadas()');
END $do$;

-- ─── Permisos ────────────────────────────────────────────────────────────────
DO $$
DECLARE f record;
BEGIN
  FOR f IN SELECT p.oid::regprocedure AS sig FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public' AND p.proname LIKE '\_%' LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', f.sig);
  END LOOP;
  FOR f IN SELECT p.oid::regprocedure AS sig FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public' AND p.proname IN (
              'fn_bandeja_cooperativa', 'fn_editar_viaje', 'fn_completar_viaje', 'fn_publicar_tarifa',
              'fn_cancelar_tarifa_programada', 'fn_remitente_de_encomienda') LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', f.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', f.sig);
  END LOOP;
  FOR f IN SELECT p.oid::regprocedure AS sig FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public' AND p.proname = 'fn_activar_tarifas_programadas' LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', f.sig);
  END LOOP;
  FOR f IN SELECT p.oid::regprocedure AS sig FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public' AND p.proname = 'fn_rutas_populares' LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO anon, authenticated, service_role', f.sig);
  END LOOP;
END $$;

COMMIT;
```

### 2.3 `supabase/migrations/20260721000003_fase4_cuenta_limites.sql` — Límites, formato único, baja de cuenta, logo

```sql
-- Fase 4 · Cuenta y límites: eliminar la cuenta desde la app (#50, M-56, APP-52, requisito de
-- Google Play), límite de frecuencia para las acciones públicas (verificarCorreoRegistro y
-- reenviarInvitacion, pendientes de la fase 3) y cédula/teléfono únicos por su valor normalizado
-- (pendiente de la fase 3, #57). Requiere 20260720000002. Re-ejecutable.
BEGIN;

-- ─── 1. Límite de frecuencia (solo service role) ────────────────────────────
-- Ventana fija por clave ("correo:<hash ip>", "invitacion:<rif>"). Atómico: INSERT … ON CONFLICT.
CREATE TABLE IF NOT EXISTS public.limites_uso (
  clave          text PRIMARY KEY,
  ventana_inicio timestamptz NOT NULL DEFAULT now(),
  conteo         integer NOT NULL DEFAULT 0
);
ALTER TABLE public.limites_uso ENABLE ROW LEVEL SECURITY;      -- sin políticas: nadie desde la API
REVOKE ALL ON public.limites_uso FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.fn_consumir_limite(p_clave text, p_maximo integer, p_ventana_segundos integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_clave text := left(btrim(coalesce(p_clave, '')), 200); v_conteo integer; v_inicio timestamptz;
        v_ventana interval;
BEGIN
  IF v_clave = '' OR coalesce(p_maximo, 0) < 1 OR coalesce(p_ventana_segundos, 0) < 1 THEN
    PERFORM public._fallar('EB_DATOS_INVALIDOS', 'Límite mal configurado.');
  END IF;
  v_ventana := make_interval(secs => p_ventana_segundos);
  INSERT INTO public.limites_uso AS l (clave, ventana_inicio, conteo)
  VALUES (v_clave, now(), 1)
  ON CONFLICT (clave) DO UPDATE
     SET conteo = CASE WHEN l.ventana_inicio <= now() - v_ventana THEN 1 ELSE l.conteo + 1 END,
         ventana_inicio = CASE WHEN l.ventana_inicio <= now() - v_ventana THEN now() ELSE l.ventana_inicio END
  RETURNING conteo, ventana_inicio INTO v_conteo, v_inicio;
  RETURN jsonb_build_object(
    'permitido', v_conteo <= p_maximo,
    'restantes', greatest(p_maximo - v_conteo, 0),
    'reintentar_en_segundos', CASE WHEN v_conteo <= p_maximo THEN 0
                                   ELSE greatest(ceil(extract(epoch FROM (v_inicio + v_ventana - now())))::integer, 1) END);
END $$;

CREATE OR REPLACE FUNCTION public.fn_limpiar_limites_uso()
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  DELETE FROM public.limites_uso WHERE ventana_inicio < now() - interval '2 days';
$$;
DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'limpiar_limites_uso') THEN
    PERFORM cron.unschedule('limpiar_limites_uso');
  END IF;
  PERFORM cron.schedule('limpiar_limites_uso', '17 4 * * *', 'SELECT public.fn_limpiar_limites_uso()');
END $do$;

-- ─── 2. Formato único de cédula y teléfono (#57) ────────────────────────────
-- Misma forma en que la app y el panel guardan ("V-12345678", "0414-1234567"): cedulaParaGuardar y
-- telefonoParaGuardar de shared/ve.ts. NULL si no es válido (incluye los marcadores 'PENDIENTE…').
CREATE OR REPLACE FUNCTION public._cedula_para_guardar(p text)
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT CASE WHEN x.n IS NULL THEN NULL ELSE left(x.n, 1) || '-' || substr(x.n, 2) END
    FROM (SELECT public.normalizar_cedula(p) AS n) x;
$$;
CREATE OR REPLACE FUNCTION public._telefono_para_guardar(p text)
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT CASE WHEN x.n IS NULL THEN NULL ELSE '0' || substr(x.n, 1, 3) || '-' || substr(x.n, 4) END
    FROM (SELECT public.normalizar_telefono(p) AS n) x;
$$;

-- Perfiles antiguos en otro formato ("V12345678", "04141234567") pasan a la forma única, salvo que
-- choquen con otro perfil (esos quedan para revisión, ver la consulta al final). Sin avisos ni
-- re-vínculos de encomiendas: el valor normalizado no cambia.
ALTER TABLE public.profiles DISABLE TRIGGER vincular_encomiendas_de_perfil;
WITH cand AS (
  SELECT id, public._cedula_para_guardar(cedula_rif) AS nueva FROM public.profiles
   WHERE public._cedula_para_guardar(cedula_rif) IS NOT NULL
     AND cedula_rif <> public._cedula_para_guardar(cedula_rif)
)
UPDATE public.profiles p SET cedula_rif = c.nueva
  FROM cand c
 WHERE p.id = c.id
   AND NOT EXISTS (SELECT 1 FROM public.profiles o WHERE o.cedula_rif = c.nueva AND o.id <> p.id)
   AND NOT EXISTS (SELECT 1 FROM cand c2 WHERE c2.nueva = c.nueva AND c2.id <> c.id);
WITH cand AS (
  SELECT id, public._telefono_para_guardar(telefono) AS nuevo FROM public.profiles
   WHERE public._telefono_para_guardar(telefono) IS NOT NULL
     AND telefono <> public._telefono_para_guardar(telefono)
)
UPDATE public.profiles p SET telefono = c.nuevo
  FROM cand c
 WHERE p.id = c.id
   AND NOT EXISTS (SELECT 1 FROM public.profiles o WHERE o.telefono = c.nuevo AND o.id <> p.id)
   AND NOT EXISTS (SELECT 1 FROM cand c2 WHERE c2.nuevo = c.nuevo AND c2.id <> c.id);
ALTER TABLE public.profiles ENABLE TRIGGER vincular_encomiendas_de_perfil;

-- Únicos por valor normalizado: solo si los datos lo permiten (si no, NOTICE con la consulta).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.profiles WHERE public.normalizar_cedula(cedula_rif) IS NOT NULL
              GROUP BY public.normalizar_cedula(cedula_rif) HAVING count(*) > 1) THEN
    RAISE NOTICE 'Hay cédulas repetidas escritas distinto: no se crea uq_profiles_cedula_normalizada. Revisa: SELECT public.normalizar_cedula(cedula_rif), array_agg(id) FROM public.profiles WHERE public.normalizar_cedula(cedula_rif) IS NOT NULL GROUP BY 1 HAVING count(*) > 1;';
  ELSE
    CREATE UNIQUE INDEX IF NOT EXISTS uq_profiles_cedula_normalizada
      ON public.profiles (public.normalizar_cedula(cedula_rif)) WHERE public.normalizar_cedula(cedula_rif) IS NOT NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM public.profiles WHERE public.normalizar_telefono(telefono) IS NOT NULL
              GROUP BY public.normalizar_telefono(telefono) HAVING count(*) > 1) THEN
    RAISE NOTICE 'Hay teléfonos repetidos escritos distinto: no se crea uq_profiles_telefono_normalizado. Revisa: SELECT public.normalizar_telefono(telefono), array_agg(id) FROM public.profiles WHERE public.normalizar_telefono(telefono) IS NOT NULL GROUP BY 1 HAVING count(*) > 1;';
  ELSE
    CREATE UNIQUE INDEX IF NOT EXISTS uq_profiles_telefono_normalizado
      ON public.profiles (public.normalizar_telefono(telefono)) WHERE public.normalizar_telefono(telefono) IS NOT NULL;
  END IF;
END $$;

-- Alta de usuarios: guarda la forma única y compara por valor normalizado (antes, "V12345678" y
-- "V-12345678" no chocaban). Si ya los usa otra cuenta, marcador 'PENDIENTE-<id>' como en la fase 3.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  m jsonb := coalesce(NEW.raw_user_meta_data, '{}'::jsonb);
  v_nombre text; v_tel text; v_ced text;
BEGIN
  v_nombre := coalesce(nullif(btrim(m->>'nombre_completo'), ''), nullif(btrim(m->>'full_name'), ''),
                       nullif(btrim(m->>'name'), ''), nullif(split_part(coalesce(NEW.email, ''), '@', 1), ''),
                       'Usuario EnBus');
  v_tel := public._telefono_para_guardar(m->>'telefono');
  v_ced := public._cedula_para_guardar(m->>'cedula_rif');
  IF v_tel IS NULL OR EXISTS (SELECT 1 FROM public.profiles p
                               WHERE public.normalizar_telefono(p.telefono) = public.normalizar_telefono(v_tel)) THEN
    v_tel := 'PENDIENTE-' || NEW.id::text;
  END IF;
  IF v_ced IS NULL OR EXISTS (SELECT 1 FROM public.profiles p
                               WHERE public.normalizar_cedula(p.cedula_rif) = public.normalizar_cedula(v_ced)) THEN
    v_ced := 'PENDIENTE-' || NEW.id::text;
  END IF;
  INSERT INTO public.profiles (id, role, nombre_completo, telefono, cedula_rif)
  VALUES (NEW.id, 'user', v_nombre, v_tel, v_ced)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END $$;

-- ─── 3. Eliminar la cuenta (#50, Google Play) ───────────────────────────────
-- La RPC anonimiza el perfil (los boletos y encomiendas históricos se conservan para la
-- contabilidad de las cooperativas) y deja la solicitud en bajas_cuenta. La edge function
-- `eliminar-cuenta` borra después la identidad de Auth (borrado suave); si no está desplegada,
-- el super admin la completa con la consulta de los pasos manuales.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS eliminada_at timestamptz;

CREATE TABLE IF NOT EXISTS public.bajas_cuenta (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id        uuid NOT NULL UNIQUE,                 -- sin FK: el perfil se anonimiza, no se borra
  email             text,
  motivo            text,
  solicitada_at     timestamptz NOT NULL DEFAULT now(),
  auth_eliminada_at timestamptz
);
ALTER TABLE public.bajas_cuenta ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Super admin ve bajas" ON public.bajas_cuenta;
CREATE POLICY "Super admin ve bajas" ON public.bajas_cuenta FOR SELECT USING (public.is_super_admin());

-- El usuario no puede marcar ni desmarcar su baja con un UPDATE directo.
CREATE OR REPLACE FUNCTION public.proteger_perfil_fn()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF current_user IN ('authenticated', 'anon') AND NOT coalesce(public.is_super_admin(), false)
     AND (NEW.role, NEW.cooperativa_id, NEW.sucursal_id, NEW.eliminada_at)
         IS DISTINCT FROM (OLD.role, OLD.cooperativa_id, OLD.sucursal_id, OLD.eliminada_at) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'EB_SIN_PERMISO',
      HINT = 'No puedes cambiar tu rol, tu cooperativa, tu sucursal ni el estado de tu cuenta.';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.fn_eliminar_mi_cuenta(p_motivo text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_uid uuid := auth.uid(); v_rol public.rol_usuario; v_eliminada timestamptz;
  v_boletos integer; v_pagos integer; v_env integer; v_rec integer; v_reemb integer;
  v_partes text[] := '{}';
BEGIN
  IF v_uid IS NULL THEN
    PERFORM public._fallar('EB_NO_AUTENTICADO', 'Tu sesión expiró. Inicia sesión de nuevo.');
  END IF;
  SELECT role, eliminada_at INTO v_rol, v_eliminada FROM public.profiles WHERE id = v_uid FOR UPDATE;
  IF NOT FOUND THEN
    PERFORM public._fallar('EB_NO_ENCONTRADO', 'No encontramos tu cuenta.');
  END IF;
  IF v_eliminada IS NOT NULL THEN
    RETURN jsonb_build_object('eliminada_at', v_eliminada, 'ya_procesado', true);
  END IF;
  IF v_rol <> 'user' THEN
    PERFORM public._fallar('EB_SIN_PERMISO',
      'Las cuentas del personal de una cooperativa se dan de baja desde su panel. Pídeselo al administrador de tu cooperativa.');
  END IF;

  SELECT count(*) INTO v_boletos FROM public.boletos b JOIN public.viajes v ON v.id = b.viaje_id
   WHERE b.comprador_id = v_uid AND b.estado IN ('RESERVADO', 'PAGADO')
     AND v.estado IN ('PROGRAMADO', 'EN_CURSO');
  SELECT count(*) INTO v_pagos FROM public.pagos p
   WHERE p.pagador_id = v_uid AND NOT p.verificado AND p.rechazado_at IS NULL;
  SELECT count(*) INTO v_env FROM public.encomiendas e
   WHERE e.sender_id = v_uid AND e.estado NOT IN ('ENTREGADA', 'CANCELADA', 'DEVUELTA');
  SELECT count(*) INTO v_rec FROM public.encomiendas e
   WHERE e.receiver_user_id = v_uid AND e.estado NOT IN ('ENTREGADA', 'CANCELADA', 'DEVUELTA');
  SELECT count(*) INTO v_reemb FROM public.boletos b
   WHERE b.comprador_id = v_uid AND b.estado = 'CANCELADO'
     AND coalesce(b.monto_reembolso, 0) > 0 AND NOT b.reembolso_procesado;

  IF v_boletos > 0 THEN
    v_partes := v_partes || CASE WHEN v_boletos = 1 THEN '1 boleto por usar' ELSE v_boletos || ' boletos por usar' END;
  END IF;
  IF v_pagos > 0 THEN
    v_partes := v_partes || CASE WHEN v_pagos = 1 THEN '1 pago en verificación' ELSE v_pagos || ' pagos en verificación' END;
  END IF;
  IF v_env > 0 THEN
    v_partes := v_partes || CASE WHEN v_env = 1 THEN '1 encomienda enviada en camino' ELSE v_env || ' encomiendas enviadas en camino' END;
  END IF;
  IF v_rec > 0 THEN
    v_partes := v_partes || CASE WHEN v_rec = 1 THEN '1 encomienda por recibir' ELSE v_rec || ' encomiendas por recibir' END;
  END IF;
  IF v_reemb > 0 THEN
    v_partes := v_partes || CASE WHEN v_reemb = 1 THEN '1 reembolso pendiente' ELSE v_reemb || ' reembolsos pendientes' END;
  END IF;
  IF coalesce(array_length(v_partes, 1), 0) > 0 THEN
    PERFORM public._fallar('EB_CUENTA_CON_ACTIVIDAD',
      format('Antes de eliminar tu cuenta tienes que terminar: %s. Cuando terminen, podrás eliminarla.',
             array_to_string(v_partes, ', ')),
      jsonb_build_object('boletos', v_boletos, 'pagos', v_pagos, 'encomiendas_enviadas', v_env,
                         'encomiendas_por_recibir', v_rec, 'reembolsos', v_reemb));
  END IF;

  UPDATE public.profiles
     SET nombre_completo = 'Cuenta eliminada',
         telefono = 'PENDIENTE-BAJA-' || v_uid::text, cedula_rif = 'PENDIENTE-BAJA-' || v_uid::text,
         expo_push_token = NULL, notif_encomiendas = false, notif_boletos = false, notif_recordatorios = false,
         eliminada_at = now()
   WHERE id = v_uid;
  DELETE FROM public.notificaciones_usuario WHERE usuario_id = v_uid;
  DELETE FROM public.pending_notifications WHERE destinatario_id = v_uid AND NOT procesado;
  INSERT INTO public.bajas_cuenta (usuario_id, email, motivo)
  VALUES (v_uid, nullif(auth.jwt() ->> 'email', ''), nullif(left(btrim(coalesce(p_motivo, '')), 300), ''))
  ON CONFLICT (usuario_id) DO NOTHING;
  RETURN jsonb_build_object('eliminada_at', now());
END $$;

-- ─── 4. Logo de la cooperativa: su administrador lo cambia (pendiente fase 3) ─
-- El panel sube a "<cooperativa_id>/logo.<ext>" con upsert (INSERT + UPDATE).
DROP POLICY IF EXISTS "Admin de cooperativa sube su logo" ON storage.objects;
CREATE POLICY "Admin de cooperativa sube su logo" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'logos-cooperativas' AND public.user_role() = 'admin_cooperativa'
              AND (storage.foldername(name))[1] = public.user_cooperativa_id()::text);
DROP POLICY IF EXISTS "Admin de cooperativa reemplaza su logo" ON storage.objects;
CREATE POLICY "Admin de cooperativa reemplaza su logo" ON storage.objects FOR UPDATE
  USING (bucket_id = 'logos-cooperativas' AND public.user_role() = 'admin_cooperativa'
         AND (storage.foldername(name))[1] = public.user_cooperativa_id()::text)
  WITH CHECK (bucket_id = 'logos-cooperativas' AND public.user_role() = 'admin_cooperativa'
              AND (storage.foldername(name))[1] = public.user_cooperativa_id()::text);

-- ─── Permisos ────────────────────────────────────────────────────────────────
DO $$
DECLARE f record;
BEGIN
  FOR f IN SELECT p.oid::regprocedure AS sig FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public' AND p.proname LIKE '\_%' LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', f.sig);
  END LOOP;
  FOR f IN SELECT p.oid::regprocedure AS sig FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public' AND p.proname IN ('fn_consumir_limite', 'fn_limpiar_limites_uso') LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', f.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f.sig);
  END LOOP;
  FOR f IN SELECT p.oid::regprocedure AS sig FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public' AND p.proname = 'fn_eliminar_mi_cuenta' LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', f.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', f.sig);
  END LOOP;
END $$;

COMMIT;
```

### 2.4 Pruebas funcionales ejecutadas (PGlite)

Sobre los datos de prueba de la fase 3 (`t_setup.sql`: Coop A con sucursales Caracas y Valencia, taquillero con sucursal Caracas, gerente, super admin, dos pasajeros, ruta Caracas → Valencia, tarifa y tasa):
- **Entrega**: alta presencial DESTINO llevada a EN_OFICINA_DESTINO · UPDATE directo del taquillero a `intentos_pin` → `EB_OPERACION_NO_PERMITIDA`; a `estado='ENTREGADA'` → `EB_OPERACION_NO_PERMITIDA` · `fn_entregar_encomienda` sin validar, con el PIN correcto **y** con uno incorrecto → ambos `EB_PIN_NO_VALIDADO` (no revela el PIN; `intentos_pin` sigue en 0) · `fn_validar_pin_retiro` incorrecto → `{valido:false, intentos_restantes:9}`; correcto → `{valido:true}`, `pin_validado_por` = taquillero, `updated_at` sin cambio · el gerente no puede usar la validación del taquillero → `EB_PIN_NO_VALIDADO` · el taquillero validado sin cobro → `EB_COBRO_PENDIENTE` (paso del PIN superado) · con el cobro → `ENTREGADA` y la validación limpia.
- **Remitente de taquilla**: la destinataria vinculada recibe `{nombre:"Rosa Remitente", telefono:"•••••••5555", origen_registro:"TAQUILLA"}`.
- **Bandeja**: taquillero (sucursal Caracas) y gerente (sin sucursal) reciben los conteos y la próxima salida Caracas → Valencia; un pasajero → `EB_SIN_PERMISO`.
- **Viajes**: taquillero edita → `EB_SIN_PERMISO`; cambio de hora con un pasajero sin motivo → `EB_MOTIVO_REQUERIDO`; 10 asientos con el 12 vendido → `EB_DATOS_INVALIDOS` (`minimo: 12`); edición completa → unidad, chofer, 30 asientos (29 libres), llegada = salida + 3 h, 1 pasajero avisado con tipo `VIAJE_REPROGRAMADO` y el texto "Tu viaje Caracas → Valencia ahora sale el 07/10 a las 2:49 a. m. (antes: 06/10 a las 2:49 a. m.). Motivo: Cambio de unidad…" · `fn_completar_viaje` en PROGRAMADO → `EB_ESTADO_CAMBIO`; tras `fn_marcar_salida_viaje` → `COMPLETADO`; repetido → `ya_procesado`.
- **Tarifas**: gerente → `EB_SIN_PERMISO`; super admin publica ahora → `VIGENTE` (la anterior queda histórica) y con fecha futura → `PROGRAMADA` (sin tocar la vigente); el cron no la activa antes de tiempo y sí al llegar la fecha (la vigente pasa a histórica).
- **Límites**: service role, máximo 2 → `permitido` true, true, false (`reintentar_en_segundos: 600`); `authenticated` → permiso denegado.
- **Baja de cuenta**: pasajero con una reserva → `EB_CUENTA_CON_ACTIVIDAD` "Antes de eliminar tu cuenta tienes que terminar: 1 boleto por usar…"; usuario sin actividad → perfil "Cuenta eliminada" con marcadores, `bajas_cuenta` con correo y motivo; repetido → `ya_procesado`; `UPDATE profiles SET eliminada_at = NULL` propio → `EB_SIN_PERMISO`.
- **Alta**: `+58 416 7778899` / `v-9.876.543` se guardan `0416-7778899` / `V-9876543`; `v22333444` y `0424-111.22.33` (ya usados escritos distinto) → marcadores `PENDIENTE-…`; la cédula liberada por la baja se puede reutilizar.
- **Logo**: el admin de la cooperativa sube a su carpeta; a la carpeta de otra cooperativa → RLS.
- **Públicas**: `fn_rutas_populares` como `anon` sigue funcionando.

### 2.5 Edge functions (código en el repo; desplegar es paso manual)

- `supabase/functions/eliminar-cuenta/index.ts` (**nueva**). `POST` con el JWT del usuario. 1) `createClient(url, anonKey, { global: { headers: { Authorization } } }).auth.getUser()`; sin usuario → 401 `{ error: 'EB_NO_AUTENTICADO' }`. 2) Cliente service role: lee `profiles.eliminada_at`; si es null → 409 `{ error: 'EB_ESTADO_CAMBIO', hint: 'Primero confirma la baja desde la app.' }`. 3) `auth.admin.deleteUser(user.id, true)` (borrado suave); error → 500 `{ error: 'EB_BAJA_PENDIENTE' }`. 4) `bajas_cuenta.auth_eliminada_at = now()`. 5) 200 `{ ok: true }`. Mismo estilo e imports que `enviar-push`; CORS igual.
- `generar-guia-pdf`: remitente = `remitente_nombre`/`remitente_cedula`/`remitente_telefono` si `origen_registro = 'TAQUILLA'`, si no el perfil (`profiles!sender_id`); añadir la línea "PIN de retiro: 1854 — dáselo solo a quien recibe" (si `pin_retiro` existe); modalidad con el glosario ("Paga al enviar" / "Paga al retirar"); ciudades con nombre legible; sin "→" (la fuente estándar de pdf-lib no lo tiene: usar "-"). Código de seguimiento grande.
- `enviar-push`: acepta `tipo` opcional; lo guarda en `notificaciones_usuario.tipo` cuando escribe la bandeja y lo manda en `data: { recurso_tipo, recurso_id, tipo }`.
- `procesar-notificaciones-pendientes`: pasa `tipo: notif.tipo_notificacion` a `enviar-push`; el aviso de devolución pasa a título "Tu encomienda volvió a origen" y mensaje "Nadie retiró la encomienda {tracking} a tiempo y la devolvimos a la oficina de origen. Pasa a buscarla con tu cédula.".

---

## 3. Contratos

### 3.1 Errores nuevos (`P0001`, `message` = código, `hint` = texto para el usuario)

`EB_PIN_NO_VALIDADO` (`{campo:'pin'}`), `EB_CUENTA_CON_ACTIVIDAD` (`{boletos, pagos, encomiendas_enviadas, encomiendas_por_recibir, reembolsos}`). Código solo de cliente (no SQL): `EB_DEMASIADOS_INTENTOS` (lo devuelven las server actions cuando `fn_consumir_limite` dice `permitido:false`). `humanizeError` muestra el `hint` por defecto; añadir los códigos al tipo `CodigoEB` de app y panel. Texto propio en el panel para `EB_PIN_NO_VALIDADO`: "Vuelve a validar el PIN de retiro: la validación vence a los 15 minutos.".

### 3.2 RPC nuevas o cambiadas

| RPC | Quién | Parámetros | Devuelve |
|---|---|---|---|
| `fn_validar_pin_retiro` | staff | igual | igual; además deja la validación de 15 min |
| `fn_entregar_encomienda` | staff | igual | igual; nuevo error `EB_PIN_NO_VALIDADO` |
| `fn_bandeja_cooperativa` | staff | — | `{pagos_por_verificar, reembolsos_por_devolver, reembolsos_usd, encomiendas_por_vencer, dias_minimos_para_devolucion, encomiendas_por_despachar, encomiendas_en_camino, proxima_salida: {viaje_id, ciudad_origen, ciudad_destino, salida, minutos_para_salir, boletos_vendidos, asientos_disponibles, encomiendas_por_despachar} \| null, generado_at}` |
| `fn_editar_viaje` | admin_cooperativa | `p_viaje_id, p_numero_unidad?, p_nombre_chofer?, p_fecha_hora_salida?, p_asientos_totales?, p_motivo?` (NULL = sin cambio; `''` borra unidad/chofer) | `{viaje_id, salida, llegada_estimada, asientos_totales, asientos_disponibles, pasajeros_avisados}` |
| `fn_completar_viaje` | staff | `p_viaje_id` | `{estado:'COMPLETADO', no_embarcados, ya_procesado?}` |
| `fn_publicar_tarifa` | super_admin | `p_tarifa_por_kg, p_factor_distancia_por_min, p_dimensiones_max_cm, p_peso_max_kg, p_vigente_desde?, p_nota?` | `{id, estado:'VIGENTE'\|'PROGRAMADA', vigente_desde}` |
| `fn_cancelar_tarifa_programada` | super_admin | `p_tarifa_id` | `{id, estado:'CANCELADA'}` |
| `fn_remitente_de_encomienda` | authenticated (partes) | igual | `{nombre, telefono, origen_registro}` (clave nueva) |
| `fn_consumir_limite` | **solo service_role** | `p_clave, p_maximo, p_ventana_segundos` | `{permitido, restantes, reintentar_en_segundos}` |
| `fn_eliminar_mi_cuenta` | user | `p_motivo?` | `{eliminada_at, ya_procesado?}` |

Columnas nuevas: `encomiendas.pin_validado_at, pin_validado_por` (no las lee nadie fuera de SQL); `notificaciones_usuario.tipo`; `comisiones_ciclo.pago_referencia, pago_metodo ('PAGO_MOVIL'|'TRANSFERENCIA_BANCARIA'|'ZELLE'|'EFECTIVO'), pago_registrado_por`; `tarifas.publicada_at, reemplazada_at, nota`; `profiles.eliminada_at`; tablas `bajas_cuenta` (super admin lee) y `limites_uso` (nadie desde la API). Tipos de notificación conocidos: `BOLETO_CONFIRMADO, PAGO_APROBADO, PAGO_RECHAZADO, PAGO_EN_VERIFICACION, RESERVA_SIN_PAGAR, VIAJE_CANCELADO, VIAJE_REPROGRAMADO, REEMBOLSO_ENVIADO, ENCOMIENDA_PARA_TI, ENCOMIENDA_RECHAZADA, DEVOLUCION_AUTOMATICA` (más los de cambio de estado de encomienda que encola el trigger; `tipo` puede ser `null` en filas antiguas).

### 3.3 `shared/` (lo crea W1-SHARED; los demás lo consumen por los archivos generados)

```
shared/
  tokens.json        fuente de color, radios y movimiento (claro y oscuro)
  ve.ts              formatos venezolanos (TS puro, sin imports, sin \p{…} ni lookbehind)
  artefactos.ts      códigos, QR y PIN (TS puro)
  generar.mjs        node shared/generar.mjs [--check]   (Node ≥ 18, sin dependencias)
  README.md          qué genera, cómo se usa, regla "no editar *.generated.*"
```

Salidas de `generar.mjs` (cada archivo empieza con `// GENERADO por shared/generar.mjs — no editar a mano` o `/* … */`):

| Salida | Contenido |
|---|---|
| `EnBusApp/src/tokens.generated.ts` | `export const tokens = { claro: {…}, movimiento: {…}, radio: {…} } as const;` (la app no tiene modo oscuro) |
| `EnBusApp/src/utils/ve.generated.ts`, `artefactos.generated.ts` | copia de `shared/ve.ts` y `shared/artefactos.ts` |
| `PanelCooperativas/src/app/tokens.generated.css` | `:root { --background: …; … }` y `.dark { … }` con **todas** las variables de color que hoy define `globals.css` (incluidas las de sidebar y chart) más las nuevas |
| `PanelCooperativas/src/lib/ve.generated.ts`, `artefactos.generated.ts` | copias |
| `LandingEnBus/app/tokens.generated.css` | `:root { … }` con las variables que hoy define su `globals.css` más las nuevas |
| `LandingEnBus/lib/ve.generated.ts`, `artefactos.generated.ts` | copias |

`--check`: regenera en memoria y sale con código 1 listando los archivos distintos. `tokens.json` usa claves en kebab-case iguales a las variables CSS (`"success-text": "#147638"`); para la app el script las pasa a camelCase. Colores **nuevos** (claro / oscuro): `border-strong` `#8C8C8C`/`#5A5A5A` (bordes de control ≥ 3:1); `success-deep` `#166534`/`#BBF7D0`, `warning-deep` `#92400E`/`#FDE68A`, `info-deep` `#1E40AF`/`#BFDBFE`, `destructive-deep` `#991B1B`/`#FECACA` (texto sobre `*-light`, ≥ 6:1); en oscuro `*-light` sigue siendo el fondo oscuro actual. Valores de texto de estado unificados con los de la app: `success-text #147638`, `warning-text #A34B08`, `info-text #1D4ED8`, `destructive-text #B91C1C`, `primary-text #8A5A00`; en oscuro se conservan los del panel. Movimiento: `duration.instant/fast/base/slow` de `theme.ts` (`Motion`).

Mapa de reemplazo para las clases sueltas (lo aplica cada cluster en sus archivos):

| Antes | Después |
|---|---|
| `bg-emerald-50/100`, `dark:bg-emerald-*/15` | `bg-success-light` |
| `text-emerald-700/800/900` sobre fondo suave · sobre `background`/`card` | `text-success-deep` · `text-success-text` |
| `border-emerald-*` | `border-success/40` |
| `amber-*` / `yellow-*` | `warning` (`bg-warning-light`, `text-warning-deep`, `text-warning-text`, `border-warning/40`) |
| `blue-*` / `sky-*` | `info` (ídem) |
| `red-*` / `rose-*` | `destructive` (`bg-destructive-light`, `text-destructive-deep`, `text-destructive-text`) |
| `slate-*` / `gray-*` / `zinc-*` / `neutral-*` | `bg-muted`, `bg-card`, `text-foreground`, `text-muted-foreground`, `border-border`, `border-border-strong` |
| `orange-600` (acento del admin) | `bg-primary text-primary-foreground` (acción primaria) o `text-primary-text` |
| `bg-emerald-600 text-white` (CTA) | `variant` de `Button` por defecto (`bg-primary`) |

`shared/ve.ts` (todas exportadas; las que ya existen conservan nombre, firma y comportamiento):
```ts
// Cédula (persona) — idénticas a PanelCooperativas/src/lib/ve.ts
export const LETRAS_CEDULA: readonly ['V', 'E', 'J', 'G', 'P', 'C'];
export function normalizarCedula(v: string | null | undefined): string | null;   // "v-12.345.678" → "V12345678"; 'PENDIENTE…' → null
export function cedulaValida(v: string): boolean;
export function formatCedula(v: string | null | undefined): string;               // "V-12.345.678" | "J-12345678-9" | "—"
export function cedulaParaGuardar(v: string | null | undefined): string | null;  // "V-12345678"
export function separarCedula(v: string | null | undefined): { letra: 'V' | 'E' | 'J' | 'G' | 'P' | 'C'; numero: string }; // para CedulaField; sin letra → 'V'
export const CEDULA_PLACEHOLDER = 'V-12345678'; export const CEDULA_ERROR = 'Escribe la cédula con su letra, por ejemplo V-12345678.';
// Teléfono
export const OPERADORAS_MOVILES: readonly ['0412', '0414', '0416', '0422', '0424', '0426'];
export function normalizarTelefono(v): string | null;        // "+58 414 1234567" → "4141234567"
export function telefonoValido(v: string): boolean;
export function formatTelefono(v): string;                   // "0414-123.45.67" | "—"
export function telefonoParaGuardar(v): string | null;       // "0414-1234567"
export function telefonoWhatsApp(v): string | null;          // "584141234567"
export function mascaraTelefono(entrada: string): string;    // progresiva mientras se escribe: "0414" → "0414-", "04141234" → "0414-123.4", acepta "+58…"/"58…"; nunca más de "0414-123.45.67"
export const TELEFONO_PLACEHOLDER = '0414-1234567'; export const TELEFONO_ERROR = 'Escribe un teléfono venezolano, por ejemplo 0414-1234567.';
// RIF de cooperativa — idénticas a lib/rif.ts
export const RIF_PLACEHOLDER, RIF_AYUDA, RIF_ERROR; export function normalizeRif(v): string | null; export function isValidRif(v): boolean;
// Ciudades
export function normalizarCiudad(v): string;                 // = normalizar_localidad (SQL): "Puerto La Cruz" → "puerto_la_cruz", "San Juan de los Morros" → "san_juan"; '' si vacío
export function formatCiudad(v): string;                     // "merida" → "Mérida", "puerto_la_cruz" → "Puerto La Cruz", "san_juan" → "San Juan de los Morros"; '' si vacío (mapa de tildes de la app)
export function formatRuta(ruta): string;                    // "puerto_la_cruz → valencia" → "Puerto La Cruz → Valencia"
export function mismaCiudad(a, b): boolean;
// Fechas (hora de Venezuela) — las de lib/fechas.ts, mismos nombres
export const ZONA_VE = 'America/Caracas';
export function fechaVE(v?): string; export function hoyVE(): string; export function sumarDiasVE(fecha: string, dias: number): string;
export function fechaHoraVEaISO(fecha: string, hora: string): string; export function rangoDiaVE(fecha: string): { desde: string; hasta: string };
export function formatFechaVE(v, opciones?): string; export function formatHoraVE(v): string; export function formatFechaHoraVE(v): string;
export function formatFechaCalendario(yyyyMmDd: string): string;     // columnas DATE sin desplazar: "04/10/2026"
export function formatHaceTiempo(v, ahora?: Date): string;           // "hace un momento", "hace 5 min", "hace 2 h", "ayer a las 8:30 p. m.", "vie. 04/10"
export function formatDuracion(minutos: number): string;             // 45 → "45 min", 510 → "8 h 30 min", 480 → "8 h"
```
(Las demás funciones exportadas hoy por `lib/fechas.ts` se mueven igual.)

`shared/artefactos.ts`:
```ts
export function formatCodigoBoleto(codigo: string | null | undefined): string;   // "BOL-7CABE4AD" → "BOL-7CAB-E4AD"; otros formatos sin cambio
export function normalizarCodigoBoleto(entrada: string): string;                 // "bol 7cab-e4ad" | "PASS-BOL-7CABE4AD" → "BOL-7CABE4AD" (igual que fn_validar_embarque)
export function qrBoleto(b: { codigo_boleto: string; qr_embarque_data?: string | null }): string; // qr_embarque_data ?? `PASS-${codigo}`
export const TRACKING_RE = /^EB-\d{6}-\d{5}$/;
export function normalizarTracking(entrada: string): string;                     // trim, mayúsculas, sin espacios
export function esTracking(v: string): boolean;
export function qrEncomienda(e: { tracking_id?: string | null; id: string }): string;
export const PIN_RETIRO_LONGITUD = 4; export const PIN_MAX_INTENTOS = 10; export const PIN_VALIDACION_MINUTOS = 15;
export function pinValido(v: string): boolean;                                   // /^\d{4}$/
```

Reexportaciones obligatorias (W1-SHARED; los nombres y firmas actuales **no cambian**): `EnBusApp/src/utils/validation.ts` (cédula/teléfono desde `ve.generated`), `codigos.ts` (`formatCodigoBoleto`, `qrEncomienda` desde `artefactos.generated`), `formatters.ts` (`formatCity(v) = formatCiudad(v) || '—'`); `PanelCooperativas/src/lib/{ve,rif,ciudades,fechas}.ts`; `LandingEnBus/lib/rif.ts`. `theme.ts` toma `palette` de `tokens.generated.ts` y conserva **todas** sus exportaciones (`Colors`, `alpha`, `Typography`, `Spacing`, `Sizes`, `Radius`, `Shadows`, `Motion`, `Layout`, `Opacity`, …) y añade `Colors.borderStrong`.

Lint (W1-SHARED, nivel `warn` hasta el paso manual 9):
- Panel y landing (`eslint.config.mjs`): `no-restricted-syntax` con `Literal[value=/…/]` y `TemplateElement[value.raw=/…/]` para `\b(bg|text|border|ring|from|via|to|fill|stroke|divide|outline|decoration|shadow|placeholder|caret|accent)-(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b`, mensaje "Usa los tokens del sistema (bg-success-light, text-warning-text…), no colores sueltos de Tailwind. Ver shared/README.md."; ignorar `src/components/ui/**` y `components/ui/**`. `jsx-a11y` (el plugin ya viene con `eslint-config-next`): `label-has-associated-control` (`assert: 'either'`, ignorar `components/ui/**`), `click-events-have-key-events`, `no-static-element-interactions`, `no-noninteractive-element-interactions`, `interactive-supports-focus`, `anchor-is-valid`.
- App (`eslint.config.js`): `no-restricted-syntax` para literales `#rgb/#rrggbb/#rrggbbaa` y `rgba?(` fuera de `src/theme.ts` y `src/tokens.generated.ts`, mensaje "Usa Colors de src/theme.ts.". Nivel `error` (hoy solo hay uno, en `usePushNotifications.ts`, que corrige W1-APP-BASE).

### 3.4 Piezas nuevas de la app (W1-APP-BASE)

```ts
// src/components/HeaderActions.tsx — campana con contador + perfil, para las tres pestañas
export function HeaderActions(): JSX.Element; // lee notificacionesSinLeer de ActivityContext; labels "Notificaciones, 3 sin leer" / "Notificaciones" y "Mi perfil"

// src/contexts/ActivityContext.tsx — se añade
notificacionesSinLeer: number;                 // usa el canal de notificaciones que hoy abre Inicio (Inicio deja de abrir el suyo)

// src/hooks/useProximoViaje.ts
export type ProximoViaje = { boletoId: string; codigo: string; compraId: string | null; asientos: string[];
  salida: string; llegada: string | null; ciudadOrigen: string; ciudadDestino: string; cooperativa: string };
export function useProximoViaje(): { proximo: ProximoViaje | null; loading: boolean; recargar(): Promise<void> };
// boletos PAGADO del usuario con viajes!inner(fecha_hora_salida entre ahora−30 min y ahora+48 h); orden por salida en cliente;
// agrupa asientos de la misma compra; se recarga al enfocar y cuando cambia boletosActivos.

// src/components/ProximoViajeCard.tsx
export function ProximoViajeCard(p: { proximo: ProximoViaje; onVerPase(): void }): JSX.Element;

// src/components/CedulaField.tsx y TelefonoField.tsx (sobre ui/Field; reglas de validation.ts)
export function CedulaField(p: { label?: string; value: string; onChangeText(v: string): void; error?: string | null;
  helper?: string; letras?: Array<'V' | 'E' | 'J' | 'P'>; /* por defecto ['V','E'] */ returnKeyType?; onSubmitEditing?; editable?: boolean }): JSX.Element;
// chips de letra + campo numérico (number-pad, máx. 10); pegar "v-12.345.678" separa letra y número; emite "V-12345678" (o lo escrito mientras es inválido)
export function TelefonoField(p: { label?: string; value: string; onChangeText(v: string): void; error?: string | null;
  helper?: string; returnKeyType?; onSubmitEditing?; editable?: boolean }): JSX.Element;
// phone-pad; muestra la máscara "0414-123.45.67" mientras se escribe; acepta "+58 414 1234567"

// src/components/Toast.tsx — compatible con show(type, message)
show(type: 'success' | 'error' | 'info', message: string, opciones?: { accion?: { label: string; onPress(): void }; duracionMs?: number }): void;
// error: persiste hasta "Cerrar" (X con label) o la acción; success: 3 s; info: max(4 s, 60 ms × caracteres);
// anuncia con AccessibilityInfo.announceForAccessibility; respeta reducir movimiento

// src/utils/notificaciones.ts
export type RecursoNotificacion = { recurso_tipo?: string | null; recurso_id?: string | null };
export async function abrirRecurso(router: Router, r: RecursoNotificacion, userId?: string | null): Promise<boolean>;
// boleto → /boletos/[id]; encomienda → enviar|recibir según sender_id (consulta; si falla, enviar); viaje → /viajes/[id]; sin recurso → false
export function iconoNotificacion(n: { tipo?: string | null; recurso_tipo?: string | null }): { icon: PhosphorIcon; tono: 'exito' | 'info' | 'aviso' | 'peligro' | 'neutro' };
export function agruparPorDia<T extends { created_at: string }>(items: T[], ahora?: Date): Array<{ titulo: 'Hoy' | 'Ayer' | 'Esta semana' | 'Anteriores'; data: T[] }>;

// src/utils/busquedasRecientes.ts (AsyncStorage, nunca lanza)
export async function leerBusquedasRecientes(): Promise<Array<{ origen: Localidad; destino: Localidad; at: number }>>; // máx. 5
export async function guardarBusquedaReciente(origen: Localidad, destino: Localidad): Promise<void>;
export async function ciudadesRecientes(): Promise<Localidad[]>;                                                        // únicas, máx. 3

// src/utils/venezuela.ts — se añade
export const CIUDADES_POPULARES: Localidad[]; // Caracas, Valencia, Maracaibo, Barquisimeto, Maracay, Mérida, Puerto La Cruz, San Cristóbal (todas presentes en VENEZUELA_LOCATIONS)

// src/utils/soporte.ts — se añade
export const SITIO_URL: string | null;          // EXPO_PUBLIC_SITIO_URL sin "/" final; null si no es https
export async function abrirPaginaLegal(p: 'terminos' | 'privacidad' | 'eliminar-cuenta'): Promise<boolean>; // WebBrowser.openBrowserAsync

// src/components/LocationSelector.tsx — props nuevas (opcionales, compatibles)
excluir?: Localidad | null; excluirAyuda?: string;       // fila deshabilitada con la ayuda ("Ya es tu origen")
recientes?: Localidad[]; populares?: Localidad[];        // secciones "Recientes" y "Populares" con la búsqueda vacía
// el campo de búsqueda recibe el foco al abrir

// src/components/CalendarModal.tsx — props nuevas (compatibles)
seleccionRapida?: boolean; // por defecto true: tocar un día lo elige y cierra (sin "Confirmar fecha")
// fila de atajos "Hoy", "Mañana" y los siguientes días con salida; punto bajo los días con salida;
// "Mes anterior" deshabilitado en el mes de minimumDate

// src/contexts/AuthContext.tsx — se añade
avisoSesion: string | null; limpiarAvisoSesion(): void;   // "Esta cuenta fue eliminada." si el perfil tiene eliminada_at (cierra la sesión local)

// src/types/index.ts — Notificacion.tipo?: string | null; ProximoViaje; ResultadoEliminarCuenta = { eliminada_at: string; ya_procesado?: boolean }; CodigoEB + nuevos
```
`app/_layout.tsx`: registra `cuenta/contrasena` y `cuenta/eliminar` (`slide_from_right`); push → `abrirRecurso` (y `/notificaciones` si no hay recurso); en primer plano, toast `info` con acción "Ver"; al abrir la app desde una push cerrada usa `Notifications.getLastNotificationResponseAsync()` una vez, cuando la sesión está lista. `.expo/types/router.d.ts`: añadir `/cuenta/contrasena` y `/cuenta/eliminar`.

### 3.5 Piezas nuevas del panel (W1-PANEL-BASE)

```ts
// lib/sonido.ts (solo cliente)
export type TipoSonido = 'exito' | 'error' | 'aviso';
export function reproducirSonido(tipo: TipoSonido): void;      // no hace nada si está desactivado o sin AudioContext; nunca lanza
export function sonidoActivado(): boolean; export function setSonidoActivado(v: boolean): void; // localStorage 'enbus.sonido'
// éxito: 880 Hz 80 ms + 1320 Hz 80 ms (sine); error: 220 Hz 300 ms (square, volumen 0,15); aviso: 660 Hz 150 ms

// components/ultimo-escaneo.tsx
export type ResultadoEscaneo = { codigo: string; tono: 'exito' | 'error' | 'aviso'; titulo: string; detalle?: string; at: number };
export function useUltimoEscaneo(): { ultimo: ResultadoEscaneo | null; registrar(r: Omit<ResultadoEscaneo, 'at'>): void }; // registrar también suena
export function UltimoEscaneo(p: { resultado: ResultadoEscaneo | null; className?: string }): JSX.Element;
// panel fijo junto al campo: "Último escaneo · hace 5 s", icono y color por tono (tokens), código en monoespaciada,
// aria-live="polite"; vacío: "Aún no has escaneado nada."

// components/scan-input.tsx — props nuevas
sonido?: boolean; // por defecto true: suena 'error' en "no encontrada" y sin red
// cuando no encuentra: deja el código escrito y seleccionado (no lo borra)

// components/celda-enlace.tsx
export function CeldaEnlace(p: { href?: string; onAbrir?(): void; etiqueta: string; children: React.ReactNode; className?: string }): JSX.Element;
// <TableCell> con <Link href> o <button type="button"> (aria-label = etiqueta) cuyo ::after cubre la fila;
// el <TableRow> que la contiene lleva className "relative" y NO onClick.

// components/ve-fields.tsx (web)
export function CedulaField(p: { id: string; name?: string; label?: string; value: string; onChange(v: string): void;
  error?: string | null; letras?: Array<'V' | 'E' | 'J' | 'G' | 'P'>; required?: boolean; disabled?: boolean }): JSX.Element;
export function TelefonoField(p: { id: string; name?: string; label?: string; value: string; onChange(v: string): void;
  error?: string | null; required?: boolean; disabled?: boolean }): JSX.Element;
// Label asociado, aria-invalid/aria-describedby, máscara en vivo; con `name`, un <input type="hidden"> con la forma de guardar

// components/page-header.tsx — compatible
interface PageHeaderProps { title: string; description?: React.ReactNode; children?: React.ReactNode;
  migas?: Array<{ label: string; href?: string }>; }   // breadcrumb visible encima del H1 (nav aria-label="Ruta de navegación")
// un solo estilo de H1: "text-2xl font-bold tracking-tight"

// lib/navigation.ts — ítem nuevo (ambos roles), antes de "Rutas":
{ title: "Impresora y lector", href: "/cooperativas/hardware", icon: Printer, roles: ["admin_cooperativa", "taquillero"] }

// lib/types/operacion.ts (nuevo)
export type ProximaSalida = { viaje_id: string; ciudad_origen: string; ciudad_destino: string; salida: string;
  minutos_para_salir: number; boletos_vendidos: number; asientos_disponibles: number; encomiendas_por_despachar: number };
export type BandejaCooperativa = { pagos_por_verificar: number; reembolsos_por_devolver: number; reembolsos_usd: number;
  encomiendas_por_vencer: number; dias_minimos_para_devolucion: number; encomiendas_por_despachar: number;
  encomiendas_en_camino: number; proxima_salida: ProximaSalida | null; generado_at: string };
export type ResultadoEditarViaje = { viaje_id: string; salida: string; llegada_estimada: string; asientos_totales: number;
  asientos_disponibles: number; pasajeros_avisados: number };
export type ResultadoCompletarViaje = { estado: 'COMPLETADO'; no_embarcados?: number; ya_procesado?: boolean };
export type ResultadoLimite = { permitido: boolean; restantes: number; reintentar_en_segundos: number };
// lib/errores.ts: CodigoEB + EB_PIN_NO_VALIDADO, EB_CUENTA_CON_ACTIVIDAD, EB_DEMASIADOS_INTENTOS
```
`StatusBadge` pasa a tokens (`bg-success-light text-success-deep`, etc.); `estado-cooperativa-banner`, `checklist-puesta-en-marcha`, `tasa-bcv-provider`, `confirm-dialog`, `connectivity-banner`, `monto`, `empty-state`, `error-state` sin clases sueltas.

### 3.6 Contratos entre clusters de la oleada 2

- Panel: `/cooperativas/taquilla/encomiendas?encomienda=<id>` abre el `DetalleSheet` de esa encomienda (W2-PANEL-MOSTRADOR); `/cooperativas/despacho?viaje=<id>` preselecciona ese viaje (W2-PANEL-MOSTRADOR). Los usa el Resumen (W2-PANEL-GESTION).
- `RouteSummary` conserva la exportación `cityCode` (marcada `@deprecated`, sin uso) porque `ui/index.ts` la reexporta.
- App: `/cuenta/contrasena` y `/cuenta/eliminar` los crea W2-APP-CUENTA; las registra W1-APP-BASE.

---

## 4. Por mejora: qué falta, cómo y copy

Regla común: ningún `catch` termina solo en `console.*`; los botones de icono tienen nombre accesible; no se añaden clases de color sueltas; animaciones nuevas respetan "reducir movimiento" (`useReducedMotion()` de Reanimated en la app, `motion-safe:` en web).

### #43 Escaneo de experto en el panel (P-12, P-13, PC-19, PC-20, PC-27)
- Base (W1-PANEL-BASE): `lib/sonido.ts`, `UltimoEscaneo` + `useUltimoEscaneo`, `ScanInput` que no borra el código no encontrado (lo deja seleccionado) y suena en error.
- Consumidores (W2-PANEL-MOSTRADOR): en **taquilla de boletos** el panel `UltimoEscaneo` reemplaza la línea "Último embarque" (éxito "Embarcado · Asiento 14 · Ana Pérez"; error "Boleto de otro viaje" / "Ya embarcó" / "Pago sin verificar" con el texto de `_resultado_embarque`); **taquilla de encomiendas** ("Recibida · EB-261004-46719" / "No encontrada"); **despacho** (al añadir a la lista: "Agregada · EB-…"; al rechazar: el motivo de `fn_validar_encomienda_despacho`); **recepción en destino** ("Recibida en tu oficina · EB-…"); **entrega** ("Abriendo la entrega de EB-…" / "Todavía va en camino" / "Está en la oficina de {ciudad}"). Cada resultado llama a `registrar(…)` (suena).
- Diálogos: el botón principal con `autoFocus` (Enter confirma), Esc cierra si no hay una operación en curso; revisar `despacho/page.tsx` (AlertDialog de despacho), `recepcion-lote-modal.tsx`, `entrega-modal.tsx` (cada paso con su campo principal enfocado), `pago-modal.tsx`. El escáner queda deshabilitado mientras cualquier diálogo esté abierto en las cinco pantallas (como ya hace taquilla de boletos).
- Aceptación: `grep -rn "useUltimoEscaneo" src/app/cooperativas` encuentra las cinco pantallas; `ScanInput` no ejecuta `setValue("")` en la rama "no encontrada"; con el sonido desactivado no se crea `AudioContext`.

### #44 Inicio (APP-09, APP-16, APP-17)
- `ProximoViajeCard` sobre el buscador cuando `useProximoViaje().proximo` existe: overline "Tu próximo viaje"; título "Hoy · 8:30 p. m." (o "Mañana · 8:30 p. m.", o "vie. 04/10 · 8:30 p. m."); línea "Caracas → Mérida"; meta "Asiento 14 · Expresos Mérida" ("Asientos 14 y 15" si son varios); si sale en menos de 3 h, chip "Sale en 1 h 20 min" (tono aviso); botón "Ver pase de abordaje" → `/boletos/[id]` con el código del primer boleto. Accesible como un solo bloque con el botón aparte.
- `HeaderActions` en la cabecera de Inicio, "Mis boletos" y "Mis encomiendas" (`ScreenHeader right={<HeaderActions />}`); Inicio deja de abrir su propio canal de notificaciones (usa `ActivityContext`).
- Espaciador del hero: de 96 pt a `Spacing['2xl']`; el botón "Buscar viaje" visible sin desplazar en 360×640.

### #45 Búsqueda (M-08, M-09, APP-13, APP-14, APP-15, APP-17, APP-18)
- `SearchForm`: "Desde" y "Hacia" apilados a ancho completo (alto ≥ `Sizes.control.xl`), ciudad en hasta 2 líneas, botón de intercambio de 44 × 44 pt a la derecha entre ambos ("Intercambiar origen y destino").
- `LocationSelector` del destino con `excluir={origen}` y `excluirAyuda="Ya es tu origen"` (y al revés "Ya es tu destino"); `recientes` = `ciudadesRecientes()`, `populares` = `CIUDADES_POPULARES`. Al buscar se llama a `guardarBusquedaReciente(origen, destino)`.
- Fecha ajustada sola: ayuda "Próxima salida disponible: vie. 9 oct." (con la fecha elegida) en vez de "Te mostramos el primer día con salidas…".
- Sin salidas en la ruta: bloque "No hay salidas programadas de Caracas a Mérida." + "Destinos con salidas desde Caracas:" con hasta 6 chips (consulta de `viajes` PROGRAMADO futuros con `rutas!inner` cuyo origen normalizado es el elegido, destinos distintos) que al tocarse fijan el destino, y el enlace "Cambiar destino" (abre el selector). Sin ninguno: "Por ahora no hay salidas desde Caracas. Prueba con otra ciudad de origen." El motivo bajo el botón deshabilitado sigue siendo corto: "No hay salidas en esta ruta".
- Calendario (`CalendarModal`, W1-APP-BASE): un toque elige y cierra; atajos "Hoy · Mañana · sáb. 5 · …" (días con salida) arriba; punto bajo los días con salida; sin navegar a meses pasados.

### #46 Resultados (APP-20, APP-21, APP-58)
- Consulta de `buscar`: añadir `fecha_hora_llegada_est`.
- Tarjeta de salida: título la cooperativa (+ insignia de calificación o "Nueva"); línea "8:30 p. m. → 6:15 a. m. (+1) · 9 h 45 min" (`formatHoraVE`, "(+1)" si la llegada cae otro día en hora VE, `formatDuracion`); `<Monto usd tasa>` a la derecha; debajo "Quedan 3" (`Badge tone="danger"`) si quedan 5 o menos, si no "{n} libres" en `muted`; chevron; sin la píldora con la inicial (`EntityCard` acepta `initial` opcional y no la dibuja si falta). Tocar la tarjeta elige la salida y pasa a "Asientos" (se quita la barra "Continuar con …"). `accessibilityLabel`: "Expresos Mérida, sale 8:30 p. m., llega 6:15 a. m. del día siguiente, USD 12,40, quedan 3 asientos".
- Chips de orden en línea sobre la lista: "Más temprano" · "Más barato" · "Más rápido"; la hoja "Filtrar" queda solo para elegir cooperativa y solo si hay más de una.
- `RouteSummary`: nombre completo de la ciudad (`subheading`, hasta 2 líneas) con la hora debajo si se pasa (`horaSalida?`, `horaLlegada?` nuevas, opcionales); `cityCode` queda exportada y `@deprecated`.

### #47 Asientos en tiempo real (M-14, M-17, M-18, APP-22) — verificación
Verificado hecho (§0). La migración 02 añade `viajes` a la publicación. W2-APP-VIAJES comprueba en `buscar`: al cambiar de salida el mapa no muestra los ocupados de la anterior (limpiar `ocupadosAjenos` antes de cargar); "Apartar asientos" deshabilitado mientras `usePerfil` carga (pendiente fase 3), con texto "Cargando tus datos…".

### #48 Mis boletos (M-34, M-35, APP-36)
Orden en `(tabs)/boletos`: "Activos" por `viajes.fecha_hora_salida` ascendente (sin salida, al final); "Historial" por salida descendente (respaldo `created_at`). El resto, verificado.

### #49 Notificaciones (M-53, M-54, APP-49, APP-50, APP-51)
- Push (W1-APP-BASE, `_layout`): tocarla abre el recurso (`abrirRecurso`); sin recurso, la lista. En primer plano: toast `info` "{título}: {mensaje}" con acción "Ver".
- Pantalla (W2-APP-CUENTA): `SectionList` con secciones "Hoy", "Ayer", "Esta semana", "Anteriores" (`agruparPorDia`); fila con icono y tono de `iconoNotificacion`, título (hasta 2 líneas), mensaje **completo**, hora `formatHaceTiempo`; sin leer = título en negrita + punto **estático** + "Sin leer" en el label accesible; con recurso: chevron y abre el recurso; sin recurso: al tocar solo se marca como leída (sin chevron). Cabecera: botón de texto "Marcar todo como leído" (solo con no leídas). Se elimina `PulseDot`.
- Toasts (W1-APP-BASE): errores persisten hasta "Cerrar"; éxito 3 s; info según largo.
- Iconos: `BOLETO_CONFIRMADO`, `PAGO_APROBADO` → `CheckCircle` éxito; `PAGO_RECHAZADO`, `ENCOMIENDA_RECHAZADA` → `XCircle` peligro; `PAGO_EN_VERIFICACION` → `Hourglass` aviso; `RESERVA_SIN_PAGAR` → `Clock` aviso; `VIAJE_CANCELADO` → `Prohibit` peligro; `VIAJE_REPROGRAMADO` → `CalendarX` aviso; `REEMBOLSO_ENVIADO` → `ArrowCounterClockwise` éxito; `ENCOMIENDA_PARA_TI` → `Package` info; `DEVOLUCION_AUTOMATICA` → `ArrowUUpLeft` aviso; sin tipo: `boleto` → `Ticket` info, `encomienda` → `Package` info, otro → `Bell` neutro.

### #50 Perfil (M-55, M-56, APP-52)
- `perfil.tsx` en secciones: **Cuenta** ("Datos personales" con botón de texto "Editar"; "Cambiar contraseña" o "Crear una contraseña" si la cuenta es solo de Google → `/cuenta/contrasena`); **Notificaciones** (tres `Switch` con label: "Boletos y pagos" `notif_boletos`, "Encomiendas" `notif_encomiendas`, "Recordatorios de viaje" `notif_recordatorios`; guardan al cambiar, toast de error y vuelven atrás si falla); **Ayuda** (como está); **Legal** ("Términos y condiciones", "Política de privacidad" con `abrirPaginaLegal`; la sección no se muestra sin `SITIO_URL`); "Cerrar sesión" (como está); al final, en texto destructivo, "Eliminar mi cuenta" → `/cuenta/eliminar`; versión.
- `/cuenta/contrasena`: título "Cambiar contraseña"; "Contraseña actual" (solo con proveedor `email`), "Contraseña nueva" (mín. 6, `autoComplete="new-password"`), "Repite la contraseña nueva"; botón "Guardar contraseña" / "Guardando…". Verifica la actual con `signInWithPassword({ email, password })`; incorrecta → "La contraseña actual no es correcta."; distintas → "Las contraseñas no coinciden."; éxito → toast "Listo. Tu contraseña cambió." y volver. Solo Google: título "Crear una contraseña" y texto "Entras con Google. Si creas una contraseña, también podrás entrar con tu correo {correo}.".
- `/cuenta/eliminar`: título "Eliminar mi cuenta"; "Esto es lo que pasa:" • "Borramos tu nombre, tu cédula, tu teléfono y tus notificaciones." • "Tus boletos y envíos anteriores se guardan sin tus datos personales, porque las cooperativas los necesitan para su contabilidad." • "Ya no podrás entrar con {correo}. Si quieres volver a usar EnBus, crea una cuenta nueva." • "No se puede deshacer."; "¿Por qué te vas? (opcional)" con chips "Ya no la uso", "Tengo otra cuenta", "Problemas con la app", "Otro"; casilla "Entiendo que no se puede deshacer"; botón destructivo "Eliminar mi cuenta" / "Eliminando…". `EB_CUENTA_CON_ACTIVIDAD` → tarjeta de aviso con el `hint` y enlaces "Ver mis boletos" / "Ver mis encomiendas". Éxito: `supabase.functions.invoke('eliminar-cuenta')` (si falla, no se muestra error: el admin la completa), cierre de sesión local, `router.replace('/(auth)/login')` y toast "Eliminamos tu cuenta. Gracias por usar EnBus.".
- `login.tsx` muestra `avisoSesion` de `AuthContext` ("Esta cuenta fue eliminada.") en un aviso y lo limpia.
- `ayuda.tsx`: pregunta frecuente "¿Cómo elimino mi cuenta?" → "Desde Perfil › Eliminar mi cuenta. Si tienes boletos o envíos en curso, espera a que terminen.".

### #51 Resumen de la cooperativa (P-15, PC-14, PC-16)
- Bandeja "Requiere tu atención" (arriba, debajo del aviso de estado y el checklist), con `fn_bandeja_cooperativa`; solo tarjetas con valor > 0, cada una es un enlace con flecha:
  - "{n} pagos por verificar" · "Confírmalos para emitir los boletos y despachar los envíos." → `/cooperativas/pagos`
  - "{n} reembolsos por devolver" · "{Monto usd}" → `/cooperativas/reembolsos`
  - "{n} encomiendas con 3 o más días en tu oficina" · "La primera vuelve al remitente en {d} días hábiles." (d = 0: "Hoy vuelven al remitente si nadie las retira.") → `/cooperativas/entrega`
  - "{n} encomiendas listas para despachar" → `/cooperativas/despacho`
  - "{n} encomiendas en camino a tu oficina" → `/cooperativas/recepcion-destino`
  - "Próxima salida: {Valencia → Caracas} {en 25 min | hoy a las 3:30 p. m. | mañana a las 7:00 a. m.}" · "{v} boletos vendidos · {a} asientos libres · {e} encomiendas por despachar" → `/cooperativas/despacho?viaje={id}`
  - Todo en cero: "Todo al día. No tienes nada pendiente por ahora." Error: `ErrorState` compacto "No pudimos cargar tus pendientes" con "Reintentar".
- KPI: "Encomiendas recibidas hoy" (ayuda "En tu taquilla"), "Encomiendas despachadas hoy", "Boletos vendidos hoy" ("App y taquilla"), "Ingresos de hoy" (`<Monto>`).
- Comisiones: tarjeta en tono aviso (`bg-warning-light text-warning-deep`), título "Comisión pendiente con EnBus", el monto, y "¿Dudas sobre cómo pagarla? Escríbenos" (WhatsApp si hay número).
- "Encomiendas recientes": primera celda `CeldaEnlace` (código) → `/cooperativas/taquilla/encomiendas?encomienda={id}`; `loading.tsx` con la misma estructura (bandeja, 4 KPI, tabla).

### #52 Viajes y rutas (P-11, P-48, P-52, P-53, PC-43…46)
- **Lista** (`viajes/page.tsx` + `client.tsx`): pestañas en la URL `?vista=hoy|proximos|historial` ("Hoy ({n})", "Próximos 7 días", "Historial"); hoy y próximos en orden ascendente desde ahora, historial descendente (límite 100, "Mostrando los últimos 100 viajes"); filtro de fecha en hora VE (`rangoDiaVE`). Vacío de "Hoy": "No hay salidas hoy." + "Programar salida"; sin rutas: "Primero crea una ruta con su precio." + "Crear ruta" → `/cooperativas/rutas`.
- **Programar**: días como botones de alternancia "Lun Mar Mié Jue Vie Sáb Dom" (`aria-pressed`, `aria-label` "Lunes"…); resumen en vivo "Se crearán 24 salidas entre el 05/10 y el 31/10 a las 7:00 a. m." calculado con la **misma** función que usa la acción (`viajes/salidas.ts`, nueva, pura); errores "La fecha final debe ser igual o posterior a la inicial.", "Elige al menos un día.", "No hay ningún lunes entre esas fechas.", "Programa como máximo 120 salidas a la vez."; botones "Cancelar" y "Programar 24 salidas".
- **Editar** (admin, PROGRAMADO): "Editar viaje" con "Fecha y hora de salida", "Unidad", "Chofer", "Asientos"; si cambia la hora y hay pasajeros: aviso "Avisaremos a {n} pasajeros del cambio de hora." y "Motivo del cambio (se lo enviaremos)" obligatorio; "Guardar cambios" / "Guardando…" → `fn_editar_viaje`; toast "Viaje actualizado." o "Viaje actualizado. Avisamos a {n} pasajeros."; `minimo` del error se muestra en el campo Asientos.
- **Marcar llegada** (EN_CURSO, ambos roles): "Marcar llegada" → `fn_completar_viaje`; toast "Viaje completado." + " {n} pasajeros no embarcaron." si aplica.
- **Manifiesto** (`lib/printing/manifiesto.ts`, nuevo): botón "Imprimir manifiesto" en el detalle; ventana de impresión con cooperativa, ruta, salida, unidad y chofer; "Pasajeros" (asiento en orden natural, nombre, cédula con `formatCedula`, estado "Pagado" / "Embarcado" / "Apartado"); "Encomiendas" (código, destinatario, teléfono, "Pagada" o "Cobrar al retirar: {Bs}"); pie "Impreso el {fecha y hora VE}" y línea "Firma del chofer". Ventana bloqueada → toast "Tu navegador bloqueó la ventana de impresión. Permite ventanas emergentes para este sitio e intenta de nuevo.".
- **Rutas**: "Duración del viaje" con dos campos "Horas" (0–48) y "Minutos" (0–59) y ayuda "Ejemplo: 8 h 30 min" (se guarda en minutos); la tabla usa `formatDuracion`; origen = destino → "El origen y el destino deben ser ciudades distintas."; vacío: "Todavía no tienes rutas." + "Crear tu primera ruta".

### #53 Hardware al alcance del taquillero (P-60, PC-51)
- `/cooperativas/hardware` (nueva, ambos roles) "Impresora y lector", descripción "Prepara la impresora de tickets y el lector de esta computadora.":
  - **Impresora**: estado "Conectada · {nombre}" / "Reconectando…" / "Sin conectar" / "Este navegador no puede usar impresoras Bluetooth. Usa Chrome o Edge." ; botones "Conectar impresora" / "Cambiar impresora" y "Imprimir ticket de prueba"; "Ancho del papel": radios "58 mm" / "80 mm"; nota "Al abrir el panel intentamos reconectarla sola.".
  - **Lector**: campo "Prueba el lector aquí" y resultado "El lector funciona ({ms} ms)." o "Eso parece escrito a mano: un lector escribe todo el código en menos de medio segundo.".
  - **Sonido**: interruptor "Sonar al escanear", botones "Probar sonido de éxito" y "Probar sonido de error".
- `lib/printing/bluetooth.ts`: `reconectar(): Promise<boolean>` (con `navigator.bluetooth.getDevices?.()` busca el id guardado y conecta), listener `gattserverdisconnected` con 3 reintentos (2 s, 5 s, 10 s); `hooks/use-impresora.ts` (nuevo) `{ estado: 'conectada' | 'reconectando' | 'desconectada' | 'no-soportado'; nombre; conectar(); reconectar(); }`, montado en taquilla de boletos, taquilla de encomiendas y hardware. `escpos.ts`: 32 o 48 caracteres por línea según `enbus.papel`.
- `configuracion/hardware/page.tsx` → `redirect('/cooperativas/hardware')`; Configuración deja de mostrar el enlace (W2-PANEL-GESTION).

### #54 Admin operativo (A-05, A-06, A-07, AD-06, AD-07, AD-14…AD-22)
- **Dashboard**: banda "Finanzas de hoy" (tarjetas grandes "Ingresos brutos" y "Comisiones estimadas" con `<Monto>`) y banda "Operación de hoy" ("Encomiendas", "Boletos", "Cooperativas activas", "Solicitudes por revisar" → `/admin/solicitudes`, "Encomiendas con más de 72 h en tránsito" → `/admin/incidencias?tipo=ALERTA_AMARILLA&estado=pendientes`); cada KPI con delta frente a ayer ("▲ 12 % vs. ayer", "▼ 3 % vs. ayer", "Igual que ayer", "Sin datos de ayer"), con texto accesible ("subió 12 % respecto a ayer"); tarjetas de aviso en tono `warning` con "Revisar →". `fetchDashboardKPIs` devuelve hoy y ayer (rango VE).
- **Tarifas**: diálogo en dos pasos. 1 "Nueva tarifa": "Precio por kilo (USD)", "Recargo por minuto de viaje" (ayuda en vivo "Para un viaje de 8 h: +48 %"), "Peso máximo (kg)", "Medida máxima (cm)", "¿Desde cuándo?" ("Ahora" / "Programar" con fecha y hora VE), "Nota (opcional)". 2 "Revisa los cambios": tabla Antes → Después con % por campo y "Ejemplos" (3 rutas activas × 1, 5 y 10 kg con la fórmula de `_costo_encomienda`: "Caracas → Maracaibo, 5 kg: USD 18,40 → USD 21,10 (+14,7 %)"); botón "Publicar tarifa" o "Programar tarifa" → `fn_publicar_tarifa`. Tarjeta vigente con "Programada para el 05/10 a las 6:00 a. m." y "Cancelar programación" (`ConfirmDialog` → `fn_cancelar_tarifa_programada`). Ayudas ≥ 12 px, slider con `aria-label` y `aria-valuetext`, iconos distintos por concepto (AD-16). `createTarifa` deja de hacer dos escrituras.
- **Comisiones**: "Registrar pago" pide "Método" (Pago Móvil, Transferencia, Zelle, Efectivo; obligatorio), "Referencia" (obligatoria salvo efectivo) y fecha; guarda `pago_metodo`, `pago_referencia`, `pago_registrado_por` (se quita el aviso "la referencia no se guardó"); tabla "Pagado el 02/10 · Pago Móvil · ref. 1234"; CSV con método.
- **Usuarios**: búsqueda y paginación en servidor (`?q=&rol=&cooperativa=&pagina=`, 50 por página, `count: 'exact'`, `ilike` sobre nombre, cédula y teléfono; placeholder "Nombre, cédula o teléfono"); "Mostrando 1–50 de 2.340"; columnas "Usuario" (nombre + correo en dos líneas), "Rol" (`ROLES`), "Cooperativa", "Estado", "Registrado", ocultando las dos últimas por debajo de `lg`; filtros con `Label htmlFor`; el filtro de cooperativas lista todas agrupadas por estado; insignia "Cuenta eliminada" (`eliminada_at`) y filtro "Bajas por completar" (`bajas_cuenta.auth_eliminada_at is null`) con acción "Completar baja" (`ConfirmDialog` → server action con `auth.admin.deleteUser(id, true)` y `auth_eliminada_at`); motivos de botones deshabilitados como texto visible.
- **Incidencias**: vista por defecto `estado=pendientes` (ABIERTA y EN_PROCESO); orden por prioridad (PERDIDA, DANADA → alta; REPORTE_USUARIO con categoría PAGO, ALERTA_AMARILLA → media; resto → baja) y luego la más antigua primero; columna "Prioridad" y antigüedad "hace 3 h"; filtros en la URL; textos ≥ 12 px.
- **Cooperativas** (AD-14): nombre con `CeldaEnlace`; filtros en la URL (`?estado=&q=`); "Sin calificaciones" en vez de "0.0 (0)"; pestañas del detalle con `?tab=`; PENDIENTE con insignia "Pendiente de aprobación" y enlace "Revisar solicitud".

### #55 Admin dentro del sistema visual (AD-01…AD-04)
- Sin `slate-*`, `orange-*`, `emerald-*`, `text-white` fijos (mapa de §3.3); acción primaria = `Button` por defecto; éxito/aviso/peligro con tokens.
- `PageHeader` en todas las páginas del admin, con `migas` en los detalles: "Cooperativas › {nombre}", "Usuarios › {nombre}", "Incidencias › {código}", "Comisiones", etc.; un solo estilo de H1.
- Marca: bloque "EB" sobre `bg-primary` + "EnBus · Administración" en lugar del icono `Shield` (sidebar y login); rol "Superadministrador"; contador de solicitudes estático (sin `animate-pulse`), "99+" como máximo y `aria-label="{n} solicitudes por revisar"`.
- Tema claro legible en todas las pantallas (revisar diálogos, `incidencia-detail`, `usuario-detail-tabs`, `cooperativa-detail-tabs`).

### #56 Tokens compartidos (DS-02)
Ver §1 y §3.3. Aceptación: `node shared/generar.mjs --check` sale con 0; `grep -rnE "#[0-9a-fA-F]{6}" PanelCooperativas/src/app/globals.css LandingEnBus/app/globals.css` vacío (los hex viven en `tokens.generated.css`); `npx tsc --noEmit` en los tres proyectos sin errores nuevos; al final de la oleada 2, `npx eslint` sin avisos de `no-restricted-syntax` en panel y landing.

### #57 Formatos venezolanos unificados (APP-05, APP-43, PC-04, DS-06)
- Fuente única `shared/ve.ts` (§3.3) y reexportaciones. El panel muestra "Mérida", "San Juan de los Morros".
- `CedulaField`/`TelefonoField` (app, W1-APP-BASE) en: registro de `login.tsx`, `CompletarPerfilSheet`, datos de `perfil.tsx`, "Quién recibe" de `encomiendas/nueva.tsx` (cédula con letras V, E, J, P), `PasajerosForm` (cédula). Web (W1-PANEL-BASE) en: registro de cooperativa (teléfono), `nueva-encomienda-dialog` (remitente y destinatario), "Retira otra persona" de `entrega-modal`, métodos de pago (cédula del titular, teléfono de Pago Móvil).
- BD: forma única y unicidad normalizada (migración 03).

### #58 Artefactos compartidos (P-25, DS-09)
- `shared/artefactos.ts` (§3.3) y `Specs/00_General/Artefactos_Compartidos.md` (nuevo, W1-SHARED): para cada artefacto, cómo se guarda, cómo se muestra, qué acepta la taquilla y dónde aparece. Código de boleto: guardado `BOL-7CABE4AD`, mostrado `BOL-7CAB-E4AD`, aceptado con o sin guiones, espacios, minúsculas o `PASS-`. QR del pase: `qr_embarque_data` o `PASS-<código>`. Código de seguimiento: `EB-AAMMDD-NNNNN`, QR = el mismo código. PIN de retiro: 4 dígitos, 10 intentos, validación de 15 min, se imprime en la guía. Ticket de boleto: Cooperativa · Ruta · Sale · Unidad · Asiento · Pasajero · Cédula · Código (formato mostrado) · QR · Total Bs con ≈ USD y tasa. Guía de encomienda: Código · Remitente real · Destinatario · Ruta · Modalidad · Costo · PIN.
- Panel: `formatCodigoBoleto` en todo lugar donde se muestra un código de boleto (tickets de `print-helpers`, venta, embarque, pasajeros del viaje, verificación de pagos, reembolsos, manifiesto, admin); `normalizarCodigoBoleto` antes de enviar lo escrito a `validarEmbarque`.
- Guía PDF con remitente real y PIN (§2.5).

### #59 Accesibilidad base (APP-57, PC-25, AD-14, AD-22, DS-10)
- App `Field` (W1-APP-BASE): `accessibilityLabel={label}` y `accessibilityHint={helper}` en el `TextInput`; error con `accessibilityLiveRegion="assertive"` y `accessibilityRole="alert"`; borde en reposo en tono `light` `alpha(Colors.foreground, 0.45)` (≥ 3:1). "Reducir movimiento": `StaggerItem`, `PageTransition`, `PressableScale`, `SkeletonLoader`, `BottomSheet` y `Toast` usan `useReducedMotion()` y no animan (o solo cambian opacidad).
- Panel y landing: bloque `@media (prefers-reduced-motion: reduce)` en `globals.css` (W1-SHARED) que anula animaciones y transiciones; `CeldaEnlace` en todas las tablas con filas que abren algo (taquillas, entrega, recepción, pagos, empleados, rutas, viajes, admin); botones de icono con `aria-label` específico ("Editar Pago Móvil Banesco"); selector de asientos del panel con `aria-label="Asiento 14, libre"`, `aria-pressed`, "✓ 14" y orden natural (PC-25, W2-PANEL-MOSTRADOR); reglas `jsx-a11y` de §3.3 con 0 avisos en archivos propios.

### #60 Limpieza (M-57, APP-11, APP-59, LP-08, LP-09)
- Borrar: `EnBusApp/src/components/Spinner.tsx`, `storage.getSignedPhotoUrl`, `PanelCooperativas/src/components/landing/` (completo), `LandingEnBus/LandingEnBus/` (completo), `LandingEnBus/components/{testimonials,theme-provider}.tsx`. Antes de borrar, `grep` sin resultados de importaciones.
- Se conservan `app/viajes/[id].tsx` y `app/boletos/resultados.tsx` (enlaces antiguos que ya redirigen al asistente).
- `Specs/02_App_Movil/Design_System_Spec.md`: se reemplaza por una página que remite a `EnBusApp/DESIGN.md` y `shared/README.md` (marca "Obsoleto: la fuente es …") y resume tipografía Roobert, paleta y reglas de texto.
- Landing (W1-LANDING): `metadataBase` desde `NEXT_PUBLIC_SITIO_URL` (sin valor por defecto; si falta, se omite), `alternates.canonical: '/'`, `app/opengraph-image.tsx` (1200 × 630, `ImageResponse` de `next/og`: fondo amarillo, "EnBus" y "Boletos de bus y encomiendas por toda Venezuela"), `app/robots.ts` (todo permitido + sitemap si hay URL), `app/sitemap.ts` (`/`, `/rastrear`, `/registro-cooperativa`, `/terminos`, `/privacidad`, `/eliminar-cuenta`), JSON-LD `Organization` en el layout; animaciones CSS sin uso fuera (W1-SHARED en `globals.css`). Fuente: se mantiene `RoobertVF.ttf` (convertir a woff2 necesita una herramienta externa: paso manual).

---

## 5. Páginas legales de la landing (W1-LANDING)

Texto claro, sin jerga, con la fecha "Última actualización: {fecha}" y la nota visible "Este texto está en revisión legal." hasta que negocio lo apruebe (paso manual 5).
- `/privacidad` "Política de privacidad": qué datos guardamos (nombre, cédula, teléfono, correo; datos de pasajeros que tú escribes; datos de quien recibe tus envíos; fotos del paquete; referencias de pago; el token para enviarte notificaciones), para qué (emitir boletos y guías, que la cooperativa verifique tu pago y te identifique al embarcar o retirar, avisarte de cambios, soporte), con quién se comparten (solo con la cooperativa que te presta el servicio; proveedores técnicos: alojamiento de datos, envío de correos y de notificaciones), cuánto tiempo (mientras tengas la cuenta; los boletos y envíos se conservan sin tus datos personales para la contabilidad de las cooperativas), tus derechos (ver y corregir tus datos en Perfil; eliminar la cuenta), contacto (WhatsApp de soporte si existe).
- `/terminos` "Términos y condiciones": EnBus conecta pasajeros y remitentes con cooperativas, que son quienes transportan; precios en USD de referencia y cobro en Bs a la tasa BCV del día; reservas que vencen si no se pagan; cancelación con reembolso del 95 % del pasaje si la cancela el pasajero antes de la salida y del 100 % si la cancela la cooperativa, hecho por la cooperativa; encomiendas: artículos no permitidos (lista referencial de #31), seguro hasta 3 veces el valor declarado, devolución al remitente a los 5 días hábiles sin retiro; PIN de retiro personal.
- `/eliminar-cuenta` "Eliminar tu cuenta de EnBus": "Desde la app: Perfil › Eliminar mi cuenta." "Si ya no tienes la app: escríbenos por WhatsApp desde el teléfono de tu cuenta o al correo de soporte, y la eliminamos en un máximo de 7 días." Qué se borra y qué se conserva (igual que en la app).
- Footer de la landing: enlaces "Términos", "Privacidad", "Eliminar cuenta".

---

## 6. Pendientes de la fase 3: qué entra y qué no

**Entran** (cluster entre paréntesis): `fn_entregar_encomienda` no cuenta el PIN fallido → validación previa obligatoria + bloqueo de escrituras directas (W1-DB, 01; W2-PANEL-MOSTRADOR maneja `EB_PIN_NO_VALIDADO`); `comisiones_ciclo.pago_referencia` → columnas de pago (W1-DB, 02; W2-ADMIN); `viajes` y `pagos` fuera de `supabase_realtime` (W1-DB, 02); `fn_remitente_de_encomienda` con `remitente_*` (W1-DB, 02); `generar-guia-pdf` sin `remitente_*` ni PIN (W1-DB); `verificarCorreoRegistro` sin límite (W1-DB, 03; W2-PANEL-GESTION); `reenviarInvitacion` con límite no atómico e invitaciones previas válidas (W1-DB, 03; W1-LANDING); `fn_rutas_populares` contaba salidas de cooperativas no activas (W1-DB, 02); `UNIQUE` de cédula y teléfono sobre texto crudo (W1-DB, 03); logo del admin de cooperativa bloqueado por Storage (W1-DB, 03); `createTarifa` no transaccional (W1-DB, 02; W2-ADMIN); `ScanInput` borra el código (W1-PANEL-BASE); `components/landing/*` del panel (W2-PANEL-GESTION); `storage.getSignedPhotoUrl` (W1-APP-BASE); `buscar` con `usePerfil` cargando (W2-APP-VIAJES); `invite/[token]` reinicia el formulario tras un error del servidor → campos controlados (W2-PANEL-GESTION); cancelar viaje con `EB_PAGOS_PENDIENTES` repite error y aviso → solo el aviso con el enlace (W2-PANEL-GESTION); la bandeja de reembolsos carga vacía y con spinner → datos iniciales desde el servidor (W2-PANEL-GESTION).

**No entran** (justificación):
- `fn_reembolsos` deduce `cancelado_por` del texto del motivo y usa `updated_at` como fecha: el monto no cambia; arreglarlo exige una columna nueva y redefinir `fn_cancelar_boleto`, `fn_cancelar_viaje` y `fn_reembolsos` (tres RPC grandes de la fase 3) por un dato informativo. Queda documentado.
- `fn_rechazar_encomienda_origen` avisa al empleado en las altas de taquilla: `_notificar_usuario` ya ignora a quien no es `user`, así que el aviso no se envía; el panel ya pide explicarle el motivo al cliente.
- `invitaciones` sin política UPDATE: renovar y revocar comprueban la pertenencia en el servidor con el cliente de servicio; una política nueva no cambia lo que ve nadie.
- Motivo de suspensión solo en `app_metadata`: auditoría de usuarios fuera del alcance UX; el motivo se muestra hoy en el admin.
- Días hábiles calculados en UTC en SQL y en hora VE en el panel: la diferencia es de horas cerca de medianoche y no cambia ninguna decisión del mostrador; corregirlo toca `calcular_dias_habiles`, que usan el cron y la devolución automática.
- `StepIndicator` sin nombres de pasos y `canjearCodigo` con sesión previa: riesgos aceptados en la fase 3.
- En `nueva.tsx` la sucursal de entrega es informativa: el trigger la borra a propósito (la taquilla decide al recibir).
- Brillo automático del QR (`expo-brightness`) y fuente woff2: requieren una dependencia o herramienta nueva (pasos manuales).
- **Decisiones de negocio** (solo se documentan, §8): texto de reembolso a quien pagó con Zelle ("Te devolveremos Bs …"), lista de artículos prohibidos y texto del seguro, y si un cambio de hora del viaje da derecho al 100 %.

---

## 7. Partición en oleadas

Criterio común (todos los clusters TS): `npx tsc --noEmit` y lint del proyecto sin errores nuevos en los archivos propios (y, en la oleada 2, sin avisos de `no-restricted-syntax` ni `jsx-a11y` en ellos); sin `formatCurrency`, `` `$${…}` `` ni `` `${…} Bs` ``; ningún `catch` que termine solo en `console.*`; copy de §4 tal cual (se puede pulir sin cambiar el sentido); contratos de §3 sin cambiar firmas; los archivos `*.generated.*` no se editan a mano. Un cluster que necesite cambiar un archivo ajeno lo anota en sus notas; no lo edita.

**Oleada 1** (fundamentos, en paralelo): W1-DB, W1-SHARED, W1-APP-BASE, W1-PANEL-BASE, W1-LANDING. Dentro de la oleada solo se dependen por contratos ya fijados aquí: W1-APP-BASE y W1-PANEL-BASE usan las exportaciones **actuales** de `validation.ts` / `lib/ve.ts` (W1-SHARED las conserva) y no necesitan nada nuevo de `shared/`.
**Oleada 2** (consumidores, cuando termine la 1): W2-APP-VIAJES, W2-APP-CUENTA, W2-PANEL-MOSTRADOR, W2-PANEL-GESTION, W2-ADMIN.

| Cluster | Mejoras | Archivos propios (resumen; la lista exacta va en la partición estructurada) |
|---|---|---|
| W1-DB | SQL de §2, edge functions §2.5, specs de backend | `supabase/migrations/20260721000001…03` (nuevos), `supabase/functions/eliminar-cuenta/index.ts` (nuevo), `functions/{generar-guia-pdf,enviar-push,procesar-notificaciones-pendientes}/index.ts`, `Specs/00_General/{Glosario,State_Machines_Spec}.md`, `Specs/01_Supabase_Backend/*.md` |
| W1-SHARED | #56, #57 y #58 (fuente y reexportaciones), lint, reducir movimiento en CSS, spec de diseño | `shared/*` (nuevo), los 9 `*.generated.*`, `EnBusApp/src/{theme.ts, utils/validation.ts, utils/codigos.ts, utils/formatters.ts}`, `EnBusApp/{eslint.config.js, DESIGN.md}`, `PanelCooperativas/src/app/globals.css`, `PanelCooperativas/src/lib/{ve,rif,ciudades,fechas}.ts`, `PanelCooperativas/eslint.config.mjs`, `LandingEnBus/{app/globals.css, lib/rif.ts, eslint.config.mjs}`, `Specs/02_App_Movil/Design_System_Spec.md`, `Specs/00_General/Artefactos_Compartidos.md` (nuevo) |
| W1-APP-BASE | piezas de §3.4, push (#49), toasts (APP-51), `Field` y reducir movimiento (#59), selector y calendario (#45), limpieza de la app | `app/_layout.tsx`, `src/components/ui/{Field,Screen,BottomSheet,index}`, `src/components/{Toast,StaggerItem,PageTransition,PressableScale,SkeletonLoader,LocationSelector,CalendarModal}.tsx`, nuevos `HeaderActions`, `ProximoViajeCard`, `CedulaField`, `TelefonoField`, `useProximoViaje`, `utils/notificaciones`, `utils/busquedasRecientes`; `usePushNotifications`, `ActivityContext`, `AuthContext`, `utils/{soporte,errores,storage,venezuela}.ts`, `types/index.ts`, `.expo/types/router.d.ts`; borra `Spinner.tsx` |
| W1-PANEL-BASE | piezas de §3.5, #43 base, PageHeader (#55), `CeldaEnlace`, campos VE web, tokens en componentes compartidos | `src/lib/sonido.ts`, `src/components/{ultimo-escaneo,celda-enlace,ve-fields}.tsx` (nuevos), `src/components/{scan-input,page-header,status-badge,confirm-dialog,error-state,empty-state,monto,tasa-bcv-provider,connectivity-banner,estado-cooperativa-banner,checklist-puesta-en-marcha,panel-shell,app-sidebar}.tsx`, `src/components/ui/label.tsx`, `src/lib/{navigation,errores,estados}.ts`, `src/lib/types/{boletos,encomiendas,pagos,configuracion,operacion}.ts` |
| W1-LANDING | #60 SEO y limpieza de la landing, §5 páginas legales, límite de `reenviarInvitacion`, tokens en sus componentes | `LandingEnBus/app/{layout,page}.tsx`, nuevos `app/{opengraph-image.tsx, robots.ts, sitemap.ts, terminos/page.tsx, privacidad/page.tsx, eliminar-cuenta/page.tsx}`, `app/registro-cooperativa/*`, `app/rastrear/*`, `components/*.tsx` de la home, `lib/urls.ts`; borra `testimonials.tsx`, `theme-provider.tsx` y `LandingEnBus/LandingEnBus/` |
| W2-APP-VIAJES | #44, #45, #46, #47 (verificación), #48 | `app/(tabs)/{index,boletos}.tsx`, `app/boletos/buscar.tsx`, `src/components/{SearchForm,SeatSelector,TransactionCard,PasajerosForm}.tsx`, `src/components/ui/{RouteSummary,EntityCard}.tsx` |
| W2-APP-CUENTA | #49 (pantalla), #50, #57 en formularios de cuenta y encomienda | `app/{notificaciones,perfil,ayuda}.tsx`, `app/cuenta/{contrasena,eliminar}.tsx` (nuevos), `app/(tabs)/encomiendas.tsx`, `app/encomiendas/nueva.tsx`, `app/(auth)/login.tsx`, `src/components/CompletarPerfilSheet.tsx`, `src/hooks/usePerfil.ts` |
| W2-PANEL-MOSTRADOR | #43 (pantallas), #53, #58 en tickets, `EB_PIN_NO_VALIDADO`, `?encomienda=` y `?viaje=`, tokens y filas en el mostrador | taquillas de boletos y encomiendas, despacho, recepción en destino, entrega, pagos, `hardware/page.tsx` (nuevo) y `configuracion/hardware/page.tsx`, `components/{boletos,encomiendas,entrega}/*`, `components/pagos/verificar-pago-dialog.tsx`, `components/camera-qr-scanner.tsx`, `hooks/{use-barcode-scan,use-encomiendas-realtime,use-impresora}.ts`, `lib/printing/{bluetooth,escpos,print-helpers}.ts` |
| W2-PANEL-GESTION | #51, #52, límite del registro, pendientes de gestión, tokens en gestión y auth, borrar la landing del panel | dashboard, viajes (+ `salidas.ts` nuevo), rutas, reembolsos, empleados, configuración, `error/not-found/loading` del panel, invite, login, recuperar, restablecer, registro, `app/cooperativas/page.tsx`, `components/activity-chart.tsx`, `lib/printing/manifiesto.ts` (nuevo), `lib/types/reembolsos.ts`; borra `components/landing/` |
| W2-ADMIN | #54, #55, a11y del admin, bajas de cuenta | `src/app/admin/**`, `src/components/admin/**`, `src/components/{admin-shell,admin-sidebar}.tsx`, `src/lib/admin-navigation.ts`, `src/lib/data/admin-*.ts`, `src/lib/types/admin-*.ts`, `src/lib/email.ts` |

---

## 8. Pasos manuales para el usuario

1. **Migraciones** en una rama de Supabase o en staging (nunca directo a producción): `20260721000001` → `02` → `03`, con `NOTIFY pgrst, 'reload schema';` después de cada una. Leer los NOTICE: si la publicación `supabase_realtime` no existe, activarla y repetir la 02; si no se crearon `uq_profiles_cedula_normalizada` o `uq_profiles_telefono_normalizado`, resolver los duplicados con la consulta del NOTICE y repetir la 03. Repetir las pruebas de §2.4 contra PostgREST.
2. **Edge functions**: desplegar `eliminar-cuenta` (nueva), `generar-guia-pdf`, `enviar-push` y `procesar-notificaciones-pendientes`.
3. **Variables de entorno**: `EXPO_PUBLIC_SITIO_URL` (app, `.env.local` y EAS), `NEXT_PUBLIC_SITIO_URL` (landing, para `metadataBase`, OG y sitemap; y panel, para enlazar los términos desde el registro).
4. **Orden de despliegue**: migraciones → edge functions → panel y landing → nuevo build de la app (EAS) con las rutas `/cuenta/*`.
5. **Revisión legal** de `/terminos` y `/privacidad` (quitar la nota "Este texto está en revisión legal." al aprobarlos). En Google Play Console: URL de la política de privacidad, URL de eliminación de cuenta (`{sitio}/eliminar-cuenta`) y el formulario de seguridad de los datos.
6. **Decisiones de negocio** (documentadas, sin implementar): texto del reembolso a quien pagó con Zelle (hoy "Te devolveremos Bs …"); lista de artículos prohibidos y texto del seguro (3 veces el valor declarado); si un cambio de hora hecho por la cooperativa da derecho a reembolso del 100 % (hoy el aviso dice "escríbele a la cooperativa").
7. **Bajas pendientes**: si la edge function falla, completar desde Admin › Usuarios › "Bajas por completar", o revisar con `select * from bajas_cuenta where auth_eliminada_at is null;`.
8. **Opcionales**: convertir `LandingEnBus/public/fonts/RoobertVF.ttf` a woff2 con subconjunto latino (herramienta externa) y cambiar `localFont`; `npx expo install expo-brightness` para el brillo del QR (sigue de la fase 3).
9. **Al integrar la oleada 2**: con `npx eslint` sin avisos en panel y landing, pasar a `error` las reglas `no-restricted-syntax` y `jsx-a11y` añadidas en `eslint.config.mjs`; ejecutar `node shared/generar.mjs --check` (y añadirlo al CI cuando exista).
10. **Pruebas en staging**: entrega con PIN validado hace más de 15 min (debe pedir validarlo otra vez); un empleado no puede entregar con la validación de otro; push que abre el boleto y la encomienda (app cerrada y abierta); eliminar una cuenta con un boleto activo y sin actividad; cambiar y crear contraseña; editar la hora de un viaje con pasajeros (llega el aviso); programar una tarifa y verla activarse; registrar el pago de una comisión con método y referencia; asientos que se actualizan solos en dos teléfonos; contador "Pagos por verificar" que se mueve solo; impresora que se reconecta al recargar el panel; logo subido por el admin de la cooperativa.

## 9. Riesgos

- **Entrega**: un taquillero que valide el PIN y tarde más de 15 minutos en confirmar recibe `EB_PIN_NO_VALIDADO`; el modal debe volver al paso del PIN sin perder lo escrito en identidad. Cualquier pantalla antigua que hiciera `UPDATE encomiendas SET estado='ENTREGADA'` deja de funcionar (no queda ninguna en el panel actual).
- **Normalización de perfiles**: cambia el texto guardado de cédulas y teléfonos antiguos (no su valor normalizado); el onboarding de un empleado cuya cédula ya usa otra cuenta escrita distinto ahora falla con 23505 (antes pasaba y duplicaba).
- **Realtime**: añadir tablas a la publicación aumenta el tráfico de cambios; Realtime filtra por RLS, pero conviene vigilar el consumo.
- **Baja de cuenta sin la edge function**: el perfil queda anonimizado y la sesión se cierra, pero la identidad de Auth sigue hasta que el admin complete la baja; `AuthContext` impide usarla.
- **Tarifas programadas**: dependen del cron `activar_tarifas_programadas`; si `pg_cron` no corre, la programada no entra en vigor (el admin la ve como "Programada" con la fecha vencida).
- **Tokens**: unificar los textos de estado con los valores de la app cambia levemente el tono de los textos verdes y naranjas del panel (todos ≥ 4,5:1).
- **Archivos generados**: si alguien edita un `*.generated.*`, `--check` lo detecta; sin CI, depende de ejecutar el script.
- **SQL validado en PGlite**, no en PostgREST real (roles, Storage, Realtime, `auth.users`): repetir §2.4 en staging.
