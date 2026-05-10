# Fase 1 — Plan Detallado: Auth, Layout y Onboarding

## Contexto Rápido
- **Proyecto**: Next.js 15 App Router en `PanelCooperativas/`
- **UI**: shadcn/ui preset `b38BG2CiQ` (estilo Maia, base Neutral, fuente Lora, iconos Phosphor)
- **Backend**: Supabase existente (`tydpnvajwfzcsxsowctp.supabase.co`)
- **Roles del panel**: `taquillero` y `admin_cooperativa`

---

## Tarea 1: Scaffold del Proyecto Next.js

### 1.1 Crear proyecto

```bash
cd "c:\Users\Javie\Documents\Dev\Panas Cargo"
npx -y create-next-app@latest PanelCooperativas --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --turbopack --use-npm
```

### 1.2 Inicializar shadcn

```bash
cd PanelCooperativas
npx shadcn@latest init --preset b38BG2CiQ
```

> Cuando pregunte por framework, seleccionar **Next.js**. Aceptar defaults para todo lo demás.

### 1.3 Instalar dependencias

```bash
npm install @supabase/supabase-js @supabase/ssr
npm install @phosphor-icons/react
```

### 1.4 Agregar componentes shadcn base

```bash
npx shadcn@latest add button card input sidebar separator avatar badge dropdown-menu dialog skeleton spinner alert
```

### 1.5 Crear `.env.local`

Crear `PanelCooperativas/.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://tydpnvajwfzcsxsowctp.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR5ZHBudmFqd2Z6Y3N4c293Y3RwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUwODk4MTIsImV4cCI6MjA5MDY2NTgxMn0.VeuLT_p8ew2fCZoYG7aldelLPTr-Z5sJoYWolleLcSo
```

### 1.6 Estructura de carpetas objetivo

```
src/
├── app/
│   ├── layout.tsx                          # Root layout (fuentes)
│   ├── page.tsx                            # Redirect a /cooperativas
│   ├── cooperativas/
│   │   ├── login/
│   │   │   └── page.tsx                    # Login page
│   │   ├── invite/
│   │   │   └── [token]/
│   │   │       └── page.tsx                # Onboarding por invitación
│   │   ├── (panel)/
│   │   │   ├── layout.tsx                  # Layout con sidebar
│   │   │   ├── dashboard/
│   │   │   │   └── page.tsx                # Placeholder dashboard
│   │   │   ├── taquilla/
│   │   │   │   ├── encomiendas/
│   │   │   │   │   └── page.tsx            # Placeholder
│   │   │   │   └── boletos/
│   │   │   │       └── page.tsx            # Placeholder
│   │   │   ├── despacho/
│   │   │   │   └── page.tsx                # Placeholder
│   │   │   ├── rutas/
│   │   │   │   └── page.tsx                # Placeholder
│   │   │   ├── empleados/
│   │   │   │   └── page.tsx                # Placeholder
│   │   │   └── configuracion/
│   │   │       └── page.tsx                # Placeholder
│   │   └── layout.tsx                      # (Vacío o mínimo)
├── lib/
│   ├── supabase/
│   │   ├── client.ts                       # Browser client
│   │   ├── server.ts                       # Server client (cookies)
│   │   └── middleware.ts                   # Middleware helper
│   └── types/
│       └── database.ts                     # Tipos TS para DB
├── hooks/
│   └── use-user.ts                         # Hook para obtener usuario
├── components/
│   ├── app-sidebar.tsx                     # Sidebar principal
│   └── user-nav.tsx                        # Avatar + dropdown usuario
├── middleware.ts                           # Next.js middleware
```

### Criterio de aceptación
- [ ] `npm run dev` arranca sin errores en `http://localhost:3000`
- [ ] shadcn está configurado (existe `components.json` y carpeta `components/ui/`)
- [ ] `.env.local` tiene las variables de Supabase

---

## Tarea 2: Configurar Clientes Supabase

### 2.1 Client para el Browser

Crear `src/lib/supabase/client.ts`:

```typescript
import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
```

**Notas**:
- Este client se usa en componentes con `"use client"`
- No necesita manejar cookies manualmente — `createBrowserClient` lo hace automáticamente

### 2.2 Client para Server Components

Crear `src/lib/supabase/server.ts`:

```typescript
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Llamado desde Server Component — ignorar
          }
        },
      },
    }
  );
}
```

**Notas**:
- `cookies()` es async en Next.js 15+
- El `try/catch` en `setAll` es necesario porque Server Components no pueden escribir cookies

