import { afterEach, describe, expect, it, vi } from "vitest";

import { parseWhatsAppExport } from "./whatsapp";

afterEach(() => vi.restoreAllMocks());

describe("WhatsApp chat export adapter", () => {
  it("parses a single-chat TXT, multiline body, participant labels, and supplied media", async () => {
    const result = await parseWhatsAppExport({
      filename: "Family chat.txt",
      text: [
        "10/10/26, 8:15 PM - Mira: Dinner at 7?",
        "Can you bring the photos?",
        "10/10/26, 8:16 PM - Sam: <attached: IMG-20261010-WA0001.jpg>"
      ].join("\n"),
      media: new Map([["IMG-20261010-WA0001.jpg", new Uint8Array([1, 2, 3])]])
    });

    expect(result).toMatchObject({
      source: { providerId: "whatsapp" },
      conversation: { title: "Family chat" },
      participants: [
        { displayName: "Mira" },
        { displayName: "Sam" }
      ],
      messages: [
        { text: "Dinner at 7?\nCan you bring the photos?" },
        { attachmentIds: expect.arrayContaining([expect.any(String)]) }
      ],
      attachments: [{ filename: "IMG-20261010-WA0001.jpg", size: 3 }]
    });
  });

  it("reports missing media as unavailable and does not fetch message URLs", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const result = await parseWhatsAppExport({
      filename: "Export.txt",
      text: "10/10/26, 8:15 PM - Mira: https://example.invalid/image.jpg\n10/10/26, 8:16 PM - Sam: <attached: missing.jpg>",
      media: new Map()
    });

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "attachment_bytes_missing" })
    ]));
    expect(result.messages[0].text).toContain("https://example.invalid/image.jpg");
  });

  it("parses iOS-style timestamps and turns native file-attached lines into media references", async () => {
    const result = await parseWhatsAppExport({
      filename: "Export.txt",
      text: "[31/12/26, 9:41:00 PM] Mira: IMG-20261231-WA0001.jpg (file attached)",
      media: new Map([["IMG-20261231-WA0001.jpg", new Uint8Array([9, 8, 7])]])
    });

    expect(result.messages[0]).toMatchObject({ kind: "file", text: "", attachmentIds: ["whatsapp-attachment-1"] });
    expect(result.attachments[0]).toMatchObject({ filename: "IMG-20261231-WA0001.jpg", size: 3 });
    expect(result.messages[0].timestamp).toBe("2026-12-31T21:41:00.000Z");
  });

  it("rejects a file that has no recognizable WhatsApp message lines", async () => {
    await expect(parseWhatsAppExport({
      filename: "notes.txt",
      text: "This is not an exported chat.",
      media: new Map()
    })).rejects.toMatchObject({ code: "unrecognized_format" });
  });
});
