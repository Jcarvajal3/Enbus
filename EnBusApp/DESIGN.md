# EnBus App — Design System "Amanecer"

Manual oficial del sistema de diseño. Toda vista o componente nuevo debe seguir
estas reglas.

**La idea:** el viaje por carretera al amanecer. Un cielo azul suave que se calienta
con el sol sobre un fondo neutro y aireado. El **sol** (amarillo) es la acción; el
**cielo** (azul) es la selección; el **coral** son las encomiendas; la **noche** (azul
tinta) es lo que debe mandar en la pantalla. Todo lo demás es tinta y aire.

**Regla de oro:** una pantalla no define estilos visuales. Elige un componente
del kit (`@/src/components/ui`) y, si necesita ajustes, usa tokens de
`@/src/theme`. Un número mágico en una pantalla es siempre un bug del sistema,
no de la pantalla.

**Regla de jerarquía:** en cada pantalla, una sola cosa manda. Antes de dar por buena
una pantalla, míresela entornando los ojos: debe reducirse a dos o tres masas, con una
claramente dominante, y solo un elemento amarillo.

---

## 1. Arquitectura

```
../shared/tokens.json        ← colores, radios y duraciones (común a app, panel y landing)
src/tokens.generated.ts      ← copia generada de tokens.json (no editar)
src/theme.ts                 ← todos los tokens de la app (lo único que se importa)
src/utils/estados.ts         ← estado de dominio → etiqueta + tono semántico
src/components/ui/           ← kit de UI (lo único que las pantallas importan)
src/components/*.tsx         ← componentes de dominio (SearchForm, SeatSelector…)
app/**                       ← pantallas: composición, datos y navegación
```

**`shared/` es la fuente común** de la app, el panel y la landing (ver
[`shared/README.md`](../shared/README.md)):

- Los colores (`palette`), `Radius` y `Motion.duration` de `theme.ts` vienen de
  `shared/tokens.json`. La paleta de la app es el grupo `paleta`, propio de la app:
  cambiarla no toca el panel ni la landing (ellos usan `claro` y `oscuro`). Para cambiar
  un color se edita el JSON y se ejecuta `node shared/generar.mjs` desde la raíz del
  repo; `--check` comprueba que los `*.generated.*` estén al día. **Nunca se edita un
  `*.generated.*` a mano.**
- Cédula, teléfono, RIF, ciudades ("Mérida", "San Juan de los Morros"), fechas en hora
  de Venezuela y duraciones vienen de `shared/ve.ts` (copiado en
  `src/utils/ve.generated.ts`); se importan, como siempre, desde
  `src/utils/validation.ts` y `src/utils/formatters.ts`.
- Código de boleto, QR, código de seguimiento y PIN vienen de `shared/artefactos.ts`
  (copiado en `src/utils/artefactos.generated.ts`); se importan desde
  `src/utils/codigos.ts`. Reglas: `Specs/00_General/Artefactos_Compartidos.md`.

---

## 2. Tokens (`@/src/theme`)

### 🎨 Colores (`Colors`)

Prohibido escribir `#HEX` o `rgba()` en pantallas o componentes (ESLint lo marca
como error fuera de `src/theme.ts` y `src/tokens.generated.ts`). Para
transparencias usa el helper `alpha(color, 0.12)`.

