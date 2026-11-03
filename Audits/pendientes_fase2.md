# Pendientes heredados de la fase 2

## Notas del integrador

Integration is done: the three projects typecheck, lint and build in green. Nothing was tested against a database, on a device or in a browser.

No changes to supabase/, Audits/, app.json or .gitignore. No commits.

SPEC (Audits/fase2_spec.md, which I did not edit)
- §6 step 11 must say to run `SET enbus.aplicar_cierre_fase2 = 'si';` in the same session before migration 06. Without that SET, 06 does nothing: it only emits a NOTICE, and if it goes in with db push it gets recorded as applied with no effect.
- The C1 fix is correct and needed: with migration 01, boletos gets two FKs to profiles, so the hint `profiles!comprador_id` is required. The §5 grep should also cover `profiles(`.

MANUAL STEPS FOR THE USER
1. Repeat the database validation on a Supabase branch or staging, or with `supabase db reset` locally once Docker Desktop works. C0-DB tested with PGlite, which does not reproduce PostgREST, role grants or the CLI (BEGIN/COMMIT inside migrations).
   - Flows to cover: reserve → pay → reject → pay again; double tap; two purchases of the same seat; taquilla sale in cash USD with change; dispatch with payment at destination, then delivery (blocked by EB_COBRO_PENDIENTE); a user registering with a recipient's cédula; behaviour with no rate.
2. Before migration 01, commit and deploy the embed hints on their own: comisiones/actions.ts:116 and admin-usuarios.ts:140.
3. Before 02, run the read-only duplicate query.
4. Apply 01→05 in the SQL Editor, with `NOTIFY pgrst, 'reload schema';` after each one, and check the NOTICEs.
5. Check vault (service_role_key, project_url).
6. Deploy the edge functions (actualizar-tasa-bcv, procesar-notificaciones-pendientes, enviar-push, calculadora-publica, calcular-costo-encomienda). Then confirm `actualizar-tasa-bcv` does not answer 401: if the project uses the new sb_secret_ keys, the vault key may not match SUPABASE_SERVICE_ROLE_KEY. Afterwards run `select * from fn_tasa_bcv_vigente();`.
7. Check `cron.job`: auto_expirar_reserva and actualizar_tasa_bcv must be there.
8. Audit routes with precio_pasaje > 200 and confirm with each cooperative that prices are in USD.
9. Deploy the panel only after the migrations, because it depends on pagos.estado_verificacion, profiles.sucursal_id and boletos_pago_id_fkey. Deploy the landing with SUPABASE_SERVICE_ROLE_KEY set in its environment; without it, it shows USD only.
10. Run `npx expo install expo-crypto` (I did not install it because it is a download). ids.ts has a non-cryptographic fallback that is enough for compra_id and idempotency_key. Then do a new EAS build with a forced update.
11. Apply 06 (with the SET) once the old app is no longer in use.
12. In staging, test:
    - The payment verification dialog: approve and reject.
    - Scanner with a ticket for tomorrow, and with a pending payment.
    - Manual rate versus the cron.
    - Onboarding a second invited employee with a sucursal (profiles.sucursal_id set, no UNIQUE error).
    - The 'Marcar salida' button and receiving a batch while the trip is still PROGRAMADO.

KNOWN ISSUES LEFT OPEN (outside what I could fix, or not P0)
- Database (C0-DB):
  - The 'Pagador ve los suyos' RLS policy hides one party's payment from the other on encomiendas. The UI works around it with EB_PAGO_YA_REGISTRADO, but it can tell the receiver to wait when the payment was already approved. Needs an RPC or policy that shows the collection status to both parties.
  - procesar-notificaciones may retry permanent failures indefinitely (limit 50 with no ordering).
  - In _resultado_embarque, OTRO_VIAJE takes precedence over OTRO_DIA; the UI compensates.
  - The legacy trigger does not set compra_id for the old app's multi-seat reservations.
- Panel:
  - confirmarEntrega does not re-check the PIN on the server. This predates phase 2 and the spec keeps it.
  - lib/printing/escpos.ts encodes UTF-8, so accented letters may print wrong on CP437/850 printers.
  - The income KPIs filter by created_at rather than the approval date.
  - createTarifa is not transactional.
  - The 'Pagos por verificar (n)' counter in taquilla does not listen to the pagos table.
