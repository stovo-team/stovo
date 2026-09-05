import { ChevronDown, FolderPlus, MessageCircle, Settings2, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

import { Chat } from "../../../api/chats";
import type { ChatFilter, ChatSectionKey } from "../shared/types";
import { ChatListItem } from "./ChatListItem";
import { useStrings } from "../../../i18n/LanguageContext";
import { ChatFolderDialog } from "./ChatFolderDialog";
import { ChatFolder, loadChatFolders, matchesFolder, saveChatFolders } from "./chatFolders";
import { displayChatName } from "../shared/chatPresentation";

type ChatListProps = {
  isLoading: boolean;
  hasLoadedOverview?: boolean;
  chatsBySection: Record<ChatSectionKey, Chat[]>;
  filteredChats: Chat[];
  chatFilter: ChatFilter;
  familyId: string;
  canManageFolders: boolean;
  accessToken: string | null;
  currentUserId?: string;
  selectedChatId?: string;
  activeChatId?: string;
  minimizedChatLayout?: boolean;
  onSelectChat: (chat: Chat) => void;
  onOpenChat: (chat: Chat) => void;
  onStartNewChat: () => void;
};

export function ChatList({
  isLoading,
  hasLoadedOverview = true,
  chatsBySection,
  filteredChats,
  chatFilter,
  familyId,
  canManageFolders,
  accessToken,
  currentUserId,
  selectedChatId,
  activeChatId,
  minimizedChatLayout,
  onSelectChat,
  onOpenChat,
  onStartNewChat
}: ChatListProps) {
  const strings = useStrings();
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [folderState, setFolderState] = useState(() => ({ familyId, folders: loadChatFolders(familyId) }));
  const [editingFolder, setEditingFolder] = useState<ChatFolder | null | undefined>(undefined);
  const showSkeleton = (isLoading || !hasLoadedOverview) && filteredChats.length === 0;

  const folders = folderState.folders;

  useEffect(() => {
    setFolderState({ familyId, folders: loadChatFolders(familyId) });
    setCollapsed({});
  }, [familyId]);
  useEffect(() => {
    // Do not overwrite another server's folders while the family-change effect
    // is still hydrating the correct set from storage.
    if (folderState.familyId === familyId) saveChatFolders(familyId, folders);
  }, [familyId, folderState.familyId, folders]);

  function toggleSection(key: string) { setCollapsed((current) => ({ ...current, [key]: !current[key] })); }
  function saveFolder(folder: ChatFolder) {
    setFolderState((current) => ({ ...current, folders: current.folders.some((item) => item.id === folder.id) ? current.folders.map((item) => item.id === folder.id ? folder : item) : [...current.folders, folder] }));
    setEditingFolder(undefined);
  }

  const chatSectionOrder: Array<{ key: ChatSectionKey; label: string }> = [
    { key: "archive", label: strings.chats.sections.archive },
    { key: "groups", label: strings.chats.sections.groups },
    { key: "dms", label: strings.chats.sections.dms },
    { key: "channels", label: strings.chats.sections.channels },
    { key: "voice", label: strings.chats.sections.voice }
  ];

  return (
    <div className="chat-list" aria-busy={isLoading || !hasLoadedOverview}>
      {showSkeleton
        ? Array.from({ length: 5 }).map((_, index) => (
            <div className="chat-list-item skeleton-row" key={index}>
              <span className="skeleton-avatar" />
              <span className="chat-list-copy">
                <span className="skeleton-line wide" />
                <span className="skeleton-line" />
              </span>
            </div>
          ))
        : chatSectionOrder.map((section) => {
            const sectionChats = chatsBySection[section.key];
            if (sectionChats.length === 0) {
              return null;
            }
            return (
              <section className="chat-list-section" key={section.key} aria-label={section.label}>
                <div className="chat-section-heading"><button type="button" className="chat-section-collapse" onClick={() => toggleSection(section.key)} aria-expanded={!collapsed[section.key]}><ChevronDown size={16} aria-hidden="true" className={collapsed[section.key] ? "is-collapsed" : ""} /><span>{section.label}</span></button></div>
                {!collapsed[section.key] && sectionChats.map((chat) => (
                  <ChatListItem
                    key={chat.id}
                    chat={chat}
                    isActive={chat.id === activeChatId}
                    isTransitionSource={selectedChatId === chat.id}
                    accessToken={accessToken}
                    currentUserId={currentUserId}
                    minimizedChatLayout={minimizedChatLayout}
                    onSelect={onSelectChat}
                    onOpen={onOpenChat}
                  />
                ))}
              </section>
            );
          })}
      {folders.map((folder) => {
        const sectionChats = filteredChats.filter((chat) => matchesFolder(chat, folder.rules, displayChatName(chat, currentUserId, strings)));
        return <section className="chat-list-section chat-list-section--custom" key={folder.id} aria-label={folder.name}>
          <div className="chat-section-heading"><button type="button" className="chat-section-collapse" onClick={() => toggleSection(folder.id)} aria-expanded={!collapsed[folder.id]}><ChevronDown size={16} aria-hidden="true" className={collapsed[folder.id] ? "is-collapsed" : ""} /><span>{folder.name}</span><small>{sectionChats.length}</small></button>{canManageFolders && <span className="chat-folder-controls"><button type="button" aria-label={`Edit ${folder.name}`} title="Folder settings" onClick={() => setEditingFolder(folder)}><Settings2 size={15} /></button><button type="button" aria-label={`Delete ${folder.name}`} title="Delete folder" onClick={() => { if (window.confirm(`Delete the ${folder.name} folder? Chats are not deleted.`)) setFolderState((current) => ({ ...current, folders: current.folders.filter((item) => item.id !== folder.id) })); }}><Trash2 size={15} /></button></span>}</div>
          {!collapsed[folder.id] && (sectionChats.length ? sectionChats.map((chat) => <ChatListItem key={chat.id} chat={chat} isActive={chat.id === activeChatId} isTransitionSource={selectedChatId === chat.id} accessToken={accessToken} currentUserId={currentUserId} minimizedChatLayout={minimizedChatLayout} onSelect={onSelectChat} onOpen={onOpenChat} />) : <p className="chat-folder-empty">No chats match this folder yet.</p>)}
        </section>;
      })}
      {canManageFolders && !showSkeleton && <button type="button" className="chat-folder-create" onClick={() => setEditingFolder(null)}><FolderPlus size={17} aria-hidden="true" />Create folder</button>}
      {!showSkeleton && filteredChats.length === 0 && (
        <div className="empty-state compact-empty">
          <MessageCircle aria-hidden="true" size={28} />
          <strong>
            {chatFilter === "unread"
              ? "Everything is read"
              : chatFilter === "muted"
                ? "No muted chats"
                : "No chats found"}
          </strong>
          <p>Start a direct message or create a group for your family space.</p>
          <button type="button" onClick={onStartNewChat}>
            Start a chat
          </button>
        </div>
      )}
      {editingFolder !== undefined && <ChatFolderDialog folder={editingFolder} onClose={() => setEditingFolder(undefined)} onSave={saveFolder} />}
    </div>
  );
}

