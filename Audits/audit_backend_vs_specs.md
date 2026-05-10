# 🔍 Auditoría Backend vs Specs — Panas Cargo / EnBus

> **Fecha**: 2026-04-13  
> **Alcance**: 9 migraciones SQL + 7 Edge Functions vs 37 Specs  
> **Metodología**: Comparación línea a línea Spec → Implementación

---

## 📊 Resumen Ejecutivo

| Categoría | Conformes | No Conformes | Parciales |
|---|---|---|---|
| Enums | ✅ 10/10 | — | — |
| Tablas (16) | ✅ 15/16 | — | ⚠️ 1 |
| Índices | ✅ ~95% | ❌ ~5% | — |
| Constraints | ✅ 2/3 | ❌ 1 | — |
| Triggers (6) | ✅ 6/6 | — | ⚠️ 2 con observaciones |
| Views (4) | ✅ 4/4 | — | — |
| RLS Policies | ✅ ~90% | ❌ ~10% | — |
| Helper Functions | ⚠️ Parcial | — | — |
| Storage | ✅ 2/2 | — | ⚠️ 1 |
| CRON Jobs (4) | ✅ 3/4 | — | ⚠️ 1 |
| Edge Functions (7) | ✅ 5/7 | — | ⚠️ 2 |

**Calificación Global: 🟡 85% de conformidad. 15% requiere correcciones.**

---

## 🔴 Hallazgos CRÍTICOS (Deben corregirse)

