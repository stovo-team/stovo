import JSZip from "jszip";
import { describe, expect, it } from "vitest";

import type { ChatArchive } from "./archive";
import { serializeMattermostCSV, serializeRocketChatExport, serializeSlackExport, serializeStovoArchive, serializeTelegramExport, serializeWhatsAppExport } from "./adapters";

const archive: ChatArchive = {
  schemaVersion: 1,
  source: { providerId: "stovo", profileId: "stovo-chat-archive-v1" },
  exportedAt: "2026-10-11T00:00:00.000Z",
  conversation: { sourceId: "stovo-chat-1", title: "Project room" },
  participants: [
    { sourceId: "source-user-1", displayName: "Mira" },
    { sourceId: "source-user-2", displayName: "Sam" }
  ],
  messages: [
    {
      sourceId: "source-message-1",
      authorId: "source-user-1",
      timestamp: "2026-10-10T08:00:00.000Z",
      kind: "text",
      text: "Planning",
      attachmentIds: ["attachment-1"],
      metadata: {}
    },
    {
      sourceId: "source-message-2",
      authorId: "source-user-2",
      timestamp: "2026-10-10T08:05:00.000Z",
      kind: "text",
      text: "Agreed",
      replyToSourceId: "source-message-1",
      attachmentIds: [],
      metadata: {}
    }
  ],
  attachments: [
    {
      id: "attachment-1",
      path: "attachments/plan.pdf",
      filename: "plan.pdf",
      mimeType: "application/pdf",
      size: 4,
      checksum: "sha256:abcd",
      bytes: new Uint8Array([37, 80, 68, 70])
    }
  ],
  warnings: []
};

const decoder = new TextDecoder();

