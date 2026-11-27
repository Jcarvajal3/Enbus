# Horarios fijos y asignación de unidades

Fecha: 2026-11-27. Reemplaza la programación de viajes con bus obligatorio.

## Por qué

En la realidad la cooperativa tiene fijos **la ruta, el día y la hora** (su itinerario de terminal).
El bus y el chofer se deciden cada día o cada semana. Hoy el panel obliga a elegir el bus al
programar y copia su capacidad al viaje, lo que no corresponde al proceso real.

Además se vende antes de saber qué bus va, así que **la capacidad del viaje no puede depender del bus
al programar**. Todas las unidades de Transporte Barinas son de 31 puestos; el rango habitual es ~31.

## Modelo

| Concepto | Qué es | Quién lo decide |
|---|---|---|
| **Horario** (`horarios`) | Ruta + hora + días de la semana + capacidad + vigencia | Admin, una vez |
| **Salida** (`viajes`) | Un viaje concreto de un día. Se genera solo desde el horario, 30 días hacia adelante | El sistema (cron diario) |
| **Día no laborable** (`dias_no_laborables`) | Fecha en que no se generan salidas (p. ej. 1 de enero). Puede repetirse cada año | Admin, una vez, en Configuración |
| **Asignación** (`viajes.bus_id`, `numero_unidad`, `nombre_chofer`) | Qué bus y chofer hacen una salida | Admin o taquillero, cada día/semana |

- `viajes.numero_unidad` / `nombre_chofer` / `asientos_totales` siguen siendo la copia que leen
  manifiesto, app, embarque, despacho: **no cambia** cómo se leen.
- El mapa de asientos sale solo de `asientos_totales` (shared/asientos.ts): vender sin bus funciona.
- Un viaje sin bus muestra "Por asignar" (la app ya lo hace).
- **No se puede marcar la salida (PROGRAMADO → EN_CURSO) sin unidad.**
- Sigue existiendo el **viaje extra** (una salida suelta, manual), con bus opcional.
- Desaparece el switch "Viaje recurrente" de Programar viaje (lo reemplazan los Horarios). Los viajes
  recurrentes ya creados quedan como están.

## Base de datos — migración `supabase/migrations/20261127000001_horarios_y_asignacion.sql`

Convenciones del repo: re-ejecutable (`IF NOT EXISTS`, `CREATE OR REPLACE`, `DROP POLICY IF EXISTS`),
envuelta en `BEGIN; … COMMIT;`, errores con `public._fallar('EB_…', 'mensaje para el usuario', '{"campo":"…"}')`,
contexto con `public._contexto_staff()` (o_uid, o_rol, o_cooperativa_id, o_sucursal_id), RPC
`SECURITY DEFINER SET search_path = public, pg_temp`, `REVOKE ALL … FROM PUBLIC, anon` y `GRANT EXECUTE … TO authenticated`
solo para las RPC públicas; helpers internos `_x` sin grant a authenticated. Hora de Venezuela:
`America/Caracas` (sin horario de verano). Días de la semana: `0 = domingo … 6 = sábado` (igual que
`extract(dow …)` y `DIAS_SEMANA` de `viajes/salidas.ts`).

### 1. `public.dias_no_laborables`
```
id uuid PK default gen_random_uuid()
cooperativa_id uuid NOT NULL FK cooperativas ON DELETE CASCADE
fecha date NOT NULL               -- si cada_anio, solo importan mes y día
nombre text NULL  CHECK 1..60
cada_anio boolean NOT NULL default false
created_at timestamptz NOT NULL default now()
UNIQUE (cooperativa_id, fecha)
```
- RLS: SELECT para el personal de la cooperativa y super admin. Sin INSERT/UPDATE/DELETE directos
  (`REVOKE INSERT, UPDATE, DELETE … FROM anon, authenticated`): se escribe por RPC.
- `_es_no_laborable(p_coop uuid, p_fecha date) RETURNS boolean` (STABLE): coincide la fecha exacta, o
  (cada_anio y mismo mes y día; el 29-feb anual solo coincide en años bisiestos).

