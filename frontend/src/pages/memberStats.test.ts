import { describe, expect, it } from "vitest";

import { formatMemberLastSeen } from "./memberStats";

describe("formatMemberLastSeen", () => {
  it("handles missing, malformed, and future timestamps safely", () => {
    expect(formatMemberLastSeen(null, 1_000_000)).toBe("Unknown");
    expect(formatMemberLastSeen("bad-date", 1_000_000)).toBe("Unknown");
    expect(formatMemberLastSeen("1970-01-01T00:20:00Z", 1_000_000)).toBe("Unknown");
  });

  it("formats activity separately from live presence", () => {
    const now = Date.parse("2026-09-24T12:00:00Z");
    expect(formatMemberLastSeen("2026-09-24T11:59:30Z", now)).toBe("30s ago");
    expect(formatMemberLastSeen("2026-09-24T11:00:00Z", now)).toBe("1h ago");
  });
});
