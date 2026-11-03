# EnBus · Landing

Sitio público de EnBus (Next.js 16, App Router): portada con rutas populares y calculadora de envíos,
rastreo de encomiendas (`/rastrear`), afiliación de cooperativas (`/registro-cooperativa`) y páginas
legales (`/terminos`, `/privacidad`, `/eliminar-cuenta`).

```bash
cp .env.example .env.local   # y rellena los valores
npm ci
npm run dev                  # http://localhost:3000
npx tsc --noEmit && npx eslint . --max-warnings=0 && npm run build
```

- Las consultas a Supabase (`lib/consultas.ts`) usan la clave `service_role` y solo corren en el servidor
  (server components y server actions). Sin las variables de Supabase la landing se construye igual y
  oculta las secciones con datos.
- Las acciones públicas (`app/rastrear/actions.ts`, `app/registro-cooperativa/actions.ts`) tienen límite
  de frecuencia por IP con `fn_consumir_limite` (`lib/limites.ts`).
- `lib/ve.generated.ts`, `lib/artefactos.generated.ts` y `app/tokens.generated.css` se generan desde
  `shared/` con `node shared/generar.mjs` (no editarlos a mano).
- Los componentes de `components/ui` vienen de shadcn/ui (`npx shadcn@latest add <componente>`).
