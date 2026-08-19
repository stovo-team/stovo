import { act } from "react";
import { createRoot, Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { VoiceChannelStage } from "./VoiceChannelStage";
import type { Chat } from "../../../api/chats";
import type { User } from "../../../api/auth";
import type { CallSessionApi } from "./useCallSession";

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

const mockVoiceChat: Chat = {
  id: "voice-chat-1",
  familyId: "fam-1",
  type: "voice",
  title: "Gaming Voice",
  createdBy: "user-1",
  mediaVisibility: "members",
  commentsEnabled: true,
  encryptionProtocol: "server_at_rest",
  mediaVisibilityPendingApproval: false,
  mediaVisibilityApprovalCount: 0,
  mediaVisibilityApprovalRequired: 0,
  myMediaVisibilityApproval: true,
  chatPhoto: null,
  createdAt: "2026-08-19T00:00:00Z",
  updatedAt: "2026-08-19T00:00:00Z",
  members: [
    {
      id: "user-1",
      displayName: "Alice",
      username: "alice",
      role: "member",
      publicKey: null,
      profilePhoto: null
    },
    {
      id: "user-2",
      displayName: "Bob",
      username: "bob",
      role: "member",
      publicKey: null,
      profilePhoto: null
    }
  ],
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
  activeCall: {
    roomId: "voice-room-1",
    chatId: "voice-chat-1",
    callType: "audio",
    topology: "sfu",
    participants: [
      { userId: "user-2", state: "connected", role: "member" }
    ]
  }
};

const mockCurrentUser: User = {
  id: "user-1",
  displayName: "Alice",
  username: "alice",
  role: "member",
  isActive: true,
  familyId: "fam-1",
  publicKey: null,
  profilePhoto: null,
  readReceiptsEnabled: true,
  profileVisibility: "family",
  lastSeenVisibility: "family",
  lastSeenAt: null
};

describe("VoiceChannelStage", () => {
  it("renders when disconnected and allows user to join", () => {
    const mockJoinVoiceChannel = vi.fn();
    const mockSession = {
      callPhase: "idle",
      activeCallChatId: null,
      callAudioSettings: { micMuted: false, cameraEnabled: false, screenSharing: false },
      applyCallAudioPatch: vi.fn(),
      toggleScreenShare: vi.fn(),
      endActiveCall: vi.fn(),
      joinVoiceChannel: mockJoinVoiceChannel,
      isPeerSpeaking: false,
      activeGroupCalls: {},
      callTimer: "00:00",
      setIsCallSettingsMenuOpen: vi.fn()
    } as unknown as CallSessionApi;

    const container = renderComponent(
      <VoiceChannelStage
        chat={mockVoiceChat}
        session={mockSession}
        members={mockVoiceChat.members as unknown as User[]}
        currentUser={mockCurrentUser}
        accessToken="test-token"
      />
    );

    expect(container.textContent).toContain("Gaming Voice");
    expect(container.textContent).toContain("1 member currently talking");
    expect(container.textContent).toContain("Bob");

    const joinBtn = container.querySelector(".voice-room-primary-join-btn") as HTMLButtonElement;
    expect(joinBtn).toBeDefined();

    act(() => {
      joinBtn.click();
    });
    expect(mockJoinVoiceChannel).toHaveBeenCalledWith(mockVoiceChat, { micMuted: false, cameraEnabled: false });
  });

  it("renders connected controls when active in the voice channel", () => {
    const mockEndActiveCall = vi.fn();
    const mockApplyCallAudioPatch = vi.fn();
    const mockSession = {
      callPhase: "in-call",
      activeCallChatId: "voice-chat-1",
      callAudioSettings: { micMuted: false, cameraEnabled: false, screenSharing: false },
      applyCallAudioPatch: mockApplyCallAudioPatch,
      toggleScreenShare: vi.fn(),
      endActiveCall: mockEndActiveCall,
      joinVoiceChannel: vi.fn(),
      isPeerSpeaking: false,
      activeGroupCalls: {
        "voice-chat-1": mockVoiceChat.activeCall!
      },
      callTimer: "01:23",
      setIsCallSettingsMenuOpen: vi.fn()
    } as unknown as CallSessionApi;

    const container = renderComponent(
      <VoiceChannelStage
        chat={mockVoiceChat}
        session={mockSession}
        members={mockVoiceChat.members as unknown as User[]}
        currentUser={mockCurrentUser}
        accessToken="test-token"
      />
    );

    expect(container.textContent).toContain("Connected · 01:23");
    expect(container.textContent).toContain("Alice (You)");
    expect(container.textContent).toContain("Bob");

    const leaveBtn = container.querySelector(".voice-dock-btn--disconnect") as HTMLButtonElement;
    expect(leaveBtn).toBeDefined();

    act(() => {
      leaveBtn.click();
    });
    expect(mockEndActiveCall).toHaveBeenCalled();

    const dockButtons = container.querySelectorAll(".voice-dock-btn");
    const micBtn = dockButtons[0] as HTMLButtonElement;
    expect(micBtn).toBeDefined();

    act(() => {
      micBtn.click();
    });
    expect(mockApplyCallAudioPatch).toHaveBeenCalledWith({ micMuted: true });
  });
});
