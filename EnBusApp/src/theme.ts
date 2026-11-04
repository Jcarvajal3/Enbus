/**
 * EnBus Design System — "Amanecer"
 *
 * La idea: el viaje por carretera al amanecer. Un cielo azul suave que se calienta
 * con el sol (amarillo → coral) sobre un fondo neutro azulado y texto tinta. El sol
 * (amarillo) es la acción; el cielo (azul) es la selección; el coral son las
 * encomiendas. Todo lo demás es tinta y aire.
 *
 * Every screen and component imports from here. Nothing visual should be a literal
 * number or colour in a screen file (lint: no hex/rgba outside this file).
 *
 * Colours, radii and motion durations come from `shared/tokens.json` through
 * `./tokens.generated.ts`, which `node shared/generar.mjs` writes.
 *
 * Figura y fondo: `canvas` (neutro azulado) queda atrás; `card` (blanco) flota sobre
 * él con sombra suave y sin borde; `surface` (pozo) se hunde dentro de lo blanco.
 * Los volúmenes se separan por tono y sombra, no por líneas de 1 px.
 *
 * Token groups:
 *   Colors      — palette + semantic roles
 *   Typography  — family per weight, sizes, line heights, tracking, presets
 *   Spacing     — the 4pt rhythm used for margin/padding/gap ONLY
 *   Sizes       — component dimensions (heights, icons, avatars) — never Spacing
 *   Radius      — corner scale
 *   Shadows     — elevation, tinted with navy (and the sun, for the main action)
 *   Gradients   — sun, sky, coral, night
 *   Motion      — durations, easings, springs (all animation reads from here)
 *   Layout      — screen chrome: gutters, tab bar, safe bottom inset
 *   Opacity     — interaction states
 */

import { Easing } from 'react-native-reanimated';

import { palette, tokens } from './tokens.generated';

// ─── Alpha helper ────────────────────────────────────────────────────────────

/**
 * Returns `color` at the given alpha. Accepts #RGB, #RRGGBB and rgb()/rgba().
 * Use this instead of writing `rgba(...)` literals or `Colors.x + '40'`.
 */
export function alpha(color: string, a: number): string {
  const clamped = Math.max(0, Math.min(1, a));

  if (color.startsWith('#')) {
    let hex = color.slice(1);
    if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('');
    const int = parseInt(hex.slice(0, 6), 16);
    const r = (int >> 16) & 255;
    const g = (int >> 8) & 255;
    const b = int & 255;
    return `rgba(${r}, ${g}, ${b}, ${clamped})`;
  }

  const nums = color.match(/[\d.]+/g);
  if (nums && nums.length >= 3) {
    return `rgba(${nums[0]}, ${nums[1]}, ${nums[2]}, ${clamped})`;
  }

  return color;
}

// ─── Colors ──────────────────────────────────────────────────────────────────

