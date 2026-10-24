import { describe, expect, it } from "vitest";

import { getChatAdapter } from "./registry";

describe("named chat import adapters", () => {
  it("preserves Mattermost CSV parser errors instead of reporting invalid UTF-8", async () => {
    const file = new File(["username,email\nmira,mira@example.invalid"], "channel.csv", { type: "text/csv" });
    const error = await getChatAdapter("mattermost").parse(file).catch((caught: unknown) => caught);

    expect(error).toMatchObject({ code: "unrecognized_format" });
    expect((error as Error).message).toContain("Mattermost Channel Export CSV header");
  });
});
