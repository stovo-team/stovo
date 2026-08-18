import { describe, expect, it } from "vitest";

import {
  chatInfoControlVisibility,
  chatListLayoutClass,
  chatPreview,
  shouldShowChatRowMeta,
  compactChatListLeadingVisual,
  sharedContentItemMatchesTab,
  computeSharedContentItems
} from "./chatPresentation";
import {
  androidAppStatePayload,
  callTerminationEvent
} from "./callLifecycle";
import { messageContextMenuPosition } from "./messageGestures";
import {
  countMessagesAfterAnchor,
  emojiSizeClass,
  isMessageListNearBottom,
  messageDeliveryLabel,
  messageOriginChatId,
  messageReceiptState,
  shouldShowMessageSender
} from "./messagePresentation";

describe("chat presentation helpers", () => {
  it("selects the minimized chat-list class only when the family setting is enabled", () => {
    expect(chatListLayoutClass(true)).toBe(" messenger-shell--minimized-chat-layout");
    expect(chatListLayoutClass(false)).toBe("");
  });

  it("uses compact type markers for groups and channels while retaining DM avatars", () => {
    expect(compactChatListLeadingVisual("group")).toBe("lock");
    expect(compactChatListLeadingVisual("family")).toBe("lock");
    expect(compactChatListLeadingVisual("channel")).toBe("hash");
    expect(compactChatListLeadingVisual("direct")).toBe("avatar");
    expect(compactChatListLeadingVisual("archive")).toBe("archive");
  });

  it("shows only the chat-details control requested by its icon", () => {
    expect(chatInfoControlVisibility(null)).toEqual({
      nameEditor: false,
      settings: false
    });
    expect(chatInfoControlVisibility("name")).toEqual({
      nameEditor: true,
      settings: false
    });
    expect(chatInfoControlVisibility("settings")).toEqual({
      nameEditor: false,
      settings: true
    });
  });

  it("does not add a direct-message subtitle to Message Archive", () => {
    expect(chatPreview({ type: "archive" } as any)).toBe("");
  });

  it("removes the unused metadata container from Message Archive", () => {
    expect(shouldShowChatRowMeta("archive")).toBe(false);
    expect(shouldShowChatRowMeta("direct")).toBe(true);
  });

  it("filters shared content by media (photos/videos), audio, files, and links", () => {
    const photoItem = { kind: "attachment" as const, file: { id: "1", originalName: "pic.jpg", mimeType: "image/jpeg" } as any, messageId: "m1" };
    const videoItem = { kind: "attachment" as const, file: { id: "2", originalName: "clip.mp4", mimeType: "video/mp4" } as any, messageId: "m2" };
    const audioItem = { kind: "attachment" as const, file: { id: "3", originalName: "song.mp3", mimeType: "audio/mpeg" } as any, messageId: "m3" };
    const voiceItem = { kind: "attachment" as const, file: { id: "4", originalName: "voice.ogg", mimeType: "audio/ogg" } as any, messageId: "m4" };
    const docItem = { kind: "attachment" as const, file: { id: "5", originalName: "doc.pdf", mimeType: "application/pdf" } as any, messageId: "m5" };
    const zipItem = { kind: "attachment" as const, file: { id: "6", originalName: "archive.zip", mimeType: "application/zip" } as any, messageId: "m6" };
    const linkItem = { kind: "link" as const, url: "https://example.com", messageId: "m7" };

    // media tab: only image and video
    expect(sharedContentItemMatchesTab(photoItem, "media")).toBe(true);
    expect(sharedContentItemMatchesTab(videoItem, "media")).toBe(true);
    expect(sharedContentItemMatchesTab(audioItem, "media")).toBe(false);
    expect(sharedContentItemMatchesTab(docItem, "media")).toBe(false);
    expect(sharedContentItemMatchesTab(linkItem, "media")).toBe(false);

    // audio tab: only audio
    expect(sharedContentItemMatchesTab(audioItem, "audio")).toBe(true);
    expect(sharedContentItemMatchesTab(voiceItem, "audio")).toBe(true);
    expect(sharedContentItemMatchesTab(photoItem, "audio")).toBe(false);
    expect(sharedContentItemMatchesTab(videoItem, "audio")).toBe(false);
    expect(sharedContentItemMatchesTab(docItem, "audio")).toBe(false);
    expect(sharedContentItemMatchesTab(linkItem, "audio")).toBe(false);

    // files tab: all other files (no photos, videos, audio, or links)
    expect(sharedContentItemMatchesTab(docItem, "files")).toBe(true);
    expect(sharedContentItemMatchesTab(zipItem, "files")).toBe(true);
    expect(sharedContentItemMatchesTab(photoItem, "files")).toBe(false);
    expect(sharedContentItemMatchesTab(videoItem, "files")).toBe(false);
    expect(sharedContentItemMatchesTab(audioItem, "files")).toBe(false);
    expect(sharedContentItemMatchesTab(linkItem, "files")).toBe(false);

    // links tab: only links
    expect(sharedContentItemMatchesTab(linkItem, "links")).toBe(true);
    expect(sharedContentItemMatchesTab(photoItem, "links")).toBe(false);
    expect(sharedContentItemMatchesTab(videoItem, "links")).toBe(false);
    expect(sharedContentItemMatchesTab(audioItem, "links")).toBe(false);
    expect(sharedContentItemMatchesTab(docItem, "links")).toBe(false);
  });
});

