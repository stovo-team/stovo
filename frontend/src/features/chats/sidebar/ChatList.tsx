import { MessageCircle } from "lucide-react";

import { Chat } from "../../../api/chats";
import { CHAT_SECTION_ORDER } from "../shared/chatPresentation";
import type { ChatFilter, ChatSectionKey } from "../shared/types";
import { ChatListItem } from "./ChatListItem";

type ChatListProps = {
  isLoading: boolean;
  chatsBySection: Record<ChatSectionKey, Chat[]>;
  filteredChats: Chat[];
  chatFilter: ChatFilter;
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
  chatsBySection,
  filteredChats,
  chatFilter,
  accessToken,
  currentUserId,
  selectedChatId,
  activeChatId,
  minimizedChatLayout,
  onSelectChat,
  onOpenChat,
  onStartNewChat
}: ChatListProps) {
  return (
    <div className="chat-list" aria-busy={isLoading}>
      {isLoading
        ? Array.from({ length: 5 }).map((_, index) => (
            <div className="chat-list-item skeleton-row" key={index}>
              <span className="skeleton-avatar" />
              <span className="chat-list-copy">
                <span className="skeleton-line wide" />
                <span className="skeleton-line" />
              </span>
            </div>
          ))
        : CHAT_SECTION_ORDER.map((section) => {
            const sectionChats = chatsBySection[section.key];
            if (sectionChats.length === 0) {
              return null;
            }
            return (
              <section className="chat-list-section" key={section.key} aria-label={section.label}>
                <h2>{section.label}</h2>
                {sectionChats.map((chat) => (
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
      {!isLoading && filteredChats.length === 0 && (
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
    </div>
  );
}
