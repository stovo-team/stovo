import { ChangeEvent, useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Download,
  Archive,
  ChevronDown,
  FileAudio,
  FileText,
  Heart,
  Home,
  Image,
  Info,
  Maximize2,
  Hash,
  LockKeyhole,
  MoreVertical,
  MessageCircle,
  Megaphone,
  RefreshCw,
  Search,
  Trash2,
  Upload,
  Users,
  Video,
  X
} from "lucide-react";

import { ApiError } from "../api/client";
import {
  FamilyFile,
  createStreamingMediaUrl,
  formatFileSize,
  saveFileToDisk,
  updateFilePreferences,
  uploadFile
} from "../api/files";
import { Family } from "../api/family";
import { getChats, type Chat } from "../api/chats";
import { useAuth } from "../auth/AuthContext";
import { AudioPlayer } from "../components/AudioPlayer";
import {
  DocumentAttachmentPreview,
  detectDocumentPreviewKind
} from "../components/DocumentAttachmentPreview";
import ImageLightbox from "../components/ImageLightbox";
import { VideoPlayer } from "../components/VideoPlayer";
import useFilePreviewUrl from "../hooks/useFilePreviewUrl";
import AppNav from "./AppNav";
import { buildAudioSourceFactory } from "../features/chats/shared/audioSourceFactory";
import {
  initialStorageSelection,
  shouldOpenStorageTilePreview,
  storageTileSelectionAction,
  storageSelectionReducer
} from "./storageSelection";
import {
  buildStorageSources,
  matchesStorageFilter,
  storageFileKind,
  storageSourceLeadingVisual,
  type StorageAvatarKind,
  type StorageFilter
} from "./storageLibrary";

const storageFilters: Array<{ label: string; value: StorageFilter }> = [
  { label: "All", value: "all" },
  { label: "Photos", value: "photos" },
  { label: "Videos", value: "videos" },
  { label: "Audio", value: "audio" },
  { label: "Documents", value: "documents" },
  { label: "Favorites", value: "favorites" }
];

function canDeleteFile(file: FamilyFile, currentUserId: string | undefined, role: string | undefined) {
  return file.uploadedBy === currentUserId || role === "owner" || role === "admin";
}

function fileKind(file: FamilyFile) { return storageFileKind(file); }

function fileIcon(file: FamilyFile) {
  const kind = fileKind(file);
  if (kind === "photos") {
    return Image;
  }
  if (kind === "videos") {
    return Video;
  }
  if (kind === "audio") {
    return FileAudio;
  }
  return FileText;
}

function groupLabel(value: string) {
  return new Date(value).toLocaleDateString([], { month: "long", year: "numeric" });
}

function chatFolderLabel(file: FamilyFile) {
  if (file.chatTitle) {
    return file.chatTitle;
  }
  if (file.chatType === "family") {
    return "General Family Chat";
  }
  if (file.chatType === "group") {
    return "Group chat";
  }
  if (file.chatType === "channel") {
    return "Channel";
  }
  if (file.chatType === "direct") {
    return "Direct chat";
  }
  return "Family workspace";
}

function accessLabel(file: FamilyFile) {
  return file.accessScope === "family" ? "Family storage" : "Chat members";
}

function chatInitials(name: string) {
  const parts = name.split(" ").filter(Boolean);
  return parts.length > 1
    ? parts.slice(0, 2).map((part) => part[0]?.toUpperCase()).join("")
    : (parts[0] ?? name).slice(0, 2).toUpperCase();
}

