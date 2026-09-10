import { describe, expect, it } from "vitest";

import {
  buildStorageSources,
  groupStorageSources,
  matchesStorageFilter,
  storageSourceLeadingVisual
} from "./storageLibrary";

describe("storage library helpers", () => {
  it("uses compact markers for group and channel sources while keeping archives icon-only", () => {
    expect(storageSourceLeadingVisual("group", true)).toBe("lock");
    expect(storageSourceLeadingVisual("channel", true)).toBe("hash");
    expect(storageSourceLeadingVisual("voice", true)).toBe("voice");
    expect(storageSourceLeadingVisual("direct", true)).toBe("avatar");
    expect(storageSourceLeadingVisual("archive", true)).toBe("archive");
    expect(storageSourceLeadingVisual("archive", false)).toBe("archive");
  });

  const audio = {
    id: "audio",
    chatId: "chat-1",
    chatTitle: "General Family Chat",
    chatType: "family",
    mimeType: "audio/webm"
  };

  it("includes audio files in the Audio filter", () => {
    expect(matchesStorageFilter(audio, "audio")).toBe(true);
  });

  it("groups chat sources by archive, family, and direct chats", () => {
    expect(
      groupStorageSources([
        { ...audio, id: "archive", chatId: "archive", chatType: "archive", chatTitle: "Message Archive" },
        audio,
        { ...audio, id: "direct", chatId: "chat-2", chatType: "direct", chatTitle: "Mom" }
      ])
    ).toEqual([
      { label: "MESSAGE ARCHIVE", ids: ["archive"] },
      { label: "FAMILY CHATS", ids: ["chat-1"] },
      { label: "DIRECT CHATS", ids: ["chat-2"] }
    ]);
  });

  it("uses the Chat identity for each storage source", () => {
    const profilePhoto = { ...audio, id: "profile-photo" };
    const chatPhoto = { ...audio, id: "chat-photo" };
    const sources = buildStorageSources(
      [audio, { ...audio, id: "direct-file", chatId: "chat-2", chatType: "direct" }],
      [
        {
          id: "chat-1", type: "family", title: "Family announcements", chatPhoto,
          members: []
        },
        {
          id: "chat-2", type: "direct", title: null, chatPhoto: null,
          members: [
            { id: "me", displayName: "Me", profilePhoto: null },
            { id: "mom", displayName: "Mom", profilePhoto }
          ]
        }
      ],
      "me"
    );

    expect(sources).toEqual([
      {
        label: "FAMILY CHATS",
        sources: [{ chatId: "chat-1", label: "Family announcements", avatarFile: chatPhoto, avatarKind: "family", fileCount: 1 }]
      },
      {
        label: "DIRECT CHATS",
        sources: [{ chatId: "chat-2", label: "Mom", avatarFile: profilePhoto, avatarKind: "direct", fileCount: 1 }]
      }
    ]);
  });

  it("keeps a chat with files visible while its chat metadata is unavailable", () => {
    expect(buildStorageSources(
      [{ ...audio, chatId: "syncing-chat", chatTitle: "Trip plans", chatType: "group" }],
      [],
      "me"
    )).toEqual([
      {
        label: "GROUPS",
        sources: [{
          chatId: "syncing-chat",
          label: "Trip plans",
          avatarFile: null,
          avatarKind: "group",
          fileCount: 1
        }]
      }
    ]);
  });

  it("places family-scoped files under the family chat source", () => {
    const sources = buildStorageSources(
      [{ ...audio, chatId: null, chatTitle: null, chatType: null }],
      [{ id: "family", type: "family", title: "Our family", chatPhoto: null, members: [] }],
      "me"
    );

    expect(sources).toEqual([
      {
        label: "FAMILY CHATS",
        sources: [{
          chatId: "family",
          label: "Our family",
          avatarFile: null,
          avatarKind: "family",
          fileCount: 1,
          includesUnscopedFiles: true
        }]
      }
    ]);
  });

  it("separates family chats, groups, channels, and direct chats", () => {
    const fileFor = (id: string, chatId: string, chatType: string) => ({
      ...audio, id, chatId, chatType
    });
    const sources = buildStorageSources(
      [
        fileFor("family-file", "family", "family"),
        fileFor("group-file", "group", "group"),
        fileFor("channel-file", "channel", "channel"),
        fileFor("direct-file", "direct", "direct")
      ],
      [
        { id: "family", type: "family", title: "Family", chatPhoto: null, members: [] },
        { id: "group", type: "group", title: "Weekend plans", chatPhoto: null, members: [] },
        { id: "channel", type: "channel", title: "News", chatPhoto: null, members: [] },
        { id: "direct", type: "direct", title: null, chatPhoto: null, members: [{ id: "mom", displayName: "Mom", profilePhoto: null }] }
      ],
      "me"
    );

    expect(sources.map((group) => group.label)).toEqual([
      "FAMILY CHATS", "GROUPS", "CHANNELS", "DIRECT CHATS"
    ]);
  });
});
