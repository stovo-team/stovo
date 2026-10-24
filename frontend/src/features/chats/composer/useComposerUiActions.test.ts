import { describe, expect, it, vi } from "vitest";
import { useComposerUiActions } from "./useComposerUiActions";

describe("attachment picker entry", () => {
  it("opens default attachment choices after a previous checklist shortcut", () => {
    let tab = "checklist";
    let open = false;
    const actions = useComposerUiActions({
      inputRef: { current: null },
      closeEmojiPicker: vi.fn(),
      setAttachmentSheetOpen: (value) => { open = value; },
      setAttachmentSheetInitialTab: (value: string) => { tab = value; },
      setEditTargetMessage: vi.fn(),
      setMessageContextMenu: vi.fn()
    } as Parameters<typeof useComposerUiActions>[0]);
    actions.handleAttachButtonClick();
    expect(open).toBe(true);
    expect(tab).toBe("gallery");
  });
});
