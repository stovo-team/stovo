import { ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Download,
  FileAudio,
  FileText,
  Heart,
  Image,
  Info,
  MoreVertical,
  RefreshCw,
  Search,
  Trash2,
  Upload,
  Video
} from "lucide-react";

import { ApiError } from "../api/client";
import {
  FamilyFile,
  formatFileSize,
  saveFileToDisk,
  updateFilePreferences,
  uploadFile
} from "../api/files";
import { Family } from "../api/family";
import { useAuth } from "../auth/AuthContext";
import ImageLightbox from "../components/ImageLightbox";
import useFilePreviewUrl from "../hooks/useFilePreviewUrl";
import AppNav from "./AppNav";

type StorageFilter = "all" | "photos" | "videos" | "documents" | "favorites";

const storageFilters: Array<{ label: string; value: StorageFilter }> = [
  { label: "All", value: "all" },
  { label: "Photos", value: "photos" },
  { label: "Videos", value: "videos" },
  { label: "Documents", value: "documents" },
  { label: "Favorites", value: "favorites" }
];

function canDeleteFile(file: FamilyFile, currentUserId: string | undefined, role: string | undefined) {
  return file.uploadedBy === currentUserId || role === "owner" || role === "admin";
}

function fileKind(file: FamilyFile) {
  if (file.mimeType.startsWith("image/")) {
    return "photos";
  }
  if (file.mimeType.startsWith("video/")) {
    return "videos";
  }
  if (file.mimeType.startsWith("audio/")) {
    return "audio";
  }
  return "documents";
}

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
  const Icon = fileIcon(file);

  return (
    <button
      type="button"
      className={`storage-tile ${isSelected ? "selected" : ""} ${fileKind(file)}`}
      aria-pressed={isSelected}
      onClick={() => {
        onSelect();
        if (previewUrl) {
          onOpenImage(file, previewUrl);
        }
      }}
    >
      {file.isFavorite && (
        <small className="storage-favorite-badge" aria-label="Favorite">
          <Heart aria-hidden="true" size={13} />
        </small>
      )}
      {previewUrl ? <img src={previewUrl} alt={file.originalName} /> : <Icon aria-hidden="true" size={28} />}
      <span>
        <strong>{file.originalName}</strong>
        <small>{formatFileSize(file.sizeBytes)}</small>
      </span>
    </button>
  );
}

