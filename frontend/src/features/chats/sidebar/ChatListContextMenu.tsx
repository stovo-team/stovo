import { useState } from "react";

import type { Chat } from "../../../api/chats";
import { getChatTransferStrings } from "../../../config/strings/chatTransfer";
import { useResolvedLanguage } from "../../../i18n/LanguageContext";
import { ChatTransferDialog } from "../transfer/ChatTransferDialog";
import { ChatContextMenu, type ChatContextMenuState } from "./ChatContextMenu";
import type { ChatFolder } from "./chatFolders";

type Props = {
  menu: ChatContextMenuState | null;
  folders: ChatFolder[];
  accessToken: string | null;
  currentUserId?: string;
  onClose: () => void;
  onOpenChat: (chat: Chat) => void;
  onToggleMute: (chat: Chat) => void;
  onToggleFavorite: (chat: Chat) => void;
  onRemoveFromFolder?: (folder: ChatFolder, chat: Chat) => void;
  onMoveToFolder?: (folder: ChatFolder, chat: Chat) => void;
  onMarkAsRead?: (chat: Chat) => void;
  onImported?: () => void;
};

export function ChatListContextMenu({ menu, folders, accessToken, currentUserId, onClose, onOpenChat, onToggleMute, onToggleFavorite, onRemoveFromFolder, onMoveToFolder, onMarkAsRead, onImported }: Props) {
  const [transferDialog, setTransferDialog] = useState<{ mode: "import" | "export"; chat: Chat } | null>(null);
  const transferStrings = getChatTransferStrings(useResolvedLanguage());

  return (
    <>
      {menu && (
        <ChatContextMenu
          menu={menu}
          folders={folders}
          onClose={onClose}
          onOpenChat={onOpenChat}
          onToggleMute={onToggleMute}
          onToggleFavorite={onToggleFavorite}
          onRemoveFromFolder={onRemoveFromFolder}
          onMoveToFolder={onMoveToFolder}
          onMarkAsRead={onMarkAsRead}
          onImportChat={(chat) => setTransferDialog({ mode: "import", chat })}
          onExportChat={(chat) => setTransferDialog({ mode: "export", chat })}
          importChatLabel={transferStrings.importAction}
          exportChatLabel={transferStrings.exportAction}
        />
      )}
      {transferDialog && (
        <ChatTransferDialog
          mode={transferDialog.mode}
          chat={transferDialog.chat}
          accessToken={accessToken}
          currentUserId={currentUserId}
          onClose={() => setTransferDialog(null)}
          onImported={() => onImported?.()}
        />
      )}
    </>
  );
}
