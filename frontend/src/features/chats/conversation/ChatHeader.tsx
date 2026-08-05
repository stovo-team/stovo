import { RefObject } from "react";
import { Bell, BellOff, CheckCheck, Info, Phone, Pin, Star, Video } from "lucide-react";

import type { User } from "../../../api/auth";
import type { Chat } from "../../../api/chats";
import {
  chatAvatarFallbackKind,
  chatAvatarFile,
  chatAvatarTypeClass,
  chatTransitionName,
  displayChatName,
  transitionAnchorStyle
} from "../shared/chatPresentation";
import type { CallPhase } from "../shared/types";
import { RealAvatar } from "../sidebar/RealAvatar";

export function ChatHeader({
  accessToken,
  currentUser,
  selectedChat,
  typingNames,
  callPhase,
  activeCallChatId,
  isChatMenuOpen,
  chatMenuRef,
  onToggleChatMenu,
  onBack,
  onOpenDetails,
  onStartAudioCall,
  onStartVideoCall,
  isMessageSearchOpen,
  onToggleMessageSearch,
  onOpenMessageSearch,
  onMarkRead,
  onTogglePinned,
  onToggleMuted,
  onToggleFavorite
}: {
  accessToken: string | null;
  currentUser: User | null;
  selectedChat: Chat;
  typingNames: string[];
  callPhase: CallPhase;
  activeCallChatId: string | null;
  isChatMenuOpen: boolean;
  chatMenuRef: RefObject<HTMLDivElement | null>;
  onToggleChatMenu: () => void;
  onBack: () => void;
  onOpenDetails: () => void;
  onStartAudioCall: () => void;
  onStartVideoCall: () => void;
  isMessageSearchOpen: boolean;
  onToggleMessageSearch: () => void;
  onOpenMessageSearch: () => void;
  onMarkRead: () => void;
  onTogglePinned: () => void;
  onToggleMuted: () => void;
  onToggleFavorite: () => void;
}) {
  return (
    <div className="chat-detail-header chat-detail-header--floating">
      <button type="button" className="mobile-back-button" aria-label="Back to chats" onClick={onBack}>
        <span className="ms-icon ms-icon--20" aria-hidden={true}>
          arrow_back
        </span>
      </button>
      <button type="button" className="chat-title-group" aria-label="Open chat details" onClick={onOpenDetails}>
        <RealAvatar
          accessToken={accessToken}
          className={`avatar chat-avatar ${chatAvatarTypeClass(selectedChat)}`}
          fallbackKind={chatAvatarFallbackKind(selectedChat)}
          file={chatAvatarFile(selectedChat, currentUser?.id)}
          label={displayChatName(selectedChat, currentUser?.id)}
          style={transitionAnchorStyle(chatTransitionName(selectedChat.id, "avatar"))}
        />
        <span>
          <strong style={transitionAnchorStyle(chatTransitionName(selectedChat.id, "title"))}>
            {displayChatName(selectedChat, currentUser?.id)}
          </strong>
          {(typingNames.length > 0 ||
            (selectedChat.type !== "archive" && selectedChat.type !== "direct")) && (
            <small>
              {typingNames.length > 0
                ? `${typingNames.join(", ")} typing...`
                : `${selectedChat.members.length} member${selectedChat.members.length === 1 ? "" : "s"}`}
            </small>
          )}
        </span>
      </button>
      <div className="chat-header-actions">
        {(selectedChat.type === "direct" || selectedChat.type === "group" || selectedChat.type === "family") && (
          <>
            <button
              type="button"
              className="icon-button subtle chat-header-call-button chat-header-call-button--audio"
              aria-label="Audio call"
              title="Audio call"
              onClick={onStartAudioCall}
              disabled={callPhase !== "idle" && activeCallChatId === selectedChat.id}
            >
              <Phone aria-hidden="true" size={17} strokeWidth={2} />
            </button>
            <button
              type="button"
              className="icon-button subtle chat-header-call-button"
              aria-label="Video call"
              title="Video call"
              onClick={onStartVideoCall}
              disabled={callPhase !== "idle" && activeCallChatId === selectedChat.id}
            >
              <Video aria-hidden="true" size={18} strokeWidth={2} />
            </button>
          </>
        )}
        <button
          type="button"
          className="chat-header-search-button"
          aria-label="Search messages"
          aria-pressed={isMessageSearchOpen}
          title="Search messages"
          onClick={onToggleMessageSearch}
        >
          <span className="ms-icon ms-icon--20" aria-hidden={true}>
            search
          </span>
        </button>
        {false && (
          <div className={isChatMenuOpen ? "menu-anchor menu-anchor--open" : "menu-anchor"} ref={chatMenuRef}>
            <button
              type="button"
              className="icon-button subtle icon-button--plain"
              aria-label="More actions"
              aria-expanded={isChatMenuOpen}
              aria-haspopup="menu"
              title="More actions"
              onClick={onToggleChatMenu}
            >
              <span className="ms-icon ms-icon--20" aria-hidden={true}>
                more_vert
              </span>
            </button>
            {isChatMenuOpen && (
              <div className="action-menu" role="menu">
                <button type="button" role="menuitem" onClick={onOpenMessageSearch}>
                  <span className="ms-icon ms-icon--20" aria-hidden={true}>
                    search
                  </span>
                  Search messages
                </button>
                <button type="button" role="menuitem" onClick={onOpenDetails}>
                  <Info aria-hidden="true" size={16} />
                  Chat details
                </button>
                <button type="button" role="menuitem" onClick={onMarkRead}>
                  <CheckCheck aria-hidden="true" size={16} />
                  Mark as read
                </button>
                <button type="button" role="menuitem" onClick={onTogglePinned}>
                  <Pin aria-hidden="true" size={16} />
                  {selectedChat.isPinned ? "Unpin chat" : "Pin chat"}
                </button>
                <button type="button" role="menuitem" onClick={onToggleMuted}>
                  {selectedChat.isMuted ? <Bell aria-hidden="true" size={16} /> : <BellOff aria-hidden="true" size={16} />}
                  {selectedChat.isMuted ? "Unmute" : "Mute"}
                </button>
                <button type="button" role="menuitem" onClick={onToggleFavorite}>
                  <Star aria-hidden="true" size={16} />
                  {selectedChat.isFavorite ? "Remove favorite" : "Favorite"}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
