# Row Level Security (RLS) Policies

## 1. Principio
Cada tabla tiene RLS habilitado. El acceso se controla por el rol del usuario autenticado (`profiles.role`) y su `cooperativa_id` cuando aplica.

## 2. Helper Functions (SQL)

```sql
-- Obtener rol del usuario actual
CREATE FUNCTION auth.user_role() RETURNS rol_usuario AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Obtener cooperativa del usuario actual
CREATE FUNCTION auth.user_cooperativa_id() RETURNS UUID AS $$
  SELECT cooperativa_id FROM public.profiles WHERE id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Verificar si es super admin
CREATE FUNCTION auth.is_super_admin() RETURNS BOOLEAN AS $$
  SELECT auth.user_role() = 'super_admin'
$$ LANGUAGE sql SECURITY DEFINER STABLE;
```

## 3. Políticas por Tabla

### 3.1 `profiles`
| Operación | Política | Condición |
|---|---|---|
| SELECT | Propio perfil | `id = auth.uid()` |
| SELECT | Super Admin ve todos | `auth.is_super_admin()` |
| SELECT | Admin cooperativa ve empleados de su cooperativa | `auth.user_role() IN ('admin_cooperativa') AND cooperativa_id = auth.user_cooperativa_id()` |
| UPDATE | Solo propio perfil | `id = auth.uid()` |
| INSERT | Automático via Supabase Auth trigger | — |

### 3.2 `cooperativas`
| Operación | Política | Condición |
|---|---|---|
| SELECT | Todos los autenticados (lectura pública de datos básicos) | `auth.uid() IS NOT NULL` |
| INSERT | Solo Super Admin | `auth.is_super_admin()` |
| UPDATE | Super Admin o Admin de la cooperativa | `auth.is_super_admin() OR (auth.user_role() = 'admin_cooperativa' AND id = auth.user_cooperativa_id())` |
| DELETE | Solo Super Admin | `auth.is_super_admin()` |

### 3.3 `sucursales`
| Operación | Política | Condición |
|---|---|---|
| SELECT | Todos los autenticados | `auth.uid() IS NOT NULL` |
| INSERT/UPDATE/DELETE | Admin de la cooperativa o Super Admin | `auth.is_super_admin() OR (auth.user_role() = 'admin_cooperativa' AND cooperativa_id = auth.user_cooperativa_id())` |

### 3.4 `metodos_pago_cooperativa`
| Operación | Política | Condición |
|---|---|---|
| SELECT (datos públicos) | Todos los autenticados | `auth.uid() IS NOT NULL AND activo = true` |
| SELECT (todos) | Admin/Taquillero de la cooperativa | `cooperativa_id = auth.user_cooperativa_id()` |
| INSERT/UPDATE/DELETE | Solo Admin de la cooperativa | `auth.user_role() = 'admin_cooperativa' AND cooperativa_id = auth.user_cooperativa_id()` |

### 3.5 `rutas`
| Operación | Política | Condición |
|---|---|---|
| SELECT | Todos los autenticados (rutas activas) | `auth.uid() IS NOT NULL AND activa = true` |
| SELECT (todas) | Admin/Taquillero de su cooperativa o Super Admin | `auth.is_super_admin() OR cooperativa_id = auth.user_cooperativa_id()` |
| INSERT/UPDATE/DELETE | Admin de la cooperativa o Super Admin | `auth.is_super_admin() OR (auth.user_role() = 'admin_cooperativa' AND cooperativa_id = auth.user_cooperativa_id())` |

### 3.6 `viajes`
| Operación | Política | Condición |
|---|---|---|
| SELECT | Todos los autenticados (viajes programados) | `auth.uid() IS NOT NULL` |
| INSERT/UPDATE/DELETE | Admin/Taquillero de la cooperativa | `cooperativa_id = auth.user_cooperativa_id()` |
| INSERT/UPDATE/DELETE | Super Admin | `auth.is_super_admin()` |

### 3.7 `encomiendas`
| Operación | Política | Condición |
|---|---|---|
| SELECT | Remitente ve las suyas | `sender_id = auth.uid()` |
| SELECT | Destinatario registrado ve las suyas | `receiver_user_id = auth.uid()` |
| SELECT | Taquillero ve las de su cooperativa | `cooperativa_id = auth.user_cooperativa_id()` |
| SELECT | Super Admin ve todas | `auth.is_super_admin()` |
| INSERT | Cualquier usuario autenticado | `auth.uid() IS NOT NULL AND auth.user_role() = 'user'` |
| UPDATE | Remitente (solo cancelar) | `sender_id = auth.uid()` |
| UPDATE | Taquillero de la cooperativa (cambios de estado) | `cooperativa_id = auth.user_cooperativa_id()` |

### 3.8 `boletos`
| Operación | Política | Condición |
|---|---|---|
| SELECT | Comprador ve los suyos | `comprador_id = auth.uid()` |
| SELECT | Taquillero ve los de su cooperativa | `cooperativa_id = auth.user_cooperativa_id()` |
| SELECT | Super Admin | `auth.is_super_admin()` |
| INSERT | Cualquier usuario autenticado | `auth.user_role() = 'user'` |
| UPDATE | Comprador (solo cancelar) | `comprador_id = auth.uid()` |
| UPDATE | Taquillero (marcar usado) | `cooperativa_id = auth.user_cooperativa_id()` |

### 3.9 `pagos`
| Operación | Política | Condición |
|---|---|---|
| SELECT | Pagador ve los suyos | `pagador_id = auth.uid()` |
| SELECT | Taquillero de la cooperativa | `cooperativa_id = auth.user_cooperativa_id()` |
| SELECT | Super Admin | `auth.is_super_admin()` |
| INSERT | Cualquier usuario autenticado | `auth.uid() IS NOT NULL` |
| UPDATE | Taquillero/Admin (verificar pago) | `cooperativa_id = auth.user_cooperativa_id()` |

### 3.10 `calificaciones`
| Operación | Política | Condición |
|---|---|---|
| SELECT | Públicas para usuarios autenticados | `auth.uid() IS NOT NULL` |
| INSERT | Solo el comprador del boleto | `usuario_id = auth.uid()` |
| UPDATE | Solo el autor | `usuario_id = auth.uid()` |
| DELETE | Solo Super Admin | `auth.is_super_admin()` |

### 3.11 `tarifas`
| Operación | Política | Condición |
|---|---|---|
| SELECT | Todos los autenticados | `auth.uid() IS NOT NULL` |
| INSERT/UPDATE | Solo Super Admin | `auth.is_super_admin()` |

### 3.12 `notificaciones_usuario`
| Operación | Política | Condición |
|---|---|---|
| SELECT | Solo las propias | `usuario_id = auth.uid()` |
| UPDATE | Solo las propias (marcar leída) | `usuario_id = auth.uid()` |

### 3.13 `incidencias`
| Operación | Política | Condición |
|---|---|---|
| SELECT | Super Admin | `auth.is_super_admin()` |
| INSERT | Cualquier usuario (reportar) o Sistema | `auth.uid() IS NOT NULL` |
| UPDATE | Solo Super Admin | `auth.is_super_admin()` |

### 3.14 `comisiones_ciclo`
| Operación | Política | Condición |
|---|---|---|
| SELECT | Admin de su cooperativa o Super Admin | `auth.is_super_admin() OR (auth.user_role() = 'admin_cooperativa' AND cooperativa_id = auth.user_cooperativa_id())` |
| INSERT/UPDATE | Solo Super Admin | `auth.is_super_admin()` |
