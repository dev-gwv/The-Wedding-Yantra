/**
 * Wedding Yantra design tokens: "Marigold & Ivory".
 *
 * Warm ivory background, white cards, charcoal text, one marigold accent for actions.
 * Green means money in, red means money due or danger. Gold is used sparingly.
 *
 * The web app turns these into Tailwind classes (`bg-brand`, `text-ink-muted`, ...).
 * The mobile app will import the same object for React Native styles.
 */

export const colors = {
  /** Page background */
  ivory: "#FAF7F2",
  /** Cards, sheets, inputs */
  surface: "#FFFFFF",
  /** Quiet fills: hovered rows, secondary buttons */
  "surface-muted": "#F4EFE7",
  /** Borders and dividers */
  line: "#E7E2DA",
  "line-strong": "#D6CFC4",

  /** Main text */
  ink: "#1C1917",
  /** Secondary text */
  "ink-muted": "#6F6862",
  /** Hints, placeholders */
  "ink-subtle": "#A39D96",

  /** Marigold: the one colour for primary actions */
  brand: "#C2410C",
  "brand-strong": "#9A3412",
  "brand-soft": "#FFF1E8",
  "on-brand": "#FFFFFF",

  /** Money received, done */
  success: "#15803D",
  "success-soft": "#EAF7EE",
  /** Money due, errors, destructive actions */
  danger: "#B91C1C",
  "danger-soft": "#FDF0F0",
  /** Needs attention soon */
  warning: "#B45309",
  "warning-soft": "#FEF6E7",
  /** Premium touches only: plan badges, headings on client documents */
  gold: "#B8860B",
} as const;

/** Corner radius in px. */
export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
} as const;

/** Font size and line height in px. */
export const fontSize = {
  xs: [12, 16],
  sm: [14, 20],
  base: [16, 24],
  lg: [18, 26],
  xl: [20, 28],
  "2xl": [24, 32],
  "3xl": [30, 38],
} as const;

/** Spacing unit in px. Every gap is a multiple of this. */
export const space = 4;

/** Minimum size of anything tappable, in px. */
export const touchTarget = 44;

export const fonts = {
  /** Interface text and numbers */
  sans: "Inter",
  /** Large headings and client-facing documents */
  display: "Fraunces",
} as const;

export const tokens = { colors, radius, fontSize, space, touchTarget, fonts } as const;
export type Tokens = typeof tokens;