### 2.3 Helper para Middleware

Crear `src/lib/supabase/middleware.ts`:

```typescript
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Rutas públicas que NO requieren autenticación
  const publicPaths = ["/cooperativas/login", "/cooperativas/invite"];
  const isPublicPath = publicPaths.some((path) =>
    request.nextUrl.pathname.startsWith(path)
  );

  if (!user && !isPublicPath) {
    const url = request.nextUrl.clone();
    url.pathname = "/cooperativas/login";
    return NextResponse.redirect(url);
  }

  // Si está autenticado y va a login, redirigir al dashboard
  if (user && request.nextUrl.pathname === "/cooperativas/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/cooperativas/dashboard";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
```

**Notas importantes**:
- Se usa `getUser()` y NO `getSession()` — `getUser()` valida el JWT contra el servidor de Supabase, es seguro
- `getSession()` solo lee el JWT sin validarlo, NO es seguro para protección de rutas
- La validación de **rol** se hace aparte (ver Tarea 3)

### Criterio de aceptación
- [ ] Existen los 3 archivos en `src/lib/supabase/`
- [ ] No hay errores de TypeScript

---

## Tarea 3: Middleware de Next.js

Crear `src/middleware.ts` (en la raíz de `src/`):

```typescript
import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    // Aplicar a todas las rutas /cooperativas/* excepto assets estáticos
    "/cooperativas/:path*",
  ],
};
```

**Notas**:
- El matcher asegura que SOLO las rutas `/cooperativas/*` pasan por el middleware
- La ruta raíz `/` NO está protegida (futuro landing page)
- La validación de rol (`taquillero` / `admin_cooperativa`) NO se hace en el middleware porque requiere una query adicional a `profiles`. Se hace en el **layout del panel** (Tarea 5)

### Criterio de aceptación
- [ ] Visitar `/cooperativas/dashboard` sin sesión redirige a `/cooperativas/login`
- [ ] Visitar `/cooperativas/login` con sesión redirige a `/cooperativas/dashboard`
- [ ] Visitar `/cooperativas/invite/abc` sin sesión NO redirige (es pública)

---

## Tarea 4: Página de Login

Crear `src/app/cooperativas/login/page.tsx`:

### 4.1 Diseño visual

- Pantalla completa dividida en dos:
  - **Izquierda** (60%): Panel decorativo con gradiente oscuro, logo EnBus, tagline "Panel de Cooperativas"
  - **Derecha** (40%): Card centrada con formulario de login
- Mobile: solo el formulario, sin el panel decorativo
- El formulario tiene:
  - Título: "Iniciar Sesión"
  - Subtítulo: "Accede al panel de tu cooperativa"
  - Campo: Email (type `email`, required)
  - Campo: Password (type `password`, required)
  - Botón: "Iniciar Sesión" (full width, variante `default`)
  - Link inferior: "¿Olvidaste tu contraseña?" (para futuro, puede ser un link muerto por ahora)
- Estados de error:
  - Credenciales inválidas: Alert roja debajo del formulario
  - Rol inválido: Alert roja con mensaje "No tienes permisos para acceder a este panel"

### 4.2 Lógica (`"use client"`)

```
1. Usuario llena email + password y presiona "Iniciar Sesión"
2. Desactivar botón + mostrar Spinner
3. Llamar: supabase.auth.signInWithPassword({ email, password })
4. Si error → mostrar error genérico "Credenciales inválidas"
5. Si éxito:
   a. Obtener perfil: supabase.from("profiles").select("role, cooperativa_id").eq("id", user.id).single()
   b. Si role NO es "taquillero" ni "admin_cooperativa" → mostrar error "No tienes permisos..."
   c. Si role es válido PERO cooperativa_id es NULL → mostrar error "Tu cuenta no está vinculada a una cooperativa"
   d. Si todo OK → router.push("/cooperativas/dashboard")
6. Reactivar botón en caso de error
```

### 4.3 Componentes shadcn a usar
- `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`
- `Input` dentro de `Field` + `FieldLabel` (patrón de shadcn forms)
- `Button` con `Spinner` + `data-icon` para estado de carga
- `Alert` para mensajes de error

### Criterio de aceptación
- [ ] Login con credenciales válidas de taquillero/admin redirige al dashboard
- [ ] Login con credenciales de rol `user` muestra error "No tienes permisos"
- [ ] Login con credenciales incorrectas muestra error genérico
- [ ] Botón se desactiva durante el proceso
- [ ] Diseño responsive (mobile muestra solo el formulario)