export const Colors = {
  // Sol: la marca y la acción principal
  primary: palette.yellow,
  primaryDeep: palette.yellowDeep,
  /** Tinte amarillo opaco: lo que debe destacar dentro de lo blanco. */
  primarySoft: palette.yellowSoft,
  primaryLight: palette.yellowTint,
  primaryBorder: alpha(palette.yellow, 0.45),
  primaryForeground: palette.navy,
  /** Ámbar legible como texto. `primary` nunca es color de texto. */
  primaryText: palette.amberText,

  // Coral: el dominio de encomiendas
  secondary: palette.coral,
  secondaryDeep: palette.coralDeepFill,
  secondaryLight: palette.coralSoft,
  secondaryBorder: alpha(palette.coral, 0.25),
  secondaryForeground: palette.white,
  secondaryText: palette.coralDeep,

  // Cielo: selección, foco y estado activo
  /** Azul suave: tintes, puntos, bordes. Nunca relleno bajo texto blanco. */
  accent: palette.blue,
  accentLight: palette.blueSoft,
  accentTint: palette.blueTint,
  accentBorder: alpha(palette.blue, 0.3),
  accentForeground: palette.white,
  accentMuted: alpha(palette.blue, 0.35),
  /** Selección y estado activo. Texto blanco encima: 5,3:1. */
  accentStrong: palette.blueDark,
  accentStrongForeground: palette.white,

  /** Enlaces y botones de texto (≥ 4,5:1 sobre blanco y `canvas`). */
  link: palette.blueText,

  // Noche: la superficie oscura (barra de pestañas, tarjeta de monto)
  night: palette.navy,
  nightRaised: palette.navyRaised,
  nightLine: palette.navyLine,
  /** Texto secundario sobre noche: 8:1. */
  nightMuted: alpha(palette.white, 0.68),

  // Superficies
  /** Fondo de toda pantalla: lo que queda más atrás. */
  canvas: palette.canvas,
  /** Blanco: lo que flota sobre `canvas` (tarjeta, hoja, barra). */
  background: palette.white,
  /** Pozo: bloque o campo hundido dentro de algo blanco. */
  surface: palette.well,
  /** Inerte: pista, deshabilitado, ocupado. */
  surfaceDark: palette.canvasDark,
  card: palette.white,

  // Texto
  foreground: palette.ink,
  mutedForeground: palette.greyText,
  neutralLight: alpha(palette.grey, 0.12),

  // Semántica
  success: palette.green,
  successLight: palette.greenSoft,
  successText: palette.greenText,
  warning: palette.amber,
  warningLight: palette.amberSoft,
  warningText: palette.orangeText,
  info: palette.sky,
  infoLight: palette.skySoft,
  infoText: palette.blueText,
  destructive: palette.red,
  destructiveLight: palette.redSoft,
  dangerText: palette.redText,
  destructiveSoft: alpha(palette.red, 0.07),
  destructiveBorder: alpha(palette.red, 0.22),

  // Bordes
  border: palette.line,
  borderLight: palette.line,
  /** Borde en reposo de un campo. */
  borderControl: palette.borderControl,
  /** Controles que deben leerse a ≥ 3:1 (casillas, radios). */
  borderStrong: palette.borderStrong,
  /** Marcador de un campo, en peso regular. */
  placeholder: palette.placeholder,

  // Overlays
  scrim: alpha(palette.navy, 0.42),
  scrimStrong: alpha(palette.navy, 0.58),

  // Misc
  white: palette.white,
  black: palette.ink,
  transparent: 'transparent',

  // Barra de pestañas (noche)
  tabActive: palette.yellow,
  tabInactive: alpha(palette.white, 0.66),
  tabBackground: palette.navy,
} as const;

// ─── Typography ──────────────────────────────────────────────────────────────

const sizes = {
  /** Contadores dentro de insignias: lo único por debajo de `xs`. */
  micro: 10,
  xs: 12,
  badge: 12,
  sm: 13,
  base: 15,
  lg: 17,
  xl: 22,
  '2xl': 26,
  '3xl': 32,
  '4xl': 40,
} as const;

const weights = {
  regular: '400' as const,
  medium: '500' as const,
  semibold: '600' as const,
  bold: '700' as const,
  heavy: '800' as const,
};

export type FontSizeToken = keyof typeof sizes;
export type FontWeightToken = keyof typeof weights;

/**
 * Una familia por peso. Nunca se combina `fontFamily` con `fontWeight`: en Android,
 * `expo-font` registra cada fuente solo como NORMAL y un peso ≥ 700 caería a la
 * fuente del sistema (Roboto). Con un archivo por peso, la letra es exactamente esa.
 */
const fonts: Record<FontWeightToken, string> = {
  regular: 'Onest-Regular',
  medium: 'Onest-Medium',
  semibold: 'Onest-SemiBold',
  bold: 'Onest-Bold',
  heavy: 'Onest-ExtraBold',
};

/** Line heights are absolute pixels. Ratio drops as size grows. */
const lineHeights: Record<FontSizeToken, number> = {
  micro: 12,
  xs: 16,
  badge: 16,
  sm: 19,
  base: 22,
  lg: 24,
  xl: 28,
  '2xl': 32,
  '3xl': 38,
  '4xl': 46,
};

/** Negative tracking on display sizes. */
const tracking = {
  tighter: -1,
  tight: -0.6,
  snug: -0.3,
  normal: 0,
  wide: 0.3,
  wider: 0.6,
  widest: 1.2,
} as const;

/**
 * Named text roles. `<Text variant="…">` maps straight onto these. Pocos tamaños y
 * muy separados: la jerarquía la da la escala, no la negrita. Lo grande va en
 * semibold, nunca en heavy; solo lo que debe resaltar lleva peso.
 */
