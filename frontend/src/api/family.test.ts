import { describe, expect, it } from "vitest";

import { inviteUrlForServer } from "./family";

describe("inviteUrlForServer", () => {
  it("uses the active family server instead of a backend localhost default", () => {
    expect(
      inviteUrlForServer(
        "http://localhost:8000/invite/one-time-token",
        "https://stovo-cloud.stovo.ru/s/5ae8bb18"
      )
    ).toBe("https://stovo-cloud.stovo.ru/s/5ae8bb18/invite/one-time-token");
  });
});
