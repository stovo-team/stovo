import { useState } from "react";
import { Download, Upload } from "lucide-react";

import type { Chat } from "../../../api/chats";
import { getChatTransferStrings } from "../../../config/strings/chatTransfer";
import { useResolvedLanguage } from "../../../i18n/LanguageContext";
import { ChatTransferDialog } from "./ChatTransferDialog";

export function ChatTransferSettingsActions({
  chat,
  accessToken,
  currentUserId,
  onImported
}: {
  chat: Chat;
  accessToken: string | null;
  currentUserId?: string;
  onImported?: (chat: Chat) => void;
}) {
  const copy = getChatTransferStrings(useResolvedLanguage());
  const [mode, setMode] = useState<"import" | "export" | null>(null);

  return (
    <>
      <section className="chat-info-section chat-transfer-settings">
        <p className="chat-info-section-label">{copy.transferSectionTitle}</p>
        <div className="chat-info-island chat-transfer-settings-actions">
          <button type="button" className="chat-transfer-settings-action" onClick={() => setMode("import")}>
            <Download aria-hidden="true" size={18} />
            <span>{copy.importAction}</span>
          </button>
          <button type="button" className="chat-transfer-settings-action" onClick={() => setMode("export")}>
            <Upload aria-hidden="true" size={18} />
            <span>{copy.exportAction}</span>
          </button>
        </div>
      </section>
      {mode && (
        <ChatTransferDialog
          mode={mode}
          chat={chat}
          accessToken={accessToken}
          currentUserId={currentUserId}
          onClose={() => setMode(null)}
          onImported={onImported}
        />
      )}
    </>
  );
}