const presets = {
  /** Cifras monumentales (montos, PIN) */
  display: { size: '4xl', weight: 'semibold', tracking: 'tighter' },
  /** Título de pestaña y de portada */
  title: { size: '3xl', weight: 'semibold', tracking: 'tighter' },
  /** Título de detalle, paso de asistente y hoja */
  heading: { size: 'xl', weight: 'semibold', tracking: 'tight' },
  /** Título de tarjeta */
  subheading: { size: 'lg', weight: 'semibold', tracking: 'snug' },
  /** Cuerpo */
  body: { size: 'base', weight: 'regular', tracking: 'normal' },
  /** Cuerpo enfatizado */
  bodyStrong: { size: 'base', weight: 'semibold', tracking: 'normal' },
  /** Texto de apoyo */
  secondary: { size: 'sm', weight: 'regular', tracking: 'normal' },
  /** Etiquetas de formulario y texto fuerte pequeño */
  label: { size: 'sm', weight: 'medium', tracking: 'normal' },
  /** Metadatos, fechas */
  caption: { size: 'xs', weight: 'regular', tracking: 'normal' },
  /** Título de sección, encima de su tarjeta */
  overline: { size: 'lg', weight: 'semibold', tracking: 'snug' },
  /** Texto dentro de botones */
  button: { size: 'base', weight: 'semibold', tracking: 'normal' },
} as const;

export type TextVariant = keyof typeof presets;

export const Typography = {
  fonts,
  weights,
  sizes,
  lineHeights,
  tracking,
  presets,
} as const;

// ─── Spacing ─────────────────────────────────────────────────────────────────

/** Margin / padding / gap only. For component dimensions use `Sizes`. */
export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 24,
  '3xl': 32,
  '4xl': 40,
  '5xl': 48,
} as const;

// ─── Sizes ───────────────────────────────────────────────────────────────────

/**
 * Component dimensions. Kept apart from `Spacing` so that changing the layout
 * rhythm never silently resizes controls (and vice versa).
 */
export const Sizes = {
  /** Interactive control heights (inputs, buttons, pills) */
  control: {
    sm: 40,
    md: 48,
    lg: 56,
    xl: 64,
  },
  /** Icon glyph sizes */
  icon: {
    xs: 12,
    sm: 16,
    md: 20,
    lg: 24,
    xl: 28,
    '2xl': 36,
  },
  /** Square icon containers / circular chips */
  iconBox: {
    sm: 32,
    md: 40,
    lg: 44,
    xl: 56,
    '2xl': 88,
  },
  avatar: {
    sm: 40,
    md: 56,
    lg: 92,
  },
  /** Minimum accessible touch target (WCAG 2.5.5 / iOS HIG) */
  touchTarget: 44,
  /** Extra press area granted to visually small controls */
  hitSlop: { top: 8, bottom: 8, left: 8, right: 8 },
  /** Divider / hairline thickness */
  hairline: 1,
  borderStrong: 1.5,
  /** Selected outline of a selectable card / option */
  borderSelected: 2,
  /** Cuadrito redondeado con el icono de una fila o de un selector */
  tile: { sm: 36, md: 44, lg: 56 },
  /** Status badge heights */
  badge: { sm: 24, md: 28 },
  /** Numeric counter pill (tab bar, bell, segmented control) */
  counter: 18,
  /** Punto de una insignia */
  dot: 6,
} as const;

// ─── Radius ──────────────────────────────────────────────────────────────────

/**
 * xs 6 · sm 10 · md 16 · lg 20 · xl 24 · 2xl 28 · 3xl 36 · full 999.
 * Por rol: botón y chip `full`; campo y bloque interno `md`; cuadrito `md`;
 * tarjeta `xl`; hoja y portada `3xl`.
 */
export const Radius = tokens.radio;

// ─── Shadows ─────────────────────────────────────────────────────────────────

/**
 * Sombras en `boxShadow` (mismo resultado en iOS, Android y web), teñidas de noche:
 * una sombra gris sobre un fondo azulado se ve sucia. Dos capas: una cerca que
 * asienta y una lejos que da aire.
 */
const tinta = (a: number) => alpha(palette.navy, a);

export const Shadows = {
  /** Apenas separa: pastilla del segmentado, chips */
  subtle: { boxShadow: `0px 1px 2px ${tinta(0.08)}, 0px 2px 6px ${tinta(0.05)}` },
  /** Tarjeta sobre `canvas` */
  card: { boxShadow: `0px 1px 2px ${tinta(0.04)}, 0px 8px 24px ${tinta(0.06)}` },
  /** Tarjeta protagonista (buscador, pase) */
  raised: { boxShadow: `0px 2px 4px ${tinta(0.04)}, 0px 18px 40px ${tinta(0.11)}` },
  /** Elementos flotantes */
  elevated: { boxShadow: `0px 4px 10px ${tinta(0.08)}, 0px 16px 32px ${tinta(0.14)}` },
  /** Hojas */
  overlay: { boxShadow: `0px -8px 40px ${tinta(0.16)}` },
  /** Muelle inferior: separa sin ensuciar las tarjetas blancas que pasan por debajo */
  dock: { boxShadow: `0px -6px 24px ${tinta(0.08)}` },
  /** Barra de pestañas */
  tabBar: { boxShadow: `0px 6px 14px ${tinta(0.18)}, 0px 18px 40px ${tinta(0.28)}` },
  /** Botón principal: el sol ilumina lo que tiene debajo */
  sun: {
    boxShadow: `0px 1px 2px ${alpha(palette.yellowDeep, 0.3)}, 0px 10px 22px ${alpha(palette.yellowDeep, 0.32)}`,
  },
  /** Elemento elegido en azul */
  sky: { boxShadow: `0px 6px 16px ${alpha(palette.blueDark, 0.32)}` },
  /** Elemento coral */
  coral: { boxShadow: `0px 8px 20px ${alpha(palette.coralDeepFill, 0.3)}` },
} as const;

