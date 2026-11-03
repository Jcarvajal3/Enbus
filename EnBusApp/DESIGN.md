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
  `shared/tokens.json`. Para cambiar un color se edita el JSON y se ejecuta
  `node shared/generar.mjs` desde la raíz del repo; `--check` comprueba que los
  `*.generated.*` estén al día. **Nunca se edita un `*.generated.*` a mano.**
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
| `primary` `#FFC757` | Marca y **acción principal** (botón `primary` con texto `ink`, 10,5:1). Caja de monto con `primaryLight`. |
| `accentStrong` `#2F5FD0` | **Selección y estado activo**: chip, asiento, opción, casilla, interruptor, foco, pestaña activa, contador activo. Texto blanco encima (5,7:1). |
| `accent` `#4A7FF8` | Solo tintes, puntos y bordes. Nunca relleno bajo texto blanco (3,7:1). |
| `link` (= `infoText`) | Enlaces (`TextLink`): semibold y subrayados. |
| `secondary` `#FF7648` | Coral: solo el dominio de encomiendas. Nunca relleno con texto blanco. |
| `background` / `surface` / `surfaceDark` | Blanco / beige / beige oscuro. |
| `border` / `borderStrong` | Separadores / borde de controles (`#8C8C8C`, ≥ 3:1). |
| `foreground` / `mutedForeground` | Texto principal / secundario. |
| `success` `warning` `info` `destructive` | Semántica. Nunca decorativos. Como texto, sus `…Text`. |
| `scrim` / `scrimStrong` | Fondos de modal y bottom sheet. |

Cada color semántico tiene su variante `…Light` (fondo) y `…Border`. Ningún
texto sobre `primary`, `secondary` o `accent` que no sea `ink`.

