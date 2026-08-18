import { act } from "react";
import { createRoot, Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MessageBubble } from "./MessageBubble";
import type { Chat, Message } from "../../../api/chats";
import { clearMediaBlobCache, peekCachedObjectUrl, seedMediaBlobCache } from "../../../mediaBlobCache";
import useFilePreviewUrl from "../../../hooks/useFilePreviewUrl";
import { buildAudioSourceFactory } from "../shared/audioSourceFactory";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mountedRoots: Root[] = [];

beforeEach(() => {
  clearMediaBlobCache();
});

afterEach(() => {
  while (mountedRoots.length > 0) {
    const root = mountedRoots.pop();
    act(() => {
      root?.unmount();
    });
  }
  document.body.innerHTML = "";
  clearMediaBlobCache();
});

function createMockChat(overrides: Partial<Chat> = {}): Chat {
  return {
    id: "chat-1",
    familyId: "fam-1",
    type: "direct",
    title: "Direct Chat",
    description: null,
    isEncrypted: false,
    encryptionProtocol: "legacy_plaintext",
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
      { id: "user-1", displayName: "Me", role: "admin", joinedAt: "2026-08-17T10:00:00.000Z" },
      { id: "user-2", displayName: "Friend", role: "member", joinedAt: "2026-08-17T10:00:00.000Z" }
    ],
    ...overrides
  };
}

describe("Instant attachment preview in chat for unsent/pending messages", () => {
  it("renders instant image preview in pending message before it is sent to server", () => {
    const localFileId = "local:client-msg-123";
    const sampleBlob = new Blob(["test-image-binary-data"], { type: "image/png" });
    const cachedUrl = seedMediaBlobCache(localFileId, sampleBlob);

    const pendingMessage: Message = {
      id: "pending:client-msg-123",
      chatId: "chat-1",
      senderId: "user-1",
      senderDisplayName: "Me",
      type: "image",
      content: null,
      encryptionProtocol: "legacy_plaintext",
      ciphertext: null,
      nonce: null,
      keyVersion: null,
      encryptionMetadata: null,
      replyToMessageId: null,
      threadRootMessageId: null,
      messageKind: "chat",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
      isEdited: false,
      forwardedFrom: null,
      statuses: [{ userId: "user-1", status: "sent", createdAt: new Date().toISOString() }],
      reactions: [],
      attachments: [
        {
          id: localFileId,
          familyId: "",
          uploadedBy: "user-1",
          chatId: "chat-1",
          chatTitle: null,
          chatType: "direct",
          originMessageId: null,
          accessScope: "chat",
          storageProvider: "local",
          originalName: "photo.png",
          mimeType: "image/png",
          sizeBytes: 1024,
          checksum: null,
          createdAt: new Date().toISOString(),
          deletedAt: null,
          isFavorite: false
        }
      ],
      clientMessageId: "client-msg-123",
      deliveryState: "sending"
    };

    const chat = createMockChat();
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    mountedRoots.push(root);

    act(() => {
      root.render(
        <MessageBubble
          message={pendingMessage}
          previousMessage={undefined}
          currentUserId="user-1"
          selectedChat={chat}
          chats={[chat]}
          messages={[pendingMessage]}
          memberLookup={new Map([["user-1", { displayName: "Me" }]])}
          accessToken="token-abc"
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

    const img = container.querySelector("img");
    expect(img).toBeDefined();
    expect(img?.src).toBe(cachedUrl);
  });

  it("renders instant video preview in pending message before it is sent to server", () => {
    const localFileId = "local:client-video-456";
    const sampleBlob = new Blob(["test-video-binary-data"], { type: "video/mp4" });
    const cachedUrl = seedMediaBlobCache(localFileId, sampleBlob);

    const pendingMessage: Message = {
      id: "pending:client-video-456",
      chatId: "chat-1",
      senderId: "user-1",
      senderDisplayName: "Me",
      type: "video",
      content: null,
      encryptionProtocol: "legacy_plaintext",
      ciphertext: null,
      nonce: null,
      keyVersion: null,
      encryptionMetadata: null,
      replyToMessageId: null,
      threadRootMessageId: null,
      messageKind: "chat",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
      isEdited: false,
      forwardedFrom: null,
      statuses: [{ userId: "user-1", status: "sent", createdAt: new Date().toISOString() }],
      reactions: [],
      attachments: [
        {
          id: localFileId,
          familyId: "",
          uploadedBy: "user-1",
          chatId: "chat-1",
          chatTitle: null,
          chatType: "direct",
          originMessageId: null,
          accessScope: "chat",
          storageProvider: "local",
          originalName: "clip.mp4",
          mimeType: "video/mp4",
          sizeBytes: 4096,
          checksum: null,
          createdAt: new Date().toISOString(),
          deletedAt: null,
          isFavorite: false
        }
      ],
      clientMessageId: "client-video-456",
      deliveryState: "sending"
    };

    const chat = createMockChat();
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    mountedRoots.push(root);

    act(() => {
      root.render(
        <MessageBubble
          message={pendingMessage}
          previousMessage={undefined}
          currentUserId="user-1"
          selectedChat={chat}
          chats={[chat]}
          messages={[pendingMessage]}
          memberLookup={new Map([["user-1", { displayName: "Me" }]])}
          accessToken="token-abc"
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

    const video = container.querySelector("video");
    expect(video).toBeDefined();
    expect(video?.getAttribute("src")).toBe(cachedUrl);
  });

  it("useFilePreviewUrl hook immediately returns cached blob url for local attachments without network", () => {
    const localId = "local:attachment-789";
    const sampleBlob = new Blob(["photo-data"], { type: "image/jpeg" });
    const cachedUrl = seedMediaBlobCache(localId, sampleBlob);

    let resultUrl: string | null = null;
    function TestComponent() {
      resultUrl = useFilePreviewUrl(null, {
        id: localId,
        familyId: "",
        uploadedBy: "u-1",
        chatId: "c-1",
        chatTitle: null,
        chatType: "direct",
        originMessageId: null,
        accessScope: "chat",
        storageProvider: "local",
        originalName: "test.jpg",
        mimeType: "image/jpeg",
        sizeBytes: 100,
        checksum: null,
        createdAt: new Date().toISOString(),
        deletedAt: null,
        isFavorite: false
      });
      return <div>{resultUrl}</div>;
    }

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    mountedRoots.push(root);

    act(() => {
      root.render(<TestComponent />);
    });

    expect(resultUrl).toBe(cachedUrl);
    expect(container.textContent).toBe(cachedUrl);
  });

  it("buildAudioSourceFactory instantly returns cached URL for local voice / audio messages", async () => {
    const localId = "local:voice-999";
    const audioBlob = new Blob(["audio-data"], { type: "audio/webm" });
    const cachedUrl = seedMediaBlobCache(localId, audioBlob);

    const factory = buildAudioSourceFactory("");
    const source = await factory({
      identity: { chatId: "chat-1", messageId: "msg-1", fileId: localId },
      title: "voice-1.webm",
      mimeType: "audio/webm"
    });

    expect(source.url).toBe(cachedUrl);
  });
});
