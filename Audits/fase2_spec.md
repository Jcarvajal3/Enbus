# Fase 2 (P0) — Especificación de implementación final

Repositorio: `C:\Users\Javie\Documents\Dev\Panas Cargo` · rama `ux/mejoras-auditoria` (fase 1 aplicada sin commit).
Alcance: plan #1, #2, #3, #5, #6, #14, #15, #16 + pendientes de fase 1.
Decisión de negocio: **precios de referencia en USD; el cobro se hace en bolívares a la tasa BCV del día.**

Este documento combina el Diseño A (cambio mínimo) y el Diseño B (integridad primero). Regla de arbitraje: el dinero y los estados se deciden en el servidor (RPC `SECURITY DEFINER`), sin piezas que no paguen su coste (sin tabla de auditoría, sin códigos de motivo, sin `monto_usd` duplicado, sin RPC de entrega con cédula).

---

## 0. Verificación de las afirmaciones en disputa

| Afirmación | Fuente | Resultado |
|---|---|---|
| App guarda asientos `"1".."N"` y el panel `"1A".."ND"` | A | **Confirmado.** `EnBusApp/src/utils/seatLayout.ts:25-48` genera `String(numero)`; `PanelCooperativas/src/components/boletos/seat-selector.tsx:57` usa `` `${fila}${col}` ``. "3B" = asiento 10. B no lo detectó: sin unificar, el índice único no evita la doble venta. |
| `venderBoleto` falla por RLS | A y B | **Confirmado.** `20260414000004_rls_policies.sql`: `"Usuario compra boleto" ... WITH CHECK (public.user_role() = 'user')`. La taquilla inserta con la sesión del taquillero (`taquilla/boletos/actions.ts:67`). |
| Usuario puede cambiar su `role` | A y B | **Confirmado.** `"Update Solo propio perfil" FOR UPDATE USING (id = auth.uid())` sin restricción de columnas. |
| Cliente puede poner su boleto en PAGADO | A y B | **Confirmado.** `"Comprador cancela propio boleto"` sin columnas + `validar_transicion_boleto_fn` permite RESERVADO→PAGADO. |
| Cliente puede **insertar** un boleto ya PAGADO | (ninguno) | **Hueco nuevo.** La política INSERT solo mira el rol. El Diseño A solo protegía UPDATE. Se cierra con trigger BEFORE INSERT. |
| Cualquiera inserta pagos verificados | A y B | **Confirmado.** `"Cualquier usuario inserta pago" WITH CHECK (auth.uid() IS NOT NULL)`. |
| `PENDIENTE_VERIFICACION` no existe en el enum | A y B | **Confirmado.** `20260414000001_enums.sql`. La app lo escribe en `EnBusApp/app/encomiendas/recibir/[id].tsx:218`. |
| POR_PAGAR→EN_TRANSITO prohibido | A y B | **Confirmado.** `20260414000011_fixes_audit.sql:9`. |
| Cron expira reservas con pago declarado | A y B | **Confirmado.** `20260414000008_cron_jobs.sql`: `UPDATE boletos SET estado='EXPIRADO' WHERE estado='RESERVADO' AND reserva_expira_at < now()`. |
| Tasa BCV solo en la app (dolarapi) | A y B | **Confirmado.** `EnBusApp/src/hooks/useTasaBCV.ts:51` (`ve.dolarapi.com/v1/dolares/oficial`, `promedio`, `fechaActualizacion`). |
| Boletos de una compra insertados en un solo INSERT | B | **Confirmado.** `buscar.tsx:340-343` y `viajes/[id].tsx:151-154` → mismo `created_at` (now() de la transacción). El backfill por `created_at` exacto (B) es mejor que la ventana de 5 s (A). |
| Trigger legado de B con `current_user` dentro de `SECURITY DEFINER` | B | **Defecto en B.** Dentro de una función definer `current_user` es el dueño, así que `vincular_pago_legado` nunca haría nada. Se reemplaza por la condición `NEW.idempotency_key IS NULL` (las RPC nuevas siempre la envían). |
| Pagos EFECTIVO "por verificar" creados por la app | A | **Confirmado.** `PaymentFlow.tsx:296-323` inserta `tipo_pago:'EFECTIVO', verificado:false` para encomiendas. Se anulan en migración y se prohíben. |
| Embeds `pagos→boletos` se vuelven ambiguos al añadir `boletos.pago_id` | A y B | **Confirmado.** `admin/(panel)/comisiones/actions.ts:116` (`boletos!left ( estado )`) y `lib/data/admin-usuarios.ts:140` (`boletos(codigo_boleto)`). `taquilla/boletos/page.tsx:82` usa `pagos!boleto_id` (hint por columna, sigue funcionando). La app no tiene embeds de pagos. |
| `handle_new_user` no está versionado | A y B | **Confirmado.** No aparece en `supabase/migrations`. |
| `completeOnboarding` usa `'PENDIENTE'` en columnas UNIQUE y no copia `sucursal_id` | A y B | **Confirmado.** `cooperativas/invite/[token]/actions.ts:83-89` y `:96-101`; `validateInviteToken` no selecciona `sucursal_id`. |
| Recepción de origen recibe el costo del navegador | B | **Confirmado.** `taquilla/encomiendas/actions.ts:6` `confirmarRecepcion(encomiendaId, peso, costo)`. Se mueve al servidor (RPC). |
| Next.js con API distinta | A y B | `PanelCooperativas` usa next 16.2.4 y `LandingEnBus` 16.2.6; `AGENTS.md` obliga a leer `node_modules/next/dist/docs/` antes de escribir código de servidor. |

Columnas usadas en el SQL de abajo verificadas en `20260414000002_tables.sql`, `20260503000001_invitaciones.sql`, `20260510202205_add_boletos_presencial_fields.sql`, `20260414000008_cron_jobs.sql` (`pending_notifications`): `viajes.numero_unidad`, `sucursales.ciudad/activa/estado_geografico`, `rutas.duracion_estimada_min/precio_pasaje/activa`, `encomiendas.peso_kg/qr_data/motivo_cancelacion/estado_origen/estado_destino`, `tarifas.tarifa_por_kg/factor_distancia_por_min/peso_max_kg/activa`, `metodos_pago_cooperativa.tipo/banco/titular/numero_cuenta/email_zelle/activo`, `notificaciones_usuario(usuario_id,titulo,mensaje,recurso_tipo,recurso_id)`, `pending_notifications(destinatario_id,recurso_tipo,recurso_id,tipo_notificacion,payload)`, `boletos.updated_at`, función `public.handle_updated_at()`.

---

## 1. Decisiones (por punto, con la opción elegida)

| # | Tema | Decisión | Origen | Motivo |
|---|---|---|---|---|
| 1 | Moneda canónica | `rutas.precio_pasaje`, `boletos.precio`, `boletos.monto_reembolso`, `tarifas.*`, `encomiendas.costo_calculado/valor_declarado`, `comisiones_ciclo.*` y **`pagos.monto` = USD de referencia**. No se convierte ningún dato. | A=B | Los datos ya son USD de hecho (panel pide "$", tarifas "(USD)"). `v_balance_cooperativa` y comisiones siguen igual. |
| 1 | Columnas nuevas en `pagos` | `monto_bs` (Bs esperados a la tasa usada), `tasa_bcv`, `tasa_bcv_fecha`, `moneda` ('VES'/'USD': moneda en que pagó el cliente), `monto_declarado` (lo que el cliente dice que pagó, en `moneda`), `rechazado_at/rechazado_por/motivo_rechazo`, `idempotency_key` y `estado_verificacion` **columna generada** (APROBADO/RECHAZADO/PENDIENTE). Sin `monto_usd` duplicado, sin `canal`, sin `metodo_tipo`. | mezcla | `pagos.monto` sigue siendo la base de comisiones (USD esperado). Esperado vs declarado sale de columnas guardadas. La columna generada da la ergonomía de B sin triggers de sincronización. |
| 1 | Fuente de la tasa | Tabla `tasas_bcv(fecha PK)`; edge function nueva `actualizar-tasa-bcv` (misma fuente que la app: dolarapi) por pg_cron cada 30 min con el patrón vault de `20260414000013`; `fn_guardar_tasa_bcv` solo `service_role`, rechaza saltos > 25 %; `fn_registrar_tasa_bcv_manual` solo super admin, y la manual no la pisa el cron. Todos leen `fn_tasa_bcv_vigente()` (última con `fecha <= hoy Caracas`). Para **cobrar** se exige tasa de ≤ 4 días (`EB_TASA_NO_DISPONIBLE`). | B (+manual de A) | Un solo número que se ve, se cobra y se guarda. |
| 1 | Cambio de tasa durante la compra | El cliente envía `p_tasa_esperada`; si difiere, `EB_TASA_CAMBIO` con el total nuevo en `detail`; la app muestra el nuevo total y reintenta con la tasa nueva y lo que realmente pagó en `monto_declarado`. | B | El servidor siempre usa la tasa vigente; nunca se acepta una tasa elegida por el cliente (A permitía tasas de hasta 4 días atrás: margen de abuso). |
| 1 | formatMoney | Un `dinero.ts` por proyecto, mismo contenido (ver §4): principal "Bs 1.250,00", secundario "≈ USD 12,40 · BCV 02/10", sin `Intl` para números. | A=B | DS-05, APP-56. |
| 2 | Checkout | Dos RPC: `fn_reservar_asientos` (aparta al confirmar asientos, 30 min, sin pago) y `fn_checkout_boletos` (en una transacción: bloquea viaje, idempotencia, valida método y comprobante, re-asegura asientos —los vuelve a tomar si vencieron y siguen libres—, calcula el monto en servidor, inserta el pago PENDIENTE y lo vincula a todos los boletos). `boletos.compra_id` + `boletos.pago_id`. Sin "Comprobante enviado → Continuar". | B | El usuario paga fuera de la app antes de escribir la referencia: sin apartar el asiento lo perdería después de pagar (APP-22). La operación de dinero es atómica e idempotente (M-19, M-21, M-25, APP-23). |
| 2 | "Pagar en taquilla" desde la app | Es solo la reserva (sin fila en `pagos`). Se prohíbe a clientes insertar pagos EFECTIVO; los EFECTIVO no verificados existentes se marcan rechazados en la migración. | A=B | Elimina pagos fantasma (M-22). |
| 2 | Índice único de asiento | Unificar a número (`"3B"`→`"10"`), liberar reservas duplicadas, abortar si hay PAGADO/USADO dobles, índice único parcial `(viaje_id, asiento) WHERE estado IN (RESERVADO,PAGADO,USADO)`, CHECK numérico, recálculo de `asientos_disponibles`. Archivo aparte. | A (+recuento de B) | Ver §0. |
| 2 | Venta en taquilla | `fn_vender_boletos_taquilla` (1..N asientos, pasajero por asiento, pago APROBADO, efectivo Bs o USD con vuelto, idempotente). Código `BOL-XXXXXXXX` y QR `PASS-<codigo>` en servidor. | B | Arregla RLS de taquilla, venta a medias (P-24) y formatos distintos (P-25). |
| 3 | Reserva sin pagar vs pago en verificación | Sin valores nuevos de enum. `estado_ui_boleto(estado, pago.estado_verificacion)` → `RESERVA_SIN_PAGAR` / `PAGO_EN_VERIFICACION` / `PAGO_RECHAZADO` / estado real. Con pago PENDIENTE `reserva_expira_at = NULL` (no vence). Rechazo → 30 min nuevos. Solo el cron escribe EXPIRADO, y solo si no hay pago pendiente (o el viaje salió / fue cancelado y no hay pago pendiente). La app nunca escribe EXPIRADO. | A=B | M-27, M-28, APP-31. |
| 5 | PENDIENTE_VERIFICACION | **No** se añade al enum; el pago pendiente es `pagos.estado_verificacion='PENDIENTE'`; un solo pendiente y un solo aprobado por encomienda (índices únicos parciales, creados solo si los datos lo permiten). | A=B | DS-03: cobro ≠ logística; `ALTER TYPE ADD VALUE` no es transaccional. |
| 5 | Cadena de cobro en destino | Trigger: POR_PAGAR→EN_TRANSITO solo con `modalidad_pago='DESTINO'`; ENTREGADA con DESTINO exige pago aprobado (`EB_COBRO_PENDIENTE`). Cliente (remitente o destinatario) paga con `fn_registrar_pago_encomienda`; la taquilla cobra con `fn_cobrar_encomienda_taquilla` (efectivo Bs/USD, Pago Móvil, transferencia, Zelle; P-33). Bandeja "Pagos por verificar" en el panel. | B | P-28, P-29, Payments_Spec §3.2. |
| 5 | Recepción en origen | `fn_confirmar_recepcion_origen(id, peso)` calcula el costo USD en servidor (misma fórmula de `calcular-costo-encomienda`) y rellena `sucursal_origen_id` y `sucursal_destino_id`. `fn_cotizar_encomienda` para la vista previa. | B | El costo hoy viene del navegador. |
| 5 | Entrega | Se mantiene `validarPin` + `confirmarEntrega` del panel; el trigger impide ENTREGADA sin cobro en DESTINO. **No** se añade la RPC de entrega con cédula de B. | A | Suficiente para el P0; la cédula obligatoria puede bloquear retiros legítimos. |
| 6 | Vínculo destinatario | Trigger BEFORE INSERT/UPDATE OF receiver_cedula_rif, receiver_telefono en `encomiendas` + AFTER INSERT/UPDATE OF cedula_rif, telefono, role en `profiles`. Único usuario `role='user'` por cédula normalizada; si no hay, único por teléfono; ambiguo → no vincula. `receiver_vinculado_por/at`. El cliente nunca fija `receiver_user_id`. Aviso "Te enviaron un paquete". `fn_remitente_de_encomienda` (nombre y teléfono enmascarado). Normalizadores devuelven NULL para `PENDIENTE*`. | B | M-50 con la RLS existente ("Destinatario ve las suyas"). |
| 6 | `updated_at` de encomiendas | Deja de moverse cuando solo cambian `receiver_*`/`sucursal_*`. | A | `auto_devolver_encomienda` cuenta días desde `updated_at`. |
| 14 | Embarque | `fn_validar_embarque(codigo, viaje)` devuelve una causa (USADO, CANCELADO, EXPIRADO, VIAJE_CANCELADO, OTRO_VIAJE, OTRO_DIA, PAGO_EN_VERIFICACION, PAGO_RECHAZADO, RESERVA_SIN_PAGAR, VALIDO, NO_ENCONTRADO, OTRA_COOPERATIVA) con viaje, pasajero y pago; `fn_confirmar_embarque` re-valida y guarda `embarcado_at/por`. | B | P-18, P-19, PC-17, PC-18. |
| 15 | Despacho | `fn_validar_encomienda_despacho` al escanear (OTRO_DESTINO, OTRO_ORIGEN, POR_PAGAR, SIN_RECIBIR, YA_DESPACHADA, CERRADA, OTRA_COOPERATIVA; compara **solo ciudades** normalizadas). `fn_despachar_encomiendas` todo o nada, acepta PAGADA o POR_PAGAR+DESTINO, **no toca el viaje**. `fn_marcar_salida_viaje` (PROGRAMADO→EN_CURSO; libera reservas sin pagar). "Recibir lote" lista viajes con encomiendas EN_TRANSITO sea cual sea su estado. | B (ciudades de A) | P-38, P-39, PC-32. |
| 16 | Aprobar / rechazar | `fn_aprobar_pago(pago)` y `fn_rechazar_pago(pago, motivo)` (texto ≥ 5 caracteres; la UI ofrece chips). Notificación transaccional en bandeja + push encolado. Aprobar un pago de boletos que ya no están RESERVADO → `EB_BOLETOS_NO_ACTIVABLES` (no aprueba). Diálogo único con esperado vs declarado, método, cuenta destino, banco, referencia y aviso de referencia repetida. | A (comportamiento) + B (datos) | P-16, P-17, PC-21, PC-29. |
| — | Errores de RPC | `RAISE ... ERRCODE 'P0001', MESSAGE 'EB_*', HINT '<texto español para el usuario>', DETAIL '<json>'`. Los `humanizeError` muestran el `hint` cuando `message` empieza por `EB_`. | B | Sin texto técnico y con campo a marcar (`detail.campo`). |
| — | Protección de escrituras directas | Ya en la migración 1 (compatible con la app actual): triggers `aa_*` en `boletos` (INSERT saneado, UPDATE solo cancelar y reembolso 95 % calculado en servidor), `encomiendas` (INSERT saneado, UPDATE solo cancelar desde PENDIENTE_DE_ESCANEO), `profiles` (no cambia role/cooperativa/sucursal). INSERT de `pagos`: cliente solo DIGITAL pendiente; personal solo de su cooperativa. Migración 6 (diferida) revoca INSERT/UPDATE/DELETE de `boletos`, `pagos`, `tasas_bcv` a `anon/authenticated`. | A (inmediato) + B (cierre diferido) | Cierra escalada de rol, boletos gratis y pagos autoverificados sin romper clientes desplegados. |
| — | DELETE | No se añaden políticas DELETE en boletos/pagos; la migración 6 lo revoca explícitamente. | A=B | Registros financieros de solo alta. |
| — | `profiles.sucursal_id` | Columna nueva con backfill desde invitaciones usadas; `completeOnboarding` la copia; recepción en destino la lee (sin service role). | A=B | Pendiente fase 1. |
| — | Placeholders de empleados | `PENDIENTE-<uuid>` en `telefono` y `cedula_rif`. | A=B | UNIQUE rompe el segundo invitado. |
| — | RIF | Solo se reformatean los que ya tienen 9 dígitos. Los de 8 dígitos: insignia "RIF incompleto" en admin (con `isValidRif`). Sin cálculo de dígito verificador. | A | No inventar datos fiscales. |
| — | Formatters del panel | `timeZone: "America/Caracas"` en `lib/utils.ts`. | A=B | Pendiente fase 1. |
| — | Comisiones | Se mantiene la lógica TS actual (suma `pagos.monto` USD verificados); solo se arregla el embed ambiguo. Los Bs se muestran como referencia a la tasa de hoy. **No** se crea `fn_calcular_comisiones`. | A | Sin cambio de unidad; evita reescribir el ciclo. |
| — | Descartado de B | `auditoria_operaciones`, `motivo_rechazo_codigo`, `monto_usd`, `canal`, `metodo_tipo`, `fn_estado_compra` (la app lee boletos por `compra_id` con RLS), `fn_entregar_encomienda`, `fn_recibir_en_destino`, `fn_cancelar_encomienda`, `fn_calcular_comisiones`, vista `v_cooperativas_rif_revision`, trigger de `viajes.asientos_disponibles`, regla de lint. | — | Sobre-ingeniería para el P0. |

---

## 2. Migraciones SQL (nuevas, idempotentes)

Orden de aplicación: **01 → 02 → 03 → 04 → 05** (en ese orden, en el SQL Editor; después de cada una `NOTIFY pgrst, 'reload schema';`). **06** solo cuando el panel nuevo esté desplegado y la app nueva sea la versión mínima. 03 asume 02 aplicada (asientos numéricos).

Convenciones:
- Las RPC públicas llevan prefijo `fn_`; los helpers internos prefijo `_` (se les revoca EXECUTE a `PUBLIC/anon/authenticated`).
- Funciones de trigger que se ejecutan como el usuario (no definer) **no** llaman helpers `_` (usan `RAISE` directo).
- `current_user IN ('authenticated','anon')` identifica una escritura directa desde la API; dentro de una RPC definer `current_user` es el dueño y las protecciones no aplican.

### 2.1 `supabase/migrations/20260719000001_fase2_base_moneda_pagos.sql`

