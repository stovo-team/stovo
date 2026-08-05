import { Capacitor } from "@capacitor/core";

export const MESSAGE_CONTEXT_MENU_WIDTH = 236;
export const MESSAGE_CONTEXT_MENU_HEIGHT = 360;
export const MESSAGE_CONTEXT_MENU_EDGE_INSET = 8;
export const MOBILE_MESSAGE_CONTEXT_MENU_EDGE_INSET = 24;
export const SWIPE_REPLY_MAX_OFFSET = 84;
export const SWIPE_REPLY_TRIGGER_OFFSET = 56;
export const SWIPE_REPLY_DIRECTION_LOCK = 12;
export const MESSAGE_LONG_PRESS_DURATION_MS = 420;
export const MESSAGE_LONG_PRESS_MOVE_TOLERANCE = 10;
export const SWIPE_REPLY_VERTICAL_TOLERANCE = 14;
export const CHAT_EXIT_SWIPE_EDGE_THRESHOLD = 32;
export const CHAT_EXIT_SWIPE_TRIGGER_OFFSET = 78;

export function messageContextMenuPosition(
  x: number,
  y: number,
  viewportWidth: number,
  viewportHeight: number,
  isMobile: boolean
) {
  const horizontalInset = isMobile
    ? MOBILE_MESSAGE_CONTEXT_MENU_EDGE_INSET
    : MESSAGE_CONTEXT_MENU_EDGE_INSET;
  const maxX = Math.max(
    horizontalInset,
    viewportWidth - MESSAGE_CONTEXT_MENU_WIDTH - horizontalInset
  );
  const opensAbove =
    y + MESSAGE_CONTEXT_MENU_HEIGHT > viewportHeight - MESSAGE_CONTEXT_MENU_EDGE_INSET;

  return {
    x: Math.max(horizontalInset, Math.min(x, maxX)),
    y: opensAbove
      ? Math.max(MESSAGE_CONTEXT_MENU_EDGE_INSET, y - MESSAGE_CONTEXT_MENU_HEIGHT)
      : Math.max(MESSAGE_CONTEXT_MENU_EDGE_INSET, y)
  };
}

export function supportsSwipeReplyGesture(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  if (Capacitor.isNativePlatform()) {
    return true;
  }
  return (
    window.matchMedia("(pointer: coarse)").matches &&
    window.matchMedia("(max-width: 960px)").matches
  );
}
