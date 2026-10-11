import type { ChatArchive, ChatProviderId } from "../archive";

export type ExportCompatibility = "stovo_round_trip" | "provider_archive" | "native_import_verified" | "native_import_unverified";

export type ExportProfile = {
  providerId: ChatProviderId;
  profileId: string;
  formatVersion: string;
  compatibility: ExportCompatibility;
  knownLosses: readonly string[];
  sideEffects: readonly string[];
  mediaHandling: "embedded" | "references" | "mixed";
};

export type ExportPackage = {
  filename: string;
  mimeType: string;
  bytes: Uint8Array;
  compatibility: ExportCompatibility;
  warnings: ChatArchive["warnings"];
};

export const CHAT_ADAPTER_LIMITS = Object.freeze({
  maxInputBytes: 100 * 1024 * 1024,
  maxAttachmentBytes: 50 * 1024 * 1024,
  maxMessages: 50_000,
  maxZipEntries: 2_000,
  maxExpandedZipBytes: 16 * 1024 * 1024
});

export type ChatTransferErrorCode =
  | "invalid_archive"
  | "invalid_source_timestamp"
  | "invalid_source_message"
  | "unrecognized_format"
  | "multiple_conversations"
  | "unsafe_archive_path"
  | "too_many_archive_entries"
  | "archive_too_large"
  | "message_limit_exceeded"
  | "attachment_too_large"
  | "invalid_attachment"
  | "attachment_bytes_missing";

export class ChatTransferAdapterError extends Error {
  readonly code: ChatTransferErrorCode;

  constructor(code: ChatTransferErrorCode, message: string) {
    super(message);
    this.name = "ChatTransferAdapterError";
    this.code = code;
  }
}

export type AdapterParseContext = {
  relatedFiles?: File[];
};

export interface ChatAdapter {
  readonly providerId: ChatProviderId;
  readonly profileIds: readonly string[];
  parse(file: File, context?: AdapterParseContext): Promise<ChatArchive>;
}

export type { ChatArchive };
