import { act, createRef } from "react";
import { createRoot, Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChatHeader } from "./ChatHeader";
import type { Chat } from "../../../api/chats";
import type { User } from "../../../api/auth";

const mountedRoots: Root[] = [];

afterEach(() => {
  while (mountedRoots.length > 0) {
    const root = mountedRoots.pop();
    act(() => {
      root?.unmount();
    });
  }
  document.body.innerHTML = "";
});

function renderComponent(ui: React.ReactNode) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  mountedRoots.push(root);
  act(() => {
    root.render(ui);
  });
  return container;
}

const mockUser: User = {
  id: "user-1",
  displayName: "Test User",
  username: "testuser",
  email: "test@example.com"
};

const mockVoiceChat: Chat = {
  id: "voice-1",
  type: "voice",
  title: "General Voice",
  members: [mockUser],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
};

const mockDirectChat: Chat = {
  id: "direct-1",
  type: "direct",
  title: "Direct Chat",
  members: [mockUser],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
};

describe("ChatHeader", () => {
  it("renders search button and call buttons for direct chat", () => {
    const container = renderComponent(
      <ChatHeader
        accessToken="test-token"
        currentUser={mockUser}
        selectedChat={mockDirectChat}
        typingNames={[]}
        callPhase="idle"
        isChatMenuOpen={false}
        chatMenuRef={createRef()}
        onToggleChatMenu={vi.fn()}
        onBack={vi.fn()}
        onOpenDetails={vi.fn()}
        onStartAudioCall={vi.fn()}
        onStartVideoCall={vi.fn()}
        isMessageSearchOpen={false}
        onToggleMessageSearch={vi.fn()}
        onOpenMessageSearch={vi.fn()}
        onMarkRead={vi.fn()}
        onTogglePinned={vi.fn()}
        onToggleMuted={vi.fn()}
        onToggleFavorite={vi.fn()}
      />
    );

    const searchBtn = container.querySelector(".chat-header-search-button");
    expect(searchBtn).not.toBeNull();
    const audioBtn = container.querySelector(".chat-header-call-button--audio");
    expect(audioBtn).not.toBeNull();
  });

  it("shows a chat button for voice channels before and during a call", () => {
    const onToggleVoiceChat = vi.fn();
    const onBack = vi.fn();
    const container = renderComponent(
      <ChatHeader
        accessToken="test-token"
        currentUser={mockUser}
        selectedChat={mockVoiceChat}
        typingNames={[]}
        callPhase="in-call"
        isChatMenuOpen={false}
        chatMenuRef={createRef()}
        onToggleChatMenu={vi.fn()}
        onBack={onBack}
        onOpenDetails={vi.fn()}
        onStartAudioCall={vi.fn()}
        onStartVideoCall={vi.fn()}
        onToggleVoiceChat={onToggleVoiceChat}
        isMessageSearchOpen={false}
        onToggleMessageSearch={vi.fn()}
        onOpenMessageSearch={vi.fn()}
        onMarkRead={vi.fn()}
        onTogglePinned={vi.fn()}
        onToggleMuted={vi.fn()}
        onToggleFavorite={vi.fn()}
      />
    );

    expect(container.querySelector(".chat-header-search-button")).toBeNull();
    const chatButton = container.querySelector(".chat-header-voice-chat-button") as HTMLButtonElement;
    expect(chatButton).not.toBeNull();
    expect(chatButton.getAttribute("aria-label")).toBe("Open chat");

    act(() => {
      chatButton.click();
    });
    expect(onToggleVoiceChat).toHaveBeenCalledTimes(1);

    const backButton = container.querySelector(".mobile-back-button") as HTMLButtonElement;
    act(() => {
      backButton.click();
    });
    expect(onToggleVoiceChat).toHaveBeenCalledTimes(1);
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("shows the chat button before joining a voice channel", () => {
    const onToggleVoiceChat = vi.fn();
    const container = renderComponent(
      <ChatHeader
        accessToken="test-token"
        currentUser={mockUser}
        selectedChat={mockVoiceChat}
        typingNames={[]}
        callPhase="idle"
        isChatMenuOpen={false}
        chatMenuRef={createRef()}
        onToggleChatMenu={vi.fn()}
        onBack={vi.fn()}
        onOpenDetails={vi.fn()}
        onStartAudioCall={vi.fn()}
        onStartVideoCall={vi.fn()}
        onToggleVoiceChat={onToggleVoiceChat}
        isMessageSearchOpen={false}
        onToggleMessageSearch={vi.fn()}
        onOpenMessageSearch={vi.fn()}
        onMarkRead={vi.fn()}
        onTogglePinned={vi.fn()}
        onToggleMuted={vi.fn()}
        onToggleFavorite={vi.fn()}
      />
    );

    const chatButton = container.querySelector(".chat-header-voice-chat-button") as HTMLButtonElement;
    expect(chatButton).not.toBeNull();
    act(() => {
      chatButton.click();
    });
    expect(onToggleVoiceChat).toHaveBeenCalledTimes(1);
  });

  it("shows a crossed chat button while a voice channel's text chat is open", () => {
    const container = renderComponent(
      <ChatHeader
        accessToken="test-token"
        currentUser={mockUser}
        selectedChat={mockVoiceChat}
        typingNames={[]}
        callPhase="idle"
        isChatMenuOpen={false}
        chatMenuRef={createRef()}
        onToggleChatMenu={vi.fn()}
        onBack={vi.fn()}
        onOpenDetails={vi.fn()}
        onStartAudioCall={vi.fn()}
        onStartVideoCall={vi.fn()}
        isVoiceTextChatOpen
        onToggleVoiceChat={vi.fn()}
        isMessageSearchOpen={false}
        onToggleMessageSearch={vi.fn()}
        onOpenMessageSearch={vi.fn()}
        onMarkRead={vi.fn()}
        onTogglePinned={vi.fn()}
        onToggleMuted={vi.fn()}
        onToggleFavorite={vi.fn()}
      />
    );

    const chatButton = container.querySelector(".chat-header-voice-chat-button") as HTMLButtonElement;
    expect(chatButton.getAttribute("aria-label")).toBe("Close chat");
    expect(chatButton.querySelector(".lucide-message-circle-off")).not.toBeNull();
  });

  it("keeps the opened archive group visual identity in the header", () => {
    const profilePhoto = { id: "my-photo", mimeType: "image/png", sizeBytes: 1 } as User["profilePhoto"];
    const container = renderComponent(
      <ChatHeader
        accessToken="test-token"
        currentUser={{ ...mockUser, profilePhoto }}
        selectedChat={{ ...mockDirectChat, type: "archive" }}
        typingNames={[]}
        callPhase="idle"
        isChatMenuOpen={false}
        chatMenuRef={createRef()}
        onToggleChatMenu={vi.fn()}
        onBack={vi.fn()}
        onOpenDetails={vi.fn()}
        onStartAudioCall={vi.fn()}
        onStartVideoCall={vi.fn()}
        isMessageSearchOpen={false}
        onToggleMessageSearch={vi.fn()}
        onOpenMessageSearch={vi.fn()}
        onMarkRead={vi.fn()}
        onTogglePinned={vi.fn()}
        onToggleMuted={vi.fn()}
        onToggleFavorite={vi.fn()}
        archiveGroupName="My Notes"
        archiveGroupKind="notes"
        onBackFromArchiveGroup={vi.fn()}
      />
    );

    expect(container.querySelector(".chat-title-group--archive-group .chat-avatar")).not.toBeNull();
    expect(container.querySelector(".chat-title-group--archive-group .chat-avatar.archive")).not.toBeNull();
    expect(container.querySelector(".chat-title-group--archive-group .lucide-file-text")).not.toBeNull();
  });

  it("renders member count and description horizontally separated by dot", () => {
    const groupChatWithDescription: Chat = {
      id: "group-1",
      familyId: "fam-1",
      type: "group",
      title: "Atlas Project",
      description: "Atlas client rollout",
      createdBy: "user-1",
      mediaVisibility: "family",
      commentsEnabled: true,
      encryptionProtocol: "server_at_rest",
      mediaVisibilityPendingApproval: false,
      mediaVisibilityApprovalCount: 0,
      mediaVisibilityApprovalRequired: 0,
      myMediaVisibilityApproval: true,
      chatPhoto: null,
      members: [mockUser, { ...mockUser, id: "user-2", displayName: "User 2" }],
      unreadCount: 0,
      lastMessageId: null,
      lastMessageSenderId: null,
      lastMessageSenderDisplayName: null,
      lastMessageContent: null,
      lastMessageType: null,
      lastMessageCreatedAt: null,
      isMuted: false,
      isPinned: false,
      isFavorite: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    const container = renderComponent(
      <ChatHeader
        accessToken="test-token"
        currentUser={mockUser}
        selectedChat={groupChatWithDescription}
        typingNames={[]}
        callPhase="idle"
        isChatMenuOpen={false}
        chatMenuRef={createRef()}
        onToggleChatMenu={vi.fn()}
        onBack={vi.fn()}
        onOpenDetails={vi.fn()}
        onStartAudioCall={vi.fn()}
        onStartVideoCall={vi.fn()}
        onOpenCallScreen={vi.fn()}
        onSearchOpen={vi.fn()}
        onMessageSearchOpen={vi.fn()}
        presence="offline"
      />
    );
    const presenceEl = container.querySelector(".chat-presence");
    expect(presenceEl?.textContent).toBe("2 members · Atlas client rollout");
  });

  it("renders 'last seen recently' when peer has no last seen or visibility is nobody", () => {
    const peerWithoutLastSeen: User = {
      id: "user-2",
      displayName: "Liza",
      username: "liza",
      isOnline: false,
      lastSeenAt: null,
      lastSeenVisibility: "family"
    };
    const directChat: Chat = {
      ...mockDirectChat,
      members: [mockUser, peerWithoutLastSeen]
    };
    const container = renderComponent(
      <ChatHeader
        accessToken="test-token"
        currentUser={mockUser}
        selectedChat={directChat}
        typingNames={[]}
        callPhase="idle"
        isChatMenuOpen={false}
        chatMenuRef={createRef()}
        onToggleChatMenu={vi.fn()}
        onBack={vi.fn()}
        onOpenDetails={vi.fn()}
        onStartAudioCall={vi.fn()}
        onStartVideoCall={vi.fn()}
        isMessageSearchOpen={false}
        onToggleMessageSearch={vi.fn()}
        onOpenMessageSearch={vi.fn()}
        onMarkRead={vi.fn()}
        onTogglePinned={vi.fn()}
        onToggleMuted={vi.fn()}
        onToggleFavorite={vi.fn()}
      />
    );
    const presenceEl = container.querySelector(".chat-presence");
    expect(presenceEl?.textContent).toBe("last seen recently");
  });

  it("renders 'Online' when peer in direct chat is online", () => {
    const onlinePeer: User = {
      id: "user-2",
      displayName: "Liza",
      username: "liza",
      isOnline: true
    };
    const directChat: Chat = {
      ...mockDirectChat,
      members: [mockUser, onlinePeer]
    };
    const container = renderComponent(
      <ChatHeader
        accessToken="test-token"
        currentUser={mockUser}
        selectedChat={directChat}
        typingNames={[]}
        callPhase="idle"
        isChatMenuOpen={false}
        chatMenuRef={createRef()}
        onToggleChatMenu={vi.fn()}
        onBack={vi.fn()}
        onOpenDetails={vi.fn()}
        onStartAudioCall={vi.fn()}
        onStartVideoCall={vi.fn()}
        isMessageSearchOpen={false}
        onToggleMessageSearch={vi.fn()}
        onOpenMessageSearch={vi.fn()}
        onMarkRead={vi.fn()}
        onTogglePinned={vi.fn()}
        onToggleMuted={vi.fn()}
        onToggleFavorite={vi.fn()}
      />
    );
    const presenceEl = container.querySelector(".chat-presence");
    expect(presenceEl?.textContent).toBe("Online");
  });
});
