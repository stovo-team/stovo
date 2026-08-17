import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Location, NavigateFunction } from "react-router-dom";
import type { Socket } from "socket.io-client";

import type { User } from "../../api/auth";
import { Chat } from "../../api/chats";
import { FamilyFile } from "../../api/files";
import type { AppearanceSettings } from "../../appearance/AppearanceContext";
import { useChatDetailsActions } from "./details/useChatDetailsActions";
import { useChatOverview } from "./sidebar/useChatOverview";
import { useChatWorkspaceState } from "./sidebar/useChatWorkspaceState";
import { useChatDataLoader } from "./sidebar/useChatDataLoader";
import { useEncryptionIdentitySync } from "./sidebar/useEncryptionIdentitySync";
import { useMessageThread } from "./conversation/useMessageThread";
import { useChatRealtime } from "./conversation/useChatRealtime";
import { useChatSocketConnection } from "./conversation/useChatSocketConnection";
import { useNotificationActionHandler } from "./conversation/useNotificationActionHandler";
import { useVideoPictureInPictureBridge } from "./conversation/useVideoPictureInPictureBridge";
import { useNativeVideoPipPublisher } from "./conversation/useNativeVideoPipPublisher";
import { useAudioMessageRestore } from "./conversation/useAudioMessageRestore";
import { useMessageComposer } from "./composer/useMessageComposer";
import { useSharedFileQueueBridge } from "./composer/useSharedFileQueueBridge";
import { useAudioSessionLifecycle } from "./composer/useAudioSessionLifecycle";
import { useMessageOutbox } from "./outbox/messageOutboxProcessor";
import { useChatSurfaceDismissal } from "./useChatSurfaceDismissal";
import { navigateWithMotion } from "../../motion/navigation";
import { useCallSession } from "./calling/useCallSession";
import { isMobileCallViewport } from "./shared/callLifecycle";
import type { SharedContentTab } from "./shared/types";
import { canPostToChannel, computeSharedContentItems, displayChatName, isSuppressedUserError } from "./shared/chatPresentation";

export type UseChatsPageControllerParams = {
  chatId: string | undefined;
  location: Location;
  navigate: NavigateFunction;
  prefersReducedMotion: boolean;
  accessToken: string | null;
  currentUser: User | null;
  authRequest: <T>(path: string, init?: { method?: string; body?: unknown }) => Promise<T>;
  updateCurrentUser: (user: User) => void;
  appearance: AppearanceSettings;
};

/**
 * Composes every feature hook that backs the chats route (workspace data,
 * message thread, composer, realtime socket, call session, native PiP,
 * audio restore, chat details actions, and cross-surface dismissal) into a
 * single controller. ChatsPage.tsx calls this once and renders the returned
 * state; this hook owns all the wiring so the route file can stay a thin
 * composition layer.
 */
