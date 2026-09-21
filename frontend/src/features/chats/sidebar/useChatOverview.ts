import { FormEvent, useMemo, useState } from "react";

import { useStrings } from "../../../i18n/LanguageContext";
import { User } from "../../../api/auth";
import {
  Chat,
  createChannelChat,
  createDirectChat,
  createGroupChat,
  createVoiceChat
} from "../../../api/chats";
import { ApiError } from "../../../api/client";
import { displayChatName } from "../shared/chatPresentation";
import type { ChatFilter, ChatSectionKey, NewChatScreen } from "../shared/types";
import type { ChatOverviewController } from "./types";

type UseChatOverviewOptions = {
  accessToken: string | null;
  chats: Chat[];
  members: User[];
  currentUserId?: string;
  onError: (message: string | null) => void;
  onNavigateToChat: (chat: Chat) => void;
  refreshChats: () => Promise<void>;
};

export function useChatOverview({
  accessToken,
  chats,
  members,
  currentUserId,
  onError,
  onNavigateToChat,
  refreshChats
}: UseChatOverviewOptions): ChatOverviewController {
  const strings = useStrings();
  const [chatSearch, setChatSearch] = useState("");
  const [chatFilter, setChatFilter] = useState<ChatFilter>("all");
  const [isNewChatOpen, setIsNewChatOpen] = useState(false);
  const [newChatScreen, setNewChatScreen] = useState<NewChatScreen>("pick");
  const [newChatMemberSearch, setNewChatMemberSearch] = useState("");
  const [groupTitle, setGroupTitle] = useState("");
  const [groupMemberIds, setGroupMemberIds] = useState<string[]>([]);

  const directTargets = useMemo(
    () => members.filter((member) => member.id !== currentUserId),
    [members, currentUserId]
  );

  const filteredNewChatMembers = useMemo(() => {
    const query = newChatMemberSearch.trim().toLowerCase();
    if (!query) {
      return directTargets;
    }
    return directTargets.filter((member) => {
      const haystack = `${member.displayName} ${member.username ?? ""}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [directTargets, newChatMemberSearch]);

  function openNewChatScreen() {
    setNewChatScreen("pick");
    setNewChatMemberSearch("");
    setGroupTitle("");
    setGroupMemberIds([]);
    setIsNewChatOpen(true);
  }

  function closeNewChatScreen() {
    setIsNewChatOpen(false);
    setNewChatScreen("pick");
    setNewChatMemberSearch("");
    setGroupTitle("");
    setGroupMemberIds([]);
  }

  const filteredChats = useMemo(() => {
    const query = chatSearch.trim().toLowerCase();
    return chats.filter((chat) => {
      if (chatFilter === "groups" && chat.type !== "group" && chat.type !== "family") {
        return false;
      }
      if (chatFilter === "direct" && chat.type !== "direct") {
        return false;
      }
      if (chatFilter === "channels" && chat.type !== "channel") {
        return false;
      }
      if (chatFilter === "voice" && chat.type !== "voice") {
        return false;
      }
      if (chatFilter === "unread" && chat.unreadCount <= 0) {
        return false;
      }
      if (chatFilter === "muted" && !chat.isMuted) {
        return false;
      }
      if (!query) {
        return true;
      }
      const chatName = displayChatName(chat, currentUserId, strings).toLowerCase();
      const memberText = chat.members
        .map((member) => `${member.displayName} ${member.username} ${member.role}`)
        .join(" ")
        .toLowerCase();
      return `${chatName} ${chat.type} ${memberText}`.includes(query);
    });
  }, [chatFilter, chatSearch, chats, currentUserId, strings]);

  const chatsBySection = useMemo(() => {
    const sections: Record<ChatSectionKey, Chat[]> = {
      archive: [],
      voice: [],
      channels: [],
      groups: [],
      dms: []
    };
    for (const chat of filteredChats) {
      if (chat.type === "archive") {
        sections.archive.push(chat);
      } else if (chat.type === "voice") {
        sections.voice.push(chat);
      } else if (chat.type === "direct") {
        sections.dms.push(chat);
      } else if (chat.type === "channel") {
        sections.channels.push(chat);
      } else if (chat.type === "group" || chat.type === "family") {
        sections.groups.push(chat);
      }
    }
    return sections;
  }, [filteredChats]);

  async function startDirectChatWith(userId: string) {
    if (!accessToken || !userId) {
      return;
    }

    onError(null);
    try {
      const existing = chats.find(
        (chat) => chat.type === "direct" && chat.members.some((member) => member.id === userId)
      );
      if (existing) {
        closeNewChatScreen();
        onNavigateToChat(existing);
        return;
      }
      const chat = await createDirectChat(accessToken, userId);
      closeNewChatScreen();
      onNavigateToChat(chat);
      void refreshChats();
    } catch (err) {
      onError(err instanceof ApiError ? String(err.message) : "Could not create chat");
    }
  }

  async function handleCreateGroupChat(event: FormEvent) {
    event.preventDefault();
    if (!accessToken || !groupTitle.trim()) {
      return;
    }

    onError(null);
    try {
      const chat = await createGroupChat(accessToken, {
        title: groupTitle.trim(),
        memberIds: groupMemberIds
      });
      closeNewChatScreen();
      onNavigateToChat(chat);
      void refreshChats();
    } catch (err) {
      onError(err instanceof ApiError ? String(err.message) : "Could not create group");
    }
  }

  function toggleGroupMember(userId: string) {
    setGroupMemberIds((current) =>
      current.includes(userId)
        ? current.filter((existing) => existing !== userId)
        : [...current, userId]
    );
  }

  async function handleCreateChannelChat(event: FormEvent) {
    event.preventDefault();
    if (!accessToken || !groupTitle.trim()) {
      return;
    }

    onError(null);
    try {
      const chat = await createChannelChat(accessToken, {
        title: groupTitle.trim(),
        memberIds: groupMemberIds
      });
      closeNewChatScreen();
      onNavigateToChat(chat);
      void refreshChats();
    } catch (err) {
      onError(err instanceof ApiError ? String(err.message) : "Could not create channel");
    }
  }

  async function handleCreateVoiceChat(event: FormEvent) {
    event.preventDefault();
    if (!accessToken || !groupTitle.trim()) {
      return;
    }

    onError(null);
    try {
      const chat = await createVoiceChat(accessToken, {
        title: groupTitle.trim(),
        memberIds: groupMemberIds
      });
      closeNewChatScreen();
      onNavigateToChat(chat);
      void refreshChats();
    } catch (err) {
      onError(err instanceof ApiError ? String(err.message) : "Could not create voice channel");
    }
  }

  async function createMeetingChat(title: string): Promise<Chat | null> {
    if (!accessToken || !title.trim()) return null;

    onError(null);
    try {
      // A meeting link needs a group or voice chat. Start a group containing
      // the creator; people can be added later from the normal chat details.
      const chat = await createGroupChat(accessToken, { title: title.trim(), memberIds: [] });
      await refreshChats();
      return chat;
    } catch (err) {
      onError(err instanceof ApiError ? String(err.message) : "Could not create meeting chat");
      return null;
    }
  }

  return {
    chatSearch,
    setChatSearch,
    chatFilter,
    setChatFilter,
    filteredChats,
    chatsBySection,
    isNewChatOpen,
    newChatScreen,
    newChatMemberSearch,
    groupTitle,
    groupMemberIds,
    filteredNewChatMembers,
    openNewChatScreen,
    closeNewChatScreen,
    setNewChatScreen,
    setNewChatMemberSearch,
    setGroupTitle,
    toggleGroupMember,
    startDirectChatWith,
    handleCreateGroupChat,
    handleCreateChannelChat,
    handleCreateVoiceChat,
    createMeetingChat
  };
}
