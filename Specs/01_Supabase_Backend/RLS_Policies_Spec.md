# Row Level Security (RLS) Policies

## 1. Principio
Cada tabla tiene RLS habilitado. El acceso se controla por el rol del usuario autenticado (`profiles.role`) y su `cooperativa_id` cuando aplica.

## 2. Helper Functions (SQL)

> **Importante**: Las funciones viven en el schema `public.`, no en `auth.`. El schema `auth` es gestionado internamente por Supabase y no se deben crear objetos ahí.

```sql
-- Obtener rol del usuario actual
CREATE FUNCTION public.user_role() RETURNS rol_usuario AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Obtener cooperativa del usuario actual
CREATE FUNCTION public.user_cooperativa_id() RETURNS UUID AS $$
  SELECT cooperativa_id FROM public.profiles WHERE id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Verificar si es super admin
CREATE FUNCTION public.is_super_admin() RETURNS BOOLEAN AS $$
  SELECT public.user_role() = 'super_admin'
$$ LANGUAGE sql SECURITY DEFINER STABLE;
```

> **Regla de uso**: En las políticas RLS, siempre referenciar como `public.user_role()`, `public.user_cooperativa_id()`, `public.is_super_admin()`.

## 3. Políticas por Tabla

### 3.1 `profiles`
| Operación | Política | Condición |
|---|---|---|
| SELECT | Propio perfil | `id = auth.uid()` |
| SELECT | Super Admin ve todos | `public.is_super_admin()` |
| SELECT | Admin cooperativa ve empleados de su cooperativa | `public.user_role() IN ('admin_cooperativa') AND cooperativa_id = public.user_cooperativa_id()` |
| UPDATE | Solo propio perfil | `id = auth.uid()` |
| INSERT | Automático via Supabase Auth trigger | — |

> **Columnas protegidas**: el trigger `aa_proteger_perfil` (`proteger_perfil_fn`) impide que el usuario cambie su `role`, `cooperativa_id`, `sucursal_id` y, desde la fase 4, `eliminada_at` (`EB_SIN_PERMISO`): la baja solo se marca con `fn_eliminar_mi_cuenta` y no se puede deshacer con un UPDATE directo.

### 3.2 `cooperativas`
| Operación | Política | Condición |
|---|---|---|
| SELECT | Todos los autenticados (lectura pública de datos básicos) | `auth.uid() IS NOT NULL` |
| INSERT | Solo Super Admin | `public.is_super_admin()` |
| UPDATE | Super Admin o Admin de la cooperativa | `public.is_super_admin() OR (public.user_role() = 'admin_cooperativa' AND id = public.user_cooperativa_id())` |
| DELETE | Solo Super Admin | `public.is_super_admin()` |

> **Columnas protegidas (fase 3)**: la política UPDATE permitía al admin de la cooperativa cambiar su propio `estado` y su `comision_porcentaje`. El trigger `aa_proteger_cooperativa` (`BEFORE UPDATE`, función `proteger_cooperativa_fn`) lo cierra: si quien actualiza no es Super Admin (`current_user` `authenticated`/`anon`), cambiar `estado`, `comision_porcentaje`, `motivo_estado`, `estado_cambiado_at`, `estado_cambiado_por`, `calificacion_promedio` o `total_calificaciones` devuelve `EB_SIN_PERMISO`, y `nombre`/`rif` solo se pueden corregir con la cooperativa en `PENDIENTE` o `RECHAZADA`. Los cambios de estado van por `fn_cambiar_estado_cooperativa` (Super Admin) y `fn_solicitar_revision_cooperativa` (admin de la cooperativa, solo desde `RECHAZADA`).

### 3.3 `sucursales`
| Operación | Política | Condición |
|---|---|---|
| SELECT | Todos los autenticados | `auth.uid() IS NOT NULL` |
| INSERT/UPDATE/DELETE | Admin de la cooperativa o Super Admin | `public.is_super_admin() OR (public.user_role() = 'admin_cooperativa' AND cooperativa_id = public.user_cooperativa_id())` |

### 3.4 `metodos_pago_cooperativa`
| Operación | Política | Condición |
|---|---|---|
| SELECT (datos públicos) | Todos los autenticados | `auth.uid() IS NOT NULL AND activo = true` |
| SELECT (todos) | Admin/Taquillero de la cooperativa | `cooperativa_id = public.user_cooperativa_id()` |
| INSERT/UPDATE/DELETE | Solo Admin de la cooperativa | `public.user_role() = 'admin_cooperativa' AND cooperativa_id = public.user_cooperativa_id()` |

