import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const panel = readFileSync(resolve(process.cwd(), "src/features/chats/QuickAccessPanel.tsx"), "utf8");
const callFeature = readFileSync(resolve(process.cwd(), "src/features/chats/calling/CallFeature.tsx"), "utf8");
const page = readFileSync(resolve(process.cwd(), "src/pages/ChatsPage.tsx"), "utf8");

describe("message archive grouped view", () => {
  it("shows saved local drafts and opens their source chat", () => {
    expect(panel).toContain('window.localStorage.getItem(`stovo:draft:${chat.id}`)');
    expect(panel).toContain('className="archive-quick-list quick-access-draft-list"');
    expect(panel).toContain('onClick={() => onOpenChat(chat)}');
    expect(page).toContain('<QuickAccessPanel accessToken={accessToken} chats={chats}');
  });

  it("keeps the minimized call bar visible over Drafts & scheduled", () => {
    expect(panel).toContain("minimizedCallHeader?: ReactNode");
    expect(panel).toContain("{minimizedCallHeader}");
    expect(page).toContain("<CallFeature />");
    expect(callFeature).toContain("createPortal(callUiWithContext, document.body)");
    expect(page).toContain("setIsDraftsAndScheduledOpen(false)");
    expect(callFeature).toContain("<MinimizedCallBar");
    expect(callFeature).toContain("visible={effectiveIsCallMinimized}");
  });

  it("loads scheduled messages from the outbox instead of showing a placeholder", () => {
    expect(panel).toContain('getOutboxMessages(currentUserId)');
    expect(panel).toContain('message.status === "scheduled" || Boolean(message.scheduledFor)');
    expect(panel).toContain('className="archive-quick-list quick-access-scheduled-list"');
    expect(panel).toContain('key={message.id}');
  });

  it("keeps archive view controls in the same visual position outside the grouped panel", () => {
    expect(panel).toContain("quick-access-panel-tabs--archive-controls");
  });

  it("aligns Drafts & scheduled tabs with the archive controls", () => {
    const styles = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");
    expect(styles).toMatch(/\.quick-access-panel--outbox \.quick-access-panel-tabs\s*\{[^}]*margin-left:\s*0;[^}]*margin-top:\s*0;/);
  });

  it("keeps quick-access sidebar hover on the shared chat-row surface", () => {
    const styles = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");
    expect(styles).toMatch(/\.chat-list-item:hover:not\(:disabled\)\s*\{[^}]*background:\s*color-mix\(in oklab, var\(--background-panel-accent\) 60%, transparent\);/);
  });

  it("lists archive-origin groups rather than unrelated recently active chats", () => {
    expect(panel).toContain("getMessageArchiveGroups(accessToken)");
    expect(panel).toContain("My Notes");
    expect(panel).not.toContain("chat.lastMessageContent");
    expect(panel).toContain('onOpenGroup("notes")');
    expect(panel).toContain('<button type="button" className="chat-list-item"');
    expect(panel).toContain('<FileText size={20} />');
    expect(panel).toContain('chatAvatarFile(sourceChat, currentUserId)');
    expect(page).toContain("archiveGroup=${encodeURIComponent(group)}");
    expect(page).toContain('messageArchiveView === "grouped" && !archiveGroup');
  });

  it("uses the archive fallback icon and standard chat title spacing in the grouped archive header", () => {
    expect(panel).toContain('<Archive aria-hidden className="avatar-fallback-svg" size={24} strokeWidth={1.75} />');
  });

  it("renders mobile back buttons and enables detail view when drafts & scheduled is active", () => {
    expect(panel).toContain('onBack && <BackButton className="mobile-back-button" ariaLabel="Back to chats" onClick={onBack} />');
    expect(page).toContain("const hasActiveChat = Boolean(chatId || isDraftsAndScheduledOpen);");
    expect(page).toContain('hasActiveChat ? "has-active-chat" : "chat-list-view"');
  });

  it("styles quick access buttons with a dark header-like surface and clear non-accent active text", () => {
    const styles = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");
    expect(styles).toContain("background: color-mix(in oklab, var(--island-surface) 94%, transparent);");
    expect(styles).toContain(".quick-access-panel-tabs button.active");
    expect(styles).toMatch(/\.quick-access-panel-tabs button\.active\s*\{[^}]*\scolor:\s*#ffffff;/);
    expect(styles).not.toMatch(/\.quick-access-panel-tabs button\.active\s*\{[^}]*\scolor:\s*var\(--accent-primary\);/);
  });

  it("elevates quick access panels and grouped tabs above chat-detail edge shadows", () => {
    const styles = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");
    expect(styles).toMatch(/\.messenger-shell\.has-active-chat \.chat-detail > \.quick-access-panel\s*\{[^}]*z-index:\s*2;/);
    expect(styles).toMatch(/\.chat-detail:has\(\.quick-access-panel\)::after\s*\{[^}]*display:\s*none;/);
    expect(styles).toMatch(/\.quick-access-panel-tabs button\s*\{[^}]*box-shadow:\s*0 2px 8px/);
  });
});
