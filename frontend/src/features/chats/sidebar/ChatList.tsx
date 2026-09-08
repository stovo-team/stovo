import { ChevronDown, FolderMinus, FolderPlus, Lock, MessageCircle, Settings2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Chat, updateChatPreferences } from "../../../api/chats";
import type { ChatFilter, ChatSectionKey } from "../shared/types";
import { ChatListItem } from "./ChatListItem";
import { useStrings } from "../../../i18n/LanguageContext";
import { ChatFolderDialog } from "./ChatFolderDialog";
import { ChatFolder, FolderChatType, folderMatchesChatProperties, loadChatFolders, saveChatFolders } from "./chatFolders";
import { displayChatName } from "../shared/chatPresentation";
import { DefaultChatSectionDialog } from "./DefaultChatSectionDialog";
import { ChatContextMenu, ChatContextMenuState } from "./ChatContextMenu";
import {
  DefaultChatSectionNames,
  loadChatSectionAssignments,
  loadDefaultChatSectionNames,
  loadDefaultGroupsFolder,
  saveChatSectionAssignments,
  saveDefaultChatSectionNames,
  saveDefaultGroupsFolder
} from "./defaultChatSectionSettings";

export type ChatListProps = {
  isLoading?: boolean;
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
  chatsBySection: _chatsBySection,
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
  const [sectionAssignments, setSectionAssignments] = useState<Record<string, ChatSectionKey>>(() => loadChatSectionAssignments(familyId));
  const [draggedChat, setDraggedChat] = useState<Chat | null>(null);
  const [dragOverTargetId, setDragOverTargetId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<ChatContextMenuState | null>(null);
  const draggedChatRef = useRef<Chat | null>(null);
  const showSkeleton = (isLoading || !hasLoadedOverview) && filteredChats.length === 0;

  const folders = folderState.folders;

  function canDropToSection(sectionKey: ChatSectionKey, chat: Chat, chatName: string): boolean {
    if (folders.some((f) => f.rules.includedChatIds?.includes(chat.id) || getChatContainer(chat) === f.id)) {
      return true;
    }
    if (sectionKey === "archive") return true;
    if (sectionKey === "groups") {
      if (chat.type === "group" || chat.type === "family") return true;
      return folderMatchesChatProperties(chat, defaultGroupsFolder.rules, chatName);
    }
    if (sectionKey === "dms") return chat.type === "direct";
    if (sectionKey === "channels") return chat.type === "channel";
    if (sectionKey === "voice") return chat.type === "voice";
    return true;
  }

  function getChatContainer(chat: Chat): string {
    const chatName = displayChatName(chat, currentUserId, strings);

    // 1. If assigned to a custom folder, check if it matches that folder's rules
    const assignedFolder = folders.find((f) => f.rules.includedChatIds?.includes(chat.id));
    if (assignedFolder) {
      if (folderMatchesChatProperties(chat, assignedFolder.rules, chatName)) {
        return assignedFolder.id;
      }
    }

    // 2. If chat has an explicit section override
    const assignedSection = sectionAssignments[chat.id];
    if (assignedSection) {
      return assignedSection;
    }

    // 3. Natural section
    if (chat.type === "archive") return "archive";
    if (chat.type === "group" || chat.type === "family") {
      return "groups";
    }
    if (chat.type === "direct") return "dms";
    if (chat.type === "channel") return "channels";
    if (chat.type === "voice") return "voice";
    return "";
  }

  function handleDropChatToFolder(targetFolder: ChatFolder, chat: Chat) {
    const chatType = (chat.type === "family" ? "group" : chat.type) as FolderChatType;
    const nextFolders = folders.map((item) => {
      if (item.id === targetFolder.id) {
        const currentIncluded = item.rules.includedChatIds ?? [];
        const currentTypes = item.rules.chatTypes ?? [];
        const nextTypes = currentTypes.includes(chatType) ? currentTypes : [...currentTypes, chatType];
        return {
          ...item,
          rules: {
            ...item.rules,
            chatTypes: nextTypes,
            includedChatIds: currentIncluded.includes(chat.id) ? currentIncluded : [...currentIncluded, chat.id],
            excludedChatIds: (item.rules.excludedChatIds ?? []).filter((id) => id !== chat.id)
          }
        };
      } else {
        return {
          ...item,
          rules: {
            ...item.rules,
            includedChatIds: (item.rules.includedChatIds ?? []).filter((id) => id !== chat.id)
          }
        };
      }
    });

    setFolderState((current) => ({
      ...current,
      folders: nextFolders
    }));
    saveChatFolders(familyId, nextFolders);

    if (sectionAssignments[chat.id]) {
      setSectionAssignments((prev) => {
        const next = { ...prev };
        delete next[chat.id];
        saveChatSectionAssignments(familyId, next);
        return next;
      });
    }

    if (collapsed[targetFolder.id]) {
      setCollapsed((prev) => ({ ...prev, [targetFolder.id]: false }));
    }
    draggedChatRef.current = null;
    setDraggedChat(null);
    setDragOverTargetId(null);
  }

  function handleDropChatToSection(sectionKey: ChatSectionKey, chat: Chat) {
    // 1. Remove from all custom folders
    const nextFolders = folders.map((item) => ({
      ...item,
      rules: {
        ...item.rules,
        includedChatIds: (item.rules.includedChatIds ?? []).filter((id) => id !== chat.id)
      }
    }));
    setFolderState((current) => ({
      ...current,
      folders: nextFolders
    }));
    saveChatFolders(familyId, nextFolders);

    // 2. If dropped to groups and it is a group/family chat, ensure defaultGroupsFolder includes "group"
    if (sectionKey === "groups" && (chat.type === "group" || chat.type === "family")) {
      if (!defaultGroupsFolder.rules.chatTypes.includes("group")) {
        const nextGroupsFolder: ChatFolder = {
          ...defaultGroupsFolder,
          rules: {
            ...defaultGroupsFolder.rules,
            chatTypes: [...defaultGroupsFolder.rules.chatTypes, "group"]
          }
        };
        setDefaultGroupsFolder(nextGroupsFolder);
        saveDefaultGroupsFolder(familyId, nextGroupsFolder);
      }
    }

    // 3. Set or clear section assignment
    const naturalSectionKey =
      chat.type === "archive"
        ? "archive"
        : chat.type === "group" || chat.type === "family"
          ? "groups"
          : chat.type === "direct"
            ? "dms"
            : chat.type === "channel"
              ? "channels"
              : chat.type === "voice"
                ? "voice"
                : "";

    setSectionAssignments((prev) => {
      const next = { ...prev };
      if (sectionKey === naturalSectionKey) {
        delete next[chat.id];
      } else {
        next[chat.id] = sectionKey;
      }
      saveChatSectionAssignments(familyId, next);
      return next;
    });

    if (collapsed[sectionKey]) {
      setCollapsed((prev) => ({ ...prev, [sectionKey]: false }));
    }
    draggedChatRef.current = null;
    setDraggedChat(null);
    setDragOverTargetId(null);
  }

  function handleRemoveChatFromFolder(folder: ChatFolder, chat: Chat) {
    const nextFolders = folders.map((item) => {
      if (item.id === folder.id) {
        return {
          ...item,
          rules: {
            ...item.rules,
            includedChatIds: (item.rules.includedChatIds ?? []).filter((id) => id !== chat.id)
          }
        };
      }
      return item;
    });
    setFolderState((current) => ({
      ...current,
      folders: nextFolders
    }));
    saveChatFolders(familyId, nextFolders);

    if ((chat.type === "group" || chat.type === "family") && !defaultGroupsFolder.rules.chatTypes.includes("group")) {
      const nextGroupsFolder: ChatFolder = {
        ...defaultGroupsFolder,
        rules: {
          ...defaultGroupsFolder.rules,
          chatTypes: [...defaultGroupsFolder.rules.chatTypes, "group"]
        }
      };
      setDefaultGroupsFolder(nextGroupsFolder);
      saveDefaultGroupsFolder(familyId, nextGroupsFolder);
    }
  }

  function handleRemoveChatFromAllFolders(chat: Chat) {
    const nextFolders = folders.map((item) => ({
      ...item,
      rules: {
        ...item.rules,
        includedChatIds: (item.rules.includedChatIds ?? []).filter((id) => id !== chat.id)
      }
    }));
    setFolderState((current) => ({
      ...current,
      folders: nextFolders
    }));
    saveChatFolders(familyId, nextFolders);

    if ((chat.type === "group" || chat.type === "family") && !defaultGroupsFolder.rules.chatTypes.includes("group")) {
      const nextGroupsFolder: ChatFolder = {
        ...defaultGroupsFolder,
        rules: {
          ...defaultGroupsFolder.rules,
          chatTypes: [...defaultGroupsFolder.rules.chatTypes, "group"]
        }
      };
      setDefaultGroupsFolder(nextGroupsFolder);
      saveDefaultGroupsFolder(familyId, nextGroupsFolder);
    }

    draggedChatRef.current = null;
    setDraggedChat(null);
    setDragOverTargetId(null);
  }

  useEffect(() => {
    setFolderState({ familyId, folders: loadChatFolders(familyId) });
    setDefaultSectionNames(loadDefaultChatSectionNames(familyId));
    setDefaultGroupsFolder(loadDefaultGroupsFolder(familyId, loadDefaultChatSectionNames(familyId).groups));
    setSectionAssignments(loadChatSectionAssignments(familyId));
    setCollapsed({});
  }, [familyId]);

  useEffect(() => {
    if (folderState.familyId === familyId) saveChatFolders(familyId, folders);
  }, [familyId, folderState.familyId, folders]);

  function toggleSection(key: string) { setCollapsed((current) => ({ ...current, [key]: !current[key] })); }

  function saveFolder(folder: ChatFolder) {
    setFolderState((current) => ({
      ...current,
      folders: current.folders.some((item) => item.id === folder.id)
        ? current.folders.map((item) => (item.id === folder.id ? folder : item))
        : [...current.folders, folder]
    }));
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

  function handleToggleMute(chat: Chat) {
    if (!accessToken) return;
    void updateChatPreferences(accessToken, chat.id, { isMuted: !chat.isMuted });
    chat.isMuted = !chat.isMuted;
    setFolderState((s) => ({ ...s }));
  }

  function handleToggleFavorite(chat: Chat) {
    if (!accessToken) return;
    void updateChatPreferences(accessToken, chat.id, { isFavorite: !chat.isFavorite });
    chat.isFavorite = !chat.isFavorite;
    setFolderState((s) => ({ ...s }));
  }

  function handleMarkAsRead(chat: Chat) {
    if (!accessToken || !chat.lastMessageId) return;
    void fetch(`/api/messages/${chat.lastMessageId}/read`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${accessToken}` }
    }).catch(() => undefined);
    chat.unreadCount = 0;
    setFolderState((s) => ({ ...s }));
  }

  const chatSectionOrder: Array<{ key: ChatSectionKey; label: string }> = [
    { key: "archive", label: strings.chats.sections.archive },
    { key: "groups", label: strings.chats.sections.groups },
    { key: "dms", label: strings.chats.sections.dms },
    { key: "channels", label: strings.chats.sections.channels },
    { key: "voice", label: strings.chats.sections.voice }
  ];

  const hasAnyChatsRendered =
    chatSectionOrder.some((s) => filteredChats.some((c) => getChatContainer(c) === s.key)) ||
    folders.some((f) => filteredChats.some((c) => getChatContainer(c) === f.id));

  const activeDraggedChat = draggedChat || draggedChatRef.current;

  const isDraggingFromFolder = Boolean(
    activeDraggedChat &&
    folders.some((f) =>
      f.id === getChatContainer(activeDraggedChat) ||
      f.rules.includedChatIds?.includes(activeDraggedChat.id)
    )
  );

  return (
    <div
      className={`chat-list ${activeDraggedChat ? "is-dragging-active" : ""}`}
      aria-busy={isLoading || !hasLoadedOverview}
      onDragOver={(e) => {
        if (isDraggingFromFolder) {
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
        }
      }}
      onDrop={(e) => {
        const chatId = e.dataTransfer.getData("application/stovo-chat-id") || e.dataTransfer.getData("text/plain");
        const chatToDrop = draggedChat || draggedChatRef.current || filteredChats.find((c) => c.id === chatId);
        if (chatToDrop && isDraggingFromFolder) {
          e.preventDefault();
          handleRemoveChatFromAllFolders(chatToDrop);
        }
      }}
    >
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
            const sectionChats = filteredChats.filter((chat) => getChatContainer(chat) === section.key);
            const sectionLabel = section.key === "groups" ? defaultGroupsFolder.name : defaultSectionNames[section.key] ?? section.label;
            if (sectionChats.length === 0 && !activeDraggedChat) {
              return null;
            }
            const draggedChatName = activeDraggedChat ? displayChatName(activeDraggedChat, currentUserId, strings) : "";
            const isMatch = activeDraggedChat ? canDropToSection(section.key, activeDraggedChat, draggedChatName) : true;
            const isRestricted = Boolean(activeDraggedChat && !isMatch);
            const isTarget = Boolean(activeDraggedChat && isMatch && dragOverTargetId === section.key);

            return (
              <section
                className={`chat-list-section ${isTarget ? "folder-drop-target" : ""} ${isRestricted && dragOverTargetId === section.key ? "folder-drop-restricted" : ""}`}
                key={section.key}
                aria-label={sectionLabel}
                onDragOver={(event) => {
                  event.preventDefault();
                  setDragOverTargetId(section.key);
                  event.dataTransfer.dropEffect = isMatch ? "move" : "none";
                }}
                onDragLeave={(event) => {
                  if (event.currentTarget.contains(event.relatedTarget as Node)) return;
                  setDragOverTargetId((current) => (current === section.key ? null : current));
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  const chatId = event.dataTransfer.getData("application/stovo-chat-id") || event.dataTransfer.getData("text/plain");
                  const chatToDrop = draggedChat || draggedChatRef.current || filteredChats.find((c) => c.id === chatId);
                  if (chatToDrop && isMatch) {
                    handleDropChatToSection(section.key, chatToDrop);
                  }
                }}
              >
                <div className="chat-section-heading">
                  <button type="button" className="chat-section-collapse" onClick={() => toggleSection(section.key)} aria-expanded={!collapsed[section.key]}>
                    <ChevronDown size={16} aria-hidden="true" className={collapsed[section.key] ? "is-collapsed" : ""} />
                    <span>{sectionLabel}</span>
                    {isRestricted && (
                      <span className="chat-folder-locked-icon" title="Chat properties do not match folder rules" aria-label="Restricted">
                        <Lock size={14} aria-hidden="true" />
                      </span>
                    )}
                    <small>{sectionChats.length} chat{sectionChats.length === 1 ? "" : "s"}</small>
                  </button>
                  {canManageFolders && (
                    <span className="chat-folder-controls">
                      <button type="button" aria-label={`Edit ${sectionLabel}`} title="Folder settings" onClick={() => setEditingDefaultSection(section.key)}>
                        <Settings2 size={14} />
                      </button>
                    </span>
                  )}
                </div>
                {!collapsed[section.key] && (
                  sectionChats.length > 0 ? (
                    sectionChats.map((chat) => (
                      <ChatListItem
                        key={chat.id}
                        chat={chat}
                        isActive={chat.id === activeChatId}
                        isTransitionSource={selectedChatId === chat.id}
                        accessToken={accessToken}
                        currentUserId={currentUserId}
                        minimizedChatLayout={minimizedChatLayout}
                        isDragging={activeDraggedChat?.id === chat.id}
                        onSelect={onSelectChat}
                        onOpen={onOpenChat}
                        onDragStart={(_e, c) => {
                          draggedChatRef.current = c;
                          setDraggedChat(c);
                        }}
                        onDragEnd={() => {
                          draggedChatRef.current = null;
                          setDraggedChat(null);
                          setDragOverTargetId(null);
                        }}
                        onContextMenu={(event, c) => {
                          event.preventDefault();
                          event.stopPropagation();
                          setContextMenu({ chat: c, x: event.clientX, y: event.clientY });
                        }}
                      />
                    ))
                  ) : (
                    <p className="chat-folder-empty chat-folder-empty--dropzone">Drop chats here to add to {sectionLabel}</p>
                  )
                )}
              </section>
            );
          })}
      {folders.map((folder) => {
        const sectionChats = filteredChats.filter((chat) => getChatContainer(chat) === folder.id);
        if (sectionChats.length === 0 && !activeDraggedChat) {
          return null;
        }
        const draggedChatName = activeDraggedChat ? displayChatName(activeDraggedChat, currentUserId, strings) : "";
        const isFolderMatch = activeDraggedChat
          ? (isDraggingFromFolder || folderMatchesChatProperties(activeDraggedChat, folder.rules, draggedChatName))
          : true;
        const isFolderRestricted = Boolean(activeDraggedChat && !isFolderMatch);
        const isFolderTarget = Boolean(activeDraggedChat && isFolderMatch && dragOverTargetId === folder.id);

        return (
          <section
            className={`chat-list-section chat-list-section--custom ${isFolderTarget ? "folder-drop-target" : ""} ${isFolderRestricted && dragOverTargetId === folder.id ? "folder-drop-restricted" : ""}`}
            key={folder.id}
            aria-label={folder.name}
            onDragOver={(event) => {
              event.preventDefault();
              setDragOverTargetId(folder.id);
              event.dataTransfer.dropEffect = isFolderMatch ? "move" : "none";
            }}
            onDragLeave={(event) => {
              if (event.currentTarget.contains(event.relatedTarget as Node)) return;
              setDragOverTargetId((current) => (current === folder.id ? null : current));
            }}
            onDrop={(event) => {
              event.preventDefault();
              event.stopPropagation();
              const chatId = event.dataTransfer.getData("application/stovo-chat-id") || event.dataTransfer.getData("text/plain");
              const chatToDrop = draggedChat || draggedChatRef.current || filteredChats.find((c) => c.id === chatId);
              if (chatToDrop && isFolderMatch) {
                handleDropChatToFolder(folder, chatToDrop);
              }
            }}
          >
            <div className="chat-section-heading">
              <button type="button" className="chat-section-collapse" onClick={() => toggleSection(folder.id)} aria-expanded={!collapsed[folder.id]}>
                <ChevronDown size={16} aria-hidden="true" className={collapsed[folder.id] ? "is-collapsed" : ""} />
                <span>{folder.name}</span>
                {isFolderRestricted && (
                  <span className="chat-folder-locked-icon" title="Chat properties do not match folder rules" aria-label="Restricted">
                    <Lock size={14} aria-hidden="true" />
                  </span>
                )}
                <small>{sectionChats.length} chat{sectionChats.length === 1 ? "" : "s"}</small>
              </button>
              {canManageFolders && (
                <span className="chat-folder-controls">
                  <button type="button" aria-label={`Edit ${folder.name}`} title="Folder settings" onClick={() => setEditingFolder(folder)}>
                    <Settings2 size={14} />
                  </button>
                </span>
              )}
            </div>
            {!collapsed[folder.id] && (
              sectionChats.length ? (
                sectionChats.map((chat) => (
                  <ChatListItem
                    key={chat.id}
                    chat={chat}
                    isActive={chat.id === activeChatId}
                    isTransitionSource={selectedChatId === chat.id}
                    accessToken={accessToken}
                    currentUserId={currentUserId}
                    minimizedChatLayout={minimizedChatLayout}
                    isDragging={activeDraggedChat?.id === chat.id}
                    onSelect={onSelectChat}
                    onOpen={onOpenChat}
                    onDragStart={(_e, c) => {
                      draggedChatRef.current = c;
                      setDraggedChat(c);
                    }}
                    onDragEnd={() => {
                      draggedChatRef.current = null;
                      setDraggedChat(null);
                      setDragOverTargetId(null);
                    }}
                    onRemoveFromFolder={(c) => handleRemoveChatFromFolder(folder, c)}
                    onContextMenu={(event, c) => {
                      event.preventDefault();
                      event.stopPropagation();
                      setContextMenu({ chat: c, x: event.clientX, y: event.clientY });
                    }}
                  />
                ))
              ) : (
                <p className="chat-folder-empty">No chats match this folder yet.</p>
              )
            )}
          </section>
        );
      })}

      {isDraggingFromFolder && (
        <div
          className={`chat-folder-remove-dropzone ${dragOverTargetId === "__remove_from_folder__" ? "is-active" : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setDragOverTargetId("__remove_from_folder__");
            e.dataTransfer.dropEffect = "move";
          }}
          onDragLeave={(e) => {
            if (e.currentTarget.contains(e.relatedTarget as Node)) return;
            setDragOverTargetId((cur) => (cur === "__remove_from_folder__" ? null : cur));
          }}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            const chatId = e.dataTransfer.getData("application/stovo-chat-id") || e.dataTransfer.getData("text/plain");
            const chatToDrop = draggedChat || draggedChatRef.current || filteredChats.find((c) => c.id === chatId);
            if (chatToDrop) {
              handleRemoveChatFromAllFolders(chatToDrop);
            }
          }}
        >
          <FolderMinus size={15} aria-hidden="true" />
          <span>Drop here to move out of folder</span>
        </div>
      )}

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
      {!showSkeleton && filteredChats.length > 0 && !hasAnyChatsRendered && (
        <div className="empty-state compact-empty">
          <MessageCircle aria-hidden="true" size={28} />
          <strong>No chats visible</strong>
          <p>No chats match the configured folder rules.</p>
        </div>
      )}
      {editingFolder !== undefined && <ChatFolderDialog folder={editingFolder} onClose={() => setEditingFolder(undefined)} onSave={saveFolder} onDelete={deleteFolder} />}
      {editingDefaultSection === "groups" && <ChatFolderDialog folder={defaultGroupsFolder} title="Groups settings" allowDelete={false} onClose={() => setEditingDefaultSection(undefined)} onSave={saveGroupsFolderSettings} onDelete={() => undefined} />}
      {editingDefaultSection !== undefined && editingDefaultSection !== "groups" && <DefaultChatSectionDialog initialName={defaultSectionNames[editingDefaultSection] ?? chatSectionOrder.find((section) => section.key === editingDefaultSection)?.label ?? ""} onClose={() => setEditingDefaultSection(undefined)} onSave={(name) => saveDefaultSectionName(editingDefaultSection, name)} />}
      {contextMenu && (
        <ChatContextMenu
          menu={contextMenu}
          folders={folders}
          onClose={() => setContextMenu(null)}
          onOpenChat={(c) => {
            onSelectChat(c);
            onOpenChat(c);
          }}
          onToggleMute={handleToggleMute}
          onToggleFavorite={handleToggleFavorite}
          onRemoveFromFolder={handleRemoveChatFromFolder}
          onMoveToFolder={handleDropChatToFolder}
          onMarkAsRead={handleMarkAsRead}
        />
      )}
    </div>
  );
}
