import { useEffect, useState } from "react";
import { Navigate, useLocation, useNavigate, useParams } from "react-router-dom";
import { WifiOff } from "lucide-react";

import { useAuth } from "../auth/AuthContext";
import { useAppearance } from "../appearance/AppearanceContext";
import { useKeyboardShortcuts } from "../shortcuts/KeyboardShortcutsContext";
import { ChatOverlays } from "../features/chats/ChatOverlays";
import { ChatDetailsPanel } from "../features/chats/details/ChatDetailsPanel";
import { ChatSidebar } from "../features/chats/sidebar/ChatSidebar";
import { ConversationPanel } from "../features/chats/conversation/ConversationPanel";
import { useChatsPageController } from "../features/chats/useChatsPageController";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { getClusterPrefix } from "../api/client";
import AppNav from "./AppNav";
import { CallFeature, CallFeatureProvider, MobileMinimizedCallBar } from "../features/chats/calling/CallFeature";
import { chatListLayoutClass, displayChatName } from "../features/chats/shared/chatPresentation";
import { AddPeopleDialog } from "../features/chats/details/AddPeopleDialog";
import { createCanvas } from "../api/canvas";
import { createChecklist } from "../api/checklist";
import { MessageArchivePanel, MessageArchiveViewControls, QuickAccessPanel } from "../features/chats/QuickAccessPanel";
import { messageArchiveViewFromStoredValue, messageArchiveViewStorageKey, type MessageArchiveView } from "../features/chats/messageArchive";

function loadMessageArchiveView(userId?: string): MessageArchiveView {
  if (!userId || typeof window === "undefined") return "all";
  try {
    return messageArchiveViewFromStoredValue(window.localStorage.getItem(messageArchiveViewStorageKey(userId)));
  } catch {
    return "all";
  }
}