| Token | Uso |
|:---|:---|
| `primary` `#FFC61A` | **El sol.** Marca y acción principal (botón `primary`, en gradiente, con texto `ink`). **Uno por pantalla.** |
| `primarySoft` / `primaryLight` | Tinte amarillo: el asiento en el pase, el costo estimado. |
| `accentStrong` `#2A62E0` | **El cielo fuerte.** Selección y estado activo: chip, asiento, opción, casilla, interruptor, foco. Texto blanco encima (5,3:1). |
| `accent` / `accentLight` / `accentTint` | Azul suave: tintes, cuadritos, lo no leído. Nunca relleno bajo texto blanco. |
| `link` | Enlaces (`TextLink`): semibold, sin subrayar. |
| `secondary` / `secondaryDeep` / `secondaryLight` | Coral: solo el dominio de encomiendas. |
| `night` / `nightRaised` / `nightMuted` | **La noche.** Barra de pestañas y lo que manda: próximo viaje, monto a pagar, PIN. `nightMuted` es el texto secundario encima. |
| `canvas` | Fondo de toda pantalla. Lo que queda más atrás. |
| `background` / `card` | Blanco: lo que flota sobre `canvas` (tarjeta, hoja, barra). |
| `surface` | Pozo: campo o bloque hundido dentro de algo blanco. **Nunca directo sobre `canvas`:** se confunde con el fondo. |
| `surfaceDark` | Inerte: pista del segmentado, deshabilitado, asiento ocupado. |
| `border` / `borderControl` / `borderStrong` | Separadores / borde de campos con valor / casillas (≥ 3:1). |
| `placeholder` | Marcador de un campo. Nunca para un dato: todo campo lleva además su etiqueta. |
| `foreground` / `mutedForeground` | Texto principal (tinta azulada, no negro) / secundario. |
| `success` `warning` `info` `destructive` | Semántica. Nunca decorativos. Como texto, sus `…Text`. |

**Tonos de estado** (`StatusPalette`, vía `getEstadoVisual`): `success` hecho ·
`pending` espera algo de alguien · `progress` en curso · `danger` rechazado o
bloqueado · `done` terminado sin incidencia · `neutral` anulado (contorno).

### 🌅 Atmósfera (`Atmosfera`, `Gradients`, `Cielo`)

La firma visual. Gradientes en SVG detrás del contenido, sin imágenes.

| Variante | Dónde |
|:---|:---|
| `amanecer` | Portada de Inicio y de acceso. |
| `suave` | Velo por defecto de `Screen`, detrás de la cabecera. |
| `calida` | Velo de las pantallas de encomiendas. |
| `sol` | Cabecera del pase: boleto y envío. Admite texto tinta. |
| `noche` | Superficie oscura con el sol asomando: lo que manda (monto, PIN, próximo viaje). |

**El azul y el amarillo nunca se superponen con transparencia**: mezclados dan oliva. Van
en una sola diagonal que pasa por un tono casi blanco (`Cielo.albaBlanca`), como el cielo
real. Al final, todo se funde con `canvas`, sin cortes.

### 🔠 Tipografía (`Typography`)

Fuente única: **Onest** (licencia libre OFL, ver `assets/fonts/OFL.txt`). Nunca escribas
`fontFamily`, `fontSize` ni `fontWeight` a mano: usa `<Text variant="…">`.

**Una familia por peso, nunca `fontWeight`.** En Android, `expo-font` registra cada fuente
solo como NORMAL: si se le pide `fontWeight: 700`, React Native busca otra familia y cae a
la fuente del sistema (Roboto). `Text` y `fontStyle()` ya eligen el archivo correcto
(`Typography.fonts`). Por eso una fuente variable tampoco sirve aquí.

**Roles (`variant`)**

| Variant | Tamaño | Uso |
|:---|:---|:---|
| `display` | 40 / semibold | Cifras monumentales (montos, con `CifraMonto`). |
| `title` | 32 / semibold | Título de pestaña y pregunta de portada. Con `size="2xl"`, título de paso. |
| `heading` | 22 / semibold | Título de detalle y hoja, ciudad, hora de una salida. |
| `subheading` | 17 / semibold | Título de tarjeta, ruta en una lista, cooperativa. |
| `overline` | 17 / semibold | Solo en `SectionLabel`. En frase normal, **no** en mayúsculas diminutas. |
| `body` / `bodyStrong` | 15 | Cuerpo / dato. |
| `secondary` | 13 | Texto de apoyo. |
| `label` | 13 / medium | Etiquetas de formulario. |
| `caption` | 12 | Metadatos, fechas. |
| `button` | 15–17 / semibold | Texto de botones. |

