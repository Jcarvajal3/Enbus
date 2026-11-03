# Fase 3 (P1) — Especificación de implementación

Repositorio: `C:\Users\Javie\Documents\Dev\Panas Cargo` · rama `ux/mejoras-auditoria` (fases 1 y 2 aplicadas sin commit).
Alcance: plan #19–#28, #31–#42 (mejoras P1 abiertas) + pendientes de `Audits/pendientes_fase1.md` y `Audits/pendientes_fase2.md`.
Decisión de negocio vigente: **precios de referencia en USD, cobro en Bs a la tasa BCV del día** (`dinero.ts`, `<Monto>`, `fn_tasa_bcv_vigente`).

Reglas para todos los clusters: editar solo los archivos propios; nada de git commit/checkout/stash/reset; no tocar `EnBusApp/app.json` ni `.gitignore`; sin Docker, sin `supabase start`, sin `db push`/`link`/`functions deploy`/`--linked`; sin servidores de desarrollo; sin dependencias nuevas. En Next.js 16 leer `node_modules/next/dist/docs/` antes de usar APIs de servidor, caché o revalidación. Copy en español de Venezuela, con tildes, claro y accionable. Reutilizar (no duplicar) las piezas de fase 1/2: `EnBusApp/src/utils/{errores,dinero,estados,formatters,validation,ids}.ts`, `src/components/ui/*` (`Monto`, `Badge`, `Text` con `primaryText/successText/warningText/infoText/dangerText`), `src/hooks/{useTasaBCV,useWizardBack,useCheckoutBoletos}.ts`; `PanelCooperativas/src/lib/{errores,fechas,rif,dinero,tasa-bcv}.ts`, `components/{monto,status-badge,tasa-bcv-provider}.tsx`, `components/pagos/verificar-pago-dialog.tsx`; `LandingEnBus/lib/{rif,dinero}.ts`.

---

## 0. Qué está realmente pendiente (verificado en el código actual)

| # | Ya hecho en fases 1–2 | Pendiente que cubre esta fase |
|---|---|---|
| 19 Errores honestos | `boletos/[id]` (M-31), `buscar` salidas (M-12), `nueva` rutas (M-45 parcial), `enviar/recibir` con caché, `PaymentFlow` métodos | `SearchForm` traga el error de fechas y bloquea el CTA (M-10, APP-12); asientos ocupados que fallan solo dan toast y dejan continuar (APP-19); listas `(tabs)/boletos`, `(tabs)/encomiendas`, `notificaciones` sin estado de error (M-36, APP-37); costo estimado de `nueva` desaparece (M-45); "Intentar de nuevo" sin carga; `ScanInput` dice "no encontrada" sin red (PC-52); componente `ErrorState` común (DS-08). |
| 20 humanizeError | App y la mayoría del panel operativo | Admin: `solicitudes`, `comisiones`, `cooperativas`, `incidencias`, `usuarios` actions; `lib/data/admin-*.ts`; panel: `configuracion/actions.ts` + `tab-*.tsx` + `hardware/page.tsx`, `error.tsx` (panel y admin), `pin-input.tsx`, `registro/email-helper.ts`, `lib/email.ts`. |
| 21 Contraste | App completa (tokens de texto) | Panel: 54 usos de `text-primary` como texto, `--ring` amarillo invisible, `StatusBadge` blanco sobre esmeralda/azul (2,5–3,7:1); admin: `error.tsx`/`not-found.tsx` blanco sobre blanco y superficies `slate-950` fijas (AD-01), enlaces amarillos (AD-08), `text-slate-500` en login (AD-04); landing: etiquetas `#8A8A8A` 12 px, bordes ≈1,1:1, foco amarillo (LP-07). |
| 22 Estados y glosario | `EnBusApp/src/utils/estados.ts` (pasajero), `StatusBadge` del panel con 21 claves | No hay etiqueta de operador separada ni dominios (viaje, pago, cooperativa, incidencia, ciclo, reembolso); admin con mapas locales (`incidencias-table`, `usuario-detail-tabs`, `ciclos-table`) y `usuario-detail-tabs` muestra un pago RECHAZADO como "Por verificar"; nombres distintos en menú/H1 (PC-09); app: "Mis Viajes", "Mis Paquetes", "Paquetes en camino" (M-07, APP-10); no existe `Specs/00_General/Glosario.md`. |
| 23 Recuperar / Revisa tu correo | Errores traducidos | No hay pantalla de nueva contraseña; el enlace vuelve a `recuperar` (M-01, APP-06); tras registrarse solo hay un toast (M-04). |
| 24 Google / cédula | — | `signInWithOAuth` ignora la URL (M-02, APP-05); `handle_new_user` no está versionado y Google no trae cédula ni teléfono; nada pide la cédula antes de comprar (M-06). |
| 25 Varios asientos | Reserva/checkout atómicos (fase 2) con datos del comprador copiados a cada boleto | Nombre y cédula por pasajero (M-15); confirmación con todos los boletos (M-16, APP-34); **hallazgo nuevo**: la RLS de `boletos` solo deja ver los propios, así que la app nunca ve los asientos ocupados por otros (el mapa siempre sale libre). |
| 26 Pase de abordaje | Asiento y PIN en `foreground` | Dirección y punto de salida (M-33, APP-32); código corto legible (M-32, DS-09); QR en grande (APP-33). El brillo máximo necesita `expo-brightness` (dependencia nueva): queda como paso manual. |
| 27 Cancelación y reembolso | `fn_cancelar_boleto` (95 % en servidor), hoja con motivo | Dos patrones (Alert vs hoja), "Solicitar" que cancela al instante, sin estado del reembolso (M-29, M-30, APP-35); cancelar un viaje no cancela sus boletos ni avisa (P-49); el panel no tiene vista de reembolsos. |
| 28 Canal de ayuda | — | No hay WhatsApp de soporte ni "Reportar un problema"; la política RLS permite a cualquiera insertar incidencias con cualquier tipo (M-52, A-09, APP-52). |
| 31 Nueva encomienda | Tarifa referencial corregida (M-38), peso 25 kg en validación (M-39), coma decimal | "¡Todo listo!" antes de guardar (M-42, APP-39); "¿Quién paga?" tarde y con copy contradictorio (M-43, APP-42); no dice dónde entregarlo ni qué no se puede enviar (M-44); costo estimado sin error (M-45); "Peso" sin "opcional" (APP-40). **Hallazgo**: el bucket `fotos-encomiendas` es privado y solo el personal puede subir: la foto del remitente falla y las URL públicas guardadas no cargan. |
| 32 Detalle de envío/recepción | Timeline (M-47 y APP-44 hechos), PIN con fondo de marca | PIN copiable y destacado solo en `EN_OFICINA_DESTINO` (APP-45); datos contradictorios en recibir (M-51); compartir por WhatsApp (APP-46); QR con UUID en vez del código de seguimiento; una parte no ve el pago de la otra (pendiente fase 2). |
| 33 Taquilla de encomiendas | Recepción con costo en servidor, cobro digital en mostrador (P-33), DESTINO sin `PagoModal` | Alta presencial sin app (P-27); "No recibir" la encomienda (P-31; el modal ya no se cierra con `EB_SIN_RUTA` pero no ofrece salida, PC-28); foto con "Subir archivo" u "Omitir" (P-35, PC-30); foto también en DESTINO (pendiente fase 2); contador de pagos sin tiempo real. |
| 34 Entrega | Entrega en el menú, filtro por sucursal, cobro en destino bloqueante | Escaneo directo (PC-38); cédula obligatoria (PC-40); PIN validado y entrega en servidor (pendiente fase 2); PIN bloqueado sin salida (P-45, PC-41); el desbloqueo del admin no funciona (sin política UPDATE) y no hay búsqueda por guía (A-08). |
| 35 Venta en taquilla | Multi-asiento con pasajero por asiento, métodos, vuelto, `resetFlow`, pasos, `<form>`, radios (P-23, PC-22, PC-23) | Ticket sin cooperativa, ruta, salida ni unidad; `window.print()` de la página entera si el navegador bloquea la ventana (PC-24); tildes rotas en impresoras CP437/850. |
| 36 Confirmaciones | Despacho y salida del bus con `AlertDialog` | `confirm()`/`alert()` en viajes y empleados; borrar métodos y sucursales sin confirmar (P-57, PC-48); `AlertDialogAction` sin carga ni cierre (AD-05); desactivar/suspender sin motivo (AD-12); cancelar boleto con dos patrones (DS-07). |
| 37 Solicitudes | Correo con aviso de fallo (A-03) | Rechazar = `DESACTIVADA` permanente (A-01, AD-09); faltan representante, mensaje y estado de la cuenta (A-02, AD-10). |
| 38 Estado de la cooperativa | Banner solo para PENDIENTE y se puede cerrar | Aviso persistente para PENDIENTE/RECHAZADA/SUSPENDIDA/DESACTIVADA con motivo; checklist de puesta en marcha (P-08, P-15, PC-12). **Hallazgo**: la política UPDATE de `cooperativas` deja al admin de la cooperativa cambiar su `estado` y su `comision_porcentaje`. |
| 39 Un solo registro | — | Panel (cuenta inmediata) y landing (solicitud + invitación) siguen separados (P-03, LP-06). |
| 40 Invitaciones | Enlace con `token` (P-01) | Sin WhatsApp, sin vencimiento visible, sin lista de pendientes, sin reenviar ni revocar, sucursal vacía sin guía, invitación inválida sin salida (P-02, P-54, P-55, PC-05, PC-47). |
| 41 Métodos de pago | — | Formulario igual para todo tipo, sin vista previa, `Badge` como interruptor, iconos sin nombre (P-56, P-58, PC-49, PC-50). |
| 42 Landing | Precios USD + Bs (L-07), RIF normalizado (L-01, LP-05), correo con aviso (L-02) | CTA que no hacen nada (L-03, LP-01), testimonios inventados y placeholders (L-05, L-06, LP-03), rutas y cifras inventadas, tildes (LP-04), propuesta de valor sin boletos (L-08, LP-02). |

---

## 1. Decisiones

| Tema | Decisión | Motivo |
|---|---|---|
| Alta de usuarios | `handle_new_user` se versiona (migración 02): nombre de `nombre_completo`/`full_name`/`name`/correo; teléfono y cédula ausentes o ya usados → marcador único `PENDIENTE-<id>` (las funciones `normalizar_*` lo tratan como vacío). Crea el trigger solo si no existe. | Google no trae cédula ni teléfono y ambos son `UNIQUE NOT NULL`; hoy el alta con Google falla o deja datos basura. |
| Flujo de enlaces en la app | `supabase-js` con `flowType: 'pkce'`; todos los enlaces (Google, confirmar correo, recuperar) vuelven a `enbus://auth/callback?tipo=…&code=…`; la ruta `app/auth/callback.tsx` canjea el código y redirige. | Un solo punto que canjea la sesión; funciona en Expo Go y en builds. |
| Cédula antes de comprar | La app pide nombre, cédula y teléfono (`CompletarPerfilSheet`) antes de apartar asientos o generar un envío si el perfil está incompleto. El servidor exige cédula válida por pasajero en `fn_checkout_boletos` (`EB_DATOS_PASAJERO`). | M-06 con garantía en servidor. |
| Pasajero por asiento | RPC nueva `fn_asignar_pasajeros(compra, pasajeros)` entre "Asientos" y "Pago"; `fn_checkout_boletos` mantiene su firma y valida. `_asegurar_asientos` copia del perfil solo datos válidos. | Sin romper la firma de la fase 2; la app vieja sigue funcionando si el perfil está completo. |
| Asientos ocupados | `fn_asientos_ocupados(viaje)` (definer). | La RLS de boletos oculta los asientos de otros compradores. |
| Código legible | Se muestra `BOL-7CAB-E4AD` (guion tras 4 caracteres del sufijo); `fn_validar_embarque` normaliza (sin espacios ni guiones, acepta `PASS-…`). Encomiendas: el QR pasa a codificar el `tracking_id` (`EB-AAMMDD-NNNNN`), que despacho, recepción y entrega ya aceptan. | DS-09: lo que ve el pasajero es lo que acepta la taquilla. |
| Cancelación de viaje | `fn_cancelar_viaje` (solo admin de la cooperativa): exige motivo; si hay pagos en verificación devuelve `EB_PAGOS_PENDIENTES` (se resuelven antes); boletos PAGADO → CANCELADO con reembolso del **100 %**; reservas → CANCELADO; aviso a cada comprador. | P-49; la cancelación por la cooperativa no lleva penalidad. |
| Reembolsos | Bandeja `fn_reembolsos` + `fn_registrar_reembolso` (método, referencia, nota) que marca `reembolso_procesado` y avisa al pasajero. Sin tabla nueva: columnas en `boletos`. | Payments_Spec §9: la cooperativa reembolsa y EnBus lo registra. |
| Cancelación desde la app | Inmediata (libera el asiento) con copy exacto; el reembolso queda "pendiente" hasta que la cooperativa lo registre. Un solo `BottomSheet` para reserva y boleto pagado. | Lo que dice el botón es lo que pasa (APP-35). |
| Reportes | `fn_reportar_problema` (usuario, límite 5 por 24 h) crea `incidencias` tipo `REPORTE_USUARIO` con `categoria` y `boleto_id`/`encomienda_id`. El INSERT directo queda solo para super admin. | A-09, M-52; cierra la inserción libre. |
| WhatsApp de soporte | Número por variable de entorno (`EXPO_PUBLIC_SOPORTE_WHATSAPP`, `NEXT_PUBLIC_SOPORTE_WHATSAPP`); si falta, el botón no se muestra. Sin backend de WhatsApp. | Sin dependencias ni costos. |
| Alta presencial de encomienda | `fn_registrar_encomienda_taquilla(ruta, remitente, destinatario, …)`: crea, recibe y pesa en una operación (queda POR_PAGAR con costo y PIN). `sender_id` = empleado; remitente real en `remitente_*`; `origen_registro='TAQUILLA'`. Idempotente. | P-27 sin volver nullable `sender_id` (lo usan RLS, triggers y RPC). |
| No recibir | `fn_rechazar_encomienda_origen` (PENDIENTE_DE_ESCANEO / EN_RECEPCION / POR_PAGAR sin pagos) → CANCELADA con motivo y aviso; el trigger permite EN_RECEPCION → CANCELADA. | P-31, PC-28. |
| Fotos | Bucket privado: se guarda la **ruta** del objeto, se muestra con URL firmada. Foto del remitente en `foto_cliente_path` (política de storage para su carpeta); foto de la taquilla en `foto_evidencia_url`; omitir con `foto_omitida_motivo`. Foto después de recibir, en ORIGEN y DESTINO. | Hoy ninguna foto se ve y la del remitente no sube. |
| Entrega | `fn_validar_pin_retiro` (cuenta intentos sin lanzar error) + `fn_entregar_encomienda(pin, cédula verificada, tercero, motivo sin PIN)`. Entregar sin PIN solo el admin de la cooperativa, con motivo ≥ 10. `fn_desbloquear_pin` para admin de cooperativa o super admin. | Fase 2 dejó la entrega en el cliente; PC-40, P-45, A-08. |
| Pagos de encomienda | Política SELECT "Partes de la encomienda ven su cobro" (remitente y destinatario ven todos los pagos de la encomienda). | Pendiente fase 2; sin cambiar consultas de la app. |
| Cooperativa | Estado `RECHAZADA` (enum, migración aparte) reversible; columnas `motivo_estado`, `estado_cambiado_at/por`, `representante`, `mensaje_registro`; `fn_cambiar_estado_cooperativa` (super admin, transiciones válidas, motivo obligatorio para RECHAZADA/SUSPENDIDA/DESACTIVADA); `fn_solicitar_revision_cooperativa`; trigger `aa_proteger_cooperativa` (estado y comisión solo super admin; nombre/RIF solo en PENDIENTE/RECHAZADA). | #37, #38 y hueco de seguridad. |
| Registro único | El canónico es el del **panel** (cuenta inmediata, estado PENDIENTE, configura mientras se revisa). La landing explica y enlaza; conserva solo "reenviar invitación" para solicitudes antiguas. | Sin depender del correo; P-03, LP-06. |
| Landing | Rastreo y calculadora reales por server actions con `fn_rastrear_encomienda_publico` (solo service role) y `fn_cotizar_envio_publico`; rutas y cifras de la base (`fn_rutas_populares`, `fn_estadisticas_publicas`); sin testimonios ni placeholders; lo que no funcione se oculta. | L-03…L-08. |
| Columnas `*_por` nuevas | Sin FK a `profiles`. | Una FK más entre `profiles` y `cooperativas` rompe el embed `cooperativas(nombre, estado)` de `getUserProfile` (PGRST201). |
| `updated_at` de encomiendas | Tampoco lo mueven `intentos_pin`, `pin_bloqueado` ni las fotos. | Un PIN fallido retrasaba la devolución automática y los "días en oficina". |
| Brillo del QR | No se implementa (requiere `expo-brightness`). QR en pantalla completa con fondo blanco y ayuda "Sube el brillo…". | Regla: sin dependencias nuevas. Paso manual 7. |

---

## 2. Migraciones SQL (nuevas, idempotentes)

Orden: **01 → 02 → 03 → 04 → 05**, después de las de `20260719` (01–05; la 06 sigue diferida). Con el SQL Editor: ejecutar cada archivo y luego `NOTIFY pgrst, 'reload schema';`. **01 va sola** (valor de enum nuevo). Validadas en PGlite 0.4 (Postgres 17) sobre las 24 migraciones existentes: aplican sin error, se re-ejecutan sin error (dos pasadas, también con datos) y pasan las pruebas funcionales de §2.6. Runner y pruebas en el scratchpad: `…\scratchpad\pg\run3.mjs` (`node run3.mjs ./data_x full`) y `…\scratchpad\pg\t_f3.sql`, `t_f3_pol.sql`, `t_email.sql` (`node run3.mjs ./data_x test t_f3.sql`).

Notas de despliegue:
- 02 crea `on_auth_user_created` en `auth.users` solo si no hay ya un trigger que llame a `handle_new_user()`. En Supabase se ejecuta como `postgres` (permitido). Si el proyecto tenía otra versión de `handle_new_user`, esta la reemplaza (compatible: `ON CONFLICT (id) DO NOTHING`, el onboarding de empleados sigue igual).
- 02 deja de permitir `INSERT` directo en `incidencias` a usuarios: desplegar la app nueva (usa `fn_reportar_problema`); la app actual no inserta incidencias.
- 03 redefine `_resumen_compra`, `_asegurar_asientos`, `fn_checkout_boletos`, `_resultado_embarque` y `fn_validar_embarque` (mismas firmas que en 20260719000003).

### 2.1 `supabase/migrations/20260720000001_fase3_estado_rechazada.sql` — Estado RECHAZADA (va sola)

```sql
-- Fase 3 · #37: una solicitud rechazada deja de ser "baja permanente".
-- Va sola y sin BEGIN/COMMIT: un valor de enum nuevo no se puede usar en la misma
-- transacción en la que se crea. Re-ejecutable (IF NOT EXISTS).
ALTER TYPE public.estado_cooperativa ADD VALUE IF NOT EXISTS 'RECHAZADA' AFTER 'PENDIENTE';
```

### 2.2 `supabase/migrations/20260720000002_fase3_base.sql` — Base: columnas, políticas, protecciones, alta de usuarios

