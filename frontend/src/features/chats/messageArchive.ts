export type MessageArchiveView = "all" | "grouped";

export function messageArchiveViewStorageKey(userId: string) {
  return `stovo:message-archive:view:${userId}`;
}

export function messageArchiveViewFromStoredValue(value: string | null): MessageArchiveView {
  return value === "grouped" ? "grouped" : "all";
}
