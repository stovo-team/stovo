/**
 * Motion / animation constants used in JS/TSX.
 *
 * Durations and easings referenced programmatically (e.g. in JS-driven
 * transitions or Framer Motion). The CSS counterparts (--motion-*) live
 * in styles.css and should stay in sync manually.
 */

export const motion = {
  duration: {
    /** Page / route transition */
    route: 280,
    /** Fast route transition */
    routeFast: 180,
    /** Simple fade */
    fade: 160,
    /** Surface appear / disappear */
    surface: 260,
  },

  easing: {
    /** Primary spring-like ease for route transitions */
    route: "cubic-bezier(0.25, 1, 0.4, 1)",
  },

  distance: {
    /** Default slide distance for route transitions (px) */
    route: 48,
    /** Tight slide distance (px) */
    routeTight: 16,
  },
} as const;

export type AppMotion = typeof motion;