```sql
-- Fase 3 · Base: columnas nuevas, cobro de la encomienda visible para remitente y
-- destinatario, reportes de usuarios solo por RPC, fotos desde la app, protección de
-- cooperativas, alta de usuarios con Google y sucursales por ciudad.
-- Re-ejecutable. Compatible con la app y el panel de la fase 2.
-- Las columnas *_por nuevas NO llevan FK a profiles a propósito: una relación más entre
-- profiles y cooperativas/boletos/encomiendas vuelve ambiguos los embeds de PostgREST
-- (p. ej. `cooperativas(nombre, estado)` desde profiles en getUserProfile).
BEGIN;

-- ─── 1. Columnas ────────────────────────────────────────────────────────────
ALTER TABLE public.cooperativas
  ADD COLUMN IF NOT EXISTS representante       text,
  ADD COLUMN IF NOT EXISTS mensaje_registro    text,
  ADD COLUMN IF NOT EXISTS motivo_estado       text,
  ADD COLUMN IF NOT EXISTS estado_cambiado_at  timestamptz,
  ADD COLUMN IF NOT EXISTS estado_cambiado_por uuid;
COMMENT ON COLUMN public.cooperativas.motivo_estado IS
  'Motivo del último rechazo, suspensión o desactivación (lo ve la cooperativa en su panel). NULL si está ACTIVA o PENDIENTE.';

-- La landing guardaba "Representante: X. Mensaje: Y" en descripcion.
UPDATE public.cooperativas
   SET representante    = nullif(btrim(substring(descripcion FROM '^Representante: (.*?)(?:\. Mensaje: |$)')), ''),
       mensaje_registro = coalesce(mensaje_registro,
                                   nullif(btrim(substring(descripcion FROM '\. Mensaje: (.*)$')), ''))
 WHERE representante IS NULL AND descripcion LIKE 'Representante: %';

ALTER TABLE public.sucursales ADD COLUMN IF NOT EXISTS horario text;
COMMENT ON COLUMN public.sucursales.horario IS 'Horario de atención en texto libre, p. ej. "Lun a sáb 7:00 a. m. – 6:00 p. m.".';

ALTER TABLE public.boletos
  ADD COLUMN IF NOT EXISTS reembolso_procesado_at  timestamptz,
  ADD COLUMN IF NOT EXISTS reembolso_procesado_por uuid,
  ADD COLUMN IF NOT EXISTS reembolso_metodo        text,
  ADD COLUMN IF NOT EXISTS reembolso_referencia    text,
  ADD COLUMN IF NOT EXISTS reembolso_nota          text;

ALTER TABLE public.encomiendas
  ADD COLUMN IF NOT EXISTS origen_registro        text NOT NULL DEFAULT 'APP',
  ADD COLUMN IF NOT EXISTS remitente_nombre       text,
  ADD COLUMN IF NOT EXISTS remitente_cedula       text,
  ADD COLUMN IF NOT EXISTS remitente_telefono     text,
  ADD COLUMN IF NOT EXISTS idempotency_key        text,
  ADD COLUMN IF NOT EXISTS foto_cliente_path      text,
  ADD COLUMN IF NOT EXISTS foto_omitida_motivo    text,
  ADD COLUMN IF NOT EXISTS entregada_at           timestamptz,
  ADD COLUMN IF NOT EXISTS entregada_por          uuid,
  ADD COLUMN IF NOT EXISTS retiro_tercero         boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS retiro_nombre          text,
  ADD COLUMN IF NOT EXISTS retiro_cedula          text,
  ADD COLUMN IF NOT EXISTS entrega_sin_pin_motivo text;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_encomiendas_origen_registro') THEN
    ALTER TABLE public.encomiendas ADD CONSTRAINT chk_encomiendas_origen_registro
      CHECK (origen_registro IN ('APP', 'TAQUILLA'));
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS uq_encomiendas_idempotencia
  ON public.encomiendas (sender_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
COMMENT ON COLUMN public.encomiendas.origen_registro IS
  'APP: la creó el remitente en la app. TAQUILLA: alta presencial; sender_id es el empleado y el remitente real va en remitente_*.';
COMMENT ON COLUMN public.encomiendas.foto_evidencia_url IS
  'Foto que toma la taquilla. Ruta del objeto en el bucket privado fotos-encomiendas (se muestra con URL firmada). Filas antiguas pueden tener la URL completa.';
COMMENT ON COLUMN public.encomiendas.foto_cliente_path IS
  'Foto que subió el remitente desde la app (ruta del objeto en fotos-encomiendas, carpeta = id del usuario).';

-- ─── 2. updated_at de encomiendas: tampoco lo mueven el PIN ni las fotos ────
-- (auto_devolver_encomienda y "días en oficina" cuentan desde updated_at).
CREATE OR REPLACE FUNCTION public.encomiendas_updated_at_fn()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE c text[] := ARRAY['receiver_user_id','receiver_vinculado_por','receiver_vinculado_at',
                          'sucursal_origen_id','sucursal_destino_id','updated_at',
                          'intentos_pin','pin_bloqueado','foto_evidencia_url','foto_cliente_path',
                          'foto_omitida_motivo'];
BEGIN
  IF (to_jsonb(NEW) - c) IS DISTINCT FROM (to_jsonb(OLD) - c) THEN
    NEW.updated_at := now();
  END IF;
  RETURN NEW;
END $$;

-- Fotos del remitente que la app guardó en foto_evidencia_url (carpeta = id del remitente).
UPDATE public.encomiendas
   SET foto_cliente_path = foto_evidencia_url, foto_evidencia_url = NULL
 WHERE foto_cliente_path IS NULL AND foto_evidencia_url IS NOT NULL
   AND (foto_evidencia_url LIKE sender_id::text || '/%'
        OR foto_evidencia_url LIKE '%/fotos-encomiendas/' || sender_id::text || '/%');

ALTER TABLE public.incidencias
  ADD COLUMN IF NOT EXISTS boleto_id uuid REFERENCES public.boletos(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS categoria text;
CREATE INDEX IF NOT EXISTS idx_incidencias_reportado_por ON public.incidencias (reportado_por, created_at);

ALTER TABLE public.invitaciones ADD COLUMN IF NOT EXISTS revocada_at timestamptz;

-- ─── 3. Pagos: remitente y destinatario ven el cobro de su encomienda ───────
-- (pendiente fase 2: con "Pagador ve los suyos" una parte no veía el pago de la otra).
DROP POLICY IF EXISTS "Partes de la encomienda ven su cobro" ON public.pagos;
CREATE POLICY "Partes de la encomienda ven su cobro" ON public.pagos FOR SELECT
  USING (encomienda_id IS NOT NULL AND EXISTS (
           SELECT 1 FROM public.encomiendas e
            WHERE e.id = pagos.encomienda_id
              AND (e.sender_id = auth.uid() OR e.receiver_user_id = auth.uid())));

-- ─── 4. Incidencias: los usuarios reportan solo con fn_reportar_problema ────
DROP POLICY IF EXISTS "Cualquier usuario reporta" ON public.incidencias;
DROP POLICY IF EXISTS "Super admin registra incidencias" ON public.incidencias;
CREATE POLICY "Super admin registra incidencias" ON public.incidencias FOR INSERT
  WITH CHECK (public.is_super_admin());
DROP POLICY IF EXISTS "Usuario ve sus reportes" ON public.incidencias;
CREATE POLICY "Usuario ve sus reportes" ON public.incidencias FOR SELECT
  USING (reportado_por = auth.uid());

-- ─── 5. Fotos: el remitente sube la foto de su paquete en su carpeta ────────
DROP POLICY IF EXISTS "Usuario sube fotos de sus envios" ON storage.objects;
CREATE POLICY "Usuario sube fotos de sus envios" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'fotos-encomiendas' AND public.user_role() = 'user'
              AND (storage.foldername(name))[1] = auth.uid()::text);
DROP POLICY IF EXISTS "Usuario reemplaza fotos de sus envios" ON storage.objects;
CREATE POLICY "Usuario reemplaza fotos de sus envios" ON storage.objects FOR UPDATE
  USING (bucket_id = 'fotos-encomiendas' AND public.user_role() = 'user'
         AND (storage.foldername(name))[1] = auth.uid()::text);

-- ─── 6. Encomiendas creadas por clientes: columnas nuevas saneadas ──────────
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
    NEW.pin_retiro := NULL; NEW.intentos_pin := 0; NEW.pin_bloqueado := false; NEW.qr_data := NULL;
    NEW.viaje_id := NULL; NEW.sucursal_origen_id := NULL; NEW.sucursal_destino_id := NULL;
    NEW.receiver_user_id := NULL; NEW.receiver_vinculado_por := NULL; NEW.receiver_vinculado_at := NULL;
    -- La foto del cliente va en foto_cliente_path (la app anterior la mandaba en foto_evidencia_url).
    NEW.foto_cliente_path := coalesce(NEW.foto_cliente_path, NEW.foto_evidencia_url);
    NEW.foto_evidencia_url := NULL; NEW.foto_omitida_motivo := NULL;
    NEW.origen_registro := 'APP';
    NEW.remitente_nombre := NULL; NEW.remitente_cedula := NULL; NEW.remitente_telefono := NULL;
    NEW.entregada_at := NULL; NEW.entregada_por := NULL; NEW.retiro_tercero := false;
    NEW.retiro_nombre := NULL; NEW.retiro_cedula := NULL; NEW.entrega_sin_pin_motivo := NULL;
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

-- ─── 7. Máquina de estados de encomienda: la taquilla puede rechazar en recepción ─
CREATE OR REPLACE FUNCTION public.validar_transicion_encomienda_fn()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.estado IS DISTINCT FROM NEW.estado THEN
    IF OLD.estado IN ('ENTREGADA', 'CANCELADA', 'DEVUELTA') THEN
      RAISE EXCEPTION 'No se permite salir de un estado terminal: %', OLD.estado;
    ELSIF OLD.estado = 'PENDIENTE_DE_ESCANEO' AND NEW.estado NOT IN ('EN_RECEPCION', 'CANCELADA') THEN
      RAISE EXCEPTION 'Transición no válida: % -> %', OLD.estado, NEW.estado;
    ELSIF OLD.estado = 'EN_RECEPCION' AND NEW.estado NOT IN ('POR_PAGAR', 'CANCELADA') THEN
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

-- ─── 8. Devolución automática: sin aviso push al empleado en altas de taquilla ─
CREATE OR REPLACE FUNCTION public.auto_devolver_encomienda()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE pkg record;
BEGIN
  FOR pkg IN
    SELECT id, tracking_id, sender_id, origen_registro
      FROM public.encomiendas
     WHERE estado = 'EN_OFICINA_DESTINO'
       AND public.calcular_dias_habiles(updated_at, now()) >= 5
  LOOP
    UPDATE public.encomiendas SET estado = 'DEVUELTA' WHERE id = pkg.id;
    IF pkg.origen_registro = 'APP' THEN
      INSERT INTO public.pending_notifications (destinatario_id, recurso_tipo, recurso_id, tipo_notificacion, payload)
      VALUES (pkg.sender_id, 'encomienda', pkg.id, 'DEVOLUCION_AUTOMATICA',
              jsonb_build_object('tracking_id', pkg.tracking_id));
    END IF;
  END LOOP;
END $$;

-- ─── 9. Cooperativas: estado, comisión y calificación solo los cambia EnBus ──
CREATE OR REPLACE FUNCTION public.proteger_cooperativa_fn()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') OR coalesce(public.is_super_admin(), false) THEN
    RETURN NEW;
  END IF;
  IF (NEW.estado, NEW.comision_porcentaje, NEW.motivo_estado, NEW.estado_cambiado_at, NEW.estado_cambiado_por,
      NEW.calificacion_promedio, NEW.total_calificaciones)
     IS DISTINCT FROM
     (OLD.estado, OLD.comision_porcentaje, OLD.motivo_estado, OLD.estado_cambiado_at, OLD.estado_cambiado_por,
      OLD.calificacion_promedio, OLD.total_calificaciones) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'EB_SIN_PERMISO',
      HINT = 'El estado y la comisión de la cooperativa los cambia el equipo de EnBus.';
  END IF;
  IF (NEW.nombre, NEW.rif) IS DISTINCT FROM (OLD.nombre, OLD.rif)
     AND OLD.estado::text NOT IN ('PENDIENTE', 'RECHAZADA') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'EB_SIN_PERMISO',
      HINT = 'El nombre y el RIF solo se corrigen mientras la solicitud está en revisión. Escríbenos para cambiarlos.';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS aa_proteger_cooperativa ON public.cooperativas;
CREATE TRIGGER aa_proteger_cooperativa BEFORE UPDATE ON public.cooperativas
  FOR EACH ROW EXECUTE FUNCTION public.proteger_cooperativa_fn();

-- ─── 10. Alta de usuarios (versionada por primera vez) ──────────────────────
-- Google no manda teléfono ni cédula: se guarda un marcador único 'PENDIENTE-<id>'
-- (normalizar_cedula/telefono lo tratan como vacío) y la app los pide antes de la
-- primera compra. Si la cédula o el teléfono ya los usa otra cuenta, también se deja el
-- marcador en lugar de abortar el registro con "Database error saving new user".
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  m jsonb := coalesce(NEW.raw_user_meta_data, '{}'::jsonb);
  v_nombre text; v_tel text; v_ced text;
BEGIN
  v_nombre := coalesce(nullif(btrim(m->>'nombre_completo'), ''), nullif(btrim(m->>'full_name'), ''),
                       nullif(btrim(m->>'name'), ''), nullif(split_part(coalesce(NEW.email, ''), '@', 1), ''),
                       'Usuario EnBus');
  v_tel := nullif(btrim(m->>'telefono'), '');
  v_ced := nullif(btrim(m->>'cedula_rif'), '');
  IF v_tel IS NULL OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.telefono = v_tel) THEN
    v_tel := 'PENDIENTE-' || NEW.id::text;
  END IF;
  IF v_ced IS NULL OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.cedula_rif = v_ced) THEN
    v_ced := 'PENDIENTE-' || NEW.id::text;
  END IF;
  INSERT INTO public.profiles (id, role, nombre_completo, telefono, cedula_rif)
  VALUES (NEW.id, 'user', v_nombre, v_tel, v_ced)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger t
                  WHERE t.tgrelid = 'auth.users'::regclass AND NOT t.tgisinternal
                    AND t.tgfoid = 'public.handle_new_user()'::regprocedure) THEN
    CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
      FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
  END IF;
END $$;

-- ─── 11. Sucursales de una cooperativa en una ciudad (pase, entrega y envío) ─
CREATE OR REPLACE FUNCTION public.fn_sucursales_en_ciudad(p_cooperativa_id uuid, p_ciudad text)
RETURNS TABLE (id uuid, nombre text, direccion text, telefono text, horario text,
               ciudad text, estado_geografico text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT s.id, s.nombre, s.direccion, s.telefono, s.horario, s.ciudad, s.estado_geografico
    FROM public.sucursales s
   WHERE s.cooperativa_id = p_cooperativa_id AND s.activa
     AND public.normalizar_localidad(s.ciudad) = public.normalizar_localidad(p_ciudad)
   ORDER BY s.nombre;
$$;
REVOKE ALL ON FUNCTION public.fn_sucursales_en_ciudad(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_sucursales_en_ciudad(uuid, text) TO authenticated;

COMMIT;
```

### 2.3 `supabase/migrations/20260720000003_fase3_rpc_boletos.sql` — RPC de boletos, embarque, viaje cancelado y reembolsos

