import { Capacitor } from "@capacitor/core";

import type { Chat } from "../../../api/chats";
import type { PendingNotificationAction } from "../../../api/notifications";

import type { CallPhase, NotificationActionCommand } from "./types";

export type { CallPhase, NotificationActionCommand };

export function androidAppStatePayload(isActive: boolean, activeChatId?: string) {
  return {
    foreground: isActive,
    activeChatId: isActive ? activeChatId ?? "" : ""
  };
}

export function callTerminationEvent(phase: CallPhase): "call:cancel" | "call:end" {
  return phase === "outgoing" ? "call:cancel" : "call:end";
}

export function notificationActionCommand(
  action: PendingNotificationAction,
  chat: Pick<Chat, "id" | "type">
): NotificationActionCommand | null {
  if (action.chatId !== chat.id) {
    return null;
  }
  if (action.type === "reply") {
    return { type: "reply", text: action.text };
  }
  return chat.type === "direct" ? { type: "callback" } : { type: "discard" };
}

export function hasLiveLocalVideo(stream: MediaStream | null): boolean {
  return stream?.getVideoTracks().some((track) => track.readyState !== "ended") ?? false;
}

/** The `<video>` element for the currently-active in-conversation video player session, if any. */
export function activeSessionVideoElement(): HTMLVideoElement | null {
  return document.querySelector<HTMLVideoElement>(".video-player.is-session-active video");
}

/** Mobile full-screen call UI: native Capacitor apps always, or narrow browser viewport. */
export function isMobileCallViewport(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  if (Capacitor.isNativePlatform()) {
    return true;
  }
  return window.matchMedia("(max-width: 768px)").matches;
}
