export interface ScheduleCommandDraft {
  title: string;
  startsAt: string;
  durationMinutes: number;
}

export function parseScheduleCommand(value: string): ScheduleCommandDraft | null {
  const parts = value.trim().match(/^\/schedule\s+([^|]+)\|\s*([^|]+)\|\s*(\d+)h\s*$/i);
  if (!parts) return null;

  const title = parts[1].trim();
  const startsAt = parts[2].trim();
  const durationHours = Number(parts[3]);
  if (!title || !startsAt || !Number.isInteger(durationHours) || durationHours < 1 || durationHours > 24) {
    return null;
  }
  return { title, startsAt, durationMinutes: durationHours * 60 };
}
