import { Capacitor, registerPlugin } from "@capacitor/core";

import { ApiRequestOptions, apiRequest } from "./client";

// --- Capacitor plugin bridge ---

interface NtfyPlugin {
  startService(options: { topic: string; ntfyBaseUrl: string }): Promise<void>;
  stopService(): Promise<void>;
  checkFullScreenIntent(): Promise<void>;
}

const NtfyPlugin = registerPlugin<NtfyPlugin>("NtfyPlugin");

// --- Topic API ---

interface NotificationTopicResponse {
  topic: string;
  ntfyBaseUrl: string;
}

export async function fetchNotificationTopic(
  accessToken: string
): Promise<NotificationTopicResponse> {
  return apiRequest<NotificationTopicResponse>("/api/notifications/topic", {
    accessToken
  });
}

// --- Permission helpers (Android-only, safe to call on web/iOS — they no-op) ---

/**
 * Request POST_NOTIFICATIONS permission on Android 13+ (API 33+).
 * Returns true if granted (or if not Android / below API 33).
 */
export async function requestPostNotificationsPermission(): Promise<boolean> {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "android") {
    return true;
  }
  try {
    // On SDK < 33 POST_NOTIFICATIONS does not exist — always granted.
    const cap = Capacitor as unknown as {
      Plugins: {
        Permissions: {
          checkPermissions: () => Promise<{ notifications: string }>;
          requestPermissions: (perms: string[]) => Promise<{ notifications: string }>;
        };
      };
    };
    const result = await cap.Plugins.Permissions.checkPermissions();
    if (result.notifications === "granted") {
      return true;
    }
    const requested = await cap.Plugins.Permissions.requestPermissions(["notifications"]);
    return requested.notifications === "granted";
  } catch {
    // Permissions plugin not available (SDK < 33 or web): treat as granted
    return true;
  }
}

/**
 * Check and guide USE_FULL_SCREEN_INTENT on Android 14+ (API 34+).
 * If denied, opens Special App Access settings. Does not block the app.
 * On SDK < 34 or non-Android platforms: no-op.
 */
export async function ensureFullScreenIntentPermission(): Promise<void> {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "android") {
    return;
  }
  try {
    await NtfyPlugin.checkFullScreenIntent();
  } catch {
    // Safe no-op on older APIs or when plugin method is not yet implemented
  }
}

/**
 * Full notification bootstrap: call after successful login on Android.
 * 1. Request POST_NOTIFICATIONS (Android 13+)
 * 2. If granted, fetch topic from backend
 * 3. Start NtfyService with topic + base URL
 *
 * Accepts authRequest from useAuth() to make authenticated API calls.
 */
export async function bootstrapNotifications(
  authRequest: <T>(endpoint: string, options?: ApiRequestOptions) => Promise<T>
): Promise<void> {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "android") {
    return;
  }
  const granted = await requestPostNotificationsPermission();
  if (!granted) {
    // User declined — service not started; notifications will not work
    return;
  }
  const { topic, ntfyBaseUrl } = await authRequest<NotificationTopicResponse>(
    "/api/notifications/topic"
  );
  await NtfyPlugin.startService({ topic, ntfyBaseUrl });
}
