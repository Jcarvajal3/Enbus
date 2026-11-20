# Rediseño del sitio público: portada para el pasajero + /cooperativas

Plan de ejecución (noviembre 2026). Reemplaza el concepto anterior de "papelería del viaje"
(pase de abordar gigante, palabra "RUTAS", recibo, hojas apiladas) por un sitio de producto
profesional, claro y orientado a conversión. Se conserva la paleta Amanecer y la tipografía Onest.

## 1. Objetivos

1. **La portada habla al pasajero.** Quien llega entiende en 5 segundos qué es EnBus, por qué le
   conviene y qué hacer (descargar la app / rastrear un envío).
2. **Propuesta de valor explícita**: beneficios concretos y verificables, no frases poéticas.
3. **Las cooperativas tienen su propia página** (`/cooperativas`), con su propia propuesta (B2B).
4. **Calidad AAA**: tipografía y ritmo consistentes, accesible (WCAG 2.2 AA), responsive de 360 px a
   1440 px+, sin JS obligatorio para el contenido, rápido (server components por defecto).

## 2. Dónde vive

- Proyecto `PanelCooperativas` (Next.js 16, App Router — **leer `node_modules/next/dist/docs/` antes
  de usar una API que no conozcas**; hay cambios respecto a versiones anteriores).
- Grupo de rutas `src/app/(sitio)/`: `layout.tsx` (Barra + main + Pie), `page.tsx` (portada),
  páginas legales y, nuevo, `cooperativas/page.tsx`.
- Componentes en `src/components/sitio/`.
- Estilos: `src/app/(sitio)/sitio.css` es la **base compartida** (tokens + primitivos). Cada sección
  tiene su **CSS Module** junto al componente (`hero.module.css`, …). No se usa Tailwind en el sitio.
- El panel (resto de `/cooperativas/*` y `/admin/*`) **no se toca**: hay un rediseño del panel sin
  commitear en el árbol de trabajo; no modificar archivos fuera de los asignados.

## 3. Sistema visual (base en `sitio.css`)

Tokens (CSS vars bajo `.sitio`): `--s-canvas` `--s-canvas-2` `--s-paper` `--s-ink` `--s-ink-2`
`--s-ink-3` `--s-muted` `--s-line` `--s-line-2` `--s-on-night` `--s-on-night-muted`
`--s-sol(-hover|-soft|-deep)` `--s-cielo(-soft|-deep)` `--s-coral(-soft|-deep)` `--s-ok(-soft)`
`--s-error(-soft)`; tipo `--t-display --t-h2 --t-h3 --t-lead --t-body --t-small --t-xs`; ritmo
`--m --ancho --ancho-texto --sec --gap-cab`; forma `--r-sm(12) --r-md(16) --r-lg(24) --r-xl(36)
--r-full`; sombras `--sh-1 --sh-2 --sh-3 --sh-sol`; movimiento `--ease --dur`.

Primitivos (clases globales):

| Clase | Uso |
|:--|:--|
| `.s-marco` | Contenedor centrado (máx. 1200 px, margen lateral `--m`) |
| `.s-seccion` (+ `--papel`, `--noche`) | Sección con aire vertical `--sec`; fondo canvas / blanco / noche |
| `.s-titulo-1`, `.s-bajada` | H1 de página y su bajada |
| `.s-boton` + `--sol` `--tinta` `--claro` `--fantasma` · `--lg` `--sm` | Botones pastilla. **Un solo `--sol` por pantallazo** |
| `.s-enlace`, `.s-enlace-flecha` | Enlace de texto; enlace con flecha (icono `ArrowRight`) |
| `.s-chip` + `--cielo --sol --coral --ok --noche` | Insignias |
| `.s-tarjeta` | Tarjeta blanca radio 24 sobre canvas (sobre papel se vuelve canvas) |
| `.s-icono` + `--sol --coral --ok --noche` | Baldosa de icono 48 px |
| `.s-num` | Cifras tabulares |
| `[data-revelar]` + `style={{"--d": n}}` | Entrada suave al hacer scroll (con mesura) |

Componentes compartidos (`src/components/sitio/ui/`):

- `EncabezadoSeccion({ id, etiqueta?, titulo, bajada?, alineacion?, tono?, children? })` — encabezado
  estándar de sección (h2 con `id` para `aria-labelledby`).
- `BotonesTienda({ tono?: "claro"|"noche", nota? })` y `hayAppPublicada()` — Google Play / App Store;
  sin URL configurada se muestran como "Próximamente" (no enlazan).
- `Telefono({ children, ancho?, etiqueta? })` — marco de teléfono para maquetas HTML/CSS de la app.
- `Revelar` (ya existe) — se monta una vez en la página.

