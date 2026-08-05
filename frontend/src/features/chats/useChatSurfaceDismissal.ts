import { Dispatch, RefObject, SetStateAction, useCallback, useEffect } from "react";
import type { NavigateFunction } from "react-router-dom";
import { Capacitor } from "@capacitor/core";
import { App } from "@capacitor/app";

import type { Message } from "./shared/types";
import type { NewChatScreen } from "./shared/types";
import type { MessageContextMenuState } from "./conversation/MessageContextMenu";

export type UseChatSurfaceDismissalParams = {
  chatId: string | undefined;
  navigate: NavigateFunction;
  hasFullViewImage: boolean;
  requestCloseFullViewImage: () => void;
  copySheetContent: string | null;
  setCopySheetContent: Dispatch<SetStateAction<string | null>>;
  messageContextMenu: MessageContextMenuState | null;
  setMessageContextMenu: Dispatch<SetStateAction<MessageContextMenuState | null>>;
  isEmojiPickerOpen: boolean;
  closeEmojiPicker: () => void;
  isChatMenuOpen: boolean;
  setIsChatMenuOpen: Dispatch<SetStateAction<boolean>>;
  isCallSettingsMenuOpen: boolean;
  setIsCallSettingsMenuOpen: Dispatch<SetStateAction<boolean>>;
  isCallAudioPopupOpen: boolean;
  setIsCallAudioPopupOpen: Dispatch<SetStateAction<boolean>>;
  isMessageSelectionMode: boolean;
  clearSelectedMessages: () => void;
  isMessageSearchOpen: boolean;
  closeMessageSearch: () => void;
  forwardTarget: Message | null;
  setForwardTarget: Dispatch<SetStateAction<Message | null>>;
  deleteTarget: Message | null;
  setDeleteTarget: Dispatch<SetStateAction<Message | null>>;
  isDetailsOpen: boolean;
  setIsDetailsOpen: Dispatch<SetStateAction<boolean>>;
  closeActiveChat: () => void;
  chatMenuRef: RefObject<HTMLElement | null>;
  emojiPickerRef: RefObject<HTMLElement | null>;
  emojiPickerDockRef: RefObject<HTMLElement | null>;
  callSettingsMenuRef: RefObject<HTMLElement | null>;
  callSettingsButtonRef: RefObject<HTMLElement | null>;
  callAudioPopupRef: RefObject<HTMLElement | null>;
  isNewChatOpen: boolean;
  newChatScreen: NewChatScreen;
  setNewChatScreen: (screen: NewChatScreen) => void;
  setNewChatMemberSearch: (value: string) => void;
  closeNewChatScreen: () => void;
};

/**
 * Single source of truth for "close the topmost open surface" — outside
 * clicks, Escape, and the Android hardware back button all dismiss the same
 * stack of transient UI (popups/menus/pickers/selection mode/search/details/
 * active chat) in the same priority order.
 */