```sql
-- Fase 3 · Boletos: pasajero por asiento (#25), asientos ocupados visibles (#25),
-- código corto legible en el embarque (#26), OTRO_DIA antes que OTRO_VIAJE (pendiente fase 2),
-- cancelación de viaje con reembolso y bandeja de reembolsos (#27).
-- Requiere 20260719000003 y 20260720000002. Re-ejecutable.
BEGIN;

-- "05/10 a las 8:30 a. m." (hora de Venezuela), para los avisos.
CREATE OR REPLACE FUNCTION public._fecha_hora_ve(p timestamptz)
RETURNS text LANGUAGE sql STABLE SET search_path = public, pg_temp AS $$
  SELECT to_char(p AT TIME ZONE 'America/Caracas', 'DD/MM') || ' a las '
         || ltrim(to_char(p AT TIME ZONE 'America/Caracas', 'HH12:MI'), '0')
         || CASE WHEN extract(hour FROM p AT TIME ZONE 'America/Caracas') < 12 THEN ' a. m.' ELSE ' p. m.' END;
$$;

-- Resumen de compra: ahora con el pasajero de cada boleto (cambio aditivo).
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
                 'qr_embarque_data', v.qr_embarque_data,
                 'pasajero_nombre', v.pasajero_nombre, 'pasajero_cedula', v.pasajero_cedula,
                 'pasajero_telefono', v.pasajero_telefono)
               ORDER BY length(v.asiento), v.asiento) FROM vivos v), '[]'::jsonb),
    'total_usd', (SELECT sum(precio) FROM vivos),
    'reserva_expira_at', (SELECT min(reserva_expira_at) FROM vivos WHERE estado = 'RESERVADO'),
    'pago', (SELECT jsonb_build_object('id', u.id, 'estado', u.estado_verificacion, 'monto_usd', u.monto,
                    'monto_bs', u.monto_bs, 'tasa_bcv', u.tasa_bcv, 'tasa_bcv_fecha', u.tasa_bcv_fecha,
                    'moneda', u.moneda, 'monto_declarado', u.monto_declarado,
                    'motivo_rechazo', u.motivo_rechazo) FROM ult u)
  );
$$;

-- Apartar asientos: igual que en la fase 2, pero solo copia del perfil datos válidos
-- (un perfil de Google tiene cédula 'PENDIENTE-…': el boleto queda sin cédula hasta asignarla).
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
      'Ya registraste un pago para esta compra. Revisa tus boletos en Mis boletos.');
  END IF;

  UPDATE public.boletos
     SET estado = 'CANCELADO', motivo_cancelacion = 'Asiento cambiado por el pasajero antes de pagar'
   WHERE compra_id = p_compra_id AND estado = 'RESERVADO' AND NOT (asiento = ANY (v_asientos));

  v_expira := least(now() + interval '30 minutes', v_viaje.fecha_hora_salida);
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

  SELECT nullif(btrim(nombre_completo), ''),
         CASE WHEN public.normalizar_cedula(cedula_rif) IS NOT NULL THEN cedula_rif END,
         CASE WHEN public.normalizar_telefono(telefono) IS NOT NULL THEN telefono END
    INTO v_nombre, v_cedula, v_tel
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

-- App: asientos ocupados de una salida (la RLS de boletos solo deja ver los propios).
CREATE OR REPLACE FUNCTION public.fn_asientos_ocupados(p_viaje_id uuid)
RETURNS text[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT coalesce(array_agg(b.asiento ORDER BY length(b.asiento), b.asiento), '{}'::text[])
    FROM public.boletos b
   WHERE b.viaje_id = p_viaje_id AND b.estado IN ('RESERVADO', 'PAGADO', 'USADO');
$$;

-- App: nombre y cédula de quien viaja en cada asiento apartado (#25).
-- p_pasajeros: [{"asiento":"14","nombre":"Ana Pérez","cedula":"V-12345678","telefono":"0414-1234567"}]
CREATE OR REPLACE FUNCTION public.fn_asignar_pasajeros(p_compra_id uuid, p_pasajeros jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_uid uuid := public._uid_usuario(); v_malos text[]; v_ajenos text[]; v_faltan text[]; v_n integer;
BEGIN
  IF jsonb_typeof(p_pasajeros) IS DISTINCT FROM 'array' OR jsonb_array_length(p_pasajeros) = 0 THEN
    PERFORM public._fallar('EB_DATOS_PASAJERO', 'Escribe el nombre y la cédula de cada pasajero.', '{"campo":"pasajeros"}');
  END IF;
  IF EXISTS (SELECT 1 FROM public.boletos WHERE compra_id = p_compra_id AND comprador_id IS DISTINCT FROM v_uid) THEN
    PERFORM public._fallar('EB_SIN_PERMISO', 'Esta compra no te pertenece.');
  END IF;
  PERFORM 1 FROM public.boletos WHERE compra_id = p_compra_id AND estado = 'RESERVADO' FOR UPDATE;
  IF NOT FOUND THEN
    PERFORM public._fallar('EB_ESTADO_CAMBIO', 'Tus asientos ya no están apartados. Vuelve a elegirlos.');
  END IF;
  SELECT array_agg(coalesce(nullif(btrim(x.asiento), ''), '?')) INTO v_malos
    FROM jsonb_to_recordset(p_pasajeros) AS x(asiento text, nombre text, cedula text, telefono text)
   WHERE length(coalesce(btrim(x.nombre), '')) < 3
      OR public.normalizar_cedula(x.cedula) IS NULL
      OR (nullif(btrim(x.telefono), '') IS NOT NULL AND public.normalizar_telefono(x.telefono) IS NULL);
  IF v_malos IS NOT NULL THEN
    PERFORM public._fallar('EB_DATOS_PASAJERO',
      format('Revisa el nombre y la cédula del pasajero del asiento %s.', array_to_string(v_malos, ', ')),
      jsonb_build_object('campo', 'pasajeros', 'asientos', v_malos));
  END IF;
  SELECT array_agg(btrim(x.asiento)) INTO v_ajenos
    FROM jsonb_to_recordset(p_pasajeros) AS x(asiento text)
   WHERE NOT EXISTS (SELECT 1 FROM public.boletos b WHERE b.compra_id = p_compra_id
                       AND b.estado = 'RESERVADO' AND b.asiento = btrim(x.asiento));
  IF v_ajenos IS NOT NULL THEN
    PERFORM public._fallar('EB_ESTADO_CAMBIO',
      format('El asiento %s ya no está apartado en esta compra. Vuelve a elegir tus asientos.', array_to_string(v_ajenos, ', ')),
      jsonb_build_object('asientos', v_ajenos));
  END IF;
  UPDATE public.boletos b
     SET pasajero_nombre = btrim(x.nombre), pasajero_cedula = btrim(x.cedula),
         pasajero_telefono = nullif(btrim(x.telefono), '')
    FROM jsonb_to_recordset(p_pasajeros) AS x(asiento text, nombre text, cedula text, telefono text)
   WHERE b.compra_id = p_compra_id AND b.estado = 'RESERVADO' AND b.asiento = btrim(x.asiento);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  SELECT array_agg(b.asiento ORDER BY length(b.asiento), b.asiento) INTO v_faltan
    FROM public.boletos b
   WHERE b.compra_id = p_compra_id AND b.estado = 'RESERVADO'
     AND (length(coalesce(btrim(b.pasajero_nombre), '')) < 3 OR public.normalizar_cedula(b.pasajero_cedula) IS NULL);
  RETURN public._resumen_compra(p_compra_id)
         || jsonb_build_object('actualizados', v_n, 'asientos_sin_datos', coalesce(to_jsonb(v_faltan), '[]'::jsonb));
END $$;

-- Checkout: igual que en la fase 2 + exige nombre y cédula válidos en cada asiento (#25, M-06).
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
  v_coop uuid; v_primer uuid; v_pago_id uuid; v_sin_datos text[];
BEGIN
  IF coalesce(length(p_idempotency_key), 0) < 8 THEN
    PERFORM public._fallar('EB_DATOS_INVALIDOS', 'Falta la clave de la operación. Actualiza la app e intenta de nuevo.');
  END IF;
  PERFORM 1 FROM public.viajes WHERE id = p_viaje_id FOR UPDATE;
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

  SELECT array_agg(asiento ORDER BY length(asiento), asiento) INTO v_sin_datos
    FROM public.boletos
   WHERE compra_id = p_compra_id AND estado = 'RESERVADO'
     AND (length(coalesce(btrim(pasajero_nombre), '')) < 3 OR public.normalizar_cedula(pasajero_cedula) IS NULL);
  IF v_sin_datos IS NOT NULL THEN
    PERFORM public._fallar('EB_DATOS_PASAJERO',
      format('Falta el nombre o la cédula del pasajero del asiento %s.', array_to_string(v_sin_datos, ', ')),
      jsonb_build_object('campo', 'pasajeros', 'asientos', v_sin_datos));
  END IF;

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

-- Embarque: OTRO_DIA tiene prioridad sobre OTRO_VIAJE (pendiente fase 2: es la causa más útil).
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
    WHEN v_dia <> v_hoy                                      THEN 'OTRO_DIA'
    WHEN p_viaje_id IS NOT NULL AND r.viaje_id <> p_viaje_id THEN 'OTRO_VIAJE'
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

-- Código legible: "BOL-7KQ2-M9XA", "bol 7kq2 m9xa" o el QR "PASS-BOL-…" encuentran el mismo boleto (#26, DS-09).
CREATE INDEX IF NOT EXISTS idx_boletos_codigo_norm
  ON public.boletos (regexp_replace(upper(codigo_boleto), '[^A-Z0-9]', '', 'g'));

CREATE OR REPLACE FUNCTION public.fn_validar_embarque(p_codigo text, p_viaje_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_ctx record; v_code text := upper(btrim(coalesce(p_codigo, ''))); v_norm text; v_id uuid; v_coop uuid;
BEGIN
  SELECT * INTO v_ctx FROM public._contexto_staff();
  v_norm := regexp_replace(v_code, '[^A-Z0-9]', '', 'g');
  IF v_norm LIKE 'PASS%' THEN v_norm := substr(v_norm, 5); END IF;
  SELECT b.id, b.cooperativa_id INTO v_id, v_coop
    FROM public.boletos b
   WHERE b.codigo_boleto = v_code OR upper(b.qr_embarque_data) = v_code OR 'PASS-' || b.codigo_boleto = v_code
      OR (length(v_norm) >= 8 AND regexp_replace(upper(b.codigo_boleto), '[^A-Z0-9]', '', 'g') = v_norm)
   ORDER BY (b.cooperativa_id = v_ctx.o_cooperativa_id) DESC, b.created_at DESC
   LIMIT 1;
  IF v_id IS NULL THEN RETURN jsonb_build_object('resultado', 'NO_ENCONTRADO', 'codigo', v_code); END IF;
  IF v_coop <> v_ctx.o_cooperativa_id THEN RETURN jsonb_build_object('resultado', 'OTRA_COOPERATIVA', 'codigo', v_code); END IF;
  RETURN public._resultado_embarque(v_id, p_viaje_id);
END $$;

-- Cancelar un viaje (admin de la cooperativa): reembolso del 100 % de los boletos pagados (#27, P-49).
CREATE OR REPLACE FUNCTION public.fn_cancelar_viaje(p_viaje_id uuid, p_motivo text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_ctx record; v_v record; v_motivo text := left(btrim(coalesce(p_motivo, '')), 300);
  v_pendientes integer; v_pagados integer; v_reservas integer; v_total numeric; v_enc integer;
  v_ruta text; v_salida text; r record;
BEGIN
  SELECT * INTO v_ctx FROM public._contexto_staff();
  IF v_ctx.o_rol <> 'admin_cooperativa' THEN
    PERFORM public._fallar('EB_SIN_PERMISO', 'Solo el administrador de la cooperativa puede cancelar viajes.');
  END IF;
  SELECT v.id, v.cooperativa_id, v.estado, v.fecha_hora_salida, ru.ciudad_origen, ru.ciudad_destino INTO v_v
    FROM public.viajes v JOIN public.rutas ru ON ru.id = v.ruta_id
   WHERE v.id = p_viaje_id FOR UPDATE OF v;
  IF NOT FOUND OR v_v.cooperativa_id <> v_ctx.o_cooperativa_id THEN
    PERFORM public._fallar('EB_NO_ENCONTRADO', 'No encontramos ese viaje en tu cooperativa.');
  END IF;
  IF v_v.estado = 'CANCELADO' THEN
    RETURN jsonb_build_object('estado', 'CANCELADO', 'ya_procesado', true);
  END IF;
  IF v_v.estado <> 'PROGRAMADO' THEN
    PERFORM public._fallar('EB_ESTADO_CAMBIO', 'Solo se puede cancelar un viaje que todavía no ha salido.');
  END IF;
  IF length(v_motivo) < 5 THEN
    PERFORM public._fallar('EB_MOTIVO_REQUERIDO',
      'Escribe el motivo de la cancelación (se lo enviaremos a los pasajeros).', '{"campo":"motivo"}');
  END IF;
  PERFORM 1 FROM public.boletos WHERE viaje_id = p_viaje_id FOR UPDATE;
  SELECT count(*) INTO v_pendientes
    FROM public.boletos b JOIN public.pagos p ON p.id = b.pago_id
   WHERE b.viaje_id = p_viaje_id AND b.estado = 'RESERVADO' AND p.estado_verificacion = 'PENDIENTE';
  IF v_pendientes > 0 THEN
    PERFORM public._fallar('EB_PAGOS_PENDIENTES',
      format('Hay %s pago(s) por verificar en este viaje. Apruébalos o recházalos en «Pagos por verificar» y vuelve a cancelarlo.', v_pendientes),
      jsonb_build_object('pendientes', v_pendientes));
  END IF;

  v_ruta := initcap(replace(v_v.ciudad_origen, '_', ' ')) || ' → ' || initcap(replace(v_v.ciudad_destino, '_', ' '));
  v_salida := public._fecha_hora_ve(v_v.fecha_hora_salida);

  -- Avisos (antes de cambiar los estados): un aviso por comprador.
  FOR r IN
    SELECT b.comprador_id, (array_agg(b.id ORDER BY length(b.asiento), b.asiento))[1] AS boleto_id,
           bool_or(b.estado = 'PAGADO') AS pagado, sum(b.precio) FILTER (WHERE b.estado = 'PAGADO') AS total
      FROM public.boletos b
     WHERE b.viaje_id = p_viaje_id AND b.estado IN ('PAGADO', 'RESERVADO') AND b.comprador_id IS NOT NULL
     GROUP BY b.comprador_id
  LOOP
    PERFORM public._notificar_usuario(r.comprador_id, 'VIAJE_CANCELADO', 'Tu viaje fue cancelado',
      CASE WHEN r.pagado THEN
        format('La cooperativa canceló el viaje %s del %s: %s. Te devolverá el 100 %% de tu pasaje (USD %s) en bolívares a la tasa BCV del día, por el mismo medio de pago.',
               v_ruta, v_salida, v_motivo, replace(to_char(r.total, 'FM999999990.00'), '.', ','))
      ELSE
        format('La cooperativa canceló el viaje %s del %s: %s. Tu reserva quedó anulada; no tienes que pagar nada.',
               v_ruta, v_salida, v_motivo)
      END, 'boleto', r.boleto_id);
  END LOOP;

  UPDATE public.viajes SET estado = 'CANCELADO' WHERE id = p_viaje_id;
  SELECT coalesce(sum(precio), 0) INTO v_total FROM public.boletos WHERE viaje_id = p_viaje_id AND estado = 'PAGADO';
  UPDATE public.boletos
     SET estado = 'CANCELADO', monto_reembolso = precio,
         motivo_cancelacion = 'Viaje cancelado por la cooperativa: ' || v_motivo
   WHERE viaje_id = p_viaje_id AND estado = 'PAGADO';
  GET DIAGNOSTICS v_pagados = ROW_COUNT;
  UPDATE public.boletos
     SET estado = 'CANCELADO', motivo_cancelacion = 'Viaje cancelado por la cooperativa: ' || v_motivo
   WHERE viaje_id = p_viaje_id AND estado = 'RESERVADO';
  GET DIAGNOSTICS v_reservas = ROW_COUNT;
  SELECT count(*) INTO v_enc FROM public.encomiendas WHERE viaje_id = p_viaje_id AND estado = 'EN_TRANSITO';

  RETURN jsonb_build_object('estado', 'CANCELADO', 'boletos_reembolso', v_pagados, 'reservas_anuladas', v_reservas,
                            'total_reembolso_usd', v_total, 'encomiendas_en_transito', v_enc);
END $$;

-- Bandeja de reembolsos de la cooperativa (#27, P-49). p_estado: 'PENDIENTE' | 'PROCESADO' | 'TODOS'.
CREATE OR REPLACE FUNCTION public.fn_reembolsos(p_estado text DEFAULT 'PENDIENTE')
RETURNS TABLE (
  boleto_id uuid, codigo_boleto text, compra_id uuid, asiento text,
  pasajero_nombre text, pasajero_cedula text, contacto_nombre text, contacto_telefono text,
  viaje_salida timestamptz, ruta text, cancelado_at timestamptz, motivo_cancelacion text, cancelado_por text,
  monto_usd numeric, pago_id uuid, pago_metodo text, pago_banco_emisor text, pago_referencia text,
  pago_moneda text, pago_estado text,
  procesado boolean, procesado_at timestamptz, reembolso_metodo text, reembolso_referencia text, reembolso_nota text
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
#variable_conflict use_column
DECLARE v_ctx record;
BEGIN
  SELECT * INTO v_ctx FROM public._contexto_staff();
  RETURN QUERY
  SELECT b.id, b.codigo_boleto, b.compra_id, b.asiento,
         b.pasajero_nombre, b.pasajero_cedula,
         coalesce(pr.nombre_completo, b.pasajero_nombre),
         coalesce(CASE WHEN public.normalizar_telefono(pr.telefono) IS NOT NULL THEN pr.telefono END, b.pasajero_telefono),
         v.fecha_hora_salida, ru.ciudad_origen || ' → ' || ru.ciudad_destino,
         b.updated_at, b.motivo_cancelacion,
         CASE WHEN b.motivo_cancelacion LIKE 'Viaje cancelado por la cooperativa%' THEN 'COOPERATIVA' ELSE 'PASAJERO' END,
         b.monto_reembolso::numeric, p.id,
         coalesce(m.tipo::text, p.tipo_pago::text), p.banco_emisor, p.numero_referencia, p.moneda, p.estado_verificacion,
         b.reembolso_procesado, b.reembolso_procesado_at, b.reembolso_metodo, b.reembolso_referencia, b.reembolso_nota
    FROM public.boletos b
    JOIN public.viajes v ON v.id = b.viaje_id
    JOIN public.rutas ru ON ru.id = v.ruta_id
    LEFT JOIN public.profiles pr ON pr.id = b.comprador_id
    LEFT JOIN public.pagos p ON p.id = b.pago_id
    LEFT JOIN public.metodos_pago_cooperativa m ON m.id = p.metodo_pago_id
   WHERE b.cooperativa_id = v_ctx.o_cooperativa_id
     AND b.estado = 'CANCELADO' AND coalesce(b.monto_reembolso, 0) > 0
     AND (coalesce(p_estado, 'PENDIENTE') = 'TODOS'
          OR (coalesce(p_estado, 'PENDIENTE') = 'PENDIENTE' AND NOT b.reembolso_procesado)
          OR (p_estado = 'PROCESADO' AND b.reembolso_procesado))
   ORDER BY b.reembolso_procesado, b.updated_at;
END $$;

-- Registrar que la cooperativa ya devolvió el dinero (uno o varios boletos de una misma compra).
CREATE OR REPLACE FUNCTION public.fn_registrar_reembolso(p_boleto_ids uuid[], p_metodo text,
                                                         p_referencia text, p_nota text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_ctx record; v_ids uuid[]; v_ref text := nullif(btrim(coalesce(p_referencia, '')), '');
  v_n integer; v_ya integer; r record;
BEGIN
  SELECT * INTO v_ctx FROM public._contexto_staff();
  SELECT array_agg(DISTINCT x) INTO v_ids FROM unnest(p_boleto_ids) x WHERE x IS NOT NULL;
  IF v_ids IS NULL THEN
    PERFORM public._fallar('EB_DATOS_INVALIDOS', 'Elige al menos un boleto.');
  END IF;
  IF p_metodo IS NULL OR p_metodo NOT IN ('PAGO_MOVIL', 'TRANSFERENCIA_BANCARIA', 'ZELLE', 'EFECTIVO') THEN
    PERFORM public._fallar('EB_DATOS_INVALIDOS', 'Elige cómo devolviste el dinero.', '{"campo":"metodo"}');
  END IF;
  IF p_metodo <> 'EFECTIVO' AND (v_ref IS NULL OR length(regexp_replace(v_ref, '[^A-Za-z0-9]', '', 'g')) < 4) THEN
    PERFORM public._fallar('EB_DATOS_PAGO_INVALIDOS', 'Escribe la referencia de la devolución (mínimo 4 caracteres).',
                           '{"campo":"referencia"}');
  END IF;
  PERFORM 1 FROM public.boletos WHERE id = ANY (v_ids) ORDER BY id FOR UPDATE;
  IF EXISTS (SELECT 1 FROM unnest(v_ids) i LEFT JOIN public.boletos b ON b.id = i
              WHERE b.id IS NULL OR b.cooperativa_id <> v_ctx.o_cooperativa_id
                 OR b.estado <> 'CANCELADO' OR coalesce(b.monto_reembolso, 0) <= 0) THEN
    PERFORM public._fallar('EB_NO_ENCONTRADO', 'Uno de los boletos no tiene un reembolso pendiente en tu cooperativa. Actualiza la lista.');
  END IF;
  SELECT count(*) INTO v_ya FROM public.boletos WHERE id = ANY (v_ids) AND reembolso_procesado;

  FOR r IN
    SELECT b.comprador_id, (array_agg(b.id ORDER BY length(b.asiento), b.asiento))[1] AS boleto_id,
           string_agg(b.codigo_boleto, ', ' ORDER BY length(b.asiento), b.asiento) AS codigos,
           sum(b.monto_reembolso) AS total
      FROM public.boletos b
     WHERE b.id = ANY (v_ids) AND NOT b.reembolso_procesado AND b.comprador_id IS NOT NULL
     GROUP BY b.comprador_id
  LOOP
    PERFORM public._notificar_usuario(r.comprador_id, 'REEMBOLSO_ENVIADO', 'Te devolvimos tu dinero',
      format('La cooperativa registró la devolución de USD %s por %s%s. Si no la ves en 24 horas, escríbele a la cooperativa.',
             replace(to_char(r.total, 'FM999999990.00'), '.', ','), r.codigos,
             CASE WHEN v_ref IS NOT NULL THEN ' (ref. ' || v_ref || ')' ELSE '' END),
      'boleto', r.boleto_id);
  END LOOP;

  UPDATE public.boletos
     SET reembolso_procesado = true, reembolso_procesado_at = now(), reembolso_procesado_por = v_ctx.o_uid,
         reembolso_metodo = p_metodo, reembolso_referencia = v_ref,
         reembolso_nota = nullif(left(btrim(coalesce(p_nota, '')), 300), '')
   WHERE id = ANY (v_ids) AND NOT reembolso_procesado;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN jsonb_build_object('procesados', v_n, 'ya_procesados', v_ya);
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
              'fn_asientos_ocupados', 'fn_asignar_pasajeros', 'fn_checkout_boletos', 'fn_validar_embarque',
              'fn_cancelar_viaje', 'fn_reembolsos', 'fn_registrar_reembolso') LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', f.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', f.sig);
  END LOOP;
END $$;

COMMIT;
```

### 2.4 `supabase/migrations/20260720000004_fase3_rpc_encomiendas.sql` — RPC de encomiendas, entrega y consultas públicas