export default function ChatsPage() {
  const { chatId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const prefersReducedMotion = useReducedMotion();
  const { accessToken, currentUser, authRequest, updateCurrentUser } = useAuth();
  const { appearance, resolvedThemeMode } = useAppearance();

  const ctrl = useChatsPageController({
    chatId, location, navigate, prefersReducedMotion, accessToken, currentUser, authRequest, updateCurrentUser, appearance
  });
  const [addPeopleChat, setAddPeopleChat] = useState<import("../api/chats").Chat | null>(null);
  const [isDraftsAndScheduledOpen, setIsDraftsAndScheduledOpen] = useState(false);
  const [isMessageArchiveOpen, setIsMessageArchiveOpen] = useState(false);
  const [messageArchiveView, setMessageArchiveView] = useState<MessageArchiveView>("all");
  const archiveGroup = new URLSearchParams(location.search).get("archiveGroup") ?? undefined;
  const archiveGroupKind = archiveGroup === "notes" ? "notes" : archiveGroup ? "chat" : undefined;
  const {
    family, members, chats, selectedChat, setSelectedChat, isLoading, hasLoadedOverview, isChatLoading, isOnline,
    isChatMenuOpen, setIsChatMenuOpen, isDetailsOpen, setIsDetailsOpen, detailsTab, setDetailsTab,
    chatTitleDraft, setChatTitleDraft, fullViewImage, isFullViewImageClosing, isFamilyInviteOpen,
    setIsFamilyInviteOpen, isMobileViewport, chatMenuRef, unreadTotal, canPostInSelectedChannel,
    channelCommentsDisabledForViewer, missingCommentThread, thread, composerApi, chatOverview,
    isNewChatOpen, openNewChatScreen, callSession, videoPipBridge, audioRestoreStatus,
    sharedContentItems, memberLookup, canCreateFamilyInvite, detailsActions, incomingSharedFiles,
    requestCloseActiveChatSurface, visibleError, isDockedEmojiPicker, showDockedEmojiPicker,
    openChat, focusComposer, focusMessageInPanel, typingNames, openFullViewImage,
    finishCloseFullViewImage, handleGoToFullViewImageMessage, endChatExitSwipe, beginChatExitSwipe, moveChatExitSwipe
  } = ctrl;
  const {
    callPhase, activeCallChatId, callAudioSettings, isCallMinimized, setIsCallMinimized, callPeerDisplayName,
    callTimer, remoteAudioRef, activeCallPeerName, applyCallAudioPatch, startDirectCall, endActiveCall
  } = callSession;
  const {
    composer,
    composerEnlargeOpen,
    setComposerEnlargeOpen,
    handleComposerChange,
    pendingAttachments,
    removePendingAttachment,
    updatePendingAttachment,
    addSharedFileAttachments,
    handleSendMessage
  } = composerApi;
  const archiveGroupSourceChat = archiveGroup && archiveGroup !== "notes" ? chats.find((chat) => chat.id === archiveGroup) ?? null : null;
  const archiveGroupName = archiveGroup === "notes"
    ? "My Notes"
    : archiveGroup
      ? archiveGroupSourceChat
        ? displayChatName(archiveGroupSourceChat, currentUser?.id)
        : "Archived chat"
      : undefined;

  useEffect(() => {
    setMessageArchiveView(loadMessageArchiveView(currentUser?.id));
  }, [currentUser?.id]);

  useEffect(() => {
    if (archiveGroup) {
      setIsMessageArchiveOpen(true);
      setMessageArchiveView("grouped");
    }
  }, [archiveGroup]);

  useEffect(() => {
    if (selectedChat?.type === "archive") {
      setIsMessageArchiveOpen(true);
    }
  }, [selectedChat?.id, selectedChat?.type]);

  function updateMessageArchiveView(view: MessageArchiveView) {
    setMessageArchiveView(view);
    if (currentUser?.id && typeof window !== "undefined") {
      try {
        window.localStorage.setItem(messageArchiveViewStorageKey(currentUser.id), view);
      } catch {
        // Private browsing or storage restrictions should not block Archive.
      }
    }
    if (archiveGroup) {
      const archive = chats.find((chat) => chat.type === "archive");
      if (archive) navigate(`${getClusterPrefix()}/app/chats/${archive.id}`);
    }
  }

  const { registerShortcutHandler } = useKeyboardShortcuts();

  useEffect(() => {
    const unregisterNext = registerShortcutHandler("next_chat", () => {
      if (chats.length === 0) return;
      const currentIndex = chats.findIndex((c) => c.id === (selectedChat?.id ?? chatId));
      const nextIndex = currentIndex < 0 ? 0 : (currentIndex + 1) % chats.length;
      openChat(chats[nextIndex]);
    });

    const unregisterPrev = registerShortcutHandler("prev_chat", () => {
      if (chats.length === 0) return;
      const currentIndex = chats.findIndex((c) => c.id === (selectedChat?.id ?? chatId));
      const prevIndex = currentIndex <= 0 ? chats.length - 1 : currentIndex - 1;
      openChat(chats[prevIndex]);
    });

    const unregisterNew = registerShortcutHandler("new_chat", () => {
      openNewChatScreen();
    });

    const unregisterFocus = registerShortcutHandler("focus_composer", () => {
      focusComposer();
    });

    const unregisterDetails = registerShortcutHandler("toggle_details", () => {
      if (selectedChat) {
        setIsDetailsOpen((prev) => !prev);
      }
    });

    const unregisterSearch = registerShortcutHandler("search_messages", () => {
      const searchInput = document.querySelector<HTMLInputElement>(
        ".message-search-input, .chat-header-search-button, .chat-list-search input"
      );
      if (searchInput) {
        if (searchInput.tagName.toLowerCase() === "button") {
          (searchInput as HTMLButtonElement).click();
        } else {
          searchInput.focus();
          searchInput.select?.();
        }
      }
    });

    return () => {
      unregisterNext();
      unregisterPrev();
      unregisterNew();
      unregisterFocus();
      unregisterDetails();
      unregisterSearch();
    };
  }, [registerShortcutHandler, chats, selectedChat, chatId, openChat, openNewChatScreen, focusComposer, setIsDetailsOpen]);

  // Only bounce unknown/missing chats after overview + chat load settle.
  // Avoid bouncing during selection transitions (selectedChat can briefly
  // disagree with the route while openChat/loadSelectedChat are in flight).
  if (
    chatId &&
    !isLoading &&
    !isChatLoading &&
    !selectedChat &&
    !visibleError &&
    chats.length > 0 &&
    !chats.some((chat) => chat.id === chatId)
  ) {
    const prefix = getClusterPrefix();
    return <Navigate to={`${prefix}/app/chats`} replace />;
  }

  return (
    <main
      className={`app-shell app-frame messenger-shell ${chatId ? "has-active-chat" : "chat-list-view"}${chatListLayoutClass(family?.minimizedChatLayout ?? false)}${isNewChatOpen ? " messenger-shell--new-chat" : ""}${isDetailsOpen && selectedChat ? " messenger-shell--chat-info" : ""}${videoPipBridge.isVideoPictureInPictureActive ? " messenger-shell--video-pip" : ""}`}
    >
      <AppNav unreadTotalOverride={unreadTotal} />
      <section className="messenger-workspace">
        {!isOnline && (
          <p className="offline-banner" role="status">
            <WifiOff aria-hidden="true" size={18} />
            Offline. Messages will send when you are back online.
          </p>
        )}

        <div className={`chat-layout ${isDetailsOpen && selectedChat ? "details-open" : ""}`}>
          <ChatSidebar
            familyName={family?.name ?? "Stovo"}
            familyId={family?.id ?? currentUser?.familyId ?? ""}
            canCreateFamilyInvite={canCreateFamilyInvite}
            onOpenFamilyInvite={() => setIsFamilyInviteOpen(true)}
            activeChatId={chatId}
            incomingSharedFiles={incomingSharedFiles}
            isLoading={isLoading}
            hasLoadedOverview={hasLoadedOverview}
            accessToken={accessToken}
            currentUserId={currentUser?.id}
            minimizedChatLayout={family?.minimizedChatLayout}
            selectedChatId={selectedChat?.id}
            overview={chatOverview}
            onSelectChat={setSelectedChat}
            onOpenChat={(chat) => { setIsDraftsAndScheduledOpen(false); setIsMessageArchiveOpen(false); openChat(chat); }}
            onOpenDraftsAndScheduled={() => { setIsMessageArchiveOpen(false); setIsDraftsAndScheduledOpen(true); }}
            isDraftsAndScheduledActive={isDraftsAndScheduledOpen}
            onOpenMessageArchive={() => { const archive = chats.find((chat) => chat.type === "archive"); if (archive) { setIsDraftsAndScheduledOpen(false); setIsMessageArchiveOpen(true); setMessageArchiveView(loadMessageArchiveView(currentUser?.id)); setSelectedChat(archive); openChat(archive); if (chatId === archive.id || archiveGroup) navigate(`${getClusterPrefix()}/app/chats/${archive.id}`); } }}
            isMessageArchiveActive={isMessageArchiveOpen}
            mobileCallStrip={
              callPhase !== "idle" && isCallMinimized && !chatId ? (
                <MobileMinimizedCallBar
                  peerName={(callPeerDisplayName ?? activeCallPeerName) ?? (chats.find((c) => c.id === activeCallChatId)?.title ?? "Call")}
                  callPhase={callPhase}
                  callTimer={callTimer}
                  micMuted={callAudioSettings.micMuted}
                  onToggleMic={() => void applyCallAudioPatch({ micMuted: !callAudioSettings.micMuted })}
                  onEnd={() => void endActiveCall()}
                  onExpand={() => {
                    setIsCallMinimized(false);
                    if (activeCallChatId) {
                      const target = chats.find((c) => c.id === activeCallChatId);
                      if (target) openChat(target);
                    }
                  }}
                />
              ) : undefined
            }
          />

          <section
            className="chat-detail"
            style={detailsActions.wallpaperStyle}
            onPointerCancel={endChatExitSwipe}
            onPointerDown={beginChatExitSwipe}
            onPointerMove={(event) => moveChatExitSwipe(event, requestCloseActiveChatSurface)}
            onPointerUp={endChatExitSwipe}
          >
            {isDraftsAndScheduledOpen ? <QuickAccessPanel /> : isMessageArchiveOpen && messageArchiveView === "grouped" && !archiveGroup ? <MessageArchivePanel accessToken={accessToken} chats={chats} currentUserId={currentUser?.id} onViewChange={updateMessageArchiveView} onOpenGroup={(group) => { const archive = chats.find((chat) => chat.type === "archive"); if (!archive) return; setIsMessageArchiveOpen(true); setMessageArchiveView("grouped"); setSelectedChat(archive); openChat(archive); navigate(`${getClusterPrefix()}/app/chats/${archive.id}?archiveGroup=${encodeURIComponent(group)}`); }} /> : <ConversationPanel
              thread={thread}
              composer={composerApi}
              accessToken={accessToken}
              currentUser={currentUser}
              selectedChat={selectedChat}
              activeChatId={chatId}
              chats={chats}
              members={members}
              memberLookup={memberLookup}
              isChatLoading={isChatLoading}
              typingNames={typingNames}
              callPhase={callPhase}
              isChatMenuOpen={isChatMenuOpen}
              chatMenuRef={chatMenuRef}
              onToggleChatMenu={() => setIsChatMenuOpen((value) => !value)}
              onBack={requestCloseActiveChatSurface}
              onOpenDetails={() => setIsDetailsOpen(true)}
              onStartAudioCall={() => void startDirectCall("audio")}
              onStartVideoCall={() => void startDirectCall("video")}
              onMarkRead={() => void detailsActions.handleMarkSelectedChatRead()}
              onTogglePinned={() => void detailsActions.handleChatPreferenceChange({ isPinned: !selectedChat?.isPinned })}
              onToggleMuted={() => void detailsActions.handleChatPreferenceChange({ isMuted: !selectedChat?.isMuted })}
              onToggleFavorite={() => void detailsActions.handleChatPreferenceChange({ isFavorite: !selectedChat?.isFavorite })}
              channelCommentsDisabledForViewer={channelCommentsDisabledForViewer}
              missingCommentThread={missingCommentThread}
              canPostInSelectedChannel={canPostInSelectedChannel}
              resolvedThemeMode={resolvedThemeMode === "light" ? "light" : "dark"}
              videoAutoplay={appearance.videoAutoplay}
              renderMarkdown={appearance.renderMarkdown}
              isDockedEmojiPicker={isDockedEmojiPicker}
              showDockedEmojiPicker={showDockedEmojiPicker}
              callSession={callSession}
              canAddPeople={detailsActions.canManageSelectedChat && selectedChat?.type === "voice"}
              onOpenAddPeople={() => setAddPeopleChat(selectedChat)}
              minimizedCallHeader={
                selectedChat && chatId && callPhase !== "idle" && isCallMinimized ? (
                  <MobileMinimizedCallBar
                    className="mobile-call-strip--chat-header"
                    peerName={(callPeerDisplayName ?? activeCallPeerName) ?? (chats.find((c) => c.id === activeCallChatId)?.title ?? "Call")}
                    callPhase={callPhase}
                    callTimer={callTimer}
                    micMuted={callAudioSettings.micMuted}
                    onToggleMic={() => void applyCallAudioPatch({ micMuted: !callAudioSettings.micMuted })}
                    onEnd={() => void endActiveCall()}
                    onExpand={() => {
                      setIsCallMinimized(false);
                      if (activeCallChatId) {
                        const target = chats.find((c) => c.id === activeCallChatId);
                        if (target) openChat(target);
                      }
                    }}
                  />
                ) : null
              }
              onOpenChat={openChat}
              onOpenImage={openFullViewImage}
              onOpenNewChat={openNewChatScreen}
              onCreateCanvas={() => {
                if (!accessToken || !selectedChat) return;
                void createCanvas(accessToken, selectedChat.id)
                  .then((canvas) => navigate(`${getClusterPrefix()}/app/canvas/${encodeURIComponent(canvas.id)}`));
              }}
              onCreateChecklist={async (payload) => {
                if (!accessToken || !selectedChat) return;
                const checklist = await createChecklist(accessToken, {
                  chatId: selectedChat.id,
                  title: payload.title,
                  category: payload.category,
                  items: payload.items
                });
                navigate(`${getClusterPrefix()}/app/checklist/${encodeURIComponent(checklist.id)}`);
              }}
              archiveGroupSourceChat={archiveGroupSourceChat}
              archiveGroupName={archiveGroupName}
              archiveGroupKind={archiveGroupKind}
              onBackFromArchiveGroup={archiveGroup ? () => {
                const archive = chats.find((chat) => chat.type === "archive");
                if (!archive) return;
                setIsMessageArchiveOpen(true);
                setMessageArchiveView("grouped");
                navigate(`${getClusterPrefix()}/app/chats/${archive.id}`);
              } : undefined}
              headerBelow={selectedChat?.type === "archive" && !archiveGroup ? <MessageArchiveViewControls view={messageArchiveView} onChange={updateMessageArchiveView} /> : undefined}
            />}
          </section>
          {selectedChat && isDetailsOpen && (
            <ChatDetailsPanel
              accessToken={accessToken}
              chat={selectedChat}
              chatPhotoInputRef={detailsActions.chatPhotoInputRef}
              chatWallpaperInputRef={detailsActions.chatWallpaperInputRef}
              chatTitleDraft={chatTitleDraft}
              canManageChat={detailsActions.canManageSelectedChat}
              currentUser={currentUser}
              currentUserId={currentUser?.id}
              detailsTab={detailsTab}
              isUploading={detailsActions.isChatMediaUploading}
              sharedContentItems={sharedContentItems}
              wallpaperPreviewUrl={detailsActions.wallpaperPreviewUrl}
              editingChatPhotoFile={detailsActions.editingChatPhotoFile}
              onCloseEditChatPhoto={() => detailsActions.setEditingChatPhotoFile(null)}
              onSaveCroppedChatPhoto={detailsActions.handleSaveCroppedChatPhoto}
              editingChatWallpaperFile={detailsActions.editingChatWallpaperFile}
              onCloseEditChatWallpaper={() => detailsActions.setEditingChatWallpaperFile(null)}
              onSaveEditedChatWallpaper={detailsActions.handleSaveEditedChatWallpaper}
              onChatPhotoSelect={detailsActions.handleChatPhotoSelect}
              onChatWallpaperSelect={detailsActions.handleChatWallpaperSelect}
              onChatSettingsSubmit={(event) => void detailsActions.handleChatSettingsSubmit(event, chatTitleDraft)}
              onClose={() => setIsDetailsOpen(false)}
              onCommentsEnabledChange={detailsActions.handleCommentsEnabledChange}
              onDetailsTabChange={setDetailsTab}
              onFocusComposer={focusComposer}
              onFocusMessage={(messageId) => {
                setIsDetailsOpen(false);
                window.requestAnimationFrame(() => {
                  focusMessageInPanel({ messageId, highlightClassName: "message-context-flash" });
                });
              }}
              onMediaVisibilityChange={detailsActions.handleMediaVisibilityChange}
              onOpenImage={openFullViewImage}
              onOpenAddPeople={() => setAddPeopleChat(selectedChat)}
              onPinPermissionChange={detailsActions.handlePinPermissionChange}
              onMessageDelayChange={detailsActions.handleMessageDelayChange}
              pendingMessageDelay={detailsActions.pendingMessageDelay}
              messageDelayStatus={detailsActions.messageDelayStatus}
              onPreferenceChange={(payload) => void detailsActions.handleChatPreferenceChange(payload)}
              onTitleDraftChange={setChatTitleDraft}
            />
          )}
        </div>
        {audioRestoreStatus && <p className="audio-restore-status" role="status">{audioRestoreStatus}</p>}
        <audio ref={remoteAudioRef} autoPlay className="visually-hidden" />
        <CallFeatureProvider
          session={callSession}
          isMobileViewport={isMobileViewport}
          members={members}
          currentUser={currentUser}
          chats={chats}
          onOpenChat={openChat}
        >
          <CallFeature />
        </CallFeatureProvider>
      <ChatOverlays
        accessToken={accessToken}
        chats={chats}
          currentUser={currentUser}
          family={family}
          chatOverview={chatOverview}
          canCreateFamilyInvite={canCreateFamilyInvite}
          isFamilyInviteOpen={isFamilyInviteOpen}
          onCloseFamilyInvite={() => setIsFamilyInviteOpen(false)}
          fullViewImage={fullViewImage}
          isFullViewImageClosing={isFullViewImageClosing}
          onCloseFullViewImage={finishCloseFullViewImage}
          onGoToFullViewImageMessage={handleGoToFullViewImageMessage}
          composerEnlargeOpen={composerEnlargeOpen}
          composerContent={composer}
          renderMarkdown={appearance.renderMarkdown}
          onCloseComposerEnlarge={() => setComposerEnlargeOpen(false)}
          onComposerEnlargeChange={handleComposerChange}
          pendingAttachments={pendingAttachments}
          onRemovePendingAttachment={removePendingAttachment}
          onUpdatePendingAttachment={updatePendingAttachment}
          onAddAttachments={addSharedFileAttachments}
          onSendMessage={() => {
            handleSendMessage({ preventDefault: () => {} });
          }}
        />
        {addPeopleChat && (
          <AddPeopleDialog
            accessToken={accessToken}
            members={members.filter((member) => !addPeopleChat.members.some((chatMember) => chatMember.id === member.id))}
            onAdd={detailsActions.handleAddChatMember}
            onClose={() => setAddPeopleChat(null)}
          />
        )}
      </section>
    </main>
  );
}
