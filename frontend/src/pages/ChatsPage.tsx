import { Navigate, useLocation, useNavigate, useParams } from "react-router-dom";
import { WifiOff } from "lucide-react";

import { useAuth } from "../auth/AuthContext";
import { useAppearance } from "../appearance/AppearanceContext";
import { ChatOverlays } from "../features/chats/ChatOverlays";
import { ChatDetailsPanel } from "../features/chats/details/ChatDetailsPanel";
import { ChatSidebar } from "../features/chats/sidebar/ChatSidebar";
import { ConversationPanel } from "../features/chats/conversation/ConversationPanel";
import { useChatsPageController } from "../features/chats/useChatsPageController";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { getClusterPrefix } from "../api/client";
import AppNav from "./AppNav";
import { CallFeature, MobileMinimizedCallBar } from "../features/chats/calling/CallFeature";
import { chatListLayoutClass } from "../features/chats/shared/chatPresentation";

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
            onOpenChat={openChat}
            mobileCallStrip={
              callPhase !== "idle" && isCallMinimized && isMobileViewport && !chatId && (selectedChat?.type === "group" || selectedChat?.type === "family") ? (
                <MobileMinimizedCallBar
                  peerName={(callPeerDisplayName ?? activeCallPeerName) ?? "Call"}
                  callPhase={callPhase}
                  callTimer={callTimer}
                  micMuted={callAudioSettings.micMuted}
                  onToggleMic={() => void applyCallAudioPatch({ micMuted: !callAudioSettings.micMuted })}
                  onEnd={() => void endActiveCall()}
                  onExpand={() => setIsCallMinimized(false)}
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
            {selectedChat && callPhase !== "idle" && isCallMinimized && isMobileViewport && chatId && (selectedChat.type === "group" || selectedChat.type === "family") && (
              <MobileMinimizedCallBar
                peerName={(callPeerDisplayName ?? activeCallPeerName) ?? "Call"}
                callPhase={callPhase}
                callTimer={callTimer}
                micMuted={callAudioSettings.micMuted}
                onToggleMic={() => void applyCallAudioPatch({ micMuted: !callAudioSettings.micMuted })}
                onEnd={() => void endActiveCall()}
                onExpand={() => setIsCallMinimized(false)}
              />
            )}
            <ConversationPanel
              thread={thread}
              composer={composerApi}
              accessToken={accessToken}
              currentUser={currentUser}
              selectedChat={selectedChat}
              activeChatId={chatId}
              chats={chats}
              memberLookup={memberLookup}
              isChatLoading={isChatLoading}
              typingNames={typingNames}
              callPhase={callPhase}
              activeCallChatId={activeCallChatId}
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
              onOpenChat={openChat}
              onOpenImage={openFullViewImage}
              onOpenNewChat={openNewChatScreen}
            />
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
              onPinPermissionChange={detailsActions.handlePinPermissionChange}
              onMessageDelayChange={detailsActions.handleMessageDelayChange}
              onPreferenceChange={(payload) => void detailsActions.handleChatPreferenceChange(payload)}
              onTitleDraftChange={setChatTitleDraft}
            />
          )}
        </div>
        {audioRestoreStatus && <p className="audio-restore-status" role="status">{audioRestoreStatus}</p>}
        <audio ref={remoteAudioRef} autoPlay className="visually-hidden" />
        <CallFeature session={callSession} isMobileViewport={isMobileViewport} members={members} currentUser={currentUser} chats={chats} />
        <ChatOverlays
          accessToken={accessToken}
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
      </section>
    </main>
  );
}
