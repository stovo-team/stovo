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
        activeCallChatId={null}
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

  it("replaces search button with shrink button for active voice channel", () => {
    const onShrinkCall = vi.fn();
    const onBack = vi.fn();
    const container = renderComponent(
      <ChatHeader
        accessToken="test-token"
        currentUser={mockUser}
        selectedChat={mockVoiceChat}
        typingNames={[]}
        callPhase="in-call"
        activeCallChatId="voice-1"
        isChatMenuOpen={false}
        chatMenuRef={createRef()}
        onToggleChatMenu={vi.fn()}
        onBack={onBack}
        onOpenDetails={vi.fn()}
        onStartAudioCall={vi.fn()}
        onStartVideoCall={vi.fn()}
        onShrinkCall={onShrinkCall}
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
    const shrinkButton = container.querySelector(".chat-header-shrink-button") as HTMLButtonElement;
    expect(shrinkButton).not.toBeNull();

    act(() => {
      shrinkButton.click();
    });
    expect(onShrinkCall).toHaveBeenCalledTimes(1);

    const backButton = container.querySelector(".mobile-back-button") as HTMLButtonElement;
    act(() => {
      backButton.click();
    });
    expect(onShrinkCall).toHaveBeenCalledTimes(1);
    expect(onBack).toHaveBeenCalledTimes(1);

  });
});