function StorageSourceAvatar({
  accessToken,
  file,
  kind,
  label,
  minimizedLayout
}: {
  accessToken: string | null;
  file: FamilyFile | null;
  kind: StorageAvatarKind;
  label: string;
  minimizedLayout: boolean;
}) {
  const previewUrl = useFilePreviewUrl(accessToken, file, Boolean(file));
  const [imageBroken, setImageBroken] = useState(false);

  useEffect(() => setImageBroken(false), [file?.id, previewUrl]);

  const leadingVisual = storageSourceLeadingVisual(kind, minimizedLayout);

  if (leadingVisual === "lock") return <LockKeyhole aria-hidden="true" size={16} strokeWidth={2} />;
  if (leadingVisual === "hash") return <Hash aria-hidden="true" size={16} strokeWidth={2} />;
  if (leadingVisual === "archive") return <Archive aria-hidden="true" size={16} strokeWidth={2} />;
  if (previewUrl && !imageBroken) {
    return <img src={previewUrl} alt="" onError={() => setImageBroken(true)} />;
  }
  if (kind === "family") return <Home aria-hidden="true" size={20} />;
  if (kind === "group") return <Users aria-hidden="true" size={20} />;
  if (kind === "channel") return <Megaphone aria-hidden="true" size={20} />;
  return <span aria-hidden="true">{chatInitials(label)}</span>;
}

