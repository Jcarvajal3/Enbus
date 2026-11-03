# Estado de la implementación del plan UX

Actualizado el 03/11/2026. Rama `ux/mejoras-auditoria`.

**Las cuatro fases están implementadas: 60 de 60 mejoras.** Las migraciones de las fases 2, 3 y 4 están **aplicadas en el proyecto de Supabase** (`tydpnvajwfzcsxsowctp`, el único, todavía sin usuarios reales) y las edge functions están desplegadas. Nada se ha probado todavía en un dispositivo ni en un navegador contra la base real: eso es lo siguiente (ver «Qué falta»).

## Documentos de referencia

| Documento | Para qué sirve |
| --- | --- |
| [Informe de auditoría (doc)](https://claude.ai/code/artifact/115c0622-7d60-4d94-ba9f-6df2151c8e81) | Plan de 60 mejoras priorizadas, con columna de estado |
| `Audits/audit_ux_usuario_novato.md` | Hallazgos M-, P-, A-, L- con `archivo:línea` |
| `Audits/audit_ux_experto_uxui.md` | Propuestas APP-, PC-, AD-, LP-, DS- con la ley UX aplicada |
| `Audits/fase2_spec.md` … `fase4_spec.md` | Especificación de cada fase |
| `Audits/pendientes_fase1.md` … `pendientes_fase4.md` | Lo que quedó abierto en cada fase y los pasos manuales |
| `shared/README.md` | Fuente única de tokens, formatos venezolanos y artefactos (`node shared/generar.mjs [--check]`) |
| `Specs/00_General/Glosario.md`, `Artefactos_Compartidos.md` | Vocabulario, estados, códigos, QR y PIN |

## Decisiones tomadas

- **Moneda:** precios de referencia en USD y cobro en Bs a la tasa BCV del día. Cada pago guarda `monto_bs`, `tasa_bcv` y `tasa_bcv_fecha`. La tasa vive en `tasas_bcv`; la carga la edge function `actualizar-tasa-bcv` cada 30 min (pg_cron) y el super admin puede cargarla a mano.
- **Lógica en servidor:** el dinero y los estados se deciden en RPC `SECURITY DEFINER`. Los errores salen como `EB_*` con el texto para el usuario en `hint`; `humanizeError` los traduce en la app y en el panel.
- **Una sola fuente de diseño y formatos:** `shared/` genera tokens CSS/TS y copias de `ve.ts` y `artefactos.ts` en los tres proyectos. El lint prohíbe colores sueltos (nivel `error`).
- **Supabase:** como no hay usuarios todavía, se aplicó todo directo en el único proyecto, por la Management API. Los builds de la app van por EAS.

## Estado por fase

| Fase | Mejoras | Código | Supabase |
| --- | --- | --- | --- |
| 1 · Arreglos rápidos | #4, #7–#13, #17, #18, #20, #21, #29, #30 | Hecho | Sin migraciones |
| 2 · Resto de P0 | #1, #2, #3, #5, #6, #14, #15, #16 | Hecho | `20260719000001`–`06` aplicadas (la 06 con `enbus.aplicar_cierre_fase2='si'`) |
| 3 · Confianza (P1) | #19–#28, #31–#42 | Hecho | `20260720000001`–`05` aplicadas |
| 4 · Pulido y base (P2, P3) | #43–#60 | Hecho | `20260721000001`–`04` aplicadas |

### Fase 4 en resumen

- **Seguridad de la entrega:** el PIN se valida antes de entregar (15 min, mismo empleado) y la API ya no puede escribir el PIN ni pasar una encomienda a ENTREGADA. Las guías PDF (que ahora llevan el PIN) son privadas por cooperativa (migración 04, añadida en la integración).
- **App:** Inicio con «Tu próximo viaje», búsqueda con recientes y populares, resultados con llegada y «Quedan 3», notificaciones por día que abren el recurso, perfil por secciones con preferencias de notificación, cambiar contraseña y eliminar cuenta (Google Play), campos de cédula y teléfono, toasts de error persistentes, «reducir movimiento».
- **Panel:** escaneo con sonido y «Último escaneo» en las cinco pantallas del mostrador, «Impresora y lector» para ambos roles con reconexión, Resumen con «Requiere tu atención», viajes con pestañas, editar viaje, marcar llegada y manifiesto, rutas con horas y minutos, filas navegables con teclado.
- **Admin:** dashboard en dos bandas con deltas, tarifas con revisión y programación, pago de comisión con método y referencia, usuarios paginados en servidor con bajas de cuenta, incidencias por prioridad, sistema visual unificado.
- **Landing:** `/terminos`, `/privacidad`, `/eliminar-cuenta`, SEO (OG, robots, sitemap, JSON-LD), límite atómico en el reenvío de invitaciones.

Detalle, desviaciones y pendientes: `Audits/pendientes_fase4.md`.

## Qué hay en Supabase (verificado el 03/11/2026)

- **Migraciones:** las 33 del repo constan en `supabase_migrations.schema_migrations` (las de `20260503` a `20260718` ya estaban aplicadas a mano y se registraron).
- **Realtime:** `boletos`, `encomiendas`, `viajes`, `pagos` y `notificaciones_usuario` en `supabase_realtime`.
- **Índices únicos** de cédula y teléfono normalizados creados (no había duplicados).
- **Crons (7):** `auto_expirar_reserva`, `alerta_amarilla_72h`, `auto_devolver_encomienda`, `procesar_notificaciones_pendientes`, `actualizar_tasa_bcv`, `activar_tarifas_programadas`, `limpiar_limites_uso`.
- **Vault:** `project_url` y `service_role_key` (los usan los crons que llaman a edge functions).
- **Edge functions (9, activas):** `actualizar-tasa-bcv`, `calculadora-publica`, `calcular-costo-encomienda`, `eliminar-cuenta`, `enviar-push`, `enviar-whatsapp`, `generar-guia-pdf`, `procesar-notificaciones-pendientes`, `track-and-trace`.
- **Tasa BCV vigente:** 889,5754 Bs/USD (02/11/2026, dolarapi).

## Qué falta

Ver la lista completa y ordenada en `Audits/pendientes_fase4.md` § Pasos manuales. En corto:

1. **Supabase Auth** (dashboard → Authentication → URL Configuration / Providers): Site URL, Redirect URLs, Google y SMTP propio.
2. **Variables de entorno** en Vercel (panel y landing) y en EAS (app), incluida `*_SITIO_URL = https://enbus-hazel.vercel.app`.
3. **Desplegar** panel y landing y hacer un build nuevo de la app en EAS.
4. **Probar** los flujos de §8 paso 10 de `fase4_spec.md` en dispositivo y navegador.
5. **Revisión legal** de `/terminos` y `/privacidad`, y decisiones de negocio pendientes.

## Último estado verificado

03/11/2026, al integrar la fase 4:

| Comando | Resultado |
|---|---|
| `node shared/generar.mjs --check` | OK, los 9 generados coinciden |
| `EnBusApp: npx tsc --noEmit` / `npx expo lint` | 0 errores / 0 errores, 0 avisos |
| `PanelCooperativas: npx tsc --noEmit` / `npx eslint` | 0 errores / 0 errores, 0 avisos (reglas de tokens y `jsx-a11y` en `error`) |
| `PanelCooperativas: npm run build` | OK, 37 rutas (incluida `/cooperativas/hardware`) |
| `LandingEnBus: npx tsc --noEmit` / `npx eslint` | 0 errores / 0 errores, 0 avisos |
| `LandingEnBus: npm run build` | OK, 12 rutas (incluidas las legales, `opengraph-image`, `robots.txt`, `sitemap.xml`) |
| SQL de la fase 4 en PGlite (Postgres 18) | 4 migraciones, dos pasadas, 123/123 pruebas de §2.4 |
| Supabase real | Migraciones aplicadas sin error; `actualizar-tasa-bcv` y `procesar-notificaciones-pendientes` responden 200 desde pg_cron |