**Tonos de estado** (`StatusPalette`, vía `getEstadoVisual`): `success` hecho ·
`pending` espera algo de alguien · `progress` en curso · `danger` rechazado o
bloqueado · `done` terminado sin incidencia (relleno `surfaceDark`, "Viaje
realizado", "Vencido", "Devuelta") · `neutral` anulado (contorno, "Cancelado").

### 🔠 Tipografía (`Typography`)

Fuente única: **Roobert**. Nunca escribas `fontFamily`, `fontSize` ni
`fontWeight` a mano — usa `<Text variant="…">`.

**Roles (`variant`)**

| Variant | Uso |
|:---|:---|
| `display` | Cifras monumentales (montos, PIN). |
| `title` | Título de pestaña (30): "Mis boletos", "Mis encomiendas". |
| `heading` | Título de detalle, paso de asistente y hoja (20). |
| `subheading` | Título de tarjeta y de estado vacío (17). |
| `body` / `bodyStrong` | Cuerpo / cuerpo enfatizado. |
| `secondary` | Texto de apoyo. |
| `label` | Etiquetas de formulario, texto fuerte pequeño. |
| `caption` | Metadatos, timestamps. |
| `overline` | Solo en `SectionLabel` (sustantivo, nunca pregunta). |
| `button` | Texto dentro de botones. |

Escala (`Typography.sizes`): `micro 9` · `xs 11` · `badge 12` · `sm 13` · `base 15` ·
`lg 17` · `xl 20` · `2xl 24` · `3xl 30` · `4xl 36`. 24 solo para cifras. Sin
`capitalize`: en español solo va mayúscula inicial.
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

Por rol: control de una línea y chip `full`; tarjeta y fila de lista `xl`;
bloque dentro de una tarjeta (aviso, caja de monto, grupo) `lg`; hoja `3xl`.

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

La tab bar flota. Toda pantalla con scroll debe reservar espacio con
`scrollContent()`:

```tsx
contentContainerStyle={scrollContent({ tabbed: true, floatingAction: true })}
```

Nunca escribas `paddingBottom: 128` ni `bottom: 110` — vienen de
`Layout.scrollBottomInset` y `Layout.floatingBarBottom`.

---

### 🧱 Superficies y estructura

Pantalla blanca (`Screen`) → `ScreenHeader` → contenido con margen
`Layout.screenPadding` (24, Inicio incluido), secciones a 24, dentro de tarjeta
12–16 → `FloatingBar` si hay acción de paso o de pantalla. Tarjeta de contenido
`sunken` sin sombra; la sombra es solo de lo que flota (barra de pestañas,
`FloatingBar`, toast, hoja). Solo tokens de `Spacing`, sin `± n`.

---

## 3. Navegación

- Pestañas **Inicio · Boletos · Encomiendas** (Boletos siempre antes que
  Encomiendas). Cabecera de pestaña: `ScreenHeader` `large` con título y
  `HeaderActions`, sin subtítulo ("Mis boletos", "Mis encomiendas"). Inicio usa
  el mismo `ScreenHeader` con `<BrandMark conNombre />` como título.
- Detalle: `ScreenHeader` `compact` con ← (`useVolver(padre)`), ceja = nombre
  del objeto, título = código (nunca recortado) y el estado en `status`. `right`
  solo para `IconButton`.
- ← nunca muerta: `useVolver('/(tabs)/boletos')`. Es el único sitio que llama
  a `router.back()`. Padres: boleto, compra, viaje → `/(tabs)/boletos`;
  encomienda → `/(tabs)/encomiendas?vista=enviadas|para-mi`; perfil,
  notificaciones, ayuda → `/(tabs)`; `cuenta/*` → `/perfil`.
- Pantalla empujada = `slide_from_right`. Lo que sube desde abajo es una hoja
  (`BottomSheet`): selectores, tareas cortas y confirmaciones.
- Asistentes: `ScreenHeader` `steps` ("Paso 2 de 4" + título del paso) y la
  acción del paso en `FloatingBar` con `resumen` de una línea.
- Confirmar: `useConfirm()` (hoja común). Cero `Alert.alert`. Confirmar = verbo
  + objeto ("Cancelar envío"); salir = "Volver" tras "Cancelar …", si no
  "Cancelar". Salir de un asistente: "¿Salir sin terminar?" · "Salir sin
  guardar" / "Seguir editando".
- Sin sesión: `/login?volver=<ruta>`; tras entrar, `app/_layout.tsx` lleva a
  `volver` (solo rutas internas).

---

## 4. Kit de UI (`@/src/components/ui`)

| Componente | Reemplaza a |
|:---|:---|
| `Text` · `TextLink` | Todo bloque `fontFamily/fontSize/fontWeight`; `TextLink` es el único enlace (≥ 44 pt). |
| `Button` | `primary` (uno por pantalla, por defecto) · `secondary` · `outline` · `ghost` · `danger` (solo en la confirmación) · `dangerGhost` (abre la confirmación). Deshabilitado = relleno `surfaceDark`, sin opacidad. |
| `ConfirmSheet` · `ConfirmProvider` · `useConfirm` | La única confirmación (hoja inferior). |
| `IconButton` | Botones circulares de icono (garantiza 44pt). |
| `Card` · `SectionLabel` · `Divider` · `InfoRow` | Contenedores y filas etiqueta/valor. |
| `Badge` · `StatusBadge` · `CountPill` · `Chip` | Pastillas y estados. |
| `SegmentedControl` | Los 4 toggles animados duplicados. |
| `ScreenHeader` · `StepIndicator` | Las 4 cabeceras distintas y los steppers. |
| `Screen` · `Gutter` · `FloatingBar` · `EmptyState` · `ErrorState` · `StaleBanner` · `scrollContent` | Chrome de pantalla. Vacío: título sin punto + 1 línea + 1 acción. |
| `EntityCard` | La fila de lista: insignia + código, título, subtítulo, flecha si abre algo; `selectable` = borde `accentStrong` + check. |
| `RouteSummary` | El bloque origen ──── destino (glifos neutros). |
| `BottomSheet` | Toda hoja; `onBack` para subpasos; pie con área segura. |
| `Field` · `SelectField` | Los inputs. Etiqueta, texto y ayuda al mismo borde; marcador solo "Ej. …". |

Componentes de dominio comunes (`src/components`): `BrandMark` (bloque "EB"),
`RouteField` (origen/destino en Inicio, compra y envío), `LocationSelector`,
`CalendarModal` (sobre `BottomSheet`), `CedulaField` · `TelefonoField`,
`TransactionCard` (sobre `EntityCard`), `ScreenSkeleton` (`lista` · `detalle` ·
`perfil`: la espera con la forma de la pantalla; el spinner solo va en botones).

**Retirados (D25)**: `Button` `accent`/`gradient`/`dangerSoft`/`glow`, `Text color`
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
   toast — el toast desaparece y el usuario ya no sabe qué campo falló.
