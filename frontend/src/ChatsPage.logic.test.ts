import { describe, expect, it } from "vitest";

import * as chatsPageModule from "./pages/ChatsPage";

type ChatsPageLogic = {
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
});
