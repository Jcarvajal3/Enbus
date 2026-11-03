/**
 * EnBus Design System — Brand Manual Tokens
 *
 * Single source of truth for all visual constants.
 * Every screen and component imports from here. Nothing visual should be a
 * literal number or colour in a screen file.
 *
 * Palette:
 *   Primary   #FFC757  (warm yellow)
 *   Secondary #FF7648  (coral orange)
 *   Accent    #4A7FF8  (vibrant blue)
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

// ─── Palette (raw values — prefer the semantic Colors below) ─────────────────

const palette = {
  yellow: '#FFC757',
  coral: '#FF7648',
  blue: '#4A7FF8',
  /** Darker blue for white text on blue (5.7:1) */
  blueDark: '#2F5FD0',
  beige: '#F0EFEB',
  beigeDark: '#E8E6E1',
  ink: '#202020',
  grey: '#8A8A8A',
  /** Text grey: 5.7:1 on white, 5.0:1 on surface, 4.6:1 on surfaceDark */
  greyText: '#666666',
  white: '#FFFFFF',
  green: '#22c55e',
  greenSoft: '#dcfce7',
  amber: '#f59e0b',
  amberSoft: '#fef3c7',
  sky: '#3b82f6',
  skySoft: '#dbeafe',
  red: '#dc2626',
  redSoft: '#fee2e2',

  // Text-safe darks — ≥ 4.5:1 on white, surface and surfaceDark
  amberText: '#8A5A00',
  greenText: '#147638',
  orangeText: '#A34B08',
  blueText: '#1D4ED8',
  redText: '#B91C1C',

  // Badge foregrounds — ≥ 6:1 on their matching *Soft background
  amberDeep: '#92400E',
  greenDeep: '#166534',
  blueDeep: '#1E40AF',
  redDeep: '#991B1B',
  coralDeep: '#9A3412',
} as const;

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

  accent: palette.blue,
  accentLight: alpha(palette.blue, 0.12),
  accentBorder: alpha(palette.blue, 0.22),
  accentForeground: palette.white,
  /** Accent at rest inside a disabled CTA */
  accentMuted: alpha(palette.blue, 0.35),

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

  // Overlays (modals, bottom sheets)
  scrim: alpha('#000000', 0.4),
  scrimStrong: alpha('#000000', 0.55),

  // Misc
  white: palette.white,
  black: palette.ink,
  transparent: 'transparent',

  // Tab bar specific
  /** Active pill behind the white label/icon (5.7:1) */
  tabActive: palette.blueDark,
  /** Inactive label/icon on the beige bar (5.0:1) */
  tabInactive: palette.greyText,
  tabBackground: palette.white,
} as const;

// ─── Typography ──────────────────────────────────────────────────────────────

const sizes = {
  /** Counters inside badges — the only size below `xs` */
  micro: 9,
  xs: 11,
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
  /** Screen title (Mis Viajes, Mis Paquetes) */
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
  /** Uppercase eyebrow above a value or section */
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
} as const;

// ─── Radius ──────────────────────────────────────────────────────────────────

export const Radius = {
  xs: 6,
  sm: 10,
  md: 16,
  lg: 20,
  xl: 24,
  '2xl': 28,
  '3xl': 36,
  full: 999,
} as const;

// ─── Shadows ─────────────────────────────────────────────────────────────────

export const Shadows = {
  /** Barely-there separation — use on surfaces already tinted */
  subtle: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 1,
  },
  /** Subtle card elevation */
  card: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 3,
  },
  /** Floating elements (FABs, tab bars) */
  elevated: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 8,
  },
  /** Modals and bottom sheets */
  overlay: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
    elevation: 16,
  },
  /** Colored glow behind CTAs */
  glow: (color: string) => ({
    shadowColor: color,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 14,
    elevation: 6,
  }),
  /** Tab bar floating shadow */
  tabBar: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
    elevation: 12,
  },
} as const;

// ─── Gradients ───────────────────────────────────────────────────────────────

export const Gradients = {
  /** Hero gradient: warm yellow → coral */
  warm: ['#FFC757', '#FF7648'] as const,
  /** Accent CTA gradient — subtle depth on the blue */
  accent: ['#5C8DFA', '#4A7FF8'] as const,
  /** Ambient background glow */
  ambientGlow: [
    alpha(palette.yellow, 0.22),
    alpha(palette.coral, 0.1),
    palette.white,
  ] as const,
  /** Subtle surface gradient for cards */
  surfaceSubtle: ['#FFFFFF', '#F0EFEB'] as const,
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
  duration: {
    /** Press feedback release */
    instant: 110,
    /** Press-in, toggles, micro-interactions */
    fast: 160,
    /** Default: content entering, indicators sliding */
    base: 240,
    /** Screen-level entrances, larger surfaces */
    slow: 340,
    /** Hero / staged reveals */
    slower: 520,
    /** Looping ambient pulses */
    ambient: 800,
  },

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
export const Layout = {
  /** Horizontal gutter for all screen content */
  screenPadding: Spacing['2xl'],
  /** Tighter gutter used by the home hero */
  screenPaddingCompact: Spacing.lg,
  /** Vertical padding above a screen header */
  headerPaddingTop: Spacing.lg,
  headerPaddingBottom: Spacing.md,

  tabBar: {
    height: 70,
    /** Distance from the bottom safe-area inset */
    bottomOffset: Spacing['2xl'],
    /** Left/right inset of the floating pill */
    sideInset: Spacing.xl,
    /** Inner padding around the sliding indicator */
    innerPadding: 6,
    /** Tab label size — 12pt, one step above `xs` so labels read outdoors */
    labelSize: 12,
  },

  /** Bottom padding for lists/scrollviews on tabbed screens (clears the bar) */
  scrollBottomInset: 70 + Spacing['2xl'] + Spacing['3xl'], // 126
  /** Bottom padding for lists on non-tabbed (stacked) screens */
  scrollBottomInsetPlain: Spacing['5xl'],
  /** Where a floating CTA bar sits above the tab bar */
  floatingBarBottom: 70 + Spacing['2xl'] + Spacing.lg, // 110

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
export type StatusTone = 'neutral' | 'pending' | 'progress' | 'success' | 'danger' | 'brand';

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
  neutral: {
    fg: Colors.mutedForeground,
    text: Colors.mutedForeground,
    bg: Colors.neutralLight,
    border: alpha(palette.grey, 0.2),
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
