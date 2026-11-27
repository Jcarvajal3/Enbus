# Auditoría de escalabilidad y consumo (27/11/2026)

Objetivo: consumir lo menos posible del plan de Supabase y que el sistema aguante miles de usuarios.
Medido contra la base de producción (`tydpnvajwfzcsxsowctp`) con `pg_stat_statements`, `pg_stat_user_tables`, `pg_policies` y `cron.job`. También revisé el código de la app, el panel y las edge functions. Solo arreglé lo del punto 0; el resto son recomendaciones.

## Resumen

- **La base de datos aguanta bien el crecimiento de consultas.** Hay índices para casi todo (solo falta uno), las políticas RLS ya están escritas como recomienda Supabase y la web pública usa caché.
- **El consumo no venía de los usuarios.** Venía de las tareas programadas (cron). Con 14 usuarios activos, más del 90 % del trabajo de la base eran crons que corren cada minuto.
- **Los dos límites reales para "miles de usuarios" son:**
  1. **Realtime:** cada pasajero con la app abierta ocupa una conexión. El plan gratis admite unas 200 a la vez.
  2. **Espacio:** con 500 MB caben unas 80–100 mil ventas, sin contar las fotos.

## 0. Arreglado hoy: historial de cron (la base llegó a 500 MB)

- `cron.job_run_details` ocupaba 423 MB (680 mil filas) y `net._http_response` 58 MB.
- Borré lo de más de 3 días y ejecuté `VACUUM FULL`. La base quedó en **26 MB**.
- Programé el cron diario `limpiar_historial_cron` (04:47) para que no vuelva a pasar. Migración: `supabase/migrations/20261127000002_limpiar_historial_cron.sql`.

## 1. Hallazgos por prioridad

| # | Prioridad | Dónde | Problema | Qué hacer |
|---|---|---|---|---|
| E1 | **Alta** | App móvil: `ActivityContext.tsx`, `useRealtime.ts`, `useEncomiendas.ts`, `(tabs)/boletos.tsx` | Cada pasajero con sesión abre 4–5 suscripciones `postgres_changes`: boletos (×2), encomiendas enviadas, encomiendas recibidas y notificaciones. Esto choca con dos límites. **Conexiones:** cada teléfono con la app abierta usa una conexión Realtime, y el plan gratis admite unas 200 simultáneas (Pro, 500). **Mensajes:** con `postgres_changes`, Supabase revisa el RLS de cada suscriptor por cada cambio, en un solo hilo. Supabase lo señala como el cuello de botella cuando hay muchos usuarios. | Pasar a **Broadcast desde la base**: un trigger en `boletos`, `encomiendas`, `pagos` y `notificaciones_usuario` llama a `realtime.broadcast_changes()` hacia un canal privado `usuario:<id>`. La app abre **un solo canal por usuario** en vez de 4–5. Además, **cerrar el socket cuando la app pasa a segundo plano** y volver a leer al regresar (los hooks ya vuelven a leer al regresar). Con eso, solo cuentan los usuarios que tienen la app en pantalla en ese momento. |
| E2 | **Alta** | Cron `procesar_notificaciones_pendientes` (cada minuto) | Llama a la edge function cada minuto aunque no haya nada que enviar. Eso suma 1.440 invocaciones al día (43 mil al mes) con descifrado del Vault y HTTP. Fue la consulta más cara de la base: 48 ms de media. | Hacer lo mismo que `procesar_push_panel`: llamar solo `IF EXISTS` hay filas pendientes en `pending_notifications` o tickets de Expo sin revisar en `notificaciones_log`. Mejor aún, que el trigger que encola la notificación despierte la función (`pg_net`) y dejar el cron como respaldo cada 5 minutos. |
| E3 | **Alta** | Espacio de la base | Cada venta ocupa unos **3–5 KB** entre el boleto, el pago, las notificaciones y el historial. Mucho de eso son índices: `boletos` 17, `pagos` 17, `encomiendas` 15. Con 500 MB caben unas 80–100 mil ventas. Además, cada cambio de asiento antes de pagar deja un boleto `CANCELADO` (ver auditoría de robustez, A9), lo que también ocupa espacio. | Retención automática:<br>- `notificaciones_log` y `pending_notifications` procesadas: 30 días;<br>- `notificaciones_usuario` leídas: 90 días;<br>- boletos `CANCELADO`/`EXPIRADO` sin pago y con más de 30 días: borrar o archivar.<br>Revisar el estado de `fn_limpiar_notificaciones` para que cubra esos casos. |
| E4 | Media | App móvil: `encomiendas/nueva.tsx:415`, `PaymentFlow.tsx:456` | Las fotos de encomiendas y los comprobantes de pago se suben **sin redimensionar**: solo con `quality` 0.7–0.8. Una foto de un teléfono moderno pesa 2–4 MB. Con 1 GB de almacenamiento y 5 GB de egress, caben unas 300–500 fotos y cada vista consume egress. El panel web sí las reduce (`fotos-archivo.ts`, 1600 px). | Agregar `expo-image-manipulator` y reducir a 1600 px de lado (JPEG 0.75) antes de subir, igual que el panel. Cada foto quedaría en unos 200–300 KB, entre 10 y 15 veces menos. |
| E5 | Media | Web pasajero: `use-asientos-ocupados.ts` (cada 10 s) | Mientras alguien elige asiento, cada 10 s se ejecuta una server action (función de Vercel + RPC `fn_asientos_ocupados`). Con 500 personas comprando a la vez son unas 50 peticiones por segundo solo para esto. | Subir el intervalo a 20–30 s; el servidor ya rechaza un asiento tomado. O escuchar el canal del viaje como hace la app (`buscar.tsx`). |
| E6 | Media | Plan de Supabase | El plan gratis trae compute *nano*: 0,5 GB de RAM, 60 conexiones directas y sin copias de seguridad. Además, 200 conexiones Realtime, 500 MB de base y 1 GB de almacenamiento. | Para miles de usuarios reales hace falta **Pro** (8 GB de base, 500 conexiones Realtime, backups diarios). Con E1–E4 hechos, el compute *Micro* incluido en Pro debería alcanzar al principio. Subir a *Small* solo si la CPU pasa del 70 % sostenido. |
| E7 | Baja | Índices | Hay 25 índices sin uso registrado (7 en `pagos`, 5 en `boletos`). Con tablas tan pequeñas, Postgres prefiere leer la tabla completa, así que hoy no se puede saber cuáles sobran. | Revisar de nuevo cuando haya unas 10 mil filas y quitar los que sigan en cero; cada índice encarece cada escritura. Falta un índice en `panel_push_cola.cooperativa_id` (llave foránea). |
| E8 | Baja | Cron `auto_expirar_reserva` (cada minuto) | 16 ms por ejecución. Hace falta cada minuto porque la reserva vencida sigue bloqueando el asiento (`uq_boletos_asiento_ocupado`). | Dejarlo así: ya usa el índice parcial `idx_boletos_reservas_por_vencer` y su costo no crece con los usuarios. |
| E9 | Baja | Panel de cooperativas (polling) | Contadores del menú cada 60 s, pagos cada 60 s, embarque cada 30 s, asientos cada 15 s y prueba de conexión cada 30 s. Todo se pausa con la pestaña oculta. | Está bien: lo usa poco personal. No vale la pena cambiarlo hasta tener cientos de taquillas abiertas a la vez. |

