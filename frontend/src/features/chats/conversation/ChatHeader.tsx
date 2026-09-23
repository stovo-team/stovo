import { RefObject } from "react";
import {
  Archive,
  Bell,
  BellOff,
  CheckCheck,
  Copy,
  FileText,
  Info,
  Maximize2,
  MessageCircle,
  MessageCircleOff,
  Pencil,
  Phone,
  Pin,
  Search,
  Star,
  Trash2,
  Video
} from "lucide-react";

import { useStrings } from "../../../i18n/LanguageContext";
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
import type { CallPhase, Message } from "../shared/types";
import { RealAvatar } from "../sidebar/RealAvatar";
import { BackButton } from "../../../components/BackButton";

function directChatPresence(selectedChat: Chat, currentUser: User | null) {
  const peer = selectedChat.members.find((member) => member.id !== currentUser?.id);
  if (!peer) return null;
  if (peer.isOnline) return "Online";
  if (peer.lastSeenVisibility === "nobody" || !peer.lastSeenAt) return "last seen recently";

  const lastSeen = new Date(peer.lastSeenAt);
  if (Number.isNaN(lastSeen.getTime())) return "last seen recently";
  return `last seen at ${new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(lastSeen)}`;
}

export function ChatHeader({
  accessToken,
  currentUser,
  selectedChat,
  typingNames,
  callPhase,
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
  onToggleFavorite,
  isMessageSelectionMode = false,
  selectedCount = 0,
  canEditSelected = false,
  canDeleteSelected = false,
  onSelectionCopy,
  onSelectionDelete,
  onSelectionArchive,
  onSelectionEdit,
  threadRootMessage = null,
  onBackFromThread,
  archiveGroupSourceChat,
  archiveGroupName,
  archiveGroupKind,
  onBackFromArchiveGroup,
  isVoiceTextChatOpen = false,
  onToggleVoiceChat,
}: {
  accessToken: string | null;
  currentUser: User | null;
  selectedChat: Chat;
  typingNames: string[];
  callPhase: CallPhase;
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
  isMessageSelectionMode?: boolean;
  selectedCount?: number;
  canEditSelected?: boolean;
  canDeleteSelected?: boolean;
  onSelectionCopy?: () => void;
  onSelectionDelete?: () => void;
  onSelectionArchive?: () => void;
  onSelectionEdit?: () => void;
  threadRootMessage?: Message | null;
  onBackFromThread?: () => void;
  archiveGroupSourceChat?: Chat | null;
  archiveGroupName?: string;
  archiveGroupKind?: "notes" | "chat";
  onBackFromArchiveGroup?: () => void;
  isVoiceTextChatOpen?: boolean;
  onToggleVoiceChat?: () => void;
}) {
  const strings = useStrings();
  const chatName = displayChatName(selectedChat, currentUser?.id, strings);
  const isArchiveGroup = Boolean(archiveGroupName && onBackFromArchiveGroup);
  const isNotesArchiveGroup = archiveGroupKind === "notes";
  const archiveGroupChat = archiveGroupSourceChat ?? selectedChat;
  const archiveGroupChatName = archiveGroupSourceChat
    ? displayChatName(archiveGroupSourceChat, currentUser?.id, strings)
    : archiveGroupName ?? chatName;
  // An archive group represents a different conversation from the archive
  // itself. Keep source-chat groups attached to their original avatar; My
  // Notes uses the Message Archive icon in both the list and its header.
  const archiveGroupAvatarFile = archiveGroupSourceChat
    ? chatAvatarFile(archiveGroupSourceChat, currentUser?.id)
    : null;
  const presence = selectedChat.type === "direct" ? directChatPresence(selectedChat, currentUser) : null;
  const handleBack = isArchiveGroup
    ? onBackFromArchiveGroup
    : threadRootMessage && onBackFromThread
      ? onBackFromThread
      : onBack;

  return (
    <div className="chat-detail-header chat-detail-header--floating">
      <BackButton
        className={isArchiveGroup ? "archive-group-back-button" : "mobile-back-button"}
        ariaLabel={isArchiveGroup ? "Back to grouped Message Archive" : threadRootMessage ? "Back to chat" : "Back to chats"}
        title={isArchiveGroup ? "Back to grouped Message Archive" : undefined}
        onClick={handleBack}
      />
      {threadRootMessage ? (
        <div className="chat-title-group chat-title-group--thread" aria-live="polite">
          <RealAvatar
            accessToken={accessToken}
            className={`avatar chat-avatar ${chatAvatarTypeClass(selectedChat)}`}
            fallbackKind={chatAvatarFallbackKind(selectedChat)}
            file={chatAvatarFile(selectedChat, currentUser?.id)}
            label={chatName}
            style={transitionAnchorStyle(chatTransitionName(selectedChat.id, "avatar"))}
          />
          <span>
            <span className="chat-title-row">
              <span>{strings.comments.title}</span>
            </span>
            <small className="chat-presence">
              {chatName}
            </small>
          </span>
        </div>
      ) : isMessageSelectionMode ? (
        <div className="chat-title-group chat-title-group--selection" aria-live="polite">
          <span>
            <strong>
              {selectedCount} selected
            </strong>
          </span>
        </div>
      ) : isArchiveGroup ? (
        <div className="chat-title-group chat-title-group--archive-group" aria-label={`Message Archive, ${archiveGroupName}`}>
          {isNotesArchiveGroup ? (
            <span className="avatar chat-avatar archive" style={transitionAnchorStyle(chatTransitionName(archiveGroupChat.id, "avatar"))}><FileText size={20} /></span>
          ) : (
            <RealAvatar
              accessToken={accessToken}
              className={`avatar chat-avatar ${archiveGroupSourceChat ? chatAvatarTypeClass(archiveGroupSourceChat) : "archive chat-avatar--archive"}`}
              fallbackKind={archiveGroupSourceChat ? chatAvatarFallbackKind(archiveGroupSourceChat) : "archive"}
              file={archiveGroupAvatarFile}
              label={archiveGroupChatName}
              style={transitionAnchorStyle(chatTransitionName(archiveGroupChat.id, "avatar"))}
            />
          )}
          <span className="chat-title-row" style={transitionAnchorStyle(chatTransitionName(archiveGroupChat.id, "title"))}>
            <span>Message Archive</span><span className="archive-group-title-divider" aria-hidden="true">•</span><span>{archiveGroupName}</span>
          </span>
        </div>
      ) : (
        <button type="button" className="chat-title-group" aria-label="Open chat details" onClick={onOpenDetails}>
          <RealAvatar
            accessToken={accessToken}
            className={`avatar chat-avatar ${chatAvatarTypeClass(selectedChat)}`}
            fallbackKind={chatAvatarFallbackKind(selectedChat)}
            file={chatAvatarFile(selectedChat, currentUser?.id)}
            label={chatName}
            style={transitionAnchorStyle(chatTransitionName(selectedChat.id, "avatar"))}
          />
          <span>
            <span className="chat-title-row" style={transitionAnchorStyle(chatTransitionName(selectedChat.id, "title"))}>
              <span>{chatName}</span>
              {typingNames.length > 0 && (
                <span className="typing-dots" title={`${typingNames.join(", ")} typing`} aria-label="typing">
                  <span className="typing-dot" />
                  <span className="typing-dot" />
                  <span className="typing-dot" />
                </span>
              )}
            </span>
            {selectedChat.type !== "archive" && (
              <small className="chat-presence">
                {selectedChat.type === "direct"
                  ? presence
                  : typingNames.length > 0
                    ? `${typingNames.join(", ")} typing...`
                    : selectedChat.description?.trim()
                    ? `${strings.chats.types.membersCount(selectedChat.members.length)} · ${selectedChat.description.trim()}`
                    : strings.chats.types.membersCount(selectedChat.members.length)}
              </small>
            )}
          </span>
        </button>
      )}
      <div className="chat-header-actions">
        {isMessageSelectionMode ? (
          <>
            <button
              type="button"
              className="icon-button subtle chat-header-selection-button"
              aria-label="Copy selected messages"
              title="Copy"
              onClick={onSelectionCopy}
            >
              <Copy aria-hidden="true" size={18} />
            </button>
            {canDeleteSelected && (
              <button
                type="button"
                className="icon-button subtle chat-header-selection-button"
                aria-label="Delete selected messages"
                title="Delete"
                onClick={onSelectionDelete}
              >
                <Trash2 aria-hidden="true" size={18} />
              </button>
            )}
            <button
              type="button"
              className="icon-button subtle chat-header-selection-button"
              aria-label="Archive selected messages"
              title={strings.chats.details.saveToArchive}
              onClick={onSelectionArchive}
            >
              <Archive aria-hidden="true" size={18} />
            </button>
            {canEditSelected && (
              <button
                type="button"
                className="icon-button subtle chat-header-selection-button"
                aria-label="Edit selected message"
                title="Edit"
                onClick={onSelectionEdit}
              >
                <Pencil aria-hidden="true" size={18} />
              </button>
            )}
          </>
        ) : (
          <>
            {(selectedChat.type === "direct" || selectedChat.type === "group" || selectedChat.type === "family") && (
              <>
                <button
                  type="button"
                  className="icon-button subtle chat-header-call-button chat-header-call-button--audio"
                  aria-label="Audio call"
                  title={callPhase !== "idle" ? "Another call is in progress" : "Audio call"}
                  onClick={onStartAudioCall}
                  disabled={callPhase !== "idle"}
                >
                  <Phone aria-hidden="true" size={17} strokeWidth={2} />
                </button>
                <button
                  type="button"
                  className="icon-button subtle chat-header-call-button"
                  aria-label="Video call"
                  title={callPhase !== "idle" ? "Another call is in progress" : "Video call"}
                  onClick={onStartVideoCall}
                  disabled={callPhase !== "idle"}
                >
                  <Video aria-hidden="true" size={18} strokeWidth={2} />
                </button>
              </>
            )}
            {selectedChat.type === "voice" ? (
              <button
                type="button"
                className="icon-button subtle chat-header-call-button chat-header-voice-chat-button"
                aria-label={isVoiceTextChatOpen ? "Close chat" : "Open chat"}
                title={isVoiceTextChatOpen ? "Close chat" : "Open chat"}
                onClick={onToggleVoiceChat}
              >
                {isVoiceTextChatOpen ? (
                  <MessageCircleOff aria-hidden="true" size={18} strokeWidth={2} />
                ) : (
                  <MessageCircle aria-hidden="true" size={18} strokeWidth={2} />
                )}
              </button>
            ) : (
              <button
                type="button"
                className="chat-header-search-button"
                aria-label="Search messages"
                aria-pressed={isMessageSearchOpen}
                title="Search messages"
                onClick={onToggleMessageSearch}
              >
                <Search aria-hidden="true" size={20} />
              </button>
            )}
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
          </>
        )}
      </div>
    </div>
  );
}
