import { describe, expect, it } from "vitest";

import { parseMattermostCSV } from "./mattermost";

describe("Mattermost Channel Export CSV adapter", () => {
  it("maps the documented CSV header and preserves quoted message content", async () => {
    const csv = [
      '"Post Creation Time","User Id","User Email","User Type","User Name","Post Id","Parent Post Id","Post Message","Post Type"',
      '"2026-10-10 08:00:00 +0000 UTC","u1","mira@example.invalid","user","mira","p1","","Planning, first draft","message"',
      '"2026-10-10 08:05:00 +0000 UTC","u2","sam@example.invalid","user","sam","p2","p1","Reply with ""quotes""","message"'
    ].join("\r\n");

    await expect(parseMattermostCSV(csv)).resolves.toMatchObject({
      source: { providerId: "mattermost" },
      messages: [
        { sourceId: "p1", authorId: "u1", text: "Planning, first draft" },
        { sourceId: "p2", authorId: "u2", replyToSourceId: "p1", text: 'Reply with "quotes"' }
      ]
    });
  });

  it("rejects CSV files that do not have the Mattermost channel-export header", async () => {
    const unrelated = "username,email\nmira,mira@example.invalid";
    await expect(parseMattermostCSV(unrelated)).rejects.toMatchObject({ code: "unrecognized_format" });
  });

  it("does not use source email addresses as Stovo account identities", async () => {
    const csv = [
      '"Post Creation Time","User Id","User Email","User Type","User Name","Post Id","Parent Post Id","Post Message","Post Type"',
      '"2026-10-10 08:00:00 +0000 UTC","u1","private@example.invalid","user","mira","p1","","Hello","message"'
    ].join("\n");
    const result = await parseMattermostCSV(csv);

    expect(result.participants[0]).toMatchObject({ sourceId: "u1", displayName: "mira" });
    expect(result.participants[0]).not.toHaveProperty("email");
  });
});
