import { readCssSource } from "../test/cssSource";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const styles = readCssSource(resolve(process.cwd(), "src/styles.css"));

describe("active chat list item styling", () => {
  it("uses a brighter accent background without a left indicator", () => {
    const activeRule = Array.from(
      styles.matchAll(/\.chat-list-item\.active \{([^}]*)\}/g)
    ).at(-1)?.[1] ?? "";

    expect(activeRule).toContain(
      "background: color-mix(in oklab, var(--accent-soft) 28%, transparent);"
    );
    expect(activeRule).toContain("border-radius: var(--radius-panel);");
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

  it("slides the mobile conversation in from the right and restores the list from the left", () => {
    expect(styles).toMatch(
      /\.messenger-shell\.chat-list-view \.chat-detail \{[\s\S]*?transform:\s*translate3d\(100%, 0, 0\);[\s\S]*?var\(--motion-page, 300ms\)/
    );
    expect(styles).toMatch(
      /\.messenger-shell\.has-active-chat \.chat-sidebar \{[\s\S]*?transform:\s*translate3d\(-20%, 0, 0\);[\s\S]*?var\(--motion-page, 300ms\)/
    );
    expect(styles).toMatch(
      /\.messenger-shell\.has-active-chat \.chat-detail \{[\s\S]*?transform:\s*translate3d\(0, 0, 0\);[\s\S]*?var\(--motion-page, 300ms\)/
    );
    expect(styles).toContain("animation: chat-detail-slide-in-from-right var(--motion-page, 300ms)");
    expect(styles).toContain("animation: chat-detail-slide-out-to-right var(--motion-page, 300ms)");
    expect(styles).toContain("animation: chat-list-slide-in-from-left var(--motion-page, 300ms)");
    expect(styles).toContain("@keyframes chat-detail-slide-in-from-right");
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

