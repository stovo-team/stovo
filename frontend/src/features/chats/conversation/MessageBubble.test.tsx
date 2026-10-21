import { readFileSync } from "node:fs";
import { act } from "react";
import { createRoot, Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MessageBubble } from "./MessageBubble";
import type { Chat, Message } from "../../../api/chats";

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
    id: "chat-archive",
    familyId: "fam-1",
    type: "archive",
    title: "Message Archive",
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
    members: [{ id: "user-1", displayName: "Self", role: "admin", joinedAt: "2026-08-17T10:00:00.000Z" }],
    ...overrides
  };
}

function createMockMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: "msg-1",
    chatId: "chat-archive",
    senderId: "user-1",
    senderDisplayName: "Self",
    type: "text",
    content: "Saved note to self",
    encryptionProtocol: "server_at_rest",
    ciphertext: null,
    nonce: null,
    keyVersion: null,
    encryptionMetadata: null,
    replyToMessageId: null,
    threadRootMessageId: null,
    messageKind: "chat",
    commentCount: 0,
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

function renderBubble(message: Message, currentUserId = "user-1", chat = createMockChat()): HTMLDivElement {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  mountedRoots.push(root);

  act(() => {
    root.render(
      <MessageBubble
        message={message}
        previousMessage={undefined}
        currentUserId={currentUserId}
        selectedChat={chat}
        chats={[chat]}
        messages={[message]}
        memberLookup={new Map([["user-1", { displayName: "Self" }]])}
        accessToken="token-123"
        videoAutoplay={false}
        renderMarkdown={false}
        callActive={false}
        isMessageSelectionMode={false}
        isSelected={false}
        swipeReplyState={null}
        threadReplyCount={0}
        onBubbleClick={vi.fn()}
        onContextMenu={vi.fn()}
        onSwipePointerDown={vi.fn()}
        onSwipePointerMove={vi.fn()}
        onSwipePointerUp={vi.fn()}
        onSwipePointerCancel={vi.fn()}
        onOpenImage={vi.fn()}
        onFocusRepliedMessage={vi.fn()}
        onOpenOriginChat={vi.fn()}
        onReact={vi.fn()}
        onOpenThread={vi.fn()}
      />
    );
  });

  return container;
}

