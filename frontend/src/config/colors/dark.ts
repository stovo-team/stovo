/**
 * Dark-theme color constants used in JS/TSX.
 *
 * ── Rule of thumb ──────────────────────────────────────────────────────────
 * If a color is used as a CSS custom property in styles.css, keep it there.
 * If it appears hardcoded inside a .tsx file (inline style, default value,
 * or JS-side calculation), it belongs here.
 *
 * When a light theme is added: create colors/light.ts and swap the import
 * in colors/index.ts.
 */

export const colors = {
  // ── Accent seeds (JS defaults — mirrors the CSS variables) ────────────────
  accent: {
    /** Default accent — Telegram blue */
    blue: "#2aabee",
    green: "#15946f",
    purple: "#8b5cf6",
    rose: "#f43f5e",
    amber: "#f59e0b",
  },

  // ── Avatar ────────────────────────────────────────────────────────────────
  avatar: {
    /** Default avatar background when no custom color is set */
    defaultBg: "#0ea5e9",
  },

  // ── Accent mix base (used in AppearanceContext custom-accent calculations) ─
  mix: {
    /** Dark background base for custom accent soft mix */
    darkBase: "#0f172a",
  },

  // ── Semantic ──────────────────────────────────────────────────────────────
  semantic: {
    danger: "#ef4444",
    dangerSoft: "#ca2727",
    dangerText: "#ffffff",
    success: "#22c55e",
    successSoft: "#13ea84",
    warning: "#f59e0b",
  },

  // ── AMOLED / island surfaces (used inline in native overlays) ─────────────
  surface: {
    amoled: "#000000",
    island: "#1c1c1e",
    islandRaised: "#2c2c2e",
  },
} as const;

export type AppColors = typeof colors;
