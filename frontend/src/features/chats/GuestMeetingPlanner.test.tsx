import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Chat } from "../../api/chats";
import { ChatOverlays } from "./ChatOverlays";

describe("guest meeting planner chat targets", () => {
  it("defines a dedicated popup surface and rounded input styling", () => {
    const styles = readFileSync("src/styles.css", "utf8");
    const popupRule = styles.match(/\.guest-meeting-planner\s*\{([^}]*)\}/)?.[1] ?? "";
    const fieldRule = styles.match(/\.guest-link-field input\s*\{([^}]*)\}/)?.[1] ?? "";
    expect(popupRule).toMatch(/background\s*:/);
    expect(popupRule).toContain("--surface-raised");
    expect(fieldRule).toMatch(/border-radius\s*:\s*(?:[2-9]\d|\d{3,})px/);
  });

  let container: HTMLDivElement;
  let root: Root | null;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    window.sessionStorage.setItem("stovo:guest-meeting-draft", JSON.stringify({ chatId: "family-chat" }));
  });

  afterEach(() => {
    act(() => root?.unmount());
    root = null;
    container.remove();
    window.sessionStorage.removeItem("stovo:guest-meeting-draft");
  });

  it("includes the General family chat in the meeting chat selector", async () => {
    const generalFamily = { id: "family-chat", type: "family", title: "General family" } as Chat;
    const noop = () => undefined;
    await act(async () => {
      root?.render(<MemoryRouter><ChatOverlays
        accessToken="token"
        chats={[generalFamily]}
        family={null}
        chatOverview={{
          isNewChatOpen: false,
          newChatScreen: "direct",
          filteredNewChatMembers: [],
          newChatMemberSearch: "",
          groupTitle: "",
          groupMemberIds: [],
          setNewChatMemberSearch: noop,
          setNewChatScreen: noop,
          closeNewChatScreen: noop,
          startDirectChatWith: async () => undefined,
          setGroupTitle: noop,
          toggleGroupMember: noop,
          handleCreateGroupChat: async () => undefined,
          handleCreateChannelChat: async () => undefined,
          handleCreateVoiceChat: async () => undefined,
          createMeetingChat: async () => null
        } as never}
        canCreateFamilyInvite={false}
        currentUser={{ id: "host", role: "member", permissions: ["manage_calls"] } as never}
        isFamilyInviteOpen={false}
        onCloseFamilyInvite={noop}
        fullViewImage={null}
        isFullViewImageClosing={false}
        onCloseFullViewImage={noop}
        onGoToFullViewImageMessage={noop}
        composerEnlargeOpen={false}
        composerContent=""
        renderMarkdown={false}
        onCloseComposerEnlarge={noop}
        onComposerEnlargeChange={noop}
      /></MemoryRouter>);
    });

    expect(document.body.querySelector('[role="dialog"][aria-label="Plan guest meeting"]')).toBeTruthy();
    expect(document.body.querySelector(".guest-link-select-trigger")?.textContent).toContain("General family");
    expect(document.body.querySelector('input[aria-label="New meeting chat name"]')).toBeNull();
  });
});
