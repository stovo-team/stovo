import { useRef, useState, type ChangeEvent } from "react";

import type { ChatTransferStrings } from "../../../config/strings/chatTransfer";

export function ChatTransferFilePicker({
  copy,
  busy,
  onFilesSelected
}: {
  copy: ChatTransferStrings;
  busy: boolean;
  onFilesSelected: (files: FileList | null) => Promise<void>;
}) {
  const fileInput = useRef<HTMLInputElement | null>(null);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);

  async function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const files = input.files;
    const selected = Array.from(files ?? []);
    if (!selected.length) {
      setSelectedFileName(null);
      return;
    }

    setSelectedFileName(selected.length === 1 ? selected[0].name : copy.filesSelected(selected.length));
    try {
      await onFilesSelected(files);
    } finally {
      input.value = "";
    }
  }

  return (
    <div className="chat-transfer-file-label">
      <span id="chat-transfer-file-label">{copy.chooseFile}</span>
      <div className="chat-transfer-file-picker">
        <button
          type="button"
          className="chat-transfer-file-trigger"
          onClick={() => fileInput.current?.click()}
          disabled={busy}
          aria-describedby="chat-transfer-file-name"
        >
          {copy.chooseFileButton}
        </button>
        <span id="chat-transfer-file-name" className="chat-transfer-file-name" aria-live="polite">
          {selectedFileName ?? copy.noFileChosen}
        </span>
        <input
          ref={fileInput}
          className="visually-hidden chat-transfer-file-input"
          type="file"
          multiple
          tabIndex={-1}
          aria-hidden="true"
          accept=".json,.zip,.txt,.csv,application/json,application/zip,text/plain,text/csv"
          onChange={(event) => void handleChange(event)}
        />
      </div>
    </div>
  );
}