Lo grande va en semibold, nunca en heavy, con tracking negativo: la jerarquía la da la
escala, no la negrita. Si todo está en negrita, nada resalta. Horas y cuentas atrás con
`tabular`. Sin `capitalize`: en español solo va mayúscula inicial.

### 📐 Espaciado (`Spacing`) vs. Dimensiones (`Sizes`)

Están separados a propósito.

- **`Spacing`** — sólo `margin`, `padding`, `gap`:
  `xs 4 · sm 8 · md 12 · lg 16 · xl 20 · 2xl 24 · 3xl 32 · 4xl 40 · 5xl 48`
- **`Sizes`** — dimensiones de componentes:
  `control.sm|md|lg|xl` (40 · 48 · 56 · 64), `icon.*`, `iconBox.*`, `tile.*`, `avatar.*`,
  `touchTarget` (44), `hitSlop`, `hairline`, `borderStrong`.

**Ritmo:** margen de pantalla 20 · entre tarjetas 16 · entre secciones 32 · dentro de una
tarjeta 16–20 · etiqueta a su control 8.

### 🔘 Radios (`Radius`)

`xs 6 · sm 10 · md 16 · lg 20 · xl 24 · 2xl 28 · 3xl 36 · full 999`

Por rol: botón y chip `full`; **campo y bloque interno `md`**; grupo interno (ruta, aviso)
`lg`; **tarjeta `xl`**; hoja `3xl`. Lleva `borderCurve: 'continuous'` lo que tenga radio
grande (esquina tipo iOS).

### 🌑 Sombras (`Shadows`)

En `boxShadow` (mismo resultado en iOS, Android y web), teñidas de noche: una sombra gris
sobre un fondo azulado se ve sucia. `subtle` · `card` · `raised` (protagonista) · `elevated`
· `overlay` · `tabBar`, y las de color: `sun` (botón principal), `sky` (lo elegido),
`coral`.

**Los volúmenes se separan por tono y sombra, no por líneas de 1 px.** Una tarjeta no
lleva borde. Las líneas solo separan filas dentro de algo.

### 🎞️ Movimiento (`Motion`)

Toda animación lee de aquí. No hay duraciones sueltas.

- `duration`: `instant 110 · fast 160 · base 240 · slow 340 · slower 520 · ambient 800`
- `easing`: `out` (entra), `in` (sale), `inOut` (bucles)
- `spring`: `snappy` (indicadores) · `soft` (sheets) · `bouncy` (selección)
- `press`: factores de escala por tipo de superficie
- `stagger`: `step 45`, `maxIndex 7`

Principios: lo que entra es más lento que lo que sale; sólo se animan `opacity`
y `transform`; **toda animación comprueba `useReducedMotion()`** y, con
"reducir movimiento", el elemento aparece ya en su sitio.

### 📱 Layout (`Layout`)

La barra de pestañas flota. Toda pantalla con scroll debe reservar espacio con
`scrollContent()`:

```tsx
contentContainerStyle={scrollContent({ tabbed: true, floatingAction: true })}
```

Nunca escribas `paddingBottom: 128` ni `bottom: 110`: vienen de
`Layout.scrollBottomInset` y `Layout.floatingBarBottom`.

---

### 🧱 Superficies y estructura

`Screen` (con su atmósfera) → `ScreenHeader` (transparente) → contenido con margen
`Layout.screenPadding` → `FloatingBar` si hay acción de paso o de pantalla.

**Figura y fondo:** `canvas` → blanco → `surface`. Un pozo solo existe dentro de algo
blanco: en una pantalla apilada sobre `canvas`, los campos van dentro de una `Card`.

**El color se gana:** la pantalla es tinta y aire; el color entra por los `IconTile` y por
una sola cosa protagonista. El amarillo es la acción; el azul, la selección y el dato; el
coral, las encomiendas. Las listas se escanean por color: el cuadrito de cada fila toma el
tono de su estado.