describe("chat export adapters", () => {
  it("labels each provider profile accurately and makes no unsupported native-import claim", async () => {
    const packages = await Promise.all([
      serializeStovoArchive(archive),
      serializeTelegramExport(archive),
      serializeWhatsAppExport(archive),
      serializeSlackExport(archive),
      serializeMattermostCSV(archive),
      serializeRocketChatExport(archive)
    ]);

    expect(packages.map((item) => item.compatibility)).toEqual([
      "stovo_round_trip",
      "provider_archive",
      "provider_archive",
      "provider_archive",
      "provider_archive",
      "provider_archive"
    ]);
    expect(packages.every((item) => item.filename.length > 0 && item.bytes.length > 0)).toBe(true);
    expect(packages.some((item) => item.compatibility === "native_import_verified")).toBe(false);
  });

  it("round-trips supported Stovo fields including external authors, replies, and attachments", async () => {
    const exported = await serializeStovoArchive(archive);
    const { parseStovoArchive } = await import("./adapters/stovo");
    const imported = await parseStovoArchive(exported.bytes);

    expect(imported).toMatchObject({
      conversation: { sourceId: "stovo-chat-1", title: "Project room" },
      participants: [
        { sourceId: "source-user-1", displayName: "Mira" },
        { sourceId: "source-user-2", displayName: "Sam" }
      ],
      messages: [
        { sourceId: "source-message-1", text: "Planning", attachmentIds: ["attachment-1"] },
        { sourceId: "source-message-2", replyToSourceId: "source-message-1" }
      ],
      attachments: [{ id: "attachment-1", checksum: "sha256:abcd" }]
    });
  });

  it("retains message metadata in the Stovo round-trip archive", async () => {
    const withMetadata: ChatArchive = {
      ...archive,
      conversation: { ...archive.conversation, metadata: { source: "test" } },
      participants: archive.participants.map((participant) => ({ ...participant, attributes: { sourceRole: "member" } })),
      messages: [{ ...archive.messages[0], reactions: [{ emoji: "👍", participantIds: ["source-user-2"] }], metadata: { importedAttribution: { sourceProvider: "telegram" } } }]
    };
    const exported = await serializeStovoArchive(withMetadata);
    const { parseStovoArchive } = await import("./adapters/stovo");
    const imported = await parseStovoArchive(exported.bytes);

    expect(imported.messages[0]).toMatchObject({
      reactions: [{ emoji: "👍", participantIds: ["source-user-2"] }],
      metadata: { importedAttribution: { sourceProvider: "telegram" } }
    });
    expect(imported.conversation.metadata).toEqual({ source: "test" });
    expect(imported.participants[0].attributes).toEqual({ sourceRole: "member" });
  });

  it("rejects an unregistered or modified export profile", async () => {
    await expect((await import("./adapters/export")).serializeChatArchive(archive, {
      providerId: "telegram",
      profileId: "telegram-readable-chat-json-v1",
      formatVersion: "1",
      compatibility: "native_import_verified",
      knownLosses: [],
      sideEffects: [],
      mediaHandling: "references"
    })).rejects.toThrow("Unsupported or mismatched chat export profile");
  });

  it("serializes Mattermost as CSV with the Channel Export header and discloses unsupported content", async () => {
    const exported = await serializeMattermostCSV(archive);
    const csv = decoder.decode(exported.bytes);

    expect(exported).toMatchObject({
      compatibility: "provider_archive",
      mimeType: "text/csv"
    });
    expect(csv.split(/\r?\n/, 1)[0]).toBe(
      '"Post Creation Time","User Id","User Email","User Type","User Name","Post Id","Parent Post Id","Post Message","Post Type"'
    );
    expect(exported.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "attachments_not_supported" })
    ]));
  });

  it("writes one channel to Slack ZIP and leaves external file links as references", async () => {
    const withLink: ChatArchive = {
      ...archive,
      messages: [{ ...archive.messages[0], text: "See https://example.invalid/file" }]
    };
    const exported = await serializeSlackExport(withLink);
    const zip = await JSZip.loadAsync(exported.bytes);
    const channelIndex = JSON.parse(await zip.file("channels.json")!.async("string")) as unknown[];
    const messages = JSON.parse(await zip.file("project-room/2026-10-10.json")!.async("string")) as Array<{ text: string }>;

    expect(channelIndex).toHaveLength(1);
    expect(messages[0].text).toContain("https://example.invalid/file");
    expect(Object.keys(zip.files)).not.toContain("https://example.invalid/file");
  });

  it("includes the available media bytes in the WhatsApp package", async () => {
    const exported = await serializeWhatsAppExport(archive);
    const zip = await JSZip.loadAsync(exported.bytes);
    const { parseChatFile } = await import("./adapters/registry");
    const imported = await parseChatFile(new File([exported.bytes.slice().buffer as ArrayBuffer], exported.filename, { type: exported.mimeType }));

    expect(exported.compatibility).toBe("provider_archive");
    expect(await zip.file(/plan\.pdf/)[0].async("uint8array")).toEqual(new Uint8Array([37, 80, 68, 70]));
    expect(imported.messages[0]).toMatchObject({ text: "Planning", attachmentIds: ["whatsapp-attachment-1"] });
    expect(imported.attachments[0].bytes).toEqual(new Uint8Array([37, 80, 68, 70]));
  });

  it("keeps output filenames relative and omits encryption key material", async () => {
    const exported = await serializeTelegramExport(archive);
    const json = decoder.decode(exported.bytes);

    expect(exported.filename).not.toMatch(/(^\/|\\.\\.|[\\\\/])/);
    expect(json).not.toContain("privateKey");
    expect(json).not.toContain("encryptionKey");
  });

  it("never serializes server-only or encryption fields supplied on the input object", async () => {
    const unsafeArchive = {
      ...archive,
      encryptionKey: "private-key-must-not-leak",
      serverOnlyFamilyId: "server-family-must-not-leak"
    } as ChatArchive;
    const packages = await Promise.all([
      serializeStovoArchive(unsafeArchive),
      serializeTelegramExport(unsafeArchive),
      serializeWhatsAppExport(unsafeArchive),
      serializeSlackExport(unsafeArchive),
      serializeMattermostCSV(unsafeArchive),
      serializeRocketChatExport(unsafeArchive)
    ]);

    for (const item of packages) {
      let serialized: string;
      if (item.mimeType.includes("zip")) {
        const zip = await JSZip.loadAsync(item.bytes);
        const entries = await Promise.all(
          Object.values(zip.files)
            .filter((entry) => !entry.dir)
            .map((entry) => entry.async("string"))
        );
        serialized = entries.join("\n");
      } else {
        serialized = decoder.decode(item.bytes);
      }

      expect(serialized).not.toContain("private-key-must-not-leak");
      expect(serialized).not.toContain("server-family-must-not-leak");
    }
  });

  it("produces a readable Rocket.Chat room JSON archive", async () => {
    const exported = await serializeRocketChatExport(archive);
    const json = JSON.parse(decoder.decode(exported.bytes));

    expect(exported.compatibility).toBe("provider_archive");
    expect(json.room).toMatchObject({ name: "Project room" });
    expect(json.messages).toHaveLength(2);
  });
});
