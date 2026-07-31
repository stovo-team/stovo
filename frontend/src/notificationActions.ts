import type { PendingNotificationAction } from "./api/notifications";

let pendingNotificationAction: PendingNotificationAction | null = null;

export function queuePendingNotificationAction(action: PendingNotificationAction): void {
  pendingNotificationAction = action;
}

export function takePendingNotificationAction(chatId: string): PendingNotificationAction | null {
  if (pendingNotificationAction?.chatId !== chatId) {
    return null;
  }
  const action = pendingNotificationAction;
  pendingNotificationAction = null;
  return action;
}

export function clearPendingNotificationAction(): void {
  pendingNotificationAction = null;
}
