import { ChangeEvent, CSSProperties, Dispatch, FormEvent, SetStateAction, useMemo, useRef, useState } from "react";

import type { User } from "../../../api/auth";
import { addChatMembers, Chat, Message, updateChat, updateChatMessageDelay, updateChatPinPermission, updateChatPreferences } from "../../../api/chats";
import { ApiError } from "../../../api/client";
import { uploadFile } from "../../../api/files";
import useFilePreviewUrl from "../../../hooks/useFilePreviewUrl";
import { canManageChat, canUpdateMediaVisibility } from "../shared/chatPresentation";

export type UseChatDetailsActionsParams = {
  accessToken: string | null;
  selectedChat: Chat | null;
  currentUser: User | null;
  setSelectedChat: Dispatch<SetStateAction<Chat | null>>;
  setChats: Dispatch<SetStateAction<Chat[]>>;
  onError: (message: string | null) => void;
  setIsChatMenuOpen: Dispatch<SetStateAction<boolean>>;
  messages: Message[];
  markChatRead: (chatId: string, messageId: string) => Promise<void>;
};

/**
 * Owns every mutation surfaced by the chat details/settings panel (title,
 * photo, wallpaper, media visibility, comments, pin permission, per-chat
 * preferences) plus the derived wallpaper preview/background style shared by
 * `ChatDetailsPanel` and the conversation surface behind it.
 */
