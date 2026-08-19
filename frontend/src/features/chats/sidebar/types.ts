import type { FormEvent, ReactNode } from "react";

import type { User } from "../../../api/auth";
import type { Chat } from "../../../api/chats";
import type { QueuedSharedFiles } from "../../../sharedFileQueue";
import type { ChatFilter, ChatSectionKey, NewChatScreen } from "../shared/types";

export type ChatOverviewController = {
  chatSearch: string;
  setChatSearch: (value: string) => void;
  chatFilter: ChatFilter;
  setChatFilter: (filter: ChatFilter) => void;
  filteredChats: Chat[];
  chatsBySection: Record<ChatSectionKey, Chat[]>;
  isNewChatOpen: boolean;
  newChatScreen: NewChatScreen;
  newChatMemberSearch: string;
  groupTitle: string;
  groupMemberIds: string[];
  filteredNewChatMembers: User[];
  openNewChatScreen: () => void;
  closeNewChatScreen: () => void;
  setNewChatScreen: (screen: NewChatScreen) => void;
  setNewChatMemberSearch: (value: string) => void;
  setGroupTitle: (value: string) => void;
  toggleGroupMember: (userId: string) => void;
  startDirectChatWith: (userId: string) => Promise<void>;
  handleCreateGroupChat: (event: FormEvent) => Promise<void>;
  handleCreateChannelChat: (event: FormEvent) => Promise<void>;
  handleCreateVoiceChat: (event: FormEvent) => Promise<void>;
};

export type ChatSidebarProps = {
  familyName: string;
  canCreateFamilyInvite: boolean;
  onOpenFamilyInvite: () => void;
  activeChatId?: string;
  incomingSharedFiles: QueuedSharedFiles | null;
  isLoading: boolean;
  hasLoadedOverview?: boolean;
  accessToken: string | null;
  currentUserId?: string;
  minimizedChatLayout?: boolean;
  selectedChatId?: string;
  mobileCallStrip?: ReactNode;
  overview: ChatOverviewController;
  onSelectChat: (chat: Chat) => void;
  onOpenChat: (chat: Chat) => void;
};