export default function FilesPage() {
  const { accessToken, authRequest, currentUser } = useAuth();
  const [family, setFamily] = useState<Family | null>(null);
  const [files, setFiles] = useState<FamilyFile[]>([]);
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [fullViewImage, setFullViewImage] = useState<{
    file: FamilyFile;
    previewUrl: string;
  } | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<StorageFilter>("all");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const moreMenuRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async () => {
    if (!accessToken) {
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const [familyResult, filesResult] = await Promise.all([
        authRequest<Family>("/api/family"),
        authRequest<FamilyFile[]>("/api/files")
      ]);
      setFamily(familyResult);
      setFiles(filesResult);
      setSelectedFileId((current) => current ?? filesResult[0]?.id ?? null);
    } catch (err) {
      setError(err instanceof ApiError ? String(err.message) : "Could not load storage");
    } finally {
      setIsLoading(false);
    }
  }, [accessToken, authRequest]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    function handleDocumentMouseDown(event: MouseEvent) {
      if (!moreMenuRef.current?.contains(event.target as Node)) {
        setIsMoreMenuOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsMoreMenuOpen(false);
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
      if (filter !== "all" && filter !== "favorites" && fileKind(file) !== filter) {
        return false;
      }
      if (filter === "favorites" && !file.isFavorite) {
        return false;
      }
      return (
        !query ||
        `${file.originalName} ${file.mimeType} ${chatFolderLabel(file)}`.toLowerCase().includes(query)
      );
    });
  }, [files, filter, search]);

  const selectedFile =
    filteredFiles.find((file) => file.id === selectedFileId) ?? filteredFiles[0] ?? files[0] ?? null;
  const selectedFilePreviewUrl = useFilePreviewUrl(accessToken, selectedFile);

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
      setSelectedFileId(uploadedFiles[0]?.id ?? null);
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
      setSelectedFileId(updated.id);
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
      setSelectedFileId((current) => (current === fileId ? null : current));
      setFullViewImage((current) => (current?.file.id === fileId ? null : current));
      setNotice("Moved to trash");
    } catch (err) {
      setError(err instanceof ApiError ? String(err.message) : "Could not delete file");
    }
  }

  return (
    <main className="app-shell app-frame storage-page">
      <AppNav />
      <section className="page-surface storage-layout" aria-busy={isLoading || isUploading}>
        <div className="storage-main">
          <header className="section-header">
            <div>
              <p className="eyebrow">{family?.name ?? "Velo"}</p>
              <h1>Storage</h1>
            </div>
            <div className="section-actions">
              <button
                type="button"
                className="primary-upload-button"
                disabled={isUploading}
                onClick={() => uploadInputRef.current?.click()}
              >
                <Upload aria-hidden="true" size={18} />
                {isUploading ? "Uploading" : "Upload"}
              </button>
              <input
                ref={uploadInputRef}
                className="visually-hidden"
                multiple
                type="file"
                onChange={handleUpload}
              />
              <div className="menu-anchor" ref={moreMenuRef}>
                <button
                  type="button"
                  className="icon-button subtle"
                  aria-label="More storage actions"
                  aria-expanded={isMoreMenuOpen}
                  aria-haspopup="menu"
                  title="More storage actions"
                  onClick={() => setIsMoreMenuOpen((value) => !value)}
                >
                  <MoreVertical aria-hidden="true" size={20} />
                </button>
                {isMoreMenuOpen && (
                  <div className="action-menu" role="menu">
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        uploadInputRef.current?.click();
                        setIsMoreMenuOpen(false);
                      }}
                    >
                      <Upload aria-hidden="true" size={16} />
                      Upload files
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        void load();
                        setIsMoreMenuOpen(false);
                      }}
                    >
                      <RefreshCw aria-hidden="true" size={16} />
                      Refresh
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setFilter("favorites");
                        setIsMoreMenuOpen(false);
                      }}
                    >
                      <Heart aria-hidden="true" size={16} />
                      Show favorites
                    </button>
                  </div>
                )}
              </div>
            </div>
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
          ) : groupedFiles.length === 0 ? (
            <div className="empty-state storage-empty-state">
              <HardDriveIcon />
              <strong>{filter === "favorites" ? "No favorites yet" : "No files saved yet"}</strong>
              <p>Files saved from chats and direct uploads will appear here.</p>
              <button
                type="button"
                className="primary-upload-button"
                disabled={isUploading}
                onClick={() => uploadInputRef.current?.click()}
              >
                <Upload aria-hidden="true" size={18} />
                Upload files
              </button>
            </div>
          ) : (
            <div className="storage-timeline">
              {groupedFiles.map((group) => (
                <section className="storage-month" key={group.id}>
                  <div className="storage-folder-heading">
                    <h2>{group.label}</h2>
                    <span>{group.access}</span>
                  </div>
                  <div className="storage-grid">
                    {group.items.map((file) => (
                      <StorageTile
                        accessToken={accessToken}
                        file={file}
                        isSelected={selectedFile?.id === file.id}
                        key={file.id}
                        onOpenImage={(imageFile, previewUrl) =>
                          setFullViewImage({ file: imageFile, previewUrl })
                        }
                        onSelect={() => setSelectedFileId(file.id)}
                      />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>

        <aside className="storage-details-panel">
          {selectedFile ? (
            <>
              {selectedFilePreviewUrl ? (
                <button
                  type="button"
                  className="storage-preview storage-preview-button"
                  aria-label={`Open ${selectedFile.originalName} full view`}
                  onClick={() =>
                    setFullViewImage({ file: selectedFile, previewUrl: selectedFilePreviewUrl })
                  }
                >
                  <img src={selectedFilePreviewUrl} alt={selectedFile.originalName} />
                </button>
              ) : (
                <div className="storage-preview">
                  {(() => {
                    const Icon = fileIcon(selectedFile);
                    return <Icon aria-hidden="true" size={42} />;
                  })()}
                </div>
              )}
              <div className="storage-details-copy">
                <h2>{selectedFile.originalName}</h2>
                <p>{selectedFile.mimeType}</p>
              </div>
              <div className="details-action-row">
                {accessToken && (
                  <button type="button" onClick={() => void saveFileToDisk(accessToken, selectedFile)}>
                    <Download aria-hidden="true" size={18} />
                    Download
                  </button>
                )}
                <button
                  type="button"
                  aria-pressed={selectedFile.isFavorite}
                  onClick={() => void handleFavoriteToggle(selectedFile)}
                >
                  <Heart aria-hidden="true" size={18} />
                  {selectedFile.isFavorite ? "Favorited" : "Favorite"}
                </button>
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
                <div>
                  <dt>Checksum</dt>
                  <dd>{selectedFile.checksum ?? "Pending"}</dd>
                </div>
              </dl>
              {canDeleteFile(selectedFile, currentUser?.id, currentUser?.role) && (
                <button
                  type="button"
                  className="danger-action"
                  onClick={() => void handleDelete(selectedFile.id)}
                >
                  <Trash2 aria-hidden="true" size={18} />
                  Move to trash
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
