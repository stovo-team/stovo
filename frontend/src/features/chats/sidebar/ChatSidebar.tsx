import { useEffect, useRef, useState } from "react";
import { ChevronDown, Paperclip, Plus, Server, Trash2, UserPlus } from "lucide-react";
import { useNavigate } from "react-router-dom";

import StovoLogo from "../../../components/StovoLogo";
import { ChatList } from "./ChatList";
import type { ChatSidebarProps } from "./types";
import { useStrings } from "../../../i18n/LanguageContext";
import { useAuth } from "../../../auth/AuthContext";

export function ChatSidebar({
  familyName,
  familyId,
  canCreateFamilyInvite,
  onOpenFamilyInvite,
  activeChatId,
  incomingSharedFiles,
  isLoading,
  hasLoadedOverview,
  accessToken,
  currentUserId,
  activeVoiceCallChatId,
  activeVoiceCallParticipantIds,
  minimizedChatLayout,
  selectedChatId,
  mobileCallStrip,
  overview,
  onSelectChat,
  onOpenChat,
  onOpenDraftsAndScheduled,
  isDraftsAndScheduledActive,
  onOpenMessageArchive,
  isMessageArchiveActive
}: ChatSidebarProps) {
  const strings = useStrings();
  const navigate = useNavigate();
  const { activeServer, savedServers, hotSwapServer, removeServer, currentUser } = useAuth();
  // Chat folders are saved per user on this device, so every signed-in user
  // can create and manage their own folders.
  const canManageFolders = Boolean(currentUser);
  const [isServerMenuOpen, setIsServerMenuOpen] = useState(false);
  const serverMenuRef = useRef<HTMLDivElement | null>(null);

  const validServers = savedServers.filter((server) => Boolean(server.url));
  const displayFamilyName = activeServer?.name || familyName || "Stovo";
  const {
    chatSearch,
    setChatSearch,
    filteredChats,
    chatsBySection,
    refreshChats,
    openNewChatScreen
  } = overview;

  useEffect(() => {
    if (!isServerMenuOpen) return;

    function handlePointerDown(event: MouseEvent | TouchEvent) {
      const target = event.target as Node | null;
      if (serverMenuRef.current && !serverMenuRef.current.contains(target)) {
        setIsServerMenuOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
    };
  }, [isServerMenuOpen]);

  return (
    <aside className="chat-sidebar" aria-label={strings.chats.sidebar.ariaLabel}>
      <div className={`chat-sidebar-header${isServerMenuOpen ? " is-server-menu-open" : ""}`}>
        <div className={`sidebar-title-row chat-list-title${isServerMenuOpen ? " is-server-menu-open" : ""}`}>
          <span className="chat-list-brand-mark" aria-label="Stovo">
            <StovoLogo className="chat-list-brand-logo" title="Stovo" />
          </span>
          <div className="chat-list-title-cluster">
            <div
              className={`menu-anchor server-switcher${isServerMenuOpen ? " menu-anchor--open" : ""}`}
              ref={serverMenuRef}
            >
              <button
                type="button"
                className="server-switcher-trigger"
                aria-label={strings.spaceSwitcher.selectSpace}
                aria-expanded={isServerMenuOpen}
                aria-haspopup="menu"
                onClick={() => setIsServerMenuOpen((open) => !open)}
              >
                <span className="server-switcher-name">{displayFamilyName}</span>
                <ChevronDown aria-hidden="true" size={18} className="server-switcher-caret" />
              </button>

              {isServerMenuOpen && (
                <div className="action-menu server-switcher-menu" role="menu" aria-label={strings.chats.sidebar.spaces}>
                  {validServers.length > 0 ? (
                    validServers.map((server) => {
                      const isActive = activeServer?.id === server.id;
                      return (
                        <div
                          key={server.id}
                          role="menuitem"
                          className={`server-switcher-item${isActive ? " is-active" : ""}`}
                          onClick={() => {
                            setIsServerMenuOpen(false);
                            if (!isActive) {
                              void hotSwapServer(server.id);
                            }
                          }}
                        >
                          <Server aria-hidden="true" size={16} />
                          <span className="server-switcher-details">
                            <strong>{server.name}</strong>
                            <small>{server.url}</small>
                          </span>
                          {server.unreadCount > 0 && (
                            <span className="server-unread-badge">{server.unreadCount}</span>
                          )}
                          {!isActive && (
                            <button
                              type="button"
                              className="server-switcher-delete-btn"
                              title={strings.chats.sidebar.removeSpace(server.name)}
                              onClick={(e) => {
                                e.stopPropagation();
                                removeServer(server.id);
                              }}
                            >
                              <Trash2 size={18} aria-hidden="true" />
                            </button>
                          )}
                        </div>
                      );
                    })
                  ) : (
                    <button type="button" role="menuitem" className="server-switcher-item is-active" disabled>
                      <Server aria-hidden="true" size={16} />
                      <span>
                        <strong>{displayFamilyName}</strong>
                      </span>
                    </button>
                  )}
                  <button
                    type="button"
                    role="menuitem"
                    className="server-switcher-connect"
                    onClick={() => {
                      setIsServerMenuOpen(false);
                      navigate("/auth/server");
                    }}
                  >
                    <Plus aria-hidden="true" size={16} />
                    {strings.spaceSwitcher.connectSpace}
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="sidebar-actions">
            {canCreateFamilyInvite && (
              <button
                type="button"
                className="icon-button subtle"
                aria-label={strings.chats.sidebar.createInvitation}
                title={strings.chats.sidebar.invite}
                onClick={onOpenFamilyInvite}
              >
                <UserPlus aria-hidden="true" size={20} />
              </button>
            )}
          </div>
        </div>

        {!activeChatId && incomingSharedFiles && incomingSharedFiles.files.length > 0 && (
          <div className="shared-files-ready" role="status">
            <Paperclip aria-hidden="true" size={20} />
            <span>
              <strong>{strings.chats.sidebar.sharedFilesReady(incomingSharedFiles.files.length)}</strong>
              <small>{strings.chats.sidebar.selectChatToAdd(incomingSharedFiles.files.length)}</small>
            </span>
          </div>
        )}
        <label className="search-field chat-list-search">
          <span className="ms-icon ms-icon--20" aria-hidden={true}>
            search
          </span>
          <input
            placeholder={strings.chats.searchPlaceholder}
            value={chatSearch}
            onChange={(event) => setChatSearch(event.target.value)}
          />
        </label>
        {mobileCallStrip}
      </div>

      <ChatList
        isLoading={isLoading}
        hasLoadedOverview={hasLoadedOverview}
        chatsBySection={chatsBySection}
        filteredChats={filteredChats}
        refreshChats={refreshChats}
        familyId={familyId}
        canManageFolders={canManageFolders}
        accessToken={accessToken}
        currentUserId={currentUserId}
        activeVoiceCallChatId={activeVoiceCallChatId}
        activeVoiceCallParticipantIds={activeVoiceCallParticipantIds}
        selectedChatId={selectedChatId}
        activeChatId={activeChatId}
        minimizedChatLayout={minimizedChatLayout}
        onSelectChat={onSelectChat}
        onOpenChat={onOpenChat}
        onOpenMemberDm={(userId) => void overview.startDirectChatWith(userId)}
        onOpenDraftsAndScheduled={onOpenDraftsAndScheduled}
        isDraftsAndScheduledActive={isDraftsAndScheduledActive}
        onOpenMessageArchive={onOpenMessageArchive}
        isMessageArchiveActive={isMessageArchiveActive}
        onStartNewChat={openNewChatScreen}
      />
      <button
        type="button"
        className="compose-fab"
            aria-label={strings.chats.sidebar.startChat}
            title={strings.chats.sidebar.startChat}
        onClick={openNewChatScreen}
      >
        <Plus aria-hidden={true} size={16} />
      </button>
    </aside>
  );
}