### 2. `public.horarios`
```
id uuid PK
cooperativa_id uuid NOT NULL FK cooperativas ON DELETE CASCADE
ruta_id uuid NOT NULL FK rutas ON DELETE CASCADE
hora_salida time NOT NULL                 -- minutos exactos (segundos = 0)
dias smallint[] NOT NULL                  -- CHECK: no vacío, valores 0..6, sin repetidos
capacidad integer NOT NULL CHECK 1..80
vigente_desde date NOT NULL
vigente_hasta date NULL  CHECK (vigente_hasta IS NULL OR vigente_hasta >= vigente_desde)
activo boolean NOT NULL default true
creado_por uuid NULL
created_at, updated_at timestamptz NOT NULL default now()   (+ trigger handle_updated_at)
```
- RLS: SELECT personal de la cooperativa + super admin. Escritura solo por RPC.
- No puede haber dos horarios **activos** de la misma ruta a la misma hora que compartan un día
  (`dias && …`) y cuyas vigencias se solapen → `EB_DATOS_INVALIDOS` campo `hora`.

### 3. `viajes.horario_id`
- `ALTER TABLE viajes ADD COLUMN IF NOT EXISTS horario_id uuid REFERENCES horarios(id) ON DELETE SET NULL`.
- `CREATE UNIQUE INDEX uq_viajes_horario_salida ON viajes (horario_id, fecha_hora_salida) WHERE horario_id IS NOT NULL`
  → la generación es idempotente (`ON CONFLICT DO NOTHING`). Un viaje cancelado a mano no se vuelve a crear.

### 4. Generación: `_generar_salidas(p_cooperativa_id uuid DEFAULT NULL, p_horario_id uuid DEFAULT NULL) RETURNS integer`
Interna (sin grant a authenticated). Crea las salidas que falten, devuelve cuántas creó.
Para cada horario `activo` de una cooperativa con `estado = 'ACTIVA'` y ruta `activa` (con duración):
para cada fecha `d` de `hoy_VE … hoy_VE + 30` (horizonte = constante `_horizonte_salidas()` = 30):
- `extract(dow from d) = ANY(dias)`, `d BETWEEN vigente_desde AND coalesce(vigente_hasta, d)`,
  `NOT _es_no_laborable(coop, d)`,
- `salida := (d + hora_salida) AT TIME ZONE 'America/Caracas'`, `salida > now()`;
- `INSERT INTO viajes (ruta_id, cooperativa_id, fecha_hora_salida, fecha_hora_llegada_est = salida + duracion,
  asientos_totales = capacidad, asientos_disponibles = capacidad, estado 'PROGRAMADO', recurrente true, horario_id)
  ON CONFLICT DO NOTHING`. Sin bus.
- Corre como dueño de la función → el trigger `proteger_viajes_cliente_fn` no aplica (solo actúa con current_user authenticated/anon).

Cron diario `generar_salidas` `'15 4 * * *'` (00:15 VE): `SELECT public._generar_salidas()`. Patrón de
desprogramar-si-existe y programar igual que 20261109000004_push_panel.sql.

### 5. Retirar salidas que ya no corresponden: `_retirar_salidas(p_viaje_ids uuid[]) RETURNS jsonb`
Interna. Para cada viaje (PROGRAMADO, salida futura):
- **Sin movimiento** (ningún boleto en ningún estado y ninguna encomienda que lo referencie — revisar
  todas las FK hacia viajes): `DELETE`.
- **Con boletos ocupados** (RESERVADO/PAGADO/USADO) o encomiendas: **no se toca**; se devuelve en
  `conservadas` (`viaje_id, fecha_hora_salida, ocupados`) para que el admin lo cancele a mano con el
  flujo de cancelación (que reembolsa y avisa).
- Solo boletos CANCELADO/EXPIRADO: `estado = 'CANCELADO'` (no hay nadie a quien avisar).
Devuelve `{ quitadas: int, conservadas: [...] }`.

### 6. RPC de horarios (admin_cooperativa; taquillero → EB_SIN_PERMISO)
- `fn_guardar_horario(p_id uuid, p_ruta_id uuid, p_hora_salida time, p_dias smallint[], p_capacidad int, p_vigente_desde date, p_vigente_hasta date) RETURNS jsonb`
  - `p_id` NULL crea; si no, edita (del mismo coop). Validar ruta de la coop y activa, días, capacidad,
    `vigente_desde >= hoy_VE` al crear (al editar puede quedar en el pasado si no cambia),
    `vigente_hasta <= hoy_VE + 365`, solape (§2). Errores con campo: `ruta`, `hora`, `dias`, `capacidad`, `desde`, `hasta`.
  - Advisory lock por horario/coop. Tras guardar, **resincronizar**: salidas futuras PROGRAMADO del
    horario que ya no coinciden (hora, día, vigencia, ruta, no laborable) → `_retirar_salidas`. Las que
    siguen coincidiendo y **no tienen bus** y no tienen ocupados → `asientos_totales/disponibles = capacidad`
    (si tienen ocupados: capacidad = greatest(capacidad, mayor asiento vendido, ocupados)). Luego `_generar_salidas(coop, id)`.
  - Devuelve `{ id, creadas, quitadas, conservadas: [...], hasta: date (último día generado) }`.