Reglas de estilo:
- Frase normal en etiquetas y títulos: **nunca `text-transform: uppercase`** ni letras diminutas espaciadas.
- Iconos: `@phosphor-icons/react/dist/ssr` en server components; `@phosphor-icons/react` en client
  components. Peso `regular` o `duotone` consistente por sección; tamaño 20–24 px.
- Nada de hex/rgba sueltos en los módulos salvo transparencias de blanco/noche sobre fondos oscuros;
  todo color sale de los tokens.
- Contraste ≥ 4,5:1 en texto; foco visible; objetivos táctiles ≥ 44 px.
- Responsive obligatorio: 360, 768, 1024, 1440. Sin scroll horizontal.
- `prefers-reduced-motion`: ninguna animación esencial.
- Imágenes con `next/image` (`placeholder="blur"`, `sizes` correctos). Fotos disponibles en
  `components/sitio/fotos.ts` (Wikimedia, con crédito en el pie).

## 4. Hechos del producto (la única fuente para el copy)

No inventar cifras, testimonios, logos de cooperativas, premios ni funciones. Solo esto:

**Pasajes**
- Se compra desde la **app de EnBus** (no hay compra en la web). Buscas origen, destino y fecha y ves
  las salidas de varias cooperativas.
- Eliges tu asiento en el **mapa del bus**; queda **apartado 30 minutos** mientras pagas.
- Precios en dólares como referencia; **pagas en bolívares a la tasa oficial BCV del día** (ves el
  monto exacto en Bs antes de pagar). La tasa se actualiza cada 30 min.
- Métodos (según la cooperativa): **Pago Móvil, transferencia, Zelle o efectivo en taquilla**.
- **Pagas directo a la cuenta de la cooperativa**: EnBus no toca tu dinero. La cooperativa verifica
  la referencia y te avisamos cuando tu boleto queda confirmado.
- Tu **pase de abordar con QR** queda en la app. El día del viaje: cédula + QR en el andén.
- **Reembolsos claros**: cancelas antes de la salida → te devuelven el **95 %**; si la cooperativa
  cancela el viaje → **100 %**, por el mismo medio con que pagaste.
- Cooperativas **verificadas** por EnBus (pasan por solicitud y aprobación) y con precios
  estandarizados de la plataforma.

**Encomiendas**
- Creas el envío en la app (qué envías, peso aproximado, quién lo retira) y ves el **costo estimado
  en $ y Bs** antes de salir de casa.
- La taquilla lo revisa, lo pesa y entrega la **guía con código de seguimiento** `EB-AAMMDD-NNNNN`.
- Paga quien envía, **o quien lo retira** (cobro en destino).
- Viaja en el próximo bus de la ruta. **Rastreo** etapa por etapa en la web (sin cuenta) o en la app.
- Avisos en cada etapa (notificaciones; al destinatario también por WhatsApp).
- Retiro con **cédula + PIN de 4 dígitos**.
- **Seguro gratuito** contra pérdida: hasta **3 veces el valor declarado**.
- Si nadie lo retira en **5 días hábiles**, vuelve a la oficina de origen.
- No se envía: efectivo y joyas, armas, drogas y medicinas controladas, inflamables/explosivos,
  animales vivos, perecederos sin refrigeración.

**Cooperativas (solo para /cooperativas)**
- Panel web (PWA) para **taquilla de boletos y encomiendas, despacho, embarque con escaneo de QR,
  recepción en destino, entrega con PIN, pagos, reembolsos, rutas y horarios, buses, empleados
  (administrador y taquilleros), sucursales e impresora térmica / lector de QR**.
- **Mismo mapa de asientos** para taquilla y app: un puesto no se vende dos veces.
- Los pasajeros **pagan directo a las cuentas de la cooperativa**; la cooperativa verifica cada referencia.
- Modelo: **comisión por cada boleto o encomienda vendida a través de EnBus**, liquidada por ciclo.
  Sin mensualidad (no se mencionan otros cargos). Precios estandarizados definidos por EnBus.
- Alta: **solicitud en línea → revisión y aprobación por EnBus → configuras rutas, buses, métodos de
  pago y empleados → empiezas a vender**.
- Funciona con conexión inestable (modo sin conexión para escanear y consultar).

**Canales**: WhatsApp y correo de soporte (opcionales por variable de entorno; usar
`soporteWhatsApp()` / `correoSoporte()` y ocultar si son null). App: `tiendasApp()`.

Tono: español de Venezuela, tuteo, frases cortas, concretas, sin exageraciones ("el mejor",
"revolucionario"). Cifras con `formatNumeroVE`; ciudades con `formatCiudad`.

## 5. Estructura de la portada (`/`)

