import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { QuickSwitcherModal } from "./QuickSwitcherModal";
import * as chatsApi from "../api/chats";
import * as familyApi from "../api/family";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({
    accessToken: "test-token",
    currentUser: { id: "u1", displayName: "Ivan", username: "ivan", role: "owner" },
    logout: vi.fn()
  })
}));

vi.mock("../appearance/AppearanceContext", () => ({
  useAppearance: () => ({
    appearance: { themeMode: "dark" },
    setAppearance: vi.fn()
  })
}));

describe("QuickSwitcherModal", () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  const mockChats: chatsApi.Chat[] = [
    {
      id: "c1",
      familyId: "fam1",
      type: "channel",
      title: "Announcements",
      createdBy: "u1",
      mediaVisibility: "family",
      commentsEnabled: true,
      encryptionProtocol: "server_at_rest",
      mediaVisibilityPendingApproval: false,
      mediaVisibilityApprovalCount: 0,
      mediaVisibilityApprovalRequired: 1,
      myMediaVisibilityApproval: false,
      chatPhoto: null,
      createdAt: "2026-01-01",
      updatedAt: "2026-01-01",
      members: [],
      unreadCount: 0,
      lastMessageId: null,
      lastMessageSenderId: null,
      lastMessageSenderDisplayName: null,
      lastMessageContent: null,
      lastMessageType: null,
      lastMessageCreatedAt: null,
      isMuted: false,
      isPinned: false,
      isFavorite: false
    },
    {
      id: "c2",
      familyId: "fam1",
      type: "direct",
      title: null,
      createdBy: "u1",
      mediaVisibility: "members",
      commentsEnabled: true,
      encryptionProtocol: "server_at_rest",
      mediaVisibilityPendingApproval: false,
      mediaVisibilityApprovalCount: 0,
      mediaVisibilityApprovalRequired: 1,
      myMediaVisibilityApproval: false,
      chatPhoto: null,
      createdAt: "2026-01-01",
      updatedAt: "2026-01-01",
      members: [
        {
          id: "u1",
          displayName: "Ivan",
          username: "ivan",
          role: "owner",
          publicKey: null,
          profilePhoto: null
        },
        {
          id: "u2",
          displayName: "Elena",
          username: "elena",
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
      isFavorite: false
    }
  ];

  const mockMembers = [
    { id: "u1", displayName: "Ivan", username: "ivan", role: "owner" as const, createdAt: "2026-01-01", profileVisibility: "everyone" as const, lastSeenVisibility: "everyone" as const, readReceiptsEnabled: true, directMessagePermission: "everyone" as const, groupInvitePermission: "everyone" as const, channelInvitePermission: "everyone" as const, voiceInvitePermission: "everyone" as const, invitePermissionUserIds: [] },
    { id: "u2", displayName: "Elena", username: "elena", role: "member" as const, createdAt: "2026-01-01", profileVisibility: "everyone" as const, lastSeenVisibility: "everyone" as const, readReceiptsEnabled: true, directMessagePermission: "everyone" as const, groupInvitePermission: "everyone" as const, channelInvitePermission: "everyone" as const, voiceInvitePermission: "everyone" as const, invitePermissionUserIds: [] },
    { id: "u3", displayName: "Alex", username: "alex", role: "member" as const, createdAt: "2026-01-01", profileVisibility: "everyone" as const, lastSeenVisibility: "everyone" as const, readReceiptsEnabled: true, directMessagePermission: "everyone" as const, groupInvitePermission: "everyone" as const, channelInvitePermission: "everyone" as const, voiceInvitePermission: "everyone" as const, invitePermissionUserIds: [] }
  ];

  beforeEach(() => {
    vi.spyOn(chatsApi, "getChats").mockResolvedValue(mockChats);
    vi.spyOn(familyApi, "getMembers").mockResolvedValue(mockMembers);

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    if (root) {
      act(() => {
        root?.unmount();
      });
    }
    container?.remove();
    container = null;
    root = null;
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  it("renders when open is true and displays chats, direct messages, and members", async () => {
    const onClose = vi.fn();
    await act(async () => {
      root?.render(
        <BrowserRouter>
          <QuickSwitcherModal open={true} onClose={onClose} />
        </BrowserRouter>
      );
    });

    expect(document.querySelector(".quick-switcher-modal")).not.toBeNull();
    const input = document.querySelector<HTMLInputElement>(".quick-switcher-input");
    expect(input).not.toBeNull();

    // Allow promise resolution
    await act(async () => {
      await Promise.resolve();
    });

    expect(document.body.textContent).toContain("Announcements");
    expect(document.body.textContent).toContain("Elena");
    expect(document.body.textContent).toContain("Alex");
  });

  const setInputValue = (el: HTMLInputElement, value: string) => {
    const valueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
    valueSetter?.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  };

  it("filters items when query changes", async () => {
    const onClose = vi.fn();
    await act(async () => {
      root?.render(
        <BrowserRouter>
          <QuickSwitcherModal open={true} onClose={onClose} />
        </BrowserRouter>
      );
    });

    await act(async () => {
      await Promise.resolve();
    });

    const input = document.querySelector<HTMLInputElement>(".quick-switcher-input");
    expect(input).not.toBeNull();

    await act(async () => {
      if (input) {
        setInputValue(input, "Announce");
      }
    });

    expect(document.body.textContent).toContain("Announcements");
    expect(document.body.textContent).not.toContain("Alex");
  });

  it("handles prefix # for channels and @ for people", async () => {
    const onClose = vi.fn();
    await act(async () => {
      root?.render(
        <BrowserRouter>
          <QuickSwitcherModal open={true} onClose={onClose} />
        </BrowserRouter>
      );
    });

    await act(async () => {
      await Promise.resolve();
    });

    const input = document.querySelector<HTMLInputElement>(".quick-switcher-input");
    expect(input).not.toBeNull();

    // # Channels
    await act(async () => {
      if (input) {
        setInputValue(input, "#");
      }
    });
    expect(document.body.textContent).toContain("Announcements");
    expect(document.body.textContent).not.toContain("Alex");

    // @ People
    await act(async () => {
      if (input) {
        setInputValue(input, "@");
      }
    });
    expect(document.body.textContent).not.toContain("Announcements");
    expect(document.body.textContent).toContain("Elena");
    expect(document.body.textContent).toContain("Alex");
  });

  it("closes when Escape key is pressed", async () => {
    const onClose = vi.fn();
    await act(async () => {
      root?.render(
        <BrowserRouter>
          <QuickSwitcherModal open={true} onClose={onClose} />
        </BrowserRouter>
      );
    });

    const modal = document.querySelector(".quick-switcher-modal");
    expect(modal).not.toBeNull();

    await act(async () => {
      modal?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });

    expect(onClose).toHaveBeenCalled();
  });

  it("renders fully rounded search bar and closes when close button is clicked", async () => {
    const onClose = vi.fn();
    await act(async () => {
      root?.render(
        <BrowserRouter>
          <QuickSwitcherModal open={true} onClose={onClose} />
        </BrowserRouter>
      );
    });

    const searchBar = document.querySelector(".quick-switcher-search-bar");
    expect(searchBar).not.toBeNull();

    const closeBtn = document.querySelector<HTMLButtonElement>(".quick-switcher-close-button");
    expect(closeBtn).not.toBeNull();
    expect(closeBtn?.querySelector("svg")).not.toBeNull();

    await act(async () => {
      closeBtn?.click();
    });

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