### 3.5 `rutas`
| Operación | Política | Condición |
|---|---|---|
| SELECT | Todos los autenticados (rutas activas) | `auth.uid() IS NOT NULL AND activa = true` |
| SELECT (todas) | Admin/Taquillero de su cooperativa o Super Admin | `public.is_super_admin() OR cooperativa_id = public.user_cooperativa_id()` |
| INSERT/UPDATE/DELETE | Admin de la cooperativa o Super Admin | `public.is_super_admin() OR (public.user_role() = 'admin_cooperativa' AND cooperativa_id = public.user_cooperativa_id())` |

### 3.6 `viajes`
| Operación | Política | Condición |
|---|---|---|
| SELECT | Todos los autenticados (viajes programados) | `auth.uid() IS NOT NULL` |
| INSERT/UPDATE/DELETE | Admin/Taquillero de la cooperativa | `cooperativa_id = public.user_cooperativa_id()` |
| INSERT/UPDATE/DELETE | Super Admin | `public.is_super_admin()` |

### 3.7 `encomiendas`
| Operación | Política | Condición |
|---|---|---|
| SELECT | Remitente ve las suyas | `sender_id = auth.uid()` |
| SELECT | Destinatario registrado ve las suyas | `receiver_user_id = auth.uid()` |
| SELECT | Taquillero ve las de su cooperativa | `cooperativa_id = public.user_cooperativa_id()` |
| SELECT | Super Admin ve todas | `public.is_super_admin()` |
| INSERT | Cualquier usuario autenticado | `auth.uid() IS NOT NULL AND public.user_role() = 'user'` |
| UPDATE | Remitente (solo cancelar) | `sender_id = auth.uid()` |
| UPDATE | Taquillero de la cooperativa (cambios de estado) | `cooperativa_id = public.user_cooperativa_id()` |

> **Fase 3**: al crear desde la app, el trigger `aa_proteger_encomiendas_cliente` fuerza `origen_registro = 'APP'`, guarda la foto en `foto_cliente_path` y limpia `remitente_*` y las columnas de entrega. Operaciones que van **solo por RPC** (`SECURITY DEFINER`): alta presencial (`fn_registrar_encomienda_taquilla`), no recibir (`fn_rechazar_encomienda_origen`), validar PIN (`fn_validar_pin_retiro`), entregar (`fn_entregar_encomienda`) y desbloquear el PIN (`fn_desbloquear_pin`, admin de la cooperativa o Super Admin: el Super Admin no tiene política UPDATE en `encomiendas`). El rastreo público (`fn_rastrear_encomienda_publico`) solo lo ejecuta `service_role` (server action de la landing).

> **Fase 4**: la política UPDATE del taquillero sigue existiendo, pero el trigger `aa_proteger_entrega_encomienda` impide que una escritura directa (`authenticated`/`anon`) pase la encomienda a `ENTREGADA` o `DEVUELTA` o cambie `pin_retiro`, `intentos_pin`, `pin_bloqueado`, `pin_validado_*`, `entregada_*`, `retiro_*` o `entrega_sin_pin_motivo` (`EB_OPERACION_NO_PERMITIDA`). Así el PIN no se puede probar con un UPDATE ni contra `fn_entregar_encomienda`, que exige la validación previa de `fn_validar_pin_retiro` (15 minutos, mismo empleado).

### 3.8 `boletos`
| Operación | Política | Condición |
|---|---|---|
| SELECT | Comprador ve los suyos | `comprador_id = auth.uid()` |
| SELECT | Taquillero ve los de su cooperativa | `cooperativa_id = public.user_cooperativa_id()` |
| SELECT | Super Admin | `public.is_super_admin()` |
| INSERT | Cualquier usuario autenticado | `public.user_role() = 'user'` |
| UPDATE | Comprador (solo cancelar) | `comprador_id = auth.uid()` |
| UPDATE | Taquillero (marcar usado) | `cooperativa_id = public.user_cooperativa_id()` |

> **Fase 3**: como la política SELECT solo deja ver los boletos propios, la app consulta los asientos ocupados de una salida con `fn_asientos_ocupados(p_viaje_id)` (`SECURITY DEFINER`, devuelve solo los números de asiento). El cliente no puede escribir `monto_reembolso` ni las columnas `reembolso_*` (trigger `aa_proteger_boletos_cliente`): la cancelación del viaje y el registro de la devolución van por `fn_cancelar_viaje`, `fn_reembolsos` y `fn_registrar_reembolso`; los pasajeros por asiento, por `fn_asignar_pasajeros`.

### 3.9 `pagos`
| Operación | Política | Condición |
|---|---|---|
| SELECT | Pagador ve los suyos | `pagador_id = auth.uid()` |
| SELECT | **Partes de la encomienda ven su cobro** (fase 3) | `encomienda_id IS NOT NULL AND EXISTS (SELECT 1 FROM encomiendas e WHERE e.id = pagos.encomienda_id AND (e.sender_id = auth.uid() OR e.receiver_user_id = auth.uid()))`: remitente y destinatario ven todos los pagos de su encomienda, también el que registró la otra parte |
| SELECT | Taquillero de la cooperativa | `cooperativa_id = public.user_cooperativa_id()` |
| SELECT | Super Admin | `public.is_super_admin()` |
| INSERT | Cualquier usuario autenticado | `auth.uid() IS NOT NULL` |
| UPDATE | Taquillero/Admin (verificar pago) | `cooperativa_id = public.user_cooperativa_id()` |

