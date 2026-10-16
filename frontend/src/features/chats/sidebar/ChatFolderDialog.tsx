import { FormEvent, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { PopupDialog } from "../../../components/ui/Popup";
import { PopupButton } from "../../../components/ui/PopupButton";
import { PopupField } from "../../../components/ui/PopupField";

import { ChatFolder, defaultFolderRules, folderChatTypes } from "./chatFolders";
import { useStrings } from "../../../i18n/LanguageContext";

type ChatFolderDialogProps = {
  folder: ChatFolder | null;
  onClose: () => void;
  onSave: (folder: ChatFolder) => void;
  onDelete: (folder: ChatFolder) => void;
  title?: string;
  allowDelete?: boolean;
};

export function ChatFolderDialog({ folder, onClose, onSave, onDelete, title, allowDelete = true }: ChatFolderDialogProps) {
  const strings = useStrings();
  const localizedFolderTypes = folderChatTypes.map((type) => ({ ...type, label: strings.chats.folders[type.value] }));
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
    <PopupDialog
      className="chat-folder-layout"
      ariaLabelledBy="chat-folder-title"
      onClose={onClose}
      closeOnBackdrop
      closeOnEscape={false}
      size="md"
    >
      <form className="chat-folder-form" onSubmit={submit}>
        <div className="modal-header">
          <h2 id="chat-folder-title">{title ?? (folder ? strings.chats.folders.editFolder : strings.chats.folders.newFolder)}</h2>
        </div>
        <div className="chat-folder-body">
          <PopupField label={strings.chats.folders.folderName} autoFocus value={draft.name} maxLength={60} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder={strings.chats.folders.folderNameExample} />
          <fieldset className="chat-folder-rules"><legend>{strings.chats.folders.includeChatTypes}</legend><small>{strings.chats.folders.allowedTypesHelp}</small>{localizedFolderTypes.map((type) => <label key={type.value}><input type="checkbox" checked={draft.rules.chatTypes.includes(type.value)} onChange={() => setDraft((current) => ({ ...current, rules: { ...current.rules, chatTypes: current.rules.chatTypes.includes(type.value) ? current.rules.chatTypes.filter((item) => item !== type.value) : [...current.rules.chatTypes, type.value] } }))} />{type.label}</label>)}</fieldset>
          <PopupField label={strings.chats.folders.nameContains} value={draft.rules.titleIncludes} maxLength={80} onChange={(event) => setDraft({ ...draft, rules: { ...draft.rules, titleIncludes: event.target.value } })} placeholder={strings.chats.folders.nameContainsPlaceholder} />
          <fieldset className="chat-folder-rules"><legend>{strings.chats.folders.additionalProperties}</legend>{([ ["unreadOnly", strings.chats.folders.unreadOnly], ["favoritesOnly", strings.chats.folders.favoritesOnly], ["mutedOnly", strings.chats.folders.mutedOnly] ] as const).map(([key, label]) => <label key={key}><input type="checkbox" checked={draft.rules[key]} onChange={() => setDraft({ ...draft, rules: { ...draft.rules, [key]: !draft.rules[key] } })} />{label}</label>)}</fieldset>
        </div>
        <div className="chat-folder-actions">
          {folder && allowDelete && <PopupButton type="button" variant="danger" onClick={() => onDelete(folder)}>{strings.chats.folders.deleteFolder}</PopupButton>}
          <span><PopupButton type="submit" variant="primary" disabled={!draft.name.trim()}>{folder ? strings.chats.folders.saveFolder : strings.chats.folders.createFolder}</PopupButton><PopupButton type="button" variant="secondary" onClick={onClose}>{strings.chats.folders.cancel}</PopupButton></span>
        </div>
      </form>
    </PopupDialog>,
    document.body
  );
}
