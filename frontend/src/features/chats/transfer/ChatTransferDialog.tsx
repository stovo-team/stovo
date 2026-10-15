import { useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import type { Chat, Message } from "../../../api/chats";
import type { ChatImportPreparedContent, ChatExportSource } from "../../../api/chatTransfer";
import { commitChatImport, getChatExportSource } from "../../../api/chatTransfer";
import { getFamily } from "../../../api/family";
import { downloadFileBlob } from "../../../api/files";
import { decryptMessages, encryptMessageContent, ensureLocalEncryptionIdentity } from "../../../api/messageCrypto";
import { useResolvedLanguage, useStrings } from "../../../i18n/LanguageContext";
import { getChatTransferStrings, type ChatTransferStrings } from "../../../config/strings/chatTransfer";
import { validateArchive, type ChatArchive, type ChatArchiveAttachment, type ChatArchiveMessage } from "./archive";
import { importedSourceKind, importedSourceReactions } from "./attribution";
import { CHAT_EXPORT_PROFILES, parseChatFile, serializeChatArchive } from "./adapters";
import { ChatTransferAdapterError, type ExportProfile } from "./adapters/types";

type TransferMode = "import" | "export";

export function ChatTransferDialog({
  mode,
  chat,
  accessToken,
  currentUserId,
  onClose,
  onImported
}: {
  mode: TransferMode;
  chat: Chat;
  accessToken: string | null;
  currentUserId?: string;
  onClose: () => void;
  onImported?: (chat: Chat) => void;
}) {
  const copy = getChatTransferStrings(useResolvedLanguage());
  const uiCopy = useStrings().auditUi;
  const fileInput = useRef<HTMLInputElement | null>(null);
  const importIdempotencyKey = useRef<string | null>(null);
  const [archive, setArchive] = useState<ChatArchive | null>(null);
  const [exportSource, setExportSource] = useState<ChatExportSource | null>(null);
  const [selectedProfileId, setSelectedProfileId] = useState("stovo-chat-archive-v1");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [completeChat, setCompleteChat] = useState<Chat | null>(null);

  const selectedProfile = CHAT_EXPORT_PROFILES.find((profile) => profile.profileId === selectedProfileId) ?? CHAT_EXPORT_PROFILES[0];
  const activeArchive = useMemo(
    () => mode === "import" ? archive : exportSource ? makeExportArchive(exportSource) : null,
    [archive, exportSource, mode]
  );
  const sourceAuthors = useMemo(() => exportSource ? importedSourceAuthors(exportSource) : [], [exportSource]);
  const dateRange = useMemo(() => {
    if (!activeArchive?.messages.length) return copy.noMessages;
    const dates = activeArchive.messages.map((message) => Date.parse(message.timestamp)).filter(Number.isFinite);
    if (!dates.length) return copy.noMessages;
    const first = new Date(Math.min(...dates)).toLocaleString();
    const last = new Date(Math.max(...dates)).toLocaleString();
    return first === last ? first : `${first} — ${last}`;
  }, [activeArchive, copy.noMessages]);

  async function handleFiles(files: FileList | null) {
    setError("");
    setArchive(null);
    importIdempotencyKey.current = null;
    if (!files?.length) return;
    setBusy(true);
    try {
      const selected = Array.from(files);
      const primary = selected.find((file) => /\.(json|zip|txt|csv)$/i.test(file.name)) ?? selected[0];
      const parsed = await parseChatFile(primary, { relatedFiles: selected.filter((file) => file !== primary) });
      setArchive(validateArchive(parsed));
      importIdempotencyKey.current = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `chat-import-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    } catch (caught) {
      setError(caught instanceof ChatTransferAdapterError && caught.code === "multiple_conversations" ? copy.multipleChatsUnsupported : copy.error);
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function loadExportSource() {
    if (!accessToken) {
      setError(copy.error);
      return;
    }
    setBusy(true);
    setError("");
    try {
      setExportSource(await getChatExportSource(accessToken, chat.id));
    } catch {
      setError(copy.error);
    } finally {
      setBusy(false);
    }
  }

  async function importArchive() {
    if (!accessToken || !archive) return;
    setBusy(true);
    setError("");
    try {
      const family = await getFamily(accessToken);
      const destinationProtocol = family.defaultMessageEncryptionProtocol;
      let preparedContent: ChatImportPreparedContent | undefined;
      let submittedArchive = archive;
      if (destinationProtocol === "end_to_end") {
        if (!currentUserId) throw new Error("Current user is unavailable");
        const publicKey = await ensureLocalEncryptionIdentity();
        const member = chat.members.find((item) => item.id === currentUserId);
        const destinationChat: Chat = {
          ...chat,
          encryptionProtocol: "end_to_end",
          members: [{
            ...(member ?? { displayName: "", username: "", role: "member", profilePhoto: null }),
            id: currentUserId,
            publicKey
          }]
        };
        preparedContent = {};
        for (const message of archive.messages) {
          const encrypted = await encryptMessageContent(destinationChat, message.text ?? "", currentUserId, { encryptEmptyContent: true });
          if (!encrypted.encryption.ciphertext || !encrypted.encryption.nonce || !encrypted.encryption.encryptionMetadata) {
            throw new Error("Could not encrypt imported message");
          }
          preparedContent[message.sourceId] = {
            ciphertext: encrypted.encryption.ciphertext,
            nonce: encrypted.encryption.nonce,
            encryptionMetadata: encrypted.encryption.encryptionMetadata
          };
        }
        submittedArchive = {
          ...archive,
          messages: archive.messages.map(({ text: _text, ...message }) => message)
        };
      } else {
        submittedArchive = {
          ...archive,
          messages: archive.messages.map((message) => ({ ...message, text: message.text ?? "" }))
        };
      }
      const key = importIdempotencyKey.current;
      if (!key) throw new Error("Import operation key is unavailable");
      const created = await commitChatImport(accessToken, submittedArchive, key, preparedContent);
      setCompleteChat(created);
      onImported?.(created);
    } catch {
      setError(copy.error);
    } finally {
      setBusy(false);
    }
  }

  async function downloadExport() {
    if (!accessToken || !exportSource || !selectedProfile) return;
    setBusy(true);
    setError("");
    try {
      let messages = exportSource.messages;
      if (exportSource.chat.encryptionProtocol === "end_to_end") {
        if (!currentUserId) throw new Error("Current user is unavailable");
        messages = await decryptMessages(exportSource.chatId, messages, currentUserId);
        if (messages.some((message) => message.ciphertext && (message.deliveryError || message.content === null))) {
          throw new Error("One or more end-to-end encrypted messages could not be decrypted");
        }
      }
      const outputArchive = makeExportArchive({ ...exportSource, messages });
      if (selectedProfile.mediaHandling === "embedded") {
        outputArchive.attachments = await Promise.all(outputArchive.attachments.map(async (attachment) => {
          const file = exportSource.messages.flatMap((message) => message.attachments).find((item) => item.id === attachment.id);
          if (!file) return attachment;
          const blob = await downloadFileBlob(accessToken, file.id);
          if (blob.size > 50 * 1024 * 1024) throw new Error("Attachment exceeds the export size limit");
          return { ...attachment, size: blob.size, bytes: new Uint8Array(await blob.arrayBuffer()) };
        }));
      }
      const result = await serializeChatArchive(outputArchive, selectedProfile);
      const url = URL.createObjectURL(new Blob([result.bytes.slice().buffer as ArrayBuffer], { type: result.mimeType }));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = result.filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setError(copy.error);
    } finally {
      setBusy(false);
    }
  }

  const title = mode === "import" ? copy.importTitle : copy.exportTitle;
  const importComplete = mode === "import" && completeChat !== null;

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="modal-backdrop chat-transfer-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
      <section className="messenger-modal chat-transfer-dialog" role="dialog" aria-modal="true" aria-labelledby="chat-transfer-title">
        <div className="modal-card-header">
          <h2 id="chat-transfer-title">{importComplete ? copy.imported : title}</h2>
          <button type="button" className="quick-access-close" aria-label={uiCopy.close} disabled={busy} onClick={onClose}>×</button>
        </div>
        <div className="chat-transfer-body">
          <p>{mode === "import" ? copy.importHelp : copy.exportHelp}</p>
          {mode === "import" && !importComplete && (
            <>
              <label className="chat-transfer-file-label">
                <span>{copy.chooseFile}</span>
                <input
                  ref={fileInput}
                  type="file"
                  multiple
                  accept=".json,.zip,.txt,.csv,application/json,application/zip,text/plain,text/csv"
                  onChange={(event) => void handleFiles(event.currentTarget.files)}
                />
              </label>
            </>
          )}
          {mode === "export" && !exportSource && (
            <button className="chat-transfer-primary-action" type="button" onClick={() => void loadExportSource()} disabled={busy}>{copy.reviewExport}</button>
          )}
          {mode === "export" && exportSource && (
            <label className="chat-transfer-profile">
              <span>{copy.selectProvider}</span>
              <select value={selectedProfileId} onChange={(event) => setSelectedProfileId(event.currentTarget.value)} disabled={busy}>
                {CHAT_EXPORT_PROFILES.map((profile) => (
                  <option key={`${profile.providerId}:${profile.profileId}`} value={profile.profileId}>
                    {profile.providerId} — {profile.formatVersion}
                  </option>
                ))}
              </select>
            </label>
          )}
          {busy && <p role="status">{mode === "import" ? copy.importing : copy.exporting}</p>}
          {error && <p role="alert">{error}</p>}
          {importComplete && <p role="status"><strong>{completeChat.title || copy.imported}</strong></p>}
          {activeArchive && (
            <div className="chat-transfer-preview">
              <h3>{activeArchive.conversation.title}</h3>
              <p>{copy.participants(activeArchive.participants.length)} · {copy.messages(activeArchive.messages.length)} · {copy.attachments(activeArchive.attachments.length)}</p>
              {activeArchive.participants.length > 0 && <p>{activeArchive.participants.map((participant) => participant.displayName).join(", ")}</p>}
              <p><strong>{copy.dateRange}:</strong> {dateRange}</p>
              {mode === "export" && selectedProfile && (
                <>
                  <p><strong>{copy.compatibility}:</strong> {compatibilityLabel(selectedProfile, copy)}</p>
                  {selectedProfile.knownLosses.length > 0 && <section><strong>{copy.knownLosses}</strong><ul>{selectedProfile.knownLosses.map((loss) => <li key={loss}>{loss}</li>)}</ul></section>}
                </>
              )}
              {activeArchive.warnings.length > 0 && <section><strong>{copy.warnings}</strong><ul>{activeArchive.warnings.map((warning, index) => <li key={`${warning.code}:${index}`}>{warning.message}</li>)}</ul></section>}
              {mode === "export" && sourceAuthors.length > 0 && (
                <section><ul>{sourceAuthors.map((item) => <li key={`${item.sourceProvider}:${item.sourceAuthorId}`}>{copy.originalAuthor(item.sourceAuthorName)} · {copy.importedFrom(providerName(item.sourceProvider))}</li>)}</ul></section>
              )}
            </div>
          )}
          {mode === "export" && exportSource?.chat.encryptionProtocol === "end_to_end" && (
            <p className="chat-transfer-plaintext-warning" role="alert">{copy.plaintextWarning}</p>
          )}
          <div className="chat-transfer-actions">
            {mode === "import" && !importComplete && archive && (
              <button className="chat-transfer-primary-action" type="button" onClick={() => void importArchive()} disabled={busy}>{copy.importAsNewChat}</button>
            )}
            {mode === "export" && exportSource && (
              <button className="chat-transfer-primary-action" type="button" onClick={() => void downloadExport()} disabled={busy}>{copy.downloadExport}</button>
            )}
          </div>
        </div>
      </section>
    </div>,
    document.body
  );
}

function makeExportArchive(source: ChatExportSource): ChatArchive {
  const messageIds = new Map(source.messages.map((message) => [message.id, message.importAttribution?.sourceMessageId || message.id]));
  const participantMap = new Map<string, string>();
  for (const member of source.chat.members) participantMap.set(member.id, member.displayName || member.username || member.id);
  for (const message of source.messages) {
    const attribution = message.importAttribution;
    if (attribution?.sourceAuthorId) participantMap.set(attribution.sourceAuthorId, attribution.sourceAuthorName || attribution.sourceAuthorId);
    else if (message.senderId) participantMap.set(message.senderId, message.senderDisplayName || message.senderId);
  }
  const attachments = new Map<string, ChatArchiveAttachment>();
  const messages: ChatArchiveMessage[] = source.messages.map((message: Message) => {
    const attribution = message.importAttribution;
    const authorId = attribution?.sourceAuthorId || message.senderId;
    const sourceMessageId = attribution?.sourceMessageId || message.id;
    const messageAttachments = message.attachments ?? [];
    for (const file of message.attachments ?? []) {
      if (!attachments.has(file.id)) {
        attachments.set(file.id, {
          id: file.id,
          path: `attachments/${file.id}_${file.originalName}`,
          filename: file.originalName,
          mimeType: file.mimeType || "application/octet-stream",
          size: file.sizeBytes,
          ...(file.checksum ? { checksum: file.checksum } : {})
        });
      }
    }
    const sourceAttachmentIds: string[] = [];
    for (const item of attribution?.sourceAttachments ?? []) {
      if (!item.id || messageAttachments.some((file) => file.originalName === item.filename)) continue;
      const id = `source:${attribution?.sourceProvider ?? "stovo"}:${item.id}`;
      if (!attachments.has(id)) {
        const filename = item.filename.replace(/[\\/]/g, "_").slice(0, 240) || "attachment";
        attachments.set(id, {
          id,
          path: `attachments/${id.replace(/[^a-zA-Z0-9._-]/g, "_")}_${filename}`,
          filename,
          mimeType: item.mimeType || "application/octet-stream",
          size: Number.isSafeInteger(item.size) && item.size >= 0 ? item.size : 0,
          ...(item.checksum ? { checksum: item.checksum } : {}),
          ...(item.externalUrl ? { externalUrl: item.externalUrl } : {})
        });
      }
      sourceAttachmentIds.push(id);
    }
    const metadata: Record<string, unknown> = {};
    if (attribution) {
      metadata.importedAttribution = {
        sourceProvider: attribution.sourceProvider,
        sourceMessageId: attribution.sourceMessageId,
        sourceAuthorId: attribution.sourceAuthorId,
        sourceAuthorName: attribution.sourceAuthorName,
        sourceKind: importedSourceKind(attribution.metadata),
        sourceDeletedAt: attribution.sourceDeletedAt,
        sourceAttachments: attribution.sourceAttachments,
        reactions: attribution.reactions,
        metadata: attribution.metadata
      };
    }
    const sourceKind = importedSourceKind(attribution?.metadata);
    const importedReactions = importedSourceReactions(attribution?.reactions);
    return {
      sourceId: sourceMessageId,
      authorId,
      timestamp: new Date(message.createdAt).toISOString(),
      kind: sourceKind || message.type || "text",
      ...(message.content !== null ? { text: message.content } : {}),
      ...(message.replyToMessageId && messageIds.has(message.replyToMessageId) ? { replyToSourceId: messageIds.get(message.replyToMessageId) } : {}),
      ...(message.threadRootMessageId && messageIds.has(message.threadRootMessageId) ? { threadRootSourceId: messageIds.get(message.threadRootMessageId) } : {}),
      attachmentIds: [...messageAttachments.map((file) => file.id), ...sourceAttachmentIds],
      ...((message.reactions?.length || importedReactions?.length) ? {
        reactions: message.reactions?.length
          ? message.reactions.map((reaction) => ({ emoji: reaction.emoji, participantIds: reaction.userIds }))
          : importedReactions
      } : {}),
      ...(message.isEdited ? { isEdited: true } : {}),
      ...(message.deletedAt ? { deletedAt: new Date(message.deletedAt).toISOString() } : attribution?.sourceDeletedAt ? { deletedAt: attribution.sourceDeletedAt } : {}),
      ...(Object.keys(metadata).length ? { metadata } : {})
    };
  });
  const sourceProvider = source.messages.find((message) => message.importAttribution)?.importAttribution?.sourceProvider;
  return validateArchive({
    schemaVersion: 1,
    source: { providerId: "stovo", profileId: "stovo-chat-archive-v1" },
    exportedAt: new Date().toISOString(),
    conversation: { sourceId: source.chat.id, title: source.chat.title || "Chat" },
    participants: [...participantMap].map(([sourceId, displayName]) => ({ sourceId, displayName })),
    messages,
    attachments: [...attachments.values()],
    warnings: sourceProvider ? [{ code: "imported_source_attribution", message: `This chat contains messages originally imported from ${sourceProvider}` }] : []
  });
}

function compatibilityLabel(profile: ExportProfile, copy: ChatTransferStrings): string {
  if (profile.compatibility === "stovo_round_trip") return copy.stovoRoundTrip;
  if (profile.compatibility === "native_import_verified") return copy.nativeVerified;
  return copy.providerArchive;
}

function importedSourceAuthors(source: ChatExportSource) {
  const authors = new Map<string, { sourceProvider: string; sourceAuthorId: string; sourceAuthorName: string }>();
  for (const message of source.messages) {
    const attribution = message.importAttribution;
    if (!attribution) continue;
    authors.set(`${attribution.sourceProvider}:${attribution.sourceAuthorId}`, {
      sourceProvider: attribution.sourceProvider,
      sourceAuthorId: attribution.sourceAuthorId,
      sourceAuthorName: attribution.sourceAuthorName
    });
  }
  return [...authors.values()];
}

function providerName(provider: string): string {
  const names: Record<string, string> = {
    telegram: "Telegram", whatsapp: "WhatsApp", slack: "Slack", mattermost: "Mattermost", rocketchat: "Rocket.Chat", stovo: "Stovo"
  };
  return names[provider] ?? provider;
}