describe("message presentation helpers", () => {
  it("grades emoji-only messages and returns standard styling for four or more emoji", () => {
    expect(emojiSizeClass("🥰")).toBe("emoji-only-xl");
    expect(emojiSizeClass("🥰 ❤️")).toBe("emoji-only-lg");
    expect(emojiSizeClass("🥰 ❤️ 👍")).toBe("emoji-only-md");
    expect(emojiSizeClass("🥰 ❤️ 👍 🎉")).toBe("");
  });

  it("hides sender names on incoming messages in direct chats", () => {
    expect(shouldShowMessageSender("direct", false)).toBe(false);
  });

  it("keeps sender names on incoming messages in multi-member chats", () => {
    expect(shouldShowMessageSender("group", false)).toBe(true);
    expect(shouldShowMessageSender("family", false)).toBe(true);
    expect(shouldShowMessageSender("channel", false)).toBe(true);
  });

  it("detects when the message list is near the bottom", () => {
    expect(isMessageListNearBottom(1000, 880, 100, 120)).toBe(true);
    expect(isMessageListNearBottom(1000, 700, 100, 120)).toBe(false);
  });

  it("counts messages that arrived after the bottom anchor", () => {
    const messages = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }];
    expect(countMessagesAfterAnchor(messages, "b")).toBe(2);
    expect(countMessagesAfterAnchor(messages, "d")).toBe(0);
    expect(countMessagesAfterAnchor(messages, null)).toBe(0);
  });

  it("uses the most advanced recipient state for an outgoing receipt", () => {
    expect(messageReceiptState({ statuses: [{ status: "sent" }] }, true)).toBe("sent");
    expect(messageReceiptState({ statuses: [] }, true)).toBe("sent");
    expect(messageReceiptState({ statuses: [{ status: "delivered" }] }, true)).toBe("delivered");
    expect(
      messageReceiptState({ statuses: [{ status: "delivered" }, { status: "read" }] }, true)
    ).toBe("read");
    expect(messageReceiptState({ statuses: [{ status: "read" }] }, false)).toBeNull();
    expect(messageReceiptState({ statuses: [], deliveryState: "sending" }, true)).toBeNull();
    expect(messageReceiptState({ statuses: [], deliveryState: "failed" }, true)).toBeNull();
  });

  it("formats delivery labels without the word Sending for pending messages", () => {
    const timestamp = "2026-08-17T12:34:00.000Z";
    const expectedTime = new Date(timestamp).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit"
    });
    expect(
      messageDeliveryLabel(
        { createdAt: timestamp, deliveryState: "sending" } as any,
        true
      )
    ).toBe(expectedTime);
    expect(
      messageDeliveryLabel(
        { createdAt: timestamp, deliveryState: "failed" } as any,
        true
      )
    ).toBe("Failed");
  });

  it("opens a forwarded group or a reply sender's direct chat", () => {
    const chats = [
      { id: "dm-tester", type: "direct" as const, members: [{ id: "tester" }] },
      { id: "group-video", type: "group" as const, members: [{ id: "tester" }] }
    ];
    expect(messageOriginChatId(chats, "group-video", "tester")).toBe("group-video");
    expect(messageOriginChatId(chats, null, "tester")).toBe("dm-tester");
    expect(messageOriginChatId(chats, null, "unknown")).toBeNull();
  });
});

describe("message gesture helpers", () => {
  it("opens a desktop message menu above a trigger that is near the viewport bottom", () => {
    expect(messageContextMenuPosition(320, 720, 1440, 800, false)).toEqual({
      x: 320,
      y: 360
    });
  });

  it("leaves a phone-sized right inset for the message menu", () => {
    expect(messageContextMenuPosition(340, 380, 375, 812, true)).toEqual({
      x: 115,
      y: 380
    });
  });
});

describe("call lifecycle helpers", () => {
  it("reports a backgrounded Android app as not foregrounded", () => {
    expect(androidAppStatePayload(false, "chat-a")).toEqual({
      foreground: false,
      activeChatId: ""
    });
  });

  it("reports the active chat only while Android is foregrounded", () => {
    expect(androidAppStatePayload(true, "chat-a")).toEqual({
      foreground: true,
      activeChatId: "chat-a"
    });
  });

  it("cancels an outgoing ringing call instead of ending it as failed", () => {
    expect(callTerminationEvent("outgoing")).toBe("call:cancel");
  });

  it("ends calls that have progressed beyond ringing", () => {
    expect(callTerminationEvent("connecting")).toBe("call:end");
    expect(callTerminationEvent("in-call")).toBe("call:end");
  });
});