- `fn_cambiar_estado_horario(p_id uuid, p_activo boolean) RETURNS jsonb`: desactivar retira las salidas
  futuras sin movimiento (`_retirar_salidas`); activar genera. Mismo formato de respuesta.

### 7. RPC de días no laborables (admin_cooperativa)
- `fn_guardar_dia_no_laborable(p_fecha date, p_nombre text, p_cada_anio boolean) RETURNS jsonb`
  - Upsert por (coop, fecha). Fecha no anterior a hoy_VE salvo `cada_anio`; tope hoy+2 años.
  - Retira con `_retirar_salidas` las salidas futuras PROGRAMADO **generadas por horario** (`horario_id IS NOT NULL`)
    de esa fecha (fecha en hora VE; si cada_anio, todas las del mismo mes-día dentro del horizonte).
    Los viajes extra (sin horario) no se tocan.
  - Devuelve `{ id, quitadas, conservadas }`.
- `fn_borrar_dia_no_laborable(p_id uuid) RETURNS jsonb`: borra y llama `_generar_salidas(coop)`. Devuelve `{ creadas }`.

### 8. Asignación de unidad
Helper `_validar_bus_para_viaje(p_coop uuid, p_bus_id uuid, p_viaje_id uuid, p_salida timestamptz, p_llegada timestamptz, p_minimo int) RETURNS record/bus`:
- bus de la cooperativa y activo (campo `bus`);
- `bus.asientos >= p_minimo` donde mínimo = `greatest(mayor asiento vendido, ocupados)` (como fn_editar_viaje) →
  "La unidad X tiene N puestos y ya hay vendido el puesto M." (campo `bus`);
- **choque**: otro viaje (≠ p_viaje_id) con el mismo bus en PROGRAMADO/EN_CURSO cuyo intervalo
  `[salida, llegada_est]` se solape → "La unidad X ya hace la salida <ruta> del <día> a las <hora>." (campo `bus`,
  detalle con `viaje_choque`).

`fn_asignar_bus(p_viaje_id uuid, p_bus_id uuid, p_nombre_chofer text DEFAULT NULL) RETURNS jsonb`
- Roles: **admin_cooperativa y taquillero** (es operación diaria, como marcar salida).
- Viaje de la coop y PROGRAMADO (FOR UPDATE).
- `p_bus_id` NULL → quitar unidad: `bus_id, numero_unidad, nombre_chofer = NULL`; asientos no cambian.
- Con bus: valida (§8), copia `numero_unidad`, `nombre_chofer = coalesce(nullif(trim(p_nombre_chofer),''), bus.chofer_nombre)`,
  `asientos_totales = bus.asientos`, `asientos_disponibles = asientos_totales - ocupados`.
- Devuelve `{ viaje_id, bus_id, numero_unidad, nombre_chofer, asientos_totales, asientos_disponibles }`.

`fn_copiar_asignaciones(p_desde date, p_hasta date) RETURNS jsonb` (admin y taquillero; rango ≤ 14 días)
- Para cada viaje PROGRAMADO sin unidad de la coop con salida (VE) en `[p_desde, p_hasta]` y futura:
  buscar el viaje de **7 días antes** con el mismo `horario_id` (o, si no tiene, misma ruta y misma hora local)
  que tenga `bus_id`; intentar asignarle el mismo bus y chofer con las mismas validaciones, cada uno en su
  subtransacción (`BEGIN … EXCEPTION WHEN others`), saltando los que fallen.
- Devuelve `{ asignadas: int, omitidas: [{ viaje_id, motivo }] }`.

`fn_editar_viaje` (redefinir la vigente de 20261109000001 con la misma firma): cuando cambia el bus o la
salida y hay bus, usar `_validar_bus_para_viaje` (añade la regla de choque). `p_bus_id` sigue sin poder
quitar la unidad (para eso `fn_asignar_bus(…, NULL)`).

`proteger_viajes_cliente_fn` (redefinir): si el INSERT del panel trae `bus_id`, añadir la regla de choque.

