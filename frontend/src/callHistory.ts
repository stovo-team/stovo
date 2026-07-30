export interface CallHistoryLabelInput {
  status: "missed" | "declined" | "canceled" | "failed" | "completed";
  durationSeconds?: number | null;
}

function formatDuration(durationSeconds: number) {
  const minutes = Math.floor(durationSeconds / 60);
  const seconds = durationSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function callHistoryLabel(call: CallHistoryLabelInput) {
  if (call.status === "completed") {
    return `Call completed · ${formatDuration(call.durationSeconds ?? 0)}`;
  }
  return {
    missed: "Missed call",
    declined: "Call declined",
    canceled: "Call cancelled",
    failed: "Call failed"
  }[call.status];
}

export function callHistoryTimestamp(createdAt: string) {
  return new Date(createdAt).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit"
  });
}
