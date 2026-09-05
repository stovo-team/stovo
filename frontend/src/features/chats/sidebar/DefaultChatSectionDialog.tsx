import { FormEvent, useEffect, useState } from "react";
import { createPortal } from "react-dom";

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
    <div className="modal-backdrop chat-folder-backdrop" role="presentation" onMouseDown={onClose}>
      <form className="chat-folder-dialog" role="dialog" aria-modal="true" aria-labelledby="default-chat-section-title" onMouseDown={(event) => event.stopPropagation()} onSubmit={submit}>
        <div className="modal-header">
          <h2 id="default-chat-section-title">Folder settings</h2>
          <button type="button" className="chat-folder-close" aria-label="Close" onClick={onClose}><span className="ms-icon ms-icon--20" aria-hidden="true">close</span></button>
        </div>
        <label className="chat-folder-field">Folder name<input autoFocus value={name} maxLength={60} onChange={(event) => setName(event.target.value)} /></label>
        <div className="chat-folder-actions"><span><button className="primary-button" disabled={!name.trim()}>Save folder</button><button type="button" className="secondary-button" onClick={onClose}>Cancel</button></span></div>
      </form>
    </div>,
    document.body
  );
}
