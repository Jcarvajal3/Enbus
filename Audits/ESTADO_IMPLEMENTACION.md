# Estado de la implementación del plan UX

Actualizado el 02/11/2026. Rama `ux/mejoras-auditoria`.

Las fases 1, 2 y 3 están implementadas: 42 de las 60 mejoras del plan. La fase 4 (mejoras #43 a #60) está planificada y sin implementar. Nada se ha probado contra Supabase real, en un dispositivo ni en un navegador. Lo que se verificó: compilación, lint y build de los tres proyectos, y las migraciones contra PGlite (Postgres en memoria).

## Documentos de referencia

| Documento | Para qué sirve |
| --- | --- |
| [Informe de auditoría (doc)](https://claude.ai/code/artifact/115c0622-7d60-4d94-ba9f-6df2151c8e81) | Plan de 60 mejoras priorizadas, con columna de estado |
| `Audits/audit_ux_usuario_novato.md` | Hallazgos M-, P-, A-, L- con `archivo:línea` |
| `Audits/audit_ux_experto_uxui.md` | Propuestas APP-, PC-, AD-, LP-, DS- con la ley UX aplicada |
| `Audits/fase2_spec.md` | Especificación de la fase 2: moneda, checkout, RPC, `dinero.ts` |
| `Audits/fase3_spec.md` | Especificación de la fase 3 |
| `Audits/fase4_spec.md` | Especificación de la fase 4, lista para implementar (§7 tiene la partición) |
| `Audits/pendientes_fase1.md` … `pendientes_fase3.md` | Lo que quedó abierto en cada fase y los pasos manuales |
| `Specs/00_General/Glosario.md` | Vocabulario único y tabla de estados para pasajero y operador |

## Decisiones tomadas

- **Moneda:** precios de referencia en USD y cobro en Bs a la tasa BCV del día. Cada pago guarda `monto_bs`, `tasa_bcv` y `tasa_bcv_fecha`. La tasa vive en la tabla `tasas_bcv`, la actualiza la edge function `actualizar-tasa-bcv` y el super admin puede cargarla a mano.
- **Lógica en servidor:** el dinero y los estados se deciden en RPC `SECURITY DEFINER`. Los errores salen como `EB_*` con el texto para el usuario en `hint`, y `humanizeError` los traduce en la app y en el panel.
- **Sin Docker ni Supabase local:** el SQL se valida con PGlite en el scratchpad, y nunca se toca el proyecto remoto sin aprobación (`db push`, `link`, `functions deploy`).
- **Builds de la app:** EnBusApp se compila en EAS (nube), no con Gradle local.

## Estado por fase

| Fase | Mejoras | Estado | Migraciones |
| --- | --- | --- | --- |
| 1 · Arreglos rápidos | P0 de horas: #4, #7–#13, #17, #18; P1 baratos: #20, #21, #29, #30 | Implementada | Ninguna |
| 2 · Resto de P0 | #1, #2, #3, #5, #6, #14, #15, #16 + pendientes de fase 1 | Implementada | `20260719000001`–`05`, más `06` diferida |
| 3 · Confianza (P1) | #19–#28, #31–#42 + pendientes de fase 2 | Implementada | `20260720000001`–`05` |
| 4 · Pulido y base (P2, P3) | #43–#60 + pendientes de fase 3 | Planificada, sin código | `20260721000001`–`03`, solo en la spec |

### Qué hizo cada fase implementada

**Fase 1**
- Columna `viaje_id` en despacho y token correcto en las invitaciones.
- Timeline de encomiendas sin falsos "Entregada" y "Entrega" en el menú.
- Fecha del pago con chips, hora de Venezuela (`lib/fechas.ts`) y RIF oficial aceptado (`lib/rif.ts`).
- Ya no se dice "Revisa tu correo" cuando el correo falló, ni se muestran éxitos falsos en la taquilla.
- Recepción filtrada por sucursal.
- Errores traducidos (`utils/errores.ts`, `lib/errores.ts`).
- Colores de texto accesibles y "atrás" de Android en los wizards (`useWizardBack`).

**Fase 2**
- Moneda USD/BCV con `dinero.ts` (idéntico en los tres proyectos) y el componente `Monto`.
- Checkout atómico: `fn_reservar_asientos` y `fn_checkout_boletos`, con idempotencia e índice único de asiento.
- Reserva sin pagar separada de pago en verificación; solo el cron escribe `EXPIRADO`.
- Cobro en destino completo y destinatario vinculado por cédula o teléfono.
- Embarque con resultado por causa, despacho que valida el destino y "Marcar salida" como acción aparte.
- Bandeja "Pagos por verificar" con aprobar y rechazar con motivo, y venta en taquilla por RPC.

**Fase 3**
- Restablecer contraseña, pantalla "Revisa tu correo", Google con PKCE y cédula antes de la primera compra.
- Nombre y cédula por pasajero, y pantalla "Tu compra" con todos los boletos.
- Pase de abordaje con hora, dirección y código corto.
- Cancelación y reembolso: bandeja de reembolsos en el panel y `fn_cancelar_viaje`.
- Ayuda con "Reportar un problema", que crea una incidencia.
- Alta presencial de encomiendas y foto que se puede subir u omitir.
- Entrega con el PIN y la cédula validados en el servidor.
- Rechazo de solicitudes reversible (`RECHAZADA`), aviso del estado de la cooperativa y checklist de puesta en marcha.
- Un solo flujo de registro, invitaciones con reenviar y revocar, y métodos de pago con campos según el tipo.
- Landing con rastreo real y calculadora, sin testimonios inventados.
- Nueva política (`aa_proteger_cooperativa`) que impide que el admin de una cooperativa cambie su propio estado o su comisión.

## Qué falta

### 1. Implementar la fase 4 (#43–#60)

La especificación completa está en `Audits/fase4_spec.md`. Su partición (§7) tiene 2 oleadas de 5 clusters, con archivos disjuntos.

- **Oleada 1:**
  - W1-DB: 3 migraciones `20260721…`, la edge function `eliminar-cuenta` y specs.
  - W1-SHARED: `shared/` como fuente única de tokens, formatos venezolanos y artefactos, con el script `generar.mjs`.
  - W1-APP-BASE, W1-PANEL-BASE y W1-LANDING: páginas legales, SEO y limpieza.
- **Oleada 2:**
  - W2-APP-VIAJES: inicio, búsqueda, resultados y mis boletos.
  - W2-APP-CUENTA: notificaciones, perfil, cambiar contraseña y eliminar cuenta.
  - W2-PANEL-MOSTRADOR: escaneo de experto y hardware.
  - W2-PANEL-GESTION: dashboard "Requiere tu atención", viajes y rutas.
  - W2-ADMIN: admin operativo y visual.
- **Pendiente de seguridad que corrige la migración `20260721000001`:** `fn_entregar_encomienda` no cuenta el intento de PIN fallido. Con ella, el PIN debe validarse antes de entregar, con una vigencia de 15 minutos por empleado.

Cómo reanudar: un orquestador con un agente implementador por cluster (cada uno solo con sus archivos), un revisor adversarial por cluster y un integrador final que ejecute `tsc`, lint y build en los tres proyectos. Primero la oleada 1, luego la 2.

### 2. Aplicar y probar las migraciones en staging (nunca directo en producción)

Orden:
1. Desplegar antes los hints de embed del panel (fase 2), o fallan comisiones y el detalle de usuario.
2. Antes de la `20260719000002`, ejecutar la consulta de solo lectura de asientos duplicados.
3. Aplicar `20260719000001`–`05`.
4. Aplicar `20260720000001` sola y luego `20260720000002`–`05`.
5. Aplicar `20260721000001`–`03` (cuando exista la fase 4).
6. Después de cada migración, ejecutar `NOTIFY pgrst, 'reload schema';`.
7. La `20260719000006` va al final, cuando la versión vieja de la app ya no esté en uso, con `SET enbus.aplicar_cierre_fase2 = 'si';` en la misma sesión.

Los pasos detallados y las pruebas están en §6 de `fase2_spec.md`, en `pendientes_fase3.md` y en §8 de `fase4_spec.md`.

### 3. Otros pasos manuales

- **Edge functions a desplegar:** `actualizar-tasa-bcv`, `procesar-notificaciones-pendientes`, `enviar-push`, `calculadora-publica` y `calcular-costo-encomienda`. Con la fase 4, también `eliminar-cuenta` y `generar-guia-pdf`. Después, comprobar `select * from fn_tasa_bcv_vigente();`.
- **Realtime:** `viajes` y `pagos` deben estar en `supabase_realtime`. La migración `20260721000002` las añade.
- **Supabase Auth:**
  - Redirect URLs `enbus://auth/callback`, `enbus://**` y `exp://**`.
  - Proveedor Google activado.
  - Plantillas de correo con `{{ .ConfirmationURL }}`.
- **Variables de entorno:**
  - `EXPO_PUBLIC_SOPORTE_WHATSAPP` y `NEXT_PUBLIC_SOPORTE_WHATSAPP`.
  - `NEXT_PUBLIC_COOPERATIVAS_URL` y `RESEND_API_KEY`.
  - `SUPABASE_SERVICE_ROLE_KEY` en la landing.
  - Con la fase 4: `EXPO_PUBLIC_SITIO_URL` y `NEXT_PUBLIC_SITIO_URL`.
- **Orden de despliegue:** migraciones → edge functions → panel y landing → nuevo build de la app en EAS. Recomendado: `npx expo install expo-crypto`. `expo-clipboard` ya está añadido.
- **Datos:**
  - Confirmar con cada cooperativa que `rutas.precio_pasaje` está en USD (revisar los mayores de 200).
  - Revisar los RIF antiguos sin dígito verificador.
  - Pasar a `foto_cliente_path` las fotos antiguas guardadas como URL.

### 4. Decisiones de negocio pendientes

- Texto del reembolso para quien pagó con Zelle: hoy promete "Te devolveremos Bs …".
- Lista de artículos prohibidos y texto del seguro (3 veces el valor declarado).
- Si un cambio de hora hecho por la cooperativa da derecho a reembolso del 100 %.
- Revisión legal de `/terminos` y `/privacidad` (fase 4).

## Último estado verificado

El 02/11/2026, `npx tsc --noEmit` dio 0 errores en EnBusApp, PanelCooperativas y LandingEnBus. Al cerrar la fase 3, `expo lint`, `eslint` y `npm run build` del panel y la landing también estaban en verde.
