export function avatarInitials(name: string | undefined) {
  const source = name ?? "Stovo";
  const cleaned = source.replace(/\([^)]*\)|\[[^\]]*\]/g, "").trim() || source.trim();
  const parts = cleaned.split(/\s+/).filter((part) => /[a-zA-Z0-9\u0400-\u04FF]/.test(part));
  if (parts.length >= 2) {
    const first = parts[0].match(/[a-zA-Z0-9\u0400-\u04FF]/)?.[0]?.toUpperCase() ?? "";
    const second = parts[1].match(/[a-zA-Z0-9\u0400-\u04FF]/)?.[0]?.toUpperCase() ?? "";
    if (first && second) return `${first}${second}`;
  }
  const compact = parts[0] || cleaned || source;
  const match = compact.match(/[a-zA-Z0-9\u0400-\u04FF]{1,2}/);
  return (match ? match[0] : compact.slice(0, 2)).toUpperCase();
}
