import { act, createRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockStrings = vi.hoisted(() => ({ useStrings: vi.fn() }));

import { russianStrings, strings } from "../../../config/strings";
import * as unfurlApi from "../../../api/unfurl";
import type { FamilyFile } from "../../../api/files";
import type { Chat } from "../../../api/chats";
import useFilePreviewUrl from "../../../hooks/useFilePreviewUrl";
import { ChatDetailsPanel, SharedContentThumb } from "./ChatDetailsPanel";
import { AddPeopleDialog } from "./AddPeopleDialog";

vi.mock("../../../hooks/useFilePreviewUrl", () => ({ default: vi.fn() }));
vi.mock("../../../auth/AuthContext", () => ({
  useAuth: () => ({ authRequest: vi.fn().mockResolvedValue({ active_plugins: [] }) })
}));
vi.mock("../../../i18n/LanguageContext", () => ({ useStrings: mockStrings.useStrings }));
vi.mock("../sidebar/RealAvatar", () => ({ RealAvatar: () => null }));
vi.mock("../../../components/BackButton", () => ({ BackButton: () => <button type="button">Back</button> }));
vi.mock("../../../components/ChatStatsDrawer", () => ({ default: () => null }));
vi.mock("../../../components/AvatarEditorModal", () => ({ AvatarEditorModal: () => null }));
vi.mock("../../../components/ChatWallpaperEditorModal", () => ({ ChatWallpaperEditorModal: () => null }));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const roots: Root[] = [];
const onFocusMessage = vi.fn();

function render(element: React.ReactNode) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);
  act(() => root.render(element));
  return container;
}

function makeFile(id: string, originalName: string, mimeType: string): FamilyFile {
  return {
    id,
    familyId: "family-1",
    uploadedBy: "user-1",
    chatId: "chat-1",
    chatTitle: "Example chat",
    chatType: "group",
    originMessageId: "message-source",
    accessScope: "chat",
    storageProvider: "local",
    originalName,
    mimeType,
    sizeBytes: 128,
    checksum: null,
    createdAt: "2026-01-01T00:00:00Z",
    deletedAt: null,
    isFavorite: false
  };
}

const chat: Chat = {
  id: "chat-1",
  familyId: "family-1",
  type: "family",
  title: "Example chat",
  createdBy: "user-1",
  mediaVisibility: "family",
  commentsEnabled: true,
  encryptionProtocol: "server_at_rest",
  mediaVisibilityPendingApproval: false,
  mediaVisibilityApprovalCount: 0,
  mediaVisibilityApprovalRequired: 0,
  myMediaVisibilityApproval: false,
  chatPhoto: null,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
  members: [],
  unreadCount: 0,
  lastMessageId: null,
  lastMessageSenderId: null,
  lastMessageSenderDisplayName: null,
  lastMessageContent: null,
  lastMessageType: null,
  lastMessageCreatedAt: null,
  isMuted: false,
  isPinned: false,
  isFavorite: false
};

function renderPanel(detailsTab: "files" | "links", sharedContentItems: any[]) {
  return render(
    <ChatDetailsPanel
      accessToken="test-token"
      chat={chat}
      chatPhotoInputRef={createRef<HTMLInputElement>()}
      chatWallpaperInputRef={createRef<HTMLInputElement>()}
      chatTitleDraft="Example chat"
      canManageChat={false}
      currentUser={null}
      currentUserId={undefined}
      detailsTab={detailsTab}
      isUploading={false}
      sharedContentItems={sharedContentItems}
      wallpaperPreviewUrl={null}
      onChatPhotoSelect={vi.fn()}
      onChatWallpaperSelect={vi.fn()}
      onChatSettingsSubmit={vi.fn()}
      onClose={vi.fn()}
      onCommentsEnabledChange={vi.fn()}
      onDetailsTabChange={vi.fn()}
      onFocusComposer={vi.fn()}
      onFocusMessage={onFocusMessage}
      onMediaVisibilityChange={vi.fn()}
      onOpenImage={vi.fn()}
      onOpenAddPeople={vi.fn()}
      onPinPermissionChange={vi.fn()}
      onMessageDelayChange={vi.fn().mockResolvedValue(true)}
      pendingMessageDelay={null}
      messageDelayStatus={null}
      onPreferenceChange={vi.fn()}
      onTitleDraftChange={vi.fn()}
    />
  );
}

