import { Check, Forward } from "lucide-react";
import { useEffect, useState } from "react";
import { PopupDialog } from "../../../components/ui/Popup";
import { PopupButton } from "../../../components/ui/PopupButton";
import { PopupField } from "../../../components/ui/PopupField";

import { useStrings } from "../../../i18n/LanguageContext";
import type { Chat } from "../../../api/chats";
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
      {searchable && <PopupField label="Search chats" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search chats" />}
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

export function ForwardChatDialog({
  title,
  accessToken,
  currentUserId,
  chats,
  selectedChatIds,
  onToggle,
  onForward,
  onClose
}: {
  title: string;
  accessToken: string | null;
  currentUserId?: string;
  chats: Chat[];
  selectedChatIds: string[];
  onToggle: (chatId: string) => void;
  onForward: () => void;
  onClose: () => void;
}) {
  return (
    <PopupDialog className="forward-dialog" ariaLabelledBy="forward-dialog-title" onClose={onClose} closeLabel="Close forward dialog" size="lg">
        <header className="forward-dialog-header">
          <div className="forward-dialog-heading"><Forward aria-hidden="true" size={22} /><h2 id="forward-dialog-title">{title}</h2></div>
        </header>
        <ForwardChatList accessToken={accessToken} currentUserId={currentUserId} chats={chats} searchable selectedChatIds={selectedChatIds} onToggle={onToggle} onSelect={() => undefined} />
        <PopupButton variant="primary" className="forward-dialog-confirm" disabled={!selectedChatIds.length} onClick={onForward} startIcon={<Forward size={18} />}>Forward</PopupButton>
    </PopupDialog>
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
      {forwardTarget && <ForwardChatDialog title={forwardCount > 1 ? `Forward ${forwardCount} messages` : "Forward message"} accessToken={accessToken} currentUserId={currentUserId} chats={chats} selectedChatIds={forwardChatIds} onToggle={toggleForwardChat} onForward={() => { forwardChatIds.forEach(onForwardMessage); setForwardChatIds([]); }} onClose={() => { setForwardChatIds([]); onCloseForward(); }} />}

      {deleteTarget && (
        <PopupDialog
            ariaLabelledBy="delete-message-title"
            dialogRole="alertdialog"
            onClose={onCloseDelete}
            closeLabel="Close delete dialog"
          >
            <div className="modal-header">
              <h2 id="delete-message-title">Delete message?</h2>
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
              <PopupButton
                variant="danger"
                disabled={!deleteForMe && !deleteForEveryone}
                onClick={onConfirmDelete}
              >
                Delete
              </PopupButton>
              <PopupButton variant="secondary" onClick={onCloseDelete}>
                Cancel
              </PopupButton>
            </div>
        </PopupDialog>
      )}
    </>
  );
}
