import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Composer } from "./Composer";
import { extractMentionedUserIds } from "./useMessageComposer";
import type { Chat, ChatMember } from "../../../api/chats";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const roots: Root[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    act(() => root.unmount());
  }
  document.body.replaceChildren();
});

const mockMember1: ChatMember = {
  id: "user-1",
  displayName: "Alice Smith",
  username: "alice",
  role: "admin",
  publicKey: null,
  profilePhoto: null
};

const mockMember2: ChatMember = {
  id: "user-2",
  displayName: "Bob Jones",
  username: "bobjones",
  role: "member",
  publicKey: null,
  profilePhoto: null
};

const mockMember3: ChatMember = {
  id: "user-3",
  displayName: "Charlie Brown",
  username: "charlie",
  role: "member",
  publicKey: null,
  profilePhoto: null
};

function createMockChat(type: Chat["type"], members: ChatMember[]): Chat {
  return {
    id: `chat-${type}-1`,
    familyId: "fam-1",
    type,
    title: `${type} chat`,
    createdBy: "user-1",
    mediaVisibility: "members",
    commentsEnabled: true,
    encryptionProtocol: "server_at_rest",
    mediaVisibilityPendingApproval: false,
    mediaVisibilityApprovalCount: 0,
    mediaVisibilityApprovalRequired: 0,
    myMediaVisibilityApproval: true,
    chatPhoto: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    members,
    unreadCount: 0,
    lastMessageId: null,
    lastMessageSenderId: null,
    lastMessageSenderDisplayName: null,
    lastMessageContent: null,
    lastMessageType: null,
    lastMessageCreatedAt: null,
    isMuted: false,
    isPinned: false,
    isFavorite: false
  };
}

describe("extractMentionedUserIds", () => {
  const members = [mockMember1, mockMember2, mockMember3];

  it("returns empty array when content or members are empty", () => {
    expect(extractMentionedUserIds([], "user-1", "hello")).toEqual([]);
    expect(extractMentionedUserIds(members, "user-1", "")).toEqual([]);
    expect(extractMentionedUserIds(members, "user-1", null)).toEqual([]);
  });

  it("extracts mentioned user id from group members", () => {
    const ids = extractMentionedUserIds(members, "user-1", "Hey @bobjones check this out");
    expect(ids).toEqual(["user-2"]);
  });

  it("extracts multiple mentioned users", () => {
    const ids = extractMentionedUserIds(members, "user-1", "cc @bobjones and @charlie!");
    expect(ids).toEqual(["user-2", "user-3"]);
  });

  it("includes the current user when self-mentioned", () => {
    const ids = extractMentionedUserIds(members, "user-1", "I am @alice hello");
    expect(ids).toEqual(["user-1"]);
  });

  it("matches by displayName even when username exists", () => {
    const ids = extractMentionedUserIds(members, "user-1", "Hello @Bob Jones please review");
    expect(ids).toEqual(["user-2"]);
  });

  it("matches case-insensitively and at word boundaries", () => {
    const ids = extractMentionedUserIds(members, "user-1", "Hi @BobJones, how are you?");
    expect(ids).toEqual(["user-2"]);
  });
});

