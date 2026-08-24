export const TODAY_TIME_SLOTS = [0, 3, 6, 9, 12, 15, 18, 21] as const;

export function formatSlotTime(hour: number) {
  const date = new Date(2000, 0, 1, hour, 0);
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(date);
}
