import { describe, expect, it } from "vitest";
import { advanceVoiceCallLayoutSnapshot } from "./voiceCallLayoutSnapshot";

describe("Voice Channel call layout transitions", () => {
  it.each([false, true])("restores the starting expanded=%s state after layout changes during a call", (startingExpanded) => {
    const start = advanceVoiceCallLayoutSnapshot(null, {
      callPhase: "connecting",
      activeCallChatId: "voice-1",
      activeCallChatType: "voice",
      selectedChatId: "voice-1",
      isExpanded: startingExpanded,
    });
    expect(start.snapshot).toEqual({ chatId: "voice-1", isExpanded: startingExpanded });

    const changedDuringCall = advanceVoiceCallLayoutSnapshot(start.snapshot, {
      callPhase: "in-call",
      activeCallChatId: "voice-1",
      activeCallChatType: "voice",
      selectedChatId: "voice-1",
      isExpanded: !startingExpanded,
    });
    expect(changedDuringCall.snapshot).toEqual(start.snapshot);

    const ended = advanceVoiceCallLayoutSnapshot(changedDuringCall.snapshot, {
      callPhase: "idle",
      activeCallChatId: null,
      activeCallChatType: null,
      selectedChatId: "voice-1",
      isExpanded: !startingExpanded,
    });
    expect(ended.snapshot).toBeNull();
    expect(ended.restoreExpanded).toBe(startingExpanded);
  });

  it("does not restore a voice layout after the user selects a different chat", () => {
    const started = advanceVoiceCallLayoutSnapshot(null, {
      callPhase: "connecting",
      activeCallChatId: "voice-1",
      activeCallChatType: "voice",
      selectedChatId: "voice-1",
      isExpanded: true,
    });
    const ended = advanceVoiceCallLayoutSnapshot(started.snapshot, {
      callPhase: "idle",
      activeCallChatId: null,
      activeCallChatType: null,
      selectedChatId: "group-2",
      isExpanded: false,
    });
    expect(ended.restoreExpanded).toBeNull();
  });

  it("handles an empty snapshot and does not capture non-Voice calls", () => {
    expect(advanceVoiceCallLayoutSnapshot(null, {
      callPhase: "idle",
      activeCallChatId: null,
      activeCallChatType: null,
      selectedChatId: undefined,
      isExpanded: false,
    })).toEqual({ snapshot: null, restoreExpanded: null });

    expect(advanceVoiceCallLayoutSnapshot(null, {
      callPhase: "connecting",
      activeCallChatId: "group-2",
      activeCallChatType: "group",
      selectedChatId: "group-2",
      isExpanded: true,
    })).toEqual({ snapshot: null, restoreExpanded: null });
  });
});