| # | Sección (componente) | id | Contenido |
|:-:|:--|:--|:--|
| — | Barra (`barra.tsx`) | — | Fija arriba con fondo translúcido al hacer scroll. Marca · Cómo funciona · Rutas · Encomiendas · Rastrear · Preguntas · "Para cooperativas" (enlace a `/cooperativas`) · CTA "Descargar app" (`--sol`, ancla a `#descargar`). Menú móvil accesible |
| 1 | `Hero` | `inicio` | H1 orientado al pasajero, bajada con la propuesta, CTA tiendas + "Rastrear un envío", fila de 3 garantías, maqueta de la app (teléfono con pase QR + tarjetas flotantes). Debajo, franja de confianza con cifras reales solo si superan un umbral |
| 2 | `Beneficios` | `por-que` | "Por qué viajar con EnBus": 6 beneficios en rejilla tipo bento |
| 3 | `ComoFunciona` | `como-funciona` | 4 pasos del pasajero con mini-maquetas: busca → elige asiento → paga en Bs → embarca con QR. Nota de reembolsos |
| 4 | `RutasPopulares` | `rutas` | Tarjetas de rutas reales (`fn_rutas_populares`), precio desde en $ y Bs, duración, cooperativas, salidas; tasa BCV del día; estado vacío digno |
| 5 | `Encomiendas` | `encomiendas` + `rastrear` | Propuesta de encomiendas (seguro 3×, rastreo, PIN, cobro en destino), 4 pasos compactos y **el rastreador real** integrado (acción del servidor existente) |
| 6 | `Preguntas` | `preguntas` | FAQ en acordeón (`<details name>`), dos columnas en escritorio, contacto de soporte |
| 7 | `Descarga` | `descargar` | Cierre en banda noche: "Lleva tu viaje en el bolsillo", BotonesTienda (tono noche), teléfono; y una tarjeta secundaria "¿Tienes una cooperativa?" → `/cooperativas` |
| — | Pie (`pie.tsx`) | — | Marca + frase, columnas (Viajar, Enviar, Cooperativas, Legal), contacto, créditos de fotos |

## 6. `/cooperativas` (B2B)

`src/app/(sitio)/cooperativas/page.tsx` (+ `components/sitio/cooperativas/*`). Hoy
`src/app/cooperativas/page.tsx` redirige al dashboard del panel: **se elimina** y el proxy
(`src/lib/supabase/middleware.ts`) debe dejar `/cooperativas` **exacto** como ruta pública (las
subrutas siguen protegidas). `robots.ts`: permitir `/cooperativas` exacto; `sitemap.ts`: añadirla.

Secciones: hero B2B (H1, bajada, CTA "Registrar mi cooperativa" `--sol` + "Entrar al panel"), maqueta
del panel; problemas que resuelve → beneficios; módulos del panel (rejilla de 8–9); cómo empezar en 4
pasos; modelo comercial transparente (comisión por venta, sin mensualidad, pagos directo a tu cuenta);
FAQ de cooperativas; CTA final. Metadata y canonical propios.

## 7. Reparto de trabajo

| Quién | Archivos (exclusivos) |
|:--|:--|
| Orquestador | `sitio.css`, `ui/*`, `app/(sitio)/page.tsx`, `layout.tsx`, `lib/sitio/urls.ts`, `fotos.ts`, borrado de componentes antiguos, QA final |
| Agente A · Portada | `inicio/hero.tsx`, `inicio/beneficios.tsx`, `inicio/como-funciona.tsx` + sus `.module.css` (+ subcomponentes `inicio/maquetas/*` si hacen falta) |
| Agente B · Rutas y encomiendas | `inicio/rutas.tsx`, `inicio/encomiendas.tsx`, `inicio/rastreo.tsx` (client) + `.module.css` |
| Agente C · Navegación y cierre | `barra.tsx` (+ `barra-menu.tsx` client), `pie.tsx`, `inicio/preguntas.tsx`, `inicio/descarga.tsx` + `.module.css`, `app/(sitio)/opengraph-image.tsx` |
| Agente D · Cooperativas | `app/(sitio)/cooperativas/page.tsx`, `components/sitio/cooperativas/**`, borrar `app/cooperativas/page.tsx`, `lib/supabase/middleware.ts` (solo la ruta pública exacta), `app/robots.ts`, `app/sitemap.ts` |

## 8. Definición de terminado

- `npx tsc --noEmit` sin errores en los archivos tocados; `npx eslint <archivos>` limpio.
- `next build` pasa (lo corre el orquestador al integrar).
- Revisión visual a 375, 768 y 1440 px; teclado (tab, foco, menú móvil, acordeones, rastreo).
- Sin JS: todo el contenido visible, el rastreo funciona (acción del servidor).
- Sin datos (Supabase sin configurar): la portada se ve completa, sin huecos ni "NaN".
- Lighthouse objetivo: Accesibilidad 100, SEO 100, Buenas prácticas ≥ 95.