**La perforación** (`Perforacion`) es el motivo del producto: une boletos y envíos, que se
dibujan como pases (`Atmosfera sol` + ruta + perforación + contenido). Sus muescas son del
color de `canvas`, así que una pantalla con pase va sin velo: `<Screen atmosfera={null}>`.

---

## 3. Navegación

- Pestañas **Inicio · Boletos · Encomiendas**, en una barra de noche flotante; la activa es
  una pastilla blanca (el amarillo se reserva para la acción). Cabecera de pestaña:
  `ScreenHeader` `large` con título y `HeaderActions`. Inicio usa `<BrandMark conNombre />`
  como título.
- Detalle: `ScreenHeader` `compact` con ← (`useVolver(padre)`), ceja = nombre del objeto,
  título = código (nunca recortado) y el estado en `status`. `right` solo para `IconButton`.
- ← nunca muerta: `useVolver('/(tabs)/boletos')`. Es el único sitio que llama
  a `router.back()`. Padres: boleto, compra, viaje → `/(tabs)/boletos`;
  encomienda → `/(tabs)/encomiendas?vista=enviadas|para-mi`; perfil,
  notificaciones, ayuda → `/(tabs)`; `cuenta/*` → `/perfil`.
- Pantalla empujada = `slide_from_right`. Lo que sube desde abajo es una hoja
  (`BottomSheet`): selectores, tareas cortas y confirmaciones.
- Asistentes: `ScreenHeader` `steps` (←, tramos de progreso y título grande a la izquierda)
  y la acción del paso en `FloatingBar`, un muelle blanco con `resumen` de una línea.
- Confirmar: `useConfirm()` (hoja común). Cero `Alert.alert`. Confirmar = verbo
  + objeto ("Cancelar envío"); salir = "Volver" tras "Cancelar …", si no
  "Cancelar". Salir de un asistente: "¿Salir sin terminar?" · "Salir sin
  guardar" / "Seguir editando".
- Sin sesión: `/login?volver=<ruta>`; tras entrar, `app/_layout.tsx` lleva a
  `volver` (solo rutas internas).

---

## 4. Kit de UI (`@/src/components/ui`)

| Componente | Para qué |
|:---|:---|
| `Text` · `TextLink` | Todo texto; `TextLink` es el único enlace (≥ 44 pt). |
| `Button` | `primary` (el sol: uno por pantalla) · `secondary` · `outline` · `ghost` · `danger` (solo en la confirmación) · `dangerGhost` (abre la confirmación). Deshabilitado = relleno `surfaceDark`, sin opacidad. |
| `Atmosfera` | Los gradientes de fondo. |
| `Aviso` | **El único bloque de aviso** en una pantalla: tinte del tono, icono en círculo blanco, `titulo`, `texto` y `extra`. `neutral` se dibuja como tarjeta. |
| `ConfirmSheet` · `ConfirmProvider` · `useConfirm` | La única confirmación (hoja inferior). |
| `IconButton` | Botones circulares de icono (garantiza 44 pt). `raised` en cabeceras. |
| `Card` · `SectionLabel` · `Divider` · `InfoRow` | Contenedores y filas etiqueta/valor. |
| `IconTile` | El cuadrito con icono en duotono: `sky` · `coral` · `brand` · `mint` · `neutral` · `solido`, o `estado` para tomar el color de un estado. |
| `Perforacion` | La línea punteada con muescas de un pase. |
| `Badge` · `StatusBadge` · `CountPill` · `Chip` | Pastillas y estados. La insignia lleva punto de color. `Chip` sobre `canvas`: `sobre="surface"`. |
| `SegmentedControl` | Los toggles animados. |
| `ScreenHeader` · `StepIndicator` | La cabecera y los tramos de progreso. |
| `Screen` · `Gutter` · `FloatingBar` · `EmptyState` · `ErrorState` · `StaleBanner` · `scrollContent` | Chrome de pantalla. Vacío: título + 1 línea + 1 acción (`action`; `secondaryAction` `ghost` para una segunda salida). |
| `EntityCard` | La fila de lista: `leading` (`IconTile`), título (una ruta "A → B" se dibuja con su flecha), subtítulo, `adorno`, y pie con `badge` + `meta`. `selectable` = borde `accentStrong` + check. |
| `RouteSummary` | El bloque origen ──── destino, con las ciudades grandes. |
| `Monto` · `CifraMonto` | Todo dinero; `CifraMonto` para el que manda (símbolo pequeño, cifra grande). |
| `BottomSheet` | Toda hoja; `onBack` para subpasos; pie con área segura. Anima sola fondo y deslizamiento; ningún campo toma el foco al abrir. |
| `Field` · `SelectField` | Los inputs. Vacío: pozo `surface`, sin borde visible, marcador en peso regular (`placeholder` es obligatorio). Con valor: blanco con borde. Al enfocar: blanco con borde azul y anillo. Etiqueta, caja y ayuda al mismo borde. `tone="light"` solo sobre `canvas`. |

