import {act} from "react";
import {createRoot, type Root} from "react-dom/client";
import {afterEach, describe, expect, it, vi} from "vitest";

import {getAppStrings} from "../../../config/strings";

vi.mock("../../../i18n/LanguageContext", () => ({useStrings: () => getAppStrings("en")}));

import type {Chat} from "../../../api/chats";
import {ChatListItem} from "./ChatListItem";

(globalThis as typeof globalThis & {IS_REACT_ACT_ENVIRONMENT: boolean}).IS_REACT_ACT_ENVIRONMENT = true;
const roots: Root[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount());
  document.body.innerHTML = "";
});

function render(chat: Chat) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  roots.push(root);
  act(() => root.render(<ChatListItem
    chat={chat}
    isActive={false}
    isTransitionSource={false}
    accessToken={null}
    minimizedChatLayout
    onSelect={vi.fn()}
    onOpen={vi.fn()}
  />));
  return container;
}

describe("ChatListItem avatars in minimized layout", () => {
  it.each(["group", "family", "voice", "channel"] as const)("renders the saved avatar for %s chats", (type) => {
    const chat = {
      id: `${type}-1`,
      type,
      title: "Team room",
      members: [],
      avatarMode: "symbol",
      avatarSymbolId: "star",
      avatarColorId: "teal",
      updatedAt: "2026-01-01T00:00:00Z",
      createdAt: "2026-01-01T00:00:00Z",
    } as unknown as Chat;
    const host = render(chat);

    expect(host.querySelector(".entity-avatar")?.getAttribute("data-avatar-color")).toBe("teal");
    expect(host.querySelector(".entity-avatar__symbol")).not.toBeNull();
    expect(host.querySelector(".chat-list-type-marker")).toBeNull();
  });
});
