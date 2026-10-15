import { FormEvent, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { PopupDialog } from "../../../components/ui/Popup";
import { PopupButton } from "../../../components/ui/PopupButton";
import { PopupField } from "../../../components/ui/PopupField";

type DefaultChatSectionDialogProps = {
  initialName: string;
  onClose: () => void;
  onSave: (name: string) => void;
};

export function DefaultChatSectionDialog({ initialName, onClose, onSave }: DefaultChatSectionDialogProps) {
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
          <h2 id="default-chat-section-title">Folder settings</h2>
        </div>
        <div className="chat-folder-body">
          <PopupField label="Folder name" autoFocus value={name} maxLength={60} onChange={(event) => setName(event.target.value)} />
        </div>
        <div className="chat-folder-actions"><span><PopupButton type="submit" variant="primary" disabled={!name.trim()}>Save folder</PopupButton><PopupButton type="button" variant="secondary" onClick={onClose}>Cancel</PopupButton></span></div>
      </form>
    </PopupDialog>,
    document.body
  );
}
