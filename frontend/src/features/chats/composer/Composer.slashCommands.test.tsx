import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Composer } from "./Composer";
import type { Chat } from "../../../api/chats";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const roots: Root[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    act(() => root.unmount());
  }
  document.body.replaceChildren();
});

const mockChat: Chat = {
  id: "chat-123",
  title: "Family Chat",
  type: "group",
  unreadCount: 0,
  isMuted: false,
  isPinned: false,
  isFavorite: false,
  members: []
};

describe("Composer slash commands", () => {
  function renderComposer(overrides: Partial<Parameters<typeof Composer>[0]> = {}) {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    roots.push(root);

    const defaultProps: Parameters<typeof Composer>[0] = {
      accessToken: "token-123",
      selectedChat: mockChat,
      allMembers: [],
      currentUser: { id: "user-1", displayName: "Ivan" },
      resolvedThemeMode: "light",
      channelCommentsDisabledForViewer: false,
      missingCommentThread: false,
      canPostInSelectedChannel: true,
      replyTarget: null,
      onCancelReply: vi.fn(),
      editTargetMessage: null,
      onCancelEdit: vi.fn(),
      composer: "",
      onComposerChange: vi.fn(),
      onComposerKeyDown: vi.fn(),
      onComposerSelectionUpdate: vi.fn(),
      onComposerFormat: vi.fn(),
      onComposerCut: vi.fn(),
      onComposerCopy: vi.fn(),
      onComposerPaste: vi.fn(),
      composerInputRef: { current: null },
      composerFormattingSelectionRef: { current: null },
      formattingToolbarAnchor: null,
      composerIsMultiline: false,
      onEnlargeComposer: vi.fn(),
      pendingAttachments: [],
      onRemovePendingAttachment: vi.fn(),
      isAttachmentSheetOpen: false,
      onAttachButtonClick: vi.fn(),
      onAttachmentSheetPick: vi.fn(),
      onCloseAttachmentSheet: vi.fn(),
      onFileSelect: vi.fn(),
      attachmentInputRef: { current: null },
      galleryAttachmentInputRef: { current: null },
      cameraAttachmentInputRef: { current: null },
      audioAttachmentInputRef: { current: null },
      documentAttachmentInputRef: { current: null },
      isEmojiPickerOpen: false,
      emojiPickerRef: { current: null },
      emojiPickerDockRef: { current: null },
      isDockedEmojiPicker: false,
      showDockedEmojiPicker: false,
      onToggleEmojiPicker: vi.fn(),
      onEmojiPick: vi.fn(),
      isUploading: false,
      isSendingMessage: false,
      isVoiceRecording: false,
      onVoicePressStart: vi.fn(),
      onVoicePressEnd: vi.fn(),
      onVoicePressCancel: vi.fn(),
      onSubmit: vi.fn(),
      ...overrides
    };

    act(() => {
      root.render(<Composer {...defaultProps} />);
    });

    return { container, defaultProps };
  }

  it("displays slash commands popup when composer begins with /", () => {
    const { container } = renderComposer({ composer: "/" });

    const menu = container.querySelector(".composer-slash-menu");
    expect(menu).not.toBeNull();

    const items = container.querySelectorAll(".slash-command-item");
    const itemSyntaxes = Array.from(items).map((el) => el.querySelector(".slash-item-syntax")?.textContent);

    expect(itemSyntaxes).toContain("/remind [in 2h | 18:00] <task>");
    expect(itemSyntaxes).toContain("/todo <task>");
    expect(itemSyntaxes).toContain("/split <amount> <description>");
    expect(itemSyntaxes).toContain("/location");
    expect(itemSyntaxes).toContain("/call [audio | video]");
    expect(itemSyntaxes).toContain("/meet [Topic]");
    expect(itemSyntaxes).toContain("/silent <message>");
    expect(itemSyntaxes).toContain("/urgent <message>");
    expect(itemSyntaxes).toContain("/spoiler <text>");
    expect(itemSyntaxes).toContain("/disappear [1h | 24h | off]");
    expect(itemSyntaxes).toContain("/pin");
    expect(itemSyntaxes).toContain("/mute");
    expect(itemSyntaxes).toContain("/shrug [text]");
    expect(itemSyntaxes).toContain("/tableflip [text]");
  });

  it("filters slash command candidates when typing query", () => {
    const { container } = renderComposer({ composer: "/sh" });

    const items = container.querySelectorAll(".slash-command-item");
    const itemSyntaxes = Array.from(items).map((el) => el.querySelector(".slash-item-syntax")?.textContent);

    expect(itemSyntaxes).toContain("/shrug [text]");
    expect(itemSyntaxes).not.toContain("/poll");
  });

  it("triggers onStartAudioCall when /call is selected from menu", () => {
    const onStartAudioCall = vi.fn();
    const onComposerChange = vi.fn();
    const { container } = renderComposer({ composer: "/call", onStartAudioCall, onComposerChange });

    const callItem = Array.from(container.querySelectorAll(".slash-command-item")).find((el) =>
      el.textContent?.includes("/call")
    );
    expect(callItem).toBeDefined();

    act(() => {
      callItem?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onStartAudioCall).toHaveBeenCalledTimes(1);
    expect(onComposerChange).toHaveBeenCalledWith("");
  });

  it("triggers onToggleMuted when /mute is selected from menu", () => {
    const onToggleMuted = vi.fn();
    const onComposerChange = vi.fn();
    const { container } = renderComposer({ composer: "/mute", onToggleMuted, onComposerChange });

    const muteItem = Array.from(container.querySelectorAll(".slash-command-item")).find((el) =>
      el.textContent?.includes("/mute")
    );
    expect(muteItem).toBeDefined();

    act(() => {
      muteItem?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onToggleMuted).toHaveBeenCalledTimes(1);
    expect(onComposerChange).toHaveBeenCalledWith("");
  });

  it("triggers onTogglePinned when /pin is selected from menu without replyTarget", () => {
    const onTogglePinned = vi.fn();
    const onComposerChange = vi.fn();
    const { container } = renderComposer({ composer: "/pin", onTogglePinned, onComposerChange });

    const pinItem = Array.from(container.querySelectorAll(".slash-command-item")).find((el) =>
      el.textContent?.includes("/pin")
    );
    expect(pinItem).toBeDefined();

    act(() => {
      pinItem?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onTogglePinned).toHaveBeenCalledTimes(1);
    expect(onComposerChange).toHaveBeenCalledWith("");
  });

  it("inserts shrug macro into composer when /shrug is selected", () => {
    const onComposerChange = vi.fn();
    const { container } = renderComposer({ composer: "/shrug", onComposerChange });

    const shrugItem = Array.from(container.querySelectorAll(".slash-command-item")).find((el) =>
      el.textContent?.includes("/shrug")
    );
    expect(shrugItem).toBeDefined();

    act(() => {
      shrugItem?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onComposerChange).toHaveBeenCalledWith(expect.stringContaining("¯\\_(ツ)_/¯"));
  });

  it("handles form submit for /call and /mute directly without calling onSubmit", () => {
    const onStartAudioCall = vi.fn();
    const onSubmit = vi.fn();
    const onComposerChange = vi.fn();
    const { container } = renderComposer({
      composer: "/call",
      onStartAudioCall,
      onSubmit,
      onComposerChange
    });

    const form = container.querySelector("form");
    expect(form).not.toBeNull();

    act(() => {
      form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });

    expect(onStartAudioCall).toHaveBeenCalledTimes(1);
    expect(onSubmit).not.toHaveBeenCalled();
    expect(onComposerChange).toHaveBeenCalledWith("");
  });
});