```sql
-- Fase 3 · Encomiendas: alta presencial en taquilla (#33, P-27), rechazo en recepción
-- (P-31), PIN validado y entrega en servidor con cédula verificada (#34, pendiente fase 2),
-- desbloqueo del PIN (A-08, P-45), cotización y rastreo públicos, rutas populares (#31, #42).
-- Requiere 20260719000004 y 20260720000002. Re-ejecutable.
BEGIN;

-- ─── 1. Taquilla: alta presencial (cliente sin la app) ──────────────────────
-- Crea, recibe y pesa en una sola operación: la encomienda queda POR_PAGAR con su costo
-- y su PIN. sender_id = empleado que la registra; el remitente real va en remitente_*.
-- p_remitente / p_destinatario: {"nombre":"Ana Pérez","cedula":"V-12345678","telefono":"0414-1234567"}
CREATE OR REPLACE FUNCTION public.fn_registrar_encomienda_taquilla(
  p_ruta_id uuid, p_remitente jsonb, p_destinatario jsonb, p_descripcion text,
  p_valor_declarado numeric, p_modalidad_pago public.modalidad_pago, p_peso_kg numeric,
  p_idempotency_key text, p_sucursal_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_ctx record; v_suc record; v_ruta record; v_e record; v_id uuid;
  v_costo numeric; v_max numeric; v_tasa numeric; v_fecha date;
  v_rn text := btrim(coalesce(p_remitente->>'nombre', ''));
  v_rc text := btrim(coalesce(p_remitente->>'cedula', ''));
  v_rt text := btrim(coalesce(p_remitente->>'telefono', ''));
  v_dn text := btrim(coalesce(p_destinatario->>'nombre', ''));
  v_dc text := btrim(coalesce(p_destinatario->>'cedula', ''));
  v_dt text := btrim(coalesce(p_destinatario->>'telefono', ''));
BEGIN
  SELECT * INTO v_ctx FROM public._contexto_staff();
  IF coalesce(length(p_idempotency_key), 0) < 8 THEN
    PERFORM public._fallar('EB_DATOS_INVALIDOS', 'Falta la clave de la operación. Recarga la página.');
  END IF;
  SELECT * INTO v_e FROM public.encomiendas WHERE sender_id = v_ctx.o_uid AND idempotency_key = p_idempotency_key;
  IF FOUND THEN
    RETURN jsonb_build_object('encomienda_id', v_e.id, 'tracking_id', v_e.tracking_id, 'estado', v_e.estado,
      'costo_usd', v_e.costo_calculado, 'modalidad_pago', v_e.modalidad_pago, 'pin_retiro', v_e.pin_retiro,
      'repetido', true);
  END IF;

  SELECT s.id, s.ciudad INTO v_suc FROM public.sucursales s
   WHERE s.id = coalesce(p_sucursal_id, v_ctx.o_sucursal_id)
     AND s.cooperativa_id = v_ctx.o_cooperativa_id AND s.activa;
  IF NOT FOUND THEN
    PERFORM public._fallar('EB_SUCURSAL_REQUERIDA', 'Elige la sucursal en la que recibes la encomienda.', '{"campo":"sucursal"}');
  END IF;
  SELECT r.id, r.estado_origen, r.ciudad_origen, r.estado_destino, r.ciudad_destino INTO v_ruta
    FROM public.rutas r
   WHERE r.id = p_ruta_id AND r.cooperativa_id = v_ctx.o_cooperativa_id AND r.activa;
  IF NOT FOUND OR public.normalizar_localidad(v_ruta.ciudad_origen) IS DISTINCT FROM public.normalizar_localidad(v_suc.ciudad) THEN
    PERFORM public._fallar('EB_SIN_RUTA', 'Elige un destino con ruta activa desde tu sucursal.', '{"campo":"destino"}');
  END IF;
  IF length(v_rn) < 3 OR public.normalizar_cedula(v_rc) IS NULL OR public.normalizar_telefono(v_rt) IS NULL THEN
    PERFORM public._fallar('EB_DATOS_INVALIDOS', 'Revisa el nombre, la cédula y el teléfono de quien envía.', '{"campo":"remitente"}');
  END IF;
  IF length(v_dn) < 3 OR public.normalizar_cedula(v_dc) IS NULL OR public.normalizar_telefono(v_dt) IS NULL THEN
    PERFORM public._fallar('EB_DATOS_INVALIDOS', 'Revisa el nombre, la cédula y el teléfono de quien recibe.', '{"campo":"destinatario"}');
  END IF;
  IF length(btrim(coalesce(p_descripcion, ''))) < 3 THEN
    PERFORM public._fallar('EB_DATOS_INVALIDOS', 'Describe el contenido del paquete.', '{"campo":"descripcion"}');
  END IF;
  IF p_valor_declarado IS NOT NULL AND p_valor_declarado < 0 THEN
    PERFORM public._fallar('EB_DATOS_INVALIDOS', 'El valor declarado no puede ser negativo.', '{"campo":"valor_declarado"}');
  END IF;
  IF p_modalidad_pago IS NULL THEN
    PERFORM public._fallar('EB_DATOS_INVALIDOS', 'Elige quién paga el envío.', '{"campo":"modalidad"}');
  END IF;

  INSERT INTO public.encomiendas (tracking_id, sender_id, origen_registro, remitente_nombre, remitente_cedula,
                                  remitente_telefono, receiver_nombre, receiver_cedula_rif, receiver_telefono,
                                  cooperativa_id, sucursal_origen_id, estado_origen, ciudad_origen,
                                  estado_destino, ciudad_destino, descripcion_contenido, valor_declarado,
                                  modalidad_pago, idempotency_key)
  VALUES ('PENDIENTE', v_ctx.o_uid, 'TAQUILLA', v_rn, v_rc, v_rt, v_dn, v_dc, v_dt,
          v_ctx.o_cooperativa_id, v_suc.id, v_ruta.estado_origen, v_ruta.ciudad_origen,
          v_ruta.estado_destino, v_ruta.ciudad_destino, left(btrim(p_descripcion), 500), p_valor_declarado,
          p_modalidad_pago, p_idempotency_key)   -- tracking_id lo asigna el trigger generar_tracking_id
  RETURNING id INTO v_id;

  SELECT o_costo_usd, o_peso_max INTO v_costo, v_max FROM public._costo_encomienda(v_id, p_peso_kg);
  UPDATE public.encomiendas SET estado = 'EN_RECEPCION' WHERE id = v_id;          -- genera el PIN
  UPDATE public.encomiendas SET estado = 'POR_PAGAR', peso_kg = p_peso_kg, costo_calculado = v_costo
   WHERE id = v_id;

  SELECT * INTO v_e FROM public.encomiendas WHERE id = v_id;
  SELECT t.tasa, t.fecha INTO v_tasa, v_fecha FROM public.fn_tasa_bcv_vigente() t;
  RETURN jsonb_build_object('encomienda_id', v_id, 'tracking_id', v_e.tracking_id, 'estado', 'POR_PAGAR',
    'costo_usd', v_costo, 'costo_bs', CASE WHEN v_tasa IS NOT NULL THEN round(v_costo * v_tasa, 2) END,
    'tasa_bcv', v_tasa, 'tasa_bcv_fecha', v_fecha, 'peso_max_kg', v_max,
    'modalidad_pago', p_modalidad_pago, 'pin_retiro', v_e.pin_retiro);
END $$;

-- ─── 2. Taquilla: no recibir una encomienda (sin ruta, contenido prohibido…) ─
CREATE OR REPLACE FUNCTION public.fn_rechazar_encomienda_origen(p_encomienda_id uuid, p_motivo text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_ctx record; v_e record; v_motivo text := left(btrim(coalesce(p_motivo, '')), 300);
BEGIN
  SELECT * INTO v_ctx FROM public._contexto_staff();
  SELECT * INTO v_e FROM public.encomiendas WHERE id = p_encomienda_id FOR UPDATE;
  IF NOT FOUND OR v_e.cooperativa_id IS DISTINCT FROM v_ctx.o_cooperativa_id THEN
    PERFORM public._fallar('EB_NO_ENCONTRADO', 'No encontramos esta encomienda en tu cooperativa.');
  END IF;
  IF v_e.estado = 'CANCELADA' THEN RETURN jsonb_build_object('estado', 'CANCELADA', 'ya_procesado', true); END IF;
  IF v_e.estado NOT IN ('PENDIENTE_DE_ESCANEO', 'EN_RECEPCION', 'POR_PAGAR') THEN
    PERFORM public._fallar('EB_ESTADO_CAMBIO', 'Esta encomienda ya fue cobrada o despachada; no se puede rechazar aquí.');
  END IF;
  IF length(v_motivo) < 5 THEN
    PERFORM public._fallar('EB_MOTIVO_REQUERIDO', 'Escribe por qué no recibes la encomienda (se le avisará al cliente).',
                           '{"campo":"motivo"}');
  END IF;
  IF EXISTS (SELECT 1 FROM public.pagos WHERE encomienda_id = p_encomienda_id
              AND estado_verificacion IN ('PENDIENTE', 'APROBADO')) THEN
    PERFORM public._fallar('EB_PAGO_YA_REGISTRADO',
      'Esta encomienda tiene un pago registrado. Resuélvelo en «Pagos por verificar» antes de rechazarla.');
  END IF;
  UPDATE public.encomiendas SET estado = 'CANCELADA', motivo_cancelacion = 'No recibida en taquilla: ' || v_motivo
   WHERE id = p_encomienda_id;
  PERFORM public._notificar_usuario(v_e.sender_id, 'ENCOMIENDA_RECHAZADA', 'No pudimos recibir tu envío',
    format('La taquilla no recibió tu encomienda %s: %s', v_e.tracking_id, v_motivo), 'encomienda', p_encomienda_id);
  RETURN jsonb_build_object('estado', 'CANCELADA');
END $$;

-- ─── 3. Entrega: PIN validado en servidor ───────────────────────────────────
-- Devuelve (no lanza) para que el intento fallido quede guardado.
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
    RETURN jsonb_build_object('valido', true, 'bloqueado', false, 'intentos_restantes', v_max - v_e.intentos_pin);
  END IF;
  v_intentos := v_e.intentos_pin + 1;
  UPDATE public.encomiendas SET intentos_pin = v_intentos, pin_bloqueado = (v_intentos >= v_max)
   WHERE id = p_encomienda_id;
  RETURN jsonb_build_object('valido', false, 'bloqueado', v_intentos >= v_max,
                            'intentos_restantes', greatest(v_max - v_intentos, 0));
END $$;

-- Entrega con PIN y cédula verificada (o sin PIN, solo el administrador y con motivo).
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
  ELSIF v_e.pin_retiro IS NULL OR v_e.pin_retiro <> btrim(coalesce(p_pin, '')) THEN
    PERFORM public._fallar('EB_PIN_INCORRECTO', 'El PIN no coincide. Valídalo de nuevo.', '{"campo":"pin"}');
  END IF;
  v_nombre := CASE WHEN v_tercero THEN btrim(p_retiro_nombre) ELSE v_e.receiver_nombre END;
  v_cedula := CASE WHEN v_tercero THEN btrim(p_retiro_cedula) ELSE v_e.receiver_cedula_rif END;
  UPDATE public.encomiendas
     SET estado = 'ENTREGADA', entregada_at = now(), entregada_por = v_ctx.o_uid,
         retiro_tercero = v_tercero, retiro_nombre = v_nombre, retiro_cedula = v_cedula,
         entrega_sin_pin_motivo = v_sin_pin
   WHERE id = p_encomienda_id;                 -- el trigger exige el cobro si paga quien recibe
  RETURN jsonb_build_object('estado', 'ENTREGADA', 'entregada_at', now(), 'retiro_nombre', v_nombre,
                            'retiro_cedula', v_cedula, 'sin_pin', v_sin_pin IS NOT NULL);
END $$;

-- Desbloquear el PIN: administrador de la cooperativa o super admin (antes no tenía política UPDATE).
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
  UPDATE public.encomiendas SET pin_bloqueado = false, intentos_pin = 0 WHERE id = p_encomienda_id;
  RETURN jsonb_build_object('ok', true, 'intentos_previos', v_e.intentos_pin);
END $$;

-- ─── 4. Público: cotizar un envío (app y landing) ───────────────────────────
-- Misma fórmula que _costo_encomienda / calcular-costo-encomienda; USD de referencia.
CREATE OR REPLACE FUNCTION public.fn_cotizar_envio_publico(p_peso_kg numeric, p_ciudad_origen text, p_ciudad_destino text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_por_kg numeric; v_factor numeric; v_max numeric; v_tasa numeric; v_fecha date; v_opciones jsonb;
BEGIN
  SELECT tarifa_por_kg, factor_distancia_por_min, peso_max_kg INTO v_por_kg, v_factor, v_max
    FROM public.tarifas WHERE activa LIMIT 1;
  IF v_por_kg IS NULL THEN
    PERFORM public._fallar('EB_TARIFA_NO_DISPONIBLE', 'Todavía no podemos calcular el costo. Intenta más tarde.');
  END IF;
  IF p_peso_kg IS NULL OR p_peso_kg <= 0 OR p_peso_kg > v_max THEN
    PERFORM public._fallar('EB_PESO_INVALIDO', format('El peso debe ser mayor que 0 y de hasta %s kg.', v_max),
      jsonb_build_object('peso_max_kg', v_max, 'campo', 'peso'));
  END IF;
  SELECT t.tasa, t.fecha INTO v_tasa, v_fecha FROM public.fn_tasa_bcv_vigente() t;
  SELECT coalesce(jsonb_agg(o ORDER BY (o->>'costo_usd')::numeric, o->>'cooperativa'), '[]'::jsonb) INTO v_opciones
    FROM (
      SELECT jsonb_build_object(
               'cooperativa_id', x.cooperativa_id, 'cooperativa', x.nombre, 'calificacion', x.calificacion_promedio,
               'duracion_min', x.duracion_estimada_min,
               'costo_usd', round(p_peso_kg * v_por_kg * (1 + v_factor * x.duracion_estimada_min), 2),
               'costo_bs', CASE WHEN v_tasa IS NOT NULL
                                THEN round(round(p_peso_kg * v_por_kg * (1 + v_factor * x.duracion_estimada_min), 2) * v_tasa, 2) END) AS o
        FROM (SELECT DISTINCT ON (r.cooperativa_id) r.cooperativa_id, c.nombre, c.calificacion_promedio, r.duracion_estimada_min
                FROM public.rutas r JOIN public.cooperativas c ON c.id = r.cooperativa_id AND c.estado = 'ACTIVA'
               WHERE r.activa
                 AND public.normalizar_localidad(r.ciudad_origen) = public.normalizar_localidad(p_ciudad_origen)
                 AND public.normalizar_localidad(r.ciudad_destino) = public.normalizar_localidad(p_ciudad_destino)
               ORDER BY r.cooperativa_id, r.duracion_estimada_min) x
    ) s;
  RETURN jsonb_build_object('peso_max_kg', v_max, 'tasa_bcv', v_tasa, 'tasa_bcv_fecha', v_fecha, 'opciones', v_opciones);
END $$;

-- ─── 5. Público: rastrear por código de seguimiento (landing, con service role) ─
CREATE OR REPLACE FUNCTION public.fn_rastrear_encomienda_publico(p_tracking text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_e record;
BEGIN
  SELECT e.id, e.tracking_id, e.estado, e.estado_origen, e.ciudad_origen, e.estado_destino, e.ciudad_destino,
         e.created_at, e.updated_at, c.nombre AS cooperativa
    INTO v_e
    FROM public.encomiendas e LEFT JOIN public.cooperativas c ON c.id = e.cooperativa_id
   WHERE upper(e.tracking_id) = upper(btrim(coalesce(p_tracking, '')));
  IF NOT FOUND THEN RETURN NULL; END IF;
  RETURN jsonb_build_object(
    'tracking_id', v_e.tracking_id, 'estado', v_e.estado, 'cooperativa', v_e.cooperativa,
    'origen', jsonb_build_object('estado', v_e.estado_origen, 'ciudad', v_e.ciudad_origen),
    'destino', jsonb_build_object('estado', v_e.estado_destino, 'ciudad', v_e.ciudad_destino),
    'creada_at', v_e.created_at, 'actualizada_at', v_e.updated_at,
    'historial', coalesce((SELECT jsonb_agg(jsonb_build_object('estado', h.estado_nuevo, 'fecha', h.created_at)
                                            ORDER BY h.created_at)
                             FROM public.encomienda_estado_historial h WHERE h.encomienda_id = v_e.id), '[]'::jsonb));
END $$;

-- ─── 6. Público: rutas populares y cifras reales (landing, L-07, LP-03) ─────
CREATE OR REPLACE FUNCTION public.fn_rutas_populares(p_limite integer DEFAULT 6)
RETURNS TABLE (ciudad_origen text, estado_origen text, ciudad_destino text, estado_destino text,
               desde_usd numeric, duracion_min integer, cooperativas integer, salidas_proximas integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT r.ciudad_origen, min(r.estado_origen), r.ciudad_destino, min(r.estado_destino),
         min(r.precio_pasaje)::numeric, min(r.duracion_estimada_min), count(DISTINCT r.cooperativa_id)::integer,
         (SELECT count(*)::integer FROM public.viajes v JOIN public.rutas r2 ON r2.id = v.ruta_id
           WHERE r2.ciudad_origen = r.ciudad_origen AND r2.ciudad_destino = r.ciudad_destino AND r2.activa
             AND v.estado = 'PROGRAMADO' AND v.fecha_hora_salida > now())
    FROM public.rutas r JOIN public.cooperativas c ON c.id = r.cooperativa_id AND c.estado = 'ACTIVA'
   WHERE r.activa AND coalesce(r.precio_pasaje, 0) > 0
   GROUP BY r.ciudad_origen, r.ciudad_destino
   ORDER BY 8 DESC, 7 DESC, 5
   LIMIT greatest(1, least(coalesce(p_limite, 6), 12));
$$;

CREATE OR REPLACE FUNCTION public.fn_estadisticas_publicas()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT jsonb_build_object(
    'cooperativas', (SELECT count(*) FROM public.cooperativas WHERE estado = 'ACTIVA'),
    'ciudades', (SELECT count(DISTINCT x) FROM (
                   SELECT public.normalizar_localidad(r.ciudad_origen) AS x
                     FROM public.rutas r JOIN public.cooperativas c ON c.id = r.cooperativa_id AND c.estado = 'ACTIVA'
                    WHERE r.activa
                   UNION
                   SELECT public.normalizar_localidad(r.ciudad_destino)
                     FROM public.rutas r JOIN public.cooperativas c ON c.id = r.cooperativa_id AND c.estado = 'ACTIVA'
                    WHERE r.activa) t),
    'rutas', (SELECT count(*) FROM (SELECT DISTINCT r.ciudad_origen, r.ciudad_destino
                                      FROM public.rutas r JOIN public.cooperativas c
                                        ON c.id = r.cooperativa_id AND c.estado = 'ACTIVA'
                                     WHERE r.activa) t));
$$;

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
              'fn_registrar_encomienda_taquilla', 'fn_rechazar_encomienda_origen', 'fn_validar_pin_retiro',
              'fn_entregar_encomienda', 'fn_desbloquear_pin') LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', f.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', f.sig);
  END LOOP;
  FOR f IN SELECT p.oid::regprocedure AS sig FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public' AND p.proname IN (
              'fn_cotizar_envio_publico', 'fn_rutas_populares', 'fn_estadisticas_publicas') LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO anon, authenticated, service_role', f.sig);
  END LOOP;
  FOR f IN SELECT p.oid::regprocedure AS sig FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public' AND p.proname = 'fn_rastrear_encomienda_publico' LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', f.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f.sig);
  END LOOP;
END $$;

COMMIT;
```

### 2.5 `supabase/migrations/20260720000005_fase3_rpc_cuenta_soporte.sql` — RPC de soporte, estado de cooperativa y puesta en marcha

```sql
-- Fase 3 · "Reportar un problema" (#28), estado de la cooperativa con motivo y rechazo
-- reversible (#37, AD-12), puesta en marcha (#38).
-- Requiere 20260720000001 y 20260720000002. Re-ejecutable.
BEGIN;

-- ─── 1. App: reportar un problema (crea una incidencia REPORTE_USUARIO) ─────
-- p_categoria: 'PAGO' | 'BOLETO' | 'ENCOMIENDA' | 'CUENTA' | 'OTRO'
CREATE OR REPLACE FUNCTION public.fn_reportar_problema(
  p_categoria text, p_descripcion text, p_boleto_id uuid DEFAULT NULL, p_encomienda_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_uid uuid := public._uid_usuario(); v_desc text := left(btrim(coalesce(p_descripcion, '')), 2000);
        v_id uuid; v_creada timestamptz;
BEGIN
  IF p_categoria IS NULL OR p_categoria NOT IN ('PAGO', 'BOLETO', 'ENCOMIENDA', 'CUENTA', 'OTRO') THEN
    PERFORM public._fallar('EB_DATOS_INVALIDOS', 'Elige de qué se trata el problema.', '{"campo":"categoria"}');
  END IF;
  IF length(v_desc) < 10 THEN
    PERFORM public._fallar('EB_DATOS_INVALIDOS', 'Cuéntanos qué pasó (al menos 10 caracteres).', '{"campo":"descripcion"}');
  END IF;
  IF p_boleto_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM public.boletos WHERE id = p_boleto_id AND comprador_id = v_uid) THEN
    PERFORM public._fallar('EB_NO_ENCONTRADO', 'No encontramos ese boleto en tu cuenta.');
  END IF;
  IF p_encomienda_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM public.encomiendas WHERE id = p_encomienda_id
          AND (sender_id = v_uid OR receiver_user_id = v_uid)) THEN
    PERFORM public._fallar('EB_NO_ENCONTRADO', 'No encontramos esa encomienda en tu cuenta.');
  END IF;
  IF (SELECT count(*) FROM public.incidencias
       WHERE reportado_por = v_uid AND created_at > now() - interval '24 hours') >= 5 THEN
    PERFORM public._fallar('EB_DEMASIADOS_REPORTES',
      'Ya nos enviaste varios reportes hoy. Te responderemos pronto; si es urgente, escríbenos por WhatsApp.');
  END IF;
  INSERT INTO public.incidencias (encomienda_id, boleto_id, reportado_por, tipo, categoria, descripcion, estado)
  VALUES (p_encomienda_id, p_boleto_id, v_uid, 'REPORTE_USUARIO', p_categoria, v_desc, 'ABIERTA')
  RETURNING id, created_at INTO v_id, v_creada;
  RETURN jsonb_build_object('id', v_id, 'codigo', 'INC-' || upper(left(replace(v_id::text, '-', ''), 6)),
                            'creada_at', v_creada);
END $$;

-- ─── 2. Super admin: cambiar el estado de una cooperativa con motivo ────────
-- RECHAZADA es reversible (vuelve a PENDIENTE). DESACTIVADA es terminal.
CREATE OR REPLACE FUNCTION public.fn_cambiar_estado_cooperativa(
  p_cooperativa_id uuid, p_estado public.estado_cooperativa, p_motivo text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_c record; v_motivo text := nullif(left(btrim(coalesce(p_motivo, '')), 500), ''); v_ok boolean;
BEGIN
  IF NOT coalesce(public.is_super_admin(), false) THEN
    PERFORM public._fallar('EB_SIN_PERMISO', 'Solo el equipo de EnBus puede cambiar el estado de una cooperativa.');
  END IF;
  SELECT id, estado, nombre INTO v_c FROM public.cooperativas WHERE id = p_cooperativa_id FOR UPDATE;
  IF NOT FOUND THEN
    PERFORM public._fallar('EB_NO_ENCONTRADO', 'No encontramos esa cooperativa.');
  END IF;
  IF v_c.estado = p_estado THEN
    RETURN jsonb_build_object('estado', p_estado, 'anterior', v_c.estado, 'ya_procesado', true);
  END IF;
  v_ok := CASE v_c.estado::text
            WHEN 'PENDIENTE'   THEN p_estado::text IN ('ACTIVA', 'RECHAZADA', 'DESACTIVADA')
            WHEN 'RECHAZADA'   THEN p_estado::text IN ('PENDIENTE', 'DESACTIVADA')
            WHEN 'ACTIVA'      THEN p_estado::text IN ('SUSPENDIDA', 'DESACTIVADA')
            WHEN 'SUSPENDIDA'  THEN p_estado::text IN ('ACTIVA', 'DESACTIVADA')
            ELSE false END;
  IF NOT v_ok THEN
    PERFORM public._fallar('EB_ESTADO_CAMBIO',
      CASE WHEN v_c.estado::text = 'DESACTIVADA' THEN 'Una cooperativa desactivada no se puede reactivar.'
           ELSE format('No se puede pasar de %s a %s.', v_c.estado, p_estado) END);
  END IF;
  IF p_estado::text IN ('RECHAZADA', 'SUSPENDIDA', 'DESACTIVADA') AND coalesce(length(v_motivo), 0) < 5 THEN
    PERFORM public._fallar('EB_MOTIVO_REQUERIDO', 'Escribe el motivo: la cooperativa lo verá en su panel.', '{"campo":"motivo"}');
  END IF;
  UPDATE public.cooperativas
     SET estado = p_estado,
         motivo_estado = CASE WHEN p_estado::text IN ('ACTIVA', 'PENDIENTE') THEN NULL ELSE v_motivo END,
         estado_cambiado_at = now(), estado_cambiado_por = auth.uid(), updated_at = now()
   WHERE id = p_cooperativa_id;
  RETURN jsonb_build_object('estado', p_estado, 'anterior', v_c.estado);
END $$;

-- ─── 3. Cooperativa rechazada: corrige sus datos y pide una nueva revisión ──
CREATE OR REPLACE FUNCTION public.fn_solicitar_revision_cooperativa(p_mensaje text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_ctx record; v_estado public.estado_cooperativa;
BEGIN
  SELECT * INTO v_ctx FROM public._contexto_staff();
  IF v_ctx.o_rol <> 'admin_cooperativa' THEN
    PERFORM public._fallar('EB_SIN_PERMISO', 'Solo el administrador de la cooperativa puede pedir la revisión.');
  END IF;
  SELECT estado INTO v_estado FROM public.cooperativas WHERE id = v_ctx.o_cooperativa_id FOR UPDATE;
  IF v_estado::text = 'PENDIENTE' THEN RETURN jsonb_build_object('estado', 'PENDIENTE', 'ya_procesado', true); END IF;
  IF v_estado::text <> 'RECHAZADA' THEN
    PERFORM public._fallar('EB_ESTADO_CAMBIO', 'Tu cooperativa no tiene una solicitud rechazada.');
  END IF;
  UPDATE public.cooperativas
     SET estado = 'PENDIENTE', motivo_estado = NULL, estado_cambiado_at = now(), estado_cambiado_por = v_ctx.o_uid,
         mensaje_registro = coalesce(nullif(left(btrim(coalesce(p_mensaje, '')), 1000), ''), mensaje_registro),
         updated_at = now()
   WHERE id = v_ctx.o_cooperativa_id;
  RETURN jsonb_build_object('estado', 'PENDIENTE');
END $$;

-- ─── 4. Panel: checklist de puesta en marcha (#38) ──────────────────────────
CREATE OR REPLACE FUNCTION public.fn_checklist_cooperativa()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_ctx record; v_c record;
BEGIN
  SELECT * INTO v_ctx FROM public._contexto_staff();
  SELECT estado, motivo_estado, estado_cambiado_at INTO v_c FROM public.cooperativas WHERE id = v_ctx.o_cooperativa_id;
  RETURN jsonb_build_object(
    'estado', v_c.estado, 'motivo_estado', v_c.motivo_estado, 'estado_cambiado_at', v_c.estado_cambiado_at,
    'sucursales', (SELECT count(*) FROM public.sucursales WHERE cooperativa_id = v_ctx.o_cooperativa_id AND activa),
    'metodos_pago', (SELECT count(*) FROM public.metodos_pago_cooperativa
                      WHERE cooperativa_id = v_ctx.o_cooperativa_id AND activo),
    'metodos_digitales', (SELECT count(*) FROM public.metodos_pago_cooperativa
                           WHERE cooperativa_id = v_ctx.o_cooperativa_id AND activo AND tipo <> 'EFECTIVO'),
    'rutas', (SELECT count(*) FROM public.rutas
               WHERE cooperativa_id = v_ctx.o_cooperativa_id AND activa AND coalesce(precio_pasaje, 0) > 0),
    'viajes_proximos', (SELECT count(*) FROM public.viajes
                         WHERE cooperativa_id = v_ctx.o_cooperativa_id AND estado = 'PROGRAMADO'
                           AND fecha_hora_salida > now()),
    'taquilleros', (SELECT count(*) FROM public.profiles
                     WHERE cooperativa_id = v_ctx.o_cooperativa_id AND role = 'taquillero'),
    'invitaciones_pendientes', (SELECT count(*) FROM public.invitaciones
                                 WHERE cooperativa_id = v_ctx.o_cooperativa_id AND NOT usado
                                   AND revocada_at IS NULL AND expira_at > now()));
END $$;

-- ─── 5. Registro de cooperativa: ¿el correo ya tiene cuenta? (#39, PC-03) ───
-- Solo service_role (server action del registro): sustituye listUsers() sin paginar.
CREATE OR REPLACE FUNCTION public.fn_email_registrado(p_email text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, auth, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM auth.users u WHERE lower(u.email) = lower(btrim(coalesce(p_email, ''))));
$$;
REVOKE ALL ON FUNCTION public.fn_email_registrado(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_email_registrado(text) TO service_role;

-- Permisos
DO $$
DECLARE f record;
BEGIN
  FOR f IN SELECT p.oid::regprocedure AS sig FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public' AND p.proname IN (
              'fn_reportar_problema', 'fn_cambiar_estado_cooperativa', 'fn_solicitar_revision_cooperativa',
              'fn_checklist_cooperativa') LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', f.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', f.sig);
  END LOOP;
END $$;

COMMIT;
```