### 9. `fn_marcar_salida_viaje`
Redefinir la vigente (20260719000004): antes de pasar a EN_CURSO, si `bus_id IS NULL AND numero_unidad IS NULL`
→ `_fallar('EB_SIN_UNIDAD', 'Asigna la unidad antes de marcar la salida.', '{"campo":"bus"}')`.
(El caso ya EN_CURSO sigue devolviendo `ya_procesado`.) Añadir `EB_SIN_UNIDAD` a shared/errores.ts si
ahí se mapean los códigos (y regenerar con `node shared/generar.mjs`).

### 10. `fn_bandeja_cooperativa`
Redefinir la vigente añadiendo `salidas_sin_unidad` (int): viajes PROGRAMADO de la coop sin `bus_id` ni
`numero_unidad` con salida entre `now()` y el fin de **mañana** (VE).

### 11. Pruebas
`supabase/tests/robustez/10_horarios_asignacion.sql` con el formato de 01_*.sql (BEGIN; \i 00_fixtures.sql; …; ROLLBACK).
Casos: generar crea solo días elegidos dentro de 30 días y no en no laborables; idempotente; editar hora
retira las sin ventas y conserva las con ventas; día no laborable retira; asignar copia capacidad; choque de
bus; bus con menos puestos que el asiento vendido; marcar salida sin unidad falla; taquillero no puede
guardar horario.

## Panel — rutas y pantallas

> **Cambio de interfaz (2026-11-27, decisión del usuario; PREVALECE sobre esta sección):** no hay
> secciones aparte "Horarios" ni "Asignar unidades".
> - **Rutas** concentra la configuración: cada ruta muestra y edita sus **salidas** (horarios: hora, días,
>   capacidad; sin vigencia en la UI). De ahí salen solos los viajes a 30 días.
> - **Viajes** es solo la lista de salidas que compran los pasajeros. Ya no se crean viajes desde ahí. La
>   columna **Unidad** es un desplegable (buses activos + "Por asignar"); al cambiarlo se abre una
>   confirmación y se llama `fn_asignar_bus`. Sin botón Guardar. Ambos roles.
> - "Copiar de la semana anterior" queda sin interfaz (`fn_copiar_asignaciones` existe en la base, sin uso).
> - Días no laborables, marcar salida con unidad y avisos de Inicio quedan como se describe abajo
>   (los enlaces apuntan a Viajes y Rutas).

Navegación (`src/lib/navigation.ts`):
- **Horarios** `/cooperativas/horarios`: grupo Configuración, junto a Rutas, solo admin.
- **Asignar unidades** `/cooperativas/unidades`: grupo Boletos, después de Viajes, ambos roles.

### Horarios (`src/app/cooperativas/(panel)/horarios/`)
- Lista agrupada por ruta: hora, días (chips Lun…Dom), capacidad, vigencia, estado (activo/inactivo), acciones (Editar, Desactivar/Activar).
- "Nuevo horario" (diálogo, mismo estilo que Programar viaje / Buses): Ruta, Hora (HoraField), Días
  (botones, reutilizar `DIAS_SEMANA`), Capacidad (por defecto = **tamaño de bus más común** entre los buses
  activos de la coop; si no hay buses, 31), Desde (FechaField, hoy), Hasta (opcional).
- Texto fijo: "Las salidas se crean solas para los próximos 30 días. El bus se asigna después en Asignar unidades."
- Tras guardar: aviso "Se crearon N salidas hasta el <fecha>". Si hay `conservadas`: aviso persistente
  con la lista ("Estas salidas ya tienen pasajeros y no se cambiaron: …") y enlace a Viajes para cancelarlas.
- Estado vacío: explica qué es un horario y ofrece crear el primero.

### Días no laborables (Configuración → nueva pestaña `no-laborables`)
- Lista (fecha formateada, nombre, insignia "Cada año"), borrar.
- Agregar: FechaField, Nombre opcional, switch "Se repite cada año".
- Atajos de feriados nacionales fijos (cada año): 1 ene Año Nuevo, 19 abr, 1 may, 24 jun, 5 jul, 24 jul,
  12 oct, 24 dic, 25 dic, 31 dic. La cooperativa elige cuáles (muchas trabajan en feriados).
- Explicar: "En estos días no se crean salidas de tus horarios. Los viajes extra no se ven afectados."
- Tras agregar, si hay `conservadas`, mismo aviso que en Horarios.

### Asignar unidades (`src/app/cooperativas/(panel)/unidades/`)
- Selector de día (anterior / hoy / mañana / siguiente + calendario). Por defecto **mañana** si hoy ya no
  quedan salidas sin unidad; si no, hoy. `?fecha=YYYY-MM-DD`.
