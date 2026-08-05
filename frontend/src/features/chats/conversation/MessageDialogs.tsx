import { useEffect, useRef } from "react";
import { X } from "lucide-react";

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

function CopySheetTextarea({
  content,
  onCopy,
  onClose
}: {
  content: string;
  onCopy: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  function handleCopy() {
    if (ref.current) {
      ref.current.focus();
      ref.current.select();
    }
    const ok = document.execCommand("copy");
    if (!ok) {
      void navigator.clipboard.writeText(ref.current?.value ?? content);
    }
    onCopy();
  }
  return (
    <>
      <textarea ref={ref} defaultValue={content} readOnly={false} className="copy-sheet-textarea" />
      <div className="copy-sheet-actions">
        <button type="button" className="copy-sheet-cancel-btn" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="copy-sheet-copy-btn" onClick={handleCopy}>
          Copy
        </button>
      </div>
    </>
  );
}

export function MessageDialogs({
  accessToken,
  currentUserId,
  chats,
  forwardTarget,
  onForwardMessage,
  onCloseForward,
  deleteTarget,
  deleteForMe,
  deleteForEveryone,
  onDeleteForMeChange,
  onDeleteForEveryoneChange,
  onConfirmDelete,
  onCloseDelete,
  copySheetContent,
  onCloseCopySheet
}: {
  accessToken: string | null;
  currentUserId?: string;
  chats: Chat[];
  forwardTarget: Message | null;
  onForwardMessage: (chatId: string) => void;
  onCloseForward: () => void;
  deleteTarget: Message | null;
  deleteForMe: boolean;
  deleteForEveryone: boolean;
  onDeleteForMeChange: (value: boolean) => void;
  onDeleteForEveryoneChange: (value: boolean) => void;
  onConfirmDelete: () => void;
  onCloseDelete: () => void;
  copySheetContent: string | null;
  onCloseCopySheet: () => void;
}) {
  return (
    <>
      {forwardTarget && (
        <div className="modal-backdrop" role="presentation">
          <section className="messenger-modal" role="dialog" aria-modal="true" aria-labelledby="forward-title">
            <div className="modal-header">
              <h2 id="forward-title">Forward message</h2>
              <button
                type="button"
                className="icon-button subtle"
                aria-label="Close forward dialog"
                title="Close"
                onClick={onCloseForward}
              >
                <X aria-hidden="true" size={18} />
              </button>
            </div>
            <p className="forward-preview">{messageActionSummary(forwardTarget)}</p>
            <div className="forward-chat-list">
              {chats.map((chat) => (
                <button type="button" key={chat.id} onClick={() => onForwardMessage(chat.id)}>
                  <RealAvatar
                    accessToken={accessToken}
                    className={`avatar member-avatar ${chatAvatarTypeClass(chat)}`}
                    fallbackKind={chatAvatarFallbackKind(chat)}
                    file={chatAvatarFile(chat, currentUserId)}
                    label={displayChatName(chat, currentUserId)}
                  />
                  <span>{displayChatName(chat, currentUserId)}</span>
                </button>
              ))}
            </div>
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

      {copySheetContent !== null && (
        <div className="copy-sheet-backdrop" role="presentation" onMouseDown={onCloseCopySheet}>
          <div
            className="copy-sheet"
            role="dialog"
            aria-modal="true"
            aria-label="Copy message text"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <CopySheetTextarea content={copySheetContent} onCopy={onCloseCopySheet} onClose={onCloseCopySheet} />
          </div>
        </div>
      )}
    </>
  );
}
