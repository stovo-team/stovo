import { useEffect, useRef } from "react";
import type { NavigateFunction } from "react-router-dom";

import type { Chat } from "../../../api/chats";
import { takePendingNotificationAction } from "../../../notificationActions";
import { notificationActionCommand } from "../shared/callLifecycle";

export type UseNotificationActionHandlerParams = {
  chatId: string | undefined;
  selectedChat: Chat | null;
  locationPathname: string;
  locationSearch: string;
  navigate: NavigateFunction;
  sendQueuedNotificationReply: (text: string) => Promise<void>;
  startDirectCall: (type: "audio" | "video") => Promise<void>;
};

/**
 * Resolves a queued push-notification "reply" or "callback" action once its
 * target chat has finished loading, then strips the notification query
 * params from the URL so the action only fires once per deep link.
 */
export function useNotificationActionHandler({
  chatId,
  selectedChat,
  locationPathname,
  locationSearch,
  navigate,
  sendQueuedNotificationReply,
  startDirectCall
}: UseNotificationActionHandlerParams) {
  const handledNotificationActionRef = useRef<string | null>(null);

  useEffect(() => {
    if (!chatId || selectedChat?.id !== chatId) {
      return;
    }
    const searchParams = new URLSearchParams(locationSearch);
    const requestedAction = searchParams.get("notificationAction");
    if (requestedAction !== "reply" && requestedAction !== "callback") {
      return;
    }
    const action = takePendingNotificationAction(chatId);
    if (!action || action.type !== requestedAction) {
      return;
    }
    const command = notificationActionCommand(action, selectedChat);
    if (!command) {
      return;
    }
    const actionId =
      searchParams.get("notificationActionId") ??
      `${requestedAction}:${chatId}:${action.type === "reply" ? action.text : ""}`;
    if (handledNotificationActionRef.current === actionId) {
      return;
    }
    handledNotificationActionRef.current = actionId;

    searchParams.delete("notificationAction");
    searchParams.delete("notificationActionId");
    navigate(
      {
        pathname: locationPathname,
        search: searchParams.toString() ? `?${searchParams.toString()}` : ""
      },
      { replace: true }
    );

    if (command.type === "reply") {
      void sendQueuedNotificationReply(command.text);
    } else if (command.type === "callback") {
      void startDirectCall("audio");
    }
    // sendQueuedNotificationReply/startDirectCall are recreated every render by
    // their owning hooks; matching the original effect, they're intentionally
    // excluded here so this only re-evaluates on chat/route changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatId, locationPathname, locationSearch, navigate, selectedChat]);
}
