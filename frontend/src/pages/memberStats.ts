export function formatMemberLastSeen(value: string | null | undefined, now = Date.now()): string {
  if (!value) return "Unknown";
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp) || timestamp > now) return "Unknown";
  const diffMs = now - timestamp;
  if (diffMs < 60_000) return `${Math.floor(diffMs / 1_000)}s ago`;
  if (diffMs < 3_600_000) return `${Math.floor(diffMs / 60_000)}m ago`;
  if (diffMs < 86_400_000) return `${Math.floor(diffMs / 3_600_000)}h ago`;
  return new Date(timestamp).toLocaleDateString();
}

export function formatMemberJoined(value: string | null | undefined): string {
  if (!value) return "Unknown";
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp) || timestamp > Date.now()) return "Unknown";
  return new Date(timestamp).toLocaleDateString();
}