function StorageTile({
  accessToken,
  file,
  isSelected,
  onSelect,
  onOpenImage
}: {
  accessToken: string | null;
  file: FamilyFile;
  isSelected: boolean;
  onSelect: () => void;
  onOpenImage: (file: FamilyFile, previewUrl: string) => void;
}) {
  const previewUrl = useFilePreviewUrl(accessToken, file);
  const [videoPreviewUrl, setVideoPreviewUrl] = useState<string | null>(null);
  const Icon = fileIcon(file);

  useEffect(() => {
    if (!accessToken || fileKind(file) !== "videos") {
      setVideoPreviewUrl(null);
      return;
    }
    let cancelled = false;
    void createStreamingMediaUrl(accessToken, file.id).then((url) => {
      if (!cancelled) setVideoPreviewUrl(url);
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [accessToken, file]);

  return (
    <button
      type="button"
      className={`storage-tile ${isSelected ? "selected" : ""} ${fileKind(file)}`}
      data-storage-file-id={file.id}
      aria-pressed={isSelected}
      onClick={() => {
        onSelect();
        const isMobileViewport = window.matchMedia("(max-width: 960px)").matches;
        if (shouldOpenStorageTilePreview(Boolean(previewUrl), isMobileViewport) && previewUrl) {
          onOpenImage(file, previewUrl);
        }
      }}
    >
      {file.isFavorite && (
        <small className="storage-favorite-badge" aria-label="Favorite">
          <Heart aria-hidden="true" size={13} />
        </small>
      )}
      {fileKind(file) === "videos" && videoPreviewUrl ? (
        <video muted preload="metadata" src={videoPreviewUrl} />
      ) : previewUrl ? <img src={previewUrl} alt={file.originalName} /> : <Icon aria-hidden="true" size={28} />}
      <span>
        <strong>{file.originalName}</strong>
        <small>{formatFileSize(file.sizeBytes)}</small>
      </span>
    </button>
  );
}

export default function FilesPage() {
  const navigate = useNavigate();
  const { accessToken, authRequest, currentUser } = useAuth();
  const [family, setFamily] = useState<Family | null>(null);
  const [files, setFiles] = useState<FamilyFile[]>([]);
  const [chats, setChats] = useState<Chat[]>([]);
  const [selection, dispatchSelection] = useReducer(
    storageSelectionReducer,
    initialStorageSelection
  );
  const { selectedFileId, mobileDetailsOpen } = selection;
  const [fullViewImage, setFullViewImage] = useState<{
    file: FamilyFile;
    previewUrl: string;
  } | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<StorageFilter>("all");
  const [sourceChatId, setSourceChatId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [isSourceMenuOpen, setIsSourceMenuOpen] = useState(false);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const sourceMenuRef = useRef<HTMLDivElement | null>(null);
  const storageDetailsCloseRef = useRef<HTMLButtonElement | null>(null);

  const closeMobileDetails = useCallback(() => {
    const fileIdToRestore = selectedFileId;
    setFullViewImage(null);
    dispatchSelection({ type: "close" });
    window.requestAnimationFrame(() => {
      const selectedTile = Array.from(
        document.querySelectorAll<HTMLElement>("[data-storage-file-id]")
      ).find((element) => element.dataset.storageFileId === fileIdToRestore);
      selectedTile?.focus();
    });
  }, [selectedFileId]);

  const load = useCallback(async () => {
    if (!accessToken) {
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const [familyResult, filesResult, chatsResult] = await Promise.all([
        authRequest<Family>("/api/family"),
        authRequest<FamilyFile[]>("/api/files"),
        getChats(accessToken)
      ]);
      setFamily(familyResult);
      setFiles(filesResult);
      setChats(chatsResult);
      dispatchSelection({ type: "load-default", fileId: filesResult[0]?.id ?? null });
    } catch (err) {
      setError(err instanceof ApiError ? String(err.message) : "Could not load storage");
    } finally {
      setIsLoading(false);
    }
  }, [accessToken, authRequest]);

  useEffect(() => {
    dispatchSelection({ type: "reset-gallery" });
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!mobileDetailsOpen) {
      return;
    }

    const focusFrame = window.requestAnimationFrame(() => storageDetailsCloseRef.current?.focus());
    function handleDetailsKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeMobileDetails();
      }
    }
    document.addEventListener("keydown", handleDetailsKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", handleDetailsKeyDown);
    };
  }, [closeMobileDetails, mobileDetailsOpen]);

  useEffect(() => {
    function handleDocumentMouseDown(event: MouseEvent) {
      if (!sourceMenuRef.current?.contains(event.target as Node)) {
        setIsSourceMenuOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsSourceMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleDocumentMouseDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleDocumentMouseDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  const filteredFiles = useMemo(() => {
    const query = search.trim().toLowerCase();
    return files.filter((file) => {
      if (!matchesStorageFilter(file, filter) || (sourceChatId && file.chatId !== sourceChatId)) {
        return false;
      }
      return (
        !query ||
        `${file.originalName} ${file.mimeType} ${chatFolderLabel(file)}`.toLowerCase().includes(query)
      );
    });
  }, [files, filter, search, sourceChatId]);

  const selectedFile = filteredFiles.find((file) => file.id === selectedFileId) ?? null;
  const selectedFilePreviewUrl = useFilePreviewUrl(accessToken, selectedFile);
  const selectedDocumentKind = selectedFile ? detectDocumentPreviewKind(selectedFile) : "unsupported";

  const groupedFiles = useMemo(() => {
    return filteredFiles.reduce<
      Array<{ id: string; label: string; access: string; items: FamilyFile[] }>
    >((groups, file) => {
      const id = file.chatId ?? "workspace";
      const label = chatFolderLabel(file);
      const existing = groups.find((group) => group.id === id);
      if (existing) {
        existing.items.push(file);
      } else {
        groups.push({ id, label, access: accessLabel(file), items: [file] });
      }
      return groups;
    }, []);
  }, [filteredFiles]);
  const sourceGroups = useMemo(() => {
    return buildStorageSources(files, chats, currentUser?.id);
  }, [chats, currentUser?.id, files]);
  const selectedSource = sourceGroups.flatMap((group) => group.sources)
    .find((source) => source.chatId === sourceChatId);

  async function handleUpload(event: ChangeEvent<HTMLInputElement>) {
    const selectedFiles = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (!accessToken || selectedFiles.length === 0) {
      return;
    }
    setIsUploading(true);
    setError(null);
    setNotice(null);
    try {
      const uploadedFiles: FamilyFile[] = [];
      for (const file of selectedFiles) {
        uploadedFiles.push(await uploadFile(accessToken, file));
      }
      setFiles((current) => [...uploadedFiles, ...current]);
      if (uploadedFiles[0]) {
        dispatchSelection({ type: "open", fileId: uploadedFiles[0].id });
      }
      setNotice("Upload complete");
    } catch (err) {
      setError(err instanceof ApiError ? String(err.message) : "Could not upload file");
    } finally {
      setIsUploading(false);
    }
  }

  async function handleFavoriteToggle(file: FamilyFile) {
    if (!accessToken) {
      return;
    }
    setError(null);
    setNotice(null);
    try {
      const updated = await updateFilePreferences(accessToken, file.id, {
        isFavorite: !file.isFavorite
      });
      setFiles((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      dispatchSelection({ type: "select", fileId: updated.id });
      setNotice(updated.isFavorite ? "Added to favorites" : "Removed from favorites");
    } catch (err) {
      setError(err instanceof ApiError ? String(err.message) : "Could not update favorite");
    }
  }

  async function handleDelete(fileId: string) {
    if (!accessToken) {
      return;
    }
    setError(null);
    setNotice(null);
    try {
      await authRequest<void>(`/api/files/${fileId}`, { method: "DELETE" });
      setFiles((current) => current.filter((file) => file.id !== fileId));
      dispatchSelection({ type: "remove", fileId });
      setFullViewImage((current) => (current?.file.id === fileId ? null : current));
      setNotice("Moved to trash");
    } catch (err) {
      setError(err instanceof ApiError ? String(err.message) : "Could not delete file");
    }
  }

  return (
    <main className={`app-shell app-frame storage-page${family?.minimizedChatLayout ? " storage-page--minimized-layout" : ""}${mobileDetailsOpen ? " has-storage-selection" : ""}`}>
      <AppNav />
      <section className="page-surface storage-layout" aria-busy={isLoading || isUploading}>
        <aside className="storage-source-sidebar" aria-label="Chat file sources">
          <div className="storage-mobile-source-picker" ref={sourceMenuRef}>
            <button
              type="button"
              className="storage-mobile-source-trigger"
              aria-expanded={isSourceMenuOpen}
              aria-haspopup="listbox"
              onClick={() => setIsSourceMenuOpen((isOpen) => !isOpen)}
            >
              <span className="storage-mobile-source-copy">
                <strong>{selectedSource?.label ?? "All chats"}</strong>
                <small>{selectedSource?.fileCount ?? files.length} files</small>
              </span>
              <ChevronDown aria-hidden="true" size={20} />
            </button>
            {isSourceMenuOpen && (
              <div className="storage-mobile-source-menu" role="listbox" aria-label="Storage source">
                <button
                  type="button"
                  role="option"
                  aria-selected={!sourceChatId}
                  className={!sourceChatId ? "active" : undefined}
                  onClick={() => {
                    setSourceChatId(null);
                    setIsSourceMenuOpen(false);
                  }}
                >
                  <span className="storage-source-avatar" aria-hidden="true"><MessageCircle size={19} /></span>
                  <span><strong>All chats</strong><small>{files.length} files</small></span>
                </button>
                {sourceGroups.map((group) => (
                  <section className="storage-mobile-source-group" key={group.label}>
                    <h2>{group.label}</h2>
                    {group.sources.map((source) => (
                      <button
                        type="button"
                        role="option"
                        aria-selected={sourceChatId === source.chatId}
                        className={sourceChatId === source.chatId ? "active" : undefined}
                        key={source.chatId}
                        onClick={() => {
                          setSourceChatId(source.chatId);
                          setIsSourceMenuOpen(false);
                        }}
                      >
                        <span className={`storage-source-avatar${source.avatarKind === "archive" ? " storage-source-avatar--archive" : ""}`}>
                          <StorageSourceAvatar
                            accessToken={accessToken}
                            file={source.avatarFile}
                            kind={source.avatarKind}
                            label={source.label}
                            minimizedLayout={Boolean(family?.minimizedChatLayout)}
                          />
                        </span>
                        <span><strong>{source.label}</strong><small>{source.fileCount} files</small></span>
                      </button>
                    ))}
                  </section>
                ))}
              </div>
            )}
          </div>

          <button
            type="button"
            className={!sourceChatId ? "storage-source active" : "storage-source"}
            onClick={() => setSourceChatId(null)}
          >
            <span className="storage-source-avatar" aria-hidden="true"><MessageCircle size={family?.minimizedChatLayout ? 16 : 19} /></span>
            <span className="storage-source-copy"><strong>All chats</strong><small>{files.length} files</small></span>
          </button>
          {sourceGroups.map((group) => (
            <section className="storage-source-group" key={group.label}>
              <h2>{group.label}</h2>
              {group.sources.map((source) => (
                <button
                  type="button"
                  className={sourceChatId === source.chatId ? "storage-source active" : "storage-source"}
                  key={source.chatId}
                  onClick={() => setSourceChatId(source.chatId)}
                >
                  <span className={`storage-source-avatar${source.avatarKind === "archive" ? " storage-source-avatar--archive" : ""}`}>
                    <StorageSourceAvatar
                      accessToken={accessToken}
                      file={source.avatarFile}
                      kind={source.avatarKind}
                      label={source.label}
                      minimizedLayout={Boolean(family?.minimizedChatLayout)}
                    />
                  </span>
                  <span className="storage-source-copy"><strong>{source.label}</strong><small>{source.fileCount} files</small></span>
                </button>
              ))}
            </section>
          ))}
        </aside>
        <div className="storage-main">
          <header className="section-header">
            <div aria-hidden="true" />
          </header>

          {error && <p className="error-text">{error}</p>}
          {notice && <p className="success-text">{notice}</p>}

          <label className="search-field storage-search">
            <Search aria-hidden="true" size={18} />
            <input
              placeholder="Search files, dates, people"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>

          <div className="filter-chip-row" aria-label="Storage filters">
            {storageFilters.map((item) => (
              <button
                type="button"
                className={filter === item.value ? "filter-chip active" : "filter-chip"}
                aria-pressed={filter === item.value}
                key={item.value}
                onClick={() => setFilter(item.value)}
              >
                {item.label}
              </button>
            ))}
          </div>

          {isLoading ? (
            <div className="storage-grid skeleton-grid" aria-hidden="true">
              {Array.from({ length: 10 }).map((_, index) => (
                <span className="storage-tile skeleton-tile" key={index} />
              ))}
            </div>
          ) : filteredFiles.length === 0 ? (
            <div className="empty-state storage-empty-state">
              <HardDriveIcon />
              <strong>{filter === "favorites" ? "No favorites yet" : "No files saved yet"}</strong>
              <p>Files shared in chats will appear here.</p>
            </div>
          ) : (
            <div className="storage-grid">
              {filteredFiles.map((file) => (
                <StorageTile
                  accessToken={accessToken}
                  file={file}
                  isSelected={selectedFile?.id === file.id}
                  key={file.id}
                  onOpenImage={(imageFile, previewUrl) => setFullViewImage({ file: imageFile, previewUrl })}
                  onSelect={() => dispatchSelection(storageTileSelectionAction(
                    window.matchMedia("(max-width: 960px)").matches,
                    file.id
                  ))}
                />
              ))}
            </div>
          )}
        </div>

        {mobileDetailsOpen && (
          <button
            type="button"
            className="storage-details-backdrop"
            aria-label="Close file details"
            onClick={closeMobileDetails}
          />
        )}
        <aside
          className="storage-details-panel"
          aria-label="File details"
          aria-labelledby={mobileDetailsOpen ? "storage-file-details-title" : undefined}
          aria-modal={mobileDetailsOpen ? false : undefined}
          role={mobileDetailsOpen ? "dialog" : undefined}
        >
          {selectedFile ? (
            <>
              <div className="storage-mobile-detail-header">
                <strong id="storage-file-details-title">File details</strong>
                <button
                  ref={storageDetailsCloseRef}
                  type="button"
                  className="mobile-back-button"
                  aria-label="Close file details"
                  onClick={closeMobileDetails}
                >
                  <X aria-hidden="true" size={20} />
                </button>
              </div>
              <div className="storage-details-copy">
                <h2>{selectedFile.originalName}</h2>
                <p>{selectedFile.mimeType}</p>
              </div>
              <div className="storage-preview storage-preview-frame">
                <div className="storage-preview-actions">
                  {accessToken && (
                    <button
                      type="button"
                      aria-label="Download file"
                      title="Download"
                      onClick={() => void saveFileToDisk(accessToken, selectedFile)}
                    >
                      <Download aria-hidden="true" size={20} />
                    </button>
                  )}
                  <button
                    type="button"
                    className={selectedFile.isFavorite ? "is-active" : undefined}
                    aria-label={selectedFile.isFavorite ? "Remove from favorites" : "Add to favorites"}
                    aria-pressed={selectedFile.isFavorite}
                    title={selectedFile.isFavorite ? "Favorited" : "Favorite"}
                    onClick={() => void handleFavoriteToggle(selectedFile)}
                  >
                    <Heart aria-hidden="true" size={20} />
                  </button>
                  {selectedFilePreviewUrl && (
                    <button
                      type="button"
                      aria-label={`Open ${selectedFile.originalName} full screen`}
                      title="Full screen"
                      onClick={() =>
                        setFullViewImage({ file: selectedFile, previewUrl: selectedFilePreviewUrl })
                      }
                    >
                      <Maximize2 aria-hidden="true" size={20} />
                    </button>
                  )}
                  {canDeleteFile(selectedFile, currentUser?.id, currentUser?.role) && (
                    <button
                      type="button"
                      className="storage-delete-icon"
                      aria-label="Move to trash"
                      title="Move to trash"
                      onClick={() => void handleDelete(selectedFile.id)}
                    >
                      <Trash2 aria-hidden="true" size={20} />
                    </button>
                  )}
                </div>
                <div className="storage-preview-media">
                  {fileKind(selectedFile) === "audio" && accessToken ? (
                    <AudioPlayer
                      descriptor={{
                        identity: {
                          chatId: selectedFile.chatId ?? "storage",
                          messageId: selectedFile.originMessageId ?? selectedFile.id,
                          fileId: selectedFile.id
                        },
                        title: selectedFile.originalName,
                        mimeType: selectedFile.mimeType
                      }}
                      sourceFactory={buildAudioSourceFactory(accessToken)}
                      hideTitle
                    />
                  ) : fileKind(selectedFile) === "videos" && accessToken ? (
                    <VideoPlayer
                      file={selectedFile}
                      accessToken={accessToken}
                      identity={{
                        chatId: selectedFile.chatId ?? "storage",
                        messageId: selectedFile.originMessageId ?? selectedFile.id,
                        fileId: selectedFile.id
                      }}
                      autoplay={false}
                    />
                  ) : selectedDocumentKind !== "unsupported" && accessToken ? (
                    <DocumentAttachmentPreview accessToken={accessToken} file={selectedFile} />
                  ) : selectedFilePreviewUrl ? (
                    <img src={selectedFilePreviewUrl} alt={selectedFile.originalName} />
                  ) : (
                    (() => {
                      const Icon = fileIcon(selectedFile);
                      return <Icon aria-hidden="true" size={42} />;
                    })()
                  )}
                </div>
              </div>
              <dl className="file-detail-list">
                <div>
                  <dt>Size</dt>
                  <dd>{formatFileSize(selectedFile.sizeBytes)}</dd>
                </div>
                <div>
                  <dt>Saved</dt>
                  <dd>{groupLabel(selectedFile.createdAt)}</dd>
                </div>
                <div>
                  <dt>Source</dt>
                  <dd>
                    {chatFolderLabel(selectedFile)} / {accessLabel(selectedFile)}
                  </dd>
                </div>
              </dl>
              {selectedFile.chatId && selectedFile.originMessageId && (
                <button
                  type="button"
                  className="storage-jump-message"
                  onClick={() => navigate(`/app/chats/${selectedFile.chatId}?message=${selectedFile.originMessageId}`)}
                >
                  Jump to message
                </button>
              )}
            </>
          ) : (
            <div className="empty-state compact-empty">
              <Info aria-hidden="true" size={28} />
              <strong>Select an item</strong>
              <p>Preview details, download, or organize files from here.</p>
            </div>
          )}
        </aside>
        {fullViewImage && (
          <ImageLightbox
            imageUrl={fullViewImage.previewUrl}
            title={fullViewImage.file.originalName}
            subtitle={`${fullViewImage.file.mimeType} / ${formatFileSize(fullViewImage.file.sizeBytes)}`}
            onClose={() => setFullViewImage(null)}
            onDownload={
              accessToken ? () => void saveFileToDisk(accessToken, fullViewImage.file) : undefined
            }
          />
        )}
      </section>
    </main>
  );
}

function HardDriveIcon() {
  return (
    <span className="storage-empty-icon">
      <FileText aria-hidden="true" size={34} />
    </span>
  );
}
