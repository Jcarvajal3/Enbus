# EnBus App — Design System

Manual oficial del sistema de diseño. Toda vista o componente nuevo debe seguir
estas reglas.

**Regla de oro:** una pantalla no define estilos visuales. Elige un componente
del kit (`@/src/components/ui`) y, si necesita ajustes, usa tokens de
`@/src/theme`. Un número mágico en una pantalla es siempre un bug del sistema,
no de la pantalla.

---

## 1. Arquitectura

```
src/theme.ts                 ← todos los tokens (única fuente de verdad)
src/utils/estados.ts         ← estado de dominio → etiqueta + tono semántico
src/components/ui/           ← kit de UI (lo único que las pantallas importan)
src/components/*.tsx         ← componentes de dominio (SearchForm, SeatSelector…)
app/**                       ← pantallas: composición, datos y navegación
```

---

## 2. Tokens (`@/src/theme`)

### 🎨 Colores (`Colors`)

Prohibido escribir `#HEX` o `rgba()` en pantallas o componentes. Para
transparencias usa el helper `alpha(color, 0.12)`.

| Token | Uso |
|:---|:---|
| `primary` `#FFC757` | Marca. Botones primarios, estrellas, destacados. |
| `secondary` `#FF7648` | Acento cálido. Badges de envío, precios. |
| `accent` `#4A7FF8` | CTA principal, selección, links. |
| `background` / `surface` / `surfaceDark` | Blanco / beige / beige oscuro. |
| `foreground` / `mutedForeground` | Texto principal / secundario. |
| `success` `warning` `info` `destructive` | Semántica. Nunca decorativos. |
| `scrim` / `scrimStrong` | Fondos de modal y bottom sheet. |

Cada color semántico tiene su variante `…Light` (fondo) y `…Border`.

### 🔠 Tipografía (`Typography`)

Fuente única: **Roobert**. Nunca escribas `fontFamily`, `fontSize` ni
`fontWeight` a mano — usa `<Text variant="…">`.

**Roles (`variant`)**

| Variant | Uso |
|:---|:---|
| `display` | Cifras monumentales (montos, PIN). |
| `title` | Título de pantalla. |
| `heading` | Título de sección o modal. |
| `subheading` | Título de tarjeta. |
| `body` / `bodyStrong` | Cuerpo / cuerpo enfatizado. |
| `secondary` | Texto de apoyo. |
| `label` | Etiquetas de formulario, texto fuerte pequeño. |
| `caption` | Metadatos, timestamps. |
| `overline` | Antetítulo en mayúsculas. |
| `button` | Texto dentro de botones. |

Escala (`Typography.sizes`): `micro 9` · `xs 11` · `sm 13` · `base 15` ·
`lg 17` · `xl 20` · `2xl 24` · `3xl 30` · `4xl 36`.
Cada tamaño trae su `lineHeight` calculado; usa `compact` para desactivarlo.

### 📐 Espaciado (`Spacing`) vs. Dimensiones (`Sizes`)

Están separados a propósito.

- **`Spacing`** — sólo `margin`, `padding`, `gap`:
  `xs 4 · sm 8 · md 12 · lg 16 · xl 20 · 2xl 24 · 3xl 32 · 4xl 40 · 5xl 48`
- **`Sizes`** — dimensiones de componentes:
  `control.sm|md|lg|xl` (alturas), `icon.*`, `iconBox.*`, `avatar.*`,
  `touchTarget` (44), `hitSlop`, `hairline`, `borderStrong`.

> Nunca uses `Spacing['5xl']` como altura de un input. Para eso existe
> `Sizes.control.lg`.

### 🔘 Radios (`Radius`)

`xs 6 · sm 10 · md 16 · lg 20 · xl 24 · 2xl 28 · 3xl 36 · full 999`

Convención: inputs y botones de una línea son **pill** (`full`); tarjetas usan
`lg`/`xl`; sheets usan `3xl`.

### 🎞️ Movimiento (`Motion`)

Toda animación lee de aquí. No hay duraciones sueltas.

- `duration`: `instant 110 · fast 160 · base 240 · slow 340 · slower 520 · ambient 800`
- `easing`: `out` (entra), `in` (sale), `inOut` (bucles)
- `spring`: `snappy` (indicadores) · `soft` (sheets) · `bouncy` (selección)
- `press`: factores de escala por tipo de superficie
- `stagger`: `step 45`, `maxIndex 7`

Principios: lo que entra es más lento que lo que sale; sólo se animan `opacity`
y `transform`.

### 📱 Layout (`Layout`)

La tab bar flota. Toda pantalla con scroll debe reservar espacio con
`scrollContent()`:

```tsx
contentContainerStyle={scrollContent({ tabbed: true, floatingAction: true })}
```

Nunca escribas `paddingBottom: 128` ni `bottom: 110` — vienen de
`Layout.scrollBottomInset` y `Layout.floatingBarBottom`.

---

## 3. Kit de UI (`@/src/components/ui`)

| Componente | Reemplaza a |
|:---|:---|
| `Text` | Todo bloque `fontFamily/fontSize/fontWeight`. |
| `Button` | Los ~12 botones distintos que existían. |
| `IconButton` | Botones circulares de icono (garantiza 44pt). |
| `Card` · `SectionLabel` · `Divider` · `InfoRow` | Contenedores y filas etiqueta/valor. |
| `Badge` · `StatusBadge` · `CountPill` · `Chip` | Pastillas y estados. |
| `SegmentedControl` | Los 4 toggles animados duplicados. |
| `ScreenHeader` · `StepIndicator` | Las 4 cabeceras distintas y los steppers. |
| `Screen` · `Gutter` · `FloatingBar` · `EmptyState` · `LoadingState` · `scrollContent` | Chrome de pantalla. |
| `EntityCard` | Las 4 variantes de fila de lista. |
| `RouteSummary` | El bloque ORIGEN ──●── DESTINO. |
| `BottomSheet` | Los 3 sheets con PanResponder propio. |
| `Field` · `SelectField` | Los 5 inputs distintos. |

### Estados de dominio

Nunca pintes un `estado` a mano:

```tsx
<StatusBadge dominio="encomienda" estado={enc.estado} />
const { label, tone, hint } = getEstadoVisual('boleto', boleto.estado);
```

`src/utils/estados.ts` es el único lugar donde un estado del backend se traduce
a etiqueta, tono y explicación para el usuario.

---

## 4. Reglas para desarrollo

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
   toast — el toast desaparece y el usuario ya no sabe qué campo falló.
