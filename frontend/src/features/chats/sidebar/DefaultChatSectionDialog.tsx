import { FormEvent, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { PopupDialog } from "../../../components/ui/Popup";
import { PopupButton } from "../../../components/ui/PopupButton";
import { PopupField } from "../../../components/ui/PopupField";
import { useStrings } from "../../../i18n/LanguageContext";

type DefaultChatSectionDialogProps = {
  initialName: string;
  onClose: () => void;
  onSave: (name: string) => void;
};

export function DefaultChatSectionDialog({ initialName, onClose, onSave }: DefaultChatSectionDialogProps) {
  const copy = useStrings().chats.folders;
  const [name, setName] = useState(initialName);

  useEffect(() => setName(initialName), [initialName]);

  function submit(event: FormEvent) {
    event.preventDefault();
    const trimmedName = name.trim();
    if (trimmedName) onSave(trimmedName);
  }

  return createPortal(
    <PopupDialog
      className="chat-folder-layout"
      ariaLabelledBy="default-chat-section-title"
      onClose={onClose}
      closeOnBackdrop
      closeOnEscape={false}
      size="md"
    >
      <form className="chat-folder-form" onSubmit={submit}>
        <div className="modal-header">
          <h2 id="default-chat-section-title">{copy.settings}</h2>
        </div>
        <div className="chat-folder-body">
          <PopupField label={copy.folderName} autoFocus value={name} maxLength={60} onChange={(event) => setName(event.target.value)} />
        </div>
        <div className="chat-folder-actions"><span><PopupButton type="submit" variant="primary" disabled={!name.trim()}>{copy.save}</PopupButton><PopupButton type="button" variant="secondary" onClick={onClose}>{copy.cancel}</PopupButton></span></div>
      </form>
    </PopupDialog>,
    document.body
  );
}