### 3.10 `calificaciones`
| Operación | Política | Condición |
|---|---|---|
| SELECT | Públicas para usuarios autenticados | `auth.uid() IS NOT NULL` |
| INSERT | Solo el comprador del boleto | `usuario_id = auth.uid()` |
| UPDATE | Solo el autor | `usuario_id = auth.uid()` |
| DELETE | Solo Super Admin | `public.is_super_admin()` |

### 3.11 `tarifas`
| Operación | Política | Condición |
|---|---|---|
| SELECT | Todos los autenticados | `auth.uid() IS NOT NULL` |
| INSERT/UPDATE | Solo Super Admin | `public.is_super_admin()` |

> **Fase 4**: el panel de EnBus publica y programa tarifas con `fn_publicar_tarifa` / `fn_cancelar_tarifa_programada` (una transacción) en lugar de dos escrituras directas.

### 3.12 `notificaciones_usuario`
| Operación | Política | Condición |
|---|---|---|
| SELECT | Solo las propias | `usuario_id = auth.uid()` |
| UPDATE | Solo las propias (marcar leída) | `usuario_id = auth.uid()` |

### 3.13 `incidencias`
| Operación | Política | Condición |
|---|---|---|
| SELECT | Super admin ve incidencias | `public.is_super_admin()` |
| SELECT | Usuario ve sus reportes (fase 3) | `reportado_por = auth.uid()` |
| INSERT | Super admin registra incidencias (fase 3) | `public.is_super_admin()` |
| UPDATE | Solo super admin actualiza | `public.is_super_admin()` |

> **Fase 3**: se eliminó la política "Cualquier usuario reporta" (`auth.uid() IS NOT NULL`), que dejaba insertar incidencias con cualquier `tipo`. Los usuarios reportan **solo por RPC**: `fn_reportar_problema(p_categoria, p_descripcion, p_boleto_id, p_encomienda_id)` crea una incidencia `REPORTE_USUARIO` con `categoria` y `boleto_id`/`encomienda_id` propios, con un límite de 5 por 24 horas (`EB_DEMASIADOS_REPORTES`). Las alertas automáticas las crea el sistema con `SECURITY DEFINER`.

### 3.14 `comisiones_ciclo`
| Operación | Política | Condición |
|---|---|---|
| SELECT | Admin de su cooperativa o Super Admin | `public.is_super_admin() OR (public.user_role() = 'admin_cooperativa' AND cooperativa_id = public.user_cooperativa_id())` |
| INSERT/UPDATE | Solo Super Admin | `public.is_super_admin()` |

### 3.15 `notificaciones_log`
| Operación | Política | Condición |
|---|---|---|
| SELECT | Super Admin (para debugging y métricas) | `public.is_super_admin()` |
| INSERT/UPDATE/DELETE | Bloqueado client-side | `false` (solo el backend/triggers con `SECURITY DEFINER` insertan) |

### 3.16 `encomienda_estado_historial`
| Operación | Política | Condición |
|---|---|---|
| SELECT | Remitente, Destinatario, Taquillero de la cooperativa, Super Admin | Mismas reglas que `encomiendas` SELECT |
| INSERT | Solo via trigger | No se expone INSERT al cliente. El trigger `log_estado_encomienda` usa `SECURITY DEFINER` para bypasear RLS. |

> **Nota**: El spec `Taquilla_Encomiendas_Spec.md §5` menciona que el panel "Inserta en `encomienda_estado_historial`", pero esto se refiere al efecto indirecto del trigger al actualizar `encomiendas.estado`, no a un INSERT directo del frontend.

### 3.17 `pending_notifications`
| Operación | Política | Condición |
|---|---|---|
| ALL | Bloqueado client-side | `false` (solo el backend/triggers y CRON jobs insertan vía `SECURITY DEFINER`) |

### 3.18 Storage: `fotos-encomiendas` (`storage.objects`)
El bucket es privado: se guarda la **ruta** del objeto y se muestra con URL firmada.

| Operación | Política | Condición |
|---|---|---|
| SELECT | Lectura fotos-encomiendas | `bucket_id = 'fotos-encomiendas' AND auth.uid() IS NOT NULL` |
| INSERT / UPDATE / DELETE | Taquillero insert/update/delete fotos-encomiendas | `bucket_id = 'fotos-encomiendas' AND public.user_role() IN ('taquillero', 'admin_cooperativa')` |
| INSERT | **Usuario sube fotos de sus envios** (fase 3) | `bucket_id = 'fotos-encomiendas' AND public.user_role() = 'user' AND (storage.foldername(name))[1] = auth.uid()::text` |
| UPDATE | **Usuario reemplaza fotos de sus envios** (fase 3) | Misma condición que el INSERT |

