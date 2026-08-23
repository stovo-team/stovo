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
});