describe("Composer mention popup and insertion", () => {
  it("shows mention candidates when typing @ in a group chat", () => {
    const groupChat = createMockChat("group", [mockMember1, mockMember2, mockMember3]);
    const onComposerChange = vi.fn();
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    roots.push(root);

    act(() => {
      root.render(
        <Composer
          accessToken="test"
          selectedChat={groupChat}
          resolvedThemeMode="dark"
          channelCommentsDisabledForViewer={false}
          missingCommentThread={false}
          canPostInSelectedChannel={true}
          replyTarget={null}
          isInThreadMode={false}
          onCancelReply={vi.fn()}
          editTargetMessage={null}
          onCancelEdit={vi.fn()}
          composer="Hello @"
          onComposerChange={onComposerChange}
          onComposerKeyDown={vi.fn()}
          onComposerFocus={vi.fn()}
          onComposerSelectionUpdate={vi.fn()}
          onComposerFormat={vi.fn()}
          onComposerCut={vi.fn()}
          onComposerCopy={vi.fn()}
          onComposerPaste={vi.fn()}
          composerInputRef={{ current: null }}
          composerFormattingSelectionRef={{ current: null }}
          formattingToolbarAnchor={null}
          composerIsMultiline={false}
          composerLineCount={1}
          onEnlargeComposer={vi.fn()}
          isAttachmentSheetOpen={false}
          attachmentSheetTriggerRef={{ current: null }}
          attachmentSheetAnchorRect={null}
          onAttachButtonClick={vi.fn()}
          onAttachmentSheetPick={vi.fn()}
          onCloseAttachmentSheet={vi.fn()}
          onFileSelect={vi.fn()}
          pendingAttachments={[]}
          onRemovePendingAttachment={vi.fn()}
          onEditPendingAttachment={vi.fn()}
          galleryAttachmentInputRef={{ current: null }}
          cameraAttachmentInputRef={{ current: null }}
          audioAttachmentInputRef={{ current: null }}
          documentAttachmentInputRef={{ current: null }}
          isEmojiPickerOpen={false}
          emojiPickerRef={{ current: null }}
          emojiPickerDockRef={{ current: null }}
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
          onSubmit={vi.fn()}
        />
      );
    });

    const menu = container.querySelector(".composer-mention-menu");
    expect(menu).not.toBeNull();
    const options = menu?.querySelectorAll("button[role='option']");
    expect(options?.length).toBe(3);
    expect(options?.[0].textContent).toContain("@alice");
  });

  it("shows mention candidates when typing @ in a direct chat", () => {
    const directChat = createMockChat("direct", [mockMember1, mockMember2]);
    const onComposerChange = vi.fn();
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    roots.push(root);

    act(() => {
      root.render(
        <Composer
          accessToken="test"
          selectedChat={directChat}
          resolvedThemeMode="dark"
          channelCommentsDisabledForViewer={false}
          missingCommentThread={false}
          canPostInSelectedChannel={true}
          replyTarget={null}
          isInThreadMode={false}
          onCancelReply={vi.fn()}
          editTargetMessage={null}
          onCancelEdit={vi.fn()}
          composer="@bob"
          onComposerChange={onComposerChange}
          onComposerKeyDown={vi.fn()}
          onComposerFocus={vi.fn()}
          onComposerSelectionUpdate={vi.fn()}
          onComposerFormat={vi.fn()}
          onComposerCut={vi.fn()}
          onComposerCopy={vi.fn()}
          onComposerPaste={vi.fn()}
          composerInputRef={{ current: null }}
          composerFormattingSelectionRef={{ current: null }}
          formattingToolbarAnchor={null}
          composerIsMultiline={false}
          composerLineCount={1}
          onEnlargeComposer={vi.fn()}
          isAttachmentSheetOpen={false}
          attachmentSheetTriggerRef={{ current: null }}
          attachmentSheetAnchorRect={null}
          onAttachButtonClick={vi.fn()}
          onAttachmentSheetPick={vi.fn()}
          onCloseAttachmentSheet={vi.fn()}
          onFileSelect={vi.fn()}
          pendingAttachments={[]}
          onRemovePendingAttachment={vi.fn()}
          onEditPendingAttachment={vi.fn()}
          galleryAttachmentInputRef={{ current: null }}
          cameraAttachmentInputRef={{ current: null }}
          audioAttachmentInputRef={{ current: null }}
          documentAttachmentInputRef={{ current: null }}
          isEmojiPickerOpen={false}
          emojiPickerRef={{ current: null }}
          emojiPickerDockRef={{ current: null }}
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
          onSubmit={vi.fn()}
        />
      );
    });

    const menu = container.querySelector(".composer-mention-menu");
    expect(menu).not.toBeNull();
    const options = menu?.querySelectorAll("button[role='option']");
    expect(options?.length).toBe(1);
    expect(options?.[0].textContent).toContain("@bobjones");

    act(() => {
      (options?.[0] as HTMLButtonElement)?.click();
    });
    expect(onComposerChange).toHaveBeenCalledWith("@bobjones ");
  });

  it("shows mention candidates when typing @ in a channel chat", () => {
    const channelChat = createMockChat("channel", [mockMember1, mockMember2, mockMember3]);
    const onComposerChange = vi.fn();
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    roots.push(root);

    act(() => {
      root.render(
        <Composer
          accessToken="test"
          selectedChat={channelChat}
          resolvedThemeMode="dark"
          channelCommentsDisabledForViewer={false}
          missingCommentThread={false}
          canPostInSelectedChannel={true}
          replyTarget={null}
          isInThreadMode={false}
          onCancelReply={vi.fn()}
          editTargetMessage={null}
          onCancelEdit={vi.fn()}
          composer="Announcement for @char"
          onComposerChange={onComposerChange}
          onComposerKeyDown={vi.fn()}
          onComposerFocus={vi.fn()}
          onComposerSelectionUpdate={vi.fn()}
          onComposerFormat={vi.fn()}
          onComposerCut={vi.fn()}
          onComposerCopy={vi.fn()}
          onComposerPaste={vi.fn()}
          composerInputRef={{ current: null }}
          composerFormattingSelectionRef={{ current: null }}
          formattingToolbarAnchor={null}
          composerIsMultiline={false}
          composerLineCount={1}
          onEnlargeComposer={vi.fn()}
          isAttachmentSheetOpen={false}
          attachmentSheetTriggerRef={{ current: null }}
          attachmentSheetAnchorRect={null}
          onAttachButtonClick={vi.fn()}
          onAttachmentSheetPick={vi.fn()}
          onCloseAttachmentSheet={vi.fn()}
          onFileSelect={vi.fn()}
          pendingAttachments={[]}
          onRemovePendingAttachment={vi.fn()}
          onEditPendingAttachment={vi.fn()}
          galleryAttachmentInputRef={{ current: null }}
          cameraAttachmentInputRef={{ current: null }}
          audioAttachmentInputRef={{ current: null }}
          documentAttachmentInputRef={{ current: null }}
          isEmojiPickerOpen={false}
          emojiPickerRef={{ current: null }}
          emojiPickerDockRef={{ current: null }}
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
          onSubmit={vi.fn()}
        />
      );
    });

    const menu = container.querySelector(".composer-mention-menu");
    expect(menu).not.toBeNull();
    const options = menu?.querySelectorAll("button[role='option']");
    expect(options?.length).toBe(1);
    expect(options?.[0].textContent).toContain("@charlie");

    act(() => {
      (options?.[0] as HTMLButtonElement)?.click();
    });
    expect(onComposerChange).toHaveBeenCalledWith("Announcement for @charlie ");
  });

  it("supports keyboard navigation (ArrowDown, Enter) to select mention candidate", () => {
    const groupChat = createMockChat("group", [mockMember1, mockMember2, mockMember3]);
    const onComposerChange = vi.fn();
    const onComposerKeyDown = vi.fn();
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    roots.push(root);

    act(() => {
      root.render(
        <Composer
          accessToken="test"
          selectedChat={groupChat}
          resolvedThemeMode="dark"
          channelCommentsDisabledForViewer={false}
          missingCommentThread={false}
          canPostInSelectedChannel={true}
          replyTarget={null}
          isInThreadMode={false}
          onCancelReply={vi.fn()}
          editTargetMessage={null}
          onCancelEdit={vi.fn()}
          composer="@"
          onComposerChange={onComposerChange}
          onComposerKeyDown={onComposerKeyDown}
          onComposerFocus={vi.fn()}
          onComposerSelectionUpdate={vi.fn()}
          onComposerFormat={vi.fn()}
          onComposerCut={vi.fn()}
          onComposerCopy={vi.fn()}
          onComposerPaste={vi.fn()}
          composerInputRef={{ current: null }}
          composerFormattingSelectionRef={{ current: null }}
          formattingToolbarAnchor={null}
          composerIsMultiline={false}
          composerLineCount={1}
          onEnlargeComposer={vi.fn()}
          isAttachmentSheetOpen={false}
          attachmentSheetTriggerRef={{ current: null }}
          attachmentSheetAnchorRect={null}
          onAttachButtonClick={vi.fn()}
          onAttachmentSheetPick={vi.fn()}
          onCloseAttachmentSheet={vi.fn()}
          onFileSelect={vi.fn()}
          pendingAttachments={[]}
          onRemovePendingAttachment={vi.fn()}
          onEditPendingAttachment={vi.fn()}
          galleryAttachmentInputRef={{ current: null }}
          cameraAttachmentInputRef={{ current: null }}
          audioAttachmentInputRef={{ current: null }}
          documentAttachmentInputRef={{ current: null }}
          isEmojiPickerOpen={false}
          emojiPickerRef={{ current: null }}
          emojiPickerDockRef={{ current: null }}
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
          onSubmit={vi.fn()}
        />
      );
    });

    const textarea = container.querySelector("textarea") as HTMLTextAreaElement;
    expect(textarea).not.toBeNull();

    // Navigate to second item (Bob Jones / @bobjones)
    act(() => {
      textarea.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    });

    // Press Enter to select
    act(() => {
      textarea.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });

    expect(onComposerChange).toHaveBeenCalledWith("@bobjones ");
    expect(onComposerKeyDown).not.toHaveBeenCalled();
  });

  it("dismisses mention menu on Escape key", () => {
    const groupChat = createMockChat("group", [mockMember1, mockMember2]);
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    roots.push(root);

    act(() => {
      root.render(
        <Composer
          accessToken="test"
          selectedChat={groupChat}
          resolvedThemeMode="dark"
          channelCommentsDisabledForViewer={false}
          missingCommentThread={false}
          canPostInSelectedChannel={true}
          replyTarget={null}
          isInThreadMode={false}
          onCancelReply={vi.fn()}
          editTargetMessage={null}
          onCancelEdit={vi.fn()}
          composer="@"
          onComposerChange={vi.fn()}
          onComposerKeyDown={vi.fn()}
          onComposerFocus={vi.fn()}
          onComposerSelectionUpdate={vi.fn()}
          onComposerFormat={vi.fn()}
          onComposerCut={vi.fn()}
          onComposerCopy={vi.fn()}
          onComposerPaste={vi.fn()}
          composerInputRef={{ current: null }}
          composerFormattingSelectionRef={{ current: null }}
          formattingToolbarAnchor={null}
          composerIsMultiline={false}
          composerLineCount={1}
          onEnlargeComposer={vi.fn()}
          isAttachmentSheetOpen={false}
          attachmentSheetTriggerRef={{ current: null }}
          attachmentSheetAnchorRect={null}
          onAttachButtonClick={vi.fn()}
          onAttachmentSheetPick={vi.fn()}
          onCloseAttachmentSheet={vi.fn()}
          onFileSelect={vi.fn()}
          pendingAttachments={[]}
          onRemovePendingAttachment={vi.fn()}
          onEditPendingAttachment={vi.fn()}
          galleryAttachmentInputRef={{ current: null }}
          cameraAttachmentInputRef={{ current: null }}
          audioAttachmentInputRef={{ current: null }}
          documentAttachmentInputRef={{ current: null }}
          isEmojiPickerOpen={false}
          emojiPickerRef={{ current: null }}
          emojiPickerDockRef={{ current: null }}
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
          onSubmit={vi.fn()}
        />
      );
    });

    expect(container.querySelector(".composer-mention-menu")).not.toBeNull();

    const textarea = container.querySelector("textarea") as HTMLTextAreaElement;
    act(() => {
      textarea.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });

    expect(container.querySelector(".composer-mention-menu")).toBeNull();
  });
});