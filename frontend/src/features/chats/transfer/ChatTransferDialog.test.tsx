import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  parseChatFile,
  getChatExportSource,
  getFamily,
  commitChatImport,
  decryptMessages,
  encryptMessageContent,
  ensureLocalEncryptionIdentity,
  serializeChatArchive,
  downloadFileBlob,
  currentLanguage
} = vi.hoisted(() => ({
  parseChatFile: vi.fn(),
  getChatExportSource: vi.fn(),
  getFamily: vi.fn(),
  commitChatImport: vi.fn(),
  decryptMessages: vi.fn(),
  encryptMessageContent: vi.fn(),
  ensureLocalEncryptionIdentity: vi.fn(),
  serializeChatArchive: vi.fn(),
  downloadFileBlob: vi.fn(),
  currentLanguage: { value: "en" as "en" | "ru" }
}));

vi.mock("./adapters", () => ({
  CHAT_EXPORT_PROFILES: [
    { providerId: "stovo", profileId: "stovo-chat-archive-v1", formatVersion: "1", compatibility: "stovo_round_trip", knownLosses: [], sideEffects: [], mediaHandling: "embedded" },
    { providerId: "telegram", profileId: "telegram-readable-chat-json-v1", formatVersion: "1", compatibility: "provider_archive", knownLosses: ["Native import is not verified"], sideEffects: [], mediaHandling: "references" }
  ],
  parseChatFile,
  serializeChatArchive
}));
vi.mock("../../../api/chatTransfer", () => ({ getChatExportSource, commitChatImport }));
vi.mock("../../../api/family", () => ({ getFamily }));
vi.mock("../../../api/messageCrypto", () => ({ decryptMessages, encryptMessageContent, ensureLocalEncryptionIdentity }));
vi.mock("../../../api/files", () => ({ downloadFileBlob }));
vi.mock("../../../i18n/LanguageContext", () => ({ useResolvedLanguage: () => currentLanguage.value }));

import type { Chat } from "../../../api/chats";
import type { ChatArchive } from "./archive";
import { ChatTransferDialog } from "./ChatTransferDialog";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const roots: Root[] = [];
const archive: ChatArchive = {
  schemaVersion: 1,
  source: { providerId: "telegram", profileId: "telegram-desktop-json" },
  conversation: { sourceId: "source-chat", title: "Planning" },
  participants: [{ sourceId: "person-1", displayName: "Mira" }],
  messages: [{ sourceId: "message-1", authorId: "person-1", timestamp: "2026-10-10T08:00:00Z", kind: "text", text: "Hello" }],
  attachments: [],
  warnings: [{ code: "metadata_flattened", message: "Rich formatting was flattened" }]
};
const chat = {
  id: "selected-chat",
  familyId: "family-1",
  title: "Selected planning chat",
  type: "group",
  encryptionProtocol: "end_to_end",
  members: [{ id: "user-1", displayName: "Ivan", username: "ivan", role: "owner", publicKey: "public-key", profilePhoto: null }]
} as unknown as Chat;

beforeEach(() => {
  currentLanguage.value = "en";
  parseChatFile.mockReset().mockResolvedValue(archive);
  getChatExportSource.mockReset();
  getFamily.mockReset().mockResolvedValue({ defaultMessageEncryptionProtocol: "end_to_end" });
  commitChatImport.mockReset().mockResolvedValue({ id: "new-imported-chat", type: "archive", title: "Imported: Planning" });
  decryptMessages.mockReset();
  encryptMessageContent.mockReset().mockResolvedValue({ content: null, encryption: { encryptionProtocol: "end_to_end", ciphertext: "ciphertext", nonce: "nonce", encryptionMetadata: "wrapped-key" } });
  ensureLocalEncryptionIdentity.mockReset().mockResolvedValue("public-key");
  serializeChatArchive.mockReset().mockResolvedValue({ filename: "planning.stovo-chat.json", mimeType: "application/json", bytes: new Uint8Array([1, 2, 3]), compatibility: "stovo_round_trip", warnings: [] });
  downloadFileBlob.mockReset();
  vi.stubGlobal("URL", { ...URL, createObjectURL: vi.fn(() => "blob:chat-export"), revokeObjectURL: vi.fn() });
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
});

afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount());
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function mount(mode: "import" | "export", onClose = vi.fn(), onImported = vi.fn()) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  roots.push(root);
  act(() => root.render(<ChatTransferDialog mode={mode} chat={chat} accessToken="access-token" currentUserId="user-1" onClose={onClose} onImported={onImported} />));
  return { container: document.body, onClose, onImported };
}

async function chooseFile(container: HTMLElement) {
  const input = container.querySelector<HTMLInputElement>('input[type="file"]');
  if (!input) throw new Error("file input not found");
  const file = new File(["provider export"], "telegram.json", { type: "application/json" });
  await act(async () => {
    Object.defineProperty(input, "files", { configurable: true, value: [file] });
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

describe("ChatTransferDialog", () => {
  it("uses the localized file picker action and shows the selected file name", async () => {
    currentLanguage.value = "ru";
    const { container } = mount("import");

    expect(container.querySelector(".chat-transfer-file-trigger")?.textContent).toBe("Выбрать файл");
    expect(container.querySelector(".chat-transfer-file-name")?.textContent).toBe("Файл не выбран");

    await chooseFile(container);

    expect(container.querySelector(".chat-transfer-file-name")?.textContent).toBe("telegram.json");
  });

  it("renders the export profile inside the custom dropdown control", async () => {
    const { container } = mount("export");
    getChatExportSource.mockResolvedValue({ chatId: "selected-chat", chat, messages: [] });
    const review = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("Review export"));
    await act(async () => review?.click());

    expect(container.querySelector(".chat-transfer-profile-control select")).not.toBeNull();
    expect(container.querySelector(".chat-transfer-profile-chevron")).not.toBeNull();
  });

  it("mounts above chat stacking contexts and closes without an extra cancel action", async () => {
    const { container, onClose } = mount("import");
    const backdrop = container.querySelector(".modal-backdrop.chat-transfer-backdrop");

    expect(backdrop?.parentElement).toBe(document.body);
    expect(Array.from(container.querySelectorAll("button")).some((button) => button.textContent?.includes("Cancel"))).toBe(false);

    const close = container.querySelector<HTMLButtonElement>('button[aria-label="Close"]');
    await act(async () => close?.click());
    expect(onClose).toHaveBeenCalled();
  });

  it("previews the locally parsed one-chat file and closing performs no import write", async () => {
    const { container, onClose } = mount("import");
    await chooseFile(container);

    expect(parseChatFile).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain("Planning");
    expect(container.textContent).toContain("1 message");
    expect(container.textContent).toContain("Mira");
    expect(container.textContent).toContain("Rich formatting was flattened");

    const close = container.querySelector<HTMLButtonElement>('button[aria-label="Close"]');
    await act(async () => close?.click());
    expect(commitChatImport).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("confirms import as a new chat and reports the created chat without changing the selected chat", async () => {
    const { container, onImported } = mount("import");
    await chooseFile(container);
    const confirm = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("Import as new chat"));
    await act(async () => confirm?.click());

    expect(ensureLocalEncryptionIdentity).toHaveBeenCalled();
    expect(encryptMessageContent).toHaveBeenCalled();
    const submittedArchive = commitChatImport.mock.calls[0][1] as ChatArchive;
    expect(submittedArchive.messages[0]).not.toHaveProperty("text");
    expect(commitChatImport).toHaveBeenCalledWith("access-token", expect.any(Object), expect.any(String), expect.objectContaining({
      "message-1": expect.objectContaining({ ciphertext: "ciphertext", nonce: "nonce" })
    }));
    expect(onImported).toHaveBeenCalledWith(expect.objectContaining({ id: "new-imported-chat" }));
    expect(container.textContent).toContain("Imported: Planning");
    expect(JSON.stringify(commitChatImport.mock.calls[0])).not.toContain("targetChatId");
  });

  it("uses the space's default encryption protocol rather than the selected chat's legacy protocol", async () => {
    getFamily.mockResolvedValue({ defaultMessageEncryptionProtocol: "end_to_end" });
    const legacyChat = { ...chat, encryptionProtocol: "legacy_plaintext" } as Chat;
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    roots.push(root);
    act(() => root.render(<ChatTransferDialog mode="import" chat={legacyChat} accessToken="access-token" currentUserId="user-1" onClose={vi.fn()} />));
    await chooseFile(document.body);
    const confirm = Array.from(document.body.querySelectorAll("button")).find((button) => button.textContent?.includes("Import as new chat"));
    await act(async () => confirm?.click());

    expect(getFamily).toHaveBeenCalledWith("access-token");
    expect(encryptMessageContent).toHaveBeenCalled();
    expect(commitChatImport.mock.calls[0][1].messages[0]).not.toHaveProperty("text");
  });

  it("keeps attachment-only messages explicit when the destination encrypts on the server", async () => {
    getFamily.mockResolvedValue({ defaultMessageEncryptionProtocol: "server_at_rest" });
    parseChatFile.mockResolvedValue({ ...archive, messages: [{ ...archive.messages[0], text: undefined }] });
    const { container } = mount("import");
    await chooseFile(container);
    const confirm = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("Import as new chat"));
    await act(async () => confirm?.click());

    expect(encryptMessageContent).not.toHaveBeenCalled();
    expect(commitChatImport.mock.calls[0][1].messages[0].text).toBe("");
  });

  it("keeps the original source author distinguishable from the Stovo importing member", async () => {
    const sourceMessage = {
      id: "e2e-1",
      chatId: "imported-chat",
      senderId: "stovo-importing-user",
      senderDisplayName: "Ivan",
      type: "text",
      content: "Imported content",
      encryptionProtocol: "server_at_rest",
      ciphertext: null,
      nonce: null,
      keyVersion: null,
      encryptionMetadata: null,
      replyToMessageId: null,
      threadRootMessageId: null,
      messageKind: "chat",
      createdAt: "2026-10-10T08:00:00Z",
      updatedAt: "2026-10-10T08:00:00Z",
      deletedAt: null,
      isEdited: false,
      statuses: [],
      reactions: [],
      attachments: [],
      importAttribution: { sourceProvider: "telegram", sourceMessageId: "src-1", sourceAuthorId: "telegram-user", sourceAuthorName: "Mira" }
    };
    const { container } = mount("export");
    getChatExportSource.mockResolvedValue({ chatId: "imported-chat", chat: { ...chat, id: "imported-chat", encryptionProtocol: "server_at_rest" }, messages: [sourceMessage] });
    const review = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("Review export"));
    await act(async () => review?.click());

    expect(container.textContent).toContain("Original author: Mira");
    expect(container.textContent).toContain("Imported from Telegram");
  });

  it("round-trips imported source reactions, deletion time, kind, and reference-only attachments", async () => {
    const sourceMessage = {
      id: "e2e-2",
      chatId: "imported-chat",
      senderId: "stovo-importing-user",
      senderDisplayName: "Ivan",
      type: "text",
      content: "Imported content",
      encryptionProtocol: "server_at_rest",
      ciphertext: null,
      nonce: null,
      keyVersion: null,
      encryptionMetadata: null,
      replyToMessageId: null,
      threadRootMessageId: null,
      messageKind: "chat",
      createdAt: "2026-10-10T08:00:00Z",
      updatedAt: "2026-10-10T08:00:00Z",
      deletedAt: null,
      isEdited: false,
      statuses: [],
      reactions: [],
      attachments: [],
      importAttribution: {
        sourceProvider: "telegram",
        sourceMessageId: "source-message-1",
        sourceAuthorId: "telegram-user",
        sourceAuthorName: "Mira",
        sourceDeletedAt: "2026-10-10T08:30:00Z",
        sourceAttachments: [{ id: "external-file", path: "attachments/photo.jpg", filename: "photo.jpg", mimeType: "image/jpeg", size: 123, externalUrl: "https://example.test/photo.jpg" }],
        reactions: [{ emoji: "👍", participantIds: ["telegram-user"] }],
        metadata: { sourceKind: "service" }
      }
    };
    const { container } = mount("export");
    getChatExportSource.mockResolvedValue({ chatId: "imported-chat", chat: { ...chat, id: "imported-chat", encryptionProtocol: "server_at_rest" }, messages: [sourceMessage] });
    const review = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("Review export"));
    await act(async () => review?.click());
    const download = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("Download export"));
    await act(async () => download?.click());

    const output = serializeChatArchive.mock.calls[0][0] as ChatArchive;
    expect(output.messages[0]).toMatchObject({
      kind: "service",
      deletedAt: "2026-10-10T08:30:00Z",
      reactions: [{ emoji: "👍", participantIds: ["telegram-user"] }],
      attachmentIds: ["source:telegram:external-file"]
    });
    expect(output.attachments).toContainEqual(expect.objectContaining({ id: "source:telegram:external-file", externalUrl: "https://example.test/photo.jpg" }));
  });

  it("shows the E2E plaintext warning before decrypting and exports only the chosen chat", async () => {
    getChatExportSource.mockResolvedValue({
      chatId: chat.id,
      chat,
      messages: [{ id: "e2e-1", chatId: chat.id, senderId: "user-1", senderDisplayName: "Ivan", type: "text", content: null, encryptionProtocol: "end_to_end", ciphertext: "ciphertext-secret", nonce: "nonce-secret", keyVersion: 1, encryptionMetadata: "wrapped-key-secret", replyToMessageId: null, threadRootMessageId: null, messageKind: "chat", createdAt: "2026-10-10T08:00:00Z", updatedAt: "2026-10-10T08:00:00Z", deletedAt: null, isEdited: false, statuses: [], reactions: [], attachments: [] }]
    });
    decryptMessages.mockResolvedValue([{ id: "e2e-1", content: "decrypted only in browser", encryptionProtocol: "end_to_end", ciphertext: "ciphertext-secret", nonce: "nonce-secret", encryptionMetadata: "wrapped-key-secret", createdAt: "2026-10-10T08:00:00Z", senderId: "user-1", attachments: [] }]);
    const { container } = mount("export");
    const review = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("Review export"));
    await act(async () => review?.click());

    expect(getChatExportSource).toHaveBeenCalledWith("access-token", "selected-chat");
    expect(container.textContent).toContain("This export may contain plaintext");
    expect(decryptMessages).not.toHaveBeenCalled();
    expect(serializeChatArchive).not.toHaveBeenCalled();

    const download = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("Download export"));
    await act(async () => download?.click());

    expect(decryptMessages).toHaveBeenCalledWith(chat.id, expect.any(Array), "user-1");
    expect(serializeChatArchive).toHaveBeenCalledWith(expect.objectContaining({ source: { providerId: "stovo", profileId: "stovo-chat-archive-v1" } }), expect.any(Object));
    const serializedArchive = serializeChatArchive.mock.calls[0][0] as ChatArchive;
    expect(serializedArchive.messages[0]).toMatchObject({ text: "decrypted only in browser" });
    expect(serializedArchive.messages[0]).not.toHaveProperty("ciphertext");
    expect(serializedArchive.messages[0]).not.toHaveProperty("encryptionMetadata");
  });

  it("closing the export confirmation does not decrypt or serialize", async () => {
    getChatExportSource.mockResolvedValue({ chatId: chat.id, chat, messages: [] });
    const { container } = mount("export");
    const review = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("Review export"));
    await act(async () => review?.click());
    const close = container.querySelector<HTMLButtonElement>('button[aria-label="Close"]');
    await act(async () => close?.click());

    expect(decryptMessages).not.toHaveBeenCalled();
    expect(serializeChatArchive).not.toHaveBeenCalled();
  });
});
