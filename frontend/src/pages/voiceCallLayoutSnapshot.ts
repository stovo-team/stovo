import type { CallPhase } from "../features/chats/shared/types";

export type VoiceCallLayoutSnapshot = { chatId: string; isExpanded: boolean };

type TransitionInput = {
  callPhase: CallPhase;
  activeCallChatId: string | null;
  activeCallChatType: string | null;
  selectedChatId: string | undefined;
  isExpanded: boolean;
};

type TransitionResult = {
  snapshot: VoiceCallLayoutSnapshot | null;
  restoreExpanded: boolean | null;
};

export function advanceVoiceCallLayoutSnapshot(
  snapshot: VoiceCallLayoutSnapshot | null,
  input: TransitionInput,
): TransitionResult {
  if (input.callPhase === "idle") {
    return {
      snapshot: null,
      restoreExpanded: snapshot && snapshot.chatId === input.selectedChatId ? snapshot.isExpanded : null,
    };
  }

  if (!input.activeCallChatId || input.activeCallChatType !== "voice") {
    return { snapshot: null, restoreExpanded: null };
  }

  if (snapshot?.chatId === input.activeCallChatId) {
    return { snapshot, restoreExpanded: null };
  }

  return {
    snapshot: { chatId: input.activeCallChatId, isExpanded: input.isExpanded },
    restoreExpanded: null,
  };
}