export function useChatSurfaceDismissal({
  chatId,
  navigate,
  hasFullViewImage,
  requestCloseFullViewImage,
  copySheetContent,
  setCopySheetContent,
  messageContextMenu,
  setMessageContextMenu,
  isEmojiPickerOpen,
  closeEmojiPicker,
  isChatMenuOpen,
  setIsChatMenuOpen,
  isCallSettingsMenuOpen,
  setIsCallSettingsMenuOpen,
  isCallAudioPopupOpen,
  setIsCallAudioPopupOpen,
  isMessageSelectionMode,
  clearSelectedMessages,
  isMessageSearchOpen,
  closeMessageSearch,
  forwardTarget,
  setForwardTarget,
  deleteTarget,
  setDeleteTarget,
  isDetailsOpen,
  setIsDetailsOpen,
  closeActiveChat,
  chatMenuRef,
  emojiPickerRef,
  emojiPickerDockRef,
  callSettingsMenuRef,
  callSettingsButtonRef,
  callAudioPopupRef,
  isNewChatOpen,
  newChatScreen,
  setNewChatScreen,
  setNewChatMemberSearch,
  closeNewChatScreen
}: UseChatSurfaceDismissalParams) {
  const requestCloseActiveChatSurface = useCallback(() => {
    if (copySheetContent !== null) {
      setCopySheetContent(null);
      return true;
    }
    if (messageContextMenu) {
      setMessageContextMenu(null);
      return true;
    }
    if (isEmojiPickerOpen) {
      closeEmojiPicker();
      return true;
    }
    if (isChatMenuOpen) {
      setIsChatMenuOpen(false);
      return true;
    }
    if (isCallSettingsMenuOpen) {
      setIsCallSettingsMenuOpen(false);
      return true;
    }
    if (isCallAudioPopupOpen) {
      setIsCallAudioPopupOpen(false);
      return true;
    }
    if (isMessageSelectionMode) {
      clearSelectedMessages();
      return true;
    }
    if (isMessageSearchOpen) {
      closeMessageSearch();
      return true;
    }
    if (forwardTarget) {
      setForwardTarget(null);
      return true;
    }
    if (deleteTarget) {
      setDeleteTarget(null);
      return true;
    }
    if (isDetailsOpen) {
      setIsDetailsOpen(false);
      return true;
    }
    if (chatId) {
      closeActiveChat();
      return true;
    }
    return false;
  }, [
    chatId,
    clearSelectedMessages,
    closeActiveChat,
    closeEmojiPicker,
    closeMessageSearch,
    copySheetContent,
    deleteTarget,
    forwardTarget,
    isCallAudioPopupOpen,
    isCallSettingsMenuOpen,
    isChatMenuOpen,
    isDetailsOpen,
    isEmojiPickerOpen,
    isMessageSearchOpen,
    isMessageSelectionMode,
    messageContextMenu,
    setCopySheetContent,
    setDeleteTarget,
    setForwardTarget,
    setIsCallAudioPopupOpen,
    setIsCallSettingsMenuOpen,
    setIsChatMenuOpen,
    setIsDetailsOpen,
    setMessageContextMenu
  ]);

  useEffect(() => {
    function handleDocumentMouseDown(event: MouseEvent) {
      if (!chatMenuRef.current?.contains(event.target as Node)) {
        setIsChatMenuOpen(false);
      }
      if (
        !Capacitor.isNativePlatform() &&
        !emojiPickerRef.current?.contains(event.target as Node) &&
        !emojiPickerDockRef.current?.contains(event.target as Node)
      ) {
        closeEmojiPicker();
      }
      setMessageContextMenu(null);
      if (
        !callSettingsMenuRef.current?.contains(event.target as Node) &&
        !callSettingsButtonRef.current?.contains(event.target as Node)
      ) {
        setIsCallSettingsMenuOpen(false);
      }
      if (
        !callAudioPopupRef.current?.contains(event.target as Node) &&
        !callSettingsButtonRef.current?.contains(event.target as Node)
      ) {
        setIsCallAudioPopupOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") {
        return;
      }
      if (isNewChatOpen && newChatScreen !== "pick") {
        setNewChatScreen("pick");
        setNewChatMemberSearch("");
        return;
      }
      if (isMessageSelectionMode) {
        clearSelectedMessages();
        return;
      }
      setIsChatMenuOpen(false);
      closeEmojiPicker();
      closeMessageSearch();
      if (isNewChatOpen) {
        closeNewChatScreen();
      }
      requestCloseFullViewImage();
      setMessageContextMenu(null);
      setForwardTarget(null);
      setIsCallSettingsMenuOpen(false);
      setIsCallAudioPopupOpen(false);
    }

    document.addEventListener("mousedown", handleDocumentMouseDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleDocumentMouseDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [
    callAudioPopupRef,
    callSettingsButtonRef,
    callSettingsMenuRef,
    chatMenuRef,
    clearSelectedMessages,
    closeEmojiPicker,
    closeMessageSearch,
    closeNewChatScreen,
    emojiPickerDockRef,
    emojiPickerRef,
    isMessageSelectionMode,
    isNewChatOpen,
    newChatScreen,
    requestCloseFullViewImage,
    setForwardTarget,
    setIsCallAudioPopupOpen,
    setIsCallSettingsMenuOpen,
    setIsChatMenuOpen,
    setMessageContextMenu,
    setNewChatMemberSearch,
    setNewChatScreen
  ]);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) {
      return undefined;
    }

    let disposed = false;
    let listener: { remove: () => Promise<void> } | null = null;

    void (async () => {
      listener = await App.addListener("backButton", ({ canGoBack }) => {
        if (hasFullViewImage) {
          requestCloseFullViewImage();
          return;
        }
        if (copySheetContent !== null) {
          setCopySheetContent(null);
          return;
        }
        if (messageContextMenu) {
          setMessageContextMenu(null);
          return;
        }
        if (isEmojiPickerOpen) {
          closeEmojiPicker();
          return;
        }
        if (isChatMenuOpen) {
          setIsChatMenuOpen(false);
          return;
        }
        if (isCallSettingsMenuOpen) {
          setIsCallSettingsMenuOpen(false);
          return;
        }
        if (isCallAudioPopupOpen) {
          setIsCallAudioPopupOpen(false);
          return;
        }
        if (isMessageSearchOpen) {
          closeMessageSearch();
          return;
        }
        if (forwardTarget) {
          setForwardTarget(null);
          return;
        }
        if (deleteTarget) {
          setDeleteTarget(null);
          return;
        }
        if (isNewChatOpen && newChatScreen !== "pick") {
          setNewChatScreen("pick");
          setNewChatMemberSearch("");
          return;
        }
        if (isNewChatOpen) {
          closeNewChatScreen();
          return;
        }
        if (requestCloseActiveChatSurface()) {
          return;
        }
        if (canGoBack) {
          navigate(-1);
          return;
        }
        void App.minimizeApp();
      });

      if (disposed) {
        void listener.remove();
      }
    })();

    return () => {
      disposed = true;
      void listener?.remove();
    };
  }, [
    chatId,
    closeNewChatScreen,
    copySheetContent,
    deleteTarget,
    forwardTarget,
    hasFullViewImage,
    isCallAudioPopupOpen,
    isCallSettingsMenuOpen,
    isChatMenuOpen,
    isDetailsOpen,
    isEmojiPickerOpen,
    isMessageSearchOpen,
    isMessageSelectionMode,
    isNewChatOpen,
    messageContextMenu,
    newChatScreen,
    requestCloseActiveChatSurface,
    requestCloseFullViewImage
  ]);

  return { requestCloseActiveChatSurface };
}