```sql
-- Fase 2 · Base: utilidades, tasa BCV, columnas de dinero, compra/pago en boletos,
-- profiles.sucursal_id, protección de escrituras directas. Compatible con los clientes actuales.
BEGIN;

-- ─── 1. Utilidades ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._fallar(p_codigo text, p_mensaje text, p_detalle jsonb DEFAULT NULL)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = p_codigo, HINT = p_mensaje,
                        DETAIL = coalesce(p_detalle::text, '{}');
END $$;

-- Igual que normalizeForDb() de las edge functions (rutas guardan "puerto_la_cruz").
CREATE OR REPLACE FUNCTION public.normalizar_localidad(p text)
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT CASE
           WHEN p IS NULL OR btrim(p) = '' THEN NULL
           WHEN x.s = 'san fernando de apure' THEN 'san_fernando'
           WHEN x.s = 'san juan de los morros' THEN 'san_juan'
           ELSE replace(x.s, ' ', '_')
         END
    FROM (SELECT btrim(regexp_replace(
                   lower(translate(btrim(coalesce(p, '')), 'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNaeiouun')),
                   '[_[:space:]]+', ' ', 'g')) AS s) x;
$$;

-- "V-12.345.678", "v12345678", "12345678" -> "V12345678". NULL si no es usable (incluye 'PENDIENTE…').
CREATE OR REPLACE FUNCTION public.normalizar_cedula(p text)
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT CASE
           WHEN x.v LIKE 'PENDIENTE%' THEN NULL
           WHEN x.v ~ '^[VEJGPC]?[0-9]+$' AND length(ltrim(regexp_replace(x.v, '[^0-9]', '', 'g'), '0')) BETWEEN 5 AND 10
             THEN CASE WHEN left(x.v, 1) ~ '[VEJGPC]' THEN left(x.v, 1) ELSE 'V' END
                  || ltrim(regexp_replace(x.v, '[^0-9]', '', 'g'), '0')
         END
    FROM (SELECT regexp_replace(upper(coalesce(p, '')), '[^A-Z0-9]', '', 'g') AS v) x;
$$;

-- "0414-123.45.67", "+58 414 1234567", "4141234567" -> "4141234567". NULL si no es válido.
CREATE OR REPLACE FUNCTION public.normalizar_telefono(p text)
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT CASE WHEN n.v ~ '^[24][0-9]{9}$' THEN n.v END
    FROM (SELECT CASE
                   WHEN upper(coalesce(p, '')) LIKE 'PENDIENTE%' THEN ''
                   WHEN length(d.v) = 12 AND left(d.v, 2) = '58' THEN substr(d.v, 3)
                   WHEN length(d.v) = 11 AND left(d.v, 1) = '0'  THEN substr(d.v, 2)
                   ELSE d.v
                 END AS v
            FROM (SELECT regexp_replace(coalesce(p, ''), '[^0-9]', '', 'g') AS v) d) n;
$$;

-- ─── 2. Tasa BCV ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tasas_bcv (
  fecha          date PRIMARY KEY,
  tasa           numeric(14,4) NOT NULL CHECK (tasa > 0),
  fuente         text NOT NULL DEFAULT 'dolarapi' CHECK (fuente IN ('dolarapi', 'manual')),
  motivo         text,
  registrada_por uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.tasas_bcv IS 'Tasa oficial BCV (Bs por 1 USD) por día de vigencia. Fuente única de app, panel, landing y RPC.';
ALTER TABLE public.tasas_bcv ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Lectura publica tasas BCV" ON public.tasas_bcv;
CREATE POLICY "Lectura publica tasas BCV" ON public.tasas_bcv FOR SELECT USING (true);

CREATE OR REPLACE FUNCTION public.fn_tasa_bcv_vigente()
RETURNS TABLE (tasa numeric, fecha date, fuente text, dias_antiguedad integer, actualizada_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT t.tasa, t.fecha, t.fuente,
         ((now() AT TIME ZONE 'America/Caracas')::date - t.fecha)::integer,
         t.updated_at
    FROM public.tasas_bcv t
   WHERE t.fecha <= (now() AT TIME ZONE 'America/Caracas')::date
   ORDER BY t.fecha DESC
   LIMIT 1;
$$;

-- Tasa para cobrar: falla si no hay o tiene más de 4 días.
CREATE OR REPLACE FUNCTION public._tasa_para_cobro(OUT o_tasa numeric, OUT o_fecha date)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_hoy date := (now() AT TIME ZONE 'America/Caracas')::date;
BEGIN
  SELECT t.tasa, t.fecha INTO o_tasa, o_fecha
    FROM public.tasas_bcv t WHERE t.fecha <= v_hoy ORDER BY t.fecha DESC LIMIT 1;
  IF o_tasa IS NULL OR v_hoy - o_fecha > 4 THEN
    PERFORM public._fallar('EB_TASA_NO_DISPONIBLE',
      'No tenemos la tasa BCV de hoy. Intenta de nuevo en unos minutos.',
      jsonb_build_object('ultima_fecha', o_fecha));
  END IF;
END $$;

-- Solo service_role (edge function actualizar-tasa-bcv). La tasa manual no se pisa.
CREATE OR REPLACE FUNCTION public.fn_guardar_tasa_bcv(p_fecha date, p_tasa numeric)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_anterior numeric;
BEGIN
  IF p_fecha IS NULL OR p_tasa IS NULL OR p_tasa <= 0
     OR p_fecha > (now() AT TIME ZONE 'America/Caracas')::date + 7 THEN
    PERFORM public._fallar('EB_TASA_INVALIDA', 'Tasa inválida.');
  END IF;
  SELECT t.tasa INTO v_anterior FROM public.tasas_bcv t WHERE t.fecha < p_fecha ORDER BY t.fecha DESC LIMIT 1;
  IF v_anterior IS NOT NULL AND abs(p_tasa - v_anterior) / v_anterior > 0.25 THEN
    PERFORM public._fallar('EB_TASA_SOSPECHOSA',
      'La tasa nueva difiere más de 25 % de la anterior. Cárgala a mano si es correcta.',
      jsonb_build_object('anterior', v_anterior, 'nueva', p_tasa));
  END IF;
  INSERT INTO public.tasas_bcv AS t (fecha, tasa, fuente)
  VALUES (p_fecha, round(p_tasa, 4), 'dolarapi')
  ON CONFLICT (fecha) DO UPDATE
     SET tasa = EXCLUDED.tasa, updated_at = now()
   WHERE t.fuente <> 'manual';
  RETURN jsonb_build_object('fecha', p_fecha, 'tasa', round(p_tasa, 4));
END $$;

CREATE OR REPLACE FUNCTION public.fn_registrar_tasa_bcv_manual(p_fecha date, p_tasa numeric, p_motivo text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT coalesce(public.is_super_admin(), false) THEN
    PERFORM public._fallar('EB_SIN_PERMISO', 'Solo el super administrador puede cargar la tasa BCV.');
  END IF;
  IF p_fecha IS NULL OR p_tasa IS NULL OR p_tasa <= 0
     OR p_fecha > (now() AT TIME ZONE 'America/Caracas')::date + 1 THEN
    PERFORM public._fallar('EB_TASA_INVALIDA', 'Revisa la fecha y la tasa.', '{"campo":"tasa"}');
  END IF;
  IF length(btrim(coalesce(p_motivo, ''))) < 5 THEN
    PERFORM public._fallar('EB_MOTIVO_REQUERIDO', 'Escribe por qué cargas la tasa a mano.', '{"campo":"motivo"}');
  END IF;
  INSERT INTO public.tasas_bcv AS t (fecha, tasa, fuente, motivo, registrada_por)
  VALUES (p_fecha, round(p_tasa, 4), 'manual', btrim(p_motivo), auth.uid())
  ON CONFLICT (fecha) DO UPDATE
     SET tasa = EXCLUDED.tasa, fuente = 'manual', motivo = EXCLUDED.motivo,
         registrada_por = EXCLUDED.registrada_por, updated_at = now();
  RETURN jsonb_build_object('fecha', p_fecha, 'tasa', round(p_tasa, 4));
END $$;

-- Cron cada 30 min → edge function actualizar-tasa-bcv (mismo patrón vault que 20260414000013).
DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'actualizar_tasa_bcv') THEN
    PERFORM cron.unschedule('actualizar_tasa_bcv');
  END IF;
  PERFORM cron.schedule('actualizar_tasa_bcv', '*/30 * * * *', $job$
    DO $blk$
    DECLARE v_key text; v_url text;
    BEGIN
      SELECT decrypted_secret INTO v_key FROM vault.decrypted_secrets WHERE name = 'service_role_key';
      SELECT decrypted_secret INTO v_url FROM vault.decrypted_secrets WHERE name = 'project_url';
      PERFORM net.http_post(
        url := COALESCE(v_url, 'https://FALTA_URL_EN_VAULT.supabase.co') || '/functions/v1/actualizar-tasa-bcv',
        headers := jsonb_build_object('Content-Type', 'application/json',
                                      'Authorization', 'Bearer ' || COALESCE(v_key, 'FALTA_SERVICE_KEY_EN_VAULT')),
        body := '{}'::jsonb);
    END $blk$;
  $job$);
END $do$;

-- ─── 3. pagos: Bs, tasa, moneda, declarado, rechazo, idempotencia ────────────
ALTER TABLE public.pagos
  ADD COLUMN IF NOT EXISTS monto_bs        numeric(16,2),
  ADD COLUMN IF NOT EXISTS tasa_bcv        numeric(14,4),
  ADD COLUMN IF NOT EXISTS tasa_bcv_fecha  date,
  ADD COLUMN IF NOT EXISTS moneda          text,
  ADD COLUMN IF NOT EXISTS monto_declarado numeric(16,2),
  ADD COLUMN IF NOT EXISTS rechazado_at    timestamptz,
  ADD COLUMN IF NOT EXISTS rechazado_por   uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS motivo_rechazo  text,
  ADD COLUMN IF NOT EXISTS idempotency_key text;

COMMENT ON COLUMN public.pagos.monto IS 'USD de referencia esperado (base de comisiones y balances).';
COMMENT ON COLUMN public.pagos.monto_bs IS 'Bs esperados = monto × tasa_bcv. NULL en pagos anteriores a la fase 2.';
COMMENT ON COLUMN public.pagos.moneda IS 'Moneda en la que pagó el cliente: VES o USD (Zelle / efectivo USD).';
COMMENT ON COLUMN public.pagos.monto_declarado IS 'Lo que el cliente dice que pagó (o lo recibido en taquilla), en "moneda".';

-- Pagos EFECTIVO "por verificar" creados por la app: nadie los concilia. Se anulan.
UPDATE public.pagos
   SET rechazado_at = now(),
       motivo_rechazo = 'Pago en efectivo anunciado desde la app y no registrado en taquilla (limpieza fase 2).'
 WHERE tipo_pago = 'EFECTIVO' AND NOT verificado AND rechazado_at IS NULL;

UPDATE public.pagos p
   SET moneda = CASE WHEN p.banco_emisor ILIKE 'zelle'
                       OR EXISTS (SELECT 1 FROM public.metodos_pago_cooperativa m
                                   WHERE m.id = p.metodo_pago_id AND m.tipo = 'ZELLE')
                     THEN 'USD' ELSE 'VES' END
 WHERE p.moneda IS NULL;
ALTER TABLE public.pagos ALTER COLUMN moneda SET DEFAULT 'VES';
ALTER TABLE public.pagos ALTER COLUMN moneda SET NOT NULL;

ALTER TABLE public.pagos
  ADD COLUMN IF NOT EXISTS estado_verificacion text
  GENERATED ALWAYS AS (CASE WHEN verificado THEN 'APROBADO'
                            WHEN rechazado_at IS NOT NULL THEN 'RECHAZADO'
                            ELSE 'PENDIENTE' END) STORED;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_pagos_resuelto_una_vez') THEN
    ALTER TABLE public.pagos ADD CONSTRAINT chk_pagos_resuelto_una_vez
      CHECK (NOT (verificado AND rechazado_at IS NOT NULL));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_pagos_moneda') THEN
    ALTER TABLE public.pagos ADD CONSTRAINT chk_pagos_moneda CHECK (moneda IN ('VES', 'USD'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_pagos_montos') THEN
    ALTER TABLE public.pagos ADD CONSTRAINT chk_pagos_montos CHECK (
      (monto_bs IS NULL OR monto_bs >= 0) AND (tasa_bcv IS NULL OR tasa_bcv > 0)
      AND (monto_declarado IS NULL OR monto_declarado >= 0)) NOT VALID;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_pagos_idempotencia
  ON public.pagos (pagador_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pagos_por_verificar
  ON public.pagos (cooperativa_id, created_at)
  WHERE NOT verificado AND rechazado_at IS NULL AND tipo_pago = 'DIGITAL';
CREATE INDEX IF NOT EXISTS idx_pagos_referencia
  ON public.pagos (cooperativa_id, numero_referencia) WHERE numero_referencia IS NOT NULL;

-- Un pendiente y un aprobado por encomienda (solo si los datos actuales lo permiten).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'uq_pagos_encomienda_pendiente') THEN
    IF EXISTS (SELECT 1 FROM public.pagos
                WHERE encomienda_id IS NOT NULL AND NOT verificado AND rechazado_at IS NULL
                GROUP BY encomienda_id HAVING count(*) > 1) THEN
      RAISE NOTICE 'uq_pagos_encomienda_pendiente NO creado: hay encomiendas con más de un pago pendiente. Recházalos y re-ejecuta.';
    ELSE
      CREATE UNIQUE INDEX uq_pagos_encomienda_pendiente ON public.pagos (encomienda_id)
        WHERE encomienda_id IS NOT NULL AND NOT verificado AND rechazado_at IS NULL;
    END IF;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'uq_pagos_encomienda_aprobado') THEN
    IF EXISTS (SELECT 1 FROM public.pagos WHERE encomienda_id IS NOT NULL AND verificado
                GROUP BY encomienda_id HAVING count(*) > 1) THEN
      RAISE NOTICE 'uq_pagos_encomienda_aprobado NO creado: hay encomiendas cobradas dos veces (revisar reembolso).';
    ELSE
      CREATE UNIQUE INDEX uq_pagos_encomienda_aprobado ON public.pagos (encomienda_id)
        WHERE encomienda_id IS NOT NULL AND verificado;
    END IF;
  END IF;
END $$;

-- INSERT de pagos: cliente solo DIGITAL pendiente propio; personal solo de su cooperativa.
DROP POLICY IF EXISTS "Cualquier usuario inserta pago" ON public.pagos;
DROP POLICY IF EXISTS "Pagador inserta pago digital pendiente" ON public.pagos;
CREATE POLICY "Pagador inserta pago digital pendiente" ON public.pagos FOR INSERT
  WITH CHECK (pagador_id = auth.uid() AND public.user_role() = 'user' AND tipo_pago = 'DIGITAL'
              AND verificado = false AND verificado_por IS NULL AND rechazado_at IS NULL);
DROP POLICY IF EXISTS "Personal registra pagos de su cooperativa" ON public.pagos;
CREATE POLICY "Personal registra pagos de su cooperativa" ON public.pagos FOR INSERT
  WITH CHECK (public.user_role() IN ('taquillero', 'admin_cooperativa')
              AND cooperativa_id = public.user_cooperativa_id() AND pagador_id = auth.uid());

-- ─── 4. boletos: compra, pago que los cubre, embarque ───────────────────────
ALTER TABLE public.boletos
  ADD COLUMN IF NOT EXISTS compra_id     uuid,
  ADD COLUMN IF NOT EXISTS pago_id       uuid,
  ADD COLUMN IF NOT EXISTS embarcado_at  timestamptz,
  ADD COLUMN IF NOT EXISTS embarcado_por uuid REFERENCES public.profiles(id);
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'boletos_pago_id_fkey') THEN
    ALTER TABLE public.boletos ADD CONSTRAINT boletos_pago_id_fkey
      FOREIGN KEY (pago_id) REFERENCES public.pagos(id);
  END IF;
END $$;
COMMENT ON COLUMN public.boletos.precio IS 'USD de referencia (rutas.precio_pasaje al reservar).';
COMMENT ON COLUMN public.boletos.monto_reembolso IS 'USD de referencia; se paga en Bs a la tasa BCV del día del reembolso.';

-- compra_id: los boletos de una compra de la app se insertaron en un solo INSERT (mismo created_at).
WITH g AS (
  SELECT comprador_id, viaje_id, created_at, gen_random_uuid() AS cid
    FROM public.boletos
   WHERE compra_id IS NULL AND comprador_id IS NOT NULL
   GROUP BY comprador_id, viaje_id, created_at
)
UPDATE public.boletos b SET compra_id = g.cid
  FROM g
 WHERE b.compra_id IS NULL AND b.comprador_id = g.comprador_id
   AND b.viaje_id = g.viaje_id AND b.created_at = g.created_at;
UPDATE public.boletos SET compra_id = id WHERE compra_id IS NULL;
ALTER TABLE public.boletos ALTER COLUMN compra_id SET DEFAULT gen_random_uuid();
ALTER TABLE public.boletos ALTER COLUMN compra_id SET NOT NULL;

-- pago_id: el pago que ya apuntaba al boleto (aprobado > pendiente > rechazado, el más reciente).
UPDATE public.boletos b SET pago_id = x.id
  FROM (SELECT DISTINCT ON (p.boleto_id) p.boleto_id, p.id
          FROM public.pagos p
         WHERE p.boleto_id IS NOT NULL
         ORDER BY p.boleto_id,
                  CASE p.estado_verificacion WHEN 'APROBADO' THEN 0 WHEN 'PENDIENTE' THEN 1 ELSE 2 END,
                  p.created_at DESC) x
 WHERE b.id = x.boleto_id AND b.pago_id IS NULL;
-- Hermanos de la misma compra.
UPDATE public.boletos h SET pago_id = a.pago_id
  FROM public.boletos a
 WHERE a.compra_id = h.compra_id AND a.pago_id IS NOT NULL AND h.pago_id IS NULL AND h.id <> a.id;
-- Con pago digital pendiente la reserva deja de vencer.
UPDATE public.boletos b SET reserva_expira_at = NULL
  FROM public.pagos p
 WHERE p.id = b.pago_id AND b.estado = 'RESERVADO' AND b.reserva_expira_at IS NOT NULL
   AND p.tipo_pago = 'DIGITAL' AND p.estado_verificacion = 'PENDIENTE';

CREATE INDEX IF NOT EXISTS idx_boletos_compra_id ON public.boletos (compra_id);
CREATE INDEX IF NOT EXISTS idx_boletos_pago_id   ON public.boletos (pago_id);

-- ─── 5. profiles.sucursal_id (pendiente fase 1) ─────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS sucursal_id uuid REFERENCES public.sucursales(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_profiles_sucursal_id ON public.profiles (sucursal_id);
UPDATE public.profiles p
   SET sucursal_id = x.sucursal_id
  FROM (SELECT DISTINCT ON (lower(i.email)) lower(i.email) AS email, i.sucursal_id, i.cooperativa_id
          FROM public.invitaciones i
         WHERE i.usado AND i.sucursal_id IS NOT NULL
         ORDER BY lower(i.email), i.created_at DESC) x
  JOIN auth.users u ON lower(u.email) = x.email
  JOIN public.sucursales s ON s.id = x.sucursal_id AND s.cooperativa_id = x.cooperativa_id
 WHERE p.id = u.id AND p.cooperativa_id = x.cooperativa_id AND p.sucursal_id IS NULL;

-- ─── 6. encomiendas: rastro del vínculo + updated_at estable ────────────────
ALTER TABLE public.encomiendas
  ADD COLUMN IF NOT EXISTS receiver_vinculado_por text,
  ADD COLUMN IF NOT EXISTS receiver_vinculado_at  timestamptz;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_encomiendas_vinculo') THEN
    ALTER TABLE public.encomiendas ADD CONSTRAINT chk_encomiendas_vinculo
      CHECK (receiver_vinculado_por IS NULL OR receiver_vinculado_por IN ('CEDULA', 'TELEFONO'));
  END IF;
END $$;
COMMENT ON COLUMN public.encomiendas.costo_calculado IS 'USD de referencia (tarifas en USD). Se cobra en Bs a la tasa BCV.';

-- updated_at no se mueve por cambios automáticos (auto_devolver_encomienda y "tiempo en oficina" dependen de él).
CREATE OR REPLACE FUNCTION public.encomiendas_updated_at_fn()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE c text[] := ARRAY['receiver_user_id','receiver_vinculado_por','receiver_vinculado_at',
                          'sucursal_origen_id','sucursal_destino_id','updated_at'];
BEGIN
  IF (to_jsonb(NEW) - c) IS DISTINCT FROM (to_jsonb(OLD) - c) THEN
    NEW.updated_at := now();
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS set_encomiendas_updated_at ON public.encomiendas;
CREATE TRIGGER set_encomiendas_updated_at BEFORE UPDATE ON public.encomiendas
  FOR EACH ROW EXECUTE FUNCTION public.encomiendas_updated_at_fn();

-- ─── 7. Contexto del llamador y notificaciones ──────────────────────────────
CREATE OR REPLACE FUNCTION public._uid_usuario()
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_uid uuid := auth.uid(); v_rol public.rol_usuario;
BEGIN
  IF v_uid IS NULL THEN
    PERFORM public._fallar('EB_NO_AUTENTICADO', 'Tu sesión expiró. Inicia sesión de nuevo.');
  END IF;
  SELECT role INTO v_rol FROM public.profiles WHERE id = v_uid;
  IF v_rol IS DISTINCT FROM 'user' THEN
    PERFORM public._fallar('EB_SIN_PERMISO', 'Esta operación se hace con una cuenta de pasajero.');
  END IF;
  RETURN v_uid;
END $$;

CREATE OR REPLACE FUNCTION public._contexto_staff(
  OUT o_uid uuid, OUT o_rol public.rol_usuario, OUT o_cooperativa_id uuid, OUT o_sucursal_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  o_uid := auth.uid();
  IF o_uid IS NULL THEN
    PERFORM public._fallar('EB_NO_AUTENTICADO', 'Tu sesión expiró. Inicia sesión de nuevo.');
  END IF;
  SELECT p.role, p.cooperativa_id, p.sucursal_id INTO o_rol, o_cooperativa_id, o_sucursal_id
    FROM public.profiles p WHERE p.id = o_uid;
  IF o_rol IS NULL OR o_rol NOT IN ('taquillero', 'admin_cooperativa') OR o_cooperativa_id IS NULL THEN
    PERFORM public._fallar('EB_SIN_PERMISO',
      'Tu usuario no puede hacer esta operación. Avísale al administrador de tu cooperativa.');
  END IF;
END $$;

-- Bandeja in-app garantizada (misma transacción) + push encolado (sin duplicar la bandeja).
CREATE OR REPLACE FUNCTION public._notificar_usuario(p_usuario uuid, p_tipo text, p_titulo text,
                                                     p_mensaje text, p_recurso_tipo text, p_recurso_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF p_usuario IS NULL
     OR (SELECT role FROM public.profiles WHERE id = p_usuario) IS DISTINCT FROM 'user' THEN
    RETURN;
  END IF;
  INSERT INTO public.notificaciones_usuario (usuario_id, titulo, mensaje, recurso_tipo, recurso_id)
  VALUES (p_usuario, p_titulo, p_mensaje, p_recurso_tipo, p_recurso_id);
  INSERT INTO public.pending_notifications (destinatario_id, recurso_tipo, recurso_id, tipo_notificacion, payload)
  VALUES (p_usuario, p_recurso_tipo, p_recurso_id, p_tipo,
          jsonb_build_object('titulo', p_titulo, 'mensaje', p_mensaje, 'sin_bandeja', true));
END $$;

-- ─── 8. Protección de escrituras directas (clientes de la API) ──────────────
-- Prefijo "aa_" para correr antes que los demás BEFORE triggers (orden alfabético).
CREATE OR REPLACE FUNCTION public.proteger_boletos_cliente_fn()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_precio numeric; v_estado public.estado_viaje; v_salida timestamptz; v_coop uuid;
  c text[] := ARRAY['estado','motivo_cancelacion','monto_reembolso','updated_at'];
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') OR public.user_role() IS DISTINCT FROM 'user' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN   -- app antigua: se sanea todo lo que decide el servidor
    SELECT r.precio_pasaje, v.estado, v.fecha_hora_salida, v.cooperativa_id
      INTO v_precio, v_estado, v_salida, v_coop
      FROM public.viajes v JOIN public.rutas r ON r.id = v.ruta_id
     WHERE v.id = NEW.viaje_id;
    IF v_precio IS NULL OR v_precio <= 0 OR v_estado <> 'PROGRAMADO' OR v_salida <= now() THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'EB_VIAJE_NO_DISPONIBLE',
        HINT = 'Esta salida ya no está disponible para la venta. Elige otra.';
    END IF;
    NEW.comprador_id := auth.uid();
    NEW.cooperativa_id := v_coop;
    NEW.estado := 'RESERVADO';
    NEW.precio := v_precio;
    NEW.reserva_expira_at := least(now() + interval '30 minutes', v_salida);
    NEW.pago_id := NULL; NEW.qr_embarque_data := NULL;
    NEW.monto_reembolso := NULL; NEW.reembolso_procesado := false;
    NEW.embarcado_at := NULL; NEW.embarcado_por := NULL;
    RETURN NEW;
  END IF;
  -- UPDATE: solo cancelar.
  IF NEW.estado IS DISTINCT FROM OLD.estado AND NEW.estado <> 'CANCELADO' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'EB_OPERACION_NO_PERMITIDA',
      HINT = 'El estado del boleto lo cambia la cooperativa o el sistema.';
  END IF;
  IF (to_jsonb(NEW) - c) IS DISTINCT FROM (to_jsonb(OLD) - c) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'EB_OPERACION_NO_PERMITIDA',
      HINT = 'Esta acción la hace la cooperativa.';
  END IF;
  IF NEW.estado = 'CANCELADO' AND OLD.estado = 'RESERVADO' AND EXISTS (
       SELECT 1 FROM public.pagos p WHERE p.id = OLD.pago_id AND p.estado_verificacion = 'PENDIENTE') THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'EB_PAGO_EN_VERIFICACION',
      HINT = 'Tu pago está en verificación. Espera la respuesta de la cooperativa o contáctala para cancelar.';
  END IF;
  NEW.monto_reembolso := CASE WHEN NEW.estado = 'CANCELADO' AND OLD.estado = 'PAGADO'
                              THEN round(OLD.precio * 0.95, 2)
                              WHEN NEW.estado = 'CANCELADO' THEN NULL
                              ELSE OLD.monto_reembolso END;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS aa_proteger_boletos_cliente ON public.boletos;
CREATE TRIGGER aa_proteger_boletos_cliente BEFORE INSERT OR UPDATE ON public.boletos
  FOR EACH ROW EXECUTE FUNCTION public.proteger_boletos_cliente_fn();

CREATE OR REPLACE FUNCTION public.proteger_encomiendas_cliente_fn()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE c text[] := ARRAY['estado','motivo_cancelacion','updated_at'];
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') OR public.user_role() IS DISTINCT FROM 'user' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.sender_id := auth.uid();
    NEW.estado := 'PENDIENTE_DE_ESCANEO';
    NEW.costo_calculado := NULL;
    NEW.pin_retiro := NULL; NEW.intentos_pin := 0; NEW.pin_bloqueado := false;
    NEW.viaje_id := NULL; NEW.sucursal_origen_id := NULL; NEW.sucursal_destino_id := NULL;
    NEW.receiver_user_id := NULL; NEW.receiver_vinculado_por := NULL; NEW.receiver_vinculado_at := NULL;
    RETURN NEW;
  END IF;
  IF NEW.estado IS DISTINCT FROM OLD.estado
     AND NOT (OLD.estado = 'PENDIENTE_DE_ESCANEO' AND NEW.estado = 'CANCELADA') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'EB_OPERACION_NO_PERMITIDA',
      HINT = 'El estado del envío lo cambia la cooperativa.';
  END IF;
  IF (to_jsonb(NEW) - c) IS DISTINCT FROM (to_jsonb(OLD) - c) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'EB_OPERACION_NO_PERMITIDA',
      HINT = 'Esta acción la hace la cooperativa.';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS aa_proteger_encomiendas_cliente ON public.encomiendas;
CREATE TRIGGER aa_proteger_encomiendas_cliente BEFORE INSERT OR UPDATE ON public.encomiendas
  FOR EACH ROW EXECUTE FUNCTION public.proteger_encomiendas_cliente_fn();

CREATE OR REPLACE FUNCTION public.proteger_perfil_fn()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF current_user IN ('authenticated', 'anon') AND NOT coalesce(public.is_super_admin(), false)
     AND (NEW.role, NEW.cooperativa_id, NEW.sucursal_id)
         IS DISTINCT FROM (OLD.role, OLD.cooperativa_id, OLD.sucursal_id) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'EB_SIN_PERMISO',
      HINT = 'No puedes cambiar tu rol, tu cooperativa ni tu sucursal.';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS aa_proteger_perfil ON public.profiles;
CREATE TRIGGER aa_proteger_perfil BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.proteger_perfil_fn();

-- ─── 9. Compatibilidad con la app actual (transitorio hasta la migración 06) ─
-- La app vieja inserta el pago solo en boletos[0]: se extiende a todos los asientos de su INSERT.
-- Las RPC nuevas siempre envían idempotency_key, así que este trigger no las toca.
CREATE OR REPLACE FUNCTION public.vincular_pago_legado_fn()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v record;
BEGIN
  IF NEW.idempotency_key IS NOT NULL OR NEW.verificado OR NEW.tipo_pago <> 'DIGITAL' THEN
    RETURN NULL;
  END IF;
  IF NEW.banco_emisor ILIKE 'zelle' THEN
    UPDATE public.pagos SET moneda = 'USD' WHERE id = NEW.id AND moneda <> 'USD';
  END IF;
  IF NEW.boleto_id IS NULL THEN RETURN NULL; END IF;
  SELECT compra_id, comprador_id, viaje_id, created_at INTO v FROM public.boletos WHERE id = NEW.boleto_id;
  IF NOT FOUND OR v.comprador_id IS NULL THEN RETURN NULL; END IF;
  UPDATE public.boletos b
     SET pago_id = NEW.id, compra_id = v.compra_id, reserva_expira_at = NULL
   WHERE b.comprador_id = v.comprador_id AND b.viaje_id = v.viaje_id AND b.created_at = v.created_at
     AND b.estado = 'RESERVADO' AND b.pago_id IS NULL;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS vincular_pago_legado ON public.pagos;
CREATE TRIGGER vincular_pago_legado AFTER INSERT ON public.pagos
  FOR EACH ROW EXECUTE FUNCTION public.vincular_pago_legado_fn();

-- ─── 10. Permisos ───────────────────────────────────────────────────────────
DO $$
DECLARE f record;
BEGIN
  FOR f IN SELECT p.oid::regprocedure AS sig FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public' AND p.proname LIKE '\_%' LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', f.sig);
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.fn_guardar_tasa_bcv(date, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_guardar_tasa_bcv(date, numeric) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_tasa_bcv_vigente() TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.fn_registrar_tasa_bcv_manual(date, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_registrar_tasa_bcv_manual(date, numeric, text) TO authenticated;

COMMIT;
```

### 2.2 `supabase/migrations/20260719000002_fase2_asiento_unico.sql`

