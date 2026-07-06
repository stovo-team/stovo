export const motionTokens = {
  durations: {
    route: 220,
    routeFast: 160,
    fade: 140,
    surface: 200,
    reduced: 1
  },
  easing: {
    route: "cubic-bezier(0.22, 1, 0.36, 1)",
    emphasize: "cubic-bezier(0.2, 0.8, 0.2, 1)"
  },
  distance: {
    route: 24,
    routeTight: 12
  }
} as const;

export type MotionTokens = typeof motionTokens;