describe("MessageBubble receipt status", () => {
  it("shows comment count, two commenter avatars, overflow and a trailing comment action", () => {
    const message = createMockMessage();
    const replies = ["user-1", "user-2", "user-3"].map((senderId, index) => createMockMessage({ id: `reply-${index}`, senderId, messageKind: "thread", threadRootMessageId: message.id }));
    const host = renderBubble(message, "user-1", createMockChat({ type: "group" }), replies);
    const action = host.querySelector(".thread-open-button")!;
    expect(action.getAttribute("aria-label")).toBe("3 comments");
    expect(action.querySelector(".lucide-message-circle")).not.toBeNull();
    expect(action.querySelector(".thread-summary-count")?.textContent).toBe("3");
    expect(action.querySelectorAll(".thread-summary-avatar")).toHaveLength(2);
    expect(action.querySelector(".thread-summary-overflow")?.textContent).toBe("+");
    expect(action.textContent).toContain("Comment");
    expect(action.querySelector(".lucide-chevron-right")).not.toBeNull();
  });

  it("renders reaction users through the standard round avatar component", () => {
    const host = renderBubble(createMockMessage({ reactions: [{ emoji: "👍", count: 1, userIds: ["user-1"], reacted: true }] }));
    expect(host.querySelector(".reaction-avatar.avatar .avatar-initials")?.textContent).toBe("SE");
  });

  it("shows two reaction avatars and a remainder badge when more than three people reacted", () => {
    const userIds = ["user-1", "user-2", "user-3", "user-4", "user-5"];
    const chat = createMockChat({
      type: "group",
      members: userIds.map((id) => ({ id, displayName: id, role: "member", joinedAt: "2026-08-17T10:00:00.000Z" }))
    });
    const host = renderBubble(createMockMessage({ reactions: [{ emoji: "👍", count: 5, userIds, reacted: true }] }), "user-1", chat);

    expect(host.querySelectorAll(".avatar.reaction-avatar")).toHaveLength(2);
    expect(host.querySelector(".reaction-avatar-more")?.textContent).toBe("+3");
  });

  it("keeps profile-photo reaction avatars transparent and compact", () => {
    const css = readFileSync("src/styles.css", "utf8");
    const photoAvatar = css.match(/\.reaction-avatar:has\(img\)\s*\{([^}]*)\}/)?.[1] ?? "";
    expect(photoAvatar).toMatch(/background:\s*transparent/);
    expect(photoAvatar).toMatch(/padding:\s*0/);
  });

  it("keeps reaction avatars small and round without composer layout styles", () => {
    const css = readFileSync("src/styles.css", "utf8");
    const stack = css.match(/\.reaction-avatar-stack\s*\{([^}]*)\}/)?.[1] ?? "";
    const avatar = css.match(/\.reaction-avatar\s*\{([^}]*)\}/)?.[1] ?? "";
    expect(stack).not.toContain("--composer-action");
    expect(avatar).toMatch(/border-radius:\s*var\(--radius-circle\)/);
    expect(avatar).toMatch(/width:\s*20px/);
    expect(avatar).toMatch(/height:\s*20px/);
  });

  it("labels an imported message with its source author and provider", () => {
    const message = createMockMessage({
      importAttribution: {
        sourceProvider: "telegram",
        sourceMessageId: "source-message-1",
        sourceAuthorId: "telegram-user-1",
        sourceAuthorName: "Mira"
      }
    });

    const container = renderBubble(message);
    expect(container.querySelector(".message-import-attribution")?.textContent).toContain("Original author: Mira");
    expect(container.querySelector(".message-import-attribution")?.textContent).toContain("Imported from Telegram");
  });

  it("renders a guest meeting card without a redundant label", () => {
    const message = createMockMessage({
      content: 'guest-meeting-card:{"title":"Some meetup","timing":"Starts when the host opens the meeting.","entry":"Anyone with this link can join.","url":"https://example.com/meet"}'
    });
    const container = renderBubble(message, "user-1", createMockChat({ type: "group" }));

    expect(container.querySelector(".guest-meeting-invitation")?.textContent).toContain("Some meetup");
    expect(container.querySelector(".guest-meeting-invitation-label")).toBeNull();
    expect(container.querySelector(".guest-meeting-invitation-join")?.textContent?.trim()).toBe("Join");
    expect(container.querySelector(".guest-meeting-invitation-plan")?.textContent?.trim()).toBe("In Plans");
  });

  it("renders a clock icon when message is in sending state", () => {
    const message = createMockMessage({ deliveryState: "sending" });
    const container = renderBubble(message);

    const clock = container.querySelector(".message-receipt--sending");
    expect(clock).not.toBeNull();
    const sentCheckmark = container.querySelector("svg.message-receipt--sent");
    expect(sentCheckmark).toBeNull();
  });

  it("renders a single checkmark when message is delivered to server (sent) in saved messages", () => {
    const message = createMockMessage({ statuses: [] });
    const container = renderBubble(message);

    const clock = container.querySelector(".message-receipt--sending");
    expect(clock).toBeNull();
    const checkmarkSvg = container.querySelector("svg.message-receipt--sent");
    expect(checkmarkSvg).not.toBeNull();
    const paths = checkmarkSvg?.querySelectorAll("path");
    expect(paths?.length).toBe(1);
    expect(checkmarkSvg?.getAttribute("aria-label")).toBe("sent message");
  });

  it("renders a double checkmark when message is delivered to recipient", () => {
    const message = createMockMessage({
      statuses: [{ userId: "user-2", status: "delivered", createdAt: "2026-08-17T10:06:00.000Z" }]
    });
    const container = renderBubble(message);

    const checkmarkSvg = container.querySelector("svg.message-receipt--delivered");
    expect(checkmarkSvg).not.toBeNull();
    const paths = checkmarkSvg?.querySelectorAll("path");
    expect(paths?.length).toBe(2);
    expect(checkmarkSvg?.getAttribute("aria-label")).toBe("delivered message");
  });

  it("renders a double checkmark when message is read by recipient", () => {
    const message = createMockMessage({
      statuses: [{ userId: "user-2", status: "read", createdAt: "2026-08-17T10:06:00.000Z" }]
    });
    const container = renderBubble(message);

    const checkmarkSvg = container.querySelector("svg.message-receipt--read");
    expect(checkmarkSvg).not.toBeNull();
    const paths = checkmarkSvg?.querySelectorAll("path");
    expect(paths?.length).toBe(2);
    expect(checkmarkSvg?.getAttribute("aria-label")).toBe("read message");
  });

  it("does not render receipt icons for incoming messages from other users", () => {
    const message = createMockMessage({ senderId: "user-2", statuses: [] });
    const container = renderBubble(message, "user-1");

    const receipt = container.querySelector(".message-receipt");
    expect(receipt).toBeNull();
  });

  it("renders a persistent singular comment label when threadReplyCount is 1", () => {
    const onOpenThread = vi.fn();
    const message = createMockMessage();
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    mountedRoots.push(root);

    const chat = createMockChat({ type: "direct" });
    act(() => {
      root.render(
        <MessageBubble
          message={message}
          previousMessage={undefined}
          currentUserId="user-1"
          selectedChat={chat}
          chats={[chat]}
          messages={[message]}
          memberLookup={new Map([["user-1", { displayName: "Self" }]])}
          accessToken="token-123"
          videoAutoplay={false}
          renderMarkdown={false}
          callActive={false}
          isMessageSelectionMode={false}
          isSelected={false}
          swipeReplyState={null}
          threadReplyCount={1}
          onBubbleClick={vi.fn()}
          onContextMenu={vi.fn()}
          onSwipePointerDown={vi.fn()}
          onSwipePointerMove={vi.fn()}
          onSwipePointerUp={vi.fn()}
          onSwipePointerCancel={vi.fn()}
          onOpenImage={vi.fn()}
          onFocusRepliedMessage={vi.fn()}
          onOpenOriginChat={vi.fn()}
          onReact={vi.fn()}
          onOpenThread={onOpenThread}
        />
      );
    });

    const threadButton = container.querySelector(".thread-open-button");
    expect(threadButton).not.toBeNull();
    expect(threadButton?.textContent?.trim()).toBe("1 comment");

    act(() => {
      threadButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onOpenThread).toHaveBeenCalledWith(message);
  });

  it("renders plural comments label when threadReplyCount is > 1", () => {
    const message = createMockMessage();
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    mountedRoots.push(root);

    const chat = createMockChat({ type: "group" });
    act(() => {
      root.render(
        <MessageBubble
          message={message}
          previousMessage={undefined}
          currentUserId="user-1"
          selectedChat={chat}
          chats={[chat]}
          messages={[message]}
          memberLookup={new Map([["user-1", { displayName: "Self" }]])}
          accessToken="token-123"
          videoAutoplay={false}
          renderMarkdown={false}
          callActive={false}
          isMessageSelectionMode={false}
          isSelected={false}
          swipeReplyState={null}
          threadReplyCount={3}
          onBubbleClick={vi.fn()}
          onContextMenu={vi.fn()}
          onSwipePointerDown={vi.fn()}
          onSwipePointerMove={vi.fn()}
          onSwipePointerUp={vi.fn()}
          onSwipePointerCancel={vi.fn()}
          onOpenImage={vi.fn()}
          onFocusRepliedMessage={vi.fn()}
          onOpenOriginChat={vi.fn()}
          onReact={vi.fn()}
          onOpenThread={vi.fn()}
        />
      );
    });

    const threadButton = container.querySelector(".thread-open-button");
    expect(threadButton).not.toBeNull();
    expect(threadButton?.textContent?.trim()).toBe("3 comments");
  });

  it("does not render a comments button when threadReplyCount is 0", () => {
    const message = createMockMessage();
    const container = renderBubble(message, "user-1", createMockChat({ type: "group" }));

    expect(container.querySelector(".thread-open-button")).toBeNull();
  });

  it("does not render a comments button beneath a comment", () => {
    const message = createMockMessage({ messageKind: "thread", threadRootMessageId: "root-1" });
    const container = renderBubble(message, "user-1", createMockChat({ type: "group" }));

    expect(container.querySelector(".thread-open-button")).toBeNull();
  });
});
