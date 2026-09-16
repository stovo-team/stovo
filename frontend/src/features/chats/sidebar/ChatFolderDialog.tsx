import { FormEvent, useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { ChatFolder, defaultFolderRules, folderChatTypes } from "./chatFolders";

type ChatFolderDialogProps = {
  folder: ChatFolder | null;
  onClose: () => void;
  onSave: (folder: ChatFolder) => void;
  onDelete: (folder: ChatFolder) => void;
  title?: string;
  allowDelete?: boolean;
};

export function ChatFolderDialog({ folder, onClose, onSave, onDelete, title, allowDelete = true }: ChatFolderDialogProps) {
  const [draft, setDraft] = useState<ChatFolder>(() => folder ?? {
    id: crypto.randomUUID(), name: "", rules: defaultFolderRules()
  });

  useEffect(() => {
    setDraft(folder ?? { id: crypto.randomUUID(), name: "", rules: defaultFolderRules() });
  }, [folder]);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!draft.name.trim()) return;
    onSave({ ...draft, name: draft.name.trim(), rules: { ...draft.rules, titleIncludes: draft.rules.titleIncludes.trim() } });
  }

  return createPortal(
    <div className="modal-backdrop chat-folder-backdrop" role="presentation" onMouseDown={onClose}>
      <form className="chat-folder-dialog" role="dialog" aria-modal="true" aria-labelledby="chat-folder-title" onMouseDown={(event) => event.stopPropagation()} onSubmit={submit}>
        <div className="modal-header">
          <h2 id="chat-folder-title">{title ?? (folder ? "Edit folder" : "New folder")}</h2>
          <button type="button" className="chat-folder-close" aria-label="Close" onClick={onClose}><span className="ms-icon ms-icon--20" aria-hidden="true">close</span></button>
        </div>
        <div className="chat-folder-body">
          <label className="chat-folder-field">Folder name<input autoFocus value={draft.name} maxLength={60} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="e.g. Project updates" /></label>
          <fieldset className="chat-folder-rules"><legend>Include chat types</legend><small>Select the chat types allowed in this folder.</small>{folderChatTypes.map((type) => <label key={type.value}><input type="checkbox" checked={draft.rules.chatTypes.includes(type.value)} onChange={() => setDraft((current) => ({ ...current, rules: { ...current.rules, chatTypes: current.rules.chatTypes.includes(type.value) ? current.rules.chatTypes.filter((item) => item !== type.value) : [...current.rules.chatTypes, type.value] } }))} />{type.label}</label>)}</fieldset>
          <label className="chat-folder-field">Name contains<input value={draft.rules.titleIncludes} maxLength={80} onChange={(event) => setDraft({ ...draft, rules: { ...draft.rules, titleIncludes: event.target.value } })} placeholder="Any part of the chat name" /></label>
          <fieldset className="chat-folder-rules"><legend>Additional properties</legend>{([ ["unreadOnly", "Unread only"], ["favoritesOnly", "Favorites only"], ["mutedOnly", "Muted only"] ] as const).map(([key, label]) => <label key={key}><input type="checkbox" checked={draft.rules[key]} onChange={() => setDraft({ ...draft, rules: { ...draft.rules, [key]: !draft.rules[key] } })} />{label}</label>)}</fieldset>
        </div>
        <div className="chat-folder-actions">
          {folder && allowDelete && <button type="button" className="chat-folder-delete" onClick={() => onDelete(folder)}>Delete folder</button>}
          <span><button className="primary-button" disabled={!draft.name.trim()}>{folder ? "Save folder" : "Create chat folder"}</button><button type="button" className="secondary-button" onClick={onClose}>Cancel</button></span>
        </div>
      </form>
    </div>,
    document.body
  );
}
