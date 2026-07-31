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
};

const logic = chatsPageModule as ChatsPageLogic;

describe("ChatsPage lifecycle decisions", () => {
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
});