- Lista de salidas PROGRAMADO del día por hora: hora, ruta, vendidos / capacidad, **Unidad** (select con los
  buses activos: "U-12 · 31 puestos"; marca en el select los buses que ya están usados en una salida que se
  solapa, calculado en el cliente como pista; la validación real es del servidor), **Chofer** (input,
  se llena con el del bus al elegirlo), guardar por fila. Fila sin unidad resaltada "Por asignar".
- Botón "Copiar de la semana anterior" (llama `fn_copiar_asignaciones` para el día mostrado) con resumen del resultado.
- Contador arriba: "3 de 8 salidas sin unidad".

### Viajes (`src/app/cooperativas/(panel)/viajes/`)
- "Programar viaje" pasa a **"Viaje extra"**: ruta, fecha y hora, **capacidad** (default como en Horarios),
  bus **opcional** (si se elige, la capacidad es la del bus). Quitar el switch recurrente y su lógica
  (`salidas.ts`: conservar `DIAS_SEMANA`, que usa Horarios). Nota: "¿Salidas fijas? Créalas en Horarios."
- Lista: mostrar la unidad ("Por asignar" en tono de aviso).
- Editar viaje: el selector de bus admite "Sin unidad" (→ `fn_asignar_bus(viaje, null)`).
- `viaje-sheet.tsx`: "Unidad: Por asignar" + acción "Asignar unidad" (→ `/cooperativas/unidades?fecha=…`).
- Marcar salida (`marcar-viaje-dialogs.tsx`): si el viaje no tiene unidad, el diálogo lo dice y enlaza a asignar;
  el error `EB_SIN_UNIDAD` del servidor se muestra con ese mismo texto.

### Inicio (`dashboard/bandeja-atencion.tsx`)
- Tarjeta "N salidas sin unidad (hoy y mañana)" → `/cooperativas/unidades`, si `salidas_sin_unidad > 0`.

### Otros
- `components/boletos/viaje-opcion.tsx`, `despacho/page.tsx`: con unidad null mostrar "Unidad por asignar".

## Ajustes tras la revisión de arquitectura (PREVALECEN sobre las secciones anteriores)

1. **Clave de idempotencia = día de servicio, no instante.** Nueva columna `viajes.fecha_servicio date NULL`
   (día nominal en VE). Índice único `uq_viajes_horario_servicio (horario_id, fecha_servicio) WHERE horario_id IS NOT NULL`
   (en lugar de `(horario_id, fecha_hora_salida)`). Si el admin mueve una salida de hora con `fn_editar_viaje`,
   ese día ya tiene salida y no se genera otra. La generación rellena `fecha_servicio`.
2. **Retiro por el sistema libera el hueco.** Cuando `_retirar_salidas` cancela (por tener boletos CANCELADO/EXPIRADO,
   que impiden el DELETE porque las FK de boletos/encomiendas a viajes no tienen ON DELETE), pone
   `horario_id = NULL` además de `estado = 'CANCELADO'`. Solo una cancelación manual (`fn_cancelar_viaje`)
   conserva `horario_id` y bloquea la regeneración de ese día.
3. **Salidas conservadas.** Columna `viajes.fuera_de_horario boolean NOT NULL DEFAULT false`. `_retirar_salidas`
   marca `fuera_de_horario = true` en las que conserva (con boletos RESERVADO/PAGADO/USADO o encomiendas).
   El cron diario, además de generar, **reconcilia**: vuelve a intentar retirar las `fuera_de_horario` (cuando
   las reservas sin pagar ya expiraron, se retiran solas). La bandeja cuenta `salidas_fuera_de_horario` (futuras,
   PROGRAMADO) con tarjeta "N salidas fuera de horario tienen pasajeros: revísalas" → Viajes. La lista de Viajes
   muestra la insignia "Fuera de horario". No se extrae ningún flujo de cancelación nuevo: el admin cancela
   con el flujo existente (reembolsa y avisa).
4. **Adoptar los recurrentes existentes.** Antes de insertar, `_generar_salidas` adopta la salida PROGRAMADO
   de la misma coop + ruta + mismo instante con `horario_id IS NULL` (`UPDATE … SET horario_id, fecha_servicio`)
   en vez de crear otra. Así las salidas recurrentes ya creadas en producción (con bus) no se duplican y conservan su bus.
5. **Choque de bus**: solo contra otros viajes **PROGRAMADO** (no EN_CURSO: el bus pudo llegar antes de la
   llegada estimada; nada cierra viajes viejos automáticamente). Error duro.