## 2. Lo que ya está bien (no tocar)

- **RLS:** todas las políticas usan `(select auth.uid())` y `(select user_cooperativa_id())`, así que Postgres las calcula una sola vez por consulta y no una vez por fila.
- **Índices:** cubren las consultas de cada pantalla (por comprador, cooperativa, viaje y estado), con índices parciales para colas y reservas. Solo falta el de la llave foránea mencionado en E7.
- **Web pública:** el buscador, las ciudades, los días, las próximas salidas y la tasa usan `unstable_cache` (60–120 s). Mil visitantes buscando lo mismo se convierten en una consulta cada 1–2 minutos.
- **Realtime en la app:** ya agrupa ráfagas en una sola relectura y filtra por usuario o viaje. El problema es el número de canales y el tipo de suscripción (E1), no la lógica.
- **Push del panel:** el cron solo despierta la función si hay cola. Es el modelo a copiar para E2.

## 3. Capacidad estimada

| Escenario | Plan gratis hoy | Con E1–E4 en Pro |
|---|---|---|
| Pasajeros con la app abierta a la vez | ~200 (límite de Realtime) | Varios miles. Con Broadcast y el socket cerrado en segundo plano, solo cuentan los que tienen la app en pantalla. |
| Visitas a la web pública | Miles por minuto (caché) | Igual |
| Ventas guardadas | ~80–100 mil (500 MB) | Millones (8 GB, con retención) |
| Fotos | ~300–500 | Decenas de miles (100 GB) |

## 4. Orden sugerido

1. **E2** (cron de notificaciones): una migración pequeña, con efecto inmediato en CPU y en invocaciones.
2. **E4** (fotos en la app): un cambio acotado que protege el almacenamiento y el egress del plan gratis.
3. **E3** (retención): una migración con crons de limpieza.
4. **E1** (Broadcast por usuario): el cambio más grande. Toca la base (triggers y políticas de `realtime.messages`) y los hooks de la app. Hacerlo antes de un lanzamiento con muchos usuarios.
5. **E6** (pasar a Pro): cuando se acerque el lanzamiento o se pase de ~150 usuarios simultáneos.