export function useChatsPageController({
  chatId,
  location,
  navigate,
  prefersReducedMotion,
  accessToken,
  currentUser,
  authRequest,
  updateCurrentUser,
  appearance
}: UseChatsPageControllerParams) {
  const workspace = useChatWorkspaceState({ accessToken });
  const {
    family, members, setMembers, chats, setChats, selectedChat, setSelectedChat,
    isLoading, isChatLoading, setIsChatLoading, isOnline, chatsRef, accessTokenRef
  } = workspace;

  const [typingNames, setTypingNames] = useState<string[]>([]);
  const [isChatMenuOpen, setIsChatMenuOpen] = useState(false);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [detailsTab, setDetailsTab] = useState<SharedContentTab>("media");
  const [chatTitleDraft, setChatTitleDraft] = useState("");
  const [fullViewImage, setFullViewImage] = useState<
    { file: FamilyFile; previewUrl: string; messageId?: string } | null
  >(null);
  const [isFullViewImageClosing, setIsFullViewImageClosing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isFamilyInviteOpen, setIsFamilyInviteOpen] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(isMobileCallViewport);

  const socketRef = useRef<Socket | null>(null);
  const composerInputRef = useRef<HTMLTextAreaElement | null>(null);
  const chatMenuRef = useRef<HTMLDivElement | null>(null);

  const unreadTotal = useMemo(() => chats.reduce((total, chat) => total + chat.unreadCount, 0), [chats]);

  const canPostInSelectedChannel = selectedChat ? canPostToChannel(selectedChat, currentUser) : false;
  const canCommentInSelectedChannel = Boolean(
    selectedChat && selectedChat.type === "channel" && !canPostInSelectedChannel && selectedChat.commentsEnabled
  );
  const channelCommentsDisabledForViewer = Boolean(
    selectedChat && selectedChat.type === "channel" && !canPostInSelectedChannel && !selectedChat.commentsEnabled
  );
  const requiresThreadToSend = canCommentInSelectedChannel;

  const focusComposerInput = useCallback(() => composerInputRef.current?.focus(), []);

  const thread = useMessageThread({
    chatId, accessToken, currentUser, selectedChat, isMobileViewport, socketRef, authRequest,
    channelCommentsDisabledForViewer, onChatsUpdate: setChats, onSelectedChatUpdate: setSelectedChat,
    onError: setError, focusComposerInput
  });
  const {
    messages, setMessages, messagesRef, messageCacheRef, historyCursorRef,
    activeChatIdRef, threadRootMessageId, setThreadRootMessageId,
    isMessageSearchOpen, closeMessageSearch, isMessageSelectionMode, clearSelectedMessages,
    replyTarget, setReplyTarget, forwardTarget, setForwardTarget,
    editTargetMessage, setEditTargetMessage, draftBeforeEditRef, editInFlightRef,
    setPinnedMessages, setPinIndex, deleteTarget, setDeleteTarget,
    messageContextMenu, setMessageContextMenu,
    pendingMessageFocusRef, focusMessageInPanel, clearMessageMotionState,
    applyMessagesForChat, markChatRead,
    resetSwipeReplyState, clearMessageLongPressGesture, resetChatExitSwipeGesture,
    beginChatExitSwipe, moveChatExitSwipe, endChatExitSwipe,
    stickToBottomRef, forceScrollToBottomRef, bottomAnchorMessageIdRef,
    resetForChatChange: resetThreadForChatChange
  } = thread;

  const missingCommentThread = requiresThreadToSend && !threadRootMessageId;

  const dataLoader = useChatDataLoader({
    accessTokenRef, authRequest, currentUser, chatId, onError: setError,
    setFamily: workspace.setFamily, setMembers, setChats, setSelectedChat,
    setIsLoading: workspace.setIsLoading, setHasLoadedOverview: workspace.setHasLoadedOverview,
    setIsChatLoading, activeChatIdRef, chatsRef,
    messageCacheRef, historyCursorRef, setMessages, setPinnedMessages, setPinIndex,
    applyMessagesForChat, markChatRead
  });

  const handleComposerFocusWithScroll = useCallback(() => {
    thread.stickToBottomRef.current = true;
    thread.forceScrollToBottomRef.current = true;
    thread.scrollMessagesToBottom();
    window.setTimeout(() => thread.scrollMessagesToBottom(), 100);
    window.setTimeout(() => thread.scrollMessagesToBottom(), 300);
  }, [thread]);

  const outbox = useMessageOutbox({
    accessToken,
    currentUser,
    chatsRef,
    socketRef,
    applyMessagesForChat,
    onChatsUpdate: setChats,
    onError: setError
  });

  const composerApi = useMessageComposer({
    chatId, accessToken, currentUser, selectedChat, sendOnEnter: appearance.sendOnEnter,
    channelCommentsDisabledForViewer, missingCommentThread, canPostInSelectedChannel, threadRootMessageId,
    replyTarget, setReplyTarget, editTargetMessage, setEditTargetMessage, setMessageContextMenu,
    draftBeforeEditRef, editInFlightRef, applyMessagesForChat, onChatsUpdate: setChats,
    onError: setError, navigate, socketRef, composerInputRef,
    onComposerFocus: handleComposerFocusWithScroll,
    chatsRef, triggerDrain: outbox.triggerDrain
  });
  const {
    composer, composerEnlargeOpen, setComposerEnlargeOpen, isEmojiPickerOpen,
    emojiPickerRef, emojiPickerDockRef, closeEmojiPicker, handleComposerChange,
    addSharedFileAttachments, sendQueuedNotificationReply,
    resetForChatChange: resetComposerForChatChange
  } = composerApi;

  const realtime = useChatRealtime({
    currentUserId: currentUser?.id, chatsRef, activeChatIdRef, applyMessagesForChat,
    onChatsUpdate: setChats, onSelectedChatUpdate: setSelectedChat, onTypingNamesUpdate: setTypingNames,
    onPinnedMessagesUpdate: setPinnedMessages, onPinIndexUpdate: setPinIndex,
    onMessageContextMenuUpdate: setMessageContextMenu, onEditTargetMessageUpdate: setEditTargetMessage,
    draftBeforeEditRef, onError: setError, reloadOverview: dataLoader.reloadOverview
  });

  const chatOverview = useChatOverview({
    accessToken, chats, members, currentUserId: currentUser?.id, onError: setError,
    onNavigateToChat: (chat) => navigateToChat(chat), refreshChats: dataLoader.loadOverview
  });
  const { isNewChatOpen, newChatScreen, setNewChatScreen, setNewChatMemberSearch, openNewChatScreen, closeNewChatScreen } =
    chatOverview;

  const finishCloseFullViewImage = useCallback(() => {
    setFullViewImage(null);
    setIsFullViewImageClosing(false);
  }, []);

  const requestCloseFullViewImage = useCallback(() => {
    if (!fullViewImage) return;
    if (prefersReducedMotion) {
      finishCloseFullViewImage();
      return;
    }
    setIsFullViewImageClosing(true);
  }, [finishCloseFullViewImage, fullViewImage, prefersReducedMotion]);

  const openFullViewImage = useCallback((file: FamilyFile, previewUrl: string, messageId?: string) => {
    setIsFullViewImageClosing(false);
    setFullViewImage({ file, previewUrl, messageId });
  }, []);

  const handleGoToFullViewImageMessage = useCallback(() => {
    const messageId = fullViewImage?.messageId;
    if (!messageId) return;
    finishCloseFullViewImage();
    setIsDetailsOpen(false);
    window.requestAnimationFrame(() => {
      focusMessageInPanel({ messageId, highlightClassName: "message-context-flash" });
    });
  }, [finishCloseFullViewImage, focusMessageInPanel, fullViewImage?.messageId]);

  const videoPipBridge = useVideoPictureInPictureBridge({
    accessTokenRef, chatsRef, messageCacheRef, activeChatIdRef, messagesRef,
    setSelectedChat, setMessages, setIsDetailsOpen, setThreadRootMessageId,
    pendingMessageFocusRef, navigate, prefersReducedMotion
  });

  const callSession = useCallSession({
    accessToken, currentUser, selectedChat, chats, members, chatId, navigate, prefersReducedMotion,
    setError, chatsRef, activeChatIdRef, messageCacheRef, setSelectedChat, setMessages, setIsDetailsOpen,
    socketRef, restoreActiveVideoSurface: videoPipBridge.restoreActiveVideoSurface,
    setIsVideoPictureInPictureActive: videoPipBridge.setIsVideoPictureInPictureActive,
    videoPictureInPictureActiveRef: videoPipBridge.videoPictureInPictureActiveRef,
    lastNativeVideoRevisionRef: videoPipBridge.lastNativeVideoRevisionRef
  });
  const { startDirectCall } = callSession;

  useNativeVideoPipPublisher({
    currentUserId: currentUser?.id, callPhaseRef: callSession.callPhaseRef,
    videoPictureInPictureActiveRef: videoPipBridge.videoPictureInPictureActiveRef,
    setIsVideoPictureInPictureActive: videoPipBridge.setIsVideoPictureInPictureActive,
    lastNativeVideoRevisionRef: videoPipBridge.lastNativeVideoRevisionRef
  });

  const { audioRestoreStatus } = useAudioMessageRestore({
    currentUser, accessTokenRef, chatsRef, messageCacheRef, activeChatIdRef, messagesRef,
    setSelectedChat, setMessages, setIsDetailsOpen, pendingMessageFocusRef, onError: setError,
    navigate, prefersReducedMotion, locationSearch: location.search
  });

  useEncryptionIdentitySync({ currentUser, authRequest, updateCurrentUser, setChats, setSelectedChat });
  useAudioSessionLifecycle({ accessToken, currentUserId: currentUser?.id });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const media = window.matchMedia("(max-width: 768px)");
    const update = () => setIsMobileViewport(isMobileCallViewport());
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    const messageId = new URLSearchParams(location.search).get("message");
    if (!messageId || !messages.some((message) => message.id === messageId)) return;
    if (focusMessageInPanel({ messageId, highlightClassName: "message-context-flash" })) {
      navigate(location.pathname, { replace: true });
    }
  }, [focusMessageInPanel, location.pathname, location.search, messages, navigate]);

  const sharedContentItems = useMemo(() => computeSharedContentItems(messages, detailsTab), [detailsTab, messages]);
  const memberLookup = useMemo(() => {
    const lookup = new Map<string, { displayName: string; username?: string }>();
    for (const member of members) lookup.set(member.id, member);
    if (currentUser) lookup.set(currentUser.id, currentUser);
    return lookup;
  }, [currentUser, members]);

  const canCreateFamilyInvite = currentUser?.role === "owner" || currentUser?.role === "admin";

  const detailsActions = useChatDetailsActions({
    accessToken, selectedChat, currentUser, setSelectedChat, setChats,
    onError: setError, setIsChatMenuOpen, messages, markChatRead
  });

  useChatSocketConnection({
    socketRef, accessToken, currentUser, chatId, bindMessageListeners: realtime.bindMessageListeners,
    callSession, lastNativeVideoRevisionRef: videoPipBridge.lastNativeVideoRevisionRef,
    reloadOverview: dataLoader.reloadOverview
  });

  useNotificationActionHandler({
    chatId, selectedChat, locationPathname: location.pathname, locationSearch: location.search,
    navigate, sendQueuedNotificationReply, startDirectCall
  });

  const { incomingSharedFiles } = useSharedFileQueueBridge({ chatId, addSharedFileAttachments, onError: setError });

  const didAutoOpenDesktopChatRef = useRef(false);

  useEffect(() => {
    if (chatId || isMobileViewport) {
      didAutoOpenDesktopChatRef.current = false;
      return;
    }
    if (isLoading || chats.length === 0 || didAutoOpenDesktopChatRef.current) return;
    didAutoOpenDesktopChatRef.current = true;
    openChat(chats[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatId, chats, isLoading, isMobileViewport]);

  useEffect(() => {
    setChatTitleDraft(selectedChat ? displayChatName(selectedChat, currentUser?.id) : "");
  }, [currentUser?.id, selectedChat]);

  useEffect(() => {
    resetThreadForChatChange();
    resetComposerForChatChange(chatId);
    setTypingNames([]);
    setIsChatMenuOpen(false);
    setFullViewImage(null);
    setDetailsTab("media");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatId]);

  useEffect(() => {
    resetSwipeReplyState();
    clearMessageLongPressGesture();
    resetChatExitSwipeGesture();
  }, [chatId, clearMessageLongPressGesture, messageContextMenu, resetChatExitSwipeGesture, resetSwipeReplyState]);

  useEffect(() => () => clearMessageMotionState(), [clearMessageMotionState]);

  function focusComposer() {
    setIsDetailsOpen(false);
    window.setTimeout(() => composerInputRef.current?.focus(), 0);
  }

  function navigateToChat(chat: Chat, replace = false) {
    navigateWithMotion(navigate, `/app/chats/${chat.id}`, { replace, reducedMotion: prefersReducedMotion });
  }

  function navigateToChatList(replace = false) {
    navigateWithMotion(navigate, "/app/chats", { replace, reducedMotion: prefersReducedMotion });
  }

  function openChat(chat: Chat) {
    stickToBottomRef.current = true;
    forceScrollToBottomRef.current = true;
    bottomAnchorMessageIdRef.current = null;
    setSelectedChat(chat);
    setError(null);
    const cachedMessages = messageCacheRef.current[chat.id];
    if (cachedMessages) {
      setMessages(cachedMessages);
    } else {
      // Navigation updates the route asynchronously. Mark the target chat as
      // loading now so its message panel never briefly renders "No messages"
      // before the route-driven loader starts its first request.
      setMessages([]);
      setIsChatLoading(true);
    }
    if (chat.id === chatId) return;
    navigateToChat(chat);
  }

  function closeActiveChat() {
    clearSelectedMessages();
    setIsDetailsOpen(false);
    navigateToChatList();
  }

  const { requestCloseActiveChatSurface } = useChatSurfaceDismissal({
    chatId, navigate, hasFullViewImage: Boolean(fullViewImage), requestCloseFullViewImage,
    messageContextMenu, setMessageContextMenu,
    isEmojiPickerOpen, closeEmojiPicker, isChatMenuOpen, setIsChatMenuOpen,
    isCallSettingsMenuOpen: callSession.isCallSettingsMenuOpen, setIsCallSettingsMenuOpen: callSession.setIsCallSettingsMenuOpen,
    isCallAudioPopupOpen: callSession.isCallAudioPopupOpen, setIsCallAudioPopupOpen: callSession.setIsCallAudioPopupOpen,
    isMessageSelectionMode, clearSelectedMessages, isMessageSearchOpen, closeMessageSearch,
    forwardTarget, setForwardTarget, deleteTarget, setDeleteTarget, isDetailsOpen, setIsDetailsOpen,
    closeActiveChat, chatMenuRef, emojiPickerRef, emojiPickerDockRef,
    callSettingsMenuRef: callSession.callSettingsMenuRef, callSettingsButtonRef: callSession.callSettingsButtonRef,
    callAudioPopupRef: callSession.callAudioPopupRef,
    isNewChatOpen, newChatScreen, setNewChatScreen, setNewChatMemberSearch, closeNewChatScreen
  });

  const visibleError = error && !isSuppressedUserError(error) ? error : null;
  // Keep the picker in the conversation flow at every viewport size. This lets
  // the message list shrink above it instead of being covered by a popup.
  const isDockedEmojiPicker = true;
  const showDockedEmojiPicker = isDockedEmojiPicker && isEmojiPickerOpen;

  return {
    family, members, chats, selectedChat, setSelectedChat, isLoading, hasLoadedOverview: workspace.hasLoadedOverview, isChatLoading, isOnline,
    isChatMenuOpen, setIsChatMenuOpen, isDetailsOpen, setIsDetailsOpen, detailsTab, setDetailsTab,
    chatTitleDraft, setChatTitleDraft, fullViewImage, isFullViewImageClosing, isFamilyInviteOpen,
    setIsFamilyInviteOpen, isMobileViewport, chatMenuRef, unreadTotal, canPostInSelectedChannel,
    channelCommentsDisabledForViewer, missingCommentThread, thread, composerApi, chatOverview,
    isNewChatOpen, openNewChatScreen, callSession,
    videoPipBridge, audioRestoreStatus, sharedContentItems, memberLookup, canCreateFamilyInvite,
    detailsActions, incomingSharedFiles, requestCloseActiveChatSurface, visibleError,
    isDockedEmojiPicker, showDockedEmojiPicker, openChat, focusComposer, focusMessageInPanel,
    typingNames, openFullViewImage, finishCloseFullViewImage, handleGoToFullViewImageMessage,
    endChatExitSwipe, beginChatExitSwipe, moveChatExitSwipe
  };
}

export type ChatsPageController = ReturnType<typeof useChatsPageController>;
