/**
 * EnBus Design System — Brand Manual Tokens
 *
 * Every screen and component imports from here. Nothing visual should be a
 * literal number or colour in a screen file (lint: no hex/rgba outside this file).
 *
 * Colours, radii and motion durations come from `shared/tokens.json` (the same
 * source as the panel and the landing) through `./tokens.generated.ts`, which
 * `node shared/generar.mjs` writes. Edit the JSON, never the generated file.
 *
 * Palette:
 *   Primary   #FFC757  (warm yellow)
 *   Secondary #FF7648  (coral orange)
 *   Accent    #4A7FF8  (vibrant blue — tints, dots and borders only)
 *   Accent strong #2F5FD0 (selection and active state with white text, 5.7:1)
 *   Surface   #F0EFEB  (warm beige)
 *   Text      #202020  (soft black)
 *   White     #FFFFFF
 *
 * Accessibility rule: the vivid brand/semantic colours are for surfaces,
 * borders and icons only. Text always uses `foreground`, `mutedForeground` or
 * one of the `*Text` tokens — all ≥ 4.5:1 on white, `surface` and `surfaceDark`.
 *
 * Token groups:
 *   Colors      — palette + semantic roles
 *   Typography  — family, sizes, weights, line heights, tracking, presets
 *   Spacing     — the 4pt rhythm used for margin/padding/gap ONLY
 *   Sizes       — component dimensions (heights, icons, avatars) — never Spacing
 *   Radius      — corner scale
 *   Shadows     — elevation
 *   Gradients   — brand gradients
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

// ─── Palette ─────────────────────────────────────────────────────────────────
// Raw values (prefer the semantic Colors below) live in shared/tokens.json →
// `palette` in ./tokens.generated.ts: yellow, coral, blue, blueDark, beige, ink,
// grey, greyText, white, black, *Soft, *Text (≥ 4.5:1) and *Deep (≥ 6:1 on *Soft).

// ─── Colors ──────────────────────────────────────────────────────────────────

export const Colors = {
  // Brand
  primary: palette.yellow,
  primaryLight: alpha(palette.yellow, 0.15),
  primaryBorder: alpha(palette.yellow, 0.25),
  primaryForeground: palette.ink,
  /** Brand amber legible as text. `primary` is never a text colour. */
  primaryText: palette.amberText,

  secondary: palette.coral,
  secondaryLight: alpha(palette.coral, 0.12),
  secondaryBorder: alpha(palette.coral, 0.22),
  secondaryForeground: palette.white,

  /** Vivid blue: tints, dots and borders. Never a fill behind white text (3.7:1). */
  accent: palette.blue,
  accentLight: alpha(palette.blue, 0.12),
  accentBorder: alpha(palette.blue, 0.22),
  accentForeground: palette.white,
  /** Accent at rest inside a disabled CTA */
  accentMuted: alpha(palette.blue, 0.35),
  /**
   * Selection and active state (D1): selected chip, seat, option, checkbox,
   * switch, focus ring, active tab, active counter. White text on it = 5.7:1.
   * `shared/tokens.json` → `accent-strong` (= `paleta.blue-dark`).
   */
  accentStrong: tokens.claro.accentStrong,
  accentStrongForeground: tokens.claro.accentStrongForeground,

  /** Links in running text and text buttons (≥ 4.5:1 on white and beige). */
  link: palette.blueText,

  // Surfaces
  background: palette.white,
  surface: palette.beige,
  surfaceDark: palette.beigeDark,
  card: palette.white,

  // Text
  foreground: palette.ink,
  mutedForeground: palette.greyText,
  /** Neutral tint for inert chips/badges */
  neutralLight: alpha(palette.grey, 0.12),

  // Semantic
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
  /** Tinted background + border for soft destructive buttons */
  destructiveSoft: alpha(palette.red, 0.07),
  destructiveBorder: alpha(palette.red, 0.22),

  // Borders
  border: palette.beigeDark,
  borderLight: palette.beige,
  /** Control borders that must read at ≥ 3:1 (inputs, checkboxes at rest) */
  borderStrong: palette.borderStrong,

  // Overlays (modals, bottom sheets)
  scrim: alpha(palette.black, 0.4),
  scrimStrong: alpha(palette.black, 0.55),

  // Misc
  white: palette.white,
  black: palette.ink,
  transparent: 'transparent',

  // Tab bar specific
  /** Active pill behind the white label/icon (5.7:1) — `accentStrong` */
  tabActive: tokens.claro.accentStrong,
  /** Inactive label/icon on the beige bar (5.0:1) */
  tabInactive: palette.greyText,
  tabBackground: palette.white,
} as const;

// ─── Typography ──────────────────────────────────────────────────────────────

