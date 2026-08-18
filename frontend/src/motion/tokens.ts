export const motionTokens = {
  durations: {
    fast: 180,
    normal: 260,
    slow: 360,
    page: 300,
    press: 100,
    route: 300,
    routeFast: 180,
    fade: 180,
    surface: 260,
    reduced: 1
  },
  easing: {
    enter: "cubic-bezier(0.22, 1, 0.36, 1)",
    exit: "cubic-bezier(0.4, 0, 1, 1)",
    inOut: "cubic-bezier(0.4, 0, 0.2, 1)",
    spring: "cubic-bezier(0.34, 1.56, 0.64, 1)",
    route: "cubic-bezier(0.22, 1, 0.36, 1)",
    emphasize: "cubic-bezier(0.22, 1, 0.36, 1)"
  },
  distance: {
    route: 24,
    routeTight: 12,
    popup: 6,
    modal: 8,
    toast: 12
  }
} as const;

export type MotionTokens = typeof motionTokens;

