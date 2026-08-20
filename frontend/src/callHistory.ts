import type { AppStrings } from "./config/strings";

export interface CallHistoryLabelInput {
  status: "missed" | "declined" | "canceled" | "failed" | "completed";
  durationSeconds?: number | null;
}

function formatDuration(durationSeconds: number) {
  const minutes = Math.floor(durationSeconds / 60);
  const seconds = durationSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function callHistoryLabel(call: CallHistoryLabelInput, strings?: AppStrings) {
  const duration = formatDuration(call.durationSeconds ?? 0);
  if (call.status === "completed") {
    return strings
      ? strings.callHistory.completed(duration)
      : `Call completed · ${duration}`;
  }
  if (strings) {
    return {
      missed: strings.callHistory.missed,
      declined: strings.callHistory.declined,
      canceled: strings.callHistory.canceled,
      failed: strings.callHistory.failed
    }[call.status];
  }
  return {
    missed: "Missed call",
    declined: "Call declined",
    canceled: "Call canceled",
    failed: "Call failed"
  }[call.status];
}

export function callHistoryTimestamp(createdAt: string) {
  return new Date(createdAt).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  });
}