- App:
  - useWizardBack cannot block an iOS swipe-back while a reservation is being made.
  - Haptics fire twice on success/error toasts.
  - The 'Intentar de nuevo' button gives no loading feedback.
  - Still open from the audit: M-41, M-42 and M-44.
- Admin: the user and cooperative detail screens now take the rate from the admin layout's provider (no extra request).

## Pendientes de cada revisor

### C0-DB
- Real validation was done on PGlite 0.4.1 (Postgres 17 WASM), not on Supabase. Docker is still not available (`docker ps`: dockerDesktopLinuxEngine pipe missing; the docker-desktop WSL distro is Stopped). I installed PGlite offline from the existing npm cache into the scratchpad (nothing downloaded), with stubs for auth.uid/users, roles anon/authenticated/service_role, storage, cron, net and vault.
- Results: the 18 existing migrations plus 01-06 apply without errors on an empty database. A second run of 01-06 is also clean (re-runnable). The same holds over legacy data: '3B'/'1A'/'10D' seats converted, duplicate RESERVADO released, PAGADO kept, cash payments from the app rejected, Zelle moneda=USD, compra_id/pago_id backfill, profiles.sucursal_id taken from invitaciones, the destinatario backfill does not notify and does not move updated_at, and the encomienda unique indexes are skipped with a NOTICE when the data does not allow them.
- Functional tests done through SET ROLE and request.jwt.claims: fn_tasa_bcv_vigente (anon) after fn_guardar_tasa_bcv (service_role only; >25 % → EB_TASA_SOSPECHOSA; manual rate is not overwritten), plus reservar, cambiar asientos, ocupado, compra ajena and 3B/41 inválidos. Checkout covers EB_TASA_CAMBIO, invalid referencia, efectivo rejected, OK, double tap (repetido) and a second key (EB_PAGO_YA_REGISTRADO). Also tested: cancel with a payment under review (RPC and direct), direct switch to PAGADO blocked, and cron does not expire with a pending payment. Payments inbox; rechazo, then re-checkout with Zelle, then aprobar twice (ya_procesado); embarque VALIDO/OTRO_VIAJE/OTRO_DIA/USADO; cancel PAGADO (95 %). Taquilla sale in efectivo USD with vuelto, idempotent repeat, EB_MONTO_INSUFICIENTE and Pago Móvil; cobrar reserva and liberar. RLS on legacy pago EFECTIVO; role escalation blocked; salida del viaje. Encomiendas: client INSERT sanitized, vínculo by cédula with notice, cotizar/peso inválido, recepción twice, despacho POR_PAGAR rejected, client payment then rejected then cash in taquilla, despacho DESTINO, ENTREGADA without payment → EB_COBRO_PENDIENTE, payment by remitente then aprobar then ENTREGADA. Also the 06 with SET (direct INSERT denied, RPCs keep working) and EB_TASA_NO_DISPONIBLE with a tasa older than 4 days.
- PGlite does not reproduce Supabase exactly (PostgREST, postgres role privileges, CLI with BEGIN/COMMIT inside migrations). Steps 1/3/4 of §6 still need to be repeated on a Supabase branch or staging, or with `supabase db reset` locally once Docker Desktop works. `supabase start`/`stop` were not run.
- `deno check` was not possible (Deno is not installed). Substitute: a strict tsc with Deno shims and supabase-js from PanelCooperativas covering all 5 edge functions, which passed without errors.
- Outside my ownership: Audits/fase2_spec.md §6 step 11 must say to run `SET enbus.aplicar_cierre_fase2 = 'si';` before 06 (the implementer's guard, which I accept). If `db push` applies it without the SET, it is recorded as applied with no effect and must be run by hand. The spec should also reflect these behavior changes: rechazo without renewal if the bus already left, repetido with the full shape in fn_confirmar_recepcion_origen, procesar-notificaciones discarding 400/404 or >24 h, and enviar-push 404.
- Remaining risk: the actualizar_tasa_bcv cron sends the 'service_role_key' from vault, and the function compares it exactly with the env var SUPABASE_SERVICE_ROLE_KEY. If the project uses the new secret keys (sb_secret_…) and vault holds a different one, it responds 401. Check after deploying (§6 step 6).
- Minor, not changed: fn_cobrar_encomienda_taquilla and fn_registrar_pago_encomienda return a reduced shape when repetido (pago_id, estado, repetido); consumers must tolerate it. fn_reservar_asientos reports a tasa older than 4 days as informational (charging does block it).

### C0-PANEL
- For C4 (not in my cluster): adding `timeZone: 'America/Caracas'` to dateFormatterShort shifts DATE columns parsed with `new Date('YYYY-MM-DD')` back one day. Concrete case: app/cooperativas/(panel)/dashboard/page.tsx:240, `dateFormatterShort.format(new Date(comisionPendiente.periodo_inicio/periodo_fin))`. The server used to render 01/10, 12:00 a. m.; it now renders 30/09, 8:00 p. m. Date-only columns should be formatted as calendar dates, for example by parsing 'YYYY-MM-DD' by hand as the dialog's formatFechaCalendario does. tarifas/vigente_desde is timestamptz and is not affected.
- For C2, C3, C4: import `conceptoDePago`, `formatSalidaCorta` and `esTasaDesactualizada` from '@/lib/types/pagos' in Server Components, not from the 'use client' files.
- Outside my cluster: lib/printing/escpos.ts encodes with TextEncoder (UTF-8). Characters such as 'ó' and 'é' ('Código', 'Cédula', 'GUÍA') may print wrong on thermal printers that use CP437/CP850. This existed before; print-helpers already avoids '≈', '$' and '→'.
- The chip is in layout.tsx as a row above the content because panel-shell.tsx is not in this cluster. Suggestion for integration: add a `headerExtra` prop to PanelShell.
- The PRE-MIGRATION embed change (comisiones/actions.ts:116 and admin-usuarios.ts:140) needs its own commit and must be deployed before migration 01. No commit was made. The FK name pagos_boleto_id_fkey is confirmed: it comes from the inline REFERENCES in 20260414000002_tables.sql:202.
- Not run in a browser or against a database. The dialog's approve and reject flows have to be tested in staging with migrations 01–04 applied. Before migration 01, obtenerTasaBCV gets PGRST202, logs it, and the chip shows the amber 'Sin tasa BCV registrada'.

### C1-BASE
- Outside the cluster, needs RLS (C0-DB): the 'Pagador ve los suyos' policy only lets a user see the payments they made. For an encomienda paid at destination, if the sender already registered a pending payment, the receiver cannot see it. `getCobroEncomienda` then returns SIN_PAGO and `puedePagarEncomienda` returns true, so the receiver gets offered a second payment and the server rejects it with EB_PAGO_YA_REGISTRADO. Only the error message stops it; the data stays correct. A real fix needs an RPC or policy that exposes the encomienda's payment status to both parties.
- PaymentFlow: if `cooperativaId` arrives empty (the old callers pass `string | undefined`), it shows 'Esta cooperativa solo acepta pago en taquilla.', which is false. The new callers must pass a real id, or not render PaymentFlow until they have one.
- useTasaBCV does not cache the case where no rate exists (SinTasaError). Each new mount runs the RPC again; concurrent mounts share one request in flight. This is acceptable while the database is empty.
- ids.ts: expo-crypto is not installed and Hermes may not expose `crypto`. The fallback (Math.random plus the current time) is enough for compra_id and idempotency_key, but `npx expo install expo-crypto` is recommended during integration.
- types/index.ts: `Encomienda.costo_calculado` and `pin_retiro` are typed as optional but not `| null`, even though the database returns null until the parcel is weighed or received. I did not change this because it could break callers in other clusters. Screens must handle null with `Number(x) > 0` or `?? null`. `getCobroEncomienda` and `puedePagarEncomienda` already do.
- After a successful `onRegistrar`, the button becomes enabled again until the screen navigates away. That is on purpose: when the screen handles EB_TASA_CAMBIO it resolves without throwing so the user can retry. A second tap during the transition sends a new key (the hook renews it after success), and the server rejects it with EB_PAGO_YA_REGISTRADO, so no duplicate payment is created.
- Expected and outside the cluster: callers not yet migrated still fail to compile (buscar.tsx, viajes/[id].tsx, encomiendas/enviar/[id].tsx, encomiendas/recibir/[id].tsx ×2). The global grep for `from('pagos')` and PENDIENTE_VERIFICACION finds matches only in those files.

### C1-BOLETOS
- Verified with no changes: the RPC contracts (fn_reservar_asientos with p_compra_id/p_viaje_id/p_asientos; fn_checkout_boletos with all 10 parameters, where p_tasa_esperada comes from the reservation's tasa_bcv in the wizard; fn_liberar_reserva; fn_cancelar_boleto with p_boleto_id/p_motivo), the handling of EB_TASA_CAMBIO, EB_ASIENTO_OCUPADO and EB_PAGO_YA_REGISTRADO, the idempotency key (kept across retries, renewed after success), the server-side offset, the timer and its warning at 5 minutes or less, the expired-reservation card, useWizardBack in buscar, the embeds with the FK hint, the absence of client-side EXPIRADO writes, and the timer and Cancel limited to SIN_PAGAR/RECHAZADO.
- The implementer's spec fix is correct and needed. After migration 01, boletos has two FKs to profiles (comprador_id and embarcado_por), so `profiles(...)` without a hint fails with PGRST201; `profiles!comprador_id(...)` works. The integration grep in §5 should also look for `profiles(` without a hint in boletos selects. The embed grep over EnBusApp/app and EnBusApp/src is now empty.
- Outside my ownership (src/hooks/useRealtime.ts): on INSERT/UPDATE it replaces the row with payload.new, dropping the embeds, and writes that incomplete row to the cache. (tabs)/boletos.tsx works around it with one refetch, which I checked does not loop. The proper fix is in useRealtime: refetch when selectQuery has embeds.
- Outside my ownership (src/hooks/useWizardBack.ts): it has no option to block 'back' while an action runs. viajes/[id] handles this with its own BackHandler plus a guard on the arrow. An iOS swipe-back on step 1 while the first reservation is being made can still close the screen; the hook then releases the seats when the response arrives, because it is unmounted.
- Accepted design limits: boletos/[id] uses the phone's clock for the timer (a plain select returns no server_now), and in boletos/[id] EB_TASA_CAMBIO uses an Alert, because PaymentFlow is already inside a BottomSheet. 'Registrar con el nuevo total' resends the monto_declarado the user had entered (what they actually paid), as §1 describes.
- Minor, not fixed: in buscar, when the user switches trips, the previous trip's occupied seats show for a moment until the new ones load (the server rejects any conflict anyway). In boletos/[id], 'Solicitar cancelación' still appears for a PAID ticket whose trip has already left; the server rejects it with the EB_VIAJE_YA_SALIO hint.
- Not tested on a device or against a database: the SQL from §2 has not been applied anywhere.

### C1-ENCOMIENDAS
- Outside this cluster (C0-DB): RLS 'Pagador ve los suyos' only lets each user read the payments they made. For DESTINO, if the sender already paid and the payment was APPROVED (the parcel stays EN_TRANSITO / EN_OFICINA_DESTINO), the receiver sees 'Sin pagar' and the form. Only after submitting do they get EB_PAGO_YA_REGISTRADO and the card 'Ya hay un pago registrado… Si la cooperativa lo rechaza, podrás pagarlo tú', which is wrong when the payment was approved. The real fix is an RPC or policy that shows the collection status of the parcel to both parties.
- Outside this cluster (src/utils/validation.ts): validatePeso and validateMonto use parseFloat and do not accept a comma, and validatePeso allows 100 kg while the screen says 25 kg (M-39). nueva.tsx now works around the comma; the limit is still inconsistent.
- Still open from the implementer's report: M-41, M-42 ('¡Todo listo!' shown before saving) and M-44. In nueva.tsx the Colors.warning / Colors.success icons are non-text elements and were left as they were.
- Minor: the 'Intentar de nuevo' button in the empty error state of both detail screens does not set loading, so there is no visual feedback while it retries.
- Not tested on a device or against a database: the EB_TASA_CAMBIO flow, the Zelle retry and the cancel with .select('id') are checked only by reading the code against the §2.1/§2.4 SQL.

### C2-PANEL-BOLETOS
- Spec/SQL nuance, not fixed in the DB (C0-DB owns it): in _resultado_embarque OTRO_VIAJE takes precedence over OTRO_DIA. The UI works around it. If the DB owner prefers, the CASE could put OTRO_DIA before OTRO_VIAJE.
- Not checked against a database or in a browser (no dev servers or remote DB allowed). Still to check in staging: 2-seat sale in efectivo USD (2 tickets + change), retry with the same idemKey (repetido, completed by completarParaImprimir), tomorrow's ticket in the red dialog, pending payment → verify embebido → revalidate → Confirmar embarque.
- Outside ownership (C0-PANEL): printFallback in lib/printing/print-helpers.ts loses line breaks (no white-space:pre). venta-flow does not use it.
- Minor, left as is: if the Bluetooth printer fails partway through a multi-ticket print, the browser fallback reprints every ticket. The 'today's trips' list does not refresh on its own after midnight (there is a refresh button).

### C3-PANEL-ENCOMIENDAS
- Not tested against a database or in a browser: only tsc and lint. Test in staging with migrations 01–05 applied: DESTINO reception without PagoModal, cobro in Bs, USD and Pago Móvil, despacho with OTRO_DESTINO and EB_DESPACHO_INVALIDO, Marcar salida, lote reception with the trip still PROGRAMADO, and delivery blocked by EB_COBRO_PENDIENTE.
- Behaviour unchanged from before: after receiving a DESTINO encomienda the evidence photo (PhotoCaptureModal) does not open, because that step only follows the payment. Decide whether to ask for the photo on DESTINO too.
- despacho/page.tsx: when 'Marcar salida' succeeds, onHecho clears selectedViaje while the dialog is still animating closed, so the title is briefly empty. Cosmetic.
- confirmarEntrega does not re-check the PIN on the server. The modal validates it with validarPin first, so a direct call to the action could deliver without a PIN. This was already the case; spec decision #5 keeps validarPin + confirmarEntrega. Consider checking it in the action.
- The 'Pagos por verificar (n)' counter in taquilla does not listen to the pagos table. useEncomiendasRealtime belongs to another cluster.
- Implementer's spec notes confirmed: recepcion-lote-modal.tsx lives in app/cooperativas/(panel)/recepcion-destino/, as in §5. Despacho sends p_codigo = encomienda.id, which fn_validar_encomienda_despacho accepts (id::text = lower(v_code)). The 'repetido' response of fn_cobrar_encomienda_taquilla has a reduced shape and is handled with an info toast.

### C4-ADMIN-LANDING
- Outside C4 (integration): app/admin/(panel)/comisiones/page.tsx does not pass `tasa={await obtenerTasaBCV()}` to CiclosTable and GenerarCicloDialog. Each one queries fn_tasa_bcv_vigente once in the browser through useTasaBCVAdmin. Same in the usuario and cooperativa detail pages. It works, but costs an extra request per component.
- Outside C4 (C0-PANEL): lib/data/admin-usuarios.ts does not map monto_bs, moneda or estado_verificacion, so usuario-detail-tabs shows a RECHAZADO payment as 'Por Verificar' and old payments in USD at today's rate.
- Pre-existing semantics, not changed: the income KPIs on both dashboards filter verified payments by created_at, not by the approval date. A payment registered yesterday and approved today does not count as today's income.
- Pre-existing, outside the spec: createTarifa deactivates the active tariff and then inserts the new one in two steps, not one transaction. If the insert fails, there is no active tariff.
- The panel's components/landing/popular-routes.tsx shows USD only plus the note, because the panel's app/page.tsx (not C4) has no revalidate. LandingEnBus does show Bs, with ISR every 1800 s.
- Can only be checked against a database or browser (not run here): manual rate versus the cron, onboarding of a second invitee with sucursal_id, and `next build` of the landing with and without env vars.
