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
    chats: {
      title: "Chats",
      searchPlaceholder: "Search",
      filters: {
        all: "All",
        unread: "Unread",
        groups: "Groups",
        direct: "Direct",
        voice: "Voice",
        muted: "Muted",
      },
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
    chatFilter: "all",
    setChatFilter: vi.fn(),
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
  it("renders a compact accessible SVG plus and starts a new chat without a glyph fallback", () => {
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

    expect(composeFab.getAttribute("aria-label")).toBe("Start a chat");
    const icon = composeFab.querySelector("svg");
    expect(icon?.getAttribute("aria-hidden")).toBe("true");
    expect(icon?.getAttribute("width")).toBe("20");
    expect(composeFab.textContent).not.toContain("edit_square");
    expect(composeFab.querySelector(".ms-icon")).toBeNull();

    act(() => {
      composeFab.click();
    });

    expect(mockOpenNewChatScreen).toHaveBeenCalledTimes(1);
  });
});
