import { useEffect, useRef, useState } from "react";
import { ChevronDown, Paperclip, Plus, Server, Trash2, UserPlus } from "lucide-react";
import { useNavigate } from "react-router-dom";

import VeloLogo from "../../../components/VeloLogo";
import type { ChatFilter } from "../shared/types";
import { ChatList } from "./ChatList";
import type { ChatSidebarProps } from "./types";
import { useStrings } from "../../../i18n/LanguageContext";
import { useAuth } from "../../../auth/AuthContext";

export function ChatSidebar({
  familyName,
  canCreateFamilyInvite,
  onOpenFamilyInvite,
  activeChatId,
  incomingSharedFiles,
  isLoading,
  hasLoadedOverview,
  accessToken,
  currentUserId,
  minimizedChatLayout,
  selectedChatId,
  mobileCallStrip,
  overview,
  onSelectChat,
  onOpenChat
}: ChatSidebarProps) {
  const strings = useStrings();
  const navigate = useNavigate();
  const { activeServer, savedServers, hotSwapServer, removeServer } = useAuth();
  const [isServerMenuOpen, setIsServerMenuOpen] = useState(false);
  const serverMenuRef = useRef<HTMLDivElement | null>(null);

  const validServers = savedServers.filter((server) => Boolean(server.url));
  const displayFamilyName = activeServer?.name || familyName || "Stovo";
  const {
    chatSearch,
    setChatSearch,
    chatFilter,
    setChatFilter,
    filteredChats,
    chatsBySection,
    openNewChatScreen
  } = overview;

  const chatFilters: Array<{ label: string; value: ChatFilter }> = [
    { label: strings.chats.filters.all, value: "all" },
    { label: strings.chats.filters.unread, value: "unread" },
    { label: strings.chats.filters.groups, value: "groups" },
    { label: strings.chats.filters.direct, value: "direct" },
    { label: strings.chats.filters.voice, value: "voice" },
    { label: strings.chats.filters.muted, value: "muted" }
  ];

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
    <aside className="chat-sidebar" aria-label="Chats sidebar">
      <div className={`chat-sidebar-header${isServerMenuOpen ? " is-server-menu-open" : ""}`}>
        <div className={`sidebar-title-row chat-list-title${isServerMenuOpen ? " is-server-menu-open" : ""}`}>
          <span className="chat-list-brand-mark" aria-label="Stovo">
            <VeloLogo className="chat-list-brand-logo" title="Stovo" />
          </span>
          <div className="chat-list-title-cluster">
            <div
              className={`menu-anchor server-switcher${isServerMenuOpen ? " menu-anchor--open" : ""}`}
              ref={serverMenuRef}
            >
              <button
                type="button"
                className="server-switcher-trigger"
                aria-label="Select server"
                aria-expanded={isServerMenuOpen}
                aria-haspopup="menu"
                onClick={() => setIsServerMenuOpen((open) => !open)}
              >
                <span className="server-switcher-name">{displayFamilyName}</span>
                <ChevronDown aria-hidden="true" size={18} className="server-switcher-caret" />
              </button>

              {isServerMenuOpen && (
                <div className="action-menu server-switcher-menu" role="menu" aria-label="Servers">
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
                              title={`Remove ${server.name}`}
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
                        <small>Current server</small>
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
                    Connect Server
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
                aria-label="Create invitation"
                title="Invite"
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
              <strong>Shared {incomingSharedFiles.files.length === 1 ? "file" : "files"} ready to send</strong>
              <small>Select a chat to add {incomingSharedFiles.files.length === 1 ? "it" : "them"}.</small>
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
        <div
          className="filter-chip-row chat-list-filters"
          aria-label={strings.chats.title}
          onWheel={(event) => {
            if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
            event.currentTarget.scrollLeft += event.deltaY;
            event.preventDefault();
          }}
        >
          {chatFilters.map((filter) => (
            <button
              type="button"
              className={chatFilter === filter.value ? "filter-chip active" : "filter-chip"}
              aria-pressed={chatFilter === filter.value}
              key={filter.value}
              onClick={() => setChatFilter(filter.value)}
            >
              {filter.label}
            </button>
          ))}
        </div>

        {mobileCallStrip}
      </div>

      <ChatList
        isLoading={isLoading}
        hasLoadedOverview={hasLoadedOverview}
        chatsBySection={chatsBySection}
        filteredChats={filteredChats}
        chatFilter={chatFilter}
        accessToken={accessToken}
        currentUserId={currentUserId}
        selectedChatId={selectedChatId}
        activeChatId={activeChatId}
        minimizedChatLayout={minimizedChatLayout}
        onSelectChat={onSelectChat}
        onOpenChat={onOpenChat}
        onStartNewChat={openNewChatScreen}
      />
      <button
        type="button"
        className="compose-fab"
        aria-label="Start a chat"
        title="Start a chat"
        onClick={openNewChatScreen}
      >
        <span className="ms-icon ms-icon--24" aria-hidden={true}>
          edit_square
        </span>
      </button>
    </aside>
  );
}
