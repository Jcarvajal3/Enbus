# Plan de Implementación: Panel Super Admin (Proyecto Unificado)

## Contexto y Decisión Arquitectónica

Todo el ecosistema web de EnBus vivirá en **un solo proyecto Next.js** (el actual `PanelCooperativas/`), bajo un solo dominio y deployment de Vercel (`enbus`). Las 3 áreas coexisten como route groups:

| Área | Rutas | Estado |
|---|---|---|
| **Landing Page** | `/`, `/rastrear`, `/calculadora` | Futura (placeholder por ahora) |
| **Panel Cooperativas** | `/cooperativas/*` | ✅ Existente |
| **Panel Super Admin** | `/admin/*` | 🆕 A implementar |

> [!NOTE]
> Este enfoque tiene ventajas claras: un solo `npm install`, un solo build, un solo deployment, y los componentes UI compartidos (shadcn, theme, etc.) se reutilizan sin duplicación.

---

## Proposed Changes

### FASE 0: Adaptar Proyecto Existente + Infraestructura Admin

> Objetivo: Modificar el proyecto actual para soportar las 3 áreas. Al terminar, un super admin puede hacer login en `/admin/login` y ver un shell vacío con la sidebar navegable, sin romper nada de `/cooperativas/*`.

---

#### Paso 0.1: Ampliar el Middleware — Lógica Bifurcada por Path

