import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

const picker = vi.hoisted(() => ({
  sendSelectedFiles: null as ((files: File[], message: string) => unknown) | null
}));

vi.mock("../../../components/AttachmentPickerSheet", () => ({
  default: (props: { onSendSelectedFiles?: (files: File[], message: string) => unknown }) => {
    picker.sendSelectedFiles = props.onSendSelectedFiles ?? null;
    return null;
  }
}));

import { Composer } from "./Composer";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const roots: Root[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount());
  document.body.replaceChildren();
  picker.sendSelectedFiles = null;
});

describe("Composer native attachment send", () => {
  it("submits previously queued attachments together with the selected files", () => {
    const queued = { localId: "queued", file: new File(["document"], "report.pdf", { type: "application/pdf" }), previewUrl: null };
    const selected = new File(["music"], "song.mp3", { type: "audio/mpeg" });
    const onSubmit = vi.fn();
    const ref = <T,>() => ({ current: null as T | null });
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    roots.push(root);

    act(() => {
      root.render(
        <Composer
          accessToken={null}
          selectedChat={null}
          resolvedThemeMode="dark"
          channelCommentsDisabledForViewer={false}
          missingCommentThread={false}
          canPostInSelectedChannel={true}
          replyTarget={null}
          onCancelReply={vi.fn()}
          editTargetMessage={null}
          onCancelEdit={vi.fn()}
          composer=""
          onComposerChange={vi.fn()}
          onComposerKeyDown={vi.fn()}
          onComposerSelectionUpdate={vi.fn()}
          onComposerFormat={vi.fn()}
          onComposerCut={vi.fn()}
          onComposerCopy={vi.fn()}
          onComposerPaste={vi.fn()}
          composerInputRef={ref<HTMLTextAreaElement>()}
          composerFormattingSelectionRef={ref()}
          formattingToolbarAnchor={null}
          composerIsMultiline={false}
          onEnlargeComposer={vi.fn()}
          pendingAttachments={[queued]}
          onRemovePendingAttachment={vi.fn()}
          isAttachmentSheetOpen={false}
          onAttachButtonClick={vi.fn()}
          onAttachmentSheetPick={vi.fn()}
          onCloseAttachmentSheet={vi.fn()}
          onFileSelect={vi.fn()}
          attachmentInputRef={ref<HTMLInputElement>()}
          galleryAttachmentInputRef={ref<HTMLInputElement>()}
          cameraAttachmentInputRef={ref<HTMLInputElement>()}
          audioAttachmentInputRef={ref<HTMLInputElement>()}
          documentAttachmentInputRef={ref<HTMLInputElement>()}
          isEmojiPickerOpen={false}
          emojiPickerRef={ref<HTMLDivElement>()}
          emojiPickerDockRef={ref<HTMLDivElement>()}
          isDockedEmojiPicker={false}
          showDockedEmojiPicker={false}
          onToggleEmojiPicker={vi.fn()}
          onEmojiPick={vi.fn()}
          isUploading={false}
          isSendingMessage={false}
          isVoiceRecording={false}
          onVoicePressStart={vi.fn()}
          onVoicePressEnd={vi.fn()}
          onVoicePressCancel={vi.fn()}
          onSubmit={onSubmit}
        />
      );
    });

    expect(picker.sendSelectedFiles).toBeTypeOf("function");
    act(() => { void picker.sendSelectedFiles?.([selected], "mixed message"); });

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0][1]).toHaveLength(2);
    expect(onSubmit.mock.calls[0][1]?.map((attachment) => attachment.file.name)).toEqual(["report.pdf", "song.mp3"]);
    expect(onSubmit.mock.calls[0][2]).toBe("mixed message");
  });
});