Componentes de dominio comunes (`src/components`): `BrandMark` (bloque "EB" en gradiente
sol), `RouteField` (origen/destino con el camino dibujado, en Inicio, compra y envío),
`LocationSelector`, `CalendarModal` (sobre `BottomSheet`), `CedulaField` · `TelefonoField`,
`TransactionCard` (sobre `EntityCard`, cuadrito teñido por el estado), `ProximoViajeCard`
(noche), `ReservaTimer`, `StatusTimeline`, `SeatSelector`, `ScreenSkeleton` (`lista` ·
`detalle` · `perfil`: la espera con la forma de la pantalla; el spinner solo va en botones).

**Retirados**: `Button` `accent`/`gradient`/`dangerSoft`/`glow`, `Text color`
`accent`/`secondary`/`danger`, `EntityCard` `initial`/`tone`, `Badge icon`,
`PageTransition`, `LoadingState`. ESLint (`error`) impide volver a usarlos y
también el resto del barrido de la app:
`Alert.alert`, `router.back()`, `capitalize`, formateadores de fecha sueltos,
`right={<StatusBadge…>}`, `Spacing.x ± n`, "Desde"/"Hacia", "Sí, …" y
marcadores que no empiezan por "Ej. ".

### Estados de dominio

Nunca pintes un `estado` a mano:

```tsx
<StatusBadge dominio="encomienda" estado={enc.estado} />
const { label, tone, hint } = getEstadoVisual('boleto', boleto.estado);
```

`src/utils/estados.ts` es el único lugar donde un estado del backend se traduce
a etiqueta, tono y explicación para el usuario.

---

## 5. Reglas para desarrollo

1. **Sin estilos inline** salvo que dependan de estado en tiempo de render.
   Todo lo demás va en un `StyleSheet.create` al final del archivo.
2. **Sin números mágicos.** Si necesitas un valor que no existe, añádelo a
   `theme.ts` con nombre semántico.
3. **Interacción táctil:** usa `PressableScale` (ya incorpora escala, haptics y
   `hitSlop`). No envuelvas `Pressable` a mano.
4. **Accesibilidad:** todo control necesita `accessibilityRole` y
   `accessibilityLabel`; los de sólo icono, obligatoriamente. Área mínima
   `Sizes.touchTarget`.
5. **Estados vacíos:** usa `EmptyState` y, cuando exista, ofrece una acción de
   salida (`action`). Un callejón sin salida no es un estado vacío aceptable.
6. **Errores de formulario:** inline en el `Field` (`error`), no sólo en un
   toast: el toast desaparece y el usuario ya no sabe qué campo falló.
7. **Iconos sobre un gradiente absoluto:** envuélvelos en un `View`. En web, un SVG suelto
   queda debajo de lo posicionado (`IconTile` y `Button` ya lo hacen).
8. **Prueba en 360 pt de ancho:** es donde se rompen las filas de cifras y las etiquetas.
