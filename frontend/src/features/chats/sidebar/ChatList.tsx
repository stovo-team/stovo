import { ChevronDown, FolderPlus, MessageCircle, Settings2 } from "lucide-react";
import { useEffect, useState } from "react";

import { Chat } from "../../../api/chats";
import type { ChatFilter, ChatSectionKey } from "../shared/types";
import { ChatListItem } from "./ChatListItem";
import { useStrings } from "../../../i18n/LanguageContext";
import { ChatFolderDialog } from "./ChatFolderDialog";
import { ChatFolder, loadChatFolders, matchesFolder, saveChatFolders } from "./chatFolders";
import { displayChatName } from "../shared/chatPresentation";
import { DefaultChatSectionDialog } from "./DefaultChatSectionDialog";
import { DefaultChatSectionNames, loadDefaultChatSectionNames, loadDefaultGroupsFolder, saveDefaultChatSectionNames, saveDefaultGroupsFolder } from "./defaultChatSectionSettings";

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
  const [defaultSectionNames, setDefaultSectionNames] = useState<DefaultChatSectionNames>(() => loadDefaultChatSectionNames(familyId));
  const [defaultGroupsFolder, setDefaultGroupsFolder] = useState<ChatFolder>(() => loadDefaultGroupsFolder(familyId, loadDefaultChatSectionNames(familyId).groups));
  const [editingDefaultSection, setEditingDefaultSection] = useState<ChatSectionKey | undefined>(undefined);
  const showSkeleton = (isLoading || !hasLoadedOverview) && filteredChats.length === 0;

  const folders = folderState.folders;

  useEffect(() => {
    setFolderState({ familyId, folders: loadChatFolders(familyId) });
    setDefaultSectionNames(loadDefaultChatSectionNames(familyId));
    setDefaultGroupsFolder(loadDefaultGroupsFolder(familyId, loadDefaultChatSectionNames(familyId).groups));
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
  function deleteFolder(folder: ChatFolder) {
    if (!window.confirm(`Delete the ${folder.name} folder? Chats are not deleted.`)) return;
    setFolderState((current) => ({ ...current, folders: current.folders.filter((item) => item.id !== folder.id) }));
    setEditingFolder(undefined);
  }
  function saveDefaultSectionName(section: ChatSectionKey, name: string) {
    setDefaultSectionNames((current) => {
      const next = { ...current, [section]: name };
      saveDefaultChatSectionNames(familyId, next);
      return next;
    });
    setEditingDefaultSection(undefined);
  }
  function saveGroupsFolderSettings(folder: ChatFolder) {
    const next = { ...folder, id: "default-groups" };
    setDefaultGroupsFolder(next);
    saveDefaultGroupsFolder(familyId, next);
    setEditingDefaultSection(undefined);
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
            const sectionChats = section.key === "groups"
              ? filteredChats.filter((chat) => matchesFolder(chat, defaultGroupsFolder.rules, displayChatName(chat, currentUserId, strings)))
              : chatsBySection[section.key];
            const sectionLabel = section.key === "groups" ? defaultGroupsFolder.name : defaultSectionNames[section.key] ?? section.label;
            if (sectionChats.length === 0) {
              return null;
            }
            return (
              <section className="chat-list-section" key={section.key} aria-label={sectionLabel}>
                <div className="chat-section-heading"><button type="button" className="chat-section-collapse" onClick={() => toggleSection(section.key)} aria-expanded={!collapsed[section.key]}><ChevronDown size={16} aria-hidden="true" className={collapsed[section.key] ? "is-collapsed" : ""} /><span>{sectionLabel}</span></button>{canManageFolders && <span className="chat-folder-controls"><button type="button" aria-label={`Edit ${sectionLabel}`} title="Folder settings" onClick={() => setEditingDefaultSection(section.key)}><Settings2 size={14} /></button></span>}</div>
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
          <div className="chat-section-heading"><button type="button" className="chat-section-collapse" onClick={() => toggleSection(folder.id)} aria-expanded={!collapsed[folder.id]}><ChevronDown size={16} aria-hidden="true" className={collapsed[folder.id] ? "is-collapsed" : ""} /><span>{folder.name}</span><small>{sectionChats.length} chat{sectionChats.length === 1 ? "" : "s"}</small></button>{canManageFolders && <span className="chat-folder-controls"><button type="button" aria-label={`Edit ${folder.name}`} title="Folder settings" onClick={() => setEditingFolder(folder)}><Settings2 size={14} /></button></span>}</div>
          {!collapsed[folder.id] && (sectionChats.length ? sectionChats.map((chat) => <ChatListItem key={chat.id} chat={chat} isActive={chat.id === activeChatId} isTransitionSource={selectedChatId === chat.id} accessToken={accessToken} currentUserId={currentUserId} minimizedChatLayout={minimizedChatLayout} onSelect={onSelectChat} onOpen={onOpenChat} />) : <p className="chat-folder-empty">No chats match this folder yet.</p>)}
        </section>;
      })}
      {canManageFolders && !showSkeleton && <button type="button" className="chat-folder-create" onClick={() => setEditingFolder(null)}><FolderPlus size={17} aria-hidden="true" />New folder</button>}
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
      {editingFolder !== undefined && <ChatFolderDialog folder={editingFolder} onClose={() => setEditingFolder(undefined)} onSave={saveFolder} onDelete={deleteFolder} />}
      {editingDefaultSection === "groups" && <ChatFolderDialog folder={defaultGroupsFolder} title="Groups settings" allowDelete={false} onClose={() => setEditingDefaultSection(undefined)} onSave={saveGroupsFolderSettings} onDelete={() => undefined} />}
      {editingDefaultSection !== undefined && editingDefaultSection !== "groups" && <DefaultChatSectionDialog initialName={defaultSectionNames[editingDefaultSection] ?? chatSectionOrder.find((section) => section.key === editingDefaultSection)?.label ?? ""} onClose={() => setEditingDefaultSection(undefined)} onSave={(name) => saveDefaultSectionName(editingDefaultSection, name)} />}
    </div>
  );
}

