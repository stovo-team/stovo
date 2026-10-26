import { readCssSource } from "../../../test/cssSource";
import { act } from "react";
import { createRoot, Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MessageBubble } from "./MessageBubble";
import type { Chat, Message } from "../../../api/chats";
import { englishStrings, russianStrings } from "../../../config/strings";

const mountedRoots: Root[] = [];
const conversationStyles = readCssSource("src/styles.css");

afterEach(() => {
  while (mountedRoots.length > 0) {
    const root = mountedRoots.pop();
    act(() => {
      root?.unmount();
    });
  }
  document.body.innerHTML = "";
});

describe("mobile canvas message preview sizing", () => {
  it("keeps the desktop preview wide and caps the phone preview at 280 by 120 pixels", () => {
    const desktopCardRule = conversationStyles.match(/\.message-bubble:has\(\.canvas-card-bubble\)\s*\{([^}]*)\}/)?.[1] ?? "";
    const mobileCardRule = Array.from(conversationStyles.matchAll(/\.message-bubble:has\(\.canvas-card-bubble\)\s*\{([^}]*)\}/g)).at(-1)?.[1] ?? "";
    const mobilePreviewRule = Array.from(conversationStyles.matchAll(/\.canvas-card-bubble-preview\s*\{([^}]*)\}/g)).at(-1)?.[1] ?? "";

    expect(desktopCardRule).toMatch(/max-width:\s*min\(560px, calc\(100vw - 48px\)\)/);
    expect(mobileCardRule).toMatch(/max-width:\s*min\(280px, calc\(100vw - 48px\)\)/);
    expect(mobilePreviewRule).toMatch(/max-height:\s*120px/);
  });
});

describe("guest meeting invitation visual hierarchy", () => {
  it("uses a plain message surface with readable text and a clear primary action", () => {
    const invitationRule = conversationStyles.match(/\.guest-meeting-invitation\s*\{([^}]*)\}/)?.[1] ?? "";
    const outgoingRule = conversationStyles.match(/\.message-bubble\.mine \.guest-meeting-invitation\s*\{([^}]*)\}/)?.[1] ?? "";
    const copyRule = conversationStyles.match(/\.guest-meeting-invitation-copy\s*\{([^}]*)\}/)?.[1] ?? "";
    const joinRule = conversationStyles.match(/\.guest-meeting-invitation-join\s*\{([^}]*)\}/)?.[1] ?? "";
    const outgoingJoinRule = conversationStyles.match(/\.message-bubble\.mine \.guest-meeting-invitation-join\s*\{([^}]*)\}/)?.[1] ?? "";
    const planRule = conversationStyles.match(/\.guest-meeting-invitation-plan\s*\{([^}]*)\}/)?.[1] ?? "";

    expect(invitationRule).toMatch(/background:\s*transparent/);
    expect(invitationRule).toMatch(/border:\s*0/);
    expect(invitationRule).toMatch(/padding:\s*0/);
    expect(outgoingRule).toMatch(/background:\s*transparent/);
    expect(copyRule).toMatch(/color:\s*var\(--text-primary\)/);
    expect(joinRule).toMatch(/background:\s*var\(--accent-primary\)/);
    expect(joinRule).toMatch(/border-radius:\s*var\(--radius-pill\)/);
    expect(outgoingJoinRule).toMatch(/background:\s*var\(--color-palette-f2074b6cef37\)/);
    expect(joinRule).toMatch(/min-height:\s*44px/);
    expect(planRule).toMatch(/background:\s*var\(--color-palette-db0c497d2782\)/);
    expect(planRule).toMatch(/border-radius:\s*var\(--radius-pill\)/);
  });
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

