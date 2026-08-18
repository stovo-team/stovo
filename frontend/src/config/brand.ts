/**
 * Brand identity — app name, logo, and tagline.
 * Kept separate from strings so a rebrand never touches translation files.
 */

export const brand = {
  /** The app name used everywhere (title, headings, logo alt text). */
  name: "Stovo",

  /** SVG <title> attribute on the VeloLogo component. */
  logoTitle: "Stovo",

  /**
   * Marketing tagline — empty by default, ready to set.
   * @example "Your private family space"
   */
  tagline: "",

  /**
   * Deep-link scheme used for native app links.
   * @example "stovo://invite/TOKEN"
   */
  deepLinkScheme: "stovo",
} as const;

export type AppBrand = typeof brand;