```sql
-- Un asiento ocupado por viaje. Aborta (a propósito) si hay asientos vendidos dos veces.
-- Consulta previa (solo lectura):
--   SELECT viaje_id, asiento, array_agg(codigo_boleto || ':' || estado ORDER BY created_at)
--     FROM boletos WHERE estado IN ('RESERVADO','PAGADO','USADO') GROUP BY 1, 2 HAVING count(*) > 1;
BEGIN;

-- 1. Formato canónico "1".."N" (app). El panel guardaba fila+columna: "3B" = (3-1)*4 + 2 = 10.
UPDATE public.boletos
   SET asiento = (((substring(asiento FROM '^([0-9]+)')::int - 1) * 4)
                  + position(substring(asiento FROM '([A-D])$') IN 'ABCD'))::text
 WHERE asiento ~ '^[0-9]+[A-D]$';

-- 2. Liberar reservas duplicadas. Se conserva USADO > PAGADO > RESERVADO con pago > el más antiguo.
WITH ranking AS (
  SELECT b.id,
         row_number() OVER (PARTITION BY b.viaje_id, b.asiento
                            ORDER BY CASE b.estado WHEN 'USADO' THEN 0 WHEN 'PAGADO' THEN 1 ELSE 2 END,
                                     (b.pago_id IS NULL), b.created_at) AS rn
    FROM public.boletos b
   WHERE b.estado IN ('RESERVADO', 'PAGADO', 'USADO')
)
UPDATE public.boletos b
   SET estado = 'EXPIRADO',
       motivo_cancelacion = coalesce(b.motivo_cancelacion,
         'Asiento duplicado: reserva liberada al crear el índice único de asientos.')
  FROM ranking r
 WHERE r.id = b.id AND r.rn > 1 AND b.estado = 'RESERVADO';

-- 3. Si quedan asientos vendidos dos veces, detenerse.
DO $$
DECLARE v_lista text;
BEGIN
  SELECT string_agg(format('viaje %s asiento %s (%s boletos)', d.viaje_id, d.asiento, d.n), '; ')
    INTO v_lista
    FROM (SELECT viaje_id, asiento, count(*) AS n FROM public.boletos
           WHERE estado IN ('RESERVADO', 'PAGADO', 'USADO')
           GROUP BY viaje_id, asiento HAVING count(*) > 1) d;
  IF v_lista IS NOT NULL THEN
    RAISE EXCEPTION 'Asientos vendidos dos veces: %. Cancela uno de cada par (con reembolso) y vuelve a ejecutar esta migración.', v_lista;
  END IF;
END $$;

-- 4. Índice único parcial.
CREATE UNIQUE INDEX IF NOT EXISTS uq_boletos_asiento_ocupado
  ON public.boletos (viaje_id, asiento) WHERE estado IN ('RESERVADO', 'PAGADO', 'USADO');

-- 5. Solo números de asiento.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_boletos_asiento_numerico') THEN
    ALTER TABLE public.boletos ADD CONSTRAINT chk_boletos_asiento_numerico
      CHECK (asiento ~ '^[1-9][0-9]*$') NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.boletos WHERE asiento !~ '^[1-9][0-9]*$') THEN
    ALTER TABLE public.boletos VALIDATE CONSTRAINT chk_boletos_asiento_numerico;
  ELSE
    RAISE NOTICE 'chk_boletos_asiento_numerico queda NOT VALID: hay asientos con formato antiguo.';
  END IF;
END $$;

-- 6. Recalcular asientos_disponibles (corrige derivas históricas del contador).
UPDATE public.viajes v
   SET asientos_disponibles = c.disponibles
  FROM (SELECT v2.id,
               GREATEST(v2.asientos_totales - (SELECT count(*) FROM public.boletos b
                                                WHERE b.viaje_id = v2.id
                                                  AND b.estado IN ('RESERVADO', 'PAGADO', 'USADO')), 0) AS disponibles
          FROM public.viajes v2) c
 WHERE c.id = v.id AND v.asientos_disponibles <> c.disponibles;

COMMIT;
```

### 2.3 `supabase/migrations/20260719000003_fase2_rpc_boletos.sql`

```sql
-- Reserva, checkout, cancelación, venta y cobro en taquilla, embarque y expiración.
BEGIN;

CREATE OR REPLACE FUNCTION public.estado_ui_boleto(p_estado public.estado_boleto, p_pago_estado text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN p_estado <> 'RESERVADO'     THEN p_estado::text
    WHEN p_pago_estado = 'PENDIENTE' THEN 'PAGO_EN_VERIFICACION'
    WHEN p_pago_estado = 'RECHAZADO' THEN 'PAGO_RECHAZADO'
    ELSE 'RESERVA_SIN_PAGAR'
  END;
$$;

CREATE OR REPLACE FUNCTION public._codigo_boleto_nuevo()
RETURNS text LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE v text;
BEGIN
  LOOP
    v := 'BOL-' || upper(substr(md5(gen_random_uuid()::text), 1, 8));
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.boletos WHERE codigo_boleto = v);
  END LOOP;
  RETURN v;
END $$;

-- Valida el comprobante según el tipo de método. Devuelve la referencia normalizada (NULL en efectivo).
CREATE OR REPLACE FUNCTION public._validar_comprobante(p_tipo public.tipo_metodo_pago, p_referencia text,
                                                       p_banco text, p_fecha date)
RETURNS text LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE
  v_ref text := upper(regexp_replace(coalesce(p_referencia, ''), '[[:space:]._/-]', '', 'g'));
  v_hoy date := (now() AT TIME ZONE 'America/Caracas')::date;
BEGIN
  IF p_tipo = 'EFECTIVO' THEN RETURN NULL; END IF;
  IF p_tipo = 'ZELLE' THEN
    IF v_ref !~ '^[A-Z0-9]{4,40}$' THEN
      PERFORM public._fallar('EB_DATOS_PAGO_INVALIDOS',
        'Escribe el código de confirmación de Zelle completo (mínimo 4 caracteres).', '{"campo":"referencia"}');
    END IF;
  ELSE
    IF v_ref !~ '^[0-9]{4,30}$' THEN
      PERFORM public._fallar('EB_DATOS_PAGO_INVALIDOS',
        'Escribe el número de referencia completo: solo números, mínimo 4.', '{"campo":"referencia"}');
    END IF;
    IF coalesce(btrim(p_banco), '') = '' THEN
      PERFORM public._fallar('EB_DATOS_PAGO_INVALIDOS', 'Elige el banco desde el que pagaste.', '{"campo":"banco"}');
    END IF;
  END IF;
  IF p_fecha IS NULL OR p_fecha > v_hoy OR p_fecha < v_hoy - 30 THEN
    PERFORM public._fallar('EB_DATOS_PAGO_INVALIDOS',
      'La fecha del pago debe estar entre hoy y los últimos 30 días.', '{"campo":"fecha"}');
  END IF;
  RETURN v_ref;
END $$;

CREATE OR REPLACE FUNCTION public._resumen_compra(p_compra_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  WITH vivos AS (
    SELECT b.*, p.estado_verificacion AS pago_estado
      FROM public.boletos b LEFT JOIN public.pagos p ON p.id = b.pago_id
     WHERE b.compra_id = p_compra_id AND b.estado IN ('RESERVADO', 'PAGADO', 'USADO')
  ), ult AS (
    SELECT p.* FROM public.pagos p
     WHERE p.id = (SELECT b2.pago_id FROM public.boletos b2
                    WHERE b2.compra_id = p_compra_id AND b2.pago_id IS NOT NULL
                    ORDER BY b2.updated_at DESC LIMIT 1)
  )
  SELECT jsonb_build_object(
    'compra_id', p_compra_id,
    'server_now', now(),
    'viaje_id', (SELECT viaje_id FROM vivos LIMIT 1),
    'cooperativa_id', (SELECT cooperativa_id FROM vivos LIMIT 1),
    'boletos', coalesce((SELECT jsonb_agg(jsonb_build_object(
                 'id', v.id, 'codigo_boleto', v.codigo_boleto, 'asiento', v.asiento, 'estado', v.estado,
                 'estado_ui', public.estado_ui_boleto(v.estado, v.pago_estado),
                 'precio_usd', v.precio, 'reserva_expira_at', v.reserva_expira_at,
                 'qr_embarque_data', v.qr_embarque_data)
               ORDER BY length(v.asiento), v.asiento) FROM vivos v), '[]'::jsonb),
    'total_usd', (SELECT sum(precio) FROM vivos),
    'reserva_expira_at', (SELECT min(reserva_expira_at) FROM vivos WHERE estado = 'RESERVADO'),
    'pago', (SELECT jsonb_build_object('id', u.id, 'estado', u.estado_verificacion, 'monto_usd', u.monto,
                    'monto_bs', u.monto_bs, 'tasa_bcv', u.tasa_bcv, 'tasa_bcv_fecha', u.tasa_bcv_fecha,
                    'moneda', u.moneda, 'monto_declarado', u.monto_declarado,
                    'motivo_rechazo', u.motivo_rechazo) FROM ult u)
  );
$$;

-- Aparta (o re-aparta) los asientos de una compra del usuario. Bloquea el viaje.
CREATE OR REPLACE FUNCTION public._asegurar_asientos(p_uid uuid, p_compra_id uuid, p_viaje_id uuid, p_asientos text[])
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_viaje record; v_asientos text[]; v_faltan text[]; v_ocupados text[]; v_expira timestamptz;
  v_nombre text; v_cedula text; v_tel text;
BEGIN
  IF p_compra_id IS NULL THEN
    PERFORM public._fallar('EB_DATOS_INVALIDOS', 'Falta el identificador de la compra. Actualiza la app.');
  END IF;
  SELECT array_agg(DISTINCT btrim(a)) INTO v_asientos
    FROM unnest(p_asientos) a WHERE coalesce(btrim(a), '') <> '';
  IF v_asientos IS NULL THEN
    PERFORM public._fallar('EB_ASIENTO_INVALIDO', 'Elige al menos un asiento.');
  END IF;
  IF cardinality(v_asientos) > 10 THEN
    PERFORM public._fallar('EB_ASIENTO_INVALIDO', 'Puedes apartar hasta 10 asientos por compra.');
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(v_asientos) a WHERE a !~ '^[1-9][0-9]{0,2}$') THEN
    PERFORM public._fallar('EB_ASIENTO_INVALIDO', 'Uno de los asientos no existe en este bus. Vuelve a elegirlos.');
  END IF;

  SELECT v.id, v.estado, v.fecha_hora_salida, v.asientos_totales, v.cooperativa_id,
         r.precio_pasaje, r.activa AS ruta_activa, c.estado AS coop_estado
    INTO v_viaje
    FROM public.viajes v
    JOIN public.rutas r ON r.id = v.ruta_id
    JOIN public.cooperativas c ON c.id = v.cooperativa_id
   WHERE v.id = p_viaje_id
     FOR UPDATE OF v;
  IF NOT FOUND OR v_viaje.estado <> 'PROGRAMADO' OR v_viaje.fecha_hora_salida <= now()
     OR NOT v_viaje.ruta_activa OR v_viaje.coop_estado <> 'ACTIVA' OR coalesce(v_viaje.precio_pasaje, 0) <= 0 THEN
    PERFORM public._fallar('EB_VIAJE_NO_DISPONIBLE', 'Esta salida ya no está disponible para la venta. Elige otra.');
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(v_asientos) a WHERE a::int > v_viaje.asientos_totales) THEN
    PERFORM public._fallar('EB_ASIENTO_INVALIDO', 'Uno de los asientos no existe en este bus. Vuelve a elegirlos.');
  END IF;
  IF EXISTS (SELECT 1 FROM public.boletos WHERE compra_id = p_compra_id
              AND (comprador_id IS DISTINCT FROM p_uid OR viaje_id <> p_viaje_id)) THEN
    PERFORM public._fallar('EB_SIN_PERMISO', 'Esta compra no te pertenece.');
  END IF;

  PERFORM 1 FROM public.boletos WHERE compra_id = p_compra_id AND estado = 'RESERVADO' FOR UPDATE;
  IF EXISTS (SELECT 1 FROM public.boletos b JOIN public.pagos p ON p.id = b.pago_id
              WHERE b.compra_id = p_compra_id AND b.estado IN ('RESERVADO', 'PAGADO')
                AND p.estado_verificacion IN ('PENDIENTE', 'APROBADO')) THEN
    PERFORM public._fallar('EB_PAGO_YA_REGISTRADO',
      'Ya registraste un pago para esta compra. Revisa tus boletos en Mis viajes.');
  END IF;

  -- Asientos de la compra que el usuario ya no quiere.
  UPDATE public.boletos
     SET estado = 'CANCELADO', motivo_cancelacion = 'Asiento cambiado por el pasajero antes de pagar'
   WHERE compra_id = p_compra_id AND estado = 'RESERVADO' AND NOT (asiento = ANY (v_asientos));

  v_expira := least(now() + interval '30 minutes', v_viaje.fecha_hora_salida);
  -- Reservas vencidas que el cron todavía no liberó.
  UPDATE public.boletos SET reserva_expira_at = v_expira
   WHERE compra_id = p_compra_id AND estado = 'RESERVADO'
     AND (reserva_expira_at IS NULL OR reserva_expira_at <= now());

  SELECT array_agg(a) INTO v_faltan FROM unnest(v_asientos) a
   WHERE NOT EXISTS (SELECT 1 FROM public.boletos b
                      WHERE b.compra_id = p_compra_id AND b.estado = 'RESERVADO' AND b.asiento = a);
  IF v_faltan IS NULL THEN RETURN; END IF;

  SELECT array_agg(b.asiento ORDER BY length(b.asiento), b.asiento) INTO v_ocupados
    FROM public.boletos b
   WHERE b.viaje_id = p_viaje_id AND b.asiento = ANY (v_faltan) AND b.estado IN ('RESERVADO', 'PAGADO', 'USADO');
  IF v_ocupados IS NOT NULL THEN
    PERFORM public._fallar('EB_ASIENTO_OCUPADO',
      format('El asiento %s ya no está disponible. Elige otro.', array_to_string(v_ocupados, ', ')),
      jsonb_build_object('asientos', v_ocupados));
  END IF;

  -- El personal no puede leer perfiles de clientes (RLS): se copian al boleto.
  SELECT nombre_completo, cedula_rif, telefono INTO v_nombre, v_cedula, v_tel
    FROM public.profiles WHERE id = p_uid;
  BEGIN
    INSERT INTO public.boletos (codigo_boleto, comprador_id, viaje_id, cooperativa_id, asiento, precio, estado,
                                reserva_expira_at, compra_id, pasajero_nombre, pasajero_cedula, pasajero_telefono)
    SELECT public._codigo_boleto_nuevo(), p_uid, p_viaje_id, v_viaje.cooperativa_id, a, v_viaje.precio_pasaje,
           'RESERVADO', v_expira, p_compra_id, v_nombre, v_cedula, v_tel
      FROM unnest(v_faltan) a;
  EXCEPTION WHEN unique_violation THEN
    PERFORM public._fallar('EB_ASIENTO_OCUPADO', 'Uno de los asientos acaba de ser tomado. Elige otro.',
                           jsonb_build_object('asientos', v_faltan));
  END;
END $$;

-- App: apartar asientos (30 min, sin pago). También es "Apartar y pagar en taquilla".
CREATE OR REPLACE FUNCTION public.fn_reservar_asientos(p_compra_id uuid, p_viaje_id uuid, p_asientos text[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_uid uuid := public._uid_usuario(); v_res jsonb; v_tasa numeric; v_fecha date;
BEGIN
  PERFORM public._asegurar_asientos(v_uid, p_compra_id, p_viaje_id, p_asientos);
  v_res := public._resumen_compra(p_compra_id);
  SELECT t.tasa, t.fecha INTO v_tasa, v_fecha FROM public.fn_tasa_bcv_vigente() t;
  RETURN v_res || jsonb_build_object('tasa_bcv', v_tasa, 'tasa_bcv_fecha', v_fecha,
    'total_bs', CASE WHEN v_tasa IS NOT NULL THEN round((v_res->>'total_usd')::numeric * v_tasa, 2) END);
END $$;

-- App: soltar los asientos al salir del asistente sin pagar (mejor esfuerzo).
CREATE OR REPLACE FUNCTION public.fn_liberar_reserva(p_compra_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_uid uuid := public._uid_usuario(); v_n integer;
BEGIN
  UPDATE public.boletos b
     SET estado = 'CANCELADO', motivo_cancelacion = 'Reserva liberada por el pasajero'
   WHERE b.compra_id = p_compra_id AND b.comprador_id = v_uid AND b.estado = 'RESERVADO'
     AND NOT EXISTS (SELECT 1 FROM public.pagos p WHERE p.id = b.pago_id
                      AND p.estado_verificacion IN ('PENDIENTE', 'APROBADO'));
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN jsonb_build_object('liberados', v_n);
END $$;

-- App: registrar el pago de una compra (checkout atómico e idempotente).
CREATE OR REPLACE FUNCTION public.fn_checkout_boletos(
  p_compra_id uuid, p_viaje_id uuid, p_asientos text[],
  p_metodo_pago_id uuid, p_numero_referencia text, p_fecha_transaccion date, p_banco_emisor text,
  p_monto_declarado numeric, p_tasa_esperada numeric, p_idempotency_key text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_uid uuid := public._uid_usuario();
  v_metodo_tipo public.tipo_metodo_pago;
  v_ref text; v_tasa numeric; v_tasa_fecha date;
  v_total_usd numeric; v_total_bs numeric; v_moneda text; v_esperado numeric;
  v_coop uuid; v_primer uuid; v_pago_id uuid;
BEGIN
  IF coalesce(length(p_idempotency_key), 0) < 8 THEN
    PERFORM public._fallar('EB_DATOS_INVALIDOS', 'Falta la clave de la operación. Actualiza la app e intenta de nuevo.');
  END IF;
  PERFORM 1 FROM public.viajes WHERE id = p_viaje_id FOR UPDATE;   -- serializa doble toque y compras simultáneas
  IF EXISTS (SELECT 1 FROM public.pagos WHERE pagador_id = v_uid AND idempotency_key = p_idempotency_key) THEN
    RETURN public._resumen_compra(p_compra_id) || jsonb_build_object('repetido', true);
  END IF;

  SELECT m.tipo INTO v_metodo_tipo
    FROM public.metodos_pago_cooperativa m JOIN public.viajes v ON v.cooperativa_id = m.cooperativa_id
   WHERE m.id = p_metodo_pago_id AND v.id = p_viaje_id AND m.activo;
  IF v_metodo_tipo IS NULL OR v_metodo_tipo = 'EFECTIVO' THEN
    PERFORM public._fallar('EB_METODO_INVALIDO',
      'Elige una forma de pago de la cooperativa. Para pagar en efectivo, aparta tu asiento y paga en taquilla.');
  END IF;
  v_ref := public._validar_comprobante(v_metodo_tipo, p_numero_referencia, p_banco_emisor, p_fecha_transaccion);

  PERFORM public._asegurar_asientos(v_uid, p_compra_id, p_viaje_id, p_asientos);

  SELECT sum(precio), (array_agg(cooperativa_id))[1] INTO v_total_usd, v_coop
    FROM public.boletos WHERE compra_id = p_compra_id AND estado = 'RESERVADO';
  SELECT o_tasa, o_fecha INTO v_tasa, v_tasa_fecha FROM public._tasa_para_cobro();
  v_total_bs := round(v_total_usd * v_tasa, 2);

  IF p_tasa_esperada IS NOT NULL AND abs(p_tasa_esperada - v_tasa) > 0.00005 THEN
    PERFORM public._fallar('EB_TASA_CAMBIO',
      'La tasa BCV se actualizó. Revisa el nuevo total antes de registrar el pago.',
      jsonb_build_object('tasa', v_tasa, 'tasa_fecha', v_tasa_fecha, 'total_usd', v_total_usd, 'total_bs', v_total_bs));
  END IF;

  v_moneda := CASE WHEN v_metodo_tipo = 'ZELLE' THEN 'USD' ELSE 'VES' END;
  v_esperado := CASE WHEN v_moneda = 'USD' THEN v_total_usd ELSE v_total_bs END;
  IF p_monto_declarado IS NOT NULL AND (p_monto_declarado <= 0 OR p_monto_declarado > v_esperado * 10) THEN
    PERFORM public._fallar('EB_DATOS_PAGO_INVALIDOS', 'Revisa el monto que pagaste.', '{"campo":"monto"}');
  END IF;
  IF EXISTS (SELECT 1 FROM public.pagos WHERE cooperativa_id = v_coop AND numero_referencia = v_ref
              AND tipo_pago = 'DIGITAL' AND rechazado_at IS NULL) THEN
    PERFORM public._fallar('EB_REFERENCIA_REPETIDA',
      'Esa referencia ya fue registrada en otro pago. Revisa el número de tu comprobante.', '{"campo":"referencia"}');
  END IF;

  SELECT id INTO v_primer FROM public.boletos
   WHERE compra_id = p_compra_id AND estado = 'RESERVADO' ORDER BY length(asiento), asiento LIMIT 1;

  INSERT INTO public.pagos (boleto_id, pagador_id, cooperativa_id, metodo_pago_id, monto, monto_bs, tasa_bcv,
                            tasa_bcv_fecha, moneda, monto_declarado, tipo_pago, numero_referencia,
                            fecha_transaccion, banco_emisor, verificado, idempotency_key)
  VALUES (v_primer, v_uid, v_coop, p_metodo_pago_id, v_total_usd, v_total_bs, v_tasa,
          v_tasa_fecha, v_moneda, coalesce(p_monto_declarado, v_esperado), 'DIGITAL', v_ref,
          p_fecha_transaccion, CASE WHEN v_metodo_tipo = 'ZELLE' THEN 'Zelle' ELSE btrim(p_banco_emisor) END,
          false, p_idempotency_key)
  RETURNING id INTO v_pago_id;

  UPDATE public.boletos SET pago_id = v_pago_id, reserva_expira_at = NULL
   WHERE compra_id = p_compra_id AND estado = 'RESERVADO';

  RETURN public._resumen_compra(p_compra_id);
END $$;

-- App: cancelar un boleto propio (reserva sin pago en verificación, o pagado antes de la salida).
CREATE OR REPLACE FUNCTION public.fn_cancelar_boleto(p_boleto_id uuid, p_motivo text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_uid uuid := public._uid_usuario(); v_b record; v_reembolso numeric; v_tasa numeric; v_fecha date;
BEGIN
  SELECT b.id, b.estado, b.precio, b.comprador_id, v.fecha_hora_salida, p.estado_verificacion AS pago_estado
    INTO v_b
    FROM public.boletos b JOIN public.viajes v ON v.id = b.viaje_id
    LEFT JOIN public.pagos p ON p.id = b.pago_id
   WHERE b.id = p_boleto_id
     FOR UPDATE OF b;
  IF NOT FOUND OR v_b.comprador_id IS DISTINCT FROM v_uid THEN
    PERFORM public._fallar('EB_NO_ENCONTRADO', 'No encontramos este boleto.');
  END IF;
  IF v_b.estado = 'RESERVADO' THEN
    IF v_b.pago_estado = 'PENDIENTE' THEN
      PERFORM public._fallar('EB_PAGO_EN_VERIFICACION',
        'Tu pago está en verificación. Espera la respuesta de la cooperativa o contáctala para cancelar.');
    END IF;
    UPDATE public.boletos SET estado = 'CANCELADO',
           motivo_cancelacion = coalesce(nullif(btrim(p_motivo), ''), 'Reserva cancelada por el pasajero')
     WHERE id = p_boleto_id;
  ELSIF v_b.estado = 'PAGADO' THEN
    IF v_b.fecha_hora_salida <= now() THEN
      PERFORM public._fallar('EB_VIAJE_YA_SALIO', 'Este viaje ya salió; no se puede cancelar desde la app.');
    END IF;
    IF length(btrim(coalesce(p_motivo, ''))) < 3 THEN
      PERFORM public._fallar('EB_MOTIVO_REQUERIDO', 'Cuéntanos brevemente el motivo.', '{"campo":"motivo"}');
    END IF;
    v_reembolso := round(v_b.precio * 0.95, 2);
    UPDATE public.boletos SET estado = 'CANCELADO', motivo_cancelacion = btrim(p_motivo), monto_reembolso = v_reembolso
     WHERE id = p_boleto_id;
  ELSE
    PERFORM public._fallar('EB_ESTADO_CAMBIO', 'Este boleto ya no se puede cancelar. Actualiza la pantalla.');
  END IF;
  SELECT t.tasa, t.fecha INTO v_tasa, v_fecha FROM public.fn_tasa_bcv_vigente() t;
  RETURN jsonb_build_object('estado', 'CANCELADO', 'reembolso_usd', v_reembolso,
    'reembolso_bs_estimado', CASE WHEN v_reembolso IS NOT NULL AND v_tasa IS NOT NULL THEN round(v_reembolso * v_tasa, 2) END,
    'tasa_bcv', v_tasa, 'tasa_bcv_fecha', v_fecha);
END $$;

-- Taquilla: vender 1..N asientos (pago APROBADO).
-- p_pasajeros: [{"asiento":"14","nombre":"Ana Pérez","cedula":"V-12345678","telefono":"0414..."}]
CREATE OR REPLACE FUNCTION public.fn_vender_boletos_taquilla(
  p_viaje_id uuid, p_pasajeros jsonb, p_metodo_tipo public.tipo_metodo_pago, p_metodo_pago_id uuid,
  p_moneda text, p_monto_recibido numeric, p_numero_referencia text, p_fecha_transaccion date,
  p_banco_emisor text, p_idempotency_key text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_ctx record; v_viaje record; v_compra uuid := gen_random_uuid();
  v_asientos text[]; v_n integer; v_ocupados text[]; v_previo uuid;
  v_tasa numeric; v_tasa_fecha date; v_ref text;
  v_total_usd numeric; v_total_bs numeric; v_moneda text; v_esperado numeric; v_pago_id uuid;
BEGIN
  SELECT * INTO v_ctx FROM public._contexto_staff();
  IF coalesce(length(p_idempotency_key), 0) < 8 THEN
    PERFORM public._fallar('EB_DATOS_INVALIDOS', 'Falta la clave de la operación. Recarga la página.');
  END IF;
  SELECT v.id, v.cooperativa_id, v.estado, v.fecha_hora_salida, v.asientos_totales, r.precio_pasaje
    INTO v_viaje
    FROM public.viajes v JOIN public.rutas r ON r.id = v.ruta_id
   WHERE v.id = p_viaje_id FOR UPDATE OF v;
  IF NOT FOUND OR v_viaje.cooperativa_id <> v_ctx.o_cooperativa_id THEN
    PERFORM public._fallar('EB_NO_ENCONTRADO', 'No encontramos ese viaje en tu cooperativa.');
  END IF;
  SELECT b.compra_id INTO v_previo
    FROM public.pagos p JOIN public.boletos b ON b.pago_id = p.id
   WHERE p.pagador_id = v_ctx.o_uid AND p.idempotency_key = p_idempotency_key LIMIT 1;
  IF v_previo IS NOT NULL THEN
    RETURN public._resumen_compra(v_previo) || jsonb_build_object('repetido', true);
  END IF;
  IF v_viaje.estado <> 'PROGRAMADO' OR v_viaje.fecha_hora_salida < now() - interval '30 minutes' THEN
    PERFORM public._fallar('EB_VIAJE_NO_DISPONIBLE', 'Este viaje ya salió o fue cancelado. Elige otro.');
  END IF;
  IF coalesce(v_viaje.precio_pasaje, 0) <= 0 THEN
    PERFORM public._fallar('EB_PRECIO_NO_DEFINIDO', 'La ruta de este viaje no tiene precio. Configúralo en Rutas.');
  END IF;
  IF jsonb_typeof(p_pasajeros) IS DISTINCT FROM 'array' THEN
    PERFORM public._fallar('EB_DATOS_INVALIDOS', 'Agrega entre 1 y 10 pasajeros.');
  END IF;
  IF jsonb_array_length(p_pasajeros) NOT BETWEEN 1 AND 10 THEN
    PERFORM public._fallar('EB_DATOS_INVALIDOS', 'Agrega entre 1 y 10 pasajeros.');
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_to_recordset(p_pasajeros) AS x(asiento text, nombre text, cedula text, telefono text)
              WHERE coalesce(btrim(x.nombre), '') = '' OR public.normalizar_cedula(x.cedula) IS NULL
                 OR coalesce(btrim(x.asiento), '') !~ '^[1-9][0-9]{0,2}$') THEN
    PERFORM public._fallar('EB_DATOS_INVALIDOS', 'Revisa nombre, cédula y asiento de cada pasajero.');
  END IF;
  SELECT array_agg(btrim(x.asiento)), count(DISTINCT btrim(x.asiento)) INTO v_asientos, v_n
    FROM jsonb_to_recordset(p_pasajeros) AS x(asiento text);
  IF v_n <> cardinality(v_asientos)
     OR EXISTS (SELECT 1 FROM unnest(v_asientos) a WHERE a::int > v_viaje.asientos_totales) THEN
    PERFORM public._fallar('EB_ASIENTO_INVALIDO', 'Hay asientos repetidos o que no existen en este bus.');
  END IF;
  SELECT array_agg(b.asiento) INTO v_ocupados FROM public.boletos b
   WHERE b.viaje_id = p_viaje_id AND b.asiento = ANY (v_asientos) AND b.estado IN ('RESERVADO', 'PAGADO', 'USADO');
  IF v_ocupados IS NOT NULL THEN
    PERFORM public._fallar('EB_ASIENTO_OCUPADO',
      format('El asiento %s ya está ocupado. Elige otro.', array_to_string(v_ocupados, ', ')),
      jsonb_build_object('asientos', v_ocupados));
  END IF;
  IF p_metodo_pago_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM public.metodos_pago_cooperativa
        WHERE id = p_metodo_pago_id AND cooperativa_id = v_ctx.o_cooperativa_id AND tipo = p_metodo_tipo) THEN
    PERFORM public._fallar('EB_METODO_INVALIDO', 'La cuenta elegida no corresponde a esa forma de pago.');
  END IF;
  v_ref := public._validar_comprobante(p_metodo_tipo, p_numero_referencia, p_banco_emisor, p_fecha_transaccion);
  v_moneda := CASE p_metodo_tipo WHEN 'ZELLE' THEN 'USD' WHEN 'EFECTIVO' THEN coalesce(p_moneda, 'VES') ELSE 'VES' END;
  IF v_moneda NOT IN ('VES', 'USD') THEN
    PERFORM public._fallar('EB_DATOS_INVALIDOS', 'Moneda no válida.');
  END IF;
  SELECT o_tasa, o_fecha INTO v_tasa, v_tasa_fecha FROM public._tasa_para_cobro();
  v_total_usd := v_viaje.precio_pasaje * cardinality(v_asientos);
  v_total_bs := round(v_total_usd * v_tasa, 2);
  v_esperado := CASE WHEN v_moneda = 'USD' THEN v_total_usd ELSE v_total_bs END;
  IF p_metodo_tipo = 'EFECTIVO' AND coalesce(p_monto_recibido, 0) < v_esperado THEN
    PERFORM public._fallar('EB_MONTO_INSUFICIENTE', 'El monto recibido es menor que el total a cobrar.',
      jsonb_build_object('esperado', v_esperado, 'moneda', v_moneda, 'campo', 'monto'));
  END IF;

  BEGIN
    INSERT INTO public.boletos (codigo_boleto, qr_embarque_data, comprador_id, viaje_id, cooperativa_id, asiento,
                                precio, estado, compra_id, pasajero_nombre, pasajero_cedula, pasajero_telefono)
    SELECT s.codigo, 'PASS-' || s.codigo, NULL, p_viaje_id, v_ctx.o_cooperativa_id, btrim(s.asiento),
           v_viaje.precio_pasaje, 'PAGADO', v_compra, btrim(s.nombre), btrim(s.cedula), nullif(btrim(s.telefono), '')
      FROM (SELECT public._codigo_boleto_nuevo() AS codigo, x.*
              FROM jsonb_to_recordset(p_pasajeros) AS x(asiento text, nombre text, cedula text, telefono text)) s;
  EXCEPTION WHEN unique_violation THEN
    PERFORM public._fallar('EB_ASIENTO_OCUPADO', 'Uno de los asientos acaba de ser vendido. Elige otro.');
  END;

  INSERT INTO public.pagos (boleto_id, pagador_id, cooperativa_id, metodo_pago_id, monto, monto_bs, tasa_bcv,
                            tasa_bcv_fecha, moneda, monto_declarado, tipo_pago, numero_referencia, fecha_transaccion,
                            banco_emisor, verificado, verificado_por, verificado_at, idempotency_key)
  VALUES ((SELECT id FROM public.boletos WHERE compra_id = v_compra ORDER BY length(asiento), asiento LIMIT 1),
          v_ctx.o_uid, v_ctx.o_cooperativa_id, p_metodo_pago_id, v_total_usd, v_total_bs, v_tasa,
          v_tasa_fecha, v_moneda, coalesce(p_monto_recibido, v_esperado),
          CASE WHEN p_metodo_tipo = 'EFECTIVO' THEN 'EFECTIVO'::public.tipo_pago ELSE 'DIGITAL'::public.tipo_pago END,
          v_ref, coalesce(p_fecha_transaccion, (now() AT TIME ZONE 'America/Caracas')::date),
          CASE WHEN p_metodo_tipo = 'ZELLE' THEN 'Zelle' ELSE nullif(btrim(p_banco_emisor), '') END,
          true, v_ctx.o_uid, now(), p_idempotency_key)
  RETURNING id INTO v_pago_id;
  UPDATE public.boletos SET pago_id = v_pago_id WHERE compra_id = v_compra;

  RETURN public._resumen_compra(v_compra) || jsonb_build_object(
    'impresion', (SELECT jsonb_agg(jsonb_build_object('codigo_boleto', b.codigo_boleto, 'qr', b.qr_embarque_data,
                    'asiento', b.asiento, 'pasajero', b.pasajero_nombre, 'cedula', b.pasajero_cedula)
                    ORDER BY length(b.asiento), b.asiento)
                  FROM public.boletos b WHERE b.compra_id = v_compra),
    'salida', v_viaje.fecha_hora_salida,
    'cobro', jsonb_build_object('moneda', v_moneda, 'esperado', v_esperado,
               'recibido', coalesce(p_monto_recibido, v_esperado),
               'vuelto', GREATEST(coalesce(p_monto_recibido, v_esperado) - v_esperado, 0),
               'total_usd', v_total_usd, 'total_bs', v_total_bs, 'tasa', v_tasa, 'tasa_fecha', v_tasa_fecha));
END $$;

-- Taquilla: cobrar una reserva sin pagar (o con pago rechazado) de la app.
CREATE OR REPLACE FUNCTION public.fn_cobrar_reserva_taquilla(
  p_boleto_id uuid, p_metodo_tipo public.tipo_metodo_pago, p_metodo_pago_id uuid, p_moneda text,
  p_monto_recibido numeric, p_numero_referencia text, p_fecha_transaccion date, p_banco_emisor text,
  p_idempotency_key text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_ctx record; v_compra uuid; v_coop uuid; v_comprador uuid;
  v_tasa numeric; v_tasa_fecha date; v_ref text;
  v_total_usd numeric; v_total_bs numeric; v_moneda text; v_esperado numeric; v_pago_id uuid; v_primer uuid;
BEGIN
  SELECT * INTO v_ctx FROM public._contexto_staff();
  IF coalesce(length(p_idempotency_key), 0) < 8 THEN
    PERFORM public._fallar('EB_DATOS_INVALIDOS', 'Falta la clave de la operación. Recarga la página.');
  END IF;
  SELECT compra_id, cooperativa_id, comprador_id INTO v_compra, v_coop, v_comprador
    FROM public.boletos WHERE id = p_boleto_id;
  IF v_compra IS NULL OR v_coop <> v_ctx.o_cooperativa_id THEN
    PERFORM public._fallar('EB_NO_ENCONTRADO', 'No encontramos ese boleto en tu cooperativa.');
  END IF;
  IF EXISTS (SELECT 1 FROM public.pagos WHERE pagador_id = v_ctx.o_uid AND idempotency_key = p_idempotency_key) THEN
    RETURN public._resumen_compra(v_compra) || jsonb_build_object('repetido', true);
  END IF;
  PERFORM 1 FROM public.boletos WHERE compra_id = v_compra FOR UPDATE;
  IF EXISTS (SELECT 1 FROM public.boletos b JOIN public.pagos p ON p.id = b.pago_id
              WHERE b.compra_id = v_compra AND b.estado = 'RESERVADO' AND p.estado_verificacion = 'PENDIENTE') THEN
    PERFORM public._fallar('EB_PAGO_PENDIENTE_EXISTE',
      'El pasajero ya reportó un pago. Verifícalo o recházalo antes de cobrar de nuevo.');
  END IF;
  SELECT sum(precio) INTO v_total_usd FROM public.boletos WHERE compra_id = v_compra AND estado = 'RESERVADO';
  IF v_total_usd IS NULL THEN
    PERFORM public._fallar('EB_ESTADO_CAMBIO', 'Esta reserva ya no está pendiente de pago.');
  END IF;
  IF p_metodo_pago_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM public.metodos_pago_cooperativa
        WHERE id = p_metodo_pago_id AND cooperativa_id = v_ctx.o_cooperativa_id AND tipo = p_metodo_tipo) THEN
    PERFORM public._fallar('EB_METODO_INVALIDO', 'La cuenta elegida no corresponde a esa forma de pago.');
  END IF;
  v_ref := public._validar_comprobante(p_metodo_tipo, p_numero_referencia, p_banco_emisor, p_fecha_transaccion);
  v_moneda := CASE p_metodo_tipo WHEN 'ZELLE' THEN 'USD' WHEN 'EFECTIVO' THEN coalesce(p_moneda, 'VES') ELSE 'VES' END;
  IF v_moneda NOT IN ('VES', 'USD') THEN PERFORM public._fallar('EB_DATOS_INVALIDOS', 'Moneda no válida.'); END IF;
  SELECT o_tasa, o_fecha INTO v_tasa, v_tasa_fecha FROM public._tasa_para_cobro();
  v_total_bs := round(v_total_usd * v_tasa, 2);
  v_esperado := CASE WHEN v_moneda = 'USD' THEN v_total_usd ELSE v_total_bs END;
  IF p_metodo_tipo = 'EFECTIVO' AND coalesce(p_monto_recibido, 0) < v_esperado THEN
    PERFORM public._fallar('EB_MONTO_INSUFICIENTE', 'El monto recibido es menor que el total a cobrar.',
      jsonb_build_object('esperado', v_esperado, 'moneda', v_moneda, 'campo', 'monto'));
  END IF;
  SELECT id INTO v_primer FROM public.boletos
   WHERE compra_id = v_compra AND estado = 'RESERVADO' ORDER BY length(asiento), asiento LIMIT 1;

  INSERT INTO public.pagos (boleto_id, pagador_id, cooperativa_id, metodo_pago_id, monto, monto_bs, tasa_bcv,
                            tasa_bcv_fecha, moneda, monto_declarado, tipo_pago, numero_referencia, fecha_transaccion,
                            banco_emisor, verificado, verificado_por, verificado_at, idempotency_key)
  VALUES (v_primer, v_ctx.o_uid, v_coop, p_metodo_pago_id, v_total_usd, v_total_bs, v_tasa, v_tasa_fecha,
          v_moneda, coalesce(p_monto_recibido, v_esperado),
          CASE WHEN p_metodo_tipo = 'EFECTIVO' THEN 'EFECTIVO'::public.tipo_pago ELSE 'DIGITAL'::public.tipo_pago END,
          v_ref, coalesce(p_fecha_transaccion, (now() AT TIME ZONE 'America/Caracas')::date),
          CASE WHEN p_metodo_tipo = 'ZELLE' THEN 'Zelle' ELSE nullif(btrim(p_banco_emisor), '') END,
          true, v_ctx.o_uid, now(), p_idempotency_key)
  RETURNING id INTO v_pago_id;

  UPDATE public.boletos
     SET estado = 'PAGADO', pago_id = v_pago_id, reserva_expira_at = NULL,
         qr_embarque_data = coalesce(qr_embarque_data, 'PASS-' || codigo_boleto)
   WHERE compra_id = v_compra AND estado = 'RESERVADO';

  PERFORM public._notificar_usuario(v_comprador, 'BOLETO_CONFIRMADO', 'Boleto confirmado',
    'Registramos tu pago en taquilla. Tu pase de abordaje ya está disponible.', 'boleto', p_boleto_id);

  RETURN public._resumen_compra(v_compra) || jsonb_build_object('cobro', jsonb_build_object(
    'moneda', v_moneda, 'esperado', v_esperado, 'recibido', coalesce(p_monto_recibido, v_esperado),
    'vuelto', GREATEST(coalesce(p_monto_recibido, v_esperado) - v_esperado, 0)));
END $$;

-- Embarque: un resultado por causa.
CREATE OR REPLACE FUNCTION public._resultado_embarque(p_boleto_id uuid, p_viaje_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE r record; v_hoy date := (now() AT TIME ZONE 'America/Caracas')::date; v_dia date; v_res text;
BEGIN
  SELECT b.id, b.codigo_boleto, b.asiento, b.estado, b.viaje_id, b.compra_id, b.embarcado_at, b.updated_at,
         b.motivo_cancelacion, b.reserva_expira_at, b.precio,
         coalesce(b.pasajero_nombre, pr.nombre_completo) AS pasajero_nombre,
         coalesce(b.pasajero_cedula, pr.cedula_rif) AS pasajero_cedula,
         v.fecha_hora_salida, v.estado AS viaje_estado, v.numero_unidad, ru.ciudad_origen, ru.ciudad_destino,
         p.id AS pago_id, p.estado_verificacion AS pago_estado, p.tipo_pago, p.banco_emisor, p.numero_referencia,
         p.fecha_transaccion, p.monto, p.monto_bs, p.moneda, p.monto_declarado, p.tasa_bcv, p.tasa_bcv_fecha,
         p.motivo_rechazo, p.metodo_pago_id
    INTO r
    FROM public.boletos b
    JOIN public.viajes v ON v.id = b.viaje_id
    JOIN public.rutas ru ON ru.id = v.ruta_id
    LEFT JOIN public.profiles pr ON pr.id = b.comprador_id
    LEFT JOIN public.pagos p ON p.id = b.pago_id
   WHERE b.id = p_boleto_id;
  v_dia := (r.fecha_hora_salida AT TIME ZONE 'America/Caracas')::date;
  v_res := CASE
    WHEN r.estado = 'USADO'                                  THEN 'USADO'
    WHEN r.estado = 'CANCELADO'                              THEN 'CANCELADO'
    WHEN r.estado = 'EXPIRADO'                               THEN 'EXPIRADO'
    WHEN r.viaje_estado = 'CANCELADO'                        THEN 'VIAJE_CANCELADO'
    WHEN p_viaje_id IS NOT NULL AND r.viaje_id <> p_viaje_id THEN 'OTRO_VIAJE'
    WHEN v_dia <> v_hoy                                      THEN 'OTRO_DIA'
    WHEN r.estado = 'RESERVADO' AND r.pago_estado = 'PENDIENTE' THEN 'PAGO_EN_VERIFICACION'
    WHEN r.estado = 'RESERVADO' AND r.pago_estado = 'RECHAZADO' THEN 'PAGO_RECHAZADO'
    WHEN r.estado = 'RESERVADO'                              THEN 'RESERVA_SIN_PAGAR'
    ELSE 'VALIDO' END;
  RETURN jsonb_build_object(
    'resultado', v_res, 'dias_diferencia', v_dia - v_hoy,
    'boleto', jsonb_build_object('id', r.id, 'codigo_boleto', r.codigo_boleto, 'asiento', r.asiento,
      'estado', r.estado, 'compra_id', r.compra_id, 'pasajero_nombre', r.pasajero_nombre,
      'pasajero_cedula', r.pasajero_cedula, 'embarcado_at', r.embarcado_at, 'updated_at', r.updated_at,
      'motivo_cancelacion', r.motivo_cancelacion, 'reserva_expira_at', r.reserva_expira_at, 'precio_usd', r.precio),
    'viaje', jsonb_build_object('id', r.viaje_id, 'salida', r.fecha_hora_salida, 'estado', r.viaje_estado,
      'unidad', r.numero_unidad, 'origen', r.ciudad_origen, 'destino', r.ciudad_destino),
    'pago', CASE WHEN r.pago_id IS NULL THEN NULL ELSE jsonb_build_object(
      'id', r.pago_id, 'estado', r.pago_estado, 'tipo_pago', r.tipo_pago, 'banco_emisor', r.banco_emisor,
      'numero_referencia', r.numero_referencia, 'fecha_transaccion', r.fecha_transaccion,
      'monto_usd', r.monto, 'monto_bs', r.monto_bs, 'moneda', r.moneda, 'monto_declarado', r.monto_declarado,
      'tasa_bcv', r.tasa_bcv, 'tasa_bcv_fecha', r.tasa_bcv_fecha, 'motivo_rechazo', r.motivo_rechazo,
      'metodo_pago_id', r.metodo_pago_id) END);
END $$;

CREATE OR REPLACE FUNCTION public.fn_validar_embarque(p_codigo text, p_viaje_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_ctx record; v_code text := upper(btrim(coalesce(p_codigo, ''))); v_id uuid; v_coop uuid;
BEGIN
  SELECT * INTO v_ctx FROM public._contexto_staff();
  SELECT b.id, b.cooperativa_id INTO v_id, v_coop
    FROM public.boletos b
   WHERE b.codigo_boleto = v_code OR upper(b.qr_embarque_data) = v_code OR 'PASS-' || b.codigo_boleto = v_code
   ORDER BY (b.cooperativa_id = v_ctx.o_cooperativa_id) DESC, b.created_at DESC
   LIMIT 1;
  IF v_id IS NULL THEN RETURN jsonb_build_object('resultado', 'NO_ENCONTRADO', 'codigo', v_code); END IF;
  IF v_coop <> v_ctx.o_cooperativa_id THEN RETURN jsonb_build_object('resultado', 'OTRA_COOPERATIVA', 'codigo', v_code); END IF;
  RETURN public._resultado_embarque(v_id, p_viaje_id);
END $$;

CREATE OR REPLACE FUNCTION public.fn_confirmar_embarque(p_boleto_id uuid, p_viaje_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_ctx record; v_coop uuid; v_res jsonb;
BEGIN
  SELECT * INTO v_ctx FROM public._contexto_staff();
  SELECT cooperativa_id INTO v_coop FROM public.boletos WHERE id = p_boleto_id FOR UPDATE;
  IF v_coop IS NULL OR v_coop <> v_ctx.o_cooperativa_id THEN
    PERFORM public._fallar('EB_NO_ENCONTRADO', 'No encontramos ese boleto en tu cooperativa.');
  END IF;
  v_res := public._resultado_embarque(p_boleto_id, p_viaje_id);
  IF v_res->>'resultado' <> 'VALIDO' THEN
    PERFORM public._fallar('EB_EMBARQUE_NO_VALIDO', 'Este boleto no se puede embarcar ahora. Escanéalo de nuevo.', v_res);
  END IF;
  UPDATE public.boletos SET estado = 'USADO', embarcado_at = now(), embarcado_por = v_ctx.o_uid
   WHERE id = p_boleto_id AND estado = 'PAGADO';
  RETURN public._resultado_embarque(p_boleto_id, p_viaje_id);
END $$;

-- Expiración: solo el servidor; nunca con un pago en verificación.
CREATE OR REPLACE FUNCTION public.auto_expirar_reserva()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  UPDATE public.boletos b
     SET estado = 'EXPIRADO'
    FROM public.viajes v
   WHERE v.id = b.viaje_id
     AND b.estado = 'RESERVADO'
     AND NOT EXISTS (SELECT 1 FROM public.pagos p
                      WHERE (p.id = b.pago_id OR p.boleto_id = b.id)
                        AND p.tipo_pago = 'DIGITAL' AND p.estado_verificacion = 'PENDIENTE')
     AND ((b.reserva_expira_at IS NOT NULL AND b.reserva_expira_at < now())
          OR v.fecha_hora_salida < now()
          OR v.estado IN ('CANCELADO', 'EN_CURSO', 'COMPLETADO'));
END $$;
-- (el job 'auto_expirar_reserva' de 20260414000008 ya la ejecuta cada minuto)

-- Permisos
DO $$
DECLARE f record;
BEGIN
  FOR f IN SELECT p.oid::regprocedure AS sig FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public' AND (p.proname LIKE '\_%' OR p.proname = 'auto_expirar_reserva') LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', f.sig);
  END LOOP;
  FOR f IN SELECT p.oid::regprocedure AS sig FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public' AND p.proname IN (
              'fn_reservar_asientos', 'fn_liberar_reserva', 'fn_checkout_boletos', 'fn_cancelar_boleto',
              'fn_vender_boletos_taquilla', 'fn_cobrar_reserva_taquilla', 'fn_validar_embarque', 'fn_confirmar_embarque') LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', f.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', f.sig);
  END LOOP;
END $$;

COMMIT;
```

