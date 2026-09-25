/**
 * Wedding Yantra design tokens: "Sunburst", the PhotoLancer design system.
 *
 * White body, orange as the sunrise. Pages and cards are white; the saffron-to-gold
 * gradient is kept for the few things that matter (the logo, the main button, the active
 * menu item, small icon tiles, progress). The golden-hour glow only appears on the
 * sign-in style pages.
 *
 * The web app turns these into Tailwind classes (`bg-surface`, `text-ink-muted`,
 * `bg-gradient-primary`, `shadow-soft`, ...). The mobile app will import the same object
 * for React Native styles; gradients are given as colour stops for that reason.
 */

/** The warm orange scale. 600 is the brand colour. */
export const sun = {
  50: "#FFF8EE",
  100: "#FFEFD6",
  200: "#FFD874",
  300: "#FFC02E",
  400: "#FF9E22",
  500: "#FF8A2B",
  600: "#FF6A00",
  700: "#E85C00",
  800: "#C9430A",
} as const;

export const colors = {
  /** Pages, cards, sheets, inputs */
  surface: "#FFFFFF",
  /** Quiet warm fill: hovered rows, chips, icon squares */
  cream: sun[50],
  /** Borders and dividers */
  line: "#F1E6D2",
  "line-strong": "#E6D5B8",

  /** Main text: a deep warm brown, softer than black */
  ink: "#241803",
  /** Secondary text */
  "ink-muted": "#7C6A45",
  /** Hints, placeholders */
  "ink-subtle": "#B3A284",

  /** Brand saffron, for text links, icons and selected borders */
  brand: sun[600],
  "brand-strong": sun[700],
  "brand-deep": sun[800],
  /** Soft brand fill */
  "brand-soft": sun[100],
  /** Text on the gradient or on brand colour */
  "on-brand": "#FFFFFF",

  /** Money received, done */
  success: "#0E9C6C",
  "success-soft": "#E6F6EF",
  /** A live / online dot */
  live: "#21C36B",
  /** Money due, errors, destructive actions */
  danger: sun[800],
  "danger-soft": "#FDEEE6",
  /** Needs attention soon */
  warning: "#B45309",
  "warning-soft": "#FFF4DC",
} as const;

/** Gradients as colour stops, so both CSS and React Native can draw them. */
export const gradients = {
  /** Buttons, logo tile, active menu item, icon tiles, progress */
  primary: { angle: 135, stops: ["#FF7A1A", "#FFB020"] },
  /** Gradient words in a heading */
  text: { angle: 135, stops: ["#FF7A1A", "#FFC02E", "#FFAE1F"] },
} as const;

/**
 * The golden-hour glow behind sign-in style pages: a sunrise in the top-right corner
 * fading into cream, then white.
 */
export const heroGlow = {
  sun: { x: "78%", y: "-12%", width: 1100, height: 720, stops: ["#FFD24D", "#FFAE1F", "#FF7A12"] },
  base: ["#FFF8EE", "#FFFFFF"],
} as const;

/** Warm shadows: cards never cast grey shadows. */
export const shadows = {
  soft: "0 10px 26px rgba(150, 90, 20, 0.14)",
  warm: "0 22px 50px rgba(255, 120, 20, 0.2)",
  glow: "0 0 0 4px rgba(255, 138, 43, 0.14)",
} as const;

/** Corner radius in px. Cards use 3xl, buttons and inputs xl. */
export const radius = {
  sm: 8,
  md: 10,
  lg: 13,
  xl: 15,
  "2xl": 20,
  "3xl": 24,
  "4xl": 32,
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
  /** Headings, bold and confident */
  display: "Bricolage Grotesque",
  /** Interface text and numbers */
  sans: "Plus Jakarta Sans",
} as const;

export const tokens = { sun, colors, gradients, heroGlow, shadows, radius, fontSize, space, touchTarget, fonts } as const;
export type Tokens = typeof tokens;