### 2.6 Pruebas funcionales ejecutadas (PGlite)

Alta con Google → perfil con `PENDIENTE-<id>` en teléfono y cédula; cédula repetida → marcador; alta normal intacta · Reserva de un perfil de Google → boletos sin cédula; checkout → `EB_DATOS_PASAJERO` (asientos 3, 4); `fn_asignar_pasajeros` inválido → `EB_DATOS_PASAJERO`; válido → checkout OK · Otro usuario: `fn_asientos_ocupados` = {3,4}; asignar pasajeros ajenos → `EB_SIN_PERMISO` · `fn_cancelar_viaje`: taquillero → `EB_SIN_PERMISO`; con pagos en verificación → `EB_PAGOS_PENDIENTES`; tras aprobar → 2 boletos con reembolso 100 % (USD 21,00) y aviso "La cooperativa canceló el viaje Caracas → Valencia del 04/10 a las 4:38 a. m.…" · `fn_validar_embarque('bol 7cab-e4ad')` y `('PASS-BOL-…')` encuentran el boleto · `fn_reembolsos` lista 2 con método PAGO_MOVIL y teléfono del pasajero; `fn_registrar_reembolso` sin referencia → error; con referencia → 2 procesados, repetido → 0 (idempotente) y aviso "Te devolvimos tu dinero"; el cliente no puede escribir columnas de reembolso · Alta presencial: POR_PAGAR, costo USD 7,08 / Bs 283,20, PIN, destinatario vinculado por cédula, `sucursal_destino_id`; repetida → `repetido`; ruta que no sale de la sucursal → `EB_SIN_RUTA`; 99 kg → `EB_PESO_INVALIDO` · INSERT de la app con foto en `foto_evidencia_url` → movida a `foto_cliente_path`, `origen_registro='APP'` aunque el cliente mande otra cosa · Rechazo en EN_RECEPCION → CANCELADA con motivo · PIN incorrecto: intentos 1, `updated_at` no se mueve · Entrega sin cédula → `EB_CEDULA_NO_VERIFICADA`; con cobro en destino pendiente → `EB_COBRO_PENDIENTE`; taquillero sin PIN → `EB_SIN_PERMISO`; a tercero → ENTREGADA con `retiro_*` y `entregada_por` · `fn_desbloquear_pin` por taquillero → `EB_SIN_PERMISO` · anon: cotización (USD 5,90 / Bs 236), rutas populares, estadísticas; `fn_rastrear_encomienda_publico` → permiso denegado para anon, historial completo para service_role · Reporte → `INC-XXXXXX`; INSERT directo de usuario → RLS; el usuario ve su reporte · Admin de cooperativa: cambiar comisión → `EB_SIN_PERMISO`; cambiar RIF estando ACTIVA → `EB_SIN_PERMISO` · Super admin: rechazar sin motivo → `EB_MOTIVO_REQUERIDO`; con motivo → RECHAZADA; ACTIVA → PENDIENTE → `EB_ESTADO_CAMBIO` · Cooperativa rechazada: corrige el RIF y pide revisión → PENDIENTE con el mensaje; checklist devuelve los conteos · Destinatario ve el pago que registró el remitente; un tercero no · `fn_email_registrado`: solo service_role, sin distinguir mayúsculas · Privilegios: `_fecha_hora_ve` sin EXECUTE para authenticated/anon; RPC de usuario/personal solo authenticated; públicas también anon.

---

## 3. Contratos

### 3.1 Errores nuevos (`P0001`, `message` = código, `hint` = texto para el usuario)

`EB_DATOS_PASAJERO` (detail `{campo:'pasajeros', asientos:[]}`), `EB_PAGOS_PENDIENTES` (`{pendientes}`), `EB_SUCURSAL_REQUERIDA` (`{campo:'sucursal'}`), `EB_CEDULA_NO_VERIFICADA` (`{campo:'cedula'}`), `EB_PIN_BLOQUEADO`, `EB_PIN_INCORRECTO` (`{campo:'pin'}`), `EB_DEMASIADOS_REPORTES`. Los `humanizeError` muestran el `hint` por defecto (fase 2); solo añadir los códigos al tipo `CodigoEB` (app) y textos propios donde se indique. Campos nuevos en `detail.campo`: `pasajeros`, `sucursal`, `remitente`, `destinatario`, `descripcion`, `valor_declarado`, `modalidad`, `destino`, `cedula`, `tercero`, `pin`, `categoria`, `metodo`.

### 3.2 RPC nuevas o cambiadas (`supabase.rpc(nombre, params)`)

| RPC | Quién | Parámetros | Devuelve |
|---|---|---|---|
| `fn_sucursales_en_ciudad` | authenticated | `p_cooperativa_id, p_ciudad` | filas `{id, nombre, direccion, telefono, horario, ciudad, estado_geografico}` (ciudad normalizada) |
| `fn_asientos_ocupados` | authenticated | `p_viaje_id` | `text[]` ordenado |
| `fn_asignar_pasajeros` | user | `p_compra_id, p_pasajeros jsonb [{asiento, nombre, cedula, telefono?}]` | `Resumen` + `{actualizados, asientos_sin_datos: text[]}` |
| `fn_checkout_boletos` | user | igual que fase 2 | igual; nuevo error `EB_DATOS_PASAJERO` |
| `Resumen.boletos[]` | — | — | ahora también `pasajero_nombre, pasajero_cedula, pasajero_telefono` |
| `fn_validar_embarque` | staff | igual | acepta código con espacios/guiones/minúsculas y `PASS-…`; `OTRO_DIA` antes que `OTRO_VIAJE` |
| `fn_cancelar_viaje` | admin_cooperativa | `p_viaje_id, p_motivo (≥5)` | `{estado:'CANCELADO', boletos_reembolso, reservas_anuladas, total_reembolso_usd, encomiendas_en_transito, ya_procesado?}` |
| `fn_reembolsos` | staff | `p_estado 'PENDIENTE'\|'PROCESADO'\|'TODOS'` | filas `{boleto_id, codigo_boleto, compra_id, asiento, pasajero_nombre, pasajero_cedula, contacto_nombre, contacto_telefono, viaje_salida, ruta, cancelado_at, motivo_cancelacion, cancelado_por 'PASAJERO'\|'COOPERATIVA', monto_usd, pago_id, pago_metodo, pago_banco_emisor, pago_referencia, pago_moneda, pago_estado, procesado, procesado_at, reembolso_metodo, reembolso_referencia, reembolso_nota}` |
| `fn_registrar_reembolso` | staff | `p_boleto_ids uuid[], p_metodo ('PAGO_MOVIL'\|'TRANSFERENCIA_BANCARIA'\|'ZELLE'\|'EFECTIVO'), p_referencia (≥4 salvo efectivo), p_nota?` | `{procesados, ya_procesados}` |
| `fn_registrar_encomienda_taquilla` | staff | `p_ruta_id, p_remitente jsonb {nombre,cedula,telefono}, p_destinatario jsonb, p_descripcion, p_valor_declarado?, p_modalidad_pago, p_peso_kg, p_idempotency_key (≥8), p_sucursal_id?` | `{encomienda_id, tracking_id, estado:'POR_PAGAR', costo_usd, costo_bs, tasa_bcv, tasa_bcv_fecha, peso_max_kg, modalidad_pago, pin_retiro, repetido?}` |
| `fn_rechazar_encomienda_origen` | staff | `p_encomienda_id, p_motivo (≥5)` | `{estado:'CANCELADA', ya_procesado?}` |
| `fn_validar_pin_retiro` | staff | `p_encomienda_id, p_pin` | `{valido, bloqueado, intentos_restantes}` (máx. 10 intentos) |
| `fn_entregar_encomienda` | staff | `p_encomienda_id, p_pin, p_cedula_verificada, p_retira_tercero=false, p_retiro_nombre?, p_retiro_cedula?, p_sin_pin_motivo?` | `{estado:'ENTREGADA', entregada_at, retiro_nombre, retiro_cedula, sin_pin, ya_procesado?}` |
| `fn_desbloquear_pin` | admin_cooperativa (su cooperativa) o super_admin | `p_encomienda_id, p_motivo (≥5)` | `{ok, intentos_previos}` |
| `fn_cotizar_envio_publico` | anon, authenticated, service_role | `p_peso_kg, p_ciudad_origen, p_ciudad_destino` | `{peso_max_kg, tasa_bcv, tasa_bcv_fecha, opciones:[{cooperativa_id, cooperativa, calificacion, duracion_min, costo_usd, costo_bs}]}` |
| `fn_rastrear_encomienda_publico` | **solo service_role** | `p_tracking` | `{tracking_id, estado, cooperativa, origen:{estado,ciudad}, destino:{…}, creada_at, actualizada_at, historial:[{estado, fecha}]}` o `null` |
| `fn_rutas_populares` | anon, authenticated, service_role | `p_limite=6 (máx. 12)` | filas `{ciudad_origen, estado_origen, ciudad_destino, estado_destino, desde_usd, duracion_min, cooperativas, salidas_proximas}` |
| `fn_estadisticas_publicas` | anon, authenticated, service_role | — | `{cooperativas, ciudades, rutas}` |
| `fn_reportar_problema` | user | `p_categoria ('PAGO'\|'BOLETO'\|'ENCOMIENDA'\|'CUENTA'\|'OTRO'), p_descripcion (≥10), p_boleto_id?, p_encomienda_id?` | `{id, codigo:'INC-XXXXXX', creada_at}` |
| `fn_cambiar_estado_cooperativa` | super_admin | `p_cooperativa_id, p_estado, p_motivo?` | `{estado, anterior, ya_procesado?}`; transiciones: PENDIENTE→ACTIVA/RECHAZADA/DESACTIVADA, RECHAZADA→PENDIENTE/DESACTIVADA, ACTIVA→SUSPENDIDA/DESACTIVADA, SUSPENDIDA→ACTIVA/DESACTIVADA |
| `fn_solicitar_revision_cooperativa` | admin_cooperativa | `p_mensaje?` | `{estado:'PENDIENTE', ya_procesado?}` (solo desde RECHAZADA) |
| `fn_checklist_cooperativa` | staff | — | `{estado, motivo_estado, estado_cambiado_at, sucursales, metodos_pago, metodos_digitales, rutas, viajes_proximos, taquilleros, invitaciones_pendientes}` |
| `fn_email_registrado` | solo service_role | `p_email` | `boolean` |

Columnas nuevas legibles por la app/panel: `boletos.reembolso_procesado_at, reembolso_metodo, reembolso_referencia, reembolso_nota`; `encomiendas.origen_registro, remitente_nombre, remitente_cedula, remitente_telefono, foto_cliente_path, foto_omitida_motivo, entregada_at, retiro_tercero, retiro_nombre, retiro_cedula, entrega_sin_pin_motivo`; `cooperativas.representante, mensaje_registro, motivo_estado, estado_cambiado_at`; `sucursales.horario`; `incidencias.boleto_id, categoria`; `invitaciones.revocada_at`. Embeds: sin cambios respecto a la fase 2 (las columnas `*_por` nuevas no tienen FK).

### 3.3 Piezas compartidas nuevas (las crea la oleada 1)

**EnBusApp**
```ts
// src/utils/validation.ts (añadir; espejo de normalizar_cedula/telefono de SQL)
export function normalizarCedula(v: string | null | undefined): string | null;   // "v-12.345.678" → "V12345678"; 'PENDIENTE…' → null
export function formatCedula(v: string | null | undefined): string;              // → "V-12.345.678" ("—" si no es válida)
export function normalizarTelefono(v: string | null | undefined): string | null; // "+58 414 1234567" → "4141234567"
export function formatTelefono(v: string | null | undefined): string;            // → "0414-123.45.67"
export function cedulaValida(v: string): boolean; export function telefonoValido(v: string): boolean;
export function perfilCompleto(p: { nombre_completo?: string | null; cedula_rif?: string | null; telefono?: string | null } | null): boolean;
// validateCedula / validatePhone pasan a usar estas reglas (mensajes: "Escribe la cédula con su letra, por ejemplo V-12345678." / "Escribe un teléfono venezolano, por ejemplo 0414-1234567.")

// src/utils/codigos.ts (nuevo)
export function formatCodigoBoleto(codigo: string | null | undefined): string; // "BOL-7CABE4AD" → "BOL-7CAB-E4AD"; otros formatos sin cambio
export function qrEncomienda(e: { tracking_id?: string | null; id: string }): string; // tracking_id ?? id

// src/utils/authLinks.ts (nuevo)
export type TipoEnlaceAuth = 'google' | 'registro' | 'recuperar';
export function redirectAuth(tipo: TipoEnlaceAuth): string; // Linking.createURL('auth/callback', { queryParams: { tipo } })
export async function completarSesionDesdeUrl(url: string): Promise<{ ok: true; tipo: TipoEnlaceAuth | null } | { ok: false; error: string }>;
// ?code= → exchangeCodeForSession; #access_token&refresh_token → setSession; ?error_description → error humanizado ('auth')

// src/utils/soporte.ts (nuevo)
export const SOPORTE_WHATSAPP: string | null; // process.env.EXPO_PUBLIC_SOPORTE_WHATSAPP, solo dígitos con 58
export function abrirWhatsApp(telefono: string, mensaje: string): Promise<boolean>; // wa.me/58…?text=… (normaliza 04xx → 584xx)
export function abrirSoporteWhatsApp(contexto?: string): Promise<boolean>;      // false si no hay número

// src/utils/fotos.ts (nuevo) y src/utils/storage.ts
export async function urlFotoEncomienda(rutaOUrl: string | null | undefined): Promise<string | null>; // createSignedUrl 1 h; acepta URL antigua (extrae lo que va tras /fotos-encomiendas/)
// uploadEvidencePhoto(localUri, userId) devuelve la RUTA del objeto ("<userId>/<ts>.jpg"), no una URL

// src/hooks/usePerfil.ts (nuevo)
export function usePerfil(): { perfil: PerfilUsuario | null; completo: boolean; faltan: Array<'nombre'|'cedula'|'telefono'>;
  loading: boolean; error: string | null; recargar(): Promise<void>;
  guardar(d: { nombre_completo: string; cedula_rif: string; telefono: string }): Promise<void> }; // update propio; 23505 → mensaje de cédula/teléfono ya usados

// src/components/CompletarPerfilSheet.tsx (nuevo)
props { visible: boolean; motivo: 'compra' | 'envio' | 'perfil'; onClose(): void; onCompletado(perfil: PerfilUsuario): void }

// src/components/ui/Screen.tsx → ErrorState (exportado en ui/index.ts)
export function ErrorState(p: { title: string; description?: string; onRetry: () => Promise<void> | void; compact?: boolean }): JSX.Element;
// botón "Reintentar" con loading mientras corre onRetry (cubre el pendiente "Intentar de nuevo sin carga")
export function StaleBanner(p: { actualizadoAt?: number | null; onRetry?: () => void }): JSX.Element; // "Mostrando datos guardados · actualizado hace 2 h"

// src/components/QRCodeViewer.tsx: props { data: string; size?: number; codigoLegible?: string; ampliable?: boolean }
// muestra codigoLegible (no el payload); con ampliable, botón "Mostrar QR en grande" → Modal blanco con QR de 280 pt y la ayuda
// "Sube el brillo de tu pantalla para que lo lean más rápido." (autoMaxBrightness queda como prop ignorada y @deprecated
// para no romper a los consumidores; la oleada 2 deja de pasarla)

// src/hooks/useWizardBack.ts: opción nueva `bloqueado?: boolean` → navigation.setOptions({ gestureEnabled: !bloqueado }) y el back físico no hace nada mientras está bloqueado (pendiente iOS swipe-back)
// src/components/ui/Badge.tsx: Chip acepta `accessibilityLabel?` (pendiente fase 1)
// .expo/types/router.d.ts: añadir /restablecer, /revisa-correo, /auth/callback, /ayuda, /boletos/compra/[id] (archivo generado; se regenera al arrancar Expo)
```
Tipos en `src/types/index.ts`: `ResumenBoleto` + `pasajero_*`; `ResultadoAsignarPasajeros`; `Boleto` + `reembolso_procesado, reembolso_procesado_at, reembolso_metodo, reembolso_referencia, reembolso_nota, pasajero_telefono`; `Encomienda.costo_calculado/pin_retiro: … | null` + columnas nuevas; `SucursalPunto`; `CotizacionEnvioPublica`; `ReporteCreado`; `CategoriaReporte`; `CodigoEB` con los nuevos.

