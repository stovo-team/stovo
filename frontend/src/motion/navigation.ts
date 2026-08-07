import type { NavigateFunction, NavigateOptions, To } from "react-router-dom";

export function supportsViewTransitions() {
  return false;
}

type MotionNavigateOptions = NavigateOptions & {
  reducedMotion?: boolean;
};

export function navigateWithMotion(
  navigate: NavigateFunction,
  to: To,
  { reducedMotion = false, viewTransition, ...options }: MotionNavigateOptions = {}
) {
  navigate(to, {
    ...options,
    viewTransition: false
  });
}