---

## Tarea 5: Layout del Panel con Sidebar

### 5.1 Hook de usuario

Crear `src/hooks/use-user.ts`:

```typescript
"use client";

import { createClient } from "@/lib/supabase/client";
import { useEffect, useState } from "react";

type UserProfile = {
  id: string;
  role: "taquillero" | "admin_cooperativa";
  nombre_completo: string;
  cooperativa_id: string;
  cooperativa_nombre?: string;
};

export function useUser() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();

    async function getUser() {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) { setLoading(false); return; }

      const { data: profile } = await supabase
        .from("profiles")
        .select("id, role, nombre_completo, cooperativa_id, cooperativas(nombre)")
        .eq("id", authUser.id)
        .single();

      if (profile) {
        setUser({
          id: profile.id,
          role: profile.role,
          nombre_completo: profile.nombre_completo,
          cooperativa_id: profile.cooperativa_id,
          cooperativa_nombre: profile.cooperativas?.nombre,
        });
      }
      setLoading(false);
    }

    getUser();
  }, []);

  return { user, loading };
}
```

### 5.2 Definición de navegación

Crear constante con los items del menú:

```typescript
// En app-sidebar.tsx o en un archivo separado src/lib/navigation.ts

import {
  ChartBar, Package, Ticket, TruckTrailer,
  MapPin, Users, Gear
} from "@phosphor-icons/react/dist/ssr";

export const NAV_ITEMS = [
  {
    title: "Dashboard",
    href: "/cooperativas/dashboard",
    icon: ChartBar,
    roles: ["admin_cooperativa", "taquillero"],  // taquillero = solo lectura
  },
  {
    title: "Taquilla Encomiendas",
    href: "/cooperativas/taquilla/encomiendas",
    icon: Package,
    roles: ["admin_cooperativa", "taquillero"],
  },
  {
    title: "Taquilla Boletos",
    href: "/cooperativas/taquilla/boletos",
    icon: Ticket,
    roles: ["admin_cooperativa", "taquillero"],
  },
  {
    title: "Despacho",
    href: "/cooperativas/despacho",
    icon: TruckTrailer,
    roles: ["admin_cooperativa", "taquillero"],
  },
  {
    title: "Rutas y Horarios",
    href: "/cooperativas/rutas",
    icon: MapPin,
    roles: ["admin_cooperativa"],  // Solo admin
  },
  {
    title: "Gestión Empleados",
    href: "/cooperativas/empleados",
    icon: Users,
    roles: ["admin_cooperativa"],  // Solo admin
  },
  {
    title: "Configuración",
    href: "/cooperativas/configuracion",
    icon: Gear,
    roles: ["admin_cooperativa"],  // Solo admin
  },
];
```

### 5.3 Componente Sidebar (`src/components/app-sidebar.tsx`)

- Usar el componente `Sidebar` de shadcn
- **Header del sidebar**: Logo de EnBus + nombre de la cooperativa
- **Contenido**: Lista de nav items filtrada por `user.role`
- **Footer**: Avatar + nombre del usuario + dropdown con "Cerrar Sesión"
- **Active state**: Resaltar el item cuyo `href` coincida con `usePathname()`
- **Cerrar sesión**: `supabase.auth.signOut()` → `router.push("/cooperativas/login")`

### 5.4 Layout del panel (`src/app/cooperativas/(panel)/layout.tsx`)

```
"use client"

Estructura:
<SidebarProvider>
  <AppSidebar />
  <SidebarInset>
    <header>
      <SidebarTrigger />  {/* Botón hamburguesa para toggle */}
      <Separator orientation="vertical" />
      <Breadcrumb con la ruta actual />
    </header>
    <main className="flex-1 p-6">
      {children}
    </main>
  </SidebarInset>
</SidebarProvider>
```

**Protección de rol en el layout**:
- El layout verifica el perfil del usuario
- Si `loading` → muestra skeleton de sidebar + contenido
- Si el usuario no tiene rol válido → redirigir a login

### 5.5 Páginas placeholder

Para cada ruta dentro de `(panel)/`, crear un `page.tsx` mínimo:

```tsx
export default function DashboardPage() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">Dashboard</h1>
      <p className="text-muted-foreground">Próximamente — Fase 2</p>
    </div>
  );
}
```

Repetir para: `taquilla/encomiendas`, `taquilla/boletos`, `despacho`, `rutas`, `empleados`, `configuracion`.