const sizes = {
  /** Counters inside badges — the only size below `xs` */
  micro: 9,
  xs: 11,
  /** Status badges only (SY-23: 12 pt semibold in app and web) */
  badge: 12,
  sm: 13,
  base: 15,
  lg: 17,
  xl: 20,
  '2xl': 24,
  '3xl': 30,
  '4xl': 36,
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
 * Line heights are absolute pixels (React Native has no unitless lineHeight).
 * Ratio drops as size grows — the standard optical correction.
 */
const lineHeights: Record<FontSizeToken, number> = {
  micro: 12,
  xs: 15,
  badge: 16,
  sm: 18,
  base: 22,
  lg: 24,
  xl: 26,
  '2xl': 30,
  '3xl': 34,
  '4xl': 40,
};

/** Negative tracking on display sizes, positive on small caps. */
const tracking = {
  tight: -0.6,
  snug: -0.3,
  normal: 0,
  wide: 0.4,
  wider: 0.8,
  widest: 1.4,
} as const;

/**
 * Named text roles. `<Text variant="…">` maps straight onto these, so a screen
 * never has to spell out family/size/weight/lineHeight by hand.
 */
const presets = {
  /** Hero numbers and monumental figures */
  display: { size: '4xl', weight: 'heavy', tracking: 'tight' },
  /** Tab screen title (Mis boletos, Mis encomiendas) */
  title: { size: '3xl', weight: 'bold', tracking: 'tight' },
  /** Section / modal heading */
  heading: { size: 'xl', weight: 'bold', tracking: 'snug' },
  /** Card title */
  subheading: { size: 'lg', weight: 'bold', tracking: 'snug' },
  /** Default body copy */
  body: { size: 'base', weight: 'regular', tracking: 'normal' },
  /** Emphasised body */
  bodyStrong: { size: 'base', weight: 'semibold', tracking: 'normal' },
  /** Secondary / supporting copy */
  secondary: { size: 'sm', weight: 'regular', tracking: 'normal' },
  /** Form labels, inline strong small text */
  label: { size: 'sm', weight: 'semibold', tracking: 'normal' },
  /** Metadata, timestamps */
  caption: { size: 'xs', weight: 'medium', tracking: 'normal' },
  /** Uppercase section label — only inside `SectionLabel` (a noun, never a question) */
  overline: { size: 'xs', weight: 'bold', tracking: 'wider' },
  /** Text inside buttons */
  button: { size: 'base', weight: 'bold', tracking: 'wide' },
} as const;

export type TextVariant = keyof typeof presets;

export const Typography = {
  /** Variable font — use fontWeight to select axis instances */
  family: 'Roobert',
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
    sm: 38,
    md: 44,
    lg: 52,
    xl: 60,
  },
  /** Icon glyph sizes */
  icon: {
    xs: 12,
    sm: 14,
    md: 18,
    lg: 22,
    xl: 26,
    '2xl': 32,
  },
  /** Square icon containers / circular chips */
  iconBox: {
    sm: 30,
    md: 36,
    lg: 44,
    xl: 56,
    '2xl': 80,
  },
  avatar: {
    sm: 40,
    md: 56,
    lg: 88,
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
  /** Status badge heights (12 pt label, no icon) */
  badge: { sm: 22, md: 28 },
  /** Numeric counter pill (tab bar, bell, segmented control) */
  counter: 18,
} as const;

// ─── Radius ──────────────────────────────────────────────────────────────────

/** xs 6 · sm 10 · md 16 · lg 20 · xl 24 · 2xl 28 · 3xl 36 · full 999 (shared/tokens.json → radio) */
export const Radius = tokens.radio;

// ─── Shadows ─────────────────────────────────────────────────────────────────

export const Shadows = {
  /** Barely-there separation — use on surfaces already tinted */
  subtle: {
    shadowColor: palette.black,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 1,
  },
  /** Subtle card elevation */
  card: {
    shadowColor: palette.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 3,
  },
  /** Floating elements (FABs, tab bars) */
  elevated: {
    shadowColor: palette.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 8,
  },
  /** Modals and bottom sheets */
  overlay: {
    shadowColor: palette.black,
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
    elevation: 16,
  },
  /** Tab bar floating shadow */
  tabBar: {
    shadowColor: palette.black,
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
    elevation: 12,
  },
} as const;

// ─── Gradients ───────────────────────────────────────────────────────────────

export const Gradients = {
  /** Fade used to let content scroll out under a floating bar */
  fadeToBackground: [
    alpha(palette.white, 0),
    alpha(palette.white, 0.9),
    palette.white,
  ] as const,
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
const TAB_BAR_HEIGHT = 70;

export const Layout = {
  /** Horizontal gutter for all screen content */
  screenPadding: Spacing['2xl'],
  /** Tighter gutter used by the home hero */
  screenPaddingCompact: Spacing.lg,
  /** Vertical padding above a screen header */
  headerPaddingTop: Spacing.lg,
  headerPaddingBottom: Spacing.md,

  tabBar: {
    height: TAB_BAR_HEIGHT,
    /** Distance from the bottom safe-area inset */
    bottomOffset: Spacing['2xl'],
    /** Left/right inset of the floating pill */
    sideInset: Spacing.xl,
    /** Inner padding around the sliding indicator */
    innerPadding: 6,
    /** Tab label size — `xs` (11 pt) from the type scale (AU-47) */
    labelSize: sizes.xs,
  },

  /** Bottom padding for lists/scrollviews on tabbed screens (clears the bar) */
  scrollBottomInset: TAB_BAR_HEIGHT + Spacing['2xl'] + Spacing['3xl'], // 126
  /** Bottom padding for lists on non-tabbed (stacked) screens */
  scrollBottomInsetPlain: Spacing['5xl'],
  /** Where a floating CTA bar sits above the tab bar */
  floatingBarBottom: TAB_BAR_HEIGHT + Spacing['2xl'] + Spacing.lg, // 110

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
  /** Anulado o inactivo (cancelado): contorno, fondo blanco (SY-22). */
  neutral: {
    fg: Colors.mutedForeground,
    text: Colors.mutedForeground,
    bg: Colors.white,
    border: Colors.border,
  },
  /** Terminado sin incidencia (viaje realizado, vencido, devuelta): relleno sólido. */
  done: {
    fg: Colors.foreground,
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
    fg: Colors.info,
    text: palette.blueDeep,
    bg: Colors.infoLight,
    border: alpha(palette.sky, 0.25),
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
