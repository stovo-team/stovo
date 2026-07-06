import type { NavigateFunction, NavigateOptions, To } from "react-router-dom";

export function supportsViewTransitions() {
  if (typeof document === "undefined") {
    return false;
  }

  return typeof (document as Document & { startViewTransition?: unknown }).startViewTransition === "function";
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
    viewTransition: viewTransition ?? (supportsViewTransitions() && !reducedMotion)
  });
}