### 2.4 `supabase/migrations/20260719000004_fase2_rpc_pagos_encomiendas.sql`

```sql
-- Cobro en destino, pagos de encomienda, aprobar/rechazar, bandeja de verificación,
-- recepción en origen con costo en servidor, despacho y salida del bus.
BEGIN;

-- 1. Máquina de estados de encomienda.
CREATE OR REPLACE FUNCTION public.validar_transicion_encomienda_fn()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.estado IS DISTINCT FROM NEW.estado THEN
    IF OLD.estado IN ('ENTREGADA', 'CANCELADA', 'DEVUELTA') THEN
      RAISE EXCEPTION 'No se permite salir de un estado terminal: %', OLD.estado;
    ELSIF OLD.estado = 'PENDIENTE_DE_ESCANEO' AND NEW.estado NOT IN ('EN_RECEPCION', 'CANCELADA') THEN
      RAISE EXCEPTION 'Transición no válida: % -> %', OLD.estado, NEW.estado;
    ELSIF OLD.estado = 'EN_RECEPCION' AND NEW.estado NOT IN ('POR_PAGAR') THEN
      RAISE EXCEPTION 'Transición no válida: % -> %', OLD.estado, NEW.estado;
    ELSIF OLD.estado = 'POR_PAGAR' AND NEW.estado = 'EN_TRANSITO' AND NEW.modalidad_pago <> 'DESTINO' THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'EB_COBRO_PENDIENTE',
        HINT = format('La encomienda %s está por pagar en origen. Cóbrala antes de despacharla.', NEW.tracking_id);
    ELSIF OLD.estado = 'POR_PAGAR' AND NEW.estado NOT IN ('PAGADA', 'CANCELADA', 'EN_TRANSITO') THEN
      RAISE EXCEPTION 'Transición no válida: % -> %', OLD.estado, NEW.estado;
    ELSIF OLD.estado = 'PAGADA' AND NEW.estado NOT IN ('EN_TRANSITO') THEN
      RAISE EXCEPTION 'Transición no válida: % -> %', OLD.estado, NEW.estado;
    ELSIF OLD.estado = 'EN_TRANSITO' AND NEW.estado NOT IN ('EN_OFICINA_DESTINO') THEN
      RAISE EXCEPTION 'Transición no válida: % -> %', OLD.estado, NEW.estado;
    ELSIF OLD.estado = 'EN_OFICINA_DESTINO' AND NEW.estado NOT IN ('ENTREGADA', 'DEVUELTA') THEN
      RAISE EXCEPTION 'Transición no válida: % -> %', OLD.estado, NEW.estado;
    END IF;
    IF NEW.estado = 'ENTREGADA' AND NEW.modalidad_pago = 'DESTINO'
       AND NOT EXISTS (SELECT 1 FROM public.pagos p WHERE p.encomienda_id = NEW.id AND p.verificado) THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'EB_COBRO_PENDIENTE',
        HINT = 'Falta cobrar el envío: regístralo antes de entregarlo.';
    END IF;
  END IF;
  RETURN NEW;
END $$;
-- (el trigger validar_transicion_encomienda ya existe y usa esta función)

-- 2. App: pagar una encomienda (ORIGEN: remitente en POR_PAGAR; DESTINO: remitente o destinatario
--    desde POR_PAGAR hasta EN_OFICINA_DESTINO). Sustituye el INSERT directo y el UPDATE a PENDIENTE_VERIFICACION.
CREATE OR REPLACE FUNCTION public.fn_registrar_pago_encomienda(
  p_encomienda_id uuid, p_metodo_pago_id uuid, p_numero_referencia text, p_fecha_transaccion date,
  p_banco_emisor text, p_monto_declarado numeric, p_tasa_esperada numeric, p_idempotency_key text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_uid uuid := public._uid_usuario(); v_e record; v_metodo_tipo public.tipo_metodo_pago;
  v_tasa numeric; v_tasa_fecha date; v_ref text; v_bs numeric; v_moneda text; v_esperado numeric; v_pago_id uuid;
BEGIN
  IF coalesce(length(p_idempotency_key), 0) < 8 THEN
    PERFORM public._fallar('EB_DATOS_INVALIDOS', 'Falta la clave de la operación. Actualiza la app e intenta de nuevo.');
  END IF;
  SELECT * INTO v_e FROM public.encomiendas WHERE id = p_encomienda_id FOR UPDATE;
  IF NOT FOUND OR NOT (v_e.sender_id = v_uid OR v_e.receiver_user_id IS NOT DISTINCT FROM v_uid) THEN
    PERFORM public._fallar('EB_NO_ENCONTRADO', 'No encontramos esta encomienda.');
  END IF;
  SELECT id INTO v_pago_id FROM public.pagos WHERE pagador_id = v_uid AND idempotency_key = p_idempotency_key;
  IF v_pago_id IS NOT NULL THEN
    RETURN jsonb_build_object('pago_id', v_pago_id, 'estado', 'PENDIENTE', 'repetido', true);
  END IF;
  IF NOT ((v_e.estado = 'POR_PAGAR' AND (v_e.modalidad_pago = 'DESTINO' OR v_e.sender_id = v_uid))
       OR (v_e.modalidad_pago = 'DESTINO' AND v_e.estado IN ('EN_TRANSITO', 'EN_OFICINA_DESTINO'))) THEN
    PERFORM public._fallar('EB_ESTADO_CAMBIO', 'Esta encomienda no tiene un pago pendiente. Actualiza la pantalla.');
  END IF;
  IF coalesce(v_e.costo_calculado, 0) <= 0 THEN
    PERFORM public._fallar('EB_COSTO_PENDIENTE', 'El costo se calcula cuando la taquilla pesa el paquete.');
  END IF;
  IF EXISTS (SELECT 1 FROM public.pagos WHERE encomienda_id = p_encomienda_id
              AND estado_verificacion IN ('PENDIENTE', 'APROBADO')) THEN
    PERFORM public._fallar('EB_PAGO_YA_REGISTRADO', 'Ya hay un pago registrado para esta encomienda.');
  END IF;
  SELECT m.tipo INTO v_metodo_tipo FROM public.metodos_pago_cooperativa m
   WHERE m.id = p_metodo_pago_id AND m.cooperativa_id = v_e.cooperativa_id AND m.activo;
  IF v_metodo_tipo IS NULL OR v_metodo_tipo = 'EFECTIVO' THEN
    PERFORM public._fallar('EB_METODO_INVALIDO', 'Elige una forma de pago de la cooperativa. El efectivo se paga en taquilla.');
  END IF;
  v_ref := public._validar_comprobante(v_metodo_tipo, p_numero_referencia, p_banco_emisor, p_fecha_transaccion);
  SELECT o_tasa, o_fecha INTO v_tasa, v_tasa_fecha FROM public._tasa_para_cobro();
  v_bs := round(v_e.costo_calculado * v_tasa, 2);
  IF p_tasa_esperada IS NOT NULL AND abs(p_tasa_esperada - v_tasa) > 0.00005 THEN
    PERFORM public._fallar('EB_TASA_CAMBIO', 'La tasa BCV se actualizó. Revisa el nuevo total antes de registrar el pago.',
      jsonb_build_object('tasa', v_tasa, 'tasa_fecha', v_tasa_fecha, 'total_usd', v_e.costo_calculado, 'total_bs', v_bs));
  END IF;
  v_moneda := CASE WHEN v_metodo_tipo = 'ZELLE' THEN 'USD' ELSE 'VES' END;
  v_esperado := CASE WHEN v_moneda = 'USD' THEN v_e.costo_calculado ELSE v_bs END;
  IF p_monto_declarado IS NOT NULL AND (p_monto_declarado <= 0 OR p_monto_declarado > v_esperado * 10) THEN
    PERFORM public._fallar('EB_DATOS_PAGO_INVALIDOS', 'Revisa el monto que pagaste.', '{"campo":"monto"}');
  END IF;
  IF EXISTS (SELECT 1 FROM public.pagos WHERE cooperativa_id = v_e.cooperativa_id AND numero_referencia = v_ref
              AND tipo_pago = 'DIGITAL' AND rechazado_at IS NULL) THEN
    PERFORM public._fallar('EB_REFERENCIA_REPETIDA',
      'Esa referencia ya fue registrada en otro pago. Revisa el número de tu comprobante.', '{"campo":"referencia"}');
  END IF;
  BEGIN
    INSERT INTO public.pagos (encomienda_id, pagador_id, cooperativa_id, metodo_pago_id, monto, monto_bs, tasa_bcv,
                              tasa_bcv_fecha, moneda, monto_declarado, tipo_pago, numero_referencia,
                              fecha_transaccion, banco_emisor, verificado, idempotency_key)
    VALUES (p_encomienda_id, v_uid, v_e.cooperativa_id, p_metodo_pago_id, v_e.costo_calculado, v_bs, v_tasa,
            v_tasa_fecha, v_moneda, coalesce(p_monto_declarado, v_esperado), 'DIGITAL', v_ref,
            p_fecha_transaccion, CASE WHEN v_metodo_tipo = 'ZELLE' THEN 'Zelle' ELSE btrim(p_banco_emisor) END,
            false, p_idempotency_key)
    RETURNING id INTO v_pago_id;
  EXCEPTION WHEN unique_violation THEN
    PERFORM public._fallar('EB_PAGO_YA_REGISTRADO', 'Ya hay un pago registrado para esta encomienda.');
  END;
  RETURN jsonb_build_object('pago_id', v_pago_id, 'estado', 'PENDIENTE', 'monto_usd', v_e.costo_calculado,
    'monto_bs', v_bs, 'tasa_bcv', v_tasa, 'tasa_bcv_fecha', v_tasa_fecha, 'moneda', v_moneda,
    'monto_declarado', coalesce(p_monto_declarado, v_esperado));
END $$;

-- 3. Taquilla (origen o destino): cobrar una encomienda en mostrador (P-33).
CREATE OR REPLACE FUNCTION public.fn_cobrar_encomienda_taquilla(
  p_encomienda_id uuid, p_metodo_tipo public.tipo_metodo_pago, p_metodo_pago_id uuid, p_moneda text,
  p_monto_recibido numeric, p_numero_referencia text, p_fecha_transaccion date, p_banco_emisor text,
  p_idempotency_key text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_ctx record; v_e record; v_tasa numeric; v_tasa_fecha date; v_ref text;
  v_bs numeric; v_moneda text; v_esperado numeric; v_pago_id uuid;
BEGIN
  SELECT * INTO v_ctx FROM public._contexto_staff();
  IF coalesce(length(p_idempotency_key), 0) < 8 THEN
    PERFORM public._fallar('EB_DATOS_INVALIDOS', 'Falta la clave de la operación. Recarga la página.');
  END IF;
  SELECT * INTO v_e FROM public.encomiendas WHERE id = p_encomienda_id FOR UPDATE;
  IF NOT FOUND OR v_e.cooperativa_id IS DISTINCT FROM v_ctx.o_cooperativa_id THEN
    PERFORM public._fallar('EB_NO_ENCONTRADO', 'No encontramos esta encomienda en tu cooperativa.');
  END IF;
  SELECT id INTO v_pago_id FROM public.pagos WHERE pagador_id = v_ctx.o_uid AND idempotency_key = p_idempotency_key;
  IF v_pago_id IS NOT NULL THEN
    RETURN jsonb_build_object('pago_id', v_pago_id, 'estado', 'APROBADO', 'repetido', true);
  END IF;
  IF NOT (v_e.estado = 'POR_PAGAR'
          OR (v_e.modalidad_pago = 'DESTINO' AND v_e.estado IN ('EN_TRANSITO', 'EN_OFICINA_DESTINO'))) THEN
    PERFORM public._fallar('EB_ESTADO_CAMBIO', 'Esta encomienda ya no está pendiente de pago. Actualiza la lista.');
  END IF;
  IF coalesce(v_e.costo_calculado, 0) <= 0 THEN
    PERFORM public._fallar('EB_COSTO_PENDIENTE', 'La encomienda todavía no tiene costo. Recíbela y pésala primero.');
  END IF;
  IF EXISTS (SELECT 1 FROM public.pagos WHERE encomienda_id = p_encomienda_id AND verificado) THEN
    PERFORM public._fallar('EB_PAGO_YA_REGISTRADO', 'Esta encomienda ya está pagada.');
  END IF;
  IF EXISTS (SELECT 1 FROM public.pagos WHERE encomienda_id = p_encomienda_id AND estado_verificacion = 'PENDIENTE') THEN
    PERFORM public._fallar('EB_PAGO_PENDIENTE_EXISTE',
      'El cliente ya reportó un pago. Verifícalo o recházalo antes de cobrar de nuevo.');
  END IF;
  IF p_metodo_pago_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM public.metodos_pago_cooperativa
        WHERE id = p_metodo_pago_id AND cooperativa_id = v_ctx.o_cooperativa_id AND tipo = p_metodo_tipo) THEN
    PERFORM public._fallar('EB_METODO_INVALIDO', 'La cuenta elegida no corresponde a esa forma de pago.');
  END IF;
  v_ref := public._validar_comprobante(p_metodo_tipo, p_numero_referencia, p_banco_emisor, p_fecha_transaccion);
  v_moneda := CASE p_metodo_tipo WHEN 'ZELLE' THEN 'USD' WHEN 'EFECTIVO' THEN coalesce(p_moneda, 'VES') ELSE 'VES' END;
  IF v_moneda NOT IN ('VES', 'USD') THEN PERFORM public._fallar('EB_DATOS_INVALIDOS', 'Moneda no válida.'); END IF;
  SELECT o_tasa, o_fecha INTO v_tasa, v_tasa_fecha FROM public._tasa_para_cobro();
  v_bs := round(v_e.costo_calculado * v_tasa, 2);
  v_esperado := CASE WHEN v_moneda = 'USD' THEN v_e.costo_calculado ELSE v_bs END;
  IF p_metodo_tipo = 'EFECTIVO' AND coalesce(p_monto_recibido, 0) < v_esperado THEN
    PERFORM public._fallar('EB_MONTO_INSUFICIENTE', 'El monto recibido es menor que el total a cobrar.',
      jsonb_build_object('esperado', v_esperado, 'moneda', v_moneda, 'campo', 'monto'));
  END IF;
  BEGIN
    INSERT INTO public.pagos (encomienda_id, pagador_id, cooperativa_id, metodo_pago_id, monto, monto_bs, tasa_bcv,
                              tasa_bcv_fecha, moneda, monto_declarado, tipo_pago, numero_referencia,
                              fecha_transaccion, banco_emisor, verificado, verificado_por, verificado_at, idempotency_key)
    VALUES (p_encomienda_id, v_ctx.o_uid, v_ctx.o_cooperativa_id, p_metodo_pago_id, v_e.costo_calculado, v_bs,
            v_tasa, v_tasa_fecha, v_moneda, coalesce(p_monto_recibido, v_esperado),
            CASE WHEN p_metodo_tipo = 'EFECTIVO' THEN 'EFECTIVO'::public.tipo_pago ELSE 'DIGITAL'::public.tipo_pago END,
            v_ref, coalesce(p_fecha_transaccion, (now() AT TIME ZONE 'America/Caracas')::date),
            CASE WHEN p_metodo_tipo = 'ZELLE' THEN 'Zelle' ELSE nullif(btrim(p_banco_emisor), '') END,
            true, v_ctx.o_uid, now(), p_idempotency_key)
    RETURNING id INTO v_pago_id;
  EXCEPTION WHEN unique_violation THEN
    PERFORM public._fallar('EB_PAGO_YA_REGISTRADO', 'Esta encomienda ya está pagada.');
  END;
  IF v_e.estado = 'POR_PAGAR' THEN
    UPDATE public.encomiendas SET estado = 'PAGADA' WHERE id = p_encomienda_id;
  END IF;
  RETURN jsonb_build_object('pago_id', v_pago_id, 'estado', 'APROBADO',
    'encomienda_estado', CASE WHEN v_e.estado = 'POR_PAGAR' THEN 'PAGADA' ELSE v_e.estado::text END,
    'monto_usd', v_e.costo_calculado, 'monto_bs', v_bs, 'tasa_bcv', v_tasa, 'tasa_bcv_fecha', v_tasa_fecha,
    'moneda', v_moneda, 'esperado', v_esperado, 'recibido', coalesce(p_monto_recibido, v_esperado),
    'vuelto', GREATEST(coalesce(p_monto_recibido, v_esperado) - v_esperado, 0));
END $$;

-- 4. Aprobar / rechazar (personal de la cooperativa).
CREATE OR REPLACE FUNCTION public.fn_aprobar_pago(p_pago_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_ctx record; v_p public.pagos%ROWTYPE; v_n integer := 0; v_tracking text; v_boleto uuid;
BEGIN
  SELECT * INTO v_ctx FROM public._contexto_staff();
  SELECT * INTO v_p FROM public.pagos WHERE id = p_pago_id FOR UPDATE;
  IF NOT FOUND OR v_p.cooperativa_id <> v_ctx.o_cooperativa_id THEN
    PERFORM public._fallar('EB_NO_ENCONTRADO', 'No encontramos este pago en tu cooperativa.');
  END IF;
  IF v_p.verificado THEN RETURN jsonb_build_object('ok', true, 'ya_procesado', true); END IF;
  IF v_p.rechazado_at IS NOT NULL THEN
    PERFORM public._fallar('EB_PAGO_YA_RESUELTO', 'Este pago ya fue rechazado. Actualiza la lista.');
  END IF;
  UPDATE public.pagos SET verificado = true, verificado_por = v_ctx.o_uid, verificado_at = now() WHERE id = p_pago_id;

  IF v_p.encomienda_id IS NOT NULL THEN
    UPDATE public.encomiendas SET estado = 'PAGADA' WHERE id = v_p.encomienda_id AND estado = 'POR_PAGAR';
    SELECT tracking_id INTO v_tracking FROM public.encomiendas WHERE id = v_p.encomienda_id;
    PERFORM public._notificar_usuario(v_p.pagador_id, 'PAGO_APROBADO', 'Pago confirmado',
      format('La cooperativa confirmó el pago de tu envío %s.', v_tracking), 'encomienda', v_p.encomienda_id);
    RETURN jsonb_build_object('ok', true, 'encomienda_id', v_p.encomienda_id);
  END IF;

  UPDATE public.boletos
     SET estado = 'PAGADO', reserva_expira_at = NULL,
         qr_embarque_data = coalesce(qr_embarque_data, 'PASS-' || codigo_boleto)
   WHERE (pago_id = p_pago_id OR (id = v_p.boleto_id AND pago_id IS NULL)) AND estado = 'RESERVADO';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n = 0 THEN
    PERFORM public._fallar('EB_BOLETOS_NO_ACTIVABLES',
      'Los boletos de este pago ya vencieron o se cancelaron. Recházalo con el motivo y devuelve el dinero.');
  END IF;
  SELECT id INTO v_boleto FROM public.boletos WHERE pago_id = p_pago_id ORDER BY length(asiento), asiento LIMIT 1;
  PERFORM public._notificar_usuario(v_p.pagador_id, 'PAGO_APROBADO', 'Pago confirmado',
    'La cooperativa confirmó tu pago. Tu pase de abordaje ya está disponible.', 'boleto', coalesce(v_boleto, v_p.boleto_id));
  RETURN jsonb_build_object('ok', true, 'boletos_activados', v_n);
END $$;

CREATE OR REPLACE FUNCTION public.fn_rechazar_pago(p_pago_id uuid, p_motivo text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_ctx record; v_p public.pagos%ROWTYPE; v_motivo text := left(btrim(coalesce(p_motivo, '')), 300);
        v_tracking text; v_n integer := 0; v_boleto uuid;
BEGIN
  SELECT * INTO v_ctx FROM public._contexto_staff();
  SELECT * INTO v_p FROM public.pagos WHERE id = p_pago_id FOR UPDATE;
  IF NOT FOUND OR v_p.cooperativa_id <> v_ctx.o_cooperativa_id THEN
    PERFORM public._fallar('EB_NO_ENCONTRADO', 'No encontramos este pago en tu cooperativa.');
  END IF;
  IF v_p.rechazado_at IS NOT NULL THEN RETURN jsonb_build_object('ok', true, 'ya_procesado', true); END IF;
  IF v_p.verificado THEN
    PERFORM public._fallar('EB_PAGO_YA_RESUELTO', 'Este pago ya fue aprobado; no se puede rechazar.');
  END IF;
  IF length(v_motivo) < 5 THEN
    PERFORM public._fallar('EB_MOTIVO_REQUERIDO', 'Escribe el motivo del rechazo (se le enviará al cliente).', '{"campo":"motivo"}');
  END IF;
  UPDATE public.pagos SET rechazado_at = now(), rechazado_por = v_ctx.o_uid, motivo_rechazo = v_motivo WHERE id = p_pago_id;

  IF v_p.encomienda_id IS NOT NULL THEN
    SELECT tracking_id INTO v_tracking FROM public.encomiendas WHERE id = v_p.encomienda_id;
    PERFORM public._notificar_usuario(v_p.pagador_id, 'PAGO_RECHAZADO', 'Revisa tu pago',
      format('La cooperativa no pudo confirmar el pago de tu envío %s (ref. %s): %s. Regístralo de nuevo o paga en la taquilla.',
             v_tracking, coalesce(v_p.numero_referencia, 's/n'), v_motivo), 'encomienda', v_p.encomienda_id);
  ELSE
    -- La reserva vuelve a "sin pagar" con 30 minutos nuevos (sin pasar de la salida).
    UPDATE public.boletos b
       SET reserva_expira_at = least(now() + interval '30 minutes', v.fecha_hora_salida)
      FROM public.viajes v
     WHERE v.id = b.viaje_id AND b.pago_id = p_pago_id AND b.estado = 'RESERVADO';
    GET DIAGNOSTICS v_n = ROW_COUNT;
    SELECT id INTO v_boleto FROM public.boletos WHERE pago_id = p_pago_id ORDER BY length(asiento), asiento LIMIT 1;
    PERFORM public._notificar_usuario(v_p.pagador_id, 'PAGO_RECHAZADO', 'Revisa tu pago',
      format('La cooperativa no pudo confirmar tu pago (ref. %s): %s. Regístralo de nuevo en los próximos 30 minutos o se liberarán tus asientos.',
             coalesce(v_p.numero_referencia, 's/n'), v_motivo), 'boleto', coalesce(v_boleto, v_p.boleto_id));
  END IF;
  RETURN jsonb_build_object('ok', true, 'boletos_afectados', v_n);
END $$;

-- 5. Bandeja "Pagos por verificar" (o el detalle de un pago con p_pago_id).
CREATE OR REPLACE FUNCTION public.fn_pagos_por_verificar(p_tipo text DEFAULT NULL, p_pago_id uuid DEFAULT NULL)
RETURNS TABLE (
  pago_id uuid, creado_at timestamptz, tipo_recurso text,
  compra_id uuid, boleto_ids uuid[], codigos_boletos text, asientos text,
  encomienda_id uuid, tracking_id text, encomienda_estado text, modalidad_pago text,
  viaje_salida timestamptz, ruta text, recurso_vencido boolean,
  cliente_nombre text, cliente_cedula text, cliente_telefono text, pagador_rol text,
  metodo_tipo text, cuenta_banco text, cuenta_titular text, cuenta_final text, cuenta_email_zelle text,
  banco_emisor text, numero_referencia text, fecha_transaccion date,
  moneda text, esperado numeric, declarado numeric, diferencia numeric,
  monto_usd numeric, monto_bs numeric, tasa_bcv numeric, tasa_bcv_fecha date,
  estado_verificacion text, motivo_rechazo text, referencia_repetida boolean
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
#variable_conflict use_column
DECLARE v_ctx record;
BEGIN
  SELECT * INTO v_ctx FROM public._contexto_staff();
  RETURN QUERY
  SELECT p.id, p.created_at,
         CASE WHEN p.encomienda_id IS NOT NULL THEN 'encomienda' ELSE 'boleto' END,
         bol.compra_id, bol.ids, bol.codigos, bol.asientos,
         p.encomienda_id, e.tracking_id, e.estado::text, e.modalidad_pago::text,
         bol.salida, coalesce(bol.ruta, e.ciudad_origen || ' → ' || e.ciudad_destino),
         coalesce(bol.vencidos, false) OR coalesce(e.estado IN ('CANCELADA', 'DEVUELTA'), false),
         coalesce(bol.pasajero, pr.nombre_completo), coalesce(bol.cedula, pr.cedula_rif), pr.telefono,
         CASE WHEN e.id IS NULL THEN 'PASAJERO'
              WHEN p.pagador_id = e.sender_id THEN 'REMITENTE'
              WHEN p.pagador_id = e.receiver_user_id THEN 'DESTINATARIO'
              ELSE 'OTRO' END,
         m.tipo::text, m.banco, m.titular,
         right(regexp_replace(coalesce(m.numero_cuenta, ''), '[^0-9]', '', 'g'), 4), m.email_zelle,
         p.banco_emisor, p.numero_referencia, p.fecha_transaccion,
         p.moneda,
         CASE WHEN p.moneda = 'USD' THEN p.monto::numeric ELSE p.monto_bs END,
         p.monto_declarado,
         p.monto_declarado - CASE WHEN p.moneda = 'USD' THEN p.monto::numeric ELSE p.monto_bs END,
         p.monto::numeric, p.monto_bs, p.tasa_bcv, p.tasa_bcv_fecha,
         p.estado_verificacion, p.motivo_rechazo,
         EXISTS (SELECT 1 FROM public.pagos o
                  WHERE o.id <> p.id AND o.cooperativa_id = p.cooperativa_id AND p.numero_referencia IS NOT NULL
                    AND o.numero_referencia = p.numero_referencia AND o.rechazado_at IS NULL)
    FROM public.pagos p
    LEFT JOIN public.profiles pr ON pr.id = p.pagador_id
    LEFT JOIN public.metodos_pago_cooperativa m ON m.id = p.metodo_pago_id
    LEFT JOIN public.encomiendas e ON e.id = p.encomienda_id
    LEFT JOIN LATERAL (
      SELECT (array_agg(b.compra_id))[1] AS compra_id,
             array_agg(b.id ORDER BY length(b.asiento), b.asiento) AS ids,
             string_agg(b.codigo_boleto, ', ' ORDER BY length(b.asiento), b.asiento) AS codigos,
             string_agg(b.asiento, ', ' ORDER BY length(b.asiento), b.asiento) AS asientos,
             min(v.fecha_hora_salida) AS salida,
             min(r.ciudad_origen || ' → ' || r.ciudad_destino) AS ruta,
             bool_and(b.estado IN ('EXPIRADO', 'CANCELADO')) AS vencidos,
             min(b.pasajero_nombre) AS pasajero, min(b.pasajero_cedula) AS cedula
        FROM public.boletos b
        JOIN public.viajes v ON v.id = b.viaje_id
        JOIN public.rutas r ON r.id = v.ruta_id
       WHERE b.pago_id = p.id OR (b.id = p.boleto_id AND b.pago_id IS NULL)
    ) bol ON p.encomienda_id IS NULL
   WHERE p.cooperativa_id = v_ctx.o_cooperativa_id
     AND ((p_pago_id IS NOT NULL AND p.id = p_pago_id)
       OR (p_pago_id IS NULL AND p.tipo_pago = 'DIGITAL' AND NOT p.verificado AND p.rechazado_at IS NULL))
     AND (p_tipo IS NULL OR (p_tipo = 'boleto' AND p.encomienda_id IS NULL)
                         OR (p_tipo = 'encomienda' AND p.encomienda_id IS NOT NULL))
   ORDER BY p.created_at;
END $$;

-- 6. Costo de encomienda en servidor (misma fórmula que calcular-costo-encomienda).
CREATE OR REPLACE FUNCTION public._costo_encomienda(p_encomienda_id uuid, p_peso_kg numeric,
                                                    OUT o_costo_usd numeric, OUT o_peso_max numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_e record; v_por_kg numeric; v_factor numeric; v_duracion integer;
BEGIN
  SELECT * INTO v_e FROM public.encomiendas WHERE id = p_encomienda_id;
  SELECT tarifa_por_kg, factor_distancia_por_min, peso_max_kg INTO v_por_kg, v_factor, o_peso_max
    FROM public.tarifas WHERE activa LIMIT 1;
  IF v_por_kg IS NULL THEN
    PERFORM public._fallar('EB_TARIFA_NO_DISPONIBLE', 'No hay una tarifa activa. Avísale al administrador de EnBus.');
  END IF;
  IF p_peso_kg IS NULL OR p_peso_kg <= 0 OR p_peso_kg > o_peso_max THEN
    PERFORM public._fallar('EB_PESO_INVALIDO', format('El peso debe ser mayor que 0 y de hasta %s kg.', o_peso_max),
      jsonb_build_object('peso_max_kg', o_peso_max, 'campo', 'peso'));
  END IF;
  SELECT r.duracion_estimada_min INTO v_duracion
    FROM public.rutas r
   WHERE r.cooperativa_id = v_e.cooperativa_id AND r.activa
     AND public.normalizar_localidad(r.estado_origen)  = public.normalizar_localidad(v_e.estado_origen)
     AND public.normalizar_localidad(r.ciudad_origen)  = public.normalizar_localidad(v_e.ciudad_origen)
     AND public.normalizar_localidad(r.estado_destino) = public.normalizar_localidad(v_e.estado_destino)
     AND public.normalizar_localidad(r.ciudad_destino) = public.normalizar_localidad(v_e.ciudad_destino)
   ORDER BY r.duracion_estimada_min LIMIT 1;
  IF v_duracion IS NULL THEN
    PERFORM public._fallar('EB_SIN_RUTA', 'Tu cooperativa no tiene una ruta activa a ese destino.');
  END IF;
  o_costo_usd := round(p_peso_kg * v_por_kg * (1 + v_factor * v_duracion), 2);
END $$;

CREATE OR REPLACE FUNCTION public.fn_cotizar_encomienda(p_encomienda_id uuid, p_peso_kg numeric)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_ctx record; v_coop uuid; v_costo numeric; v_max numeric; v_tasa numeric; v_fecha date;
BEGIN
  SELECT * INTO v_ctx FROM public._contexto_staff();
  SELECT cooperativa_id INTO v_coop FROM public.encomiendas WHERE id = p_encomienda_id;
  IF v_coop IS DISTINCT FROM v_ctx.o_cooperativa_id THEN
    PERFORM public._fallar('EB_NO_ENCONTRADO', 'No encontramos esta encomienda en tu cooperativa.');
  END IF;
  SELECT o_costo_usd, o_peso_max INTO v_costo, v_max FROM public._costo_encomienda(p_encomienda_id, p_peso_kg);
  SELECT t.tasa, t.fecha INTO v_tasa, v_fecha FROM public.fn_tasa_bcv_vigente() t;
  RETURN jsonb_build_object('costo_usd', v_costo, 'peso_max_kg', v_max, 'tasa_bcv', v_tasa, 'tasa_bcv_fecha', v_fecha,
    'costo_bs', CASE WHEN v_tasa IS NOT NULL THEN round(v_costo * v_tasa, 2) END);
END $$;

CREATE OR REPLACE FUNCTION public._sucursal_destino_unica(p_cooperativa_id uuid, p_ciudad text)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT CASE WHEN count(*) = 1 THEN (array_agg(s.id))[1] END
    FROM public.sucursales s
   WHERE s.cooperativa_id = p_cooperativa_id AND s.activa
     AND public.normalizar_localidad(s.ciudad) = public.normalizar_localidad(p_ciudad);
$$;

-- Rellena sucursal_destino_id al crear la encomienda (solo si hay UNA sucursal activa en la ciudad).
CREATE OR REPLACE FUNCTION public.asignar_sucursal_destino_fn()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.sucursal_destino_id IS NULL AND NEW.cooperativa_id IS NOT NULL THEN
    NEW.sucursal_destino_id := public._sucursal_destino_unica(NEW.cooperativa_id, NEW.ciudad_destino);
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS asignar_sucursal_destino ON public.encomiendas;
CREATE TRIGGER asignar_sucursal_destino
  BEFORE INSERT OR UPDATE OF cooperativa_id, ciudad_destino ON public.encomiendas
  FOR EACH ROW EXECUTE FUNCTION public.asignar_sucursal_destino_fn();

UPDATE public.encomiendas e
   SET sucursal_destino_id = public._sucursal_destino_unica(e.cooperativa_id, e.ciudad_destino)
 WHERE e.sucursal_destino_id IS NULL AND e.cooperativa_id IS NOT NULL
   AND public._sucursal_destino_unica(e.cooperativa_id, e.ciudad_destino) IS NOT NULL;

-- 7. Taquilla origen: recibir y pesar (el costo lo calcula el servidor).
CREATE OR REPLACE FUNCTION public.fn_confirmar_recepcion_origen(p_encomienda_id uuid, p_peso_kg numeric)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_ctx record; v_e record; v_costo numeric; v_max numeric; v_tasa numeric; v_fecha date;
BEGIN
  SELECT * INTO v_ctx FROM public._contexto_staff();
  SELECT * INTO v_e FROM public.encomiendas WHERE id = p_encomienda_id FOR UPDATE;
  IF NOT FOUND OR v_e.cooperativa_id IS DISTINCT FROM v_ctx.o_cooperativa_id THEN
    PERFORM public._fallar('EB_NO_ENCONTRADO', 'No encontramos esta encomienda en tu cooperativa.');
  END IF;
  IF v_e.estado = 'POR_PAGAR' AND v_e.peso_kg = p_peso_kg THEN   -- reintento idempotente
    RETURN jsonb_build_object('estado', 'POR_PAGAR', 'costo_usd', v_e.costo_calculado,
                              'modalidad_pago', v_e.modalidad_pago, 'repetido', true);
  END IF;
  IF v_e.estado NOT IN ('PENDIENTE_DE_ESCANEO', 'EN_RECEPCION') THEN
    PERFORM public._fallar('EB_ESTADO_CAMBIO', 'Esta encomienda ya fue recibida. Actualiza la lista para ver su estado actual.');
  END IF;
  SELECT o_costo_usd, o_peso_max INTO v_costo, v_max FROM public._costo_encomienda(p_encomienda_id, p_peso_kg);
  IF v_e.estado = 'PENDIENTE_DE_ESCANEO' THEN      -- dispara generar_pin_retiro
    UPDATE public.encomiendas SET estado = 'EN_RECEPCION' WHERE id = p_encomienda_id;
  END IF;
  UPDATE public.encomiendas
     SET estado = 'POR_PAGAR', peso_kg = p_peso_kg, costo_calculado = v_costo,
         sucursal_origen_id = coalesce(sucursal_origen_id, v_ctx.o_sucursal_id),
         sucursal_destino_id = coalesce(sucursal_destino_id,
                                        public._sucursal_destino_unica(cooperativa_id, ciudad_destino))
   WHERE id = p_encomienda_id;
  SELECT t.tasa, t.fecha INTO v_tasa, v_fecha FROM public.fn_tasa_bcv_vigente() t;
  RETURN jsonb_build_object('estado', 'POR_PAGAR', 'costo_usd', v_costo,
    'costo_bs', CASE WHEN v_tasa IS NOT NULL THEN round(v_costo * v_tasa, 2) END,
    'tasa_bcv', v_tasa, 'tasa_bcv_fecha', v_fecha, 'modalidad_pago', v_e.modalidad_pago);
END $$;

-- 8. Despacho (compara solo ciudades normalizadas).
CREATE OR REPLACE FUNCTION public._resultado_despacho(p_encomienda_id uuid, p_viaje_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE e record; r record;
BEGIN
  SELECT * INTO e FROM public.encomiendas WHERE id = p_encomienda_id;
  IF NOT FOUND THEN RETURN 'NO_ENCONTRADA'; END IF;
  SELECT ru.ciudad_origen, ru.ciudad_destino, v.cooperativa_id INTO r
    FROM public.viajes v JOIN public.rutas ru ON ru.id = v.ruta_id WHERE v.id = p_viaje_id;
  IF NOT FOUND THEN RETURN 'VIAJE_NO_ENCONTRADO'; END IF;
  IF e.cooperativa_id IS DISTINCT FROM r.cooperativa_id THEN RETURN 'OTRA_COOPERATIVA'; END IF;
  IF e.estado IN ('EN_TRANSITO', 'EN_OFICINA_DESTINO', 'ENTREGADA') THEN RETURN 'YA_DESPACHADA'; END IF;
  IF e.estado IN ('CANCELADA', 'DEVUELTA') THEN RETURN 'CERRADA'; END IF;
  IF e.estado IN ('PENDIENTE_DE_ESCANEO', 'EN_RECEPCION') THEN RETURN 'SIN_RECIBIR'; END IF;
  IF e.estado = 'POR_PAGAR' AND e.modalidad_pago = 'ORIGEN' THEN RETURN 'POR_PAGAR'; END IF;
  IF public.normalizar_localidad(e.ciudad_destino) IS DISTINCT FROM public.normalizar_localidad(r.ciudad_destino) THEN
    RETURN 'OTRO_DESTINO';
  END IF;
  IF public.normalizar_localidad(e.ciudad_origen) IS DISTINCT FROM public.normalizar_localidad(r.ciudad_origen) THEN
    RETURN 'OTRO_ORIGEN';
  END IF;
  RETURN 'OK';
END $$;

CREATE OR REPLACE FUNCTION public.fn_validar_encomienda_despacho(p_codigo text, p_viaje_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_ctx record; v_code text := btrim(coalesce(p_codigo, '')); e record; r record;
BEGIN
  SELECT * INTO v_ctx FROM public._contexto_staff();
  SELECT ru.ciudad_origen, ru.ciudad_destino, v.fecha_hora_salida, v.numero_unidad, v.estado INTO r
    FROM public.viajes v JOIN public.rutas ru ON ru.id = v.ruta_id
   WHERE v.id = p_viaje_id AND v.cooperativa_id = v_ctx.o_cooperativa_id;
  IF NOT FOUND THEN
    PERFORM public._fallar('EB_VIAJE_REQUERIDO', 'Primero elige el viaje en el que vas a cargar las encomiendas.');
  END IF;
  SELECT * INTO e FROM public.encomiendas
   WHERE cooperativa_id = v_ctx.o_cooperativa_id
     AND (upper(tracking_id) = upper(v_code) OR qr_data = v_code OR id::text = lower(v_code))
   LIMIT 1;
  IF NOT FOUND THEN RETURN jsonb_build_object('resultado', 'NO_ENCONTRADA', 'codigo', v_code); END IF;
  RETURN jsonb_build_object(
    'resultado', public._resultado_despacho(e.id, p_viaje_id),
    'encomienda', jsonb_build_object('id', e.id, 'tracking_id', e.tracking_id, 'estado', e.estado,
      'modalidad_pago', e.modalidad_pago, 'ciudad_origen', e.ciudad_origen, 'ciudad_destino', e.ciudad_destino,
      'receiver_nombre', e.receiver_nombre, 'peso_kg', e.peso_kg, 'costo_usd', e.costo_calculado,
      'cobro_en_destino', e.modalidad_pago = 'DESTINO'
        AND NOT EXISTS (SELECT 1 FROM public.pagos p WHERE p.encomienda_id = e.id AND p.verificado)),
    'viaje', jsonb_build_object('origen', r.ciudad_origen, 'destino', r.ciudad_destino,
      'salida', r.fecha_hora_salida, 'unidad', r.numero_unidad, 'estado', r.estado));
END $$;

CREATE OR REPLACE FUNCTION public.fn_despachar_encomiendas(p_viaje_id uuid, p_encomienda_ids uuid[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_ctx record; v_viaje record; v_ids uuid[]; v_malas jsonb; v_n integer; v_destino integer;
BEGIN
  SELECT * INTO v_ctx FROM public._contexto_staff();
  SELECT id, cooperativa_id, estado INTO v_viaje FROM public.viajes WHERE id = p_viaje_id FOR UPDATE;
  IF NOT FOUND OR v_viaje.cooperativa_id <> v_ctx.o_cooperativa_id THEN
    PERFORM public._fallar('EB_NO_ENCONTRADO', 'No encontramos ese viaje en tu cooperativa.');
  END IF;
  IF v_viaje.estado <> 'PROGRAMADO' THEN
    PERFORM public._fallar('EB_VIAJE_NO_DISPONIBLE',
      CASE WHEN v_viaje.estado = 'CANCELADO' THEN 'Este viaje fue cancelado. Elige otro.'
           ELSE 'Este bus ya salió. Elige otro viaje programado.' END);
  END IF;
  SELECT array_agg(DISTINCT x) INTO v_ids FROM unnest(p_encomienda_ids) x WHERE x IS NOT NULL;
  IF v_ids IS NULL THEN
    PERFORM public._fallar('EB_DATOS_INVALIDOS', 'Escanea al menos una encomienda antes de confirmar el despacho.');
  END IF;
  PERFORM 1 FROM public.encomiendas WHERE id = ANY (v_ids) ORDER BY id FOR UPDATE;
  SELECT jsonb_agg(jsonb_build_object('id', x.id, 'resultado', x.res, 'tracking_id', e.tracking_id,
                                      'ciudad_destino', e.ciudad_destino))
    INTO v_malas
    FROM (SELECT i AS id, public._resultado_despacho(i, p_viaje_id) AS res FROM unnest(v_ids) i) x
    LEFT JOIN public.encomiendas e ON e.id = x.id
   WHERE x.res <> 'OK';
  IF v_malas IS NOT NULL THEN
    PERFORM public._fallar('EB_DESPACHO_INVALIDO',
      'Algunas encomiendas no pueden ir en este viaje. Quítalas de la lista e intenta de nuevo.',
      jsonb_build_object('rechazadas', v_malas));
  END IF;
  SELECT count(*) INTO v_destino FROM public.encomiendas
   WHERE id = ANY (v_ids) AND estado = 'POR_PAGAR' AND modalidad_pago = 'DESTINO';
  UPDATE public.encomiendas SET viaje_id = p_viaje_id, estado = 'EN_TRANSITO' WHERE id = ANY (v_ids);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN jsonb_build_object('despachadas', v_n, 'cobro_en_destino', v_destino);   -- el viaje NO cambia de estado
END $$;

-- Salida del bus (separada del despacho). Cierra la venta y libera reservas sin pagar.
CREATE OR REPLACE FUNCTION public.fn_marcar_salida_viaje(p_viaje_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_ctx record; v_viaje record; v_liberadas integer; v_en_verificacion integer;
BEGIN
  SELECT * INTO v_ctx FROM public._contexto_staff();
  SELECT id, cooperativa_id, estado INTO v_viaje FROM public.viajes WHERE id = p_viaje_id FOR UPDATE;
  IF NOT FOUND OR v_viaje.cooperativa_id <> v_ctx.o_cooperativa_id THEN
    PERFORM public._fallar('EB_NO_ENCONTRADO', 'No encontramos ese viaje en tu cooperativa.');
  END IF;
  IF v_viaje.estado = 'EN_CURSO' THEN RETURN jsonb_build_object('estado', 'EN_CURSO', 'ya_procesado', true); END IF;
  IF v_viaje.estado <> 'PROGRAMADO' THEN
    PERFORM public._fallar('EB_ESTADO_CAMBIO', 'Este viaje no está programado.');
  END IF;
  UPDATE public.viajes SET estado = 'EN_CURSO' WHERE id = p_viaje_id;
  UPDATE public.boletos b SET estado = 'EXPIRADO'
   WHERE b.viaje_id = p_viaje_id AND b.estado = 'RESERVADO'
     AND NOT EXISTS (SELECT 1 FROM public.pagos p WHERE p.id = b.pago_id AND p.estado_verificacion = 'PENDIENTE');
  GET DIAGNOSTICS v_liberadas = ROW_COUNT;
  SELECT count(*) INTO v_en_verificacion
    FROM public.boletos b JOIN public.pagos p ON p.id = b.pago_id
   WHERE b.viaje_id = p_viaje_id AND b.estado = 'RESERVADO' AND p.estado_verificacion = 'PENDIENTE';
  RETURN jsonb_build_object('estado', 'EN_CURSO', 'reservas_liberadas', v_liberadas,
                            'pagos_en_verificacion', v_en_verificacion);
END $$;

-- Permisos
DO $$
DECLARE f record;
BEGIN
  FOR f IN SELECT p.oid::regprocedure AS sig FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public' AND p.proname LIKE '\_%' LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', f.sig);
  END LOOP;
  FOR f IN SELECT p.oid::regprocedure AS sig FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public' AND p.proname IN (
              'fn_registrar_pago_encomienda', 'fn_cobrar_encomienda_taquilla', 'fn_aprobar_pago', 'fn_rechazar_pago',
              'fn_pagos_por_verificar', 'fn_cotizar_encomienda', 'fn_confirmar_recepcion_origen',
              'fn_validar_encomienda_despacho', 'fn_despachar_encomiendas', 'fn_marcar_salida_viaje') LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', f.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', f.sig);
  END LOOP;
END $$;

COMMIT;
```