### Criterio de aceptación
- [ ] Sidebar muestra items según el rol del usuario
- [ ] Item activo se resalta visualmente
- [ ] Sidebar es colapsable (toggle con botón hamburguesa)
- [ ] Cerrar sesión redirige a login
- [ ] Taquillero NO ve "Rutas y Horarios", "Gestión Empleados" ni "Configuración"
- [ ] Admin ve TODOS los items
- [ ] Cada placeholder page se renderiza sin errores
- [ ] Loading state muestra skeletons

---

## Tarea 6: Redirect de Ruta Raíz

### 6.1 Ruta `/` → `/cooperativas/login`

Crear `src/app/page.tsx`:

```tsx
import { redirect } from "next/navigation";

export default function Home() {
  redirect("/cooperativas/login");
}
```

### 6.2 Ruta `/cooperativas` → `/cooperativas/dashboard`

Crear `src/app/cooperativas/page.tsx`:

```tsx
import { redirect } from "next/navigation";

export default function CooperativasIndex() {
  redirect("/cooperativas/dashboard");
}
```

### Criterio de aceptación
- [ ] `localhost:3000` redirige a `/cooperativas/login`
- [ ] `localhost:3000/cooperativas` redirige a `/cooperativas/dashboard` (o a login si no autenticado)

---

## Tarea 7: Onboarding por Invitación

### 7.1 Tabla de invitaciones (Migración SQL)

> [!IMPORTANT]
> Se necesita crear una nueva tabla `invitaciones` en Supabase para gestionar los tokens de invitación.

Crear migración `supabase/migrations/20260503000001_invitaciones.sql`:

```sql
CREATE TABLE public.invitaciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  token TEXT UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  role rol_usuario NOT NULL,
  cooperativa_id UUID NOT NULL REFERENCES public.cooperativas(id) ON DELETE CASCADE,
  sucursal_id UUID REFERENCES public.sucursales(id),
  usado BOOLEAN NOT NULL DEFAULT false,
  expira_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '48 hours'),
  creado_por UUID NOT NULL REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_invitaciones_token ON public.invitaciones(token);
CREATE INDEX idx_invitaciones_email ON public.invitaciones(email);

-- RLS
ALTER TABLE public.invitaciones ENABLE ROW LEVEL SECURITY;

-- Solo admin_cooperativa y super_admin pueden crear invitaciones
CREATE POLICY "admin_insert_invitaciones" ON public.invitaciones
  FOR INSERT WITH CHECK (
    public.user_role() IN ('admin_cooperativa', 'super_admin')
  );

-- Admin ve las invitaciones de su cooperativa
CREATE POLICY "admin_select_invitaciones" ON public.invitaciones
  FOR SELECT USING (
    public.is_super_admin()
    OR (public.user_role() = 'admin_cooperativa' AND cooperativa_id = public.user_cooperativa_id())
  );

-- Lectura pública por token (para la página de registro) - via función SECURITY DEFINER
```

### 7.2 Edge Function o Server Action para validar token

Crear Server Action en `src/app/cooperativas/invite/[token]/actions.ts`:

```
"use server"

Función: validateInviteToken(token: string)
1. Crear supabase client (server, con service_role si necesario, o una función SECURITY DEFINER)
2. Buscar en invitaciones WHERE token = token AND usado = false AND expira_at > now()
3. Si no existe → return { error: "Invitación inválida o expirada" }
4. Si existe → return { email, role, cooperativa_id, cooperativa_nombre }

Función: completeOnboarding(token: string, nombre: string, password: string)
1. Validar token (misma lógica)
2. Crear usuario: supabase.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { nombre_completo: nombre, telefono: "PENDIENTE", cedula_rif: "PENDIENTE" } })
   NOTA: Esto requiere service_role key. Alternativa: usar signUp normal y luego actualizar el perfil.
3. Actualizar profiles: SET role = invitacion.role, cooperativa_id = invitacion.cooperativa_id
4. Marcar invitación como usada: UPDATE invitaciones SET usado = true
5. Hacer sign in automático
6. Redirect a /cooperativas/dashboard
```

> [!WARNING]
> Para crear usuarios con roles especiales, se necesita el **service_role key** en una variable de entorno del servidor (NO `NEXT_PUBLIC_`). Agregar a `.env.local`:
> ```
> SUPABASE_SERVICE_ROLE_KEY=<obtener de Supabase Dashboard → Settings → API>
> ```

### 7.3 Página de Onboarding (`src/app/cooperativas/invite/[token]/page.tsx`)