**PanelCooperativas**
```ts
// lib/estados.ts (nuevo) — fuente única de etiquetas (ver §4)
export type Dominio = 'boleto'|'encomienda'|'viaje'|'pago'|'cooperativa'|'incidencia'|'ciclo'|'reembolso';
export type Tono = 'neutro'|'pendiente'|'exito'|'info'|'terminado'|'peligro';
export type EstadoInfo = { pasajero: string; operador: string; tono: Tono; ayuda?: string };
export function estadoInfo(dominio: Dominio, estado: string | null | undefined): EstadoInfo; // desconocido → literal legible, tono neutro (nunca "Resuelta")
export function etiquetaEstado(dominio: Dominio, estado: string | null | undefined, audiencia?: 'operador' | 'pasajero'): string;
export const ROLES: Record<'user'|'taquillero'|'admin_cooperativa'|'super_admin', string>;
export const MODALIDAD_PAGO: Record<'ORIGEN'|'DESTINO', { corto: string; largo: string }>;
export const METODO_PAGO: Record<'PAGO_MOVIL'|'TRANSFERENCIA_BANCARIA'|'ZELLE'|'EFECTIVO'|'DIGITAL', string>;
export const CATEGORIA_REPORTE: Record<'PAGO'|'BOLETO'|'ENCOMIENDA'|'CUENTA'|'OTRO', string>;

// components/status-badge.tsx: <StatusBadge status dominio? audiencia? className? />; colores accesibles (§5.21)
// components/confirm-dialog.tsx (nuevo)
export function ConfirmDialog(p: {
  open: boolean; onOpenChange(open: boolean): void;
  titulo: string; descripcion?: React.ReactNode; impacto?: React.ReactNode[];      // lista "Qué va a pasar"
  verbo: string; verboCargando?: string; tono?: 'default' | 'destructive';         // "Desactivar cooperativa" / "Desactivando…"
  motivo?: { etiqueta: string; placeholder?: string; minimo?: number; chips?: string[] };
  confirmarEscribiendo?: string;                                                  // p. ej. el nombre o el RIF
  onConfirm(motivo?: string): Promise<{ ok: boolean; error?: string } | void>;    // se cierra solo si ok; error inline
}): JSX.Element; // botón deshabilitado y con texto de carga; Esc/Cancelar deshabilitados mientras corre; foco inicial en "Cancelar" si tono destructive
// components/error-state.tsx (nuevo)
export function ErrorState(p: { titulo: string; descripcion?: string; onReintentar(): Promise<void> | void; compacto?: boolean }): JSX.Element;
// lib/ve.ts (nuevo): normalizarCedula, formatCedula, normalizarTelefono, formatTelefono, cedulaValida, telefonoValido (mismas reglas que la app)
// lib/bancos.ts (nuevo): export const BANCOS_VE: { codigo: string; nombre: string }[]; export function etiquetaBanco(b): string; // "0134 · Banesco"
// lib/fotos.ts (nuevo): rutaDeFoto(valor) y urlFirmadaFoto(supabase, valor, segundos = 3600)
// lib/types/reembolsos.ts (nuevo): Reembolso (filas de fn_reembolsos), ResultadoCancelarViaje
// lib/types/pagos.ts / encomiendas.ts / boletos.ts: columnas y resultados nuevos (§3.2)
// (lib/types/admin-cooperativas.ts: EstadoCooperativa + 'RECHAZADA', representante, mensaje_registro, motivo_estado,
//  estado_cambiado_at — lo cambia W2-ADMIN, dueño de los Record<EstadoCooperativa, …> del admin; lib/estados.ts usa claves string)
// lib/supabase/cached.ts + hooks/use-user.tsx: UserProfile + cooperativa_motivo_estado, cooperativa_estado_cambiado_at
// lib/errores.ts: CodigoEB nuevos; texto propio EB_PAGOS_PENDIENTES: "Primero resuelve los pagos por verificar de este viaje (apruébalos o recházalos) y vuelve a cancelarlo."
```

**LandingEnBus**: `lib/estados.ts` (etiquetas pasajero de encomienda, copia de la columna "pasajero" de §4), `lib/urls.ts` (`cooperativasUrl(): string | null`, `soporteWhatsApp(): string | null`, sin `localhost`), `lib/supabase.ts` (`obtenerSupabaseAdmin(): SupabaseClient | null`, sin lanzar al importar; se mantiene el export `supabaseAdmin` para `registro-cooperativa`), `lib/consultas.ts` (solo servidor: `server-only` no está instalado y no se añade; se importa solo desde server components y server actions; `rastrear(codigo)`, `cotizar(peso, origen, destino)`, `rutasPopulares()`, `estadisticas()`; todas devuelven `null`/`[]` sin configuración y nunca lanzan).

---

## 4. Vocabulario único y glosario (#22)

Etiqueta **pasajero** (app, landing) / **operador** (panel, admin). Los tonos se comparten.

| Dominio · estado | Pasajero | Operador | Tono |
|---|---|---|---|
| encomienda · PENDIENTE_DE_ESCANEO | Por entregar en taquilla | Por recibir | pendiente |
| encomienda · EN_RECEPCION | Recibiéndose en taquilla | En recepción | pendiente |
| encomienda · POR_PAGAR | Pago pendiente | Por cobrar | pendiente |
| encomienda · PAGADA | Pagada · por salir | Lista para despacho | info |
| encomienda · EN_TRANSITO | En camino | En tránsito | info |
| encomienda · EN_OFICINA_DESTINO | Lista para retirar | En oficina de destino | exito (pasajero) / info (operador) |
| encomienda · ENTREGADA | Entregada | Entregada | exito |
| encomienda · CANCELADA | Cancelada | Cancelada | neutro |
| encomienda · DEVUELTA | Devuelta al remitente | Devuelta al remitente | terminado |
| boleto · RESERVA_SIN_PAGAR | Sin pagar | Reserva sin pagar | pendiente |
| boleto · PAGO_EN_VERIFICACION | Pago en verificación | Pago por verificar | pendiente |
| boleto · PAGO_RECHAZADO | Pago rechazado | Pago rechazado | peligro |
| boleto · RESERVADO (sin subestado) | Apartado | Apartado | pendiente |
| boleto · PAGADO | Confirmado | Pagado | exito |
| boleto · USADO | Viaje realizado | Embarcado | terminado |
| boleto · CANCELADO | Cancelado | Cancelado | neutro |
| boleto · EXPIRADO | Vencido | Vencido | terminado |
| reembolso · pendiente / procesado | Reembolso pendiente / Reembolsado | Por devolver / Devuelto | pendiente / exito |
| viaje · PROGRAMADO / EN_CURSO / COMPLETADO / CANCELADO | Programado / En ruta / Completado / Cancelado | igual | info / info / terminado / neutro |
| pago · PENDIENTE / APROBADO / RECHAZADO | En verificación / Confirmado / Rechazado | Por verificar / Aprobado / Rechazado | pendiente / exito / peligro |
| cooperativa · PENDIENTE / RECHAZADA / ACTIVA / SUSPENDIDA / DESACTIVADA | — | En revisión / Rechazada / Activa / Suspendida / Desactivada | pendiente / peligro / exito / pendiente / neutro |
| incidencia · ABIERTA / EN_PROCESO / RESUELTA | Recibido / En revisión / Resuelto | Abierta / En proceso / Resuelta | peligro / pendiente / exito |
| ciclo · pagado=false / true | — | Pendiente / Pagado el dd/mm | pendiente / exito |

Modalidad: ORIGEN "Paga al enviar" (largo: "Paga quien envía, al entregar el paquete") · DESTINO "Paga al retirar" (largo: "Paga quien recibe, al retirarlo"). Roles: Pasajero · Taquillero · Administrador de cooperativa · Administrador EnBus. Métodos: Pago Móvil · Transferencia · Zelle · Efectivo. Etapas de la línea de tiempo (app): Envío creado · Recibida en taquilla · En camino · Lista para retirar · Entregada.

Nombres de pantalla (menú = H1 = breadcrumb): App: pestañas "Inicio", "Boletos" (título "Mis boletos", CTA "Buscar viaje"), "Encomiendas" (título "Mis encomiendas", CTA "Enviar encomienda"); selector de Inicio "Viajar | Enviar encomienda"; tarjetas "Boletos activos" / "Encomiendas activas"; detalle "Pase de abordaje". Panel: "Resumen", "Taquilla de boletos", "Taquilla de encomiendas", "Pagos por verificar", "Reembolsos" (nuevo), "Despacho", "Recepción en destino", "Entrega", "Rutas", "Viajes", "Empleados", "Configuración". Admin: "Resumen", "Solicitudes", "Cooperativas", "Buscar encomienda" (nuevo), "Tarifas", "Comisiones", "Incidencias", "Usuarios".

`Specs/00_General/Glosario.md` (nuevo, una página): términos **Boleto**, **Pase de abordaje** (el QR + código corto `BOL-XXXX-XXXX`), **Viaje / Salida**, **Encomienda** (no "paquete" en títulos), **Código de seguimiento** (`EB-AAMMDD-NNNNN`), **PIN de retiro**, **Paga al enviar / Paga al retirar**, **Taquilla**, **Taquillero / Administrador de cooperativa / Administrador EnBus**, **Registrar pago** (acción) / **Pagado · Pendiente** (estado), **Reembolso**, **Apartar** (reservar sin pagar), **Tasa BCV**; la tabla de estados de arriba; y la regla "en títulos y botones se usa el término del glosario; los sinónimos solo en texto corrido".

---

## 5. Por mejora: qué falta, cómo y copy

### #19 Errores honestos con "Reintentar" (M-10, M-12, M-31, M-36, M-45, APP-12, APP-19, APP-37, PC-52, DS-08)
- App `SearchForm`: si falla la carga de fechas, `activeDates = null` **no** bloquea: calendario sin restricción, CTA habilitado y ayuda inline "No pudimos verificar las fechas con salidas. Puedes buscar igual." + enlace "Reintentar". Un CTA deshabilitado siempre dice qué falta ("Elige origen y destino").
- App `buscar`: los ocupados se leen con `fn_asientos_ocupados`; se limpian al cambiar de salida (M-17); si fallan: "No pudimos ver qué asientos están ocupados." + "Reintentar", y "Apartar asientos" deshabilitado hasta tenerlos.
- App listas (`(tabs)/boletos`, `(tabs)/encomiendas`, `notificaciones`): con `error` y sin datos → `ErrorState` ("No pudimos cargar tus boletos" / "tus encomiendas" / "tus notificaciones", descripción `humanizeError`); con `error` y caché → `StaleBanner`.
- App `nueva`: costo estimado con `fn_cotizar_envio_publico`; si falla: "No pudimos calcular el costo estimado. La taquilla lo calcula al pesar el paquete." + "Reintentar".
- App `enviar/[id]`, `recibir/[id]`: "Intentar de nuevo" → `ErrorState` (con carga).
- Panel `ScanInput` (modo encomiendas): `.maybeSingle()`; error de red (`isNetworkError` o `navigator.onLine === false`) → "Sin conexión: no se puede validar el código. Revisa tu internet."; sin fila → "No encontramos la encomienda {código}. Revisa el código o búscala en la lista."; búsqueda de `tracking_id` en mayúsculas; placeholder por modo ("Escanea el QR o escribe el código de seguimiento (EB-…)" / "Escanea el QR del boleto o escribe su código").
- Regla de revisión para todos los clusters: ningún `catch` termina solo en `console.*` en un archivo propio; si la pantalla queda vacía por un error, se muestra `ErrorState`.

### #20 humanizeError en todo lo que aún muestra texto técnico
Sustituir `err.message`/`error.message` por `humanizeError(err, "<acción en infinitivo>")` en: `app/admin/(panel)/{comisiones,cooperativas,incidencias,solicitudes,usuarios}/actions.ts`, `lib/data/admin-{cooperativas,tarifas,usuarios}.ts` (lanzar `new Error(humanizeError(...))`), `lib/email.ts` (devolver `"No pudimos enviar el correo."` y loguear el detalle), `app/cooperativas/(panel)/configuracion/{actions.ts,tab-datos.tsx,tab-metodos-pago.tsx,tab-sucursales.tsx,hardware/page.tsx}`, `components/entrega/pin-input.tsx`, `app/cooperativas/registro/email-helper.ts`, `error.tsx` del panel y del admin ("No pudimos cargar esta sección. Reintenta; si sigue pasando, avísanos con este código: {digest}" + "Reintentar" + "Volver al resumen"), `EnBusApp/app/viajes/[id].tsx`. Aceptación: `grep -rnE "error: (err|error|e)\.message|\? (err|error)\.message|\{error\.message" PanelCooperativas/src EnBusApp/app` vacío (salvo `lib/errores.ts`).

