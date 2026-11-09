# QA de noviembre 2026: despliegue

Rama `qa/mejoras-panel-app`. Cambios del panel, la app, la landing y `shared/` resultado del QA.
Nada de esto está aplicado en Supabase todavía.

## 1. Migraciones (en este orden, una por una)

`supabase db push` aplica cada archivo en su propia transacción, que es lo que hace falta: la 000003
agrega un valor de enum que la 000008 usa, y no pueden ir en la misma transacción. No las pegues
juntas en el editor SQL.

| Archivo | Qué hace |
|---|---|
| `20261109000001_buses.sql` | Tabla `buses` con RLS, `viajes.bus_id`, copia del bus al crear el viaje, `fn_editar_viaje` con `p_bus_id` (firma nueva de 7 argumentos), conteo de buses en el checklist |
| `20261109000002_sucursales_horario_semana.sql` | `sucursales.horario_semana jsonb` y CHECKs (texto `horario` hasta 500) |
| `20261109000003_punto_de_venta_enum.sql` | `tipo_metodo_pago` + `PUNTO_DE_VENTA` |
| `20261109000004_push_panel.sql` | Suscripciones y cola de push del panel, trigger en `pagos`, crons `procesar_push_panel` y `limpiar_push_panel` |
| `20261109000005_nombre_remitente_app.sql` | Copia el nombre del cliente a `encomiendas.remitente_nombre` (arregla "Sin nombre") y rellena las existentes |
| `20261109000007_catalogo_ciudades_claves.sql` | Corrige las claves `tario`, `yritagua` y `guadualito` en rutas, sucursales y encomiendas |
| `20261109000008_punto_de_venta.sql` | `pagos.metodo_tipo`, Punto de venta en las RPC de taquilla, bloqueo en las de la app |

Antes del push: `supabase migration list --linked` y `supabase db push --linked --dry-run`.

## 2. Orden de despliegue

1. Migraciones (arriba).
2. Edge function `push-panel` y sus secretos (sección 3).
3. Panel en Vercel con `NEXT_PUBLIC_VAPID_PUBLIC_KEY`.
4. App con EAS (logos, cooperativas aliadas, Socopó, fotos sin recorte).

El panel nuevo **falla sin las migraciones**: la hoja del viaje pide `bus_id`, las sucursales escriben
`horario_semana` y programar viajes exige bus. Y el panel **viejo** deja de poder *editar* viajes en
cuanto se aplica la 000001 (cambia la firma de `fn_editar_viaje`). Aplica las migraciones y publica el
panel seguidos.

La app publicada sigue funcionando con las migraciones aplicadas: no lee columnas nuevas, y el horario
se sigue guardando como texto.

## 3. Push del panel (pasos manuales)

Detalle en `Audits/pendientes_push_panel.md`. En resumen:

```bash
npx web-push generate-vapid-keys
supabase secrets set VAPID_PUBLIC_KEY=<pública> VAPID_PRIVATE_KEY=<privada> VAPID_SUBJECT=mailto:soporte@<dominio>
supabase functions deploy push-panel
```

En Vercel: `NEXT_PUBLIC_VAPID_PUBLIC_KEY` = la clave pública, y volver a desplegar. El bloque
`[functions.push-panel]` ya está en `supabase/config.toml`.

## 4. Qué cambia para las cooperativas

- **Buses es obligatorio para programar viajes nuevos.** A las cooperativas activas sin buses les
  vuelve a salir el paso "Registra tus buses" en la puesta en marcha.
- **Embarque** es una sección propia (Operación → Embarque). Taquilla de boletos solo vende.
- **Punto de venta** aparece en el cobro de boletos y encomiendas: pide referencia y fecha.
- Las notificaciones se activan en **Impresora y lector**. En iPhone solo con el panel instalado.

## 5. Pendiente / fuera de alcance

- **Múltiples orígenes:** en pausa a pedido del usuario.
- **Lectura de `cooperativas`:** la RLS deja a cualquier usuario con sesión leer todas las columnas
  (comisión, RIF, contactos). La app no las pide, pero conviene cerrarlo con una vista o RPC pública.
- **Rol de embarque:** hoy Embarque lo ven admin y taquilleros; si lo va a manejar otra persona, hace
  falta un rol propio.
- En la app, las encomiendas que llegan por tiempo real salen sin logo hasta la siguiente recarga.