describe("Chat details shared content", () => {
  beforeEach(() => {
    onFocusMessage.mockReset();
    mockStrings.useStrings.mockReturnValue(strings);
    vi.mocked(useFilePreviewUrl).mockReset();
  });

  afterEach(() => {
    act(() => roots.splice(0).forEach((root) => root.unmount()));
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  it("renders a loaded video preview and falls back to its video icon after a media error", () => {
    vi.mocked(useFilePreviewUrl).mockReturnValue("blob:chat-video-preview");
    const file = makeFile("video-1", "clip.mp4", "video/mp4");
    const container = render(
      <SharedContentThumb
        accessToken="test-token"
        file={file}
        onFocusMessage={onFocusMessage}
        onOpenImage={vi.fn()}
      />
    );

    const video = container.querySelector("video") as HTMLVideoElement;
    expect(video).not.toBeNull();
    expect(video.getAttribute("src")).toBe("blob:chat-video-preview");

    act(() => video.dispatchEvent(new Event("error")));
    expect(container.querySelector("video")).toBeNull();
    expect(container.querySelector("button svg")).not.toBeNull();

    act(() => (container.querySelector("button") as HTMLButtonElement).click());
    expect(onFocusMessage).toHaveBeenCalledOnce();
    expect(useFilePreviewUrl).toHaveBeenCalledWith("test-token", file, true, true);
  });

  it("keeps the video icon and source-message action when no preview is available", () => {
    vi.mocked(useFilePreviewUrl).mockReturnValue(null);
    const container = render(
      <SharedContentThumb
        accessToken="test-token"
        file={makeFile("video-no-preview", "missing.mp4", "video/mp4")}
        onFocusMessage={onFocusMessage}
        onOpenImage={vi.fn()}
      />
    );

    expect(container.querySelector("video")).toBeNull();
    expect(container.querySelector("button svg")).not.toBeNull();
    act(() => (container.querySelector("button") as HTMLButtonElement).click());
    expect(onFocusMessage).toHaveBeenCalledOnce();
  });

  it("renders shared-content tabs and the add-participants action in Russian", async () => {
    mockStrings.useStrings.mockReturnValue(russianStrings);
    let panel!: HTMLDivElement;
    await act(async () => { panel = renderPanel("files", []); });
    const tabs = Array.from(panel.querySelectorAll(".chat-info-tab"), (tab) => tab.textContent?.trim());
    expect(tabs).toEqual(["Медиа", "Аудио", "Файлы", "Ссылки"]);

    let dialog!: HTMLDivElement;
    await act(async () => {
      dialog = render(<AddPeopleDialog accessToken={null} members={[]} onAdd={vi.fn()} onClose={vi.fn()} />);
    });
    expect(document.body.textContent).toContain("Добавить участников");
    expect(document.body.textContent).not.toContain("Add people");
  });

  it("renders file names and distinct icons for spreadsheet and archive types", () => {
    const container = renderPanel("files", [
      { kind: "attachment", file: makeFile("sheet", "budget.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"), messageId: "sheet-message" },
      { kind: "attachment", file: makeFile("archive", "photos.zip", "application/zip"), messageId: "archive-message" }
    ]);

    const rows = Array.from(container.querySelectorAll<HTMLButtonElement>(".chat-info-file-row"));
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.querySelector(".chat-info-file-name")?.textContent)).toEqual(["budget.xlsx", "photos.zip"]);
    expect(rows.map((row) => row.querySelector(".chat-info-file-type")?.textContent)).toEqual(["XLSX", "ZIP"]);
    expect(rows[0].querySelector("svg")?.outerHTML).not.toBe(rows[1].querySelector("svg")?.outerHTML);

    act(() => rows[1].click());
    expect(onFocusMessage).toHaveBeenCalledWith("archive-message");
  });

  it("renders OpenGraph details and keeps message-jump and external-link actions separate", async () => {
    const url = "https://chat-preview.test/docs";
    vi.spyOn(unfurlApi, "fetchUnfurlData").mockResolvedValue({
      url,
      title: "Chat documentation",
      description: "Preview description",
      image: "https://chat-preview.test/cover.png",
      siteName: "Chat Preview",
      favicon: null
    });

    let container!: HTMLDivElement;
    await act(async () => {
      container = renderPanel("links", [{ kind: "link", url, messageId: "link-message" }]);
    });

    expect(container.querySelector(".link-unfurl-title")?.textContent).toBe("Chat documentation");
    expect(container.querySelector(".link-unfurl-description")?.textContent).toBe("Preview description");
    expect((container.querySelector(".link-unfurl-image") as HTMLImageElement).src).toBe("https://chat-preview.test/cover.png");

    const titleLink = container.querySelector<HTMLAnchorElement>(".link-unfurl-title")!;
    const openLink = container.querySelector<HTMLAnchorElement>(".chat-info-link-fallback")!;
    expect(titleLink.href).toBe(url);
    expect(titleLink.target).toBe("_blank");
    expect(openLink.href).toBe(url);
    expect(openLink.target).toBe("_blank");

    act(() => container.querySelector<HTMLButtonElement>(".chat-info-link-message")!.click());
    expect(onFocusMessage).toHaveBeenCalledWith("link-message");
  });

  it("keeps the direct URL and message action when OpenGraph fetching rejects", async () => {
    const url = "https://unavailable-preview.test/article";
    vi.spyOn(unfurlApi, "fetchUnfurlData").mockRejectedValue(new Error("preview unavailable"));

    let container!: HTMLDivElement;
    await act(async () => {
      container = renderPanel("links", [{ kind: "link", url, messageId: "fallback-message" }]);
    });

    expect(container.querySelector(".link-unfurl-image")).toBeNull();
    const fallbackLink = container.querySelector<HTMLAnchorElement>(".chat-info-link-fallback-url")!;
    expect(fallbackLink).not.toBeNull();
    expect(fallbackLink.href).toBe(url);
    expect(container.querySelector<HTMLAnchorElement>(".chat-info-link-fallback")?.href).toBe(url);

    act(() => container.querySelector<HTMLButtonElement>(".chat-info-link-message")!.click());
    expect(onFocusMessage).toHaveBeenCalledWith("fallback-message");
  });
});