6. **Marcar salida sin unidad** sigue siendo bloqueo en la base (`EB_SIN_UNIDAD`), pero el diálogo de marcar
   salida permite **elegir la unidad y el chofer ahí mismo** (llama `fn_asignar_bus` y luego marca la salida),
   para no frenar el andén. **Despachar encomiendas NO exige unidad** (decisión explícita).
7. **Concurrencia**: un único `pg_advisory_xact_lock(hashtextextended('horarios:' || coop::text, 0))` por cooperativa
   en `_generar_salidas` (por cada coop del bucle), en la reconciliación y en las 4 RPC de horarios/días. En el
   cron, cada cooperativa dentro de su `BEGIN … EXCEPTION WHEN others THEN RAISE WARNING` para que una no aborte
   a las demás. Bloquear viajes siempre con `SELECT … WHERE id = ANY(…) ORDER BY id FOR UPDATE` antes de contar
   boletos (en `_retirar_salidas`, resincronización de capacidad y `fn_copiar_asignaciones`), igual que
   `auto_expirar_reserva`.
8. **Regla única de contador**: con el viaje bloqueado, `asientos_disponibles = greatest(asientos_totales − count(boletos RESERVADO/PAGADO/USADO), 0)`.
   Mínimo admisible de `asientos_totales` = `greatest(mayor asiento ocupado, ocupados)`.
9. **INSERT directo del panel**: la redefinición de `proteger_viajes_cliente_fn` fuerza `NEW.horario_id := NULL`,
   `NEW.recurrente := false`, `NEW.fuera_de_horario := false`, `NEW.fecha_servicio := (NEW.fecha_hora_salida AT TIME ZONE 'America/Caracas')::date`.
10. **Grants explícitos**: `REVOKE ALL ON FUNCTION … FROM PUBLIC, anon, authenticated` en cada helper `_…`
    (incluido `_generar_salidas`, `_retirar_salidas`, `_aplicar_bus`, `_validar_bus_para_viaje`, `_es_no_laborable`);
    `GRANT EXECUTE … TO authenticated` solo a las RPC `fn_…`. Tablas nuevas: `REVOKE ALL … FROM anon`,
    `REVOKE INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER, REFERENCES … FROM authenticated`, `GRANT SELECT … TO authenticated`,
    `GRANT ALL … TO service_role`.
11. **Reactivación**: trigger `AFTER UPDATE OF activa ON rutas` (cuando pasa a true) y `AFTER UPDATE OF estado ON cooperativas`
    (cuando pasa a 'ACTIVA') que llaman `_generar_salidas(coop)` (función de trigger SECURITY DEFINER, sin grant).
    En el panel, el aviso de desactivar ruta (`rutas/actions.ts` `checkDesactivarRuta`) debe distinguir viajes
    **con pasajeros** de salidas vacías generadas por horarios (que no deben asustar).
12. **Bandeja**: `salidas_sin_unidad` y `salidas_fuera_de_horario` aplican el mismo filtro por ciudad de la sucursal
    que ya usa `fn_bandeja_cooperativa` (`20260721000002_fase4_operacion.sql` ~l.154) y excluyen salidas ya pasadas.
13. **Un solo helper de unidad** `_aplicar_bus(p_viaje_id, p_bus_id, p_nombre_chofer)` (viaje ya bloqueado) usado por
    `fn_asignar_bus`, `fn_editar_viaje`, `fn_copiar_asignaciones` y el diálogo de marcar salida (vía `fn_asignar_bus`).
    Capacidad al asignar: **si no hay ocupados**, `asientos_totales = bus.asientos`; **si hay ocupados**, nunca se
    sube automáticamente: solo se baja a `bus.asientos` si el bus es menor (y ≥ mínimo; si no, error). El admin
    puede subirla con Editar viaje.
14. **Topes quitados**: sin tope de `vigente_hasta` ni de 2 años en no laborables (el horizonte ya es 30 días).
15. `fn_copiar_asignaciones` excluye como origen los viajes CANCELADO.
16. **Deuda conocida (no se hace ahora)**: `leerCiudadesConSalidas` (`lib/pasajero/viajes.ts`, `limit(2000)`) y el
    calendario de la app (corte 1000) pueden quedarse cortos cuando haya muchas cooperativas con 30 días generados.

## Fuera de alcance
- Buses doble piso.
- Asignación automática de buses.
- Cambiar precios por horario (el precio sigue siendo el de la ruta).