### 2.5 `supabase/migrations/20260719000005_fase2_destinatario_rif.sql`

```sql
-- Vínculo del destinatario (M-50) y RIF antiguos.
BEGIN;

CREATE INDEX IF NOT EXISTS idx_profiles_cedula_norm   ON public.profiles (public.normalizar_cedula(cedula_rif));
CREATE INDEX IF NOT EXISTS idx_profiles_telefono_norm ON public.profiles (public.normalizar_telefono(telefono));
CREATE INDEX IF NOT EXISTS idx_encomiendas_receiver_cedula_norm
  ON public.encomiendas (public.normalizar_cedula(receiver_cedula_rif));
CREATE INDEX IF NOT EXISTS idx_encomiendas_receiver_tel_norm
  ON public.encomiendas (public.normalizar_telefono(receiver_telefono));

-- Único usuario 'user' por cédula; si no hay, único por teléfono. Ambiguo => no se vincula.
CREATE OR REPLACE FUNCTION public._buscar_destinatario(p_cedula text, p_telefono text,
                                                       OUT o_user_id uuid, OUT o_via text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_ced text := public.normalizar_cedula(p_cedula); v_tel text := public.normalizar_telefono(p_telefono); v_ids uuid[];
BEGIN
  IF v_ced IS NOT NULL THEN
    SELECT array_agg(id) INTO v_ids FROM public.profiles
     WHERE role = 'user' AND public.normalizar_cedula(cedula_rif) = v_ced;
    IF cardinality(v_ids) = 1 THEN o_user_id := v_ids[1]; o_via := 'CEDULA'; RETURN;
    ELSIF cardinality(v_ids) > 1 THEN RETURN;
    END IF;
  END IF;
  IF v_tel IS NOT NULL THEN
    SELECT array_agg(id) INTO v_ids FROM public.profiles
     WHERE role = 'user' AND public.normalizar_telefono(telefono) = v_tel;
    IF cardinality(v_ids) = 1 THEN o_user_id := v_ids[1]; o_via := 'TELEFONO'; END IF;
  END IF;
END $$;

-- Al crear la encomienda o cambiar los datos del destinatario. El cliente nunca decide el vínculo.
CREATE OR REPLACE FUNCTION public.vincular_destinatario_encomienda_fn()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_id uuid; v_via text;
BEGIN
  SELECT o_user_id, o_via INTO v_id, v_via FROM public._buscar_destinatario(NEW.receiver_cedula_rif, NEW.receiver_telefono);
  NEW.receiver_user_id := v_id;
  NEW.receiver_vinculado_por := v_via;
  NEW.receiver_vinculado_at := CASE WHEN v_id IS NOT NULL THEN now() END;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS vincular_destinatario_encomienda ON public.encomiendas;
CREATE TRIGGER vincular_destinatario_encomienda
  BEFORE INSERT OR UPDATE OF receiver_cedula_rif, receiver_telefono ON public.encomiendas
  FOR EACH ROW EXECUTE FUNCTION public.vincular_destinatario_encomienda_fn();

-- Al registrarse un usuario o cambiar su cédula/teléfono. Nunca rompe el alta (corre dentro de handle_new_user).
CREATE OR REPLACE FUNCTION public.vincular_encomiendas_de_perfil_fn()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.role <> 'user' THEN RETURN NULL; END IF;
  IF TG_OP = 'UPDATE' THEN   -- soltar vínculos que dejaron de coincidir
    UPDATE public.encomiendas e
       SET receiver_user_id = NULL, receiver_vinculado_por = NULL, receiver_vinculado_at = NULL
     WHERE e.receiver_user_id = NEW.id
       AND e.estado NOT IN ('ENTREGADA', 'CANCELADA', 'DEVUELTA')
       AND NOT coalesce(
             (e.receiver_vinculado_por = 'CEDULA'
                AND public.normalizar_cedula(e.receiver_cedula_rif) = public.normalizar_cedula(NEW.cedula_rif))
          OR (e.receiver_vinculado_por = 'TELEFONO'
                AND public.normalizar_telefono(e.receiver_telefono) = public.normalizar_telefono(NEW.telefono)), false);
  END IF;
  UPDATE public.encomiendas e
     SET receiver_user_id = c.o_user_id, receiver_vinculado_por = c.o_via, receiver_vinculado_at = now()
    FROM (SELECT x.id, b.o_user_id, b.o_via
            FROM public.encomiendas x
           CROSS JOIN LATERAL public._buscar_destinatario(x.receiver_cedula_rif, x.receiver_telefono) b
           WHERE x.receiver_user_id IS NULL AND x.estado NOT IN ('ENTREGADA', 'CANCELADA', 'DEVUELTA')
             AND (public.normalizar_cedula(x.receiver_cedula_rif) = public.normalizar_cedula(NEW.cedula_rif)
               OR public.normalizar_telefono(x.receiver_telefono) = public.normalizar_telefono(NEW.telefono))) c
   WHERE e.id = c.id AND c.o_user_id = NEW.id;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'vincular_encomiendas_de_perfil (%): %', NEW.id, SQLERRM;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS vincular_encomiendas_de_perfil ON public.profiles;
CREATE TRIGGER vincular_encomiendas_de_perfil
  AFTER INSERT OR UPDATE OF cedula_rif, telefono, role ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.vincular_encomiendas_de_perfil_fn();

-- Backfill (antes del trigger de aviso, para no notificar historia). No mueve updated_at (migración 01).
UPDATE public.encomiendas e
   SET receiver_user_id = c.o_user_id, receiver_vinculado_por = c.o_via, receiver_vinculado_at = now()
  FROM (SELECT x.id, b.o_user_id, b.o_via
          FROM public.encomiendas x
         CROSS JOIN LATERAL public._buscar_destinatario(x.receiver_cedula_rif, x.receiver_telefono) b
         WHERE x.receiver_user_id IS NULL AND b.o_user_id IS NOT NULL) c
 WHERE e.id = c.id;

CREATE OR REPLACE FUNCTION public.avisar_destinatario_vinculado_fn()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_remitente text;
BEGIN
  IF NEW.receiver_user_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.receiver_user_id IS DISTINCT FROM OLD.receiver_user_id)
     AND NEW.receiver_user_id <> NEW.sender_id
     AND NEW.estado NOT IN ('ENTREGADA', 'CANCELADA', 'DEVUELTA') THEN
    SELECT split_part(nombre_completo, ' ', 1) INTO v_remitente FROM public.profiles WHERE id = NEW.sender_id;
    PERFORM public._notificar_usuario(NEW.receiver_user_id, 'ENCOMIENDA_PARA_TI', 'Te enviaron un paquete',
      format('%s te envió la encomienda %s a %s. Síguela en Encomiendas > Para mí.',
             coalesce(v_remitente, 'Alguien'), NEW.tracking_id, NEW.ciudad_destino),
      'encomienda', NEW.id);
  END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS avisar_destinatario_vinculado ON public.encomiendas;
CREATE TRIGGER avisar_destinatario_vinculado
  AFTER INSERT OR UPDATE OF receiver_user_id ON public.encomiendas
  FOR EACH ROW EXECUTE FUNCTION public.avisar_destinatario_vinculado_fn();

-- El destinatario no puede leer profiles del remitente (RLS): nombre y teléfono enmascarado.
CREATE OR REPLACE FUNCTION public.fn_remitente_de_encomienda(p_encomienda_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_nombre text; v_tel text;
BEGIN
  SELECT pr.nombre_completo, pr.telefono INTO v_nombre, v_tel
    FROM public.encomiendas e JOIN public.profiles pr ON pr.id = e.sender_id
   WHERE e.id = p_encomienda_id AND auth.uid() IN (e.sender_id, e.receiver_user_id);
  IF v_nombre IS NULL THEN RETURN NULL; END IF;
  RETURN jsonb_build_object('nombre', v_nombre,
    'telefono', CASE WHEN length(v_tel) > 4
                     THEN regexp_replace(left(v_tel, -4), '[0-9]', '•', 'g') || right(v_tel, 4) ELSE v_tel END);
END $$;

-- RIF antiguos: solo se reformatean los que ya tienen 9 dígitos (no se inventa el verificador).
WITH norm AS (
  SELECT c.id, regexp_replace(upper(c.rif), '[^A-Z0-9]', '', 'g') AS limpio FROM public.cooperativas c
), destino AS (
  SELECT id, left(limpio, 1) || '-' || substr(limpio, 2, 8) || '-' || right(limpio, 1) AS rif_nuevo
    FROM norm WHERE limpio ~ '^[JGVEPC][0-9]{9}$'
)
UPDATE public.cooperativas c SET rif = d.rif_nuevo
  FROM destino d
 WHERE c.id = d.id AND c.rif <> d.rif_nuevo
   AND NOT EXISTS (SELECT 1 FROM public.cooperativas o WHERE o.rif = d.rif_nuevo AND o.id <> c.id);
-- Pendientes de revisión en Admin:  SELECT id, nombre, rif FROM cooperativas WHERE rif !~ '^[JGVEPC]-[0-9]{8}-[0-9]$';

DO $$
DECLARE f record;
BEGIN
  FOR f IN SELECT p.oid::regprocedure AS sig FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public' AND p.proname LIKE '\_%' LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', f.sig);
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.fn_remitente_de_encomienda(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_remitente_de_encomienda(uuid) TO authenticated;

COMMIT;
```