// ─── Gradients ───────────────────────────────────────────────────────────────

/**
 * Tuplas para `LinearGradient`. El cielo y la atmósfera con radiales viven en
 * `Atmosfera` (react-native-svg), con estos mismos colores.
 */
export const Gradients = {
  /** Acción principal: sol de arriba hacia abajo */
  sun: [palette.yellowLight, palette.yellow, palette.yellowDeep] as const,
  /** Cuadrito de marca */
  sunSoft: [palette.yellowSoft, palette.yellowTint] as const,
  /** Selección fuerte */
  sky: [palette.blue, palette.blueDark] as const,
  skySoft: [palette.blueSoft, palette.blueTint] as const,
  /** Encomiendas */
  coral: [palette.coralLight, palette.coralDeepFill] as const,
  coralSoft: [palette.coralSoft, alpha(palette.coralLight, 0.35)] as const,
  /** Superficie noche con relieve */
  night: [palette.navyRaised, palette.navy] as const,
  /** Éxito */
  mint: [palette.greenSoft, alpha(palette.green, 0.22)] as const,
  /** Deja pasar el contenido bajo una barra flotante */
  fadeToBackground: [
    alpha(palette.canvas, 0),
    alpha(palette.canvas, 0.92),
    palette.canvas,
  ] as const,
} as const;

/** Colores crudos de la atmósfera (radiales en `Atmosfera`). */
export const Cielo = {
  horizonte: palette.skyHaze,
  azul: palette.blueBright,
  azulProfundo: palette.blue,
  /** Casi blanco: por donde el azul pasa al amarillo sin ensuciarse */
  albaBlanca: palette.dawnWhite,
  alba: palette.dawn,
  rubor: palette.blush,
  sol: palette.yellow,
  solClaro: palette.yellowLight,
  coral: palette.coral,
  coralClaro: palette.coralLight,
  fondo: palette.canvas,
  noche: palette.navy,
  nocheAlta: palette.navyRaised,
  nocheAzul: palette.navyBlue,
} as const;

// ─── Motion ──────────────────────────────────────────────────────────────────

/**
 * Every animation in the app reads its timing from here.
 *
 * Rules of thumb applied throughout:
 *   - Entry animations are slower than exits (exits must feel instant).
 *   - Only `opacity` and `transform` are animated — never layout properties.
 *   - Press feedback is `fast`; screen/content transitions are `base`.
 */
export const Motion = {
  /**
   * From shared/tokens.json → movimiento.duration:
   *   instant 110 — press feedback release
   *   fast    160 — press-in, toggles, micro-interactions
   *   base    240 — default: content entering, indicators sliding
   *   slow    340 — screen-level entrances, larger surfaces
   *   slower  520 — hero / staged reveals
   *   ambient 800 — looping ambient pulses
   */
  duration: tokens.movimiento.duration,

  easing: {
    /** Decelerate — the default for anything entering */
    out: Easing.out(Easing.cubic),
    /** Accelerate — for anything leaving */
    in: Easing.in(Easing.cubic),
    /** Symmetric — loops and reversible states */
    inOut: Easing.inOut(Easing.ease),
  },

  spring: {
    /** Crisp, minimal overshoot — indicators, toasts */
    snappy: { damping: 18, stiffness: 220 },
    /** Gentle settle — sheets, cards */
    soft: { damping: 22, stiffness: 160 },
    /** Playful overshoot — selection confirmations, stars */
    bouncy: { damping: 11, stiffness: 260 },
  },

  /** List entrance stagger */
  stagger: {
    step: 45,
    /** Items past this index all share the same delay */
    maxIndex: 7,
  },

  /** Press scale factors — never go below 0.92 on large surfaces */
  press: {
    card: 0.98,
    button: 0.97,
    chip: 0.94,
    icon: 0.9,
  },
} as const;