### #21 Contraste accesible en panel, admin y landing (DS-01, AD-01, AD-08, LP-07)
- Panel `globals.css`: `--ring: #202020` en claro (oscuro `#FFC757`); tokens nuevos `--success-text #15803D`, `--warning-text #B45309`, `--info-text #1D4ED8`, `--destructive-text #B91C1C` (oscuro `#4ADE80`, `#FBBF24`, `#93C5FD`, `#F87171`) con su `--color-*` en `@theme`; regla en comentario: "el amarillo es superficie; como texto usar `text-primary-text`".
- `StatusBadge`: pendiente `bg-amber-100 text-amber-900`, exito `bg-emerald-100 text-emerald-900`, info `bg-blue-100 text-blue-900`, peligro `bg-red-100 text-red-900`, terminado `bg-slate-200 text-slate-800`, neutro `outline`; variantes `dark:` con `/15` y texto `-200`. Todos ≥ 4,5:1.
- `text-primary` usado como color de texto → `text-primary-text` (en botones `bg-primary` se queda `text-primary-foreground`). Cada cluster en sus archivos. Aceptación global: `grep -rnE "text-primary(\s|\"|$)" PanelCooperativas/src --include=*.tsx | grep -v components/ui` vacío.
- Admin (AD-01, AD-04, AD-08): `error.tsx`, `not-found.tsx`, `loading.tsx`, `admin-shell`, `admin-sidebar`, diálogos, `incidencia-detail`, `usuario-detail-tabs`, `cooperativa-detail-tabs`: `bg-slate-950/900`, `text-white`, `text-slate-300/400/500` → `bg-background`/`bg-card`/`text-foreground`/`text-muted-foreground`; enlaces `text-foreground underline decoration-primary underline-offset-4`. Login admin: `text-muted-foreground`, "Continuar con Google", enlace "¿Olvidaste tu contraseña?" → `/cooperativas/recuperar`.
- Landing (LP-07): etiquetas de formulario 14 px `text-foreground`; ayudas ≥ 12 px `text-muted-foreground` (#666); borde de inputs `#8C8C8C` (≥ 3:1); `focus-visible:ring-2 ring-foreground ring-offset-2`; en secciones `bg-primary` el foco es `ring-foreground`.

### #22 Mapa único de estados y glosario (M-07, P-20, P-30, A-06, APP-10, PC-09, DS-03, DS-04)
Ver §4. App: `estados.ts` aplica la columna "pasajero" (incluye reembolso y etapas); pantallas con los nombres de §4. Panel/admin: `lib/estados.ts` + `StatusBadge dominio=…`; quitar mapas locales (`incidencias-table.getStatusBadge/getTipoLabel`, `usuario-detail-tabs` 57-92 y su "Fallido"/"Efectivo", `ciclos-table` "solvente/liquidado/Listo" → "Pendiente"/"Pagado el dd/mm"/"Registrar pago"); `usuario-detail-tabs` usa `estado_verificacion`, `monto_bs` y `moneda` (pendiente fase 2: RECHAZADO ya no sale "Por verificar"). Menú, H1 y breadcrumb idénticos. `Glosario.md`.

### #23 Recuperar contraseña y "Revisa tu correo" (M-01, M-04, APP-06)
- `recuperar.tsx`: `resetPasswordForEmail(email, { redirectTo: redirectAuth('recuperar') })` → `router.replace('/revisa-correo', { email, tipo: 'recuperar' })`. Prellenar el correo si viene del login (`?email=`).
- `revisa-correo.tsx` (nueva): icono de sobre; título "Revisa tu correo"; texto `tipo=registro`: "Te enviamos un enlace a {j•••@gmail.com} para confirmar tu cuenta. Puede tardar unos minutos y llegar a Spam o Promociones."; `tipo=recuperar`: "Te enviamos un enlace a {…} para crear una contraseña nueva. Ábrelo desde este teléfono."; botones "Reenviar correo" (cuenta atrás 60 s: "Reenviar en 0:42"; registro → `supabase.auth.resend({ type: 'signup', email, options: { emailRedirectTo: redirectAuth('registro') } })`, recuperar → `resetPasswordForEmail`), "Volver a iniciar sesión", "Usar otro correo". Errores con `humanizeError(err, 'recuperar')`.
- `login.tsx` registro sin sesión → `router.replace('/revisa-correo', { email, tipo: 'registro' })` (sin toast); `signUp` con `emailRedirectTo: redirectAuth('registro')`. Quitar el toast "Sesión iniciada con éxito" (APP-07). Tagline "Boletos de autobús y encomiendas entre ciudades, desde tu teléfono" (M-05).
- `auth/callback.tsx` (nueva): `useURL()`/`Linking.getInitialURL()` → `completarSesionDesdeUrl`; mientras: `LoadingState` "Entrando…"; `tipo=recuperar` → `router.replace('/restablecer')`; otro → `/(tabs)`; error → mensaje + "Volver a iniciar sesión" ("El enlace venció o ya se usó. Pide uno nuevo.").
- `restablecer.tsx` (nueva): "Crea una contraseña nueva"; campos "Contraseña nueva" (mín. 6, `autoComplete="new-password"`) y "Repite la contraseña"; botón "Guardar contraseña" → `supabase.auth.updateUser({ password })` → toast "Listo. Ya puedes entrar con tu nueva contraseña." → `/(tabs)`. Sin sesión: "Abre el enlace del correo desde este teléfono para cambiar tu contraseña." + "Pedir otro enlace".
- `app/_layout.tsx`: el guard no saca de `auth/callback` (segmento `auth`) ni de `(auth)/restablecer` con sesión; `(auth)/revisa-correo` sin sesión permitido.

### #24 Google en móvil y cédula antes de la primera compra (M-02, M-06, APP-05)
- `supabase.ts`: `flowType: 'pkce'`.
- `login.tsx` Google: `WebBrowser.maybeCompleteAuthSession()`; `signInWithOAuth({ provider: 'google', options: { redirectTo: redirectAuth('google'), skipBrowserRedirect: true, queryParams: { prompt: 'select_account' } } })` → `WebBrowser.openAuthSessionAsync(data.url, redirectTo)`; `success` → `completarSesionDesdeUrl(res.url)`; `cancel`/`dismiss` → sin mensaje; error → "No pudimos entrar con Google. Intenta de nuevo o usa tu correo y contraseña." Botón "Continuar con Google".
- Registro con correo: cédula y teléfono validados con `validation.ts` (formato venezolano); `returnKeyType` encadenado; `autoComplete` en contraseñas.
- `usePerfil` + `CompletarPerfilSheet`: copy título "Completa tus datos"; `motivo='compra'`: "Para emitir tus boletos necesitamos tu cédula y tu teléfono. Solo te lo pedimos una vez."; `'envio'`: "Para registrar tu envío necesitamos tu cédula y tu teléfono…"; campos "Nombre y apellido", "Cédula" (placeholder V-12345678), "Teléfono" (0414-1234567); botón "Guardar y continuar"; cédula/teléfono ya usados: "Esa cédula ya está registrada en otra cuenta. Si es tuya, entra con esa cuenta o escríbenos por WhatsApp." Se abre en `buscar` al tocar "Apartar asientos" y en `nueva` al tocar "Generar código QR" si `!completo`; en `perfil` un aviso "Faltan tus datos para comprar" con "Completar".

### #25 Varios asientos con pasajero y confirmación con todos los boletos (M-15, M-16, APP-34)
- Asistente de `buscar` en 4 pasos: "Salida · Asientos · Pasajeros · Pago" (`StepIndicator`). Tras `reservar` → paso "Pasajeros" con `PasajerosForm` (nuevo): una tarjeta por asiento "Asiento 14": "Nombre y apellido", "Cédula", "Teléfono (opcional)"; la primera se prellena con el perfil y lleva el chip "Soy yo"; ayuda bajo la cédula "Si viaja un menor sin cédula, usa la de su representante y escribe el nombre del menor."; botón "Continuar al pago" / "Guardando…" → `fn_asignar_pasajeros`; errores por tarjeta con `detail.asientos`.
- Pago: igual que fase 2 (registrar o "Apartar y pagar en taquilla"); `EB_DATOS_PASAJERO` vuelve al paso "Pasajeros" marcando los asientos.
- Éxito → `router.replace('/boletos/compra/[id]', { id: compra_id, recien: 'pago'|'reserva' })`. Pantalla nueva "Tu compra": encabezado `recien=pago` "¡Listo! Registramos tu pago" + "La cooperativa lo revisará y te avisaremos cuando tus boletos queden confirmados."; `recien=reserva` "Tus asientos están apartados" + "Paga en la taquilla de {cooperativa} antes de las {hh:mm} o se liberarán."; resumen (ruta, salida, "2 boletos · Asientos 14 y 15", total `<Monto>`); filas por boleto "Asiento 14 · Ana Pérez · V-12.345.678 · [estado]" que abren `/boletos/[codigo]`; CTA "Ver pase de abordaje" (1 boleto) o "Ir a Mis boletos". Datos: `boletos` por `compra_id` (RLS del comprador) con embed de viaje.
- `viajes/[id].tsx` (ruta huérfana, M-57): carga el viaje y hace `router.replace('/boletos/buscar', { origen, destino, fecha, viajeId })`; `buscar` preselecciona `viajeId` si viene. `useWizardBack({ bloqueado: checkout.enCurso })`.
- `SeatSelector`: avisa "El asiento 14 acaba de ser tomado. Elige otro." en lugar de soltarlo en silencio (M-14) usando los ocupados de `fn_asientos_ocupados` y realtime de `viajes.asientos_disponibles` para recargar.

### #26 Pase de abordaje (M-32, M-33, APP-32, APP-33, DS-09)
- `boletos/[id]`: bloque superior "Sale {vie. 04/10 · 8:30 a. m.}" en `heading`; "Desde: {sucursal.nombre} · {direccion}" (`fn_sucursales_en_ciudad(cooperativa_id, ciudad_origen)`; 0 → "Pregunta en la taquilla de {cooperativa} en {ciudad} por el punto de salida."; >1 → "Puede salir desde: {A} o {B}. Confírmalo con la cooperativa."; teléfono y horario si existen) y "Llega 30 minutos antes con tu cédula."; asiento grande en `foreground` heavy (≥ 30 pt); pasajero y cédula con `formatCedula`.
- QR: `QRCodeViewer data={qr_embarque_data || 'PASS-'+codigo} codigoLegible={formatCodigoBoleto(codigo)} ampliable size={200}`; texto bajo el QR "Si el lector falla, dicta este código: BOL-7CAB-E4AD".
- Encomiendas: QR con `qrEncomienda(e)` (tracking) y `codigoLegible={tracking_id}`.
- "Compartir pase" mantiene `ViewShot`.

### #27 Cancelación y reembolso (M-29, M-30, P-49, APP-35)
App (`boletos/[id]`), un solo `BottomSheet`:
- Reserva sin pagar: título "Cancelar reserva"; "Liberaremos el asiento {14} de inmediato. No se te cobrará nada."; botones "Sí, cancelar reserva" / "Cancelando…" y "Mantener reserva".
- Pagado (y la salida aún no ocurrió): título "Cancelar boleto"; "Te devolveremos {Bs 1.187,50} (95 % del pasaje; ≈ USD 11,88). La cooperativa hace la devolución en 1 a 2 días hábiles, por el mismo medio con que pagaste y a la tasa BCV del día en que la haga. El asiento queda libre y este pase deja de servir."; motivo obligatorio con chips "Cambio de planes", "Problema de salud", "Compré otro boleto", "Otro"; botón "Cancelar boleto y pedir reembolso".
- Salida ya ocurrida: sin botón; "Este viaje ya salió; no se puede cancelar desde la app. Si tuviste un problema, repórtalo." → `/ayuda`.
- Pago en verificación: sin botón; "Tu pago está en verificación. Para cancelar, espera la respuesta de la cooperativa o escríbele."
- Detalle cancelado: por pasajero con reembolso pendiente "Reembolso pendiente: la cooperativa te devolverá USD 9,98 (≈ Bs …) en 1 a 2 días hábiles."; por la cooperativa "La cooperativa canceló este viaje: {motivo}. Te devolverá el 100 % de tu pasaje."; procesado "Reembolso enviado el 05/10 por Pago Móvil (ref. 98765). Si no lo ves en tu cuenta, repórtalo." (+ "Reportar un problema"); sin reembolso "Cancelado sin costo: no habías pagado." Select con `reembolso_procesado, reembolso_procesado_at, reembolso_metodo, reembolso_referencia`.
Panel:
- `viajes`: "Cancelar viaje" (admin) con `ConfirmDialog`: título "¿Cancelar el viaje {Caracas → Valencia} del {05/10 a las 8:00 a. m.}?"; impacto (de `checkBoletosVendidos`, ampliada a `{pagados, total_usd, reservas, pagos_pendientes, encomiendas_en_transito}`): "• {n} boletos pagados: se reembolsará el 100 % (USD X). Los verás en Reembolsos." "• {m} reservas sin pagar se anularán." "• Avisaremos a cada pasajero con tu motivo." "• {k} encomiendas ya despachadas seguirán «En tránsito»: envíalas en otro bus."; motivo obligatorio con chips "Falla mecánica", "Vía cerrada o mal tiempo", "Pocos pasajeros", "Otro"; verbo "Cancelar viaje y avisar a los pasajeros"; `EB_PAGOS_PENDIENTES` → error inline + enlace "Ir a Pagos por verificar"; éxito toast "Viaje cancelado. {n} reembolsos pendientes." con acción "Ver reembolsos". Sin `alert()`/`confirm()`.
- `reembolsos/page.tsx` (nueva; menú "Reembolsos", icono `ArrowCounterClockwise`, ambos roles): título "Reembolsos"; descripción "Devoluciones de boletos cancelados. Devuelve el dinero por el mismo medio con que pagó el pasajero y regístralo aquí."; pestañas "Por devolver ({n})" / "Devueltos"; filas agrupadas por compra: Cancelado (fecha, "por el pasajero"/"por la cooperativa"), Boleto(s) y asiento(s), Pasajero y contacto (teléfono con enlace WhatsApp), Viaje, Monto `<Monto usd>` (Bs a la tasa de hoy), Cómo pagó ("Pago Móvil · 0102 · ref. 123456"; "Pago sin verificar" si `pago_estado` ≠ APROBADO), [Registrar devolución]. Diálogo: "Devuelve {Bs X} (USD Y a la tasa BCV de hoy) a {nombre}."; "¿Cómo lo devolviste?" (Pago Móvil, Transferencia, Zelle, Efectivo), "Referencia de la devolución", "Nota (opcional)"; botón "Registrar devolución" → toast "Devolución registrada. Le avisamos al pasajero." Vacío: "No tienes reembolsos pendientes. Cuando un pasajero cancele un boleto pagado o canceles un viaje, aparecerán aquí."

### #28 Canal de ayuda (M-52, A-09, APP-52)
- App `ayuda.tsx` (nueva; params `tipo`, `id`, `codigo`): título "Ayuda"; tarjeta "Escríbenos por WhatsApp" (solo si `SOPORTE_WHATSAPP`) → mensaje "Hola, necesito ayuda con EnBus. {Boleto BOL-… | Encomienda EB-…}"; "Reportar un problema": chips de categoría (Pago, Boleto, Encomienda, Mi cuenta, Otro; preseleccionada por `tipo`), campo "Cuéntanos qué pasó" (mín. 10), recurso mostrado "Sobre: Boleto BOL-7CAB-E4AD"; botón "Enviar reporte" / "Enviando…" → `fn_reportar_problema`; éxito "Recibimos tu reporte {INC-…}. Te responderemos por WhatsApp o por correo en menos de 24 horas hábiles."; `EB_DEMASIADOS_REPORTES` con su hint; "Preguntas frecuentes": ¿Cuándo me devuelven el dinero? · Pagué y mi boleto dice "Pago en verificación" · Perdí mi PIN de retiro · ¿Qué hago si mi pago fue rechazado? (respuestas de 1–2 frases coherentes con §5).
- Entradas: `perfil` sección "Ayuda" ("Ayuda y soporte", "Cerrar sesión" con confirmación "¿Cerrar sesión? Se borrarán los boletos guardados en este teléfono."; versión con `expo-constants`); `boletos/[id]` "¿Problemas con este boleto? Reportar un problema"; `enviar/[id]` y `recibir/[id]` "¿Problemas con este envío?"; tarjeta de reserva vencida y de pago rechazado.
- Admin incidencias: tipo "Reporte de usuario" con categoría, boleto (código) o encomienda (tracking) enlazados y contacto del usuario.
- Panel: el mensaje de PIN bloqueado nombra el WhatsApp de soporte si `NEXT_PUBLIC_SOPORTE_WHATSAPP` existe.

### #31 Nueva encomienda (M-38, M-39, M-42, M-43, M-44, APP-39…42)
- Paso 1: al elegir cooperativa, "Llévalo a: {sucursal} · {dirección} · {horario}" (`fn_sucursales_en_ciudad(coop, origen)`; 0 → "Pregunta en la taquilla de {cooperativa} en {ciudad}"); en cada cooperativa "Desde {Bs X} (1 kg)" con `fn_cotizar_envio_publico(1, origen, destino)`.
- Paso 2: "¿Quién paga el envío?" en tarjetas radio, **sin valor por defecto** (bloquea "Continuar" con "Elige quién paga el envío"): "Yo, al entregarlo en la taquilla" / "Quien recibe, al retirarlo". "Peso aproximado (kg) · opcional" con ayuda "Lo usamos para estimar el costo. Máximo 25 kg." "Valor del contenido (USD) · opcional" con ayuda "Si se pierde o se daña, el seguro cubre hasta 3 veces este valor." Enlace "Qué no se puede enviar" → hoja con la lista referencial (constante `ARTICULOS_PROHIBIDOS`: dinero en efectivo y joyas, armas y municiones, drogas o medicinas controladas, líquidos inflamables o explosivos, animales vivos, alimentos perecederos) y la nota "Lista referencial: cada cooperativa puede tener reglas adicionales." (confirmar con negocio, paso manual 9). Errores con nombre de campo ("El nombre de quien recibe debe tener al menos 2 caracteres").
- Paso 3: encabezado "Revisa antes de generar tu código" con icono neutro (`ClipboardText`), sin check verde; resumen con "Editar" por bloque; CTA "Generar código QR"; antes, `CompletarPerfilSheet motivo='envio'` si falta.
- Tras insertar → `enviar/[id]?recien=1` con "¡Encomienda registrada! Lleva tu paquete a {sucursal} y muestra este código." La foto se sube a `<userId>/…` y se guarda en `foto_cliente_path`.

### #32 Detalle de envío y recepción (M-51, APP-45, APP-46)
- `enviar/[id]`: QR = tracking (código legible); "Avisar a {nombre} por WhatsApp" → `abrirWhatsApp(receiver_telefono, "Hola {nombre}, te envié una encomienda por {cooperativa} ({tracking}). Cuando llegue a {ciudad}, retírala en {sucursal destino} con tu cédula y tu PIN. Puedes seguirla en la app EnBus.")`; punto de retiro (sucursal destino); foto del cliente con URL firmada.
- `recibir/[id]`: PIN destacado (bloque `primaryLight`, `foreground`, botón "Copiar PIN") **solo** en EN_OFICINA_DESTINO con "Lista para retirar: presenta este PIN y tu cédula en {sucursal · dirección}"; antes, línea secundaria "Tu PIN: 1234 · Lo necesitarás cuando llegue a {ciudad}"; sin PIN: "Tu PIN aparecerá cuando la cooperativa reciba el paquete." Costo: ORIGEN "Pagado por quien te lo envió"; DESTINO con costo "Pagas al retirar: {Monto}"; sin costo "Se calcula cuando la taquilla pese el paquete". Remitente: "Teléfono de quien envía: •••••1234". Cobro: con la política nueva se ve el pago del otro → "Quien envía ya registró el pago; está en verificación." / "Pagado por quien envía" (usar `pagador_id === user.id` para "Tu pago…"); nunca formulario con costo 0.
- `StatusTimeline` con etapas del glosario.

### #33 Taquilla de encomiendas (P-27, P-31, P-35, PC-28, PC-30)
- Botón "Nueva encomienda (sin app)" → `NuevaEncomiendaDialog` (nuevo) en 3 pasos con `<form>` y Enter = siguiente: 1 "Quién envía" (nombre, cédula, teléfono); 2 "Quién recibe"; 3 "Paquete": destino (Select de rutas activas que salen de la ciudad de la sucursal del usuario: "Valencia (Carabobo)"; si el usuario no tiene sucursal, selector "Sucursal donde recibes"), "Contenido", "Peso (kg)" (autoFocus), "Valor declarado (USD, opcional)", "¿Quién paga?" ("Paga al enviar (ahora)" / "Paga al retirar"); estimado con `fn_cotizar_envio_publico` filtrado a la cooperativa; botón "Registrar y recibir" → `fn_registrar_encomienda_taquilla` (`idemKey = crypto.randomUUID()` al abrir). Resultado: "Encomienda {EB-…} registrada." "PIN de retiro: **1854** — dáselo a quien envía para que se lo pase a quien recibe." Botones "Enviar PIN por WhatsApp a {destinatario}" (`wa.me/58…`), "Imprimir guía" (térmica o PDF, con el PIN) y "Continuar" → foto → cobro si ORIGEN.
- Recepción de encomiendas de la app y alta presencial: **recepción → foto → cobro (solo ORIGEN)**; en DESTINO también se pide la foto (pendiente fase 2).
- `PhotoCaptureModal`: se puede cerrar; opciones "Tomar foto" (cámara), "Subir archivo" (`<input type="file" accept="image/*" capture="environment">`) y "Omitir por ahora" (motivo: "La cámara no funciona", "El cliente tiene prisa", "Otro") que guarda `foto_omitida_motivo`; sin cámara ya no ofrece "Recargar página"; sube a `<encomiendaId>/<ts>.jpg` y guarda la **ruta**; error "No pudimos subir la foto. Intenta de nuevo o súbela después desde el detalle."
- `RecepcionModal` con `EB_SIN_RUTA`: alerta "Tu cooperativa no tiene una ruta activa hacia {ciudad}." + (admin) enlace "Crear ruta" + botón "No recibir la encomienda" → `RechazarEncomiendaDialog` (nuevo, `ConfirmDialog` con chips "No tenemos ruta a ese destino", "Contenido no permitido", "Paquete mal embalado", "Excede el peso o el tamaño") → `fn_rechazar_encomienda_origen`; toast "Encomienda rechazada. Le avisamos al cliente." También en `DetalleSheet` para PENDIENTE_DE_ESCANEO / EN_RECEPCION / POR_PAGAR.
- `DetalleSheet`: fotos del cliente y de la taquilla con URL firmada; insignia "Falta foto" + "Agregar foto"; remitente: `remitente_*` si `origen_registro='TAQUILLA'`; modalidad con `MODALIDAD_PAGO.largo`.
- Contador "Pagos por verificar ({n})": suscripción a `pagos` (`cooperativa_id=eq.{id}`) en la página para recargarlo.

### #34 Entrega (P-45, P-46, A-08, PC-38…41)
- `entrega/page.tsx`: `ScanInput` (modo encomiendas, autofocus) arriba: si la encomienda está EN_OFICINA_DESTINO en la sucursal → abre el modal; si no: "Esta encomienda todavía va en camino.", "Ya fue entregada el {fecha}.", "Está en la oficina de {ciudad}, no en la tuya." Lista: cobro ámbar "Cobrar al retirar: {Monto}" vs verde "Pagada"; días en oficina contados como `calcular_dias_habiles(updated_at)` y "Se devuelve al remitente en {5 − d} días hábiles".
- `EntregaModal` en pasos: 1 Cobro (fase 2, si DESTINO sin pago aprobado). 2 PIN (autoFocus; `validarPin` → `fn_validar_pin_retiro`; "PIN incorrecto. Te quedan {n} intentos."; bloqueado: admin → "Desbloquear PIN" (`ConfirmDialog` con motivo → `fn_desbloquear_pin`) o "Entregar sin PIN" (motivo ≥ 10); taquillero → "El PIN se bloqueó por intentos fallidos. Pídele al administrador de tu cooperativa que lo desbloquee{ o que el destinatario nos escriba por WhatsApp {n}}."). 3 Identidad: "Revisa la cédula de quien retira" con "{nombre} · {V-12.345.678}"; casilla obligatoria "Revisé la cédula y coincide"; interruptor "Retira otra persona autorizada" → "Nombre de quien retira" y "Cédula de quien retira". 4 "Entregar encomienda" → `confirmarEntrega` → `fn_entregar_encomienda`; toast "Encomienda {EB-…} entregada a {nombre}." (sin emojis). `EB_COBRO_PENDIENTE` vuelve al paso 1.
- `pin-input.tsx`: autofocus, sin `animate-shake` inexistente (usar `motion-safe:animate-pulse` una vez o borde rojo), mensajes humanizados.
- Admin "Buscar encomienda" (`/admin/encomiendas`, nuevo): campo "Código de seguimiento (EB-…)"; resultado con estado (`StatusBadge dominio="encomienda"`), cooperativa, ruta, remitente (o `remitente_*`) y destinatario con teléfonos, intentos de PIN y "PIN bloqueado"; acción "Desbloquear PIN" (motivo) → `fn_desbloquear_pin`; enlaces a usuario y cooperativa. `usuario-actions` usa la misma RPC (el UPDATE directo no tenía política).

### #35 Venta en taquilla (P-23, PC-22…24)
Verificado hecho en fase 2: monto a cobrar, varios asientos con pasajero, métodos y bancos, vuelto, `resetFlow`, pasos y `<form>`. Falta:
- `printBoleto(boleto, cobro?, viaje?: { cooperativa: string; origen: string; destino: string; salida: string; unidad?: string | null })`: líneas "Cooperativa", "Ruta: Caracas - Valencia", "Sale: 04/10 08:30 a. m.", "Unidad", y luego las de fase 2. Sin "→".
- Ventana bloqueada: en lugar de `window.print()` de la página, toast "Tu navegador bloqueó la ventana de impresión. Permite ventanas emergentes para este sitio e intenta de nuevo."
- `escpos.ts`: transliterar antes de codificar (`á→a`, `é→e`, `í→i`, `ó→o`, `ú/ü→u`, `ñ→n`, mayúsculas igual; quitar `¿ ¡ « » –`) para impresoras CP437/850 (pendiente fase 2).

### #36 Confirmaciones según reversibilidad (P-57, PC-48, AD-05, AD-12, DS-07)
Regla: **irreversible o con impacto en terceros** → `ConfirmDialog` con impacto concreto, verbo específico, carga y motivo cuando afecte a terceros; **reversible y frecuente** → ejecutar y toast con "Deshacer" si existe la operación inversa. Aplicación: borrar método de pago / sucursal (P-57); desactivar/reactivar empleado; revocar invitación; cancelar viaje; no recibir encomienda; desbloquear PIN / entregar sin PIN; admin: suspender (motivo obligatorio, toast "{Cooperativa} suspendida. No podrá vender en la app."), reactivar, desactivar (escribir el nombre o el RIF + motivo, impacto con encomiendas en curso y ciclos sin pagar, verbo "Sí, desactivar para siempre"), liquidar ciclo ("Registrar pago" con referencia y fecha), incidencias (tomar, resolver, activar seguro), usuarios (suspender con motivo y doble confirmación si es admin); app: cancelar reserva/boleto (§#27), cerrar sesión. Sin asteriscos de Markdown en textos (usar `<strong>`). Aceptación: `grep -rnE "\b(alert|confirm)\(" PanelCooperativas/src --include=*.tsx | grep -v components/ui` vacío; ningún `AlertDialogAction` sin `disabled` mientras corre.

### #37 Rechazo reversible y datos completos en solicitudes (A-01, A-02, AD-09, AD-10)
- `rechazarSolicitud(id, motivo)` → `rpc('fn_cambiar_estado_cooperativa', { p_estado: 'RECHAZADA', p_motivo })` + `sendRejectionEmail` con el motivo y "Corrige tus datos en tu panel ({url}/cooperativas/login) y pide una nueva revisión." Diálogo: "La cooperativa recibirá el motivo por correo y lo verá en su panel. Podrá corregir sus datos y pedir una nueva revisión."; chips "RIF inválido o incompleto", "Datos de contacto incompletos", "No pudimos verificar la cooperativa", "Documentación pendiente"; botón "Rechazar y avisar".
- `aprobarSolicitud`: además `motivo_estado: null, estado_cambiado_at, estado_cambiado_por`; diálogo de comisión con "Por cada Bs 100 vendidos, EnBus recibe Bs {x}."
- Acciones nuevas: "Reabrir solicitud" (RECHAZADA → PENDIENTE) y "Descartar solicitud" (→ DESACTIVADA, escribir el nombre).
- Tabla: pestañas "En revisión ({n})" / "Rechazadas"; columnas Cooperativa (nombre, RIF, insignia "RIF incompleto"), Representante, Contacto (correo, teléfono), Recibida, Cuenta ("Ya creó su cuenta" / "Invitación pendiente" / "Sin cuenta"), Estado (`StatusBadge dominio="cooperativa"`; rechazada con motivo); fila → hoja lateral con todo + `mensaje_registro` y las acciones. Datos en `lib/data/admin-solicitudes.ts` (columnas nuevas; respaldo: parsear `descripcion` antigua).
- Admin `cooperativa-actions` usa `fn_cambiar_estado_cooperativa` para suspender/reactivar/desactivar (motivo), con `ConfirmDialog`.

### #38 Aviso persistente del estado y puesta en marcha (P-08, P-15, PC-12)
- `EstadoCooperativaBanner` (nuevo, sustituye `pending-approval-banner.tsx`; sin botón de cerrar; `role="status"`): PENDIENTE (ámbar) "Tu cooperativa está en revisión (24 a 48 horas hábiles). Mientras tanto, deja tu panel listo para vender. [Ver pasos]"; RECHAZADA (rojo) "Tu solicitud fue rechazada: {motivo}. Corrige tus datos en Configuración y pide una nueva revisión." [Corregir datos] [Pedir nueva revisión] (admin; `fn_solicitar_revision_cooperativa` con mensaje opcional; toast "Enviamos tu solicitud a revisión. Te avisaremos por correo."); taquillero: "…Avísale al administrador de tu cooperativa."; SUSPENDIDA "Tu cooperativa está suspendida: {motivo}. Los pasajeros no pueden comprarte boletos en la app. Escríbenos para resolverlo." [WhatsApp]; DESACTIVADA "Tu cooperativa fue desactivada: {motivo}. Ya no puede operar en EnBus." Contraste ≥ 4,5:1 (`bg-amber-100 text-amber-950`, `bg-red-100 text-red-950`).
- Resumen (dashboard, admin): tarjeta "Puesta en marcha ({k}/4)" con `fn_checklist_cooperativa`: "Crea tu primera sucursal" → `/cooperativas/configuracion?tab=sucursales`; "Agrega un método de pago digital (Pago Móvil, transferencia o Zelle)" → `?tab=metodos-pago`; "Crea una ruta con su precio" → `/cooperativas/rutas`; "Programa tu primera salida" → `/cooperativas/viajes`; opcional "Invita a tus taquilleros" → `/cooperativas/empleados`. Se oculta con todo completo y estado ACTIVA.
- Configuración › Datos: con estado PENDIENTE/RECHAZADA el admin puede corregir nombre y RIF (normalizado; el trigger lo permite); si no, el texto "Para cambiar el nombre o el RIF, escríbenos" con WhatsApp.

### #39 Un solo flujo de registro de cooperativa (P-03, LP-06)
- Panel `/cooperativas/registro` (canónico): paso 1 en `<form>` (Enter avanza), errores por campo; correo verificado al salir del paso 1 con `rpc('fn_email_registrado')` (cliente admin) en vez de `listUsers()` sin paginar; campos nuevos "Representante legal" y "Mensaje o rutas de interés (opcional)" guardados en `representante` y `mensaje_registro`; texto lateral "Configura tu panel mientras revisamos tu solicitud (24 a 48 horas hábiles)."; éxito → entra al panel (banner PENDIENTE + checklist).
- Landing `/registro-cooperativa`: deja de crear cooperativas; explica beneficios y pasos y tiene un CTA "Crear la cuenta de mi cooperativa" → `{cooperativasUrl}/cooperativas/registro` (si falta la variable: el CTA no se muestra y se ve "El registro no está disponible en este momento. Escríbenos por WhatsApp."). Conserva "¿Te registraste antes y no te llegó la invitación?" con `reenviarInvitacion` (límite: una por RIF cada 5 minutos, por `invitaciones.created_at`).

### #40 Invitaciones a empleados (P-02, P-54, P-55, PC-05, PC-47)
- Diálogo "Invitar empleado": sin sucursales → "Primero crea una sucursal: cada empleado trabaja en una." [Ir a Sucursales]; orden **Sucursal → Rol (Taquillero / Administrador) → Correo**; resultado "Invitación lista. Vence el {sáb. 05/10 a las 2:30 p. m.} (48 horas)." con "Copiar enlace", "Enviar por WhatsApp" (`wa.me/?text=Hola, te invito a usar el panel de {cooperativa} en EnBus. Crea tu cuenta aquí (vence en 48 horas): {enlace}`) y "Listo". Sin "enlace mágico".
- Sección "Invitaciones pendientes ({n})": correo, rol, sucursal, "Vence en 30 h" / "Vencida"; acciones "Copiar enlace", "WhatsApp", "Reenviar" (renueva `expira_at` a 48 h; si vencida: "Renovar"), "Revocar" (`ConfirmDialog`; `revocada_at = now()`). Lista de empleados con columna Sucursal y rol de `ROLES`; desactivar/reactivar con `ConfirmDialog` ("¿Desactivar a {nombre}? No podrá entrar al panel hasta que lo reactives.").
- `invite/[token]`: `validateInviteToken` rechaza `revocada_at`; inválida/vencida/revocada → "Este enlace venció o ya fue usado. Pide a tu administrador uno nuevo (las invitaciones vencen a las 48 horas)." + "Ir a iniciar sesión"; sin conexión: alerta inline (sin `alert()`).
- `empleados/page.tsx`: sin `listUsers({ perPage: 1000 })`; correo y bloqueo con `auth.admin.getUserById` por empleado (como `admin-cooperativas.ts`).

### #41 Métodos de pago (P-56, P-58, PC-49, PC-50)
- Campos por tipo: Pago Móvil → Banco (`BANCOS_VE`, "0134 · Banesco"), "Teléfono de Pago Móvil" (04xx, se guarda formateado en `numero_cuenta`), "Cédula o RIF del titular", "Titular"; Transferencia → Banco, "Número de cuenta (20 dígitos)" validado, Titular, Cédula/RIF; Zelle → "Correo de Zelle", Titular; Efectivo → "Instrucciones (opcional)". `Select` del sistema, labels asociados.
- Vista previa "Así lo verá el pasajero" (filas como en `PaymentFlow`: Banco, Teléfono, C.I., Titular).
- Lista: `Switch` "Activo" con label (sin `Badge` clicable); botones con `aria-label="Editar Pago Móvil Banesco"`/`"Eliminar …"`; eliminar con `ConfirmDialog` "¿Eliminar Pago Móvil Banesco? Los pasajeros dejarán de verlo al pagar."; si tiene pagos (FK 23503): "Este método ya tiene pagos registrados y no se puede eliminar. Desactívalo para que no aparezca." con botón "Desactivar".
- Sucursales: estado y ciudad con selects de `lib/data/venezuela.ts`; campo "Horario de atención"; eliminar con confirmación (si tiene empleados o encomiendas: "Desactívala en lugar de eliminarla").

### #42 Landing (L-03…L-06, L-08, LP-01…LP-04)
- Hero: H1 "Boletos de bus y encomiendas por toda Venezuela, en un solo lugar"; subtítulo "Compra tu pasaje o envía tu paquete con cooperativas verificadas. Paga con Pago Móvil o transferencia y sigue tu viaje o tu envío."; CTA primario inline "Rastrea tu encomienda" (input "Código de seguimiento, ej. EB-261003-12345" + "Rastrear" → `/rastrear?codigo=`); secundario "Calcular costo de envío" → `#calcular`. Sin el recuadro "Imagen de servicio de envíos".
- `/rastrear` (nueva, server component + server action `rastrearEncomienda`): `supabaseAdmin.rpc('fn_rastrear_encomienda_publico')`; muestra estado (etiqueta pasajero), ruta, cooperativa y línea de tiempo; no encontrada: "No encontramos ese código. Revisa que esté completo (EB-AAMMDD-NNNNN)."; sin configuración: "El rastreo no está disponible en este momento."
- Calculadora (`#calcular`, componente cliente + server action): origen, destino (selects), peso → `fn_cotizar_envio_publico`; resultados por cooperativa con `formatMoney`; nota "Precio referencial; la taquilla confirma el costo al pesar el paquete." Errores con el `hint`.
- Rutas populares de `fn_rutas_populares` ("Desde USD 10,50 · ≈ Bs …", "{n} salidas próximas"); si no hay datos o falta la configuración, la sección no se muestra. Cifras del hero/beneficios de `fn_estadisticas_publicas` o se quitan ("50+ ciudades" fuera).
- Testimonios: se elimina la sección (no se renderiza) hasta tener reseñas reales. "App Mockup" fuera; tiendas "Próximamente" sin `opacity-50`, con "Avísame por WhatsApp" si hay número.
- Navbar: "Rastrear" → `/rastrear`; "Cómo funciona"; CTA de cooperativas al panel. Footer: enlaces "#" se ocultan (Términos, Privacidad, redes) salvo los que existan; "Una plataforma de Panas Cargo" → "EnBus"; año dinámico.
- Tildes en todo el sitio y en `metadata` ("Envíos", "Cómo funciona", "Por qué EnBus", "fácil", "envío", "a través", "verificación", "Abrir menú"); propuesta de valor con boletos en `layout.tsx`.

---

## 6. Pendientes de las fases 1 y 2

**Entran** (cluster entre paréntesis): RLS que oculta el pago de la otra parte → política `Partes de la encomienda ven su cobro` (DB); OTRO_DIA antes que OTRO_VIAJE (DB); `confirmarEntrega` sin re-validar el PIN → `fn_entregar_encomienda` (DB + PANEL-MOSTRADOR); foto de evidencia en DESTINO (PANEL-MOSTRADOR); ingresos filtrados por `created_at` → filtrar KPIs de ingresos por `verificado_at` (PANEL-GESTION en el panel; ADMIN en `lib/data/admin-dashboard.ts`); columnas DATE desplazadas por `timeZone` (`dashboard/page.tsx:240`, formatear 'YYYY-MM-DD' a mano) (PANEL-GESTION); `desbloquearPIN` del super admin sin política → `fn_desbloquear_pin` (ADMIN); `admin-usuarios` sin `monto_bs`/`moneda`/`estado_verificacion` (ADMIN); "Intentar de nuevo" sin carga → `ErrorState` (APP-BASE + consumidores); `useWizardBack` sin bloqueo en iOS (APP-BASE + APP-BOLETOS); tildes en ESC/POS (PANEL-MOSTRADOR); contador de pagos sin tiempo real (PANEL-MOSTRADOR); "Solicitar cancelación" con el viaje ya salido (APP-BOLETOS); ocupados del viaje anterior por un instante, M-17 (APP-BOLETOS); `Encomienda.costo_calculado`/`pin_retiro` tipados sin `null` (APP-BASE); `Chip` sin `accessibilityLabel` (APP-BASE); contador de la tab bar blanco sobre coral 2,6:1 → texto `foreground` sobre `primary` o blanco sobre `#C2410C` (APP-CUENTA); AD-04 y AD-17 "Período previsualizado" (ADMIN); `updateCooperativa` con logo de 5 MB → 2 MB (ADMIN); registro con `listUsers` sin paginar y paso 1 sin `<form>` (PANEL-GESTION); landing con `localhost:3001` y `reenviarInvitacion` sin límite (LANDING); M-41, M-42, M-44 (APP-CUENTA); `Audits/fase2_spec.md` §6 paso 11 debe decir `SET enbus.aplicar_cierre_fase2 = 'si';` antes de la 06 (DB).

**No entran** (justificación): `procesar-notificaciones` reintenta fallos permanentes (necesita desplegar la edge function y no es UX P1; anotar para P2); trigger legado sin `compra_id` para la app vieja (transitorio hasta la migración 06); `createTarifa` no transaccional (una vez al mes, solo super admin, el error se ve; P2 con una RPC `fn_publicar_tarifa`); hápticos dobles en toasts y título que parpadea en despacho (cosméticos); reimpresión de todos los tickets si falla la impresora a mitad y la lista de viajes de hoy tras medianoche (raros y con salida manual); caché de "sin tasa" en `useTasaBCV` (aceptable con la base vacía); `comisiones/page.tsx` sin pasar la tasa (una petición extra, sin efecto visible); landing duplicada en el panel (LP-09): solo se redirige `/` del panel a `/cooperativas/login` (PANEL-GESTION) y sus componentes quedan sin uso; brillo automático del QR (requiere `expo-brightness`).

---

## 7. Partición en oleadas

Criterio común (todos los clusters TS): `npx tsc --noEmit` y lint del proyecto sin errores nuevos en los archivos propios; sin `formatCurrency`, `` `$${…}` `` ni `` `${…} Bs` ``; sin `PENDIENTE_VERIFICACION`; ningún `catch` que termine solo en `console.*`; copy de §5 tal cual (se puede pulir sin cambiar el sentido); contratos de §3 sin cambiar firmas. Un cluster que necesite cambiar un archivo ajeno lo anota en sus notas; no lo edita.

**Oleada 1** (fundamentos; en paralelo): W1-DB, W1-APP-BASE, W1-PANEL-BASE, W1-LANDING (la landing solo depende de los contratos SQL).
**Oleada 2** (consumidores; arranca cuando termina la 1): W2-APP-BOLETOS, W2-APP-CUENTA-ENCOMIENDAS, W2-PANEL-MOSTRADOR, W2-PANEL-GESTION, W2-ADMIN.

| Cluster | Mejoras | Archivos propios (resumen; la lista exacta va en la partición estructurada) |
|---|---|---|
| W1-DB | SQL de §2, specs, glosario | `supabase/migrations/20260720000001…05` (nuevos), `Specs/00_General/{Glosario (nuevo),Payments_Spec,State_Machines_Spec}.md`, `Specs/01_Supabase_Backend/{Database_Schema_Spec,RLS_Policies_Spec}.md`, `Audits/fase2_spec.md` (solo §6 paso 11) |
| W1-APP-BASE | piezas app de §3.3, #23, #24, parte de #19/#22/#26 | `EnBusApp/src/utils/{supabase,validation,estados,errores,storage}.ts`, `src/utils/{authLinks,codigos,soporte,fotos}.ts` (nuevos), `src/types/index.ts`, `src/hooks/{usePerfil (nuevo),useWizardBack}.ts`, `src/components/{CompletarPerfilSheet (nuevo),QRCodeViewer}.tsx`, `src/components/ui/{Screen,Badge,index}`, `app/(auth)/{_layout,login,recuperar,restablecer (nuevo),revisa-correo (nuevo)}.tsx`, `app/auth/callback.tsx` (nuevo), `app/_layout.tsx`, `.expo/types/router.d.ts` |
| W1-PANEL-BASE | piezas panel de §3.3, #21 tokens, #22 mapa, PC-52 | `src/lib/{estados,ve,bancos,fotos}.ts` (nuevos), `src/lib/types/reembolsos.ts` (nuevo), `src/components/{confirm-dialog,error-state}.tsx` (nuevos), `src/components/{status-badge,scan-input,app-sidebar}.tsx`, `src/lib/{errores,navigation,admin-navigation}.ts`, `src/lib/types/{pagos,encomiendas,boletos}.ts`, `src/lib/supabase/cached.ts`, `src/hooks/use-user.tsx`, `src/app/globals.css`, `src/components/ui/{dialog,sheet}.tsx` |
| W1-LANDING | #42, #39 (landing), LP-07 | `LandingEnBus/app/{layout,page,globals.css}`, `app/registro-cooperativa/{page,actions}`, `app/rastrear/{page,actions}` (nuevos), `components/*` de la home, `components/{calculadora,rastreo-form}.tsx` (nuevos), `lib/{estados,urls,consultas}.ts` (nuevos), `lib/supabase.ts` |
| W2-APP-BOLETOS | #25, #26, #27 (app), #19/#22 de boletos | `EnBusApp/app/boletos/{buscar,[id]}.tsx`, `app/boletos/compra/[id].tsx` (nuevo), `app/viajes/[id].tsx`, `app/(tabs)/boletos.tsx`, `src/hooks/useCheckoutBoletos.ts`, `src/components/{SeatSelector,PasajerosForm (nuevo),TransactionCard,PaymentFlow}.tsx` |
| W2-APP-CUENTA-ENCOMIENDAS | #28 (app), #31, #32, #19/#22 restantes, M-55 | `EnBusApp/app/{perfil,ayuda (nuevo),notificaciones}.tsx`, `app/(tabs)/{_layout,index,encomiendas}.tsx`, `app/encomiendas/{nueva,enviar/[id],recibir/[id]}.tsx`, `src/components/{SearchForm,StatusTimeline}.tsx`, `src/contexts/ActivityContext.tsx`, `src/hooks/useEncomiendas.ts`, `src/utils/articulos.ts` (nuevo) |
| W2-PANEL-MOSTRADOR | #33, #34 (panel), #35, contraste/vocabulario en mostrador | taquilla de encomiendas y de boletos, `components/encomiendas/*` (+ `nueva-encomienda-dialog`, `rechazar-encomienda-dialog` nuevos), entrega, `components/entrega/*`, recepción en destino, despacho (página), `components/boletos/{venta-flow,seat-selector}.tsx`, `lib/printing/{print-helpers,escpos}.ts` |
| W2-PANEL-GESTION | #27 (panel), #36, #38, #39 (panel), #40, #41, #20/#21 de gestión | viajes, `reembolsos/*` (nuevo), `components/{panel-shell,pending-approval-banner}.tsx`, `components/{estado-cooperativa-banner,checklist-puesta-en-marcha}.tsx` (nuevos), dashboard, `error/not-found` del panel, rutas (cliente), empleados, `invite/[token]`, configuración (+ hardware), registro, login/recuperar/restablecer, `src/app/page.tsx` |
| W2-ADMIN | #37, #36/#20/#21/#22 del admin, #34 (admin), #28 (incidencias) | `src/app/admin/**`, `app/admin/(panel)/encomiendas/{page,actions}` (nuevos), `src/components/admin/**`, `src/components/{admin-shell,admin-sidebar}.tsx`, `src/lib/data/admin-*.ts`, `src/lib/types/admin-*.ts`, `src/lib/email.ts` |

---

## 8. Pasos manuales para el usuario

1. Aplicar 20260720000001 → 05 en una rama de Supabase o staging (01 sola), `NOTIFY pgrst, 'reload schema';` tras cada una; repetir las pruebas de §2.6 contra PostgREST.
2. Supabase Auth → URL Configuration: añadir `enbus://auth/callback`, `enbus://**` y la URL de Expo Go de desarrollo (`exp://**`) a Redirect URLs; activar el proveedor Google (Client ID/Secret de Google Cloud con el redirect `https://<proyecto>.supabase.co/auth/v1/callback`); mantener "Confirm email".
3. Plantillas de correo de Supabase: confirmar que usan `{{ .ConfirmationURL }}` (con PKCE el enlace trae `code`).
4. Variables: `EXPO_PUBLIC_SOPORTE_WHATSAPP` (app, `.env.local` y EAS), `NEXT_PUBLIC_SOPORTE_WHATSAPP` (panel y landing), `NEXT_PUBLIC_COOPERATIVAS_URL` (landing, sin valor por defecto).
5. Nuevo build de la app (EAS): PKCE y nuevas rutas; `npx expo install expo-crypto` sigue recomendado (fase 2). Al arrancar Expo se regenera `.expo/types/router.d.ts`.
6. Desplegar panel y landing después de las migraciones (usan columnas y RPC nuevas).
7. Si se quiere brillo automático del QR: `npx expo install expo-brightness` y activarlo en `QRCodeViewer` (no incluido por la regla de dependencias).
8. Mover a `foto_cliente_path` las fotos antiguas que no siguieron el patrón `<sender_id>/…` (consulta de revisión: `select id, foto_evidencia_url from encomiendas where foto_evidencia_url like 'http%';`).
9. Confirmar con negocio la lista de artículos prohibidos de #31 y el texto del seguro (3 veces el valor declarado).
10. Probar en staging: registro con Google y compra (pide cédula), recuperar contraseña desde el teléfono, compra de 3 asientos con pasajeros, cancelar viaje con pagos pendientes y luego con boletos pagados, registrar una devolución, alta presencial con cobro en destino y entrega a un tercero, PIN bloqueado (desbloquear y entregar sin PIN como admin), rechazo y nueva revisión de una cooperativa, rastreo y calculadora de la landing.

## 9. Riesgos

- **PKCE**: si la plantilla de correo o la lista de Redirect URLs no se actualiza, los enlaces abren la app sin sesión (la pantalla de callback lo explica y ofrece pedir otro enlace).
- **`handle_new_user`** reemplaza la versión desplegada (no versionada): revisar en staging que el alta con correo y el onboarding de empleados siguen creando el perfil.
- **Cédula repetida al registrarse**: ya no aborta el alta; queda `PENDIENTE-…` y se pide al comprar (el usuario podría no saber que su cédula está en otra cuenta: el mensaje del `CompletarPerfilSheet` lo explica).
- **Política de pagos de encomienda**: remitente y destinatario ven referencia y banco del pago del otro (datos de la misma encomienda; aceptable).
- **Incidencias**: la app vieja no inserta incidencias; ningún cliente pierde funciones al cerrar el INSERT.
- **Alta presencial**: `sender_id` es el empleado; pantallas que muestran "remitente" deben usar `remitente_*` cuando `origen_registro='TAQUILLA'` (dashboard, detalle, guía).
- **`fn_cancelar_viaje`** exige resolver antes los pagos en verificación: un admin con prisa puede frustrarse; el error enlaza a la bandeja.
- **Fotos antiguas** guardadas como URL pública: el helper extrae la ruta; si no la encuentra, no muestra la imagen (no rompe).
- **SQL validado en PGlite**, no en PostgREST real (roles, `auth.users` real, storage): repetir §2.6 en staging.
