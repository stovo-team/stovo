import JSZip from "jszip";
import { afterEach, describe, expect, it, vi } from "vitest";

import { parseSlackExport, SLACK_IMPORT_LIMITS } from "./slack";

async function slackZip(channelNames: string[], extraEntries: Record<string, string> = {}) {
  const zip = new JSZip();
  zip.file("users.json", JSON.stringify([
    { id: "U1", name: "mira", real_name: "Mira Singh" },
    { id: "U2", name: "sam", real_name: "Sam Lee" }
  ]));
  zip.file("channels.json", JSON.stringify(channelNames.map((name, index) => ({
    id: "C" + (index + 1),
    name,
    is_private: false,
    members: ["U1", "U2"]
  }))));
  for (const name of channelNames) {
    zip.file(name + "/2026-10-10.json", JSON.stringify([
      { type: "message", user: "U1", text: "See https://example.invalid/report", ts: "1791619200.000001" },
      { type: "message", user: "U2", text: "Done", ts: "1791619500.000002", thread_ts: "1791619200.000001" }
    ]));
  }
  for (const [name, contents] of Object.entries(extraEntries)) zip.file(name, contents);
  return new Uint8Array(await zip.generateAsync({ type: "uint8array" }));
}

afterEach(() => vi.restoreAllMocks());

describe("Slack export adapter", () => {
  it("parses a ZIP containing exactly one channel and preserves thread references", async () => {
    const bytes = await slackZip(["general"]);

    await expect(parseSlackExport(bytes)).resolves.toMatchObject({
      source: { providerId: "slack" },
      conversation: { sourceId: "C1", title: "general" },
      participants: [
        { sourceId: "U1", displayName: "Mira Singh" },
        { sourceId: "U2", displayName: "Sam Lee" }
      ],
      messages: [
        { authorId: "U1", text: "See https://example.invalid/report" },
        { authorId: "U2", replyToSourceId: "1791619200.000001" }
      ]
    });
  });

  it("rejects a workspace ZIP containing more than one channel", async () => {
    await expect(parseSlackExport(await slackZip(["general", "random"])))
      .rejects.toMatchObject({ code: "multiple_conversations" });
  });

  it("keeps Slack file URLs as references and never makes network requests", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await parseSlackExport(await slackZip(["general"]));

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("rejects a malformed ZIP instead of returning an empty channel", async () => {
    await expect(parseSlackExport(new Uint8Array([1, 2, 3])))
      .rejects.toMatchObject({ code: "invalid_archive" });
  });

  it("rejects ZIP entries with traversal paths", async () => {
    const bytes = await slackZip(["general"], { "../outside.json": "{}" });

    await expect(parseSlackExport(bytes)).rejects.toMatchObject({ code: "unsafe_archive_path" });
  });

  it("rejects a ZIP whose entry count exceeds the parser limit", async () => {
    const extras = Object.fromEntries(
      Array.from({ length: SLACK_IMPORT_LIMITS.maxZipEntries + 1 }, (_, index) => [`general/extra-${index}.json`, "[]"])
    );

    await expect(parseSlackExport(await slackZip(["general"], extras)))
      .rejects.toMatchObject({ code: "too_many_archive_entries" });
  });

  it("rejects excessive expanded ZIP size before parsing message files", async () => {
    const oversized = "x".repeat(SLACK_IMPORT_LIMITS.maxExpandedBytes + 1);
    const bytes = await slackZip(["general"], { "general/oversized.json": oversized });

    await expect(parseSlackExport(bytes)).rejects.toMatchObject({ code: "archive_too_large" });
  });
});
