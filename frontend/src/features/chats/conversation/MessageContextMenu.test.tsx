import { act } from "react";
import { createRoot, Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MessageContextMenu } from "./MessageContextMenu";
import type { Chat, Message } from "../../../api/chats";
import type { User } from "../../../api/auth";

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

function createMockChat(overrides: Partial<Chat> = {}): Chat {
  return {
    id: "chat-1",
    familyId: "fam-1",
    type: "direct",
    title: "Direct Chat",
    description: null,
    isEncrypted: false,
    encryptionProtocol: "server_at_rest",
    mediaVisibility: "members",
    isPinned: false,
    isFavorite: false,
    unreadCount: 0,
    commentsEnabled: true,
    myMediaVisibilityApproval: false,
    createdBy: "user-1",
    createdAt: "2026-08-17T10:00:00.000Z",
    updatedAt: "2026-08-17T10:00:00.000Z",
    members: [
      { id: "user-1", displayName: "User 1", role: "member", joinedAt: "2026-08-17T10:00:00.000Z" },
      { id: "user-2", displayName: "User 2", role: "member", joinedAt: "2026-08-17T10:00:00.000Z" }
    ],
    ...overrides
  };
}

function createMockMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: "msg-1",
    chatId: "chat-1",
    senderId: "user-2",
    senderDisplayName: "User 2",
    type: "text",
    content: "Hello world",
    encryptionProtocol: "server_at_rest",
    ciphertext: null,
    nonce: null,
    keyVersion: null,
    encryptionMetadata: null,
    replyToMessageId: null,
    threadRootMessageId: null,
    messageKind: "chat",
    createdAt: "2026-08-17T10:05:00.000Z",
    updatedAt: "2026-08-17T10:05:00.000Z",
    deletedAt: null,
    isEdited: false,
    forwardedFrom: null,
    statuses: [],
    reactions: [],
    attachments: [],
    ...overrides
  };
}

const mockUser: User = {
  id: "user-1",
  username: "user1",
  displayName: "User 1",
  role: "member",
  familyId: "fam-1",
  isMasterAdmin: false,
  statusEmoji: null,
  statusText: null,
  statusExpiresAt: null
};

describe("MessageContextMenu commenting and replying", () => {
  it("renders both Comment and Reply buttons in direct and group chats", () => {
    const onComment = vi.fn();
    const onReply = vi.fn();
    const message = createMockMessage();
    const chat = createMockChat({ type: "group" });

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    mountedRoots.push(root);

    act(() => {
      root.render(
        <MessageContextMenu
          menu={{ message, x: 100, y: 100 }}
          currentUser={mockUser}
          selectedChat={chat}
          channelCommentsDisabledForViewer={false}
          isInThreadMode={false}
          isPinned={false}
          seenBy={[]}
          onReact={vi.fn()}
          onReply={onReply}
          onComment={onComment}
          onCopy={vi.fn()}
          onTogglePin={vi.fn()}
          onForward={vi.fn()}
          onArchive={vi.fn()}
          onEdit={vi.fn()}
          onDelete={vi.fn()}
        />
      );
    });

    const buttons = Array.from(container.querySelectorAll("button[role='menuitem']"));
    const buttonTexts = buttons.map((b) => b.textContent?.trim());

    expect(buttonTexts).toContain("Comment");
    expect(buttonTexts).toContain("Reply");
    expect((container.querySelector("[role='menu']") as HTMLElement).style.right).toBe("auto");

    const commentBtn = buttons.find((b) => b.textContent?.trim() === "Comment");
    act(() => {
      commentBtn?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onComment).toHaveBeenCalledTimes(1);

    const replyBtn = buttons.find((b) => b.textContent?.trim() === "Reply");
    act(() => {
      replyBtn?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onReply).toHaveBeenCalledTimes(1);
  });

  it("renders Comment but not main-channel Reply for viewer in channel", () => {
    const onComment = vi.fn();
    const onReply = vi.fn();
    const message = createMockMessage();
    const channel = createMockChat({
      type: "channel",
      createdBy: "admin-user",
      commentsEnabled: true
    });

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    mountedRoots.push(root);

    act(() => {
      root.render(
        <MessageContextMenu
          menu={{ message, x: 100, y: 100 }}
          currentUser={mockUser}
          selectedChat={channel}
          channelCommentsDisabledForViewer={false}
          isInThreadMode={false}
          isPinned={false}
          seenBy={[]}
          onReact={vi.fn()}
          onReply={onReply}
          onComment={onComment}
          onCopy={vi.fn()}
          onTogglePin={vi.fn()}
          onForward={vi.fn()}
          onArchive={vi.fn()}
          onEdit={vi.fn()}
          onDelete={vi.fn()}
        />
      );
    });

    const buttons = Array.from(container.querySelectorAll("button[role='menuitem']"));
    const buttonTexts = buttons.map((b) => b.textContent?.trim());

    expect(buttonTexts).toContain("Comment");
    expect(buttonTexts).not.toContain("Reply");
  });

  it("does not render Comment button when already inside thread mode", () => {
    const onComment = vi.fn();
    const onReply = vi.fn();
    const message = createMockMessage();
    const chat = createMockChat({ type: "direct" });

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    mountedRoots.push(root);

    act(() => {
      root.render(
        <MessageContextMenu
          menu={{ message, x: 100, y: 100 }}
          currentUser={mockUser}
          selectedChat={chat}
          channelCommentsDisabledForViewer={false}
          isInThreadMode={true}
          isPinned={false}
          seenBy={[]}
          onReact={vi.fn()}
          onReply={onReply}
          onComment={onComment}
          onCopy={vi.fn()}
          onTogglePin={vi.fn()}
          onForward={vi.fn()}
          onArchive={vi.fn()}
          onEdit={vi.fn()}
          onDelete={vi.fn()}
        />
      );
    });

    const buttons = Array.from(container.querySelectorAll("button[role='menuitem']"));
    const buttonTexts = buttons.map((b) => b.textContent?.trim());

    expect(buttonTexts).not.toContain("Comment");
    expect(buttonTexts).toContain("Reply");
  });
});

describe("structured message copy action", () => {
  it.each(["canvas", "checklist"] as const)("does not offer Copy for a %s card", (type) => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    mountedRoots.push(root);
    act(() => root.render(<MessageContextMenu
      menu={{ message: createMockMessage({ type, content: `${type}:internal-id` }), x: 100, y: 100 }}
      currentUser={mockUser} selectedChat={createMockChat()} channelCommentsDisabledForViewer={false}
      isInThreadMode={false} isPinned={false} seenBy={[]}
      onReact={vi.fn()} onReply={vi.fn()} onComment={vi.fn()} onCopy={vi.fn()} onTogglePin={vi.fn()}
      onForward={vi.fn()} onArchive={vi.fn()} onEdit={vi.fn()} onDelete={vi.fn()}
    />));
    expect(Array.from(container.querySelectorAll('[role="menuitem"]')).map((node) => node.textContent?.trim())).not.toContain("Copy");
  });
});
