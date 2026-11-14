# EnBus

Boletos de bus y encomiendas por toda Venezuela con cooperativas de transporte verificadas.
Monorepo con la app de pasajeros, el panel de las cooperativas, la landing pública y el backend en Supabase.

| Carpeta | Qué es | Tecnología |
|---|---|---|
| `EnBusApp/` | App móvil para pasajeros: compra de boletos, envío y rastreo de encomiendas | Expo / React Native (expo-router) |
| `PanelCooperativas/` | Todo lo web en un solo proyecto y dominio: sitio público (portada con rastreo, `/terminos`, `/privacidad`, `/eliminar-cuenta`), panel de las cooperativas (`/cooperativas`) y super admin (`/admin`) | Next.js 16 |
| `LandingEnBus/` | Landing anterior (calculadora, rastreo, registro). Reemplazada por el sitio de `PanelCooperativas/src/app/(sitio)` | Next.js 16 |
| `supabase/` | Migraciones SQL (en orden), edge functions (Deno) y `config.toml` | Supabase (Postgres 17) |
| `shared/` | Fuente única de tokens de diseño y formatos venezolanos; genera `*.generated.*` en los tres proyectos | TypeScript sin dependencias |
| `Specs/`, `Audits/` | Especificaciones funcionales, auditorías y estado de la implementación | Markdown |

La lógica de dinero y de estados vive en funciones `SECURITY DEFINER` de Postgres; los errores de negocio
salen como `EB_*` con el texto para el usuario en `hint`.

## Requisitos

- Node.js 22 (LTS) y npm.
- Para la app: Expo Go o un build de desarrollo (EAS).
- Para el backend: [Supabase CLI](https://supabase.com/docs/guides/cli) (opcional, solo para migraciones y funciones).

## Variables de entorno

Cada subproyecto trae un `.env.example` con lo que necesita. Cópialo a `.env.local` y rellénalo:

```bash
cp EnBusApp/.env.example EnBusApp/.env.local
cp PanelCooperativas/.env.example PanelCooperativas/.env.local
cp LandingEnBus/.env.example LandingEnBus/.env.local
```

Nunca subas un `.env*` con valores reales (están en `.gitignore`). La clave `service_role` solo va en el
servidor (panel y landing), nunca en la app ni en variables `NEXT_PUBLIC_*` / `EXPO_PUBLIC_*`.

## Cómo correr cada parte

```bash
# App móvil
cd EnBusApp && npm ci && npx expo start

# Panel de cooperativas (http://localhost:3000)
cd PanelCooperativas && npm ci && npm run dev

# Landing (http://localhost:3000; usa -p 3001 si el panel ya está corriendo)
cd LandingEnBus && npm ci && npm run dev -- -p 3001
```

Comprobaciones antes de entregar (las mismas que corre el CI en `.github/workflows/ci.yml`):

```bash
# En cada subproyecto
npx tsc --noEmit
npm run lint
npm run build              # solo PanelCooperativas y LandingEnBus

# shared/
node shared/generar.mjs --check
cd shared && npm test
```

## shared/

Tras editar `shared/tokens.json`, `shared/ve.ts` o `shared/artefactos.ts`, regenera las copias y versiónalas
junto con la fuente (nunca edites un `*.generated.*` a mano):

```bash
node shared/generar.mjs
```

Más detalles en `shared/README.md`.

## Supabase

Las migraciones de `supabase/migrations` se aplican en orden de nombre. Las edge functions se despliegan con
`npx supabase functions deploy <nombre> --project-ref <ref>`. Los pasos manuales pendientes (Auth, variables,
despliegues) están en `Audits/pendientes_fase4.md`.
