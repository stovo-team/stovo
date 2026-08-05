import { useEffect, useRef, useState } from "react";
import { ChevronDown, Paperclip, Plus, Server, UserPlus } from "lucide-react";
import { useNavigate } from "react-router-dom";

import VeloLogo from "../../../components/VeloLogo";
import { CHAT_FILTERS } from "../shared/chatPresentation";
import { ChatList } from "./ChatList";
import type { ChatSidebarProps } from "./types";

export function ChatSidebar({
  familyName,
  canCreateFamilyInvite,
  onOpenFamilyInvite,
  activeChatId,
  incomingSharedFiles,
  isLoading,
  accessToken,
  currentUserId,
  minimizedChatLayout,
  selectedChatId,
  mobileCallStrip,
  overview,
  onSelectChat,
  onOpenChat
}: ChatSidebarProps) {
  const navigate = useNavigate();
  const [isServerMenuOpen, setIsServerMenuOpen] = useState(false);
  const serverMenuRef = useRef<HTMLDivElement | null>(null);
  const {
    chatSearch,
    setChatSearch,
    chatFilter,
    setChatFilter,
    filteredChats,
    chatsBySection,
    openNewChatScreen
  } = overview;

  useEffect(() => {
    if (!isServerMenuOpen) return;

    function handlePointerDown(event: MouseEvent | TouchEvent) {
      const target = event.target as Node | null;
      if (!target || serverMenuRef.current?.contains(target)) return;
      setIsServerMenuOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setIsServerMenuOpen(false);
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isServerMenuOpen]);

  return (
    <aside className="chat-sidebar">
      <div className="chat-sidebar-header">
        <div className="sidebar-title-row chat-list-title">
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
                <span className="server-switcher-name">{familyName}</span>
                <ChevronDown aria-hidden="true" size={18} className="server-switcher-caret" />
              </button>
              {isServerMenuOpen && (
                <div className="action-menu server-switcher-menu" role="menu" aria-label="Servers">
                  <button type="button" role="menuitem" className="server-switcher-item is-active" disabled>
                    <Server aria-hidden="true" size={16} />
                    <span>
                      <strong>{familyName}</strong>
                      <small>Current server</small>
                    </span>
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="server-switcher-connect"
                    onClick={() => {
                      setIsServerMenuOpen(false);
                      navigate("/server-setup");
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
            placeholder="Search chats"
            value={chatSearch}
            onChange={(event) => setChatSearch(event.target.value)}
          />
        </label>
        <div
          className="filter-chip-row chat-list-filters"
          aria-label="Chat filters"
          onWheel={(event) => {
            if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
            event.currentTarget.scrollLeft += event.deltaY;
            event.preventDefault();
          }}
        >
          {CHAT_FILTERS.map((filter) => (
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
