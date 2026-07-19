/**
 * EnBus Design System — Brand Manual Tokens
 *
 * Single source of truth for all visual constants.
 * Every screen and component imports from here.
 *
 * Palette:
 *   Primary   #FFC757  (warm yellow)
 *   Secondary #FF7648  (coral orange)
 *   Accent    #4A7FF8  (vibrant blue)
 *   Surface   #F0EFEB  (warm beige)
 *   Text      #202020  (soft black)
 *   White     #FFFFFF
 */

// ─── Colors ──────────────────────────────────────────────────────────────────

export const Colors = {
  // Brand
  primary: '#FFC757',
  primaryLight: 'rgba(255, 199, 87, 0.15)',
  primaryForeground: '#202020',

  secondary: '#FF7648',
  secondaryLight: 'rgba(255, 118, 72, 0.12)',
  secondaryForeground: '#FFFFFF',

  accent: '#4A7FF8',
  accentLight: 'rgba(74, 127, 248, 0.12)',
  accentForeground: '#FFFFFF',

  // Surfaces
  background: '#FFFFFF',
  surface: '#F0EFEB',
  surfaceDark: '#E8E6E1',
  card: '#FFFFFF',

  // Text
  foreground: '#202020',
  mutedForeground: '#8A8A8A',

  // Semantic
  success: '#22c55e',
  successLight: '#dcfce7',
  warning: '#f59e0b',
  warningLight: '#fef3c7',
  info: '#3b82f6',
  infoLight: '#dbeafe',
  destructive: '#dc2626',
  destructiveLight: '#fee2e2',

  // Borders
  border: '#E8E6E1',
  borderLight: '#F0EFEB',

  // Misc
  white: '#FFFFFF',
  black: '#202020',
  transparent: 'transparent',

  // Tab bar specific
  tabActive: '#4A7FF8',
  tabInactive: '#8A8A8A',
  tabBackground: '#FFFFFF',
} as const;

// ─── Typography ──────────────────────────────────────────────────────────────

export const Typography = {
  /** Variable font — use fontWeight to select axis instances */
  family: 'Roobert',

  weights: {
    regular: '400' as const,
    medium: '500' as const,
    semibold: '600' as const,
    bold: '700' as const,
    heavy: '800' as const,
  },

  sizes: {
    xs: 11,
    sm: 13,
    base: 15,
    lg: 17,
    xl: 20,
    '2xl': 24,
    '3xl': 30,
    '4xl': 36,
  },
} as const;

// ─── Spacing ─────────────────────────────────────────────────────────────────

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

// ─── Radius ──────────────────────────────────────────────────────────────────

export const Radius = {
  sm: 10,
  md: 16,
  lg: 20,
  xl: 24,
  '2xl': 28,
  full: 999,
} as const;

// ─── Shadows ─────────────────────────────────────────────────────────────────

export const Shadows = {
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
  /** Ambient background glow */
  ambientGlow: [
    'rgba(255, 199, 87, 0.22)',
    'rgba(255, 118, 72, 0.10)',
    'rgba(255, 255, 255, 1.0)',
  ] as const,
  /** Subtle surface gradient for cards */
  surfaceSubtle: ['#FFFFFF', '#F0EFEB'] as const,
} as const;