El middleware actual ([proxy.ts](file:///c:/Users/Javie/Documents/Dev/Panas%20Cargo/PanelCooperativas/src/proxy.ts)) solo intercepta `/cooperativas/:path*`. Necesitamos que también intercepte `/admin/:path*` con lógica de auth diferente.

##### [MODIFY] [proxy.ts](file:///c:/Users/Javie/Documents/Dev/Panas%20Cargo/PanelCooperativas/src/proxy.ts)

Cambiar el matcher para cubrir ambas áreas:

```typescript
import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export default async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    "/cooperativas/:path*",
    "/admin/:path*",
  ],
};
```

##### [MODIFY] [middleware.ts](file:///c:/Users/Javie/Documents/Dev/Panas%20Cargo/PanelCooperativas/src/lib/supabase/middleware.ts)

Reescribir `updateSession()` para bifurcar según el prefijo de ruta. La lógica:

```
Solicitud entrante
  │
  ├── /cooperativas/* → Misma lógica actual (rutas públicas de cooperativas)
  │     Rutas públicas: /cooperativas/login, /cooperativas/invite,
  │                     /cooperativas/recuperar, /cooperativas/restablecer,
  │                     /cooperativas/auth/callback
  │     Si no auth → redirect /cooperativas/login
  │     Si auth en /cooperativas/login → redirect /cooperativas/dashboard
  │
  └── /admin/* → Nueva lógica para super admin
        Rutas públicas: /admin/login, /admin/auth/callback
        Si no auth → redirect /admin/login
        Si auth en /admin/login → redirect /admin/dashboard
```

**Implementación exacta:** Después de obtener la `session` (línea 31 actual), agregar un bloque condicional que detecte si la ruta comienza con `/admin/` y aplicar las rutas públicas y redirects correspondientes. **No tocar** la lógica existente de `/cooperativas/` — solo agregar el branch de `/admin/`.

```typescript
const pathname = request.nextUrl.pathname;

if (pathname.startsWith("/admin/")) {
  // --- SUPER ADMIN ROUTES ---
  const adminPublicPaths = ["/admin/login", "/admin/auth/callback"];
  const isAdminPublic = adminPublicPaths.some((p) => pathname.startsWith(p));

  if (!session && !isAdminPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/admin/login";
    return NextResponse.redirect(url);
  }
  if (session && pathname === "/admin/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/admin/dashboard";
    return NextResponse.redirect(url);
  }
} else {
  // --- COOPERATIVAS ROUTES (lógica actual sin cambios) ---
  const publicPaths = [ /* ... lista actual ... */ ];
  // ... resto de la lógica actual ...
}
```

> [!IMPORTANT]
> El middleware **solo valida que haya sesión**, no valida el rol. La validación de rol se hace en el layout de cada area (`/admin/(panel)/layout.tsx` verificará `role === 'super_admin'`). Esto es el mismo patrón que PanelCooperativas ya usa.

---

#### Paso 0.2: Ampliar `getUserProfile()` para soportar Super Admin

##### [MODIFY] [cached.ts](file:///c:/Users/Javie/Documents/Dev/Panas%20Cargo/PanelCooperativas/src/lib/supabase/cached.ts)

El `getUserProfile()` actual solo retorna roles `taquillero` | `admin_cooperativa` y siempre incluye `cooperativa_id`. Necesitamos ampliarlo para también soportar `super_admin` (que **no tiene** cooperativa).

**Cambios:**
1. Ampliar el type cast de `role` para incluir `"super_admin"`
2. Hacer `cooperativa_id` y `cooperativa_nombre` opcionales
3. El select ya trae `cooperativas(nombre)` como join — esto simplemente retornará `null` para super admins (que tienen `cooperativa_id = null`), lo cual ya funciona

```typescript
return {
  id: profile.id,
  role: profile.role as "taquillero" | "admin_cooperativa" | "super_admin",
  nombre_completo: profile.nombre_completo,
  cooperativa_id: profile.cooperativa_id ?? null,
  cooperativa_nombre: (profile.cooperativas as any)?.nombre ?? null,
};
```

> [!NOTE]
> **Riesgo cero para el panel de cooperativas existente.** El layout de `(panel)/layout.tsx` de cooperativas ya guarda que `user` no sea null. Si un super admin navega a `/cooperativas/*`, el middleware lo deja pasar (tiene sesión), y el layout de cooperativas le creará el `PanelShell` — pero este super admin no tendrá `cooperativa_id`, lo cual puede causar que las queries de cooperativas no retornen datos. Esto es aceptable para V1 porque un super admin no debería navegar a `/cooperativas/*`.

---

#### Paso 0.3: Ampliar el type `UserProfile`

##### [MODIFY] [use-user.tsx](file:///c:/Users/Javie/Documents/Dev/Panas%20Cargo/PanelCooperativas/src/hooks/use-user.tsx)

Ampliar el type para soportar el rol super_admin:

```typescript
export type UserProfile = {
  id: string;
  role: "taquillero" | "admin_cooperativa" | "super_admin";
  nombre_completo: string;
  cooperativa_id: string | null;    // era: string (obligatorio)
  cooperativa_nombre?: string | null; // ya era opcional
};
```

**Impacto en panel cooperativas:** Mínimo. Los componentes de cooperativas acceden a `user.cooperativa_id` que ahora puede ser `null`, pero el layout de cooperativas redirige a login si `user` es null, y un super_admin tendría `user` no-null con `cooperativa_id === null`. Las queries de cooperativas filtran por `cooperativa_id` vía RLS, así que simplemente no verían datos. Esto es el comportamiento esperado.

---

#### Paso 0.4: Cambiar la Root Page

##### [MODIFY] [page.tsx](file:///c:/Users/Javie/Documents/Dev/Panas%20Cargo/PanelCooperativas/src/app/page.tsx)

Actualmente redirige a `/cooperativas/login`. Cambiar a un placeholder de landing page para reservar la ruta `/`:

```typescript
export default function Home() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <h1 className="text-4xl font-bold">EnBus — Próximamente</h1>
    </div>
  );
}
```

> Cuando se implemente la Landing Page, esta será la homepage real. Por ahora es un placeholder.

---

#### Paso 0.5: Crear Página de Login del Super Admin

##### [NEW] `src/app/admin/login/page.tsx`

Server Component thin wrapper:
```typescript
export const dynamic = "force-dynamic";
import AdminLoginClient from "./login-client";
export default function AdminLoginPage() {
  return <AdminLoginClient />;
}
```

##### [NEW] `src/app/admin/login/login-client.tsx`

Client Component con formulario de login. **Basado en** el existente [login-client.tsx](file:///c:/Users/Javie/Documents/Dev/Panas%20Cargo/PanelCooperativas/src/app/cooperativas/login/login-client.tsx) de cooperativas, pero con estas diferencias:

1. **Título**: "Panel de Administración EnBus" en vez de "Panel Cooperativas"
2. **Redirect post-login**: `/admin/dashboard` en vez de `/cooperativas/dashboard`
3. **Verificación de rol post-login**: Después de `signInWithPassword`, hacer un query a `profiles` para verificar que `role === 'super_admin'`. Si el rol es incorrecto, hacer `signOut()` y mostrar error "No tiene permisos de administrador".
4. **Google Sign-In**: Incluir botón de Google OAuth (el spec dice que super admins pueden usar Google)
5. **Diseño visual**: Misma estética que el login de cooperativas pero con branding "Admin" (quizás un color de acento ligeramente diferente o un ícono de Shield en vez de Bus)

##### [NEW] `src/app/admin/auth/callback/route.ts`

OAuth callback handler para el flujo de Google del super admin. **Copiar** el existente de [cooperativas/auth/callback/route.ts](file:///c:/Users/Javie/Documents/Dev/Panas%20Cargo/PanelCooperativas/src/app/cooperativas/auth/callback/route.ts) con estos cambios:
- `next` default: `"/admin/dashboard"` en vez de `"/cooperativas/restablecer"`
- Redirect de error: `"/admin/login?error=auth-callback-failed"`

---

#### Paso 0.6: Navegación del Sidebar Admin

##### [NEW] `src/lib/admin-navigation.ts`

Según [Dashboard_Spec.md §4](file:///c:/Users/Javie/Documents/Dev/Panas%20Cargo/Specs/04_Web_Super_Admin/Dashboard_Spec.md):

```typescript
import {
  ChartBar, Buildings, CurrencyDollar,
  Receipt, Warning, Users
} from "@phosphor-icons/react";

export const ADMIN_NAV_ITEMS = [
  { title: "Dashboard",    href: "/admin/dashboard",    icon: ChartBar },
  { title: "Cooperativas", href: "/admin/cooperativas", icon: Buildings },
  { title: "Tarifas",      href: "/admin/tarifas",      icon: CurrencyDollar },
  { title: "Comisiones",   href: "/admin/comisiones",   icon: Receipt },
  { title: "Incidencias",  href: "/admin/incidencias",  icon: Warning },
  { title: "Usuarios",     href: "/admin/usuarios",     icon: Users },
];
```

> No se necesita campo `roles` porque todos los items son accesibles por cualquier `super_admin`.

---

#### Paso 0.7: Shell del Panel Admin (Sidebar + Layout)

##### [NEW] `src/components/admin-sidebar.tsx`

**Basado en** [app-sidebar.tsx](file:///c:/Users/Javie/Documents/Dev/Panas%20Cargo/PanelCooperativas/src/components/app-sidebar.tsx) con estas diferencias:

| Aspecto | app-sidebar.tsx (Cooperativas) | admin-sidebar.tsx (Admin) |
|---|---|---|
| Ítems de navegación | `NAV_ITEMS` con filtro por rol | `ADMIN_NAV_ITEMS` sin filtro |
| Header del sidebar | Logo "EnBus" + nombre cooperativa | Logo "EnBus" + texto "Administración" |
| Icono del header | `Bus` | `ShieldCheck` (o `Crown`) |
| Filtro de roles en items | `item.roles.includes(user.role)` | No necesario — mostrar todo |
| searchParams/tab matching | Sí | No |

El footer (dropdown de usuario con tema + cerrar sesión) permanece idéntico.

##### [NEW] `src/components/admin-shell.tsx`

**Basado en** [panel-shell.tsx](file:///c:/Users/Javie/Documents/Dev/Panas%20Cargo/PanelCooperativas/src/components/panel-shell.tsx) con estas diferencias:

| Aspecto | panel-shell.tsx | admin-shell.tsx |
|---|---|---|
| Sidebar component | `<AppSidebar />` | `<AdminSidebar />` |
| Nav items para breadcrumb | `NAV_ITEMS` | `ADMIN_NAV_ITEMS` |
| ServiceWorkerRegistrar | Incluido | **No incluir** |
| ConnectivityBanner | Incluido | **No incluir** |

El `UserProvider` y `SidebarProvider` son idénticos.

---

#### Paso 0.8: Layout Protegido del Panel Admin

##### [NEW] `src/app/admin/(panel)/layout.tsx`

```typescript
import { getUserProfile } from "@/lib/supabase/cached";
import { redirect } from "next/navigation";
import { AdminShell } from "@/components/admin-shell";

export default async function AdminPanelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getUserProfile();

  // getUserProfile retorna el perfil para cualquier rol.
  // Aquí verificamos que sea super_admin.
  if (!user || user.role !== "super_admin") {
    redirect("/admin/login");
  }

  return <AdminShell user={user}>{children}</AdminShell>;
}
```

> [!IMPORTANT]
> **Esta es la barrera de seguridad del rol.** El middleware solo verifica sesión. Este layout verifica `role === 'super_admin'`. Si un taquillero navega a `/admin/dashboard`, tiene sesión (pasa el middleware), pero su `user.role` será `"taquillero"` y será redirigido a `/admin/login`.

##### [NEW] `src/app/admin/(panel)/loading.tsx`
Skeleton de carga. Copiar de [cooperativas/(panel)/loading.tsx](file:///c:/Users/Javie/Documents/Dev/Panas%20Cargo/PanelCooperativas/src/app/cooperativas/%28panel%29/loading.tsx).

##### [NEW] `src/app/admin/(panel)/error.tsx`
Error boundary. Copiar de [cooperativas/(panel)/error.tsx](file:///c:/Users/Javie/Documents/Dev/Panas%20Cargo/PanelCooperativas/src/app/cooperativas/%28panel%29/error.tsx) y cambiar el link de "volver" a `/admin/dashboard`.

##### [NEW] `src/app/admin/(panel)/not-found.tsx`
Página 404. Copiar de [cooperativas/(panel)/not-found.tsx](file:///c:/Users/Javie/Documents/Dev/Panas%20Cargo/PanelCooperativas/src/app/cooperativas/%28panel%29/not-found.tsx) y cambiar links a `/admin/*`.

---

#### Paso 0.9: Redirects de Raíz Admin

##### [NEW] `src/app/admin/page.tsx`
```typescript
import { redirect } from "next/navigation";
export default function AdminRoot() { redirect("/admin/dashboard"); }
```

---

#### Paso 0.10: Página Placeholder de Dashboard

##### [NEW] `src/app/admin/(panel)/dashboard/page.tsx`

Placeholder temporal para verificar que todo funciona:
```typescript
export default function AdminDashboard() {
  return <div>Dashboard del Super Admin — Próximamente</div>;
}
```

Crear también placeholders para las otras 5 rutas del sidebar para que la navegación funcione:

##### [NEW] `src/app/admin/(panel)/cooperativas/page.tsx` (placeholder)
##### [NEW] `src/app/admin/(panel)/tarifas/page.tsx` (placeholder)
##### [NEW] `src/app/admin/(panel)/comisiones/page.tsx` (placeholder)
##### [NEW] `src/app/admin/(panel)/incidencias/page.tsx` (placeholder)
##### [NEW] `src/app/admin/(panel)/usuarios/page.tsx` (placeholder)

---

#### Paso 0.11: Verificación de Fase 0

| Verificación | Resultado esperado |
|---|---|
| `npm run build` | Build exitoso sin errores TypeScript |
| `/cooperativas/login` | Login de cooperativas sigue funcionando igual |
| `/cooperativas/dashboard` | Dashboard de cooperativas funciona sin cambios |
| `/admin/login` | Muestra formulario de login del admin |
| Login con `super_admin` en `/admin/login` | Redirige a `/admin/dashboard`, sidebar navegable |
| Login con `taquillero` en `/admin/login` | Muestra error y hace signOut |
| Navegar a `/admin/cooperativas` autenticado como super_admin | Muestra placeholder |
| Navegar a `/admin/dashboard` sin auth | Redirige a `/admin/login` |
| `/` | Muestra landing page placeholder |

---

### FASE 1: Dashboard (`/admin/dashboard`)

> Objetivo: 6 KPI cards, 3 gráficos (Recharts), tabla de incidencias recientes, tabla de cooperativas con balance.

---

#### Paso 1.1: Tipos TypeScript

##### [NEW] `src/lib/types/admin-dashboard.ts`

```typescript
export type DashboardKPIs = {
  encomiendas_hoy: number;
  boletos_hoy: number;
  ingresos_brutos_hoy: number;
  comisiones_estimadas_hoy: number;
  cooperativas_activas: number;
  alertas_amarillas_abiertas: number;
};

export type DailyActivity = {
  fecha: string;       // YYYY-MM-DD
  encomiendas: number;
  boletos: number;
};

export type TopCooperativa = {
  cooperativa_id: string;
  nombre: string;
  total_transacciones: number;
};

export type RutaPopular = {
  ruta_nombre: string;
  total: number;
};

export type IncidenciaReciente = {
  id: string;
  tipo: string;
  encomienda_tracking_id: string | null;
  reportado_por_nombre: string | null;
  estado: string;
  created_at: string;
};

export type CooperativaBalance = {
  cooperativa_id: string;
  nombre: string;
  comision_porcentaje: number;
  monto_pendiente: number;
  ciclos_impagos: number;
};
```

---

#### Paso 1.2: Data Fetching

##### [NEW] `src/lib/data/admin-dashboard.ts`

Funciones server-side con `createClient()`. Cada una hace una query específica:

- `fetchDashboardKPIs()`: 6 queries COUNT/SUM con `Promise.all` para las 6 métricas
- `fetchActivityLast30Days()`: Agrupar encomiendas y boletos por día (últimos 30 días). Usar `.gte('created_at', thirtyDaysAgo)` y agrupar por fecha en JS
- `fetchTop5Cooperativas()`: Contar transacciones por cooperativa del mes, `LIMIT 5`
- `fetchRutasPopulares()`: Contar encomiendas por ruta del mes
- `fetchIncidenciasRecientes()`: `SELECT * FROM incidencias WHERE estado != 'RESUELTA' ORDER BY created_at DESC LIMIT 10`
- `fetchCooperativasConBalance()`: Usar vista `v_balance_cooperativa` + join con `comisiones_ciclo WHERE pagado = false`

> Las queries pasan por RLS. Las políticas ya permiten que `is_super_admin()` haga SELECT en todas las tablas.

---

#### Paso 1.3: Componentes

##### [NEW] `src/components/admin/dashboard/kpi-card.tsx`
- Props: `title`, `value`, `icon`, `variant?: "default" | "warning"`
- Usa `Card` de shadcn. Icono a la derecha, valor grande, título debajo
- `variant="warning"` = borde naranja/rojo para alertas

##### [NEW] `src/components/admin/dashboard/activity-chart.tsx`
- Gráfico de línea (Recharts `LineChart`) — encomiendas + boletos por día, 30 días
- Usa `ChartContainer` de shadcn. Dos líneas con colores distintos. Tooltip al hover.

##### [NEW] `src/components/admin/dashboard/top-cooperativas-chart.tsx`
- Barras horizontales (Recharts `BarChart` con `layout="vertical"`)
- Top 5 cooperativas por volumen del mes

##### [NEW] `src/components/admin/dashboard/rutas-chart.tsx`
- Barras verticales (Recharts `BarChart`)
- Rutas más populares del mes

##### [NEW] `src/components/admin/dashboard/incidencias-recientes-table.tsx`
- Tabla con últimas 10 incidencias abiertas
- Columnas: ID, Tipo (badge), Tracking ID (link), Estado (badge), Fecha
- Click → `/admin/incidencias/{id}`

##### [NEW] `src/components/admin/dashboard/cooperativas-balance-table.tsx`
- Tabla de cooperativas con balance de comisiones
- Columnas: Nombre, Comisión %, Monto Pendiente, Ciclos Impagos
- Rojo si ≥2 ciclos impagos. Click → `/admin/cooperativas/{id}`

---

#### Paso 1.4: Página

##### [MODIFY] `src/app/admin/(panel)/dashboard/page.tsx` (reemplazar placeholder)

Server Component:
1. `Promise.all` con las 6 funciones de data fetching
2. Grid de 6 KPI cards: `grid-cols-2 md:grid-cols-3 lg:grid-cols-6`
3. Gráfico de actividad: full width
4. Top 5 + Rutas: `grid-cols-1 lg:grid-cols-2`
5. Incidencias + Balance: `grid-cols-1 lg:grid-cols-2`

---

### FASE 2: Gestión de Cooperativas (`/admin/cooperativas`)

> Objetivo: CRUD completo. Lista con filtros/búsqueda, creación con invitación, detalle con 7 tabs, acciones de estado.

---

#### Paso 2.1: Tipos TypeScript

##### [NEW] `src/lib/types/admin-cooperativas.ts`

Tipos para: `Cooperativa`, `CooperativaDetalle` (con sucursales, métodos pago, rutas, empleados, calificaciones), `CreateCooperativaInput`. Incluir los subtipos `Sucursal`, `MetodoPago`, `Ruta`, `Empleado`.

---

#### Paso 2.2: Server Actions

##### [NEW] `src/app/admin/(panel)/cooperativas/actions.ts`

4 Server Actions (`"use server"`):

1. **`createCooperativa(formData)`**: Validar campos (nombre, RIF formato `J-XXXXXXXX`, comisión). Subir logo a bucket `logos-cooperativas`. INSERT en `cooperativas`. Generar enlace invitación con `createAdminClient().auth.admin.inviteUserByEmail()` pasando `data: { role: 'admin_cooperativa', cooperativa_id }`. Retornar `{ success, cooperativa_id, invite_link }`. `revalidatePath`.

2. **`updateCooperativa(id, formData)`**: Validar. UPDATE. Si nuevo logo, subir y actualizar URL. `revalidatePath`.

3. **`changeCooperativaEstado(id, nuevoEstado)`**: Validar transiciones permitidas según spec (ACTIVA→SUSPENDIDA ✅, SUSPENDIDA→ACTIVA ✅, ACTIVA→DESACTIVADA ✅, SUSPENDIDA→DESACTIVADA ✅, cualquier otra ❌). UPDATE estado. `revalidatePath`.

4. **`inviteCooperativaAdmin(cooperativaId, email)`**: `createAdminClient().auth.admin.inviteUserByEmail()`. `revalidatePath`.

> Patrón de retorno: `{ success: boolean; error?: string; data?: T }`. Mostrar toast en el client.

---

#### Paso 2.3: Data Fetching

##### [NEW] `src/lib/data/admin-cooperativas.ts`

- `fetchCooperativas(filters?: { estado?, search? })`: SELECT con filtros opcionales, ILIKE para búsqueda
- `fetchCooperativaById(id)`: SELECT con joins a sucursales, métodos_pago, rutas, empleados (profiles), calificaciones

---

#### Paso 2.4: Componentes

##### [NEW] `src/components/admin/cooperativas/cooperativas-table.tsx`
Tabla con columnas: Logo (thumbnail), Nombre, RIF, Estado (badge), Comisión %, Calificación ★, Fecha. Filtros: Select estado + Input búsqueda con debounce. Click fila → `/admin/cooperativas/{id}`.

##### [NEW] `src/components/admin/cooperativas/create-cooperativa-dialog.tsx`
Dialog con formulario: Nombre, RIF (máscara `J-________`), Logo (file + preview), Comisión (number step=0.01). Toast con enlace invitación copiable al crear.

##### [NEW] `src/components/admin/cooperativas/cooperativa-detail-tabs.tsx`
7 tabs: General (datos + edición inline), Sucursales (solo lectura), Métodos de Pago (solo lectura), Rutas (solo lectura), Empleados (solo lectura), Calificaciones (promedio + lista), Balance (comisiones pendientes del ciclo).

##### [NEW] `src/components/admin/cooperativas/cooperativa-actions.tsx`
Botones condicionales según estado: Editar, Suspender (AlertDialog), Reactivar (AlertDialog), Desactivar (AlertDialog severo), Invitar Admin (Dialog con email).

---

#### Paso 2.5: Páginas

##### [MODIFY] `src/app/admin/(panel)/cooperativas/page.tsx` (reemplazar placeholder)
Server Component. Lee searchParams para filtros. Renderiza botón "Nueva Cooperativa" + tabla.

##### [NEW] `src/app/admin/(panel)/cooperativas/[id]/page.tsx`
Server Component. Fetch cooperativa por ID. Si no existe, `notFound()`. Renderiza header + acciones + tabs.

---

### FASE 3: Gestión de Tarifas (`/admin/tarifas`)

> Objetivo: Tarifa vigente, crear nueva, historial, simulador de costos.

---

#### Paso 3.1: Tipos TypeScript

##### [NEW] `src/lib/types/admin-tarifas.ts`

Tipos para: `Tarifa`, `CreateTarifaInput`, `SimuladorInput`, `SimuladorResult` (con desglose de fórmula).

---

#### Paso 3.2: Server Actions

##### [NEW] `src/app/admin/(panel)/tarifas/actions.ts`

1. **`createTarifa(formData)`**: Validar campos numéricos positivos. Desactivar tarifa actual (`UPDATE tarifas SET activa = false WHERE activa = true`), luego INSERT nueva con `activa = true`. **Debe ser atómico** (envolver en transacción via RPC o usar `createAdminClient()`). `revalidatePath`.

2. **`simularCosto(formData)`**: Fetch tarifa activa + ruta seleccionada → calcular `peso_kg × tarifa_por_kg × (1 + factor_distancia_por_min × duracion_estimada_min)` → retornar resultado con desglose.

---

#### Paso 3.3: Data Fetching

##### [NEW] `src/lib/data/admin-tarifas.ts`

- `fetchTarifaVigente()`: SELECT WHERE activa = true LIMIT 1
- `fetchHistorialTarifas()`: SELECT ORDER BY created_at DESC
- `fetchRutasParaSimulador()`: SELECT id, origen, destino, duracion_estimada_min FROM rutas WHERE activa = true

---

#### Paso 3.4: Componentes

##### [NEW] `src/components/admin/tarifas/tarifa-vigente-card.tsx`
Card grande con tarifa activa: Tarifa/Kg, Factor distancia, Peso máx., Dimensiones, Vigente desde. Badge "VIGENTE" verde.

##### [NEW] `src/components/admin/tarifas/create-tarifa-dialog.tsx`
Dialog con formulario: Tarifa/Kg (step=0.01), Factor distancia (step=0.0001), Peso máx (step=0.1), Dimensiones (step=1), Vigente desde (datetime-local). Warning "la tarifa anterior se desactivará".

##### [NEW] `src/components/admin/tarifas/historial-tarifas-table.tsx`
Tabla con todas las tarifas. Columnas: Tarifa/Kg, Factor, Peso Máx., Vigente Desde, Estado (badge). Ordenada DESC.

##### [NEW] `src/components/admin/tarifas/simulador.tsx`
Client Component. Input peso (slider + number) + Select ruta. Cálculo en tiempo real. Desglose: `{peso} × ${tarifa_por_kg} × (1 + {factor} × {duración}min) = ${total}`.

---

#### Paso 3.5: Página

##### [MODIFY] `src/app/admin/(panel)/tarifas/page.tsx` (reemplazar placeholder)
Server Component. Secciones verticales: Tarifa vigente → Botón actualizar → Simulador → Historial.

---

### FASE 4: Comisiones y Liquidación (`/admin/comisiones`)

> Objetivo: Vista de ciclos, generar ciclo, marcar pagado, exportar CSV.

---

#### Paso 4.1: Tipos TypeScript

##### [NEW] `src/lib/types/admin-comisiones.ts`

Tipos para: `ComisionCiclo` (con cooperativa_nombre), `GenerarCicloInput`.

---

#### Paso 4.2: Server Actions

##### [NEW] `src/app/admin/(panel)/comisiones/actions.ts`

1. **`generarCiclo(formData)`**: Leer periodo + cooperativa. Para cada cooperativa: SUM pagos en periodo para encomiendas y boletos, calcular comisión, INSERT en `comisiones_ciclo`. `revalidatePath`.

2. **`marcarComoPagado(cicloId)`**: UPDATE `comisiones_ciclo SET pagado = true, pagado_at = now()`. `revalidatePath`.

3. **`exportarCSV(filters)`**: Generar CSV string con ciclos filtrados. Retornar para descarga client-side.

---

#### Paso 4.3: Data Fetching

##### [NEW] `src/lib/data/admin-comisiones.ts`

- `fetchCiclosComisiones(filters?)`: SELECT con joins + filtros (cooperativa, pagado, periodo). ORDER BY created_at DESC.

---

#### Paso 4.4: Componentes

##### [NEW] `src/components/admin/comisiones/ciclos-table.tsx`
Tabla: Periodo, Cooperativa, Monto Total, Comisión %, Monto Comisión, Estado (Pendiente amarillo / Pagado verde). Filtros: cooperativa, estado, periodo. Botón "Marcar como Solvente" por fila.

##### [NEW] `src/components/admin/comisiones/generar-ciclo-dialog.tsx`
Dialog: Periodo inicio/fin (date pickers) + Cooperativa (select con "Todas"). Preview de cálculo.

##### [NEW] `src/components/admin/comisiones/export-csv-button.tsx`
Botón que invoca server action + descarga automática.

---

#### Paso 4.5: Página

##### [MODIFY] `src/app/admin/(panel)/comisiones/page.tsx` (reemplazar placeholder)
Server Component. Header con "Generar Ciclo" + "Exportar CSV". Tabla de ciclos.

---

### FASE 5: Incidencias y Alertas (`/admin/incidencias`)

> Objetivo: Lista con filtros, detalle con acciones (tomar caso, resolver, activar seguro).

---

#### Paso 5.1: Tipos TypeScript

##### [NEW] `src/lib/types/admin-incidencias.ts`

Tipos para: `Incidencia` (con tipo, estado, asignado, encomienda vinculada).

---

#### Paso 5.2: Server Actions

##### [NEW] `src/app/admin/(panel)/incidencias/actions.ts`

1. **`tomarCaso(incidenciaId)`**: UPDATE estado → 'EN_PROCESO', asignado_a → current user. `revalidatePath`.
2. **`resolverIncidencia(incidenciaId, formData)`**: UPDATE estado → 'RESUELTA', resolucion. `revalidatePath`.
3. **`crearIncidenciaPerdida(encomiendaId, descripcion)`**: INSERT incidencia tipo PERDIDA. `revalidatePath`.

---

#### Paso 5.3: Data Fetching

##### [NEW] `src/lib/data/admin-incidencias.ts`

- `fetchIncidencias(filters?)`: SELECT con filtros por tipo y estado
- `fetchIncidenciaById(id)`: SELECT con encomienda vinculada y nombres

---

#### Paso 5.4: Componentes

##### [NEW] `src/components/admin/incidencias/incidencias-table.tsx`
Tabla: ID, Tipo (badge coloreado), Tracking ID (link), Reportado por, Estado (badge), Fecha. Filtros: tipo + estado. Click fila → `/admin/incidencias/{id}`.

##### [NEW] `src/components/admin/incidencias/incidencia-detail.tsx`
Card completa: Tipo, Estado, Encomienda (link), Descripción, Resolución. Botones según estado: "Tomar Caso" (si ABIERTA), "Resolver" con textarea (si EN_PROCESO), "Activar Seguro" (si tipo PERDIDA).

---

#### Paso 5.5: Páginas

##### [MODIFY] `src/app/admin/(panel)/incidencias/page.tsx` (reemplazar placeholder)
Server Component. Tabla de incidencias con filtros.

##### [NEW] `src/app/admin/(panel)/incidencias/[id]/page.tsx`
Server Component. Detalle de incidencia con acciones.

---

### FASE 6: Gestión de Usuarios (`/admin/usuarios`)

> Objetivo: Vista administrativa, historiales, acciones de PIN.

---

#### Paso 6.1: Tipos TypeScript

##### [NEW] `src/lib/types/admin-usuarios.ts`

Tipos para: `Usuario`, `UsuarioDetalle` (con historiales de encomiendas, boletos, pagos, notificaciones).

---

#### Paso 6.2: Server Actions

##### [NEW] `src/app/admin/(panel)/usuarios/actions.ts`

1. **`desbloquearPIN(encomiendaId)`**: UPDATE `encomiendas SET intentos_pin = 0, pin_bloqueado = false`. Log auditoría. `revalidatePath`.
2. **`reenviarPIN(encomiendaId)`**: Fetch PIN original → invocar Edge Functions `enviar-whatsapp`/`enviar-push` con el **mismo PIN** (nunca regenerar). Log auditoría. `revalidatePath`.
3. **`desactivarUsuario(userId)`**: `createAdminClient().auth.admin.deleteUser(userId)` (soft delete). `revalidatePath`.

---

#### Paso 6.3: Data Fetching

##### [NEW] `src/lib/data/admin-usuarios.ts`

- `fetchUsuarios(filters?)`: SELECT profiles + cooperativas.nombre. Filtros: rol, cooperativa, search (ILIKE en nombre/email/telefono/cedula)
- `fetchUsuarioById(id)`: Fetch perfil + historiales (encomiendas, boletos, pagos, notificaciones) con `Promise.all`

---

#### Paso 6.4: Componentes

##### [NEW] `src/components/admin/usuarios/usuarios-table.tsx`
Tabla: Avatar (iniciales), Nombre, Email, Teléfono, Rol (badge), Cooperativa, Fecha. Filtros: rol + cooperativa. Búsqueda debounce. Click → `/admin/usuarios/{id}`.

##### [NEW] `src/components/admin/usuarios/usuario-detail-tabs.tsx`
5 tabs: Perfil (solo lectura), Encomiendas (enviadas + recibidas), Boletos, Pagos, Notificaciones.

##### [NEW] `src/components/admin/usuarios/usuario-actions.tsx`
"Desbloquear PIN" (seleccionar encomienda → confirmar), "Reenviar PIN" (seleccionar encomienda → confirmar), "Desactivar Usuario" (AlertDialog severo).

---

#### Paso 6.5: Páginas

##### [MODIFY] `src/app/admin/(panel)/usuarios/page.tsx` (reemplazar placeholder)
Server Component. Tabla con filtros y búsqueda.

##### [NEW] `src/app/admin/(panel)/usuarios/[id]/page.tsx`
Server Component. Detalle con tabs y acciones.

---

## Resumen de Cambios al Proyecto Existente

Solo se modifican **4 archivos** existentes. Todo lo demás es nuevo.

| Archivo | Cambio |
|---|---|
| [proxy.ts](file:///c:/Users/Javie/Documents/Dev/Panas%20Cargo/PanelCooperativas/src/proxy.ts) | Agregar `/admin/:path*` al matcher |
| [middleware.ts](file:///c:/Users/Javie/Documents/Dev/Panas%20Cargo/PanelCooperativas/src/lib/supabase/middleware.ts) | Agregar branch para rutas `/admin/*` |
| [cached.ts](file:///c:/Users/Javie/Documents/Dev/Panas%20Cargo/PanelCooperativas/src/lib/supabase/cached.ts) | Ampliar role type para incluir `super_admin` |
| [use-user.tsx](file:///c:/Users/Javie/Documents/Dev/Panas%20Cargo/PanelCooperativas/src/hooks/use-user.tsx) | Ampliar `UserProfile` type: role + cooperativa_id nullable |

---

## Estructura Final de Archivos Nuevos

```
src/
├── app/
│   ├── page.tsx                              ← MODIFICADO (landing placeholder)
│   └── admin/
│       ├── page.tsx                          ← Redirect → /admin/dashboard
│       ├── login/
│       │   ├── page.tsx
│       │   └── login-client.tsx
│       ├── auth/callback/route.ts
│       └── (panel)/
│           ├── layout.tsx                    ← Verifica role === super_admin
│           ├── loading.tsx
│           ├── error.tsx
│           ├── not-found.tsx
│           ├── dashboard/page.tsx
│           ├── cooperativas/
│           │   ├── page.tsx
│           │   ├── actions.ts
│           │   └── [id]/page.tsx
│           ├── tarifas/
│           │   ├── page.tsx
│           │   └── actions.ts
│           ├── comisiones/
│           │   ├── page.tsx
│           │   └── actions.ts
│           ├── incidencias/
│           │   ├── page.tsx
│           │   ├── actions.ts
│           │   └── [id]/page.tsx
│           └── usuarios/
│               ├── page.tsx
│               ├── actions.ts
│               └── [id]/page.tsx
├── components/
│   ├── admin-sidebar.tsx
│   ├── admin-shell.tsx
│   └── admin/
│       ├── dashboard/
│       │   ├── kpi-card.tsx
│       │   ├── activity-chart.tsx
│       │   ├── top-cooperativas-chart.tsx
│       │   ├── rutas-chart.tsx
│       │   ├── incidencias-recientes-table.tsx
│       │   └── cooperativas-balance-table.tsx
│       ├── cooperativas/
│       │   ├── cooperativas-table.tsx
│       │   ├── create-cooperativa-dialog.tsx
│       │   ├── cooperativa-detail-tabs.tsx
│       │   └── cooperativa-actions.tsx
│       ├── tarifas/
│       │   ├── tarifa-vigente-card.tsx
│       │   ├── create-tarifa-dialog.tsx
│       │   ├── historial-tarifas-table.tsx
│       │   └── simulador.tsx
│       ├── comisiones/
│       │   ├── ciclos-table.tsx
│       │   ├── generar-ciclo-dialog.tsx
│       │   └── export-csv-button.tsx
│       ├── incidencias/
│       │   ├── incidencias-table.tsx
│       │   └── incidencia-detail.tsx
│       └── usuarios/
│           ├── usuarios-table.tsx
│           ├── usuario-detail-tabs.tsx
│           └── usuario-actions.tsx
├── lib/
│   ├── admin-navigation.ts
│   ├── types/
│   │   ├── admin-dashboard.ts
│   │   ├── admin-cooperativas.ts
│   │   ├── admin-tarifas.ts
│   │   ├── admin-comisiones.ts
│   │   ├── admin-incidencias.ts
│   │   └── admin-usuarios.ts
│   └── data/
│       ├── admin-dashboard.ts
│       ├── admin-cooperativas.ts
│       ├── admin-tarifas.ts
│       ├── admin-comisiones.ts
│       ├── admin-incidencias.ts
│       └── admin-usuarios.ts
```

**Total: ~55 archivos nuevos + 4 archivos modificados.**

---

## Convenciones de Código

1. **Server Components por defecto.** `"use client"` solo para interactividad.
2. **Data fetching en Server Components.** Pasar datos como props a Client Components.
3. **Server Actions para mutaciones.** Retornar `{ success: boolean; error?: string }` + toast.
4. **Validación doble.** Client-side para UX, server-side para seguridad.
5. **`revalidatePath`** tras cada mutación.
6. **TypeScript estricto.** Cero `any`. Tipos para todo.
7. **Componentes pequeños y enfocados.** Una responsabilidad por componente.
8. **Nombres UI en español, código en inglés.** Labels/títulos en español.
9. **Phosphor Icons** exclusivamente.
10. **Componentes admin en `src/components/admin/`** para no mezclar con los de cooperativas.

## Verification Plan

### Automated Tests
- `npm run build` sin errores TypeScript en cada fase

### Manual Verification
- Panel cooperativas existente sigue funcionando idéntico en todas las fases
- Auth bifurcada: cada panel redirige a su propio login
- Roles aislados: un taquillero no puede acceder a `/admin/*`
