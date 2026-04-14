# App Móvil: Sistema de Diseño

## 1. Filosofía
La app debe mantener un diseño **premium, elegante y consistente** entre la app móvil y el ecosistema web. Se utiliza el preset shadcn/ui `b38BG2CiQ` (estilo **Maia**, base **Neutral**) como fuente de verdad para los tokens de diseño. Los componentes web usan shadcn/ui directamente; los componentes móviles usan **React Native Reusables** + **NativeWind** (Tailwind CSS para React Native) portando los mismos tokens.

> **Preset Code**: `b38BG2CiQ`
> **Estilo**: Maia (Radix)
> **Base de Color**: Neutral
> **Aplicar en Web**: `npx shadcn@latest apply --preset b38BG2CiQ`

## 2. Tipografía
- **Fuente principal**: **Lora** (Google Fonts, Serif).
- **Fallback Web**: `Georgia, "Times New Roman", serif`.
- **Fallback Móvil**: System default (San Francisco en iOS, Roboto en Android).

| Uso | Peso | Tamaño |
|---|---|---|
| Títulos de sección | Bold (700) | 24px |
| Subtítulos | Semi-Bold (600) | 18px |
| Cuerpo de texto | Regular (400) | 16px |
| Labels y captions | Medium (500) | 14px |
| Texto pequeño | Regular (400) | 12px |

## 3. Paleta de Colores (Tokens CSS)

Todas las variables usan **OKLCH** como formato nativo (estándar de shadcn v2). Para compatibility con NativeWind, se proveen equivalentes HEX aproximados.

### Modo Claro (`:root`)
| Token | OKLCH | HEX Aprox. | Uso |
|---|---|---|---|
| `--background` | `oklch(1 0 0)` | `#FFFFFF` | Fondo principal |
| `--foreground` | `oklch(0.145 0 0)` | `#171717` | Texto principal |
| `--card` | `oklch(1 0 0)` | `#FFFFFF` | Fondo de cards |
| `--card-foreground` | `oklch(0.145 0 0)` | `#171717` | Texto en cards |
| `--popover` | `oklch(1 0 0)` | `#FFFFFF` | Fondo de popovers |
| `--popover-foreground` | `oklch(0.145 0 0)` | `#171717` | Texto en popovers |
| `--primary` | `oklch(0.852 0.199 91.936)` | `#E2B714` | CTA principal, acentos dorados |
| `--primary-foreground` | `oklch(0.421 0.095 57.708)` | `#6B4A1A` | Texto sobre primary (marrón oscuro) |
| `--secondary` | `oklch(0.967 0.001 286.375)` | `#F5F5F5` | Fondos secundarios |
| `--secondary-foreground` | `oklch(0.21 0.006 285.885)` | `#262626` | Texto sobre secondary |
| `--muted` | `oklch(0.97 0 0)` | `#F5F5F5` | Fondos atenuados |
| `--muted-foreground` | `oklch(0.556 0 0)` | `#737373` | Texto secundario/placeholder |
| `--accent` | `oklch(0.97 0 0)` | `#F5F5F5` | Fondos de elemento activo |
| `--accent-foreground` | `oklch(0.205 0 0)` | `#262626` | Texto en acento |
| `--destructive` | `oklch(0.577 0.245 27.325)` | `#DC2626` | Errores, cancelaciones, alertas |
| `--border` | `oklch(0.922 0 0)` | `#E5E5E5` | Bordes generales |
| `--input` | `oklch(0.922 0 0)` | `#E5E5E5` | Bordes de inputs |
| `--ring` | `oklch(0.708 0 0)` | `#A3A3A3` | Anillo de focus |

### Modo Oscuro (`.dark`)
| Token | OKLCH | HEX Aprox. | Uso |
|---|---|---|---|
| `--background` | `oklch(0.145 0 0)` | `#171717` | Fondo principal |
| `--foreground` | `oklch(0.985 0 0)` | `#FAFAFA` | Texto principal |
| `--card` | `oklch(0.205 0 0)` | `#262626` | Fondo de cards |
| `--card-foreground` | `oklch(0.985 0 0)` | `#FAFAFA` | Texto en cards |
| `--popover` | `oklch(0.205 0 0)` | `#262626` | Fondo de popovers |
| `--popover-foreground` | `oklch(0.985 0 0)` | `#FAFAFA` | Texto en popovers |
| `--primary` | `oklch(0.795 0.184 86.047)` | `#D4A017` | CTA principal (dorado atenuado) |
| `--primary-foreground` | `oklch(0.421 0.095 57.708)` | `#6B4A1A` | Texto sobre primary |
| `--secondary` | `oklch(0.274 0.006 286.033)` | `#333333` | Fondos secundarios |
| `--secondary-foreground` | `oklch(0.985 0 0)` | `#FAFAFA` | Texto sobre secondary |
| `--muted` | `oklch(0.269 0 0)` | `#333333` | Fondos atenuados |
| `--muted-foreground` | `oklch(0.708 0 0)` | `#A3A3A3` | Texto secundario |
| `--accent` | `oklch(0.269 0 0)` | `#333333` | Fondos de elemento activo |
| `--accent-foreground` | `oklch(0.985 0 0)` | `#FAFAFA` | Texto sobre acento |
| `--destructive` | `oklch(0.704 0.191 22.216)` | `#EF4444` | Errores, alertas |
| `--border` | `oklch(1 0 0 / 10%)` | `rgba(255,255,255,0.1)` | Bordes translúcidos |
| `--input` | `oklch(1 0 0 / 15%)` | `rgba(255,255,255,0.15)` | Bordes de inputs |
| `--ring` | `oklch(0.556 0 0)` | `#737373` | Anillo de focus |