### 2.6 `supabase/migrations/20260719000006_fase2_cierre_escrituras_directas.sql` (DIFERIDA)

```sql
-- APLICAR SOLO cuando: (1) el panel nuevo esté desplegado, (2) la app nueva sea la versión mínima,
-- y (3) `grep` confirme que ningún cliente hace .from('boletos'|'pagos').insert/update/delete.
BEGIN;
DROP POLICY IF EXISTS "Usuario compra boleto" ON public.boletos;
DROP POLICY IF EXISTS "Comprador cancela propio boleto" ON public.boletos;
DROP POLICY IF EXISTS "Taquillero actualiza boletos" ON public.boletos;
DROP POLICY IF EXISTS "Pagador inserta pago digital pendiente" ON public.pagos;
DROP POLICY IF EXISTS "Personal registra pagos de su cooperativa" ON public.pagos;
DROP POLICY IF EXISTS "Taquillero/Admin verifica pago" ON public.pagos;
REVOKE INSERT, UPDATE, DELETE ON public.boletos   FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.pagos     FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.tasas_bcv FROM anon, authenticated;
DROP TRIGGER IF EXISTS vincular_pago_legado ON public.pagos;
COMMIT;
```

---

## 3. Contratos de RPC y edge functions

### 3.1 Errores
Toda RPC falla con `{ code: 'P0001', message: 'EB_<CODIGO>', hint: '<texto para el usuario>', details: '<json>' }` (PostgREST). Los triggers de protección usan `code '42501'` y `message 'EB_OPERACION_NO_PERMITIDA'|'EB_SIN_PERMISO'`. Las transiciones inválidas conservan `'Transición no válida: X -> Y'` (ya mapeado en `EnBusApp/src/utils/errores.ts:248`).
`details` puede traer: `campo` ('referencia'|'banco'|'fecha'|'monto'|'motivo'|'peso'|'tasa'), `asientos` (text[]), `tasa`, `tasa_fecha`, `total_usd`, `total_bs`, `esperado`, `moneda`, `rechazadas` ([{id,resultado,tracking_id,ciudad_destino}]), `ultima_fecha`.

