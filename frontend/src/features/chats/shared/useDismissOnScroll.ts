import { useEffect, type RefObject } from "react";

/** Close a floating menu when the page or an underlying scroll container moves. */
export function useDismissOnScroll(
  menuRef: RefObject<HTMLElement | null>,
  onDismiss: () => void
) {
  useEffect(() => {
    function handleScroll(event: Event) {
      const target = event.target;
      if (target instanceof Node && menuRef.current?.contains(target)) {
        return;
      }
      onDismiss();
    }

    // Scroll events do not bubble, so capture is required for nested scrollers.
    window.addEventListener("scroll", handleScroll, true);
    return () => window.removeEventListener("scroll", handleScroll, true);
  }, [menuRef, onDismiss]);
}