### C-01: Helper Functions en schema incorrecto
**Spec**: [RLS_Policies_Spec.md §2](file:///c:/Users/Javie/Documents/Dev/Panas%20Cargo/Specs/01_Supabase_Backend/RLS_Policies_Spec.md) especifica:
```sql
CREATE FUNCTION auth.user_role() ...
CREATE FUNCTION auth.user_cooperativa_id() ...
CREATE FUNCTION auth.is_super_admin() ...
```

**Implementación**: [20260414000003_rls_functions.sql](file:///c:/Users/Javie/Documents/Dev/Panas%20Cargo/supabase/migrations/20260414000003_rls_functions.sql) las crea en `public.`:
```sql
CREATE OR REPLACE FUNCTION public.user_role() ...
CREATE OR REPLACE FUNCTION public.user_cooperativa_id() ...
CREATE OR REPLACE FUNCTION public.is_super_admin() ...
```

**Veredicto**: ⚠️ **DISCREPANCIA** con el spec, pero la implementación en `public.` es en realidad **la decisión correcta** para Supabase, ya que el schema `auth` es gestionado por Supabase y no se deben crear funciones ahí. Las políticas RLS de la migración 004 usan `public.user_role()` consistentemente, así que la implementación es **internamente coherente**. 

> [!IMPORTANT]
> **Recomendación**: Actualizar el spec `RLS_Policies_Spec.md §2` para reflejar que las funciones viven en `public.` en vez de `auth.`, manteniendo la implementación actual.

---

### C-02: Falta constraint de validación de transiciones de estado en `encomiendas`
**Spec**: [State_Machines_Spec.md §1.3](file:///c:/Users/Javie/Documents/Dev/Panas%20Cargo/Specs/00_General/State_Machines_Spec.md) y [Database_Schema_Spec.md](file:///c:/Users/Javie/Documents/Dev/Panas%20Cargo/Specs/01_Supabase_Backend/Database_Schema_Spec.md) dicen textualmente:

> "Ninguna transición fuera de las aquí documentadas debe ser permitida por la base de datos."

**Implementación**: No existe ningún trigger `BEFORE UPDATE` en `encomiendas` ni en `boletos` que valide las transiciones de estado. Actualmente se puede hacer un UPDATE directo de `PENDIENTE_DE_ESCANEO` → `ENTREGADA` y la base de datos lo aceptaría.

> [!CAUTION]
> **Impacto**: ALTO. Sin validación de transiciones en DB, cualquier bug en el frontend o un actor malicioso con acceso RLS podría corromper el flujo de negocio saltando estados.

**Acción requerida**: Crear un trigger `BEFORE UPDATE` en `encomiendas` y `boletos` que valide que la transición `OLD.estado → NEW.estado` esté en la lista de transiciones permitidas del spec.

---

### C-03: Falta constraint de validación de transiciones de estado en `boletos`
Mismo problema que C-02 pero para boletos. Las transiciones válidas del spec (§2.3 de State_Machines_Spec.md) no se validan en la DB.

---

### C-04: Falta validar `estado_encomienda` antes de cancelación por remitente
**Spec**: [State_Machines_Spec.md §1.4](file:///c:/Users/Javie/Documents/Dev/Panas%20Cargo/Specs/00_General/State_Machines_Spec.md):

> "La cancelación solo es posible en estados `PENDIENTE_DE_ESCANEO`, `EN_RECEPCION` y `POR_PAGAR`."

**Implementación**: La RLS policy `"Remitente actualiza propia"` en [20260414000004_rls_policies.sql:57](file:///c:/Users/Javie/Documents/Dev/Panas%20Cargo/supabase/migrations/20260414000004_rls_policies.sql#L57) permite al remitente hacer UPDATE sin restricción de columnas ni de estado origen:
```sql
CREATE POLICY "Remitente actualiza propia" ON public.encomiendas 
  FOR UPDATE USING (sender_id = auth.uid());
```

**Riesgo**: El remitente podría cambiar cualquier campo, no solo cancelar. Y podría cancelar una encomienda `EN_TRANSITO` o `ENTREGADA`. Esto se resuelve automáticamente si se implementa C-02 (trigger de validación de transiciones).

---

### C-05: `notificaciones_log` — RLS bloquea todo acceso client-side
**Spec**: [RLS_Policies_Spec.md](file:///c:/Users/Javie/Documents/Dev/Panas%20Cargo/Specs/01_Supabase_Backend/RLS_Policies_Spec.md) no define políticas explícitas para `notificaciones_log`, pero el spec de Notificaciones dice:

> "Esta tabla es consultable por el Super Admin para debugging y métricas."

**Implementación**: [20260414000004_rls_policies.sql:90](file:///c:/Users/Javie/Documents/Dev/Panas%20Cargo/supabase/migrations/20260414000004_rls_policies.sql#L90):
```sql
CREATE POLICY "Notificaciones_log sistema" ON public.notificaciones_log FOR ALL USING (false);
```

Esto bloquea **todo** acceso client-side, incluyendo al Super Admin. El Super Admin no podrá consultar los logs de notificaciones desde el panel web.

> [!WARNING]
> **Acción requerida**: Agregar una política que permita SELECT al Super Admin:
> ```sql
> CREATE POLICY "Super admin ve logs" ON public.notificaciones_log 
>   FOR SELECT USING (public.is_super_admin());
> ```

---

### C-06: `encomienda_estado_historial` — Falta política INSERT
**Spec**: Se necesita que el trigger `log_estado_encomienda_fn()` pueda insertar en esta tabla.

**Implementación**: La política RLS solo define SELECT. La función `log_estado_encomienda_fn()` es `SECURITY DEFINER` lo cual bypasea RLS para esa función, así que **funciona correctamente para el trigger**. Sin embargo, el spec de `Taquilla_Encomiendas_Spec.md §5` dice que el panel **Inserta** en `encomienda_estado_historial`. Si algún frontend necesita insertar directamente, no podrá.

> [!NOTE]
> **Veredicto**: Parcialmente aceptable. El trigger `SECURITY DEFINER` cubre la inserción automática. Si el plan es que SOLO el trigger inserta, es correcto. Documentar esta decisión.

---

## 🟡 Hallazgos MODERADOS (Deberían corregirse)

### M-01: Orden de migraciones no coincide con la guía del spec
**Spec** ([Database_Schema_Spec.md §1.1](file:///c:/Users/Javie/Documents/Dev/Panas%20Cargo/Specs/01_Supabase_Backend/Database_Schema_Spec.md)):
```
001_enums → 002_tables → 003_indexes → 004_views → 005_functions → 006_triggers → 007_rls → 008_cron → 009_storage → 010_seed
```

**Implementación**:
```
001_enums → 002_tables (con índices inline) → 003_rls_functions → 004_rls_policies → 005_triggers → 006_views → 007_storage → 008_cron → 010_seed
```

| Diferencia | Detalle |
|---|---|
| Índices no separados | Están inline en `002_tables.sql` en vez de un archivo `003_indexes.sql` propio |
| Orden Functions/RLS invertido | El spec dice views→functions→triggers→RLS, la implementación hace functions→RLS→triggers→views |
| Falta `009` | Se salta del `008` al `010` |

> [!NOTE]
> **Veredicto**: No es un error funcional (el orden de las dependencias es correcto donde importa). Sin embargo, se desvía del estándar documental. Los índices inline son la práctica más común y aceptable.

---

### M-02: CRON `auto_devolver_encomienda` usa 7 días naturales en vez de 5 días hábiles
**Spec**: [State_Machines_Spec.md §1.3](file:///c:/Users/Javie/Documents/Dev/Panas%20Cargo/Specs/00_General/State_Machines_Spec.md) y [General_Spec.md](file:///c:/Users/Javie/Documents/Dev/Panas%20Cargo/Specs/00_General/General_Spec.md):

> "Si una encomienda en estado `EN_OFICINA_DESTINO` no es retirada en **5 días hábiles**, se devuelve."

**Implementación**: [20260414000008_cron_jobs.sql:44](file:///c:/Users/Javie/Documents/Dev/Panas%20Cargo/supabase/migrations/20260414000008_cron_jobs.sql#L44):
```sql
AND updated_at < now() - interval '7 days'
```

El comentario dice "Asumimos 7 días naturales como aproximación rápida". Esto es **técnicamente correcto** como aproximación (5 hábiles ≈ 7 naturales), pero el spec dice 5 hábiles, y hay un comentario en el spec original de Database_Schema_Spec.md que dice `interval '5 days'`:

> `UPDATE encomiendas SET estado = 'DEVUELTA' WHERE estado = 'EN_OFICINA_DESTINO' AND updated_at < now() - interval '5 days';`

> [!WARNING]
> **Discrepancia**: El spec de la DB dice `5 days`, el de negocio dice `5 días hábiles`. La implementación usa `7 days`. El spec de la DB (§1.1 tabla de CRON) contradice al spec de negocio. Se necesita alinear: **o actualizar el spec de DB para decir 7 days (natural) como lo implementa, o implementar una función de cálculo de días hábiles**.

---

### M-03: CRON `auto_devolver_encomienda` schedule discrepante
**Spec** ([Database_Schema_Spec.md §1.1](file:///c:/Users/Javie/Documents/Dev/Panas%20Cargo/Specs/01_Supabase_Backend/Database_Schema_Spec.md)):
```
0 6 * * * (diario a las 6AM)
```

**Implementación**: [20260414000008_cron_jobs.sql:82](file:///c:/Users/Javie/Documents/Dev/Panas%20Cargo/supabase/migrations/20260414000008_cron_jobs.sql#L82):
```sql
'0 0 * * *'  -- medianoche
```

El spec dice ejecutar a las 6AM, la implementación ejecuta a medianoche.

---

### M-04: Falta extensión `pgcrypto`
**Spec** ([Database_Schema_Spec.md §1.1](file:///c:/Users/Javie/Documents/Dev/Panas%20Cargo/Specs/01_Supabase_Backend/Database_Schema_Spec.md)):
```sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;     -- gen_random_uuid()
```

**Implementación**: Solo se crea `pg_cron` y `pg_net` en [20260414000008_cron_jobs.sql](file:///c:/Users/Javie/Documents/Dev/Panas%20Cargo/supabase/migrations/20260414000008_cron_jobs.sql).

> [!NOTE]
> `pgcrypto` ya viene habilitado por defecto en Supabase, por lo que `gen_random_uuid()` funciona sin crearla explícitamente. Sin embargo, por rigor, el spec dice incluirlo. **Impacto: nulo en Supabase**, pero sería un problema si se migra a otro PostgreSQL.

---

### M-05: Edge Function `track-and-trace` — Falta campo `cooperativa` en respuesta
**Spec** ([Track_and_Trace_Spec.md §3.2](file:///c:/Users/Javie/Documents/Dev/Panas%20Cargo/Specs/05_Web_Landing_Page/Track_and_Trace_Spec.md)):
```
| Cooperativa | ✅ (nombre) |
```

**Implementación**: [track-and-trace/index.ts:78-88](file:///c:/Users/Javie/Documents/Dev/Panas%20Cargo/supabase/functions/track-and-trace/index.ts#L78-L88) — El response payload no incluye el nombre de la cooperativa:
```typescript
const responsePayload = {
  tracking_id, estado, origen, destino, fechas, historial_estados
  // ❌ Falta: cooperativa (nombre)
};
```

**Acción**: Hacer join con `cooperativas` para incluir el nombre.

---

### M-06: Edge Function `track-and-trace` — Query con `anon` key sin auth lee tabla con RLS
**Implementación**: [track-and-trace/index.ts:46](file:///c:/Users/Javie/Documents/Dev/Panas%20Cargo/supabase/functions/track-and-trace/index.ts#L46):
```typescript
const supabase = createClient(supabaseUrl, supabaseKey); // anon key, sin auth
```

Luego consulta `encomiendas` y `encomienda_estado_historial`, pero las políticas RLS de ambas tablas solo permiten acceso a usuarios autenticados con roles específicos. Un client anónimo no pasará ninguna política.

> [!CAUTION]
> **Bug**: La función `track-and-trace` **no puede leer encomiendas** porque usa `SUPABASE_ANON_KEY` sin token de usuario, y todas las RLS de `encomiendas` requieren `auth.uid() IS NOT NULL` o roles específicos. Debe usar `SUPABASE_SERVICE_ROLE_KEY` para bypasear RLS.

---

### M-07: Edge Function `calculadora-publica` — Mismo problema de RLS
**Implementación**: [calculadora-publica/index.ts:47](file:///c:/Users/Javie/Documents/Dev/Panas%20Cargo/supabase/functions/calculadora-publica/index.ts#L47):
```typescript
const supabase = createClient(supabaseUrl, supabaseKey); // anon key
```

Consulta `tarifas` y `rutas`. Las políticas de `tarifas` requieren `auth.uid() IS NOT NULL`. Las de `rutas` también.

> [!CAUTION]
> **Bug**: Al ser un endpoint público sin autenticación, el cliente anón no pasa RLS. Debe usar `SUPABASE_SERVICE_ROLE_KEY`.

---

### M-08: Edge Function `enviar-whatsapp` — Falta lógica de reintento y fallback SMS
**Spec** ([Edge_Functions_Spec.md §2.2](file:///c:/Users/Javie/Documents/Dev/Panas%20Cargo/Specs/01_Supabase_Backend/Edge_Functions_Spec.md) y [Notifications_Spec.md §6](file:///c:/Users/Javie/Documents/Dev/Panas%20Cargo/Specs/00_General/Notifications_Spec.md)):

> "Si falla, reintenta 1 vez. Si falla de nuevo, envía SMS como fallback."

**Implementación**: [enviar-whatsapp/index.ts:29-31](file:///c:/Users/Javie/Documents/Dev/Panas%20Cargo/supabase/functions/enviar-whatsapp/index.ts#L29-L31):
```typescript
const twilioSuccess = true;  // Simulación hardcodeada
const canalUsado = 'WHATSAPP';
```

No hay lógica de reintento ni fallback a SMS. Solo un placeholder simulado.

> [!WARNING]
> **Veredicto**: Aceptable como stub V1 siempre que se documente como TODO para integración real con Twilio. Pero la estructura de retries y fallback debería al menos estar esbozada.

---

### M-09: Edge Function `enviar-push` — Falta chequear preferencia `notif_boletos`
**Spec** ([Edge_Functions_Spec.md §2.3](file:///c:/Users/Javie/Documents/Dev/Panas%20Cargo/Specs/01_Supabase_Backend/Edge_Functions_Spec.md)):

> "Verifica preferencias de notificación del usuario."

**Implementación**: [enviar-push/index.ts:35-37](file:///c:/Users/Javie/Documents/Dev/Panas%20Cargo/supabase/functions/enviar-push/index.ts#L35-L37):
```typescript
if (recurso_tipo === 'encomienda' && !profile.notif_encomiendas) {
    return ... // Solo chequea encomiendas
}
```

Falta validar `notif_boletos` cuando `recurso_tipo === 'boleto'` y `notif_recordatorios` para recordatorios.

---

### M-10: Edge Function `generar-guia-pdf` — PDF es un stub, no genera PDF real
**Spec** ([Edge_Functions_Spec.md §2.4](file:///c:/Users/Javie/Documents/Dev/Panas%20Cargo/Specs/01_Supabase_Backend/Edge_Functions_Spec.md)):

> "Genera PDF con: tracking ID, QR de rastreo, datos del envío, peso, costo. Formatea para impresión térmica."

**Implementación**: [generar-guia-pdf/index.ts:48](file:///c:/Users/Javie/Documents/Dev/Panas%20Cargo/supabase/functions/generar-guia-pdf/index.ts#L48):
```typescript
const pdfContent = new TextEncoder().encode(`Guía Panas Cargo\nTracking ID: ${enc.tracking_id}`);
```

Esto genera un archivo de texto plano disfrazado de `.pdf`, no un PDF real. Falta la generación con library (pdf-lib, jsPDF) y falta incluir: QR de rastreo, datos del envío, peso, costo, datos del remitente/destinatario, cooperativa.

> [!NOTE]
> **Veredicto**: Aceptable como placeholder para la Fase 1 de implementación, pero debe marcarse como TODO prioritario.

---

### M-11: Edge Function `generar-guia-pdf` — Sube al bucket privado pero intenta obtener URL pública
**Implementación**: [generar-guia-pdf/index.ts:55-65](file:///c:/Users/Javie/Documents/Dev/Panas%20Cargo/supabase/functions/generar-guia-pdf/index.ts#L55-L65):
```typescript
// Sube a bucket privado (fotos-encomiendas = public: false)
await supabaseAuth.storage.from('fotos-encomiendas').upload(...)
// Intenta obtener URL pública
const { data: publicUrlData } = supabaseAuth.storage.from('fotos-encomiendas').getPublicUrl(...)
```

El bucket `fotos-encomiendas` es **privado** (creado con `public = false`), por lo que `getPublicUrl()` generará una URL que no será accesible sin auth. Debería usar `createSignedUrl()` en su lugar, o subir a un bucket diferente para guías.

---

## 🟢 Hallazgos CONFORMES (Lo que está bien)

### ✅ Enums — 100% conformes
Los 10 enums en [20260414000001_enums.sql](file:///c:/Users/Javie/Documents/Dev/Panas%20Cargo/supabase/migrations/20260414000001_enums.sql) coinciden exactamente con [Database_Schema_Spec.md §2](file:///c:/Users/Javie/Documents/Dev/Panas%20Cargo/Specs/01_Supabase_Backend/Database_Schema_Spec.md):
- `estado_encomienda` ✅ (9 valores)
- `estado_boleto` ✅ (5 valores)
- `estado_cooperativa` ✅ (3 valores)
- `rol_usuario` ✅ (4 valores)
- `modalidad_pago` ✅ (2 valores)
- `tipo_pago` ✅ (2 valores)
- `tipo_metodo_pago` ✅ (4 valores)
- `canal_notificacion` ✅ (4 valores)
- `estado_notificacion` ✅ (3 valores)
- `estado_viaje` ✅ (4 valores)

### ✅ Tablas — 15 de 16 conformes
Todas las 16 tablas del spec están implementadas con columnas, tipos, PKs, FKs y defaults correctos:
- `profiles` ✅, `cooperativas` ✅, `sucursales` ✅, `metodos_pago_cooperativa` ✅
- `rutas` ✅, `viajes` ✅, `encomiendas` ✅, `encomienda_estado_historial` ✅
- `boletos` ✅, `pagos` ✅, `calificaciones` ✅, `tarifas` ✅
- `notificaciones_log` ✅, `notificaciones_usuario` ✅, `comisiones_ciclo` ✅, `incidencias` ✅

Tabla extra no en spec: `pending_notifications` — creada correctamente para la cola de notificaciones.

### ✅ Constraint `pagos` CHECK
```sql
CONSTRAINT check_pago_referencia CHECK (encomienda_id IS NOT NULL OR boleto_id IS NOT NULL)
```
Coincide con spec §3.10.

### ✅ Unique constraint tarifa activa
```sql
CREATE UNIQUE INDEX idx_tarifas_activa ON public.tarifas (activa) WHERE activa = true;
```
Implementación correcta del constraint "Solo puede haber una tarifa con `activa = true`".

### ✅ Views — 4/4 conformes
- `v_proximos_viajes` ✅ con filtro de `PROGRAMADO`, `fecha_hora_salida > now()`, `activa = true`, `estado = 'ACTIVA'`
- `v_encomiendas_activas` ✅ excluye `ENTREGADA, CANCELADA, DEVUELTA`
- `v_boletos_activos` ✅ estados `RESERVADO, PAGADO` con viaje futuro
- `v_balance_cooperativa` ✅ resumen financiero

Todas usan `security_invoker = true` ✅ (buena práctica para respeto de RLS en views).

### ✅ Triggers — Funcionalidad correcta
| Trigger | Estado |
|---|---|
| `handle_updated_at` | ✅ Aplicado a 5 tablas correctas |
| `log_estado_encomienda` | ✅ AFTER UPDATE, registra `auth.uid()` |
| `generar_tracking_id` | ✅ Formato `EB-YYMMDD-XXXXX`, verifica unicidad |
| `generar_pin_retiro` | ✅ BEFORE UPDATE, 4 dígitos, PIN único, inmutable |
| `calcular_calificacion` | ✅ INSERT/UPDATE/DELETE, recalcula promedio |
| `actualizar_asientos` | ✅ Lógica completa INSERT/UPDATE/DELETE |

### ✅ Storage Buckets
- `logos-cooperativas` ✅ público
- `fotos-encomiendas` ✅ privado con RLS apropiado

### ✅ Edge Functions — Fórmula de cálculo correcta
La fórmula implementada en `calcular-costo-encomienda` y `calculadora-publica`:
```
costo = peso_kg × tarifa_por_kg × (1 + factor_distancia_por_min × duracion_estimada_min)
```
Coincide **exactamente** con [Payments_Spec.md §5.2](file:///c:/Users/Javie/Documents/Dev/Panas%20Cargo/Specs/00_General/Payments_Spec.md) y [Tarifas_Spec.md §3](file:///c:/Users/Javie/Documents/Dev/Panas%20Cargo/Specs/04_Web_Super_Admin/Tarifas_Spec.md).

### ✅ Rate Limiting
- `track-and-trace`: 30 reqs/min ✅
- `calculadora-publica`: 60 reqs/min ✅
- Implementación con `Map` en memoria ✅ (conforme al spec §3.1 de Edge_Functions_Spec.md)

---

## 📋 Plan de Correcciones Prioritizado

| Prioridad | ID | Acción | Archivo afectado |
|---|---|---|---|
| 🔴 P0 | C-02 | Crear trigger de validación de transiciones de estado `encomiendas` | Nueva migración |
| 🔴 P0 | C-03 | Crear trigger de validación de transiciones de estado `boletos` | Nueva migración |
| 🔴 P0 | M-06 | `track-and-trace`: Usar `SERVICE_ROLE_KEY` para leer datos | `track-and-trace/index.ts` |
| 🔴 P0 | M-07 | `calculadora-publica`: Usar `SERVICE_ROLE_KEY` para leer datos | `calculadora-publica/index.ts` |
| 🟡 P1 | C-05 | Agregar política SELECT para Super Admin en `notificaciones_log` | Nueva migración o fix en 004 |
| 🟡 P1 | M-05 | Agregar nombre de cooperativa en respuesta de `track-and-trace` | `track-and-trace/index.ts` |
| 🟡 P1 | M-09 | Validar `notif_boletos` y `notif_recordatorios` en `enviar-push` | `enviar-push/index.ts` |
| 🟡 P1 | M-11 | Usar `createSignedUrl()` en vez de `getPublicUrl()` en `generar-guia-pdf` | `generar-guia-pdf/index.ts` |
| 🟢 P2 | M-03 | Cambiar schedule de `auto_devolver_encomienda` a `0 6 * * *` | `20260414000008_cron_jobs.sql` |
| 🟢 P2 | M-02 | Alinear spec vs implementación para 5 hábiles vs 7 naturales | Spec o migración |
| 🟢 P2 | C-01 | Actualizar spec RLS para reflejar funciones en `public.` | `RLS_Policies_Spec.md` |
| 🟢 P2 | M-08 | Implementar estructura de retries y fallback SMS en `enviar-whatsapp` | `enviar-whatsapp/index.ts` |
| 🟢 P2 | M-10 | Implementar generación real de PDF con pdf-lib | `generar-guia-pdf/index.ts` |
| 🟢 P3 | M-04 | Agregar `CREATE EXTENSION IF NOT EXISTS pgcrypto;` | Migración 001 o nueva |

---

## 📌 Specs Analizados (37 de 37)

### `00_General/` (5 specs)
| Spec | Relevantes Hallazgos |
|---|---|
| [General_Spec.md](file:///c:/Users/Javie/Documents/Dev/Panas%20Cargo/Specs/00_General/General_Spec.md) | ✅ Flujo de encomiendas y boletos reflejado. Peso 25kg ✅. PIN 4 dígitos ✅. Tracking ID format ✅. |
| [Auth_and_Roles_Spec.md](file:///c:/Users/Javie/Documents/Dev/Panas%20Cargo/Specs/00_General/Auth_and_Roles_Spec.md) | ✅ Roles en enum ✅. Campos de profiles ✅. |
| [State_Machines_Spec.md](file:///c:/Users/Javie/Documents/Dev/Panas%20Cargo/Specs/00_General/State_Machines_Spec.md) | ❌ Transiciones NO validadas en DB (C-02, C-03) |
| [Payments_Spec.md](file:///c:/Users/Javie/Documents/Dev/Panas%20Cargo/Specs/00_General/Payments_Spec.md) | ✅ Fórmula de cálculo ✅. Tabla pagos ✅. CHECK constraint ✅. |
| [Notifications_Spec.md](file:///c:/Users/Javie/Documents/Dev/Panas%20Cargo/Specs/00_General/Notifications_Spec.md) | ⚠️ Fallback SMS no implementado (M-08). Preferencias parciales (M-09). |

### `01_Supabase_Backend/` (4 specs)
| Spec | Estado |
|---|---|
| [Database_Schema_Spec.md](file:///c:/Users/Javie/Documents/Dev/Panas%20Cargo/Specs/01_Supabase_Backend/Database_Schema_Spec.md) | ⚠️ 95%. Falta transición validation triggers. Enums, tablas, indices OK. |
| [RLS_Policies_Spec.md](file:///c:/Users/Javie/Documents/Dev/Panas%20Cargo/Specs/01_Supabase_Backend/RLS_Policies_Spec.md) | ⚠️ 90%. Schema de funciones ≠ spec (C-01), notificaciones_log bloqueada (C-05). |
| [Edge_Functions_Spec.md](file:///c:/Users/Javie/Documents/Dev/Panas%20Cargo/Specs/01_Supabase_Backend/Edge_Functions_Spec.md) | ⚠️ 7 funciones implementadas, 2 con bugs de RLS (M-06, M-07). |
| [Realtime_Subscriptions_Spec.md](file:///c:/Users/Javie/Documents/Dev/Panas%20Cargo/Specs/01_Supabase_Backend/Realtime_Subscriptions_Spec.md) | ℹ️ No aplica a backend SQL (es responsabilidad del frontend). |

### `02_App_Movil/` — `05_Web_Landing_Page/` (28 specs)
Analizados para validar correspondencia con la DB. No hay hallazgos backend adicionales más allá de los ya reportados.
