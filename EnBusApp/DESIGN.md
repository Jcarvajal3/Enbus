# EnBus App — Design System Manual

Este documento sirve como el manual oficial de referencia para el sistema de diseño y la arquitectura de estilos en la aplicación **EnBus App**.
Cualquier nueva vista o componente que se agregue al proyecto debe seguir estrictamente estas especificaciones.

---

## 🎨 1. Paleta de Colores (`Colors`)

Todos los colores se importan desde `@/src/theme` (`Colors`). Queda estrictamente prohibido utilizar códigos hexadecimales (`#HEX`) o valores `rgba()` no parametrizados de forma ad-hoc en los componentes.

| Nombre Token | Valor | Propósito / Uso |
|:---|:---|:---|
| `Colors.primary` | `#FFC757` | Color principal de marca (amarillo cálido). Usar en botones primarios, estrellas de calificación, destaques. |
| `Colors.primaryLight` | `rgba(255, 199, 87, 0.15)` | Fondo para badges o alertas de color primario. |
| `Colors.secondary` | `#FF7648` | Color secundario (naranja coral). Usar en badges informativos secundarios, notificaciones críticas. |
| `Colors.secondaryLight`| `rgba(255, 118, 72, 0.12)` | Fondo para elementos secundarios. |
| `Colors.accent` | `#4A7FF8` | Color de acento (azul vibrante). Usar en botones confirmación, timelines de progreso, links de interacción. |
| `Colors.accentLight` | `rgba(74, 127, 248, 0.12)` | Fondo para secciones destacadas. |
| `Colors.background` | `#FFFFFF` | Color de fondo general de las pantallas. |
| `Colors.surface` | `#F0EFEB` | Color grisáceo/beige suave de base para tarjetas, inputs y campos de lectura. |
| `Colors.surfaceDark` | `#E8E6E1` | Variante de surface más oscura para loaders/skeleton. |
| `Colors.foreground` | `#202020` | Color primario de texto (evitar `#000000` y `#171717`). |
| `Colors.mutedForeground`| `#8A8A8A` | Color para textos descriptivos secundarios, subtítulos y placeholders. |
| `Colors.success` | `#22c55e` | Éxito en transacciones o confirmaciones. |
| `Colors.warning` | `#f59e0b` | Estados de advertencia (boleto reservado, pago pendiente). |
| `Colors.destructive` | `#dc2626` | Alertas de error, cancelación o reembolsos. |

---

## 🔠 2. Tipografía y Escala (`Typography`)

La tipografía unificada para toda la aplicación es **Roobert**.

### 📏 Escala de Tamaños
Evitar pasar números arbitrarios a la propiedad `fontSize`. Mapear siempre a `Typography.sizes`:

- `Typography.sizes.xs` = `11` (Badges, textos extra pequeños)
- `Typography.sizes.sm` = `13` (Descripciones, textos informativos cortos)
- `Typography.sizes.base` = `15` (Texto de cuerpo general, inputs)
- `Typography.sizes.lg` = `17` (Subtítulos, títulos menores)
- `Typography.sizes.xl` = `20` (Títulos de tarjetas, headers secundarios)
- `Typography.sizes['2xl']` = `24` (Títulos de pantallas principales)
- `Typography.sizes['3xl']` = `30` (Destaques grandes, indicadores)
- `Typography.sizes['4xl']` = `36` (Indicadores monumentales)

### ⚖️ Pesos de Fuente (`weights`)
El peso tipográfico se asocia con el eje variable de la fuente Roobert. Usar exclusivamente la escala parametrizada:
- `Typography.weights.regular` = `'400'`
- `Typography.weights.medium` = `'500'`
- `Typography.weights.semibold` = `'600'`
- `Typography.weights.bold` = `'700'`
- `Typography.weights.heavy` = `'800'`

---

## 📐 3. Espaciados e Intervalos (`Spacing`)

Todos los márgenes (`margin`, `padding`, `gap`, `top`, `left`, etc.) deben regirse por los tokens de espaciado para asegurar consistencia perfecta en grilla:

- `Spacing.xs` = `4`
- `Spacing.sm` = `8`
- `Spacing.md` = `12`
- `Spacing.lg` = `16`
- `Spacing.xl` = `20`
- `Spacing['2xl']` = `24`
- `Spacing['3xl']` = `32`
- `Spacing['4xl']` = `40`
- `Spacing['5xl']` = `48`

---

## 🔘 4. Radios de Borde (`Radius`)

Los radios para los contenedores están estandarizados en 5 niveles:

- `Radius.sm` = `10` (Contenedores de inputs, badges medianos)
- `Radius.md` = `16` (Acciones flotantes, tarjetas compactas, pills de estado)
- `Radius.lg` = `20` (Tarjetas de información grandes)
- `Radius.xl` = `24` (Tarjetas y modales principales de pantalla)
- `Radius['2xl']` = `28` (Tarjetas y modales envolventes de cabecera)
- `Radius.full` = `999` (Círculos perfectos y botones de píldora)

---

## 👥 5. Reglas de Estilo para Desarrolladores

1. **Evitar Estilos Inline Continuos**:
   - Todo estilo estático o estructurado debe vivir en una hoja de estilos `StyleSheet.create` al final del archivo.
   - Solo se permiten estilos inline si dependen directamente de una condición de estado cambiante en tiempo de renderizado (e.g. animaciones de Reanimated, cambio de color por selección activa).

2. **Tipografía Predeterminada**:
   - Al usar textos nativos (`Text`), asegurar que siempre tengan configurado `fontFamily: Typography.family` y su peso correspondiente mediante `Typography.weights`.

3. **Uso de Primitives de Interacción**:
   - Para toda acción interactiva que requiera feedback de escala táctil, usar el componente predeterminado `PressableScale` de la app. Éste tiene resuelto el comportamiento táctil óptimo sin sobreposición de capas (anti-overlap fix) y cuenta con feedback háptico integrado.
