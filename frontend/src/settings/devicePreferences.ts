export interface DevicePreferences {
  messageNotifications: boolean;
  messagePreview: boolean;
  messageSound: boolean;
  callNotifications: boolean;
  ringtoneEnabled: boolean;
  quietHoursEnabled: boolean;
  quietHoursStart: string;
  quietHoursEnd: string;
  appLockEnabled: boolean;
}

export const DEVICE_PREFERENCES_STORAGE_KEY = "familyMessenger.devicePreferences";

export const DEFAULT_DEVICE_PREFERENCES: DevicePreferences = {
  messageNotifications: true,
  messagePreview: true,
  messageSound: true,
  callNotifications: true,
  ringtoneEnabled: true,
  quietHoursEnabled: false,
  quietHoursStart: "22:00",
  quietHoursEnd: "07:00",
  appLockEnabled: false
};

function isTime(value: unknown): value is string {
  return typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

export function readDevicePreferences(): DevicePreferences {
  if (typeof window === "undefined") return DEFAULT_DEVICE_PREFERENCES;
  try {
    const stored = JSON.parse(window.localStorage.getItem(DEVICE_PREFERENCES_STORAGE_KEY) ?? "{}") as Partial<DevicePreferences>;
    return {
      messageNotifications: stored.messageNotifications !== false,
      messagePreview: stored.messagePreview !== false,
      messageSound: stored.messageSound !== false,
      callNotifications: stored.callNotifications !== false,
      ringtoneEnabled: stored.ringtoneEnabled !== false,
      quietHoursEnabled: stored.quietHoursEnabled === true,
      quietHoursStart: isTime(stored.quietHoursStart) ? stored.quietHoursStart : DEFAULT_DEVICE_PREFERENCES.quietHoursStart,
      quietHoursEnd: isTime(stored.quietHoursEnd) ? stored.quietHoursEnd : DEFAULT_DEVICE_PREFERENCES.quietHoursEnd,
      appLockEnabled: stored.appLockEnabled === true
    };
  } catch {
    return DEFAULT_DEVICE_PREFERENCES;
  }
}

export function writeDevicePreferences(patch: Partial<DevicePreferences>): DevicePreferences {
  const next = { ...readDevicePreferences(), ...patch };
  if (typeof window !== "undefined") {
    window.localStorage.setItem(DEVICE_PREFERENCES_STORAGE_KEY, JSON.stringify(next));
  }
  return next;
}

function minutes(time: string): number {
  const [hours, minutesValue] = time.split(":").map(Number);
  return hours * 60 + minutesValue;
}

export function isWithinQuietHours(start: string, end: string, now = new Date()): boolean {
  if (!isTime(start) || !isTime(end) || start === end) return false;
  const current = now.getHours() * 60 + now.getMinutes();
  const from = minutes(start);
  const to = minutes(end);
  return from < to ? current >= from && current < to : current >= from || current < to;
}