Códigos: `EB_NO_AUTENTICADO, EB_SIN_PERMISO, EB_OPERACION_NO_PERMITIDA, EB_DATOS_INVALIDOS, EB_DATOS_PAGO_INVALIDOS, EB_ASIENTO_INVALIDO, EB_ASIENTO_OCUPADO, EB_VIAJE_NO_DISPONIBLE, EB_PRECIO_NO_DEFINIDO, EB_PAGO_YA_REGISTRADO, EB_PAGO_EN_VERIFICACION, EB_PAGO_PENDIENTE_EXISTE, EB_PAGO_YA_RESUELTO, EB_METODO_INVALIDO, EB_REFERENCIA_REPETIDA, EB_TASA_NO_DISPONIBLE, EB_TASA_CAMBIO, EB_TASA_INVALIDA, EB_TASA_SOSPECHOSA, EB_MONTO_INSUFICIENTE, EB_MOTIVO_REQUERIDO, EB_NO_ENCONTRADO, EB_ESTADO_CAMBIO, EB_VIAJE_YA_SALIO, EB_EMBARQUE_NO_VALIDO, EB_BOLETOS_NO_ACTIVABLES, EB_COBRO_PENDIENTE, EB_COSTO_PENDIENTE, EB_TARIFA_NO_DISPONIBLE, EB_PESO_INVALIDO, EB_SIN_RUTA, EB_VIAJE_REQUERIDO, EB_DESPACHO_INVALIDO`.

Regla de `humanizeError` (app y panel): si `message` empieza por `EB_` → devolver el texto propio del mapa si existe; si no, el `hint`. `parseDetalleEB(err)` → `JSON.parse(details)` seguro (objeto vacío si falla).

### 3.2 RPC (todas `supabase.rpc(nombre, {params})`)

| RPC | Quién | Parámetros | Devuelve |
|---|---|---|---|
| `fn_tasa_bcv_vigente` | anon, authenticated | — | fila `{tasa, fecha, fuente, dias_antiguedad, actualizada_at}` o vacío (usar `.maybeSingle()`) |
| `fn_registrar_tasa_bcv_manual` | super admin | `p_fecha date, p_tasa numeric, p_motivo text` | `{fecha, tasa}` |
| `fn_guardar_tasa_bcv` | service_role (edge) | `p_fecha, p_tasa` | `{fecha, tasa}` |
| `fn_reservar_asientos` | user | `p_compra_id uuid, p_viaje_id uuid, p_asientos text[]` | `Resumen + {tasa_bcv, tasa_bcv_fecha, total_bs}` |
| `fn_liberar_reserva` | user | `p_compra_id` | `{liberados}` |
| `fn_checkout_boletos` | user | `p_compra_id, p_viaje_id, p_asientos text[], p_metodo_pago_id uuid, p_numero_referencia text, p_fecha_transaccion date ('YYYY-MM-DD'), p_banco_emisor text, p_monto_declarado numeric\|null, p_tasa_esperada numeric\|null, p_idempotency_key text (≥8)` | `Resumen` (+`repetido`) |
| `fn_cancelar_boleto` | user | `p_boleto_id, p_motivo` | `{estado, reembolso_usd, reembolso_bs_estimado, tasa_bcv, tasa_bcv_fecha}` |
| `fn_vender_boletos_taquilla` | staff | `p_viaje_id, p_pasajeros jsonb [{asiento,nombre,cedula,telefono}], p_metodo_tipo ('EFECTIVO'\|'PAGO_MOVIL'\|'TRANSFERENCIA_BANCARIA'\|'ZELLE'), p_metodo_pago_id\|null, p_moneda ('VES'\|'USD', solo efectivo), p_monto_recibido\|null, p_numero_referencia, p_fecha_transaccion, p_banco_emisor, p_idempotency_key` | `Resumen + {impresion:[{codigo_boleto,qr,asiento,pasajero,cedula}], salida, cobro:{moneda,esperado,recibido,vuelto,total_usd,total_bs,tasa,tasa_fecha}}` |
| `fn_cobrar_reserva_taquilla` | staff | `p_boleto_id` + mismos campos de pago que la venta | `Resumen + {cobro}` |
| `fn_validar_embarque` | staff | `p_codigo text, p_viaje_id uuid\|null` | `ResultadoEmbarque` |
| `fn_confirmar_embarque` | staff | `p_boleto_id, p_viaje_id\|null` | `ResultadoEmbarque` (resultado `USADO`) |
| `fn_registrar_pago_encomienda` | user (remitente/destinatario) | `p_encomienda_id, p_metodo_pago_id, p_numero_referencia, p_fecha_transaccion, p_banco_emisor, p_monto_declarado, p_tasa_esperada, p_idempotency_key` | `{pago_id, estado:'PENDIENTE', monto_usd, monto_bs, tasa_bcv, tasa_bcv_fecha, moneda, monto_declarado}` |
| `fn_cobrar_encomienda_taquilla` | staff | `p_encomienda_id, p_metodo_tipo, p_metodo_pago_id, p_moneda, p_monto_recibido, p_numero_referencia, p_fecha_transaccion, p_banco_emisor, p_idempotency_key` | `{pago_id, estado:'APROBADO', encomienda_estado, monto_usd, monto_bs, tasa_bcv, tasa_bcv_fecha, moneda, esperado, recibido, vuelto}` |
| `fn_aprobar_pago` | staff | `p_pago_id` | `{ok, boletos_activados?\|encomienda_id?\|ya_procesado?}` |
| `fn_rechazar_pago` | staff | `p_pago_id, p_motivo` (≥5) | `{ok, boletos_afectados}` |
| `fn_pagos_por_verificar` | staff | `p_tipo ('boleto'\|'encomienda'\|null), p_pago_id\|null` | filas `PagoPorVerificar` (ver columnas en §2.4) |
| `fn_cotizar_encomienda` | staff | `p_encomienda_id, p_peso_kg` | `{costo_usd, costo_bs, peso_max_kg, tasa_bcv, tasa_bcv_fecha}` |
| `fn_confirmar_recepcion_origen` | staff | `p_encomienda_id, p_peso_kg` | `{estado:'POR_PAGAR', costo_usd, costo_bs, tasa_bcv, tasa_bcv_fecha, modalidad_pago, repetido?}` |
| `fn_validar_encomienda_despacho` | staff | `p_codigo, p_viaje_id` | `{resultado:'OK'\|'NO_ENCONTRADA'\|'OTRO_DESTINO'\|'OTRO_ORIGEN'\|'POR_PAGAR'\|'SIN_RECIBIR'\|'YA_DESPACHADA'\|'CERRADA'\|'OTRA_COOPERATIVA', encomienda:{id,tracking_id,estado,modalidad_pago,ciudad_origen,ciudad_destino,receiver_nombre,peso_kg,costo_usd,cobro_en_destino}, viaje:{origen,destino,salida,unidad,estado}}` |
| `fn_despachar_encomiendas` | staff | `p_viaje_id, p_encomienda_ids uuid[]` | `{despachadas, cobro_en_destino}` |
| `fn_marcar_salida_viaje` | staff | `p_viaje_id` | `{estado:'EN_CURSO', reservas_liberadas, pagos_en_verificacion, ya_procesado?}` |
| `fn_remitente_de_encomienda` | user | `p_encomienda_id` | `{nombre, telefono(enmascarado)}` o `null` |

`Resumen` (jsonb): `{compra_id, server_now, viaje_id, cooperativa_id, boletos:[{id,codigo_boleto,asiento,estado,estado_ui,precio_usd,reserva_expira_at,qr_embarque_data}], total_usd, reserva_expira_at, pago:{id,estado,monto_usd,monto_bs,tasa_bcv,tasa_bcv_fecha,moneda,monto_declarado,motivo_rechazo}|null}`.

`ResultadoEmbarque`: `{resultado, dias_diferencia, boleto:{id,codigo_boleto,asiento,estado,compra_id,pasajero_nombre,pasajero_cedula,embarcado_at,updated_at,motivo_cancelacion,reserva_expira_at,precio_usd}, viaje:{id,salida,estado,unidad,origen,destino}, pago:{id,estado,tipo_pago,banco_emisor,numero_referencia,fecha_transaccion,monto_usd,monto_bs,moneda,monto_declarado,tasa_bcv,tasa_bcv_fecha,motivo_rechazo,metodo_pago_id}|null}`; `NO_ENCONTRADO`/`OTRA_COOPERATIVA` solo traen `{resultado, codigo}`.

Embeds PostgREST tras la migración 01 (hay dos relaciones boletos↔pagos): desde boletos `pago:pagos!boletos_pago_id_fkey(...)`; desde pagos `boleto:boletos!pagos_boleto_id_fkey(...)` y `boletos_compra:boletos!boletos_pago_id_fkey(...)`. Nunca `boletos(...)`/`pagos(...)` sin hint.

### 3.3 Edge functions

- **`supabase/functions/actualizar-tasa-bcv/index.ts`** (nuevo, + `deno.json` y `.npmrc` copiados de `enviar-push`): `POST`; exige `Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}` (comparación exacta; si no, 401). `fetch('https://ve.dolarapi.com/v1/dolares/oficial', { signal: AbortSignal.timeout(10000) })`; `tasa = json.promedio ?? json.precio`; `fecha` = misma regla que `fechaDeLaTasa` de la app (timestamp de medianoche → fecha literal `YYYY-MM-DD`; si no, fecha en `America/Caracas` con `Intl.DateTimeFormat('en-CA',{timeZone:'America/Caracas'})`). Llama `admin.rpc('fn_guardar_tasa_bcv', { p_fecha, p_tasa })` con cliente service role. Respuestas: 200 `{fecha, tasa}`; 422 si `EB_TASA_SOSPECHOSA` (log); 502 si dolarapi falla. Añadir en `supabase/config.toml` `[functions.actualizar-tasa-bcv]` con `verify_jwt = false` (valida el header a mano) e `import_map`/`entrypoint` como las demás.
- **`procesar-notificaciones-pendientes/index.ts`**: mantener la rama `DEVOLUCION`; añadir rama genérica `else if (notif.payload?.titulo && notif.payload?.mensaje)` → `invoke('enviar-push', { body: { user_id: notif.destinatario_id, titulo, mensaje, recurso_tipo, recurso_id, sin_bandeja: notif.payload.sin_bandeja === true } })`. Marcar `procesado=true` **solo** si el invoke no devolvió `error`.
- **`enviar-push/index.ts`**: leer `sin_bandeja` del body; si es `true`, no insertar en `notificaciones_usuario` (la RPC ya lo hizo). Resto igual.
- **`calculadora-publica/index.ts`**: añadir a la respuesta `moneda: 'USD'`, `costo_estimado_usd` (= `costo_estimado`), y si hay tasa (`rpc('fn_tasa_bcv_vigente')`) `costo_estimado_bs`, `tasa_bcv`, `tasa_bcv_fecha`.
- **`calcular-costo-encomienda/index.ts`**: sin cambio de lógica; añadir `moneda: 'USD'` a la respuesta. (El panel deja de llamarla; queda para compatibilidad.)

---

## 4. Contrato `dinero.ts` (idéntico en los tres proyectos)

Rutas: `EnBusApp/src/utils/dinero.ts`, `PanelCooperativas/src/lib/dinero.ts`, `LandingEnBus/lib/dinero.ts`.

```ts
export type TasaRef = { tasa: number; fecha: string /* 'YYYY-MM-DD' */ };
export function formatNumeroVE(n: number, decimales = 2): string; // 1250.5 -> "1.250,50" (manual, sin Intl; negativos con "-")
export function formatBs(n: number): string;                      // "Bs 1.250,00"
export function formatUsd(n: number): string;                     // "USD 12,40"
export function fechaTasaCorta(fecha: string): string;            // "2026-10-02" -> "02/10"
export function usdABs(usd: number, tasa: number): number;        // Math.round((usd*tasa + Number.EPSILON)*100)/100 (solo para mostrar)
export function formatMoney(a: { usd?: number | null; bs?: number | null; tasa?: TasaRef | null; moneda?: 'VES' | 'USD' }):
  { principal: string; secundario: string | null; accesible: string };
```
Reglas de `formatMoney`:
- `moneda === 'USD'`: principal `formatUsd(usd)`; secundario `≈ Bs X · BCV dd/mm` si hay `bs` o tasa.
- Con `bs` o (`usd` y `tasa`): principal `formatBs(bs ?? usdABs(usd, tasa.tasa))`; secundario `≈ USD 12,40 · BCV dd/mm` (USD = `usd ?? bs/tasa`; sin tasa pero con usd: `≈ USD 12,40`).
- Solo `usd` sin tasa: principal `formatUsd(usd)`; secundario `Se paga en Bs a la tasa BCV del día`.
- `accesible`: "1.250,00 bolívares, unos 12,40 dólares".
Impresión ESC/POS: no usar "≈" ni "$": "Total: Bs 1.250,00" / "Ref.: USD 12,40 BCV 02/10".

---

## 5. Partición de trabajo

Dependencias: **C0-DB** y **C0-PANEL** se hacen primero (pueden ir en paralelo entre sí). **C1-APP** solo depende de los contratos de §3/§4 (puede arrancar a la vez que C0). **C2, C3, C4** arrancan cuando C0-PANEL terminó (importan sus archivos). Ningún archivo pertenece a dos clusters. Un cluster que necesite cambiar un archivo ajeno lo pide al dueño; no lo edita.

Criterio común a todos los clusters de TS: `npx tsc --noEmit` y `npm run lint` del proyecto sin errores nuevos; ningún uso nuevo de `formatCurrency`, `currencyFormatterUSD/VES`, `currencyBs/currencyUSD`, `` `$${...}` `` ni `` `${...} Bs` `` en los archivos del cluster; ninguna referencia a `PENDIENTE_VERIFICACION`.

### C0-DB — Base de datos, edge functions y specs
Archivos propios:
- `supabase/migrations/20260719000001_fase2_base_moneda_pagos.sql` (nuevo)
- `supabase/migrations/20260719000002_fase2_asiento_unico.sql` (nuevo)
- `supabase/migrations/20260719000003_fase2_rpc_boletos.sql` (nuevo)
- `supabase/migrations/20260719000004_fase2_rpc_pagos_encomiendas.sql` (nuevo)
- `supabase/migrations/20260719000005_fase2_destinatario_rif.sql` (nuevo)
- `supabase/migrations/20260719000006_fase2_cierre_escrituras_directas.sql` (nuevo, diferida)
- `supabase/functions/actualizar-tasa-bcv/{index.ts,deno.json,.npmrc}` (nuevos)
- `supabase/functions/procesar-notificaciones-pendientes/index.ts`, `supabase/functions/enviar-push/index.ts`, `supabase/functions/calculadora-publica/index.ts`, `supabase/functions/calcular-costo-encomienda/index.ts`
- `supabase/config.toml`
- `Specs/00_General/Payments_Spec.md`, `Specs/00_General/State_Machines_Spec.md`

