export const motionTokens = {
  durations: {
    route: 280,
    routeFast: 180,
    fade: 160,
    surface: 260,
    reduced: 1
  },
  easing: {
    route: "cubic-bezier(0.25, 1, 0.4, 1)",
    emphasize: "cubic-bezier(0.2, 0.8, 0.2, 1)"
  },
  distance: {
    route: 48,
    routeTight: 16
  }
} as const;

export type MotionTokens = typeof motionTokens;
