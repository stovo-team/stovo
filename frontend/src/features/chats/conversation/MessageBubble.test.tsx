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

  it("renders a zero-comments button for a root message", () => {
    const message = createMockMessage();
    const container = renderBubble(message, "user-1", createMockChat({ type: "group" }));

    expect(container.querySelector(".thread-open-button")?.textContent?.trim()).toBe("0 comments");
  });

  it("does not render a comments button beneath a comment", () => {
    const message = createMockMessage({ messageKind: "thread", threadRootMessageId: "root-1" });
    const container = renderBubble(message, "user-1", createMockChat({ type: "group" }));

    expect(container.querySelector(".thread-open-button")).toBeNull();
  });
});