Tareas: copiar el SQL de §2 tal cual (#1, #2, #3, #5, #6, #14, #15, #16, pendientes); edge functions de §3.3; documentar en specs USD de referencia + Bs a tasa BCV (§4 de Payments), POR_PAGAR→EN_TRANSITO con DESTINO, ENTREGADA exige cobro, subestados de RESERVADO.
Aceptación: los 6 archivos existen con el prefijo `20260719` y son re-ejecutables (todo `IF NOT EXISTS`/`OR REPLACE`/`DROP ... IF EXISTS`); `grep -n "PENDIENTE_VERIFICACION" supabase/migrations/202607190*` vacío; si hay Docker, `supabase db reset` aplica 01–05 sin error; `deno check supabase/functions/actualizar-tasa-bcv/index.ts` pasa.

### C0-PANEL — Fundamentos compartidos del panel
Archivos propios (PanelCooperativas/src):
- `lib/dinero.ts` (nuevo, §4) · `components/monto.tsx` (nuevo: `<Monto usd? bs? tasa? moneda? size="lg|md|sm" className />`, dos líneas: principal + `text-xs text-muted-foreground`; si no recibe `tasa` usa el contexto)
- `lib/tasa-bcv.ts` (nuevo, servidor: `obtenerTasaBCV(): Promise<{tasa,fecha,fuente,diasAntiguedad}|null>` con `createClient().rpc('fn_tasa_bcv_vigente').maybeSingle()`), `components/tasa-bcv-provider.tsx` (nuevo, cliente: `TasaBCVProvider` + `useTasaBCV()`)
- `app/cooperativas/(panel)/layout.tsx` (obtiene la tasa y envuelve con el provider; chip "BCV 02/10: 100,81 Bs/USD", ámbar "Tasa BCV del 30/09 (sin actualizar)" si `diasAntiguedad >= 2`)
- `lib/errores.ts` (rama `EB_*` + `parseDetalleEB`; textos: `EB_PAGO_YA_RESUELTO` "Otro compañero ya resolvió este pago. Actualiza la lista."; `EB_TASA_NO_DISPONIBLE` "No hay tasa BCV registrada hoy. Pídele al administrador que la cargue en Tarifas."; resto: el `hint`)
- `lib/utils.ts` (`timeZone: "America/Caracas"` en los 4 `dateFormatter*`; marcar `formatCurrency`, `currencyFormatterUSD`, `currencyFormatterVES` con `/** @deprecated usar lib/dinero */` — **no borrarlos** hasta la integración)
- `lib/types/boletos.ts`, `lib/types/encomiendas.ts`, `lib/types/pagos.ts` (nuevo: `Pago`, `PagoPorVerificar`, `ResultadoEmbarque`, `ResumenCompra`, `ResultadoDespacho`, `EstadoUiBoleto`)
- `lib/navigation.ts` (ítem "Pagos por verificar" → `/cooperativas/pagos`, icono Receipt, roles taquillero y admin_cooperativa)
- `components/status-badge.tsx` (añadir `RESERVA_SIN_PAGAR`="Sin pagar", `PAGO_EN_VERIFICACION`="Pago por verificar", `PAGO_RECHAZADO`="Pago rechazado", `EXPIRADO`="Vencido"; quitar `PENDIENTE_VERIFICACION`)
- `components/pagos/verificar-pago-dialog.tsx` (nuevo) · `app/cooperativas/(panel)/pagos/actions.ts` (nuevo, `'use server'`)
- `lib/printing/print-helpers.ts`
- `app/admin/(panel)/comisiones/actions.ts` y `lib/data/admin-usuarios.ts` (**solo** el hint del embed; desplegable antes de la migración 01)

Tareas:
1. (PRE-MIGRACIÓN) `comisiones/actions.ts:116` → `boletos!pagos_boleto_id_fkey ( estado )`; `admin-usuarios.ts:140` → `boletos!pagos_boleto_id_fkey(codigo_boleto)`. Commit separado.
2. `pagos/actions.ts`: `listarPagosPorVerificar(tipo?: 'boleto'|'encomienda')` → `rpc('fn_pagos_por_verificar',{p_tipo})`; `obtenerPago(pagoId)` → `rpc('fn_pagos_por_verificar',{p_pago_id})`; `aprobarPago(pagoId)` → `rpc('fn_aprobar_pago')`; `rechazarPago(pagoId, motivo)` → `rpc('fn_rechazar_pago')`. Todas `{success, data?, error?}` con `humanizeError`, y `revalidatePath` de `/cooperativas/pagos`, `/cooperativas/taquilla/boletos`, `/cooperativas/taquilla/encomiendas`, `/cooperativas/entrega`.
3. `VerificarPagoDialog` props `{ pagoId: string; open: boolean; onOpenChange(b): void; onResuelto(r: {aprobado: boolean}): void; embebido?: boolean }`. Carga con `obtenerPago`. Muestra: "Debe aparecer en tu cuenta" `<Monto bs usd>`; comparación esperado vs declarado ("✓ El monto coincide" / "⚠ Faltan Bs 50,00" / "Sobran Bs …"; en USD si `moneda='USD'`); método y cuenta destino ("Pago Móvil a Banesco ••••4567 (titular)", "Zelle a correo"); banco emisor; referencia (mono, botón copiar); fecha; tasa usada "BCV 02/10: Bs 100,81"; cliente (nombre · cédula · rol); avisos "Esta referencia ya aparece en otro pago de tu cooperativa." y "Los boletos de este pago ya vencieron…" si `recurso_vencido`; pagos legados con `monto_bs` null: "Pago registrado antes de la conversión a Bs: referencia USD X". Botones "Rechazar…" (abre textarea "Motivo del rechazo (se le enviará al cliente)" + chips "La referencia no aparece en nuestra cuenta", "El monto recibido no coincide", "El pago llegó a otra cuenta"; botón "Rechazar y avisar al cliente") y "Aprobar pago" (autoFocus). Toasts: "Pago aprobado. El cliente ya puede usar su boleto / su envío continúa." y "Pago rechazado. Le avisamos al cliente con el motivo."
4. `print-helpers.ts`: `printBoleto(boleto: Boleto, cobro?: { monto_bs?: number|null; monto_usd: number; tasa?: number|null; tasa_fecha?: string|null; moneda?: 'VES'|'USD' })` → "Total: Bs …" + "Ref.: USD … BCV dd/mm" (sin cobro: "Precio: USD …"); `printGuiaEncomienda(encomienda: Encomienda)` → "Costo: USD …" y "Cobro: en destino"/"Cobro: en origen". Firma de `printGuiaEncomienda` sin cambios.
Aceptación: `tsc` del panel pasa; la página admin de comisiones y el detalle de usuario cargan con la migración 01 aplicada (sin error "more than one relationship"); el diálogo funciona con datos de prueba (aprobado y rechazado).

### C1-APP — EnBusApp completo (#1, #2, #3, #5, #6)
Archivos propios (EnBusApp):
- `src/utils/dinero.ts` (nuevo), `src/utils/ids.ts` (nuevo: `uuidv4()` con `crypto.getRandomValues`/`expo-crypto` si ya está instalado), `src/components/ui/Monto.tsx` (nuevo) + `src/components/ui/index.ts`
- `src/hooks/useTasaBCV.ts`, `src/hooks/useCheckoutBoletos.ts` (nuevo), `src/hooks/useEncomiendas.ts` (solo si hace falta para "Para mí")
- `src/utils/errores.ts`, `src/utils/estados.ts`, `src/utils/formatters.ts`, `src/types/index.ts`
- `src/components/PaymentFlow.tsx`, `src/components/SeatSelector.tsx`
- `app/boletos/buscar.tsx`, `app/viajes/[id].tsx`, `app/boletos/[id].tsx`, `app/(tabs)/boletos.tsx`, `app/(tabs)/encomiendas.tsx`
- `app/encomiendas/recibir/[id].tsx`, `app/encomiendas/enviar/[id].tsx`, `app/encomiendas/nueva.tsx`

Tareas:
1. (#1, M-11, APP-56, DS-05) `dinero.ts` (§4) y `<Monto usd bs tasa moneda size="lg|md|sm" align />`; `useTasaBCV` lee `supabase.rpc('fn_tasa_bcv_vigente').maybeSingle()` (no dolarapi), conserva caché 30 min y `AsyncStorage 'tasa_bcv:ultima'`; devuelve `{tasa, fecha, diasAntiguedad, loading, error, desactualizada}` (`desactualizada = error || diasAntiguedad >= 2`); eliminar `bsToUsd/formatUSD/formatBs` del hook y `currencyBs/currencyUSD` de `formatters.ts`. Sustituir todos los precios: `buscar.tsx` (528, 535 accessibilityLabel, 578, 696), `viajes/[id].tsx:248`, `SeatSelector.tsx:161,170`, `recibir/[id].tsx:178`, `enviar/[id].tsx:286`, `nueva.tsx` (tarifa referencial y estimado), reembolsos de `boletos/[id].tsx`.
2. (#2, M-19, M-21, M-25, APP-22, APP-23) `useCheckoutBoletos({viajeId})`: `compraId` (uuid creado una vez por intento de compra), `idemKey` (se conserva entre reintentos; se renueva tras éxito), `reservar(asientos)` → `fn_reservar_asientos`, `registrarPago(datos)` → `fn_checkout_boletos` con `p_tasa_esperada = reserva.tasa_bcv`, `liberar()` → `fn_liberar_reserva` (mejor esfuerzo), `enCurso` (ref anti doble toque), `offsetServidor = server_now - Date.now()`. En `buscar.tsx` y `viajes/[id].tsx`: borrar `generateBoletoCode`, `handlePaymentSuccess` e inserts directos; confirmar asientos → `reservar` (botón "Apartar asientos 14 y 15" / "Apartando…"); `EB_ASIENTO_OCUPADO` → toast "El asiento 14 acaba de ser tomado. Elige otro.", recargar ocupados, quitar solo esos asientos, quedarse en el selector; paso de pago con encabezado "Asientos 14 y 15 apartados · 29:41" (≤ 5 min: tono advertencia "Te quedan 4:59 para registrar tu pago"); éxito → `router.replace('/boletos/[id]', { id: codigo, recien: 'pago'|'reserva', cantidad })`; salir sin éxito → `liberar()`; atrás deshabilitado mientras la RPC corre. "Apartar y pagar en taquilla" = solo navegar con `recien='reserva'` (no llama a pagos). `EB_TASA_CAMBIO` → BottomSheet "La tasa BCV se actualizó. El total ahora es Bs {nuevo} (antes Bs {anterior}). Si ya transferiste el monto anterior, regístralo igual: la cooperativa verá la diferencia." [Registrar con el nuevo total] [Revisar]. Reserva vencida en pantalla → tarjeta "Se acabó el tiempo y liberamos tus asientos. Si ya pagaste, no pagues de nuevo: vuelve a elegir asientos y registra la misma referencia."
3. `PaymentFlow` props nuevas `{ cooperativaId, concepto, tipoRecurso: 'boleto'|'encomienda', cotizacion: { totalUsd, totalBs: number|null, tasa: number|null, tasaFecha: string|null }, onRegistrar(d: PagoDeclarado): Promise<void>, onEfectivo?: () => void, bloqueado?: boolean }` con `PagoDeclarado = { metodo_pago_id, numero_referencia, fecha_transaccion, banco_emisor, monto_declarado }`. Borrar step `'enviado'`, `setPayload`, `onPaymentSuccess` e insert directo (líneas ~296-325, ~365-426). Campo "Monto que pagaste" precargado (Bs, o USD en Zelle; ayuda "Ya está escrito el monto exacto. Cámbialo solo si pagaste otra cantidad."). Botón "Registrar pago"/"Registrando tu pago…" con ref anti doble toque. Error: quedarse en el formulario con los datos y marcar `details.campo`. Sin tasa: deshabilitar métodos digitales con el aviso "No pudimos obtener la tasa BCV de hoy, así que aún no podemos calcular el monto en bolívares. Intenta en unos minutos o paga en la taquilla." Efectivo: boletos "Apartar y pagar en taquilla" ("Tu asiento queda apartado 30 minutos…"); encomiendas solo tarjeta informativa sin llamadas.
4. (#3, M-27, M-28, APP-31) `estados.ts`: quitar `PENDIENTE_VERIFICACION` (mapa y etapa); `getEstadoBoletoUi(boleto)` espejo de `estado_ui_boleto`; textos: `RESERVA_SIN_PAGAR` "Sin pagar" (pending), `PAGO_EN_VERIFICACION` "Pago en verificación" (pending), `PAGO_RECHAZADO` "Pago rechazado" (danger); EXPIRADO "La reserva venció sin pago y el asiento se liberó."; `getCobroEncomienda(enc, pagos)`. `boletos/[id].tsx`: select con `compra_id, viaje_id, pago_id, pago:pagos!boletos_pago_id_fkey(id, estado_verificacion, tipo_pago, motivo_rechazo, numero_referencia, banco_emisor, monto, monto_bs, moneda, monto_declarado, tasa_bcv, tasa_bcv_fecha, created_at)`; borrar el `setBoleto(... 'EXPIRADO')` (línea 122) y el banner contradictorio; temporizador solo en SIN_PAGAR/RECHAZADO; a 0 → "Se acabó el tiempo. Estamos liberando el asiento…" y recarga cada 15 s (máx. 4); EN_VERIFICACION sin temporizador y sin "Cancelar"; "Registrar pago"/"Registrar pago de nuevo" abre PaymentFlow en BottomSheet → `fn_checkout_boletos(compra_id, viaje_id, asientos RESERVADO de la compra)`; cancelar → `fn_cancelar_boleto`; suscripción realtime a la fila. `(tabs)/boletos.tsx`: mismo embed y etiqueta por `getEstadoBoletoUi`.
5. (#5, P-29) `recibir/[id].tsx` y `enviar/[id].tsx`: borrar el update a `PENDIENTE_VERIFICACION` (recibir 214-227); cargar pagos propios de la encomienda; `debePagar` = DESTINO ∧ estado ∈ {POR_PAGAR, EN_TRANSITO, EN_OFICINA_DESTINO} ∧ costo ∧ cobro ∈ {SIN_PAGO, RECHAZADO} (en enviar: además ORIGEN∧POR_PAGAR); `onRegistrar` → `fn_registrar_pago_encomienda`; tarjetas "Pago en verificación…", "Pago rechazado — Motivo: …", "Pago confirmado"; cancelar envío sigue siendo `update({estado:'CANCELADA'})` (permitido por el trigger desde PENDIENTE_DE_ESCANEO).
6. (#6, M-50) `recibir/[id].tsx`: remitente con `rpc('fn_remitente_de_encomienda')` en vez de `profiles:sender_id(*)`; PIN: null → "Tu PIN aparecerá cuando la cooperativa reciba el paquete."; `nueva.tsx` paso 3 ayuda "Si {nombre} tiene EnBus con esa cédula o ese teléfono, verá el envío y su PIN en su app."; `(tabs)/encomiendas.tsx` estado vacío de "Para mí" con cédula/teléfono del usuario.
7. `errores.ts`: rama `EB_*` (hint por defecto) + `parseDetalleEB`; textos propios: `EB_ASIENTO_OCUPADO` "El asiento {asientos} ya no está disponible. Elige otro.", `EB_OPERACION_NO_PERMITIDA` "Esta acción la hace la cooperativa.".
Contratos consumidos: §3.2 (RPC de boletos, encomiendas, tasa, remitente), §4.
Aceptación: `grep -rn "from('pagos').insert\|from('boletos').insert\|from('boletos').update\|PENDIENTE_VERIFICACION\|dolarapi" EnBusApp/app EnBusApp/src` vacío; doble toque en "Registrar pago" produce un solo pago (idempotency); con la reserva en verificación no hay temporizador ni texto "Pendiente de pago"; ningún camino escribe EXPIRADO; los precios se ven como "Bs …" + "≈ USD … · BCV dd/mm".

### C2-PANEL-BOLETOS — Taquilla de boletos, embarque y bandeja de pagos (#2, #3, #14, #16)
Archivos propios (PanelCooperativas/src):
- `app/cooperativas/(panel)/taquilla/boletos/actions.ts`, `app/cooperativas/(panel)/taquilla/boletos/page.tsx`
- `app/cooperativas/(panel)/pagos/page.tsx` (nuevo; las actions son de C0-PANEL)
- `components/boletos/venta-flow.tsx`, `components/boletos/seat-selector.tsx`, `components/boletos/pasajeros-viaje-sheet.tsx`
- `components/scan-input.tsx`

Tareas:
1. `actions.ts`: `venderBoletos({viajeId, pasajeros[], metodoTipo, metodoPagoId?, moneda?, montoRecibido?, referencia?, fecha?, banco?, idemKey})` → `fn_vender_boletos_taquilla`; `validarEmbarque(codigo, viajeId?)` → `fn_validar_embarque`; `confirmarEmbarque(boletoId, viajeId?)` → `fn_confirmar_embarque`; `cobrarReserva({boletoId, …pago, idemKey})` → `fn_cobrar_reserva_taquilla`. Borrar `generarCodigoBoleto`, el count previo, la compensación y `verificarPagoBoleto`.
2. `seat-selector.tsx`: `id = String(num)` y etiqueta numérica (P-25, mismo formato que la app).
3. `venta-flow.tsx` (P-33): varios asientos con nombre/cédula/teléfono; pago "Cobrar Bs 3.024,00 (USD 30,00 · BCV 03/10)"; métodos Efectivo Bs, Efectivo USD, Pago Móvil, Transferencia, Zelle (cuenta de `metodos_pago_cooperativa`); efectivo con "Monto recibido" y "Vuelto"; `idemKey = crypto.randomUUID()` al abrir el flujo; imprimir con `respuesta.impresion` y `printBoleto(b, cobro)`.
4. `page.tsx`: embed `pago:pagos!boletos_pago_id_fkey(id, estado_verificacion, tipo_pago, monto, monto_bs, moneda)` (quitar `pagos!boleto_id`); estado con `StatusBadge` de `estado_ui`; pasajero de `pasajero_nombre/cedula`; precio `<Monto usd>`; "Validar pago" solo si `PAGO_EN_VERIFICACION` → `VerificarPagoDialog`; "Cobrar" si `RESERVA_SIN_PAGAR`/`PAGO_RECHAZADO`. Sección "Embarque" con selector "¿Qué bus estás embarcando?" (viajes de hoy, por defecto el próximo) y diálogos por resultado: VALIDO "Boleto válido — Sale HOY 08:00 · Valencia → Caracas · Unidad 14 / Asiento 14 · Ana Pérez · V-12.345.678" [Confirmar embarque] (autoFocus, Enter); OTRO_DIA rojo "Este boleto es para otro día — Viaje del {MAÑANA | sáb 05/10} a las 06:00. No lo embarques en este bus." (si ya pasó: "…era para el viaje del 01/10 08:00, que ya salió"); OTRO_VIAJE; PAGO_EN_VERIFICACION ámbar con `VerificarPagoDialog embebido` y, tras aprobar, re-validar y ofrecer embarque; RESERVA_SIN_PAGAR "El pasajero apartó el asiento pero no ha pagado. Vence a las 08:32." [Cobrar ahora]; PAGO_RECHAZADO "{motivo}" [Cobrar ahora]; EXPIRADO "Reserva vencida: el asiento se liberó. Si el pasajero aún quiere viajar, véndele un boleto nuevo." [Vender boleto]; CANCELADO con fecha y motivo; USADO "Este boleto ya se usó para embarcar el 03/10 a las 7:52 a. m."; VIAJE_CANCELADO; NO_ENCONTRADO; OTRA_COOPERATIVA.
5. `scan-input.tsx`: en modo `boletos` solo emite `onCodigo(code.trim().toUpperCase())` (la página resuelve con `validarEmbarque`); modo `encomiendas` **sin cambios de comportamiento** (lo usan despacho, recepción y taquilla de encomiendas).
6. `pagos/page.tsx`: título "Pagos por verificar", descripción "Pagos que los clientes registraron desde la app. Compáralos con tu banco antes de aprobar."; pestañas Todos/Boletos/Encomiendas (`?tipo=`); columnas Registrado (hace X min), Cliente, Concepto ("2 boletos · Valencia → Caracas · 04/10 08:00 · asientos 14, 15" / "Encomienda EB-… · cobro en destino"), Método, Referencia, Monto `<Monto bs usd>`, Diferencia (✓/⚠), [Verificar]; etiqueta "El viaje ya salió" si `viaje_salida < now`; vacío "No hay pagos por verificar. Cuando un cliente registre un pago desde la app, aparecerá aquí."
Contratos consumidos: C0-PANEL (`Monto`, `dinero`, `VerificarPagoDialog`, `pagos/actions`, `printBoleto`, tipos, `StatusBadge`), §3.2.
Aceptación: venta de 2 asientos en efectivo USD imprime 2 tickets y devuelve vuelto; reintento con la misma `idemKey` no duplica; un boleto de mañana escaneado hoy muestra el diálogo rojo sin botón de embarque; un boleto con pago pendiente permite verificar y embarcar en el mismo diálogo; `grep -n "from(\"boletos\").insert\|from(\"boletos\").update\|from(\"pagos\")" ` en los archivos del cluster vacío.

### C3-PANEL-ENCOMIENDAS — Recepción, cobro, despacho, salida, recepción en destino y entrega (#5, #15, pendientes)
Archivos propios (PanelCooperativas/src):
- `app/cooperativas/(panel)/taquilla/encomiendas/actions.ts`, `.../taquilla/encomiendas/page.tsx`
- `components/encomiendas/recepcion-modal.tsx`, `components/encomiendas/pago-modal.tsx`, `components/encomiendas/detalle-sheet.tsx`
- `app/cooperativas/(panel)/despacho/actions.ts`, `.../despacho/page.tsx`
- `app/cooperativas/(panel)/viajes/actions.ts`, `.../viajes/client.tsx`, `.../viajes/page.tsx`
- `app/cooperativas/(panel)/recepcion-destino/actions.ts`, `.../sucursal.ts`, `.../recepcion-lote-modal.tsx`, `.../page.tsx`
- `app/cooperativas/(panel)/entrega/actions.ts`, `.../entrega/page.tsx`, `components/entrega/entrega-modal.tsx`

Tareas:
1. Recepción en origen: `confirmarRecepcion(encomiendaId, peso)` → `fn_confirmar_recepcion_origen` (ya no recibe costo), luego guía PDF como hoy; `recepcion-modal.tsx` vista previa con `rpc('fn_cotizar_encomienda')` en lugar de `functions.invoke('calcular-costo-encomienda')`, montos con `<Monto usd bs>`; DESTINO: toast "Encomienda recibida. Se cobra al retirar en destino: ya puedes despacharla." y **no** abrir PagoModal (`taquilla/encomiendas/page.tsx:250-260`, P-28).
2. Cobro: `cobrarEncomienda({encomiendaId, metodoTipo, metodoPagoId?, moneda?, montoRecibido?, referencia?, fecha?, banco?, idemKey})` → `fn_cobrar_encomienda_taquilla`; `procesarPago` queda como envoltorio (pendiente → `aprobarPago` de C0; si no → `cobrarEncomienda`). `pago-modal.tsx` (P-33, PC-29): si hay pago `PENDIENTE` → `VerificarPagoDialog embebido`; si no, "¿Cómo pagó el cliente?" (Efectivo Bs, Efectivo USD, Pago Móvil, Transferencia, Zelle) con confirmación AlertDialog en ambas vías; quitar "$" (155, 179, 240). `detalle-sheet.tsx`: costo `<Monto>`, modalidad "Paga quien envía (en origen)" / "Paga quien recibe (en destino)", estado de cobro. Enlace "Pagos por verificar ({n})" → `/cooperativas/pagos?tipo=encomienda`.
3. Despacho (P-38, P-39, PC-32): exigir viaje antes de escanear ("Primero elige el viaje en el que vas a cargar las encomiendas."); al escanear `rpc('fn_validar_encomienda_despacho', {p_codigo, p_viaje_id})` con copy por resultado (OTRO_DESTINO "La encomienda {EB-…} va a {Maracaibo}; este viaje va a {Caracas}. No la cargues en este bus.", OTRO_ORIGEN, POR_PAGAR "…está por pagar. Cóbrala en Taquilla Encomiendas antes de despacharla.", SIN_RECIBIR, YA_DESPACHADA, CERRADA); insignia "Cobro en destino"; cambiar de viaje con lista llena pide confirmación; AlertDialog "¿Despachar {n} encomiendas? Viaje Valencia → Caracas · 08:00 · Unidad 14. {k} se cobran al retirar en destino. Pasarán a «En tránsito» y no se puede deshacer. La venta de boletos de esta salida sigue abierta." [Revisar lista] [Despachar {n}]; `despacharEncomiendas` → `fn_despachar_encomiendas` (borrar el paso 2 que pone el viaje EN_CURSO); `EB_DESPACHO_INVALIDO` marca en la lista las rechazadas de `details.rechazadas`.
4. Salida del bus: `marcarSalidaViaje(viajeId)` en `viajes/actions.ts` → `fn_marcar_salida_viaje`; botón "Marcar salida" en filas PROGRAMADO (también accesible desde despacho importando la acción de `viajes/actions.ts`); confirmación "¿El bus de Valencia → Caracas 08:00 ya salió? Se cerrará la venta de boletos de esta salida y se liberarán las reservas sin pagar. Los pagos en verificación seguirán pendientes."; éxito "Salida registrada. Se liberaron {r} reservas sin pagar. Quedan {p} pagos por verificar."; precio con `<Monto>`.
5. Recepción en destino (pendientes fase 1): `obtenerAlcance` lee `profiles.sucursal_id` con la sesión normal (borrar `createAdminClient`, `escaparLike` y la lectura de `invitaciones`); `vaASucursal` prioriza `sucursal_destino_id` y deja la ciudad como respaldo; `normalizarCiudad` añade los alias "san fernando de apure"→"san_fernando", "san juan de los morros"→"san_juan"; `recepcion-lote-modal.tsx`: listar encomiendas EN_TRANSITO de la cooperativa con `viaje:viajes!viaje_id(id, fecha_hora_salida, numero_unidad, estado, ruta:rutas!ruta_id(ciudad_origen, ciudad_destino))` agrupadas por viaje, sea cual sea el estado del viaje (antes `.eq('estado','EN_CURSO')`, línea 66).
6. Entrega: `confirmarEntrega` devuelve `humanizeError(error)` y comprueba filas con `.select('id')`; `entrega-modal.tsx`: pago `PENDIENTE` → `VerificarPagoDialog`; sin pago y DESTINO → cobrar (efectivo o digital con referencia) vía `cobrarEncomienda`; error `EB_COBRO_PENDIENTE` → "Falta cobrar el envío: Bs X (USD Y). Cóbralo antes de entregar."; quitar "$" (257, 288).
Contratos consumidos: C0-PANEL (`Monto`, `VerificarPagoDialog`, `pagos/actions`, `printGuiaEncomienda`, tipos, `StatusBadge`, `errores`), §3.2.
Aceptación: una encomienda DESTINO recibida puede despacharse sin pago y no se puede entregar hasta cobrar; un paquete de otro destino no entra a la lista; despachar no cambia `viajes.estado`; "Marcar salida" sí; un taquillero con sucursal recibe por `sucursal_destino_id` sin usar service role (`grep createAdminClient recepcion-destino/` vacío).

### C4-ADMIN-LANDING — Admin, dashboard y rutas de cooperativa, onboarding y landing (#1, pendientes)
Archivos propios:
- PanelCooperativas/src: `app/admin/(panel)/dashboard/page.tsx`, `lib/data/admin-dashboard.ts`, `lib/types/admin-dashboard.ts`, `components/admin/dashboard/*` (incluye nuevo `tasa-bcv-card.tsx`), `app/admin/(panel)/tarifas/page.tsx`, `app/admin/(panel)/tarifas/actions.ts`, `components/admin/tarifas/*`, `components/admin/comisiones/ciclos-table.tsx`, `components/admin/comisiones/generar-ciclo-dialog.tsx`, `components/admin/comisiones/export-csv-button.tsx`, `components/admin/usuarios/usuario-detail-tabs.tsx`, `components/admin/cooperativas/cooperativas-table.tsx`, `components/admin/cooperativas/cooperativa-detail-tabs.tsx`, `components/admin/incidencias/incidencia-detail.tsx`, `app/cooperativas/(panel)/dashboard/page.tsx`, `app/cooperativas/(panel)/rutas/client.tsx`, `app/cooperativas/(panel)/rutas/actions.ts`, `app/cooperativas/invite/[token]/actions.ts`, `components/landing/popular-routes.tsx`
- LandingEnBus: `lib/dinero.ts` (nuevo), `components/popular-routes.tsx`, `components/calculator-cta.tsx` (si muestra resultado), `app/page.tsx`

Tareas:
1. (P-14, PC-15, PC-46, P-51) Dashboard cooperativa: KPI ingresos con `select('monto, monto_bs')` de pagos verificados → principal Σ`coalesce(monto_bs, monto×tasa hoy)` en Bs, secundario "≈ USD Σmonto · a la tasa de cada pago"; comisión pendiente `<Monto usd tasa>` con ayuda "Se paga a EnBus en bolívares a la tasa BCV del día del pago." Rutas: label "Precio del pasaje (USD)", ayuda "Es el precio de referencia. El pasajero paga en bolívares a la tasa BCV del día (hoy ≈ {Bs})."; tabla con `<Monto usd>`; confirmación en cliente si precio > 500 ("¿Seguro que el precio está en dólares?").
2. Admin: dashboard (`ingresos_brutos_hoy` y comisiones con `formatMoney`, sumando `monto` de pagos verificados + `monto_bs`), `cooperativas-balance-table`, `ciclos-table` (líneas 118-134, 250-296) y `generar-ciclo-dialog` (282-285) con `<Monto usd tasa={hoy}>` y encabezados "Ventas (USD)" / "≈ Bs"; CSV con "(USD)"; `usuario-detail-tabs` (47-50, 303, 357, 413, 488); tarifas (`formatCurrency` → `formatUsd`, simulador con "USD"); `incidencia-detail` con "USD" explícito.
3. Tasa BCV: `tasa-bcv-card.tsx` en Admin → Tarifas (y dashboard): "Tasa BCV vigente: 100,81 Bs/USD · 02/10/2026 · fuente automática/manual · actualizada 9:30 a. m."; ámbar si `dias_antiguedad >= 2`: "La tasa no se actualiza desde el 30/09. Revisa la tarea programada o cárgala a mano."; formulario "Cargar tasa manual" (fecha, tasa, motivo) → acción `registrarTasaManual` en `tarifas/actions.ts` → `rpc('fn_registrar_tasa_bcv_manual')`. Ayuda: "Úsala solo si la tasa automática falla; la manual no se sobrescribe."
4. RIF: insignia "RIF incompleto" cuando `!isValidRif(rif)` en `cooperativas-table` y `cooperativa-detail-tabs`, tooltip "Falta el dígito verificador. Edita la cooperativa para completarlo."
5. Onboarding (pendiente fase 1): `validateInviteToken` selecciona `sucursal_id`; `completeOnboarding` usa `telefono`/`cedula_rif` = `` `PENDIENTE-${crypto.randomUUID()}` `` en `user_metadata` y hace `update({ role, cooperativa_id, sucursal_id, nombre_completo })` (service role, no lo bloquea el trigger).
6. Landing (L-07): `popular-routes.tsx` como componente de servidor que lee `supabaseAdmin.rpc('fn_tasa_bcv_vigente')`; tarjetas "Desde USD 15" + "≈ Bs 1.512,15 · BCV 02/10"; nota "Precios de referencia en dólares. Pagas en bolívares a la tasa BCV del día."; sin tasa: solo USD + nota. Revalidación de la página según la API de next 16 (leer `node_modules/next/dist/docs/` antes; no usar `unstable_cache`). Mismo cambio de copy en `PanelCooperativas/src/components/landing/popular-routes.tsx`. `calculator-cta` usa `costo_estimado_usd/_bs` si existe.
Contratos consumidos: C0-PANEL (`Monto`, `dinero`, `tasa-bcv`, tipos), §3.2 (`fn_tasa_bcv_vigente`, `fn_registrar_tasa_bcv_manual`).
Aceptación: ningún `formatCurrency` ni `$` en los archivos del cluster; super admin carga una tasa manual y el cron no la pisa; un segundo empleado invitado completa el onboarding sin error UNIQUE y queda con `profiles.sucursal_id`.

### Integración final (tras C1–C4, una sola persona)
- Borrar `formatCurrency`, `currencyFormatterUSD`, `currencyFormatterVES` de `PanelCooperativas/src/lib/utils.ts` (comprobar `grep` vacío antes).
- `grep -rn "boletos(\|pagos(" PanelCooperativas/src EnBusApp` sin embeds sin hint.
- `npx tsc --noEmit` y lint en los 3 proyectos; `npm run build` del panel y la landing.

---

## 6. Pasos manuales para el usuario

1. **Probar primero en una rama de Supabase o en staging** (no hay base local garantizada): aplicar 01→05 y recorrer: reservar → pagar → rechazar → volver a pagar; doble toque; dos compras del mismo asiento; venta en taquilla en efectivo USD; despacho con cobro en destino y entrega; registro de un usuario con cédula de un destinatario; sin tasa.
2. Desplegar el commit de C0-PANEL tarea 1 (hints de embeds) **antes** de la migración 01.
3. Antes de 02: ejecutar la consulta de solo lectura del encabezado; si hay PAGADO/USADO dobles (incluidos los que aparecen al convertir "1A"→"1"), cancelar uno con reembolso y re-ejecutar.
4. Aplicar en el SQL Editor 01, 02, 03, 04, 05 en orden; tras cada una `NOTIFY pgrst, 'reload schema';`. Revisar los `NOTICE` (índices únicos de encomienda no creados).
5. Comprobar vault: `select name from vault.decrypted_secrets where name in ('service_role_key','project_url');` (deben existir; ya los usa el cron de notificaciones).
6. `supabase functions deploy actualizar-tasa-bcv procesar-notificaciones-pendientes enviar-push calculadora-publica calcular-costo-encomienda`; invocar una vez `actualizar-tasa-bcv` (o cargar la tasa en Admin → Tarifas) y verificar `select * from fn_tasa_bcv_vigente();`.
7. Verificar cron: `select jobname, schedule, active from cron.job;` (deben estar `auto_expirar_reserva` y `actualizar_tasa_bcv`).
8. Auditar precios: `select id, ciudad_origen, ciudad_destino, precio_pasaje from rutas where precio_pasaje > 200;` y confirmar con cada cooperativa que están en USD.
9. Desplegar el panel (Vercel) y la landing; la landing ya usa `SUPABASE_SERVICE_ROLE_KEY`.
10. App: nuevo build (EAS) y publicar; configurar versión mínima / actualización obligatoria.
11. Cuando la versión vieja de la app ya no esté en uso: en la **misma sesión** del SQL Editor (o de `psql`), ejecutar primero `SET enbus.aplicar_cierre_fase2 = 'si';` y luego la 06 (sin esa variable la migración se omite con un `NOTICE` y no cambia nada); después, `NOTIFY pgrst, 'reload schema';`.

---

## 7. Riesgos

- **Tasa**: sin tasa de ≤ 4 días se bloquean checkout digital, venta y cobros (`EB_TASA_NO_DISPONIBLE`). Mitigación: carga manual, alerta en admin y chip ámbar en el panel. dolarapi no es oficial; `fechaActualizacion` puede no coincidir con la fecha de vigencia → vigilar una semana; el filtro `fecha <= hoy` evita usar la tasa de mañana; el rechazo de saltos > 25 % evita valores erróneos.
- **Datos históricos**: `pagos.monto` se asume USD; los pagos viejos no tienen `monto_bs` (los dashboards los muestran aproximados con la tasa de hoy). Si una cooperativa cargó el precio en Bs pese a la etiqueta, cobrará ~100× más: paso manual 8.
- **Migración 02** aborta con PAGADO/USADO dobles; las reservas duplicadas se liberan (si tenían pago pendiente quedan EXPIRADAS con el pago en "Pagos por verificar" para rechazarlo y devolver el dinero).
- **Reservas al elegir asientos**: aumentan las retenciones de 30 min abandonadas; mitigado con `fn_liberar_reserva` al salir y el cron cada minuto. Un pago en verificación nunca vence: si la cooperativa no actúa, el asiento queda bloqueado (la bandeja marca "El viaje ya salió").
- **Compatibilidad antes de 06**: la app vieja sigue funcionando (inserta boletos saneados y pagos digitales pendientes, vinculados por `vincular_pago_legado`); su "Pagar en efectivo" ahora falla con error de RLS (intencional). Los huecos de rol, boleto gratis y pago autoverificado se cierran ya en 01; el UPDATE directo de pagos por personal sigue abierto hasta 06.
- **Vínculo del destinatario**: cédula y teléfono no se verifican al registrarse ni al editar el perfil; alguien con datos ajenos vería envíos y PIN. Mitigación: ambiguo no vincula, UNIQUE en profiles, la entrega exige PIN. Siguiente paso: OTP de teléfono.
- **Triggers `aa_*` dependen de `current_user`**: un server action con service role los salta (intencionado); si una RPC se definiera `SECURITY INVOKER`, le aplicarían.
- **`handle_new_user` no versionado**: el trigger AFTER en profiles va envuelto en `EXCEPTION` y solo deja WARNING.
- **Concurrencia**: las RPC bloquean la fila del viaje (`FOR UPDATE`): compras del mismo viaje en serie (aceptable a esta escala).
- **PostgREST**: dos relaciones boletos↔pagos; cualquier embed nuevo sin hint falla. Las RPC `jsonb` no generan tipos: tipos manuales en `lib/types/pagos.ts` y `src/types/index.ts`.
- **SQL no ejecutado**: ningún archivo se probó contra Postgres; validar en rama/staging, sobre todo 02, los backfills de 01 y los normalizadores.
- **Next.js 16** con API distinta: leer `node_modules/next/dist/docs/` antes de usar revalidación o caché.
- **Fuera de alcance (anotado)**: `desbloquearPIN` del super admin no tiene política UPDATE; PAGADO→EXPIRADO tras el viaje; reembolsos operativos; comisiones con compras parcialmente canceladas.
