import { Check, Forward, X } from "lucide-react";
import { useEffect, useState } from "react";

import { useStrings } from "../../../i18n/LanguageContext";
import type { Chat } from "../../../api/chats";
import { messageActionSummary } from "../shared/messagePresentation";
import {
  chatAvatarFallbackKind,
  chatAvatarFile,
  chatAvatarTypeClass,
  displayChatName
} from "../shared/chatPresentation";
import { RealAvatar } from "../sidebar/RealAvatar";
import type { Message } from "../shared/types";

export function ForwardChatList({
  accessToken,
  currentUserId,
  chats,
  onSelect,
  selectedChatIds,
  onToggle,
  searchable = false
}: {
  accessToken: string | null;
  currentUserId?: string;
  chats: Chat[];
  onSelect: (chatId: string) => void;
  selectedChatIds?: string[];
  onToggle?: (chatId: string) => void;
  searchable?: boolean;
}) {
  const strings = useStrings();
  const [query, setQuery] = useState("");
  const visibleChats = chats.filter((chat) => displayChatName(chat, currentUserId, strings).toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const isMultiSelect = selectedChatIds !== undefined;
  return (
    <>
      {searchable && <label className="forward-chat-search"><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search chats" aria-label="Search chats" /></label>}
      <div className="forward-chat-list">
      {visibleChats.map((chat) => {
        const name = displayChatName(chat, currentUserId, strings);
        const selected = selectedChatIds?.includes(chat.id) ?? false;
        return (
          <button type="button" key={chat.id} className={selected ? "is-selected" : ""} onClick={() => isMultiSelect ? onToggle?.(chat.id) : onSelect(chat.id)}>
            {isMultiSelect && <span className="forward-chat-check">{selected && <Check size={15} />}</span>}
            <RealAvatar
              accessToken={accessToken}
              className={`avatar member-avatar ${chatAvatarTypeClass(chat)}`}
              fallbackKind={chatAvatarFallbackKind(chat)}
              file={chatAvatarFile(chat, currentUserId)}
              label={name}
            />
            <span>{name}</span>
          </button>
        );
      })}
      {visibleChats.length === 0 && <p className="forward-chat-empty">No chats found.</p>}
      </div>
    </>
  );
}

export function MessageDialogs({
  accessToken,
  currentUserId,
  chats,
  forwardTarget,
  forwardCount = 1,
  onForwardMessage,
  onCloseForward,
  deleteTarget,
  deleteForMe,
  deleteForEveryone,
  onDeleteForMeChange,
  onDeleteForEveryoneChange,
  onConfirmDelete,
  onCloseDelete
}: {
  accessToken: string | null;
  currentUserId?: string;
  chats: Chat[];
  forwardTarget: Message | null;
  forwardCount?: number;
  onForwardMessage: (chatId: string) => void;
  onCloseForward: () => void;
  deleteTarget: Message | null;
  deleteForMe: boolean;
  deleteForEveryone: boolean;
  onDeleteForMeChange: (value: boolean) => void;
  onDeleteForEveryoneChange: (value: boolean) => void;
  onConfirmDelete: () => void;
  onCloseDelete: () => void;
}) {
  const [forwardChatIds, setForwardChatIds] = useState<string[]>([]);

  useEffect(() => {
    setForwardChatIds([]);
  }, [forwardTarget?.id]);

  const toggleForwardChat = (chatId: string) => {
    setForwardChatIds((current) => current.includes(chatId) ? current.filter((id) => id !== chatId) : [...current, chatId]);
  };

  return (
    <>
      {forwardTarget && (
        <div className="modal-backdrop" role="presentation">
          <section className="messenger-modal" role="dialog" aria-modal="true" aria-labelledby="forward-title">
            <div className="modal-header">
              <h2 id="forward-title">
                {forwardCount > 1 ? `Forward ${forwardCount} messages` : "Forward message"}
              </h2>
              <button
                type="button"
                className="icon-button subtle"
                aria-label="Close forward dialog"
                title="Close"
                onClick={() => { setForwardChatIds([]); onCloseForward(); }}
              >
                <X aria-hidden="true" size={18} />
              </button>
            </div>
            <p className="forward-preview">
              {forwardCount > 1
                ? `${forwardCount} messages selected`
                : messageActionSummary(forwardTarget)}
            </p>
            <ForwardChatList accessToken={accessToken} currentUserId={currentUserId} chats={chats} searchable selectedChatIds={forwardChatIds} onToggle={toggleForwardChat} onSelect={onForwardMessage} />
            <button type="button" className="forward-dialog-confirm" disabled={!forwardChatIds.length} onClick={() => { forwardChatIds.forEach(onForwardMessage); setForwardChatIds([]); }}><Forward aria-hidden="true" size={18} /> Forward</button>
          </section>
        </div>
      )}

      {deleteTarget && (
        <div className="modal-backdrop" role="presentation">
          <section
            className="messenger-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-message-title"
          >
            <div className="modal-header">
              <h2 id="delete-message-title">Delete message?</h2>
              <button
                type="button"
                className="icon-button subtle"
                aria-label="Close delete dialog"
                title="Close"
                onClick={onCloseDelete}
              >
                <X aria-hidden="true" size={18} />
              </button>
            </div>
            <div className="delete-message-options">
              <label>
                <input
                  type="checkbox"
                  checked={deleteForMe}
                  onChange={(e) => onDeleteForMeChange(e.target.checked)}
                />
                Delete for me
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={deleteForEveryone}
                  onChange={(e) => onDeleteForEveryoneChange(e.target.checked)}
                />
                Delete for everyone
              </label>
            </div>
            <div className="modal-actions">
              <button
                type="button"
                className="button-danger"
                disabled={!deleteForMe && !deleteForEveryone}
                onClick={onConfirmDelete}
              >
                Delete
              </button>
              <button type="button" className="button-secondary" onClick={onCloseDelete}>
                Cancel
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