### Colores Semánticos Adicionales (Custom)
Estos tokens **no son parte del preset** pero se extienden en el CSS global para estados de negocio:

| Token | HEX | Uso |
|---|---|---|
| `--success` | `#22C55E` | Estados positivos (PAGADA, ENTREGADA) |
| `--warning` | `#F59E0B` | Estados de precaución (POR_PAGAR, alertas amarillas) |
| `--info` | `#3B82F6` | Estados informativos (EN_TRANSITO) |
| `--star` | `#FBBF24` | Calificaciones por estrellas |

## 4. Espaciado
Sistema de 4px base (consistente con Tailwind):
| Token | Valor | Tailwind |
|---|---|---|
| `xs` | 4px | `p-1` / `gap-1` |
| `sm` | 8px | `p-2` / `gap-2` |
| `md` | 16px | `p-4` / `gap-4` |
| `lg` | 24px | `p-6` / `gap-6` |
| `xl` | 32px | `p-8` / `gap-8` |
| `2xl` | 48px | `p-12` / `gap-12` |

## 5. Bordes y Sombras
- **Border radius (global `--radius`)**: `0.875rem` (14px) — Preset Maia.
- **Border radius (cards)**: `--radius` (14px)
- **Border radius (botones)**: `calc(var(--radius) - 4px)` (10px)
- **Border radius (inputs)**: `calc(var(--radius) - 4px)` (10px)
- **Border radius (profile icon)**: 50% (circular)
- **Sombra de cards**: `0 1px 3px rgba(0,0,0,0.1), 0 1px 2px rgba(0,0,0,0.06)`

## 6. Componentes Base
Todos derivados de React Native Reusables (puerto de shadcn/ui):
- Button (variantes: default, destructive, outline, secondary, ghost, link)
- Input
- Select / Dropdown
- Card (CardHeader / CardTitle / CardDescription / CardContent / CardFooter)
- Badge (variantes: default, secondary, destructive, outline)
- Profile Icon (inicial del nombre en círculo)
- Dialog / Modal (siempre con DialogTitle)
- Tabs (TabsList / TabsTrigger / TabsContent)
- Switch / Toggle
- Separator
- Alert
- Skeleton (shimmer loading)
- Spinner

> **Regla shadcn**: Usar siempre tokens semánticos (`bg-primary`, `text-muted-foreground`, etc.). Nunca valores crudos como `bg-blue-500`. Ver reglas completas en la skill `shadcn`.

## 7. Animaciones
- **Transiciones de pantalla**: slide horizontal (stack), slide vertical (modales).
- **Micro-animaciones**: fade-in al cargar listas, scale al presionar botones.
- **StatusTimeline**: pulse animation en el estado activo.
- **QR Code**: fade-in con escala suave al renderizarse.
- **Skeleton loaders**: shimmer effect mientras cargan datos.

## 8. Iconografía
- Librería: **Phosphor Icons** (`@phosphor-icons/react` / `phosphor-react-native`).
- Tamaño en bottom tabs: 24px.
- Tamaño en header: 20px.
- Tamaño en listas/cards: 16px.
- En botones usar `data-icon="inline-start"` o `data-icon="inline-end"`, sin clases de tamaño en el ícono.

## 9. Referencia Rápida: Preset → Proyecto

| Aspecto | Valor |
|---|---|
| **Preset Code** | `b38BG2CiQ` |
| **Estilo** | Maia (Radix) |
| **Color Base** | Neutral |
| **Primary** | Dorado/Amber (`#E2B714`) |
| **Fuente** | Lora (Serif) |
| **Radius** | 0.875rem (14px) |
| **Iconos** | Phosphor Icons |
| **Comando Init** | `npx shadcn@latest init --preset b38BG2CiQ` |
| **Comando Apply** | `npx shadcn@latest apply --preset b38BG2CiQ` |
