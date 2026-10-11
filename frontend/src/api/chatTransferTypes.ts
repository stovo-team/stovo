export interface ImportedSourceAttachment {
  id: string;
  path: string;
  filename: string;
  mimeType: string;
  size: number;
  checksum?: string;
  externalUrl?: string;
}

export interface MessageImportAttribution {
  sourceProvider: string;
  sourceMessageId: string;
  sourceAuthorId: string;
  sourceAuthorName: string;
  reactions?: unknown;
  metadata?: unknown;
  sourceAttachments?: ImportedSourceAttachment[];
  sourceDeletedAt?: string | null;
}