function renderBubble(
  message: Message,
  currentUserId = "user-1",
  chat = createMockChat(),
  messages: Message[] = [message],
  threadReplyCount = 0
): HTMLDivElement {
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
        messages={messages}
        memberLookup={new Map([["user-1", { displayName: "Self" }]])}
        accessToken="token-123"
        videoAutoplay={false}
        renderMarkdown={false}
        callActive={false}
        isMessageSelectionMode={false}
        isSelected={false}
        swipeReplyState={null}
        threadReplyCount={threadReplyCount}
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
  it("uses singular, plural, and Russian comment words", () => {
    expect(englishStrings.comments.count(1)).toBe("1 comment");
    expect(englishStrings.comments.count(2)).toBe("2 comments");
    expect(russianStrings.comments.count(1)).toBe("1 комментарий");
    expect(russianStrings.comments.count(2)).toBe("2 комментария");
    expect(russianStrings.comments.count(5)).toBe("5 комментариев");
    expect(russianStrings.comments.count(11)).toBe("11 комментариев");
    expect(russianStrings.comments.count(21)).toBe("21 комментарий");
  });

  it("shows commenter avatars at the left, a text comment count, and a right-aligned arrow", () => {
    const message = createMockMessage();
    const replies = ["user-1", "user-2", "user-3"].map((senderId, index) => createMockMessage({ id: `reply-${index}`, senderId, messageKind: "thread", threadRootMessageId: message.id }));
    const host = renderBubble(message, "user-1", createMockChat({ type: "group" }), [message, ...replies], replies.length);
    const action = host.querySelector(".thread-open-button")!;
    expect(action.getAttribute("aria-label")).toBe("3 comments");
    expect(action.querySelector(".lucide-message-circle")).toBeNull();
    expect(action.querySelector(".thread-summary-count")?.textContent).toBe("3");
    expect(action.querySelector(".thread-summary-label")?.textContent).toBe("comments");
    expect(action.querySelectorAll(".thread-summary-avatar")).toHaveLength(2);
    expect(action.querySelector(".thread-summary-overflow")?.textContent).toBe("+");
    expect(action.querySelector(".lucide-chevron-right")).not.toBeNull();
    expect(Array.from(action.children).map((child) => child.classList[0])).toEqual([
      "thread-summary-avatars",
      "thread-summary-count",
      "thread-summary-label",
      "lucide"
    ]);

    const css = readCssSource("src/styles.css");
    const arrow = css.match(/\.thread-open-button\s*>\s*\.lucide-chevron-right\s*\{([^}]*)\}/)?.[1] ?? "";
    const avatar = css.match(/\.thread-summary-avatars\s+\.thread-summary-avatar\s*\{([^}]*)\}/)?.[1] ?? "";
    const button = css.match(/\.thread-open-button\s*\{([^}]*)\}/)?.[1] ?? "";
    const countLabel = css.match(/\.thread-summary-count\s*\+\s*\.thread-summary-label\s*\{([^}]*)\}/)?.[1] ?? "";
    expect(arrow).toMatch(/margin-left:\s*auto/);
    expect(avatar).toMatch(/border:\s*0/);
    expect(button).toMatch(/font-size:\s*inherit/);
    expect(button).toMatch(/font-family:\s*inherit/);
    expect(button).toMatch(/font-weight:\s*inherit/);
    expect(countLabel).toMatch(/margin-left:\s*-3px/);
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
    const css = readCssSource("src/styles.css");
    const photoAvatar = css.match(/\.reaction-avatar:has\(img\)\s*\{([^}]*)\}/)?.[1] ?? "";
    expect(photoAvatar).toMatch(/background:\s*transparent/);
    expect(photoAvatar).toMatch(/padding:\s*0/);
  });

  it("keeps reaction avatars small and round without composer layout styles", () => {
    const css = readCssSource("src/styles.css");
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

  it("keeps the accessible singular label while displaying only the count", () => {
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
    expect(threadButton?.getAttribute("aria-label")).toBe("1 comment");
    expect(threadButton?.querySelector(".thread-summary-count")?.textContent).toBe("1");
    expect(threadButton?.querySelector(".thread-summary-label")?.textContent).toBe("comment");

    act(() => {
      threadButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onOpenThread).toHaveBeenCalledWith(message);
  });

  it("renders the visible plural comment label", () => {
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
    expect(threadButton?.getAttribute("aria-label")).toBe("3 comments");
    expect(threadButton?.querySelector(".thread-summary-count")?.textContent).toBe("3");
    expect(threadButton?.querySelector(".thread-summary-label")?.textContent).toBe("comments");
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
