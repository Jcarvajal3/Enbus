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

### 3.2 `cooperativas`
| Operación | Política | Condición |
|---|---|---|
| SELECT | Todos los autenticados (lectura pública de datos básicos) | `auth.uid() IS NOT NULL` |
| INSERT | Solo Super Admin | `public.is_super_admin()` |
| UPDATE | Super Admin o Admin de la cooperativa | `public.is_super_admin() OR (public.user_role() = 'admin_cooperativa' AND id = public.user_cooperativa_id())` |
| DELETE | Solo Super Admin | `public.is_super_admin()` |

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

### 3.8 `boletos`
| Operación | Política | Condición |
|---|---|---|
| SELECT | Comprador ve los suyos | `comprador_id = auth.uid()` |
| SELECT | Taquillero ve los de su cooperativa | `cooperativa_id = public.user_cooperativa_id()` |
| SELECT | Super Admin | `public.is_super_admin()` |
| INSERT | Cualquier usuario autenticado | `public.user_role() = 'user'` |
| UPDATE | Comprador (solo cancelar) | `comprador_id = auth.uid()` |
| UPDATE | Taquillero (marcar usado) | `cooperativa_id = public.user_cooperativa_id()` |

### 3.9 `pagos`
| Operación | Política | Condición |
|---|---|---|
| SELECT | Pagador ve los suyos | `pagador_id = auth.uid()` |
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

### 3.12 `notificaciones_usuario`
| Operación | Política | Condición |
|---|---|---|
| SELECT | Solo las propias | `usuario_id = auth.uid()` |
| UPDATE | Solo las propias (marcar leída) | `usuario_id = auth.uid()` |

### 3.13 `incidencias`
| Operación | Política | Condición |
|---|---|---|
| SELECT | Super Admin | `public.is_super_admin()` |
| INSERT | Cualquier usuario (reportar) o Sistema | `auth.uid() IS NOT NULL` |
| UPDATE | Solo Super Admin | `public.is_super_admin()` |

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
