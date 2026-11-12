import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ChatOverviewController } from "./types";

const { mockNavigate, mockOpenNewChatScreen } = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  mockOpenNewChatScreen: vi.fn(),
}));

vi.mock("react-router-dom", () => ({
  useNavigate: () => mockNavigate,
}));

vi.mock("../../../auth/AuthContext", () => ({
  useAuth: () => ({
    activeServer: null,
    savedServers: [],
    hotSwapServer: vi.fn(),
    removeServer: vi.fn(),
    currentUser: null,
  }),
}));

vi.mock("../../../i18n/LanguageContext", () => ({
  useStrings: () => ({
    spaceSwitcher: { selectSpace: "Select space", currentSpace: "Current space", connectSpace: "Connect Space" },
    chats: {
      title: "Chats",
      sidebar: {
        ariaLabel: "Chat sidebar",
        spaces: "Spaces",
        removeSpace: (name: string) => `Remove ${name}`,
        selectChatToAdd: "Select chat to add",
        sharedFilesReady: "Shared files ready",
        startChat: "Start chat",
        invite: "Invite",
        createInvitation: "Create invitation",
      },
      searchPlaceholder: "Search",
    },
  }),
}));

vi.mock("./ChatList", () => ({
  ChatList: () => null,
}));

import { ChatSidebar } from "./ChatSidebar";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const roots: Root[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    act(() => root.unmount());
  }
  document.body.replaceChildren();
  mockNavigate.mockReset();
  mockOpenNewChatScreen.mockReset();
});

function overview(): ChatOverviewController {
  return {
    chatSearch: "",
    setChatSearch: vi.fn(),
    filteredChats: [],
    chatsBySection: { archive: [], voice: [], channels: [], groups: [], dms: [] },
    isNewChatOpen: false,
    newChatScreen: "pick",
    newChatMemberSearch: "",
    groupTitle: "",
    groupMemberIds: [],
    filteredNewChatMembers: [],
    openNewChatScreen: mockOpenNewChatScreen,
    closeNewChatScreen: vi.fn(),
    setNewChatScreen: vi.fn(),
    setNewChatMemberSearch: vi.fn(),
    setGroupTitle: vi.fn(),
    toggleGroupMember: vi.fn(),
    startDirectChatWith: vi.fn(async () => undefined),
    handleCreateGroupChat: vi.fn(async () => undefined),
    handleCreateChannelChat: vi.fn(async () => undefined),
    handleCreateVoiceChat: vi.fn(async () => undefined),
    createMeetingChat: vi.fn(async () => null),
  };
}

describe("ChatSidebar compose action", () => {
  it("does not render filter tags above the chat list", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    roots.push(root);

    act(() => {
      root.render(
        <ChatSidebar
          familyName="Stovo"
          familyId="family-1"
          canCreateFamilyInvite={false}
          onOpenFamilyInvite={vi.fn()}
          incomingSharedFiles={null}
          isLoading={false}
          accessToken={null}
          overview={overview()}
          onSelectChat={vi.fn()}
          onOpenChat={vi.fn()}
          onOpenDraftsAndScheduled={vi.fn()}
          onOpenMessageArchive={vi.fn()}
        />
      );
    });

    expect(container.querySelector(".chat-list-filters")).toBeNull();
  });

  it("shows the localized Connect Space action in the space switcher", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    roots.push(root);

    act(() => {
      root.render(
        <ChatSidebar
          familyName="Stovo"
          familyId="family-1"
          canCreateFamilyInvite={false}
          onOpenFamilyInvite={vi.fn()}
          incomingSharedFiles={null}
          isLoading={false}
          accessToken={null}
          overview={overview()}
          onSelectChat={vi.fn()}
          onOpenChat={vi.fn()}
          onOpenDraftsAndScheduled={vi.fn()}
          onOpenMessageArchive={vi.fn()}
        />
      );
    });

    const trigger = container.querySelector<HTMLButtonElement>(".server-switcher-trigger");
    expect(trigger?.getAttribute("aria-label")).toBe("Select space");
    act(() => { trigger?.click(); });
    expect(container.textContent).not.toContain("Current space");
    const connect = container.querySelector<HTMLButtonElement>(".server-switcher-connect");
    expect(connect?.textContent?.trim()).toBe("Connect Space");
    act(() => { connect?.click(); });
    expect(mockNavigate).toHaveBeenCalledWith("/server-setup");
  });

  it("renders an accessible SVG plus and starts a new chat without a glyph fallback", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    roots.push(root);

    act(() => {
      root.render(
        <ChatSidebar
          familyName="Stovo"
          familyId="family-1"
          canCreateFamilyInvite={false}
          onOpenFamilyInvite={vi.fn()}
          incomingSharedFiles={null}
          isLoading={false}
          accessToken={null}
          overview={overview()}
          onSelectChat={vi.fn()}
          onOpenChat={vi.fn()}
          onOpenDraftsAndScheduled={vi.fn()}
          onOpenMessageArchive={vi.fn()}
        />
      );
    });

    const composeFab = container.querySelector<HTMLButtonElement>("button.compose-fab");
    if (!composeFab) throw new Error("Expected the compose action button");

    expect(composeFab.getAttribute("aria-label")).toBe("Start chat");
    const icon = composeFab.querySelector("svg");
    expect(icon?.getAttribute("aria-hidden")).toBe("true");
    expect(icon?.classList.contains("lucide-plus")).toBe(true);
    expect(icon?.getAttribute("width")).toBe("16");
    expect(composeFab.textContent).not.toContain("edit_square");
    expect(composeFab.querySelector("svg path")).not.toBeNull();
    expect(composeFab.querySelector(".ms-icon")).toBeNull();

    act(() => {
      composeFab.click();
    });

    expect(mockOpenNewChatScreen).toHaveBeenCalledTimes(1);
  });
});