export function useChatDetailsActions({
  accessToken,
  selectedChat,
  currentUser,
  setSelectedChat,
  setChats,
  onError,
  setIsChatMenuOpen,
  messages,
  markChatRead
}: UseChatDetailsActionsParams) {
  const [isChatMediaUploading, setIsChatMediaUploading] = useState(false);
  const [editingChatPhotoFile, setEditingChatPhotoFile] = useState<File | null>(null);
  const chatPhotoInputRef = useRef<HTMLInputElement | null>(null);
  const chatWallpaperInputRef = useRef<HTMLInputElement | null>(null);

  const canManageSelectedChat = selectedChat ? canManageChat(selectedChat, currentUser) : false;

  const wallpaperPreviewUrl = useFilePreviewUrl(
    accessToken,
    selectedChat?.wallpaper ?? null,
    Boolean(selectedChat?.wallpaper)
  );
  const wallpaperStyle = useMemo<CSSProperties | undefined>(() => {
    if (!wallpaperPreviewUrl) {
      return undefined;
    }
    return {
      ["--messages-panel-background" as string]: `url("${wallpaperPreviewUrl}")`,
      ["--wallpaper-background-size" as string]: "cover",
      ["--wallpaper-background-repeat" as string]: "no-repeat",
      ["--wallpaper-background-position" as string]: "center"
    };
  }, [wallpaperPreviewUrl]);

  function applyChatUpdate(updated: Chat) {
    setSelectedChat(updated);
    setChats((current) => current.map((c) => (c.id === updated.id ? updated : c)));
  }

  async function handleChatSettingsSubmit(event: FormEvent, chatTitleDraft: string) {
    event.preventDefault();
    if (!accessToken || !selectedChat || !canManageSelectedChat) {
      return;
    }
    if (!chatTitleDraft.trim()) {
      return;
    }

    onError(null);
    try {
      const chat = await updateChat(accessToken, selectedChat.id, {
        title: chatTitleDraft.trim()
      });
      applyChatUpdate(chat);
    } catch (err) {
      onError(err instanceof ApiError ? String(err.message) : "Could not update chat");
    }
  }

  function handleChatPhotoSelect(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    event.target.value = "";
    if (!accessToken || !selectedChat || !canManageSelectedChat || !file) {
      return;
    }

    setEditingChatPhotoFile(file);
  }

  async function handleSaveCroppedChatPhoto(croppedFile: File) {
    if (!accessToken || !selectedChat || !canManageSelectedChat) {
      return;
    }
    setEditingChatPhotoFile(null);
    setIsChatMediaUploading(true);
    onError(null);
    try {
      const uploaded = await uploadFile(accessToken, croppedFile);
      const chat = await updateChat(accessToken, selectedChat.id, {
        chatPhotoFileId: uploaded.id
      });
      applyChatUpdate(chat);
    } catch (err) {
      onError(err instanceof ApiError ? String(err.message) : "Could not update chat photo");
    } finally {
      setIsChatMediaUploading(false);
    }
  }

  async function handleMediaVisibilityChange(enabled: boolean) {
    if (!accessToken || !selectedChat || !canUpdateMediaVisibility(selectedChat, currentUser)) {
      return;
    }

    onError(null);
    try {
      const chat = await updateChat(accessToken, selectedChat.id, {
        mediaVisibility: enabled ? "family" : "members"
      });
      applyChatUpdate(chat);
    } catch (err) {
      onError(err instanceof ApiError ? String(err.message) : "Could not update media access");
    }
  }

  async function handleCommentsEnabledChange(enabled: boolean) {
    if (!accessToken || !selectedChat || selectedChat.type !== "channel" || !canManageSelectedChat) {
      return;
    }
    onError(null);
    try {
      const chat = await updateChat(accessToken, selectedChat.id, {
        commentsEnabled: enabled
      });
      applyChatUpdate(chat);
    } catch (err) {
      onError(err instanceof ApiError ? String(err.message) : "Could not update comments");
    }
  }

  async function handlePinPermissionChange(permission: "everyone" | "admins_only") {
    if (!accessToken || !selectedChat) {
      return;
    }
    try {
      const chat = await updateChatPinPermission(accessToken, selectedChat.id, permission);
      applyChatUpdate(chat);
    } catch {}
  }

  async function handleMessageDelayChange(delaySeconds: number) {
    if (!accessToken || !selectedChat) {
      return;
    }
    const previousChat = selectedChat;
    applyChatUpdate({ ...selectedChat, messageDelaySeconds: delaySeconds });
    try {
      const chat = await updateChatMessageDelay(accessToken, selectedChat.id, delaySeconds);
      applyChatUpdate(chat);
    } catch (err) {
      applyChatUpdate(previousChat);
      onError(err instanceof ApiError ? String(err.message) : "Could not update message delay");
    }
  }

  async function handleChatPreferenceChange(payload: {
    isMuted?: boolean;
    isPinned?: boolean;
    isFavorite?: boolean;
    wallpaperFileId?: string | null;
  }) {
    if (!accessToken || !selectedChat) {
      return;
    }

    onError(null);
    try {
      const chat = await updateChatPreferences(accessToken, selectedChat.id, payload);
      applyChatUpdate(chat);
      setIsChatMenuOpen(false);
    } catch (err) {
      onError(err instanceof ApiError ? String(err.message) : "Could not update chat");
    }
  }

  async function handleAddChatMember(userId: string) {
    if (!accessToken || !selectedChat || !canManageSelectedChat) {
      return;
    }
    onError(null);
    try {
      const chat = await addChatMembers(accessToken, selectedChat.id, [userId]);
      applyChatUpdate(chat);
    } catch (err) {
      onError(err instanceof ApiError ? String(err.message) : "Could not add person to chat");
      throw err;
    }
  }

  async function handleChatWallpaperSelect(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    event.target.value = "";
    if (!accessToken || !selectedChat || !file) {
      return;
    }
    if (!file.type.startsWith("image/")) {
      onError("Choose an image file (JPEG, PNG, GIF, or WebP).");
      return;
    }
    setIsChatMediaUploading(true);
    onError(null);
    try {
      const uploaded = await uploadFile(accessToken, file);
      const chat = await updateChatPreferences(accessToken, selectedChat.id, {
        wallpaperFileId: uploaded.id
      });
      applyChatUpdate(chat);
    } catch (err) {
      onError(err instanceof ApiError ? String(err.message) : "Could not update wallpaper");
    } finally {
      setIsChatMediaUploading(false);
    }
  }

  async function handleMarkSelectedChatRead() {
    if (!selectedChat) {
      return;
    }
    const latestMessage = messages.at(-1);
    if (!latestMessage) {
      setIsChatMenuOpen(false);
      return;
    }
    await markChatRead(selectedChat.id, latestMessage.id);
    setIsChatMenuOpen(false);
  }

  return {
    canManageSelectedChat,
    isChatMediaUploading,
    editingChatPhotoFile,
    setEditingChatPhotoFile,
    chatPhotoInputRef,
    chatWallpaperInputRef,
    wallpaperPreviewUrl,
    wallpaperStyle,
    handleChatSettingsSubmit,
    handleChatPhotoSelect,
    handleSaveCroppedChatPhoto,
    handleMediaVisibilityChange,
    handleCommentsEnabledChange,
    handlePinPermissionChange,
    handleMessageDelayChange,
    handleChatPreferenceChange,
    handleAddChatMember,
    handleChatWallpaperSelect,
    handleMarkSelectedChatRead
  };
}

export type ChatDetailsActions = ReturnType<typeof useChatDetailsActions>;
