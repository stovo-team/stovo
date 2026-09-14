import { ChangeEvent, CSSProperties, Dispatch, FormEvent, MutableRefObject, SetStateAction, useMemo, useRef, useState } from "react";

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
  chatMutationVersionRef: MutableRefObject<Record<string, number>>;
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
  chatMutationVersionRef,
  onError,
  setIsChatMenuOpen,
  messages,
  markChatRead
}: UseChatDetailsActionsParams) {
  const [isChatMediaUploading, setIsChatMediaUploading] = useState(false);
  const [editingChatPhotoFile, setEditingChatPhotoFile] = useState<File | null>(null);
  const [editingChatWallpaperFile, setEditingChatWallpaperFile] = useState<File | null>(null);
  // This belongs above ChatDetailsPanel: a background refresh can briefly
  // unmount that panel while a settings request is in flight.
  const [pendingMessageDelay, setPendingMessageDelay] = useState<{ chatId: string; delaySeconds: number } | null>(null);
  const [messageDelayStatus, setMessageDelayStatus] = useState<{ chatId: string; state: "saving" | "error"; message: string } | null>(null);
  const chatPhotoInputRef = useRef<HTMLInputElement | null>(null);
  const chatWallpaperInputRef = useRef<HTMLInputElement | null>(null);
  const messageDelayRequestRef = useRef(0);

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
    chatMutationVersionRef.current[updated.id] = (chatMutationVersionRef.current[updated.id] ?? 0) + 1;
    setSelectedChat(updated);
    setChats((current) => current.map((c) => (c.id === updated.id ? updated : c)));
  }

  async function handleDescriptionChange(description: string): Promise<boolean> {
    if (!accessToken || !selectedChat || !canManageSelectedChat) {
      return false;
    }
    onError(null);
    try {
      const trimmed = description.trim();
      const chat = await updateChat(accessToken, selectedChat.id, {
        description: trimmed || null
      });
      applyChatUpdate(chat);
      return true;
    } catch (err) {
      onError(err instanceof ApiError ? String(err.message) : "Could not update description");
      return false;
    }
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
      return false;
    }
    const requestId = messageDelayRequestRef.current + 1;
    messageDelayRequestRef.current = requestId;
    const previousChat = selectedChat;
    setPendingMessageDelay({ chatId: selectedChat.id, delaySeconds });
    setMessageDelayStatus({ chatId: selectedChat.id, state: "saving", message: "Saving message delay…" });
    onError(null);
    applyChatUpdate({ ...selectedChat, messageDelaySeconds: delaySeconds });
    try {
      const chat = await updateChatMessageDelay(accessToken, selectedChat.id, delaySeconds);
      if (messageDelayRequestRef.current === requestId) {
        if (chat.messageDelaySeconds !== delaySeconds) {
          setPendingMessageDelay(null);
          setMessageDelayStatus({ chatId: selectedChat.id, state: "error", message: `Message delay was not saved: requested ${delaySeconds}s, server returned ${chat.messageDelaySeconds ?? 0}s.` });
          return false;
        }
        applyChatUpdate(chat);
        setPendingMessageDelay(null);
        setMessageDelayStatus(null);
      }
      return true;
    } catch (err) {
      if (messageDelayRequestRef.current === requestId) {
        applyChatUpdate(previousChat);
        setPendingMessageDelay(null);
        const message = err instanceof ApiError
          ? `Could not save message delay (${err.status}): ${String(err.message)}`
          : "Could not save message delay: network request failed";
        setMessageDelayStatus({ chatId: selectedChat.id, state: "error", message });
        onError(message);
      }
      return false;
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

  function handleChatWallpaperSelect(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    event.target.value = "";
    if (!accessToken || !selectedChat || !file) {
      return;
    }
    if (!file.type.startsWith("image/")) {
      onError("Choose an image file (JPEG, PNG, GIF, or WebP).");
      return;
    }
    setEditingChatWallpaperFile(file);
  }

  async function handleSaveEditedChatWallpaper(wallpaperFile: File) {
    if (!accessToken || !selectedChat) {
      return;
    }
    setEditingChatWallpaperFile(null);
    setIsChatMediaUploading(true);
    onError(null);
    try {
      const uploaded = await uploadFile(accessToken, wallpaperFile);
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
    pendingMessageDelay: pendingMessageDelay?.chatId === selectedChat?.id ? pendingMessageDelay?.delaySeconds ?? null : null,
    messageDelayStatus: messageDelayStatus?.chatId === selectedChat?.id ? messageDelayStatus : null,
    editingChatPhotoFile,
    setEditingChatPhotoFile,
    editingChatWallpaperFile,
    setEditingChatWallpaperFile,
    chatPhotoInputRef,
    chatWallpaperInputRef,
    wallpaperPreviewUrl,
    wallpaperStyle,
    handleChatSettingsSubmit,
    handleDescriptionChange,
    handleChatPhotoSelect,
    handleSaveCroppedChatPhoto,
    handleMediaVisibilityChange,
    handleCommentsEnabledChange,
    handlePinPermissionChange,
    handleMessageDelayChange,
    handleChatPreferenceChange,
    handleAddChatMember,
    handleChatWallpaperSelect,
    handleSaveEditedChatWallpaper,
    handleMarkSelectedChatRead
  };
}

export type ChatDetailsActions = ReturnType<typeof useChatDetailsActions>;
