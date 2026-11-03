# Fase 5 — Coherencia y pulido UX/UI: estado y pendientes

Rama `ux/mejoras-auditoria`. Especificación: `Audits/fase5/fase5_spec.md`. Auditorías: `app_navegacion.md`, `app_ui.md`, `panel_navegacion.md`, `panel_ui.md`, `admin.md`, `sistema.md` (mismo directorio).

## Qué se hizo

- **Auditoría (6 auditores en paralelo)** con capturas reales de la app (web) y el panel, más lectura de código: 240 hallazgos (SY 36 · AN 33 · AU 50 · PN 33 · PU 41 · AD5 47).
- **Implementación (11 clusters en 2 oleadas + 2 integradores):** 239 hallazgos implementados; 1 fuera de alcance (PN-31: renombrar las URL `/dashboard` y `/hardware` rompería marcadores y enlaces de correos).
- **Decisiones principales** (detalle en `fase5_spec.md` §1):
  - Acción principal = amarillo de marca con texto oscuro en app, panel y landing; azul oscuro (`accent-strong`) = selección y estado activo; enlaces en `info-text`. Boletos = azul, encomiendas = coral (también en gráficos).
  - Pestañas de la app: Inicio · Boletos · Encomiendas. Confirmaciones con una única hoja (`ConfirmSheet`/`useConfirm`); cero `Alert.alert`. Atrás con `useVolver` (funciona al abrir desde una push).
  - Horas siempre en 12 h y formatos de `shared/ve.ts`. Contraseña mínima de 8.
  - Marca propia: bloque "EB" (`shared/marca/eb.svg`) y script que genera icono, icono adaptativo, splash y favicon de la app, PWA y favicon del panel y de la landing. Nombre visible de la app: "EnBus".
  - Menús del panel y del admin agrupados con contadores de pendientes; barra superior con tasa BCV e impresora; un inicio por rol; corregido el bucle de redirecciones; migas "Sección › Objeto"; título de pestaña "<Sección> · EnBus" con `metadata`.
  - Un solo vocabulario y una tabla única de estados (etiqueta, tono, icono) en los tres productos (`shared/errores.ts`, `lib/estados.ts`, `utils/estados.ts`, Glosario).
- **Integración:** retirados los alias temporales; reglas de lint del barrido (app y panel) y de tokens/a11y en nivel `error`; revisión visual final de todas las pantallas con correcciones.
- **Arreglos de la integración del orquestador:** el taquillero que abre por URL Rutas, Empleados o Configuración se redirige en el middleware antes de renderizar (redirigir durante el render daba "Rendered more hooks" en desarrollo). En web, la app guarda la sesión en `localStorage` (SecureStore no existe en el navegador; no afecta a Android ni iOS).

## Verificación (03/11/2026)

| Comando | Resultado |
|---|---|
| `node shared/generar.mjs --check` | OK (15 archivos generados) |
| `EnBusApp: npx tsc --noEmit` / `npx expo lint` | 0 errores / 0 errores, 0 avisos |
| `PanelCooperativas: npx tsc --noEmit` / `npx eslint` / `npm run build` | 0 / 0 / OK |
| `LandingEnBus: npx tsc --noEmit` / `npx eslint` / `npm run build` | 0 / 0 / OK |
| Capturas | App web a 390 y 360 con cuenta de pasajero real; panel y admin a 1440, 1024 y 390 en claro y oscuro con datos de prueba (las cuentas QA de personal no tienen rol) |

**No visto en vivo:** boleto pagado con QR (requiere aprobar un pago), aviso sin conexión (no se puede provocar en web), app nativa en dispositivo (solo la versión web), pantallas del panel y del admin con la base real y una sesión de personal.

## Pasos manuales (dueño)

1. **Supabase Auth** (Dashboard → Authentication):
   - Policies: **longitud mínima de contraseña = 8** (la app y el panel ya lo exigen; `supabase/config.toml` solo cubre el entorno local).
   - URL Configuration: Site URL (la del panel, o la landing mientras tanto) y Redirect URLs `enbus://auth/callback`, `enbus://**`, `exp://**`, `https://enbus-hazel.vercel.app/**`, `https://<dominio-del-panel>/**`.
   - Providers: Google (si se usa). SMTP propio (el de Supabase envía pocos correos por hora).
2. **Variables de entorno** (ver `Audits/pendientes_fase4.md` §2), en especial `NEXT_PUBLIC_SITIO_URL` / `EXPO_PUBLIC_SITIO_URL = https://enbus-hazel.vercel.app`.
3. **Desplegar** panel y landing y hacer un **build nuevo de la app en EAS** (icono, splash y nombre nuevos; rutas y navegación nuevas).
4. **Probar en dispositivo**: navegación con el botón atrás de Android, hojas de confirmación, push que abre el boleto o la encomienda con la app cerrada, compra completa hasta el QR, envío completo.
5. **Datos de prueba a limpiar** (SQL Editor), cuando ya no hagan falta:
   - Encomiendas de QA aún pendientes: `EB-261103-06063` y `EB-261103-72973` (cancelarlas desde la app con la cuenta QA o por SQL).
   - Cuentas QA `qa.pasajero@example.com`, `qa.taquillero@example.com`, `qa.admincoop@example.com`, `qa.superadmin@example.com` (sus boletos y envíos cancelados se conservan por las FK).
6. **Datos:** la ruta Mérida → Caracas de Expresos Los Andes tiene una duración de 30 min; revisarla en Rutas.

## Pendientes abiertos (no bloquean)

- La comprobación de rol de Rutas/Empleados/Configuración vive en el middleware y en la página (`exigirRolPanel`); si se añade otra sección solo de administrador, añadirla a `SOLO_ADMIN_COOPERATIVA` en `lib/supabase/middleware.ts`.
- `ve-fields.tsx` del panel mantiene su propia máscara de teléfono y separación de cédula (se comportan mejor al borrar que las de `shared/ve.ts`).
- El contador de Incidencias del menú del admin cuenta todos los tipos abiertos o en proceso; el KPI del Resumen solo las de más de 72 h en tránsito (con etiquetas distintas).
- La búsqueda de Encomiendas del admin mantiene el botón "Buscar" (filtrar en cada pulsación daría "no encontrada" con códigos a medias).
