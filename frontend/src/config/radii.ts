/**
 * Border-radius constants used in JS/TSX.
 *
 * These are the numeric (px) values that feed into AppearanceContext logic
 * and any inline styles. The CSS counterparts (--radius-bubble, etc.) are
 * kept in sync via AppearanceContext.
 */

export const radii = {
  // ── Chat bubble ──────────────────────────────────────────────────────────
  bubble: {
    /** Default (rounded preset) */
    default: 18,
    /** Soft preset */
    soft: 12,
    /** Square preset */
    square: 6,
    /** Minimum value allowed by the slider */
    min: 4,
    /** Maximum value allowed by the slider */
    max: 24,
    /** Threshold: radius ≤ this → "square" shape label */
    squareThreshold: 8,
    /** Threshold: radius ≤ this → "soft" shape label */
    softThreshold: 14,
  },

  // ── UI controls ───────────────────────────────────────────────────────────
  control: 8,
  card: 8,

  // ── Floating panels & overlays ────────────────────────────────────────────
  float: {
    panel: 24,
    bubble: 20,
    /** Full pill — effectively infinite */
    pill: 999,
    mobileGlass: 26,
    mobileGlassInner: 18,
  },
} as const;

export type AppRadii = typeof radii;
