# Suscripciones Realtime (Supabase)

## 1. Objetivo
Definir qué tablas emiten eventos en tiempo real, qué canales se suscriben y quién los consume. Esto permite que la UI se actualice automáticamente sin `pull-to-refresh`.

## 2. Tablas con Realtime Habilitado

| Tabla | Eventos | Filtro | Consumidor |
|---|---|---|---|
| `encomiendas` | UPDATE (estado) | `sender_id = user.id OR receiver_user_id = user.id` | App Móvil: detalle de envío/recepción |
| `encomiendas` | INSERT, UPDATE | `cooperativa_id = user.cooperativa_id` | Panel Cooperativas: lista de encomiendas |
| `boletos` | UPDATE (estado) | `comprador_id = user.id` | App Móvil: detalle de boleto |
| `boletos` | INSERT, UPDATE | `cooperativa_id = user.cooperativa_id` | Panel Cooperativas: lista de boletos |
| `viajes` | UPDATE (asientos_disponibles) | `ruta_id IN (rutas del resultado)` | App Móvil: actualizar disponibilidad en resultados |
| `notificaciones_usuario` | INSERT | `usuario_id = user.id` | App Móvil: badge de notificaciones en header |
| `pagos` | INSERT | `cooperativa_id = user.cooperativa_id` | Panel Cooperativas: alerta de nuevo pago pendiente de verificar |

**Publicación (fase 4)**: la migración `20260721000002` añade a `supabase_realtime` las tablas `boletos`, `encomiendas`, `viajes`, `pagos` y `notificaciones_usuario` si faltan (antes `viajes` y `pagos` dependían de un paso manual: los asientos y "Pagos por verificar (n)" no se movían solos). Si la publicación no existe deja un NOTICE ("actívala en Database > Publications y vuelve a ejecutar este archivo"); si es `FOR ALL TABLES` no toca nada. Realtime respeta la RLS de cada tabla, así que cada cliente solo recibe las filas que puede leer.

## 3. Implementación por Plataforma

### 3.1 App Móvil (React Native)
```typescript
// Suscripción a cambios de estado de una encomienda específica
supabase
  .channel('encomienda-detalle')
  .on('postgres_changes', {
    event: 'UPDATE',
    schema: 'public',
    table: 'encomiendas',
    filter: `id=eq.${encomienda_id}`
  }, (payload) => {
    // Actualizar UI con nuevo estado
  })
  .subscribe()
```

### 3.2 Panel Cooperativas (Next.js)
```typescript
// Suscripción a nuevas encomiendas de la cooperativa
supabase
  .channel('encomiendas-cooperativa')
  .on('postgres_changes', {
    event: '*',
    schema: 'public',
    table: 'encomiendas',
    filter: `cooperativa_id=eq.${cooperativa_id}`
  }, (payload) => {
    // Actualizar lista de encomiendas
  })
  .subscribe()
```

## 4. Reglas de Limpieza
- Las suscripciones deben desuscribirse (`unsubscribe()`) al salir de la pantalla/componente.
- En la App Móvil, las suscripciones solo se activan en pantallas de detalle y listados activos.
- En el Panel Web, las suscripciones se mantienen activas mientras la sesión esté abierta.

## 5. Tablas SIN Realtime
Las siguientes tablas **no requieren** Realtime (datos estáticos o de lectura infrecuente):
- `cooperativas`, `sucursales`, `rutas` — Cambian raramente, se cargan con fetch normal.
- `tarifas` — Solo cambia por Super Admin, no necesita actualización instantánea.
- `notificaciones_log` — Solo para auditoría del Super Admin.
- `comisiones_ciclo` — Consulta periódica, no en tiempo real.
- `calificaciones` — No requiere actualización en tiempo real.
