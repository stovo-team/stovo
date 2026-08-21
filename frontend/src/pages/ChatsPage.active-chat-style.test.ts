import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const styles = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");

describe("active chat list item styling", () => {
  it("uses a brighter accent background without a left indicator", () => {
    const activeRule = Array.from(
      styles.matchAll(/\.chat-list-item\.active \{([^}]*)\}/g)
    ).at(-1)?.[1] ?? "";

    expect(activeRule).toContain(
      "background: color-mix(in oklab, var(--accent-soft) 28%, transparent);"
    );
    expect(activeRule).toContain("border-radius: 22px;");
    expect(activeRule).not.toContain("border-left");
  });

  it("does not clear selectedChat synchronously in closeActiveChat to avoid flashing empty state", () => {
    const controllerSource = readFileSync(
      resolve(process.cwd(), "src/features/chats/useChatsPageController.ts"),
      "utf8"
    );
    const start = controllerSource.indexOf("function closeActiveChat()");
    const end = controllerSource.indexOf("const { requestCloseActiveChatSurface", start);
    const closeActiveChatBody = controllerSource.slice(start, end);
    expect(closeActiveChatBody).not.toContain("setSelectedChat(null)");
    expect(closeActiveChatBody).toContain("navigateToChatList()");
  });

  it("keeps one ChatsPage instance while switching between a room and the chat list", () => {
    const appSource = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");
    expect(appSource).toContain('path="/app/chats/:chatId?"');
    expect(appSource).not.toContain('path="/app/chats/:chatId"');
  });

  it("keeps chat-list-topline flex layout with non-wrapping time and distinct preview styling", () => {
    expect(styles).toMatch(
      /\.chat-list-topline \{[\s\S]*?display:\s*flex;[\s\S]*?justify-content:\s*space-between;/
    );
    expect(styles).toMatch(
      /\.chat-list-topline strong \{[\s\S]*?flex:\s*1 1 auto;[\s\S]*?text-overflow:\s*ellipsis;/
    );
    expect(styles).toMatch(
      /\.chat-list-topline time \{[\s\S]*?flex-shrink:\s*0;[\s\S]*?white-space:\s*nowrap;/
    );
    expect(styles).toMatch(
      /\.chat-list-preview,[\s\S]*?\.chat-list-copy > span:not\(\.chat-list-topline\)/
    );
  });
});