| SELECT (**restrictiva**) | **Guias solo para el personal de su cooperativa** (fase 4) | Fuera de `guias/` no restringe nada. En `guias/<cooperativa_id>/…`: `public.is_super_admin()` o `public.user_role() IN ('taquillero', 'admin_cooperativa')` de esa cooperativa; las guías antiguas `guias/<archivo>` (sin PIN) quedan para el personal |

El remitente sube la foto de su paquete en su carpeta (`<id del usuario>/…`) y la ruta se guarda en `encomiendas.foto_cliente_path`; la taquilla la sube en `<id de la encomienda>/…` y la guarda en `foto_evidencia_url`. Desde la fase 4 la guía PDF lleva el PIN de retiro: `generar-guia-pdf` la sube con el `service_role` a `guias/<cooperativa_id>/…` y devuelve una URL firmada; la política restrictiva evita que cualquier usuario autenticado la liste.

### 3.19 Storage: `logos-cooperativas` (`storage.objects`)
Bucket público para lectura. Escriben el Super Admin (políticas de `20260414000007`) y, desde la fase 4, el administrador de la cooperativa en su carpeta:

| Operación | Política | Condición |
|---|---|---|
| INSERT | **Admin de cooperativa sube su logo** | `bucket_id = 'logos-cooperativas' AND public.user_role() = 'admin_cooperativa' AND (storage.foldername(name))[1] = public.user_cooperativa_id()::text` |
| UPDATE | **Admin de cooperativa reemplaza su logo** | Misma condición en `USING` y `WITH CHECK` (upsert de `<cooperativa_id>/logo.<ext>`) |

### 3.20 `bajas_cuenta` y `limites_uso` (fase 4)
| Tabla | Operación | Política | Condición |
|---|---|---|---|
| `bajas_cuenta` | SELECT | Super admin ve bajas | `public.is_super_admin()` |
| `bajas_cuenta` | INSERT/UPDATE | Solo `fn_eliminar_mi_cuenta` (`SECURITY DEFINER`) y la edge function `eliminar-cuenta` (`service_role`) | — |
| `limites_uso` | ALL | RLS sin políticas y `REVOKE ALL` para `anon`/`authenticated` | Solo `service_role` vía `fn_consumir_limite` |

## 4. Permisos de ejecución de las RPC (fase 3)
| Quién | RPC |
|---|---|
| `authenticated` | `fn_sucursales_en_ciudad`, `fn_asientos_ocupados`, `fn_asignar_pasajeros`, `fn_checkout_boletos`, `fn_validar_embarque`, `fn_cancelar_viaje`, `fn_reembolsos`, `fn_registrar_reembolso`, `fn_registrar_encomienda_taquilla`, `fn_rechazar_encomienda_origen`, `fn_validar_pin_retiro`, `fn_entregar_encomienda`, `fn_desbloquear_pin`, `fn_reportar_problema`, `fn_cambiar_estado_cooperativa`, `fn_solicitar_revision_cooperativa`, `fn_checklist_cooperativa` (cada una valida el rol dentro) |
| `anon`, `authenticated`, `service_role` | `fn_cotizar_envio_publico`, `fn_rutas_populares`, `fn_estadisticas_publicas` |
| Solo `service_role` | `fn_rastrear_encomienda_publico`, `fn_email_registrado` |
| Nadie desde el cliente | Funciones internas `_…` (por ejemplo `_fecha_hora_ve`, `_resumen_compra`, `_asegurar_asientos`): sin `EXECUTE` para `anon` ni `authenticated` |

## 5. Permisos de ejecución de las RPC (fase 4)
| Quién | RPC |
|---|---|
| `authenticated` | `fn_bandeja_cooperativa`, `fn_editar_viaje`, `fn_completar_viaje`, `fn_publicar_tarifa`, `fn_cancelar_tarifa_programada`, `fn_remitente_de_encomienda`, `fn_eliminar_mi_cuenta` (cada una valida el rol dentro); siguen `fn_validar_pin_retiro`, `fn_entregar_encomienda`, `fn_desbloquear_pin` |
| `anon`, `authenticated`, `service_role` | `fn_rutas_populares` (sin cambios) |
| Solo `service_role` | `fn_consumir_limite`, `fn_limpiar_limites_uso` |
| Nadie desde el cliente | `fn_activar_tarifas_programadas` (cron) y las internas `_cedula_para_guardar`, `_telefono_para_guardar`, `_notificar_usuario` |
