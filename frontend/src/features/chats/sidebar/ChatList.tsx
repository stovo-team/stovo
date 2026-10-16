import { Archive, ChevronDown, CircleSlash, FileText, FolderMinus, FolderPlus, MessageCircle, RotateCcw, Settings2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { Chat, updateChatPreferences } from "../../../api/chats";
import type { ChatFilter, ChatSectionKey } from "../shared/types";
import { useCallChatReveal } from "./useCallChatReveal";
import { ChatListItem } from "./ChatListItem";
import { useStrings } from "../../../i18n/LanguageContext";
import { ChatFolderDialog } from "./ChatFolderDialog";
import { ChatFolder, FolderChatType, folderMatchesChatProperties, loadChatFolders, saveChatFolders } from "./chatFolders";
import { displayChatName } from "../shared/chatPresentation";
import type { ChatContextMenuState } from "./ChatContextMenu";
import { ChatListContextMenu } from "./ChatListContextMenu";
import { PopupDialog } from "../../../components/ui/Popup";
import {
  DefaultChatSectionNames,
  loadAllDefaultFolders,
  loadChatSectionAssignments,
  loadDefaultChatSectionNames,
  loadDeletedDefaultSections,
  saveChatSectionAssignments,
  saveDefaultChatSectionNames,
  saveDefaultSectionFolder,
  saveDeletedDefaultSections
} from "./defaultChatSectionSettings";

type QuickAccessSettings = {
  archiveEnabled: boolean;
  outboxEnabled: boolean;
  archiveView: "all" | "grouped";
};

function quickAccessStorageKey(familyId: string) {
  return `stovo:quick-access:${familyId}`;
}

function loadQuickAccessSettings(familyId: string): QuickAccessSettings {
  const fallback: QuickAccessSettings = { archiveEnabled: true, outboxEnabled: true, archiveView: "grouped" };
  try {
    const stored = window.localStorage.getItem(quickAccessStorageKey(familyId));
    if (!stored) return fallback;
    const parsed = JSON.parse(stored) as Partial<QuickAccessSettings>;
    return { ...fallback, ...parsed, archiveView: parsed.archiveView === "all" ? "all" : "grouped" };
  } catch {
    return fallback;
  }
}

export type ChatListProps = {
  isLoading?: boolean;
  hasLoadedOverview?: boolean;
  chatsBySection: Record<ChatSectionKey, Chat[]>;
  filteredChats: Chat[];
  refreshChats: () => Promise<void>;
  chatFilter: ChatFilter;
  familyId: string;
  canManageFolders: boolean;
  accessToken: string | null;
  currentUserId?: string; activeVoiceCallChatId?: string | null; activeVoiceCallParticipantIds?: string[];
  selectedChatId?: string;
  activeChatId?: string;
  minimizedChatLayout?: boolean;
  onSelectChat: (chat: Chat) => void;
  onOpenChat: (chat: Chat) => void; onOpenMemberDm?: (userId: string) => void;
  onOpenDraftsAndScheduled: () => void;
  isDraftsAndScheduledActive?: boolean;
  onOpenMessageArchive: () => void;
  isMessageArchiveActive?: boolean;
  onStartNewChat: () => void;
};

export function ChatList({
  isLoading,
  hasLoadedOverview = true,
  chatsBySection: _chatsBySection,
  filteredChats,
  refreshChats,
  chatFilter,
  familyId,
  canManageFolders,
  accessToken,
  currentUserId, activeVoiceCallChatId, activeVoiceCallParticipantIds,
  selectedChatId,
  activeChatId,
  minimizedChatLayout,
  onSelectChat,
  onOpenChat, onOpenMemberDm,
  onOpenDraftsAndScheduled,
  isDraftsAndScheduledActive,
  onOpenMessageArchive,
  isMessageArchiveActive,
  onStartNewChat
}: ChatListProps) {
  const strings = useStrings();
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  useCallChatReveal(() => setCollapsed({}));
  const [folderState, setFolderState] = useState(() => ({ familyId, folders: loadChatFolders(familyId) }));
  const [editingFolder, setEditingFolder] = useState<ChatFolder | null | undefined>(undefined);
  const [defaultSectionNames, setDefaultSectionNames] = useState<DefaultChatSectionNames>(() => loadDefaultChatSectionNames(familyId));
  const [defaultFolders, setDefaultFolders] = useState<Record<ChatSectionKey, ChatFolder>>(() => loadAllDefaultFolders(familyId));
  const [deletedDefaultSections, setDeletedDefaultSections] = useState<ChatSectionKey[]>(() => loadDeletedDefaultSections(familyId));
  const [editingDefaultSection, setEditingDefaultSection] = useState<ChatSectionKey | undefined>(undefined);
  const [sectionAssignments, setSectionAssignments] = useState<Record<string, ChatSectionKey>>(() => loadChatSectionAssignments(familyId));
  const [draggedChat, setDraggedChat] = useState<Chat | null>(null);
  const [dragOverTargetId, setDragOverTargetId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<ChatContextMenuState | null>(null);
  const [isQuickAccessSettingsOpen, setIsQuickAccessSettingsOpen] = useState(false);
  const [quickAccess, setQuickAccess] = useState(() => loadQuickAccessSettings(familyId));
  const draggedChatRef = useRef<Chat | null>(null);
  const showSkeleton = (isLoading || !hasLoadedOverview) && filteredChats.length === 0;

  const folders = folderState.folders;
  const archiveChat = filteredChats.find((chat) => chat.type === "archive");

  function canDropToSection(sectionKey: ChatSectionKey, chat: Chat, chatName: string): boolean {
    if (folders.some((f) => f.rules.includedChatIds?.includes(chat.id) || getChatContainer(chat) === f.id)) {
      return true;
    }
    const defaultFolder = defaultFolders[sectionKey];
    if (defaultFolder) {
      const isNatural =
        (sectionKey === "archive" && chat.type === "archive") ||
        (sectionKey === "groups" && (chat.type === "group" || chat.type === "family")) ||
        (sectionKey === "dms" && chat.type === "direct") ||
        (sectionKey === "channels" && chat.type === "channel") ||
        (sectionKey === "voice" && chat.type === "voice");
      if (isNatural) return true;
      return folderMatchesChatProperties(chat, defaultFolder.rules, chatName);
    }
    return true;
  }

  function getChatContainer(chat: Chat): string {
    const chatName = displayChatName(chat, currentUserId, strings);

    // 1. If assigned to a custom folder, it belongs to that folder
    const assignedFolder = folders.find((f) => f.rules.includedChatIds?.includes(chat.id));
    if (assignedFolder) {
      return assignedFolder.id;
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

    // 2. If dropped to a default section, ensure that section's folder includes this chat type
    const defaultFolder = defaultFolders[sectionKey];
    const chatType = (chat.type === "family" ? "group" : chat.type) as FolderChatType;
    if (defaultFolder && !defaultFolder.rules.chatTypes.includes(chatType)) {
      const nextFolder: ChatFolder = {
        ...defaultFolder,
        rules: {
          ...defaultFolder.rules,
          chatTypes: [...defaultFolder.rules.chatTypes, chatType]
        }
      };
      setDefaultFolders((current) => ({ ...current, [sectionKey]: nextFolder }));
      saveDefaultSectionFolder(familyId, sectionKey, nextFolder);
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

    if ((chat.type === "group" || chat.type === "family") && !defaultFolders.groups?.rules?.chatTypes?.includes("group")) {
      const nextGroupsFolder: ChatFolder = {
        ...defaultFolders.groups,
        rules: {
          ...defaultFolders.groups.rules,
          chatTypes: [...defaultFolders.groups.rules.chatTypes, "group"]
        }
      };
      setDefaultFolders((current) => ({ ...current, groups: nextGroupsFolder }));
      saveDefaultSectionFolder(familyId, "groups", nextGroupsFolder);
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

    const naturalKey: ChatSectionKey =
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
                : "dms";

    const chatType = (chat.type === "family" ? "group" : chat.type) as FolderChatType;
    const currentDefaultFolder = defaultFolders[naturalKey];
    if (currentDefaultFolder && !currentDefaultFolder.rules.chatTypes.includes(chatType)) {
      const nextDefaultFolder: ChatFolder = {
        ...currentDefaultFolder,
        rules: {
          ...currentDefaultFolder.rules,
          chatTypes: [...currentDefaultFolder.rules.chatTypes, chatType]
        }
      };
      setDefaultFolders((current) => ({ ...current, [naturalKey]: nextDefaultFolder }));
      saveDefaultSectionFolder(familyId, naturalKey, nextDefaultFolder);
    }

    if (deletedDefaultSections.includes(naturalKey)) {
      setDeletedDefaultSections((current) => {
        const next = current.filter((k) => k !== naturalKey);
        saveDeletedDefaultSections(familyId, next);
        return next;
      });
    }

    if (sectionAssignments[chat.id]) {
      setSectionAssignments((prev) => {
        const next = { ...prev };
        delete next[chat.id];
        saveChatSectionAssignments(familyId, next);
        return next;
      });
    }

    draggedChatRef.current = null;
    setDraggedChat(null);
    setDragOverTargetId(null);
  }

  useEffect(() => {
    setFolderState({ familyId, folders: loadChatFolders(familyId) });
    setDefaultSectionNames(loadDefaultChatSectionNames(familyId));
    setDefaultFolders(loadAllDefaultFolders(familyId));
    setDeletedDefaultSections(loadDeletedDefaultSections(familyId));
    setSectionAssignments(loadChatSectionAssignments(familyId));
    setCollapsed({});
    setQuickAccess(loadQuickAccessSettings(familyId));
  }, [familyId]);

  function updateQuickAccess(patch: Partial<QuickAccessSettings>) {
    setQuickAccess((current) => {
      const next = { ...current, ...patch };
      window.localStorage.setItem(quickAccessStorageKey(familyId), JSON.stringify(next));
      return next;
    });
  }

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

  function saveDefaultFolderSettings(section: ChatSectionKey, folder: ChatFolder) {
    const next = { ...folder, id: `default-${section}` };
    setDefaultFolders((current) => ({ ...current, [section]: next }));
    saveDefaultSectionFolder(familyId, section, next);
    setDefaultSectionNames((current) => {
      const nextNames = { ...current, [section]: folder.name };
      saveDefaultChatSectionNames(familyId, nextNames);
      return nextNames;
    });
    setEditingDefaultSection(undefined);
  }

  function deleteDefaultSection(sectionKey: ChatSectionKey, folder: ChatFolder) {
    if (!window.confirm(`Delete the ${folder.name} folder? Chats are not deleted.`)) return;
    const nextDeleted = [...deletedDefaultSections.filter((k) => k !== sectionKey), sectionKey];
    setDeletedDefaultSections(nextDeleted);
    saveDeletedDefaultSections(familyId, nextDeleted);
    setEditingDefaultSection(undefined);
  }

  function handleRestoreDefaultFolders() {
    setDeletedDefaultSections([]);
    saveDeletedDefaultSections(familyId, []);
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
  ].filter((section) => section.key !== "archive" || !quickAccess.archiveEnabled) as Array<{ key: ChatSectionKey; label: string }>;

  const hasAnyChatsRendered =
    chatSectionOrder
      .filter((s) => !deletedDefaultSections.includes(s.key))
      .some((s) => {
        const defaultFolder = defaultFolders[s.key];
        return filteredChats.some((c) => {
          if (getChatContainer(c) !== s.key) return false;
          const chatName = displayChatName(c, currentUserId, strings);
          return defaultFolder ? folderMatchesChatProperties(c, defaultFolder.rules, chatName) : true;
        });
      }) ||
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
        const active = draggedChat || draggedChatRef.current;
        const fromFolder = Boolean(
          active &&
          folders.some((f) =>
            f.id === getChatContainer(active) ||
            f.rules.includedChatIds?.includes(active.id)
          )
        );
        if (fromFolder) {
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
        }
      }}
      onDrop={(e) => {
        const chatId = e.dataTransfer.getData("application/stovo-chat-id") || e.dataTransfer.getData("text/plain");
        const chatToDrop = draggedChat || draggedChatRef.current || filteredChats.find((c) => c.id === chatId);
        const fromFolder = Boolean(
          chatToDrop &&
          folders.some((f) =>
            f.id === getChatContainer(chatToDrop) ||
            f.rules.includedChatIds?.includes(chatToDrop.id)
          )
        );
        if (chatToDrop && fromFolder) {
          e.preventDefault();
          handleRemoveChatFromAllFolders(chatToDrop);
        }
      }}
    >
      {isDraggingFromFolder && (
        <div
          className={`chat-folder-remove-dropzone chat-folder-remove-dropzone--danger ${dragOverTargetId === "__remove_from_folder__" ? "is-active" : ""}`}
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
          <span>{strings.chats.folders.dropToRemove}</span>
        </div>
      )}

      {!showSkeleton && (quickAccess.archiveEnabled || quickAccess.outboxEnabled) && (
        <section className="chat-list-section chat-list-section--quick-access" aria-label={strings.chats.quickAccess.title}>
          <div className="chat-section-heading">
            <button type="button" className="chat-section-collapse" onClick={() => toggleSection("quick-access")} aria-expanded={!collapsed["quick-access"]}>
              <ChevronDown size={16} aria-hidden="true" className={collapsed["quick-access"] ? "is-collapsed" : ""} />
              <span>{strings.chats.quickAccess.title}</span>
            </button>
            <span className="chat-folder-controls">
              <button type="button" aria-label={strings.chats.quickAccess.settings} title={strings.chats.quickAccess.settings} onClick={() => setIsQuickAccessSettingsOpen(true)}><Settings2 size={14} /></button>
            </span>
          </div>
          {!collapsed["quick-access"] && (
            <div className="quick-access-items">
              {quickAccess.archiveEnabled && archiveChat && (
                <button type="button" className={`chat-list-item quick-access-item ${minimizedChatLayout ? "quick-access-item--minimized" : ""} ${isMessageArchiveActive ? "active" : ""}`} onClick={onOpenMessageArchive}>
                  <span className="avatar chat-avatar archive quick-access-icon"><Archive size={21} /></span><span className="chat-list-copy"><span className="chat-list-topline"><strong>{strings.chats.quickAccess.archive}</strong></span></span>
                </button>
              )}
              {quickAccess.outboxEnabled && (
                <button type="button" className={`chat-list-item quick-access-item ${minimizedChatLayout ? "quick-access-item--minimized" : ""} ${isDraftsAndScheduledActive ? "active" : ""}`} onClick={onOpenDraftsAndScheduled}>
                  <span className="avatar chat-avatar archive quick-access-icon"><FileText size={21} /></span><span className="chat-list-copy"><span className="chat-list-topline"><strong>{strings.chats.quickAccess.drafts}</strong></span></span>
                </button>
              )}
            </div>
          )}
        </section>
      )}
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
        : chatSectionOrder
            .filter((section) => !deletedDefaultSections.includes(section.key))
            .map((section) => {
              const defaultFolder = defaultFolders[section.key];
              const sectionChats = filteredChats.filter((chat) => {
                if (getChatContainer(chat) !== section.key) return false;
                const chatName = displayChatName(chat, currentUserId, strings);
                return defaultFolder ? folderMatchesChatProperties(chat, defaultFolder.rules, chatName) : true;
              });
              const sectionLabel = defaultFolder?.name || defaultSectionNames[section.key] || section.label;
              // Empty built-in sections are only useful as drag destinations. Keep the
              // everyday list focused on folders that actually contain conversations.
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
                      <span className="chat-folder-locked-icon" title={strings.chats.folders.restrictedDrop} aria-label={strings.chats.folders.dropNotAllowed}>
                        <CircleSlash size={14} aria-hidden="true" />
                      </span>
                    )}
                    <small className="chat-section-count">{strings.chats.emptyStates.sectionCount(sectionChats.length)}</small>
                  </button>
                  {canManageFolders && (
                    <span className="chat-folder-controls">
                      <button type="button" aria-label={strings.chats.folders.settingsForFolder(sectionLabel)} title={strings.chats.folders.editFolder} onClick={() => setEditingDefaultSection(section.key)}>
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
                        isActive={!isDraftsAndScheduledActive && chat.id === activeChatId}
                        isTransitionSource={selectedChatId === chat.id}
                        accessToken={accessToken}
                        currentUserId={currentUserId} activeVoiceCallChatId={activeVoiceCallChatId} activeVoiceCallParticipantIds={activeVoiceCallParticipantIds}
                        minimizedChatLayout={minimizedChatLayout}
                        isDragging={activeDraggedChat?.id === chat.id}
                        onSelect={onSelectChat}
                        onOpen={onOpenChat} onOpenMemberDm={onOpenMemberDm}
                        onDragStart={(_e, c) => {
                          draggedChatRef.current = c;
                          requestAnimationFrame(() => {
                            setDraggedChat(c);
                          });
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
                    <p className="chat-folder-empty chat-folder-empty--dropzone">{strings.chats.folders.dropToFolder(sectionLabel)}</p>
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
        const isFolderMatch = true;
        const isFolderRestricted = false;
        const isFolderTarget = Boolean(activeDraggedChat && dragOverTargetId === folder.id);

        return (
          <section
            className={`chat-list-section chat-list-section--custom ${isFolderTarget ? "folder-drop-target" : ""} ${isFolderRestricted && dragOverTargetId === folder.id ? "folder-drop-restricted" : ""}`}
            key={folder.id}
            aria-label={folder.name}
            onDragOver={(event) => {
              event.preventDefault();
              setDragOverTargetId(folder.id);
              event.dataTransfer.dropEffect = "move";
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
              if (chatToDrop) {
                handleDropChatToFolder(folder, chatToDrop);
              }
            }}
          >
            <div className="chat-section-heading">
              <button type="button" className="chat-section-collapse" onClick={() => toggleSection(folder.id)} aria-expanded={!collapsed[folder.id]}>
                <ChevronDown size={16} aria-hidden="true" className={collapsed[folder.id] ? "is-collapsed" : ""} />
                <span>{folder.name}</span>
                {isFolderRestricted && (
                <span className="chat-folder-locked-icon" title={strings.chats.folders.restrictedRulesHelp} aria-label={strings.chats.folders.restrictedLabel}>
                    <CircleSlash size={14} aria-hidden="true" />
                  </span>
                )}
                <small className="chat-section-count">{strings.chats.emptyStates.sectionCount(sectionChats.length)}</small>
              </button>
              {canManageFolders && (
                <span className="chat-folder-controls">
                  <button type="button" aria-label={strings.chats.folders.settingsForFolder(folder.name)} title={strings.chats.folders.editFolder} onClick={() => setEditingFolder(folder)}>
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
                    isActive={!isDraftsAndScheduledActive && chat.id === activeChatId}
                    isTransitionSource={selectedChatId === chat.id}
                    accessToken={accessToken}
                    currentUserId={currentUserId} activeVoiceCallChatId={activeVoiceCallChatId} activeVoiceCallParticipantIds={activeVoiceCallParticipantIds}
                    minimizedChatLayout={minimizedChatLayout}
                    isDragging={activeDraggedChat?.id === chat.id}
                    onSelect={onSelectChat}
                    onOpen={onOpenChat} onOpenMemberDm={onOpenMemberDm}
                    onDragStart={(_e, c) => {
                      draggedChatRef.current = c;
                      requestAnimationFrame(() => {
                        setDraggedChat(c);
                      });
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
                <p className="chat-folder-empty chat-folder-empty--dropzone">{strings.chats.folders.dropToFolder(folder.name)}</p>
              )
            )}
          </section>
        );
      })}

      {canManageFolders && !showSkeleton && <button type="button" className="chat-folder-create" onClick={() => setEditingFolder(null)}><FolderPlus size={17} aria-hidden="true" />{strings.chats.folders.newFolder}</button>}
      {canManageFolders && !showSkeleton && deletedDefaultSections.length > 0 && (
        <button
          type="button"
          className="chat-folder-restore"
          onClick={handleRestoreDefaultFolders}
          title={strings.chats.folders.restoreDefaults}
        >
          <RotateCcw size={15} aria-hidden="true" />
          {strings.chats.folders.restoreDefaults}
        </button>
      )}
      {!showSkeleton && filteredChats.length === 0 && (
        <div className="empty-state compact-empty">
          <MessageCircle aria-hidden="true" size={28} />
          <strong>
            {chatFilter === "unread"
              ? strings.chats.emptyStates.everythingRead
              : chatFilter === "muted"
                ? strings.chats.emptyStates.noMutedChats
                : strings.chats.emptyStates.noChatsFound}
          </strong>
          <p>{strings.chats.emptyStates.startChatHint}</p>
          <button type="button" onClick={onStartNewChat}>
            {strings.chats.emptyStates.startChat}
          </button>
        </div>
      )}
      {!showSkeleton && filteredChats.length > 0 && !hasAnyChatsRendered && (
        <div className="empty-state compact-empty">
          <MessageCircle aria-hidden="true" size={28} />
          <strong>{strings.chats.emptyStates.noChatsVisible}</strong>
          <p>{strings.chats.emptyStates.noFolderMatches}</p>
        </div>
      )}
      {editingFolder !== undefined && <ChatFolderDialog folder={editingFolder} onClose={() => setEditingFolder(undefined)} onSave={saveFolder} onDelete={deleteFolder} />}
      {editingDefaultSection !== undefined && (
        <ChatFolderDialog
          folder={defaultFolders[editingDefaultSection]}
          title={strings.chats.folders.settingsForFolder(defaultFolders[editingDefaultSection]?.name || strings.chats.folders.newFolder)}
          allowDelete={true}
          onClose={() => setEditingDefaultSection(undefined)}
          onSave={(folder) => saveDefaultFolderSettings(editingDefaultSection, folder)}
          onDelete={(folder) => deleteDefaultSection(editingDefaultSection, folder)}
        />
      )}
      {isQuickAccessSettingsOpen && createPortal(
        <PopupDialog className="quick-access-settings" ariaLabelledBy="quick-access-settings-title" onClose={() => setIsQuickAccessSettingsOpen(false)} closeLabel={strings.chats.quickAccess.close}>
          <div className="modal-card-header"><h2 id="quick-access-settings-title">{strings.chats.quickAccess.settings}</h2></div>
          <div className="quick-access-setting" onClick={() => updateQuickAccess({ archiveEnabled: !quickAccess.archiveEnabled })}><span><strong>{strings.chats.quickAccess.archive}</strong><small>{strings.chats.quickAccess.archiveHelp}</small></span><button type="button" role="switch" aria-checked={quickAccess.archiveEnabled} className={`quick-access-switch ${quickAccess.archiveEnabled ? "is-on" : ""}`} onClick={(event) => { event.stopPropagation(); updateQuickAccess({ archiveEnabled: !quickAccess.archiveEnabled }); }}><span /></button></div>
          <div className="quick-access-setting" onClick={() => updateQuickAccess({ outboxEnabled: !quickAccess.outboxEnabled })}><span><strong>{strings.chats.quickAccess.drafts}</strong><small>{strings.chats.quickAccess.draftsHelp}</small></span><button type="button" role="switch" aria-checked={quickAccess.outboxEnabled} className={`quick-access-switch ${quickAccess.outboxEnabled ? "is-on" : ""}`} onClick={(event) => { event.stopPropagation(); updateQuickAccess({ outboxEnabled: !quickAccess.outboxEnabled }); }}><span /></button></div>
        </PopupDialog>
      , document.body)}
      <ChatListContextMenu menu={contextMenu} folders={folders} onClose={() => setContextMenu(null)} onOpenChat={(c) => { onSelectChat(c); onOpenChat(c); }} onToggleMute={handleToggleMute} onToggleFavorite={handleToggleFavorite} onRemoveFromFolder={handleRemoveChatFromFolder} onMoveToFolder={handleDropChatToFolder} onMarkAsRead={handleMarkAsRead} accessToken={accessToken} currentUserId={currentUserId} onImported={() => { void refreshChats(); }} />
    </div>
  );
}
