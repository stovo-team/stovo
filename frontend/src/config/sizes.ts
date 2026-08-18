/**
 * Pixel sizes and numeric limits used in JS/TSX.
 *
 * Icon sizes, input constraints, scale clamp ranges — anything that is a
 * plain number hardcoded inside a component.
 */

export const sizes = {
  // ── Icon sizes (passed as `size` prop to lucide-react icons) ─────────────
  icon: {
    /** Small icons — password eye, palette swatch icon */
    sm: 15,
    /** Default small icon — password eye, invite smartphone */
    md: 18,
    /** Standard UI icon — chevrons, nav icons */
    lg: 20,
    /** Back-button chevron */
    xl: 22,
    /** Profile / display-name icons */
    xxl: 21,
    /** Reset button icon */
    reset: 16,
  },

  // ── Input constraints ─────────────────────────────────────────────────────
  input: {
    /** OTP / device verification code length */
    otpLength: 6,
    /** Minimum nickname length */
    nicknameMinLength: 3,
    /** Minimum password length */
    passwordMinLength: 8,
    /** Maximum display name / family name length */
    displayNameMaxLength: 255,
    /** Maximum bio length */
    bioMaxLength: 500,
  },

  // ── Message scale range ───────────────────────────────────────────────────
  messageScale: {
    min: 0.9,
    max: 1.18,
    step: 0.02,
    default: 1,
  },

  // ── FAB / nav ─────────────────────────────────────────────────────────────
  fab: {
    size: 56,
    offsetRight: 20,
  },

  nav: {
    pillHeight: 64,
    railWidth: 88,
  },

  // ── Floating panels ───────────────────────────────────────────────────────
  float: {
    outerGap: 16,
    panelGap: 16,
  },

  // ── Server connection timeout (ms) ────────────────────────────────────────
  serverTimeoutMs: 8000,
} as const;

export type AppSizes = typeof sizes;
