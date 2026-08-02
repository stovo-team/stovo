import { describe, expect, it } from "vitest";

import * as chatsPageModule from "./pages/ChatsPage";

type ChatsPageLogic = {
  chatInfoControlVisibility?: (
    activeControl: "name" | "permissions" | null
  ) => { nameEditor: boolean; permissions: boolean };
  emojiSizeClass?: (content: string | null | undefined) => string;
  shouldShowMessageSender?: (
    chatType: "family" | "direct" | "group" | "channel" | "archive",
    mine: boolean
  ) => boolean;
  androidAppStatePayload?: (
    isActive: boolean,
    activeChatId?: string
  ) => { foreground: boolean; activeChatId: string };
  callTerminationEvent?: (
    phase: "idle" | "outgoing" | "incoming" | "connecting" | "in-call"
  ) => "call:cancel" | "call:end";
  messageContextMenuPosition?: (
    x: number,
    y: number,
    viewportWidth: number,
    viewportHeight: number,
    isMobile: boolean
  ) => { x: number; y: number };
  messageReceiptState?: (
    message: {
      statuses: Array<{ status: "sent" | "delivered" | "read" }>;
      deliveryState?: "sending" | "failed";
    },
    mine: boolean
  ) => "sent" | "delivered" | "read" | null;
  messageOriginChatId?: (
    chats: Array<{ id: string; type: "direct" | "group"; members: Array<{ id: string }> }>,
    forwardedChatId: string | null | undefined,
    replySenderId: string | null | undefined
  ) => string | null;
  chatListLayoutClass?: (minimizedChatLayout: boolean) => string;
  compactChatListLeadingVisual?: (
    chatType: "family" | "direct" | "group" | "channel" | "archive"
  ) => "lock" | "hash" | "archive" | "avatar";
};

const logic = chatsPageModule as ChatsPageLogic;

describe("ChatsPage lifecycle decisions", () => {
  it("selects the minimized chat-list class only when the family setting is enabled", () => {
    expect(logic.chatListLayoutClass).toBeTypeOf("function");
    expect(logic.chatListLayoutClass?.(true)).toBe(" messenger-shell--minimized-chat-layout");
    expect(logic.chatListLayoutClass?.(false)).toBe("");
  });

  it("uses compact type markers for groups and channels while retaining DM avatars", () => {
    expect(logic.compactChatListLeadingVisual).toBeTypeOf("function");
    expect(logic.compactChatListLeadingVisual?.("group")).toBe("lock");
    expect(logic.compactChatListLeadingVisual?.("family")).toBe("lock");
    expect(logic.compactChatListLeadingVisual?.("channel")).toBe("hash");
    expect(logic.compactChatListLeadingVisual?.("direct")).toBe("avatar");
    expect(logic.compactChatListLeadingVisual?.("archive")).toBe("archive");
  });

  it("grades emoji-only messages and returns standard styling for four or more emoji", () => {
    expect(logic.emojiSizeClass).toBeTypeOf("function");
    expect(logic.emojiSizeClass?.("🥰")).toBe("emoji-only-xl");
    expect(logic.emojiSizeClass?.("🥰 ❤️")).toBe("emoji-only-lg");
    expect(logic.emojiSizeClass?.("🥰 ❤️ 👍")).toBe("emoji-only-md");
    expect(logic.emojiSizeClass?.("🥰 ❤️ 👍 🎉")).toBe("");
  });

  it("hides sender names on incoming messages in direct chats", () => {
    expect(logic.shouldShowMessageSender).toBeTypeOf("function");
    expect(logic.shouldShowMessageSender?.("direct", false)).toBe(false);
  });

  it("keeps sender names on incoming messages in multi-member chats", () => {
    expect(logic.shouldShowMessageSender?.("group", false)).toBe(true);
    expect(logic.shouldShowMessageSender?.("family", false)).toBe(true);
    expect(logic.shouldShowMessageSender?.("channel", false)).toBe(true);
  });

  it("reports a backgrounded Android app as not foregrounded", () => {
    expect(logic.androidAppStatePayload).toBeTypeOf("function");
    expect(logic.androidAppStatePayload?.(false, "chat-a")).toEqual({
      foreground: false,
      activeChatId: ""
    });
  });

  it("reports the active chat only while Android is foregrounded", () => {
    expect(logic.androidAppStatePayload).toBeTypeOf("function");
    expect(logic.androidAppStatePayload?.(true, "chat-a")).toEqual({
      foreground: true,
      activeChatId: "chat-a"
    });
  });

  it("cancels an outgoing ringing call instead of ending it as failed", () => {
    expect(logic.callTerminationEvent).toBeTypeOf("function");
    expect(logic.callTerminationEvent?.("outgoing")).toBe("call:cancel");
  });

  it("ends calls that have progressed beyond ringing", () => {
    expect(logic.callTerminationEvent).toBeTypeOf("function");
    expect(logic.callTerminationEvent?.("connecting")).toBe("call:end");
    expect(logic.callTerminationEvent?.("in-call")).toBe("call:end");
  });

  it("shows only the chat-details control requested by its icon", () => {
    expect(logic.chatInfoControlVisibility).toBeTypeOf("function");
    expect(logic.chatInfoControlVisibility?.(null)).toEqual({
      nameEditor: false,
      permissions: false
    });
    expect(logic.chatInfoControlVisibility?.("name")).toEqual({
      nameEditor: true,
      permissions: false
    });
    expect(logic.chatInfoControlVisibility?.("permissions")).toEqual({
      nameEditor: false,
      permissions: true
    });
  });

  it("opens a desktop message menu above a trigger that is near the viewport bottom", () => {
    expect(logic.messageContextMenuPosition).toBeTypeOf("function");
    expect(logic.messageContextMenuPosition?.(320, 720, 1440, 800, false)).toEqual({
      x: 320,
      y: 360
    });
  });

  it("leaves a phone-sized right inset for the message menu", () => {
    expect(logic.messageContextMenuPosition?.(340, 380, 375, 812, true)).toEqual({
      x: 115,
      y: 380
    });
  });
  it("uses the most advanced recipient state for an outgoing receipt", () => {
    expect(logic.messageReceiptState).toBeTypeOf("function");
    expect(logic.messageReceiptState?.({ statuses: [{ status: "sent" }] }, true)).toBe("sent");
    expect(logic.messageReceiptState?.({ statuses: [{ status: "delivered" }] }, true)).toBe("delivered");
    expect(
      logic.messageReceiptState?.(
        { statuses: [{ status: "delivered" }, { status: "read" }] },
        true
      )
    ).toBe("read");
    expect(logic.messageReceiptState?.({ statuses: [{ status: "read" }] }, false)).toBeNull();
  });

  it("opens a forwarded group or a reply sender's direct chat", () => {
    expect(logic.messageOriginChatId).toBeTypeOf("function");
    const chats = [
      { id: "dm-tester", type: "direct" as const, members: [{ id: "tester" }] },
      { id: "group-video", type: "group" as const, members: [{ id: "tester" }] }
    ];
    expect(logic.messageOriginChatId?.(chats, "group-video", "tester")).toBe("group-video");
    expect(logic.messageOriginChatId?.(chats, null, "tester")).toBe("dm-tester");
    expect(logic.messageOriginChatId?.(chats, null, "unknown")).toBeNull();
  });
});