// ─── Layout ──────────────────────────────────────────────────────────────────

/**
 * Screen chrome. The floating tab bar is absolutely positioned, so every
 * scrollable screen must reserve `Layout.scrollBottomInset` at the bottom and
 * every floating action bar must sit at `Layout.floatingBarBottom`.
 */
/** Altura de la barra de pestañas flotante. */
const TAB_BAR_HEIGHT = 68;
const TAB_BAR_OFFSET = Spacing.xl;

export const Layout = {
  /** Horizontal gutter for all screen content */
  screenPadding: Spacing.xl,
  /** Tighter gutter used by the home hero */
  screenPaddingCompact: Spacing.lg,
  /** Vertical padding above a screen header */
  headerPaddingTop: Spacing.md,
  headerPaddingBottom: Spacing.md,
  /** Separación entre secciones de una pantalla */
  sectionGap: Spacing['3xl'],

  tabBar: {
    height: TAB_BAR_HEIGHT,
    /** Distance from the bottom safe-area inset */
    bottomOffset: TAB_BAR_OFFSET,
    /** Left/right inset of the floating pill */
    sideInset: Spacing.xl,
    /** Inner padding around the sliding indicator */
    innerPadding: 6,
    /** Tab label size */
    labelSize: sizes.xs,
  },

  /**
   * Bottom padding for lists/scrollviews on tabbed screens: despeja la barra y deja
   * margen para el área segura del teléfono (la barra de gestos o de botones).
   */
  scrollBottomInset: TAB_BAR_HEIGHT + TAB_BAR_OFFSET + Spacing['5xl'] + Spacing['2xl'],
  /** Bottom padding for lists on non-tabbed (stacked) screens */
  scrollBottomInsetPlain: Spacing['5xl'],
  /** Where a floating CTA bar sits above the tab bar */
  floatingBarBottom: TAB_BAR_HEIGHT + TAB_BAR_OFFSET + Spacing.md,

  /** Max width for centred modal cards */
  modalMaxWidth: 360,
  /** Bottom sheet height cap as a fraction of the screen */
  sheetMaxHeight: '85%',
} as const;

// ─── Opacity ─────────────────────────────────────────────────────────────────

export const Opacity = {
  disabled: 0.4,
  /** Disabled but still legible (read-only content) */
  dimmed: 0.6,
  /** Secondary content inside an active surface */
  muted: 0.8,
  full: 1,
} as const;

// ─── Status palette ──────────────────────────────────────────────────────────

/**
 * The single mapping from a semantic tone to its badge/banner colours.
 * `getEstadoVisual` in `src/utils/estados.ts` resolves a domain state to a tone;
 * this turns a tone into pixels. Nothing else should pick status colours.
 */
export type StatusTone = 'neutral' | 'pending' | 'progress' | 'success' | 'danger' | 'done' | 'brand';

export const StatusPalette: Record<
  StatusTone,
  {
    /** Vivid tone colour — icons, dots, accents. Not for text. */
    fg: string;
    /** Dark foreground for labels on `bg` (≥ 6:1, neutral 4.7:1) */
    text: string;
    bg: string;
    border: string;
  }
> = {
  /** Anulado o inactivo (cancelado): contorno, fondo blanco. */
  neutral: {
    fg: Colors.placeholder,
    text: Colors.mutedForeground,
    bg: Colors.surface,
    border: Colors.borderControl,
  },
  /** Terminado sin incidencia (viaje realizado, vencido, devuelta): relleno sólido. */
  done: {
    fg: Colors.mutedForeground,
    text: Colors.foreground,
    bg: Colors.surfaceDark,
    border: Colors.surfaceDark,
  },
  pending: {
    fg: Colors.warning,
    text: palette.amberDeep,
    bg: Colors.warningLight,
    border: alpha(palette.amber, 0.25),
  },
  progress: {
    fg: Colors.accentStrong,
    text: palette.blueDeep,
    bg: Colors.infoLight,
    border: alpha(palette.blueDark, 0.2),
  },
  success: {
    fg: Colors.success,
    text: palette.greenDeep,
    bg: Colors.successLight,
    border: alpha(palette.green, 0.25),
  },
  danger: {
    fg: Colors.destructive,
    text: palette.redDeep,
    bg: Colors.destructiveLight,
    border: alpha(palette.red, 0.25),
  },
  brand: {
    fg: Colors.secondary,
    text: palette.coralDeep,
    bg: Colors.secondaryLight,
    border: Colors.secondaryBorder,
  },
};