**Diseño**: Similar al login pero con campos diferentes.

```
Flujo visual:
1. Al cargar la página, se valida el token (Server Component)
2. Si token inválido → mostrar error con Card: "Invitación inválida o expirada"
3. Si token válido → mostrar formulario:
   - Título: "Bienvenido a EnBus"
   - Subtítulo: "Completa tu registro para unirte a {nombre_cooperativa}"
   - Campo: Email (read-only, pre-llenado desde invitación)
   - Campo: Nombre Completo (required)
   - Campo: Contraseña (required, min 8 chars)
   - Campo: Confirmar Contraseña (required, debe coincidir)
   - Botón: "Crear Cuenta"
4. Al enviar:
   - Validar que passwords coinciden
   - Llamar Server Action completeOnboarding
   - Si éxito → redirect automático al dashboard
   - Si error → mostrar Alert con el error
```

### 7.4 Alternativa sin service_role (más simple)

Si no se quiere usar `service_role` key por seguridad:

```
1. Crear una Edge Function en Supabase: `aceptar-invitacion`
2. La Edge Function:
   a. Recibe: token, nombre, password
   b. Valida el token contra la tabla invitaciones
   c. Crea el usuario con supabaseAdmin.auth.admin.createUser()
   d. Actualiza el profile con el rol y cooperativa_id correctos
   e. Marca invitación como usada
   f. Retorna { success: true }
3. El frontend llama a la Edge Function, luego hace signIn con las credenciales
```

### Criterio de aceptación
- [ ] URL `/cooperativas/invite/<token_valido>` muestra formulario de registro
- [ ] URL `/cooperativas/invite/<token_invalido>` muestra error
- [ ] URL `/cooperativas/invite/<token_expirado>` muestra error
- [ ] Completar registro crea usuario con rol correcto y cooperativa_id vinculada
- [ ] Tras registro, el usuario accede al panel con su rol
- [ ] Token usado no puede reutilizarse

---

## Tarea 8: Configurar Fuentes y Metadata

### 8.1 Fuente Lora (Google Fonts)

Editar `src/app/layout.tsx`:

```tsx
import { Lora } from "next/font/google";

const lora = Lora({
  subsets: ["latin"],
  variable: "--font-lora",
});

export default function RootLayout({ children }) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body className={`${lora.variable} font-sans antialiased`}>
        {children}
      </body>
    </html>
  );
}
```

> Verificar que el preset `b38BG2CiQ` ya configure la variable CSS de fuente. Si no, agregar `--font-sans: var(--font-lora)` en el CSS global.

### 8.2 Metadata SEO

En el mismo `layout.tsx`:

```tsx
export const metadata = {
  title: {
    default: "Panel Cooperativas | EnBus",
    template: "%s | EnBus Panel",
  },
  description: "Panel de gestión operativa para cooperativas de transporte EnBus",
};
```

### Criterio de aceptación
- [ ] La fuente Lora se aplica en toda la app
- [ ] El título del navegador muestra "Panel Cooperativas | EnBus"

---

## Resumen de Entregables Fase 1

| # | Entregable | Archivos clave |
|---|---|---|
| 1 | Proyecto Next.js + shadcn funcional | `package.json`, `components.json` |
| 2 | Clientes Supabase (browser + server + middleware) | `src/lib/supabase/*.ts` |
| 3 | Middleware de protección de rutas | `src/middleware.ts` |
| 4 | Página de login funcional | `src/app/cooperativas/login/page.tsx` |
| 5 | Layout con sidebar dinámica por rol | `src/app/cooperativas/(panel)/layout.tsx`, `src/components/app-sidebar.tsx` |
| 6 | Redirects de rutas base | `src/app/page.tsx` |
| 7 | Onboarding por invitación | Migración SQL + `invite/[token]/page.tsx` |
| 8 | Fuentes + metadata | `src/app/layout.tsx` |

## Orden de Ejecución Recomendado

```
Tarea 1 (Scaffold) → Tarea 8 (Fuentes) → Tarea 2 (Supabase clients)
→ Tarea 3 (Middleware) → Tarea 4 (Login) → Tarea 5 (Layout + Sidebar)
→ Tarea 6 (Redirects) → Tarea 7 (Onboarding)
```

> [!TIP]
> Ejecutar las tareas en este orden porque cada una depende de la anterior. Tarea 7 (Onboarding) es la más compleja y se deja al final porque requiere la migración SQL + lógica de creación de usuarios con roles.
