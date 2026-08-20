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
  it("renders when disconnected with active participants and allows user to join with exactly one button", () => {
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

    expect(container.textContent).toContain("Bob");

    // Ensure there is only 1 join button
    const joinButtons = container.querySelectorAll("button");
    const joinVoiceButtons = Array.from(joinButtons).filter(
      (b) => b.textContent?.includes("Join Voice Channel")
    );
    expect(joinVoiceButtons.length).toBe(1);

    act(() => {
      joinVoiceButtons[0].click();
    });
    expect(mockJoinVoiceChannel).toHaveBeenCalledWith(mockVoiceChat, { micMuted: false, cameraEnabled: false });
  });

  it("renders 'No users' when channel is empty with exactly one join button", () => {
    const emptyVoiceChat: Chat = {
      ...mockVoiceChat,
      activeCall: undefined
    };

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
        chat={emptyVoiceChat}
        session={mockSession}
        members={emptyVoiceChat.members as unknown as User[]}
        currentUser={mockCurrentUser}
        accessToken="test-token"
      />
    );

    expect(container.textContent).toContain("No users");
    expect(container.textContent).toContain("No users in this voice channel right now.");

    // Ensure there is only 1 join button on the whole screen (no duplicate button)
    const joinButtons = container.querySelectorAll("button");
    const joinVoiceButtons = Array.from(joinButtons).filter(
      (b) => b.textContent?.includes("Join Voice Channel")
    );
    expect(joinVoiceButtons.length).toBe(1);

    act(() => {
      joinVoiceButtons[0].click();
    });
    expect(mockJoinVoiceChannel).toHaveBeenCalledWith(emptyVoiceChat, { micMuted: false, cameraEnabled: false });
  });

  it("renders connected controls when active in the voice channel without text labels and with 3-dots menu", () => {
    const mockEndActiveCall = vi.fn();
    const mockApplyCallAudioPatch = vi.fn();
    const mockSetIsCallAudioPopupOpen = vi.fn();
    const mockAudioToggleVideo = vi.fn();
    const mockSetIsCallMinimized = vi.fn();
    const mockSession = {
      callPhase: "in-call",
      activeCallChatId: "voice-chat-1",
      callAudioSettings: { micMuted: false, cameraEnabled: false, screenSharing: false },
      callAudioCapabilities: { canShareScreen: true },
      applyCallAudioPatch: mockApplyCallAudioPatch,
      toggleScreenShare: vi.fn(),
      endActiveCall: mockEndActiveCall,
      joinVoiceChannel: vi.fn(),
      isPeerSpeaking: false,
      activeGroupCalls: {
        "voice-chat-1": mockVoiceChat.activeCall!
      },
      callTimer: "01:23",
      setIsCallSettingsMenuOpen: vi.fn(),
      setIsCallAudioPopupOpen: mockSetIsCallAudioPopupOpen,
      setIsCallMinimized: mockSetIsCallMinimized,
      audioCallRef: {
        current: { toggleVideo: mockAudioToggleVideo }
      }
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

    expect(container.textContent).toContain("Alice (You)");
    expect(container.textContent).toContain("Bob");

    // Check that dock buttons do NOT contain text like "Leave", "Mute", "Settings"
    const inCallToolbar = container.querySelector(".voice-room-in-call-controls");
    expect(inCallToolbar).toBeDefined();
    const buttons = inCallToolbar!.querySelectorAll(".voice-dock-btn");
    buttons.forEach((btn) => {
      // Buttons should only contain SVG icons (and optional dot indicator), no text
      expect(btn.querySelector("span")?.textContent || "").toBe("");
    });

    const leaveBtn = container.querySelector(".voice-dock-btn--disconnect") as HTMLButtonElement;
    expect(leaveBtn).toBeDefined();

    act(() => {
      leaveBtn.click();
    });
    expect(mockEndActiveCall).toHaveBeenCalled();

    // Test Mic toggle
    const micBtn = buttons[0] as HTMLButtonElement;
    expect(micBtn).toBeDefined();
    act(() => {
      micBtn.click();
    });
    expect(mockApplyCallAudioPatch).toHaveBeenCalledWith({ micMuted: true });

    // Test Video button
    const videoBtn = buttons[1] as HTMLButtonElement;
    expect(videoBtn).toBeDefined();
    act(() => {
      videoBtn.click();
    });
    expect(mockApplyCallAudioPatch).toHaveBeenCalledWith({ cameraEnabled: true });
    expect(mockAudioToggleVideo).toHaveBeenCalledWith(true);

    // Test Screen Share button
    const shareBtn = buttons[2] as HTMLButtonElement;
    expect(shareBtn).toBeDefined();
    act(() => {
      shareBtn.click();
    });
    expect(mockSession.toggleScreenShare).toHaveBeenCalled();

    // Test Shrink button
    const shrinkBtn = buttons[3] as HTMLButtonElement;
    expect(shrinkBtn).toBeDefined();
    act(() => {
      shrinkBtn.click();
    });
    expect(mockSetIsCallMinimized).toHaveBeenCalledWith(true);

    // Click 3-dots more menu
    const moreBtn = inCallToolbar!.querySelector("button[title='More Options']") as HTMLButtonElement;
    expect(moreBtn).toBeDefined();

    act(() => {
      moreBtn.click();
    });

    const moreMenu = container.querySelector(".voice-more-menu");
    expect(moreMenu).toBeDefined();
    expect(moreMenu!.textContent).toContain("Settings");
    expect(moreMenu!.textContent).toContain("AI Notes");

    // Click Settings item in more menu
    const settingsItem = Array.from(moreMenu!.querySelectorAll(".voice-more-menu-item")).find(
      (el) => el.textContent?.includes("Settings")
    ) as HTMLButtonElement;
    expect(settingsItem).toBeDefined();

    act(() => {
      settingsItem.click();
    });
    expect(mockSetIsCallAudioPopupOpen).toHaveBeenCalledWith(true);
  });

  it("scales grid tiers dynamically from 1 to 2, 4, 6, 9 participants and switches to list mode for >9", () => {
    const createSessionWithCount = (count: number) => {
      const participants = Array.from({ length: count }, (_, i) => ({
        userId: `user-${i + 1}`,
        state: "connected",
        role: "member"
      }));

      const chat: Chat = {
        ...mockVoiceChat,
        activeCall: {
          roomId: "voice-room-1",
          chatId: "voice-chat-1",
          callType: "audio",
          topology: "sfu",
          participants
        }
      };

      const session = {
        callPhase: "idle",
        activeCallChatId: null,
        callAudioSettings: { micMuted: false, cameraEnabled: false, screenSharing: false },
        applyCallAudioPatch: vi.fn(),
        toggleScreenShare: vi.fn(),
        endActiveCall: vi.fn(),
        joinVoiceChannel: vi.fn(),
        isPeerSpeaking: false,
        activeGroupCalls: {},
        callTimer: "00:00",
        setIsCallSettingsMenuOpen: vi.fn()
      } as unknown as CallSessionApi;

      return { chat, session };
    };

    // 1 user -> voice-grid--1
    {
      const { chat, session } = createSessionWithCount(1);
      const container = renderComponent(
        <VoiceChannelStage
          chat={chat}
          session={session}
          members={chat.members as unknown as User[]}
          currentUser={mockCurrentUser}
          accessToken="test-token"
        />
      );
      expect(container.querySelector(".voice-room-grid")?.classList.contains("voice-grid--1")).toBe(true);
    }

    // 2 users -> voice-grid--2
    {
      const { chat, session } = createSessionWithCount(2);
      const container = renderComponent(
        <VoiceChannelStage
          chat={chat}
          session={session}
          members={chat.members as unknown as User[]}
          currentUser={mockCurrentUser}
          accessToken="test-token"
        />
      );
      expect(container.querySelector(".voice-room-grid")?.classList.contains("voice-grid--2")).toBe(true);
    }

    // 4 users -> voice-grid--4
    {
      const { chat, session } = createSessionWithCount(4);
      const container = renderComponent(
        <VoiceChannelStage
          chat={chat}
          session={session}
          members={chat.members as unknown as User[]}
          currentUser={mockCurrentUser}
          accessToken="test-token"
        />
      );
      expect(container.querySelector(".voice-room-grid")?.classList.contains("voice-grid--4")).toBe(true);
    }

    // 6 users -> voice-grid--6
    {
      const { chat, session } = createSessionWithCount(6);
      const container = renderComponent(
        <VoiceChannelStage
          chat={chat}
          session={session}
          members={chat.members as unknown as User[]}
          currentUser={mockCurrentUser}
          accessToken="test-token"
        />
      );
      expect(container.querySelector(".voice-room-grid")?.classList.contains("voice-grid--6")).toBe(true);
    }

    // 9 users -> voice-grid--9 (3x3 grid)
    {
      const { chat, session } = createSessionWithCount(9);
      const container = renderComponent(
        <VoiceChannelStage
          chat={chat}
          session={session}
          members={chat.members as unknown as User[]}
          currentUser={mockCurrentUser}
          accessToken="test-token"
        />
      );
      expect(container.querySelector(".voice-room-grid")?.classList.contains("voice-grid--9")).toBe(true);
    }

    // 10 users -> list mode (.voice-room-user-list)
    {
      const { chat, session } = createSessionWithCount(10);
      const container = renderComponent(
        <VoiceChannelStage
          chat={chat}
          session={session}
          members={chat.members as unknown as User[]}
          currentUser={mockCurrentUser}
          accessToken="test-token"
        />
      );
      expect(container.querySelector(".voice-room-grid")).toBeNull();
      const userList = container.querySelector(".voice-room-user-list");
      expect(userList).toBeDefined();
      expect(userList?.querySelectorAll(".voice-participant-list-row").length).toBe(10);
    }
  });
});
