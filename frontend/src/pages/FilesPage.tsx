import { ChangeEvent, useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Download,
  Archive,
  ChevronDown,
  FileAudio,
  FileSpreadsheet,
  FileText,
  FileType,
  Forward,
  Heart,
  Home,
  Image,
  Info,
  Maximize2,
  Minimize2,
  Hash,
  LockKeyhole,
  MoreVertical,
  MessageCircle,
  Megaphone,
  RefreshCw,
  Search,
  Settings2,
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
import type { Canvas } from "../api/canvas";
import type { Checklist } from "../api/checklist";
import { useAuth } from "../auth/AuthContext";
import { AudioPlayer } from "../components/AudioPlayer";
import {
  DocumentAttachmentPreview,
  detectDocumentPreviewKind
} from "../components/DocumentAttachmentPreview";
import ImageLightbox from "../components/ImageLightbox";
import { VideoPlayer } from "../components/VideoPlayer";
import { SidebarCollapseButton } from "../components/ui/SidebarCollapseButton";
import useFilePreviewUrl from "../hooks/useFilePreviewUrl";
import { storagePreviewVideoStyle } from "../components/video-player/storagePreviewStyle";
import AppNav from "./AppNav";
import { buildAudioSourceFactory } from "../features/chats/shared/audioSourceFactory";
import { StorageCollections, type StorageCollectionPickerRequest } from "../components/StorageCollections";
import { StorageCanvases } from "../components/StorageCanvases";
import { StorageChecklists } from "../components/StorageChecklists";
import { PopupDialog } from "../components/ui/Popup";
import { useResolvedLanguage, useStrings } from "../i18n/LanguageContext";
import {
  loadCachedFileList,
  loadCachedStorageItemsFromLocalStorage,
  saveCachedFileList
} from "../fileLibraryCache";
import { loadCachedChatListFromLocalStorage, saveCachedChatList } from "../chatHistoryCache";
import { syncChatReplicaDeltas } from "../features/chats/sidebar/chatDeltaSync";
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
  const documentKind = detectDocumentPreviewKind(file);
  if (documentKind === "table") return FileSpreadsheet;
  if (documentKind === "docx") return FileType;
  return FileText;
}

function fileTypeLabel(file: FamilyFile) {
  const extension = file.originalName.split(".").pop()?.toUpperCase() ?? "FILE";
  if (extension === "DOCX" || extension === "DOC") return "DOC";
  if (extension === "XLSX" || extension === "XLS") return "XLS";
  return extension.length <= 5 ? extension : "FILE";
}

function groupLabel(value: string, locale: string) {
  return new Date(value).toLocaleDateString(locale, { month: "long", year: "numeric" });
}

function chatFolderLabel(file: FamilyFile, strings: ReturnType<typeof useStrings>) {
  if (file.chatTitle) {
    return file.chatTitle;
  }
  if (file.chatType === "archive") return strings.chats.types.messageArchive;
  if (file.chatType === "family") {
    return strings.chats.types.generalFamilyChat;
  }
  if (file.chatType === "group") {
    return strings.chats.types.groupChat;
  }
  if (file.chatType === "channel") {
    return strings.chats.types.channel;
  }
  if (file.chatType === "direct") {
    return strings.chats.types.directChat;
  }
  return strings.chats.types.familyChat;
}

function accessLabel(file: FamilyFile, sharedStorageLabel: string) {
  return file.accessScope === "family" ? sharedStorageLabel : "Chat members";
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
  return <span className="avatar-initials" aria-hidden="true">{chatInitials(label)}</span>;
}

function StorageTile({
  accessToken,
  file,
  isSelected,
  selectionLocked = false,
  suppressPreview = false,
  onSelect,
  onOpenImage,
  favoriteLabel
}: {
  accessToken: string | null;
  file: FamilyFile;
  isSelected: boolean;
  selectionLocked?: boolean;
  suppressPreview?: boolean;
  onSelect: () => void;
  onOpenImage: (file: FamilyFile, previewUrl: string) => void;
  favoriteLabel: string;
}) {
  const isMockVideo = import.meta.env.MODE === "mock" && fileKind(file) === "videos";
  const previewUrl = useFilePreviewUrl(accessToken, file, true, isMockVideo);
  const [videoPreviewUrl, setVideoPreviewUrl] = useState<string | null>(null);
  const Icon = fileIcon(file);

  useEffect(() => {
    if (!accessToken || fileKind(file) !== "videos" || import.meta.env.MODE === "mock") {
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
      className={`storage-tile ${isSelected ? "selected" : ""} ${selectionLocked ? "selection-locked" : ""} ${fileKind(file)}`}
      data-storage-file-id={file.id}
      data-file-type={fileTypeLabel(file)}
      aria-pressed={isSelected}
      aria-disabled={selectionLocked || undefined}
      onClick={() => {
        if (selectionLocked) return;
        onSelect();
        const isMobileViewport = window.matchMedia("(max-width: 1024px)").matches;
        if (!suppressPreview && shouldOpenStorageTilePreview(Boolean(previewUrl), isMobileViewport) && previewUrl) {
          onOpenImage(file, previewUrl);
        }
      }}
    >
      {file.isFavorite && (
        <small className="storage-favorite-badge" aria-label={favoriteLabel}>
          <Heart aria-hidden="true" size={13} />
        </small>
      )}
      {fileKind(file) === "videos" && videoPreviewUrl ? (
        <video muted preload="metadata" src={videoPreviewUrl} />
      ) : previewUrl ? <img src={previewUrl} alt={file.originalName} /> : <div className="storage-file-type-icon"><Icon aria-hidden="true" size={42} /><b>{fileTypeLabel(file)}</b></div>}
      <span>
        <strong>{file.originalName}</strong>
        <small>{formatFileSize(file.sizeBytes)}</small>
      </span>
    </button>
  );
}

export default function FilesPage() {
  const strings = useStrings();
  const navigate = useNavigate();
  const { accessToken, authRequest, currentUser } = useAuth();
  const [family, setFamily] = useState<Family | null>(null);
  const [files, setFiles] = useState<FamilyFile[]>([]);
  const [chats, setChats] = useState<Chat[]>(() =>
    currentUser?.id ? loadCachedChatListFromLocalStorage<Chat>(currentUser.id) ?? [] : []
  );
  const [storageCanvases, setStorageCanvases] = useState<Canvas[]>(() =>
    currentUser?.id ? loadCachedStorageItemsFromLocalStorage<Canvas>(currentUser.id, "canvases") ?? [] : []
  );
  const [storageChecklists, setStorageChecklists] = useState<Checklist[]>(() =>
    currentUser?.id ? loadCachedStorageItemsFromLocalStorage<Checklist>(currentUser.id, "checklists") ?? [] : []
  );
  const [selection, dispatchSelection] = useReducer(
    storageSelectionReducer,
    initialStorageSelection
  );
  const { selectedFileId } = selection;
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
  const [isSourceSidebarCollapsed, setIsSourceSidebarCollapsed] = useState(false);
  const [isMetadataMenuOpen, setIsMetadataMenuOpen] = useState(false);
  const [isMetadataInformationOpen, setIsMetadataInformationOpen] = useState(false);
  const [isPreviewExpanded, setIsPreviewExpanded] = useState(false);
  const [previewImageSize, setPreviewImageSize] = useState({ fileId: "", width: 16, height: 9 });
  const [isSettingsMenuOpen, setIsSettingsMenuOpen] = useState(false);
  const groupFilesByChat = false;
  const groupFoldersByChat = false;
  const [collectionPicker, setCollectionPicker] = useState<StorageCollectionPickerRequest | null>(null);
  const [collectionPickedIds, setCollectionPickedIds] = useState<string[]>([]);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const sourceMenuRef = useRef<HTMLDivElement | null>(null);
  const storageFilters: Array<{ label: string; value: StorageFilter }> = [
    { label: strings.files.filters.all, value: "all" },
    { label: strings.files.filters.photos, value: "photos" },
    { label: strings.files.filters.videos, value: "videos" },
    { label: strings.files.filters.audio, value: "audio" },
    { label: strings.files.filters.documents, value: "documents" },
    { label: strings.files.filters.canvases ?? "Canvases", value: "canvases" },
    { label: strings.files.filters.checklists ?? "Checklists", value: "checklists" },
    { label: strings.files.filters.favorites, value: "favorites" }
  ];

  useEffect(() => {
    window.localStorage.removeItem("stovo_storage_group_files");
    window.localStorage.removeItem("stovo_storage_group_folders");
  }, []);
  const storageSourceItems = useMemo(() => {
    const chatLinks = (id: string, originChatId: string, linkedChatIds: string[], mimeType: string) =>
      [...new Set([originChatId, ...linkedChatIds].filter(Boolean))].map((chatId) => ({
        id: `${id}:${chatId}`,
        chatId,
        chatTitle: null,
        chatType: null,
        mimeType
      }));
    return [
      ...files,
      ...storageCanvases.flatMap((canvas) => chatLinks(canvas.id, canvas.originChatId, canvas.linkedChatIds, "application/x-stovo-canvas")),
      ...storageChecklists.flatMap((checklist) => chatLinks(checklist.id, checklist.originChatId, checklist.linkedChatIds, "application/x-stovo-checklist"))
    ];
  }, [files, storageCanvases, storageChecklists]);
  const sourceGroups = useMemo(() => {
    return buildStorageSources(storageSourceItems, chats, currentUser?.id, {
      archive: strings.files.categories.archive,
      archiveTitle: strings.chats.sections.archive,
      voice: strings.files.categories.voice,
      family: strings.files.categories.family,
      groups: strings.files.categories.groups,
      channels: strings.files.categories.channels,
      direct: strings.files.categories.direct
    });
  }, [storageSourceItems, chats, currentUser?.id, strings]);
  const selectedSource = sourceGroups.flatMap((group) => group.sources)
    .find((source) => source.chatId === sourceChatId);
  const closeMobileDetails = useCallback(() => {
    const fileIdToRestore = selectedFileId;
    setFullViewImage(null);
    setIsMetadataMenuOpen(false);
    setIsMetadataInformationOpen(false);
    setIsPreviewExpanded(false);
    dispatchSelection({ type: "close" });
    window.requestAnimationFrame(() => {
      const selectedTile = Array.from(
        document.querySelectorAll<HTMLElement>("[data-storage-file-id]")
      ).find((element) => element.dataset.storageFileId === fileIdToRestore);
      selectedTile?.focus();
    });
  }, [selectedFileId]);

  const load = useCallback(async (includeFiles = true) => {
    if (!accessToken) {
      return;
    }
    // Only show the full-page spinner when there is no cached content to display.
    if (files.length === 0) setIsLoading(true);
    setError(null);
    try {
      const [familyResult, filesResult, chatsResult] = await Promise.all([
        authRequest<Family>("/api/family"),
        includeFiles ? authRequest<FamilyFile[]>("/api/files") : Promise.resolve(null),
        getChats(accessToken)
      ]);
      setFamily(familyResult);
      if (filesResult) {
        setFiles(filesResult);
        if (currentUser?.id) {
          void saveCachedFileList(currentUser.id, filesResult);
        }
        dispatchSelection({ type: "load-default", fileId: filesResult[0]?.id ?? null });
      }
      setChats(chatsResult);
      if (currentUser?.id) void saveCachedChatList(currentUser.id, chatsResult);
    } catch (err) {
      setError(err instanceof ApiError ? String(err.message) : "Could not load storage");
    } finally {
      setIsLoading(false);
    }
  }, [accessToken, authRequest, currentUser?.id, files.length]);

  useEffect(() => {
    dispatchSelection({ type: "reset-gallery" });
  }, []);

  useEffect(() => {
    let cancelled = false;
    const userId = currentUser?.id;
    void (async () => {
      const cached = userId ? await loadCachedFileList<FamilyFile>(userId) : null;
      if (cancelled) return;
      if (cached !== null) {
        setFiles(cached);
        setIsLoading(false);
        dispatchSelection({ type: "load-default", fileId: cached[0]?.id ?? null });
        // Keep cached bytes available for a fast first paint, but refresh the
        // file metadata. A file can gain a chat folder when it is attached to
        // a message, and that relationship is not represented by the cached
        // list alone.
        await load(true);
        if (!accessToken || !userId || cancelled) return;
        await syncChatReplicaDeltas({
          accessToken,
          userId,
          onFileChanged: async (fileId, changed) => {
            if (cancelled) return;
            setFiles((current) => changed
              ? [changed, ...current.filter((file) => file.id !== fileId)].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
              : current.filter((file) => file.id !== fileId));
            if (!changed) dispatchSelection({ type: "remove", fileId });
          },
        });
        return;
      }
      await load(true);
    })().catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [accessToken, currentUser?.id, load]);

  useEffect(() => {
    const userId = currentUser?.id;
    setChats(userId ? loadCachedChatListFromLocalStorage<Chat>(userId) ?? [] : []);
  }, [currentUser?.id]);

  useEffect(() => {
    const userId = currentUser?.id;
    setStorageCanvases(userId ? loadCachedStorageItemsFromLocalStorage<Canvas>(userId, "canvases") ?? [] : []);
    setStorageChecklists(userId ? loadCachedStorageItemsFromLocalStorage<Checklist>(userId, "checklists") ?? [] : []);
  }, [currentUser?.id]);

  useEffect(() => {
    if (!isMetadataMenuOpen && !isSettingsMenuOpen) return undefined;
    function handlePopoverOutside(event: MouseEvent | TouchEvent) {
      if ((event.target as Element).closest(".storage-popover-anchor")) return;
      setIsMetadataMenuOpen(false);
      setIsSettingsMenuOpen(false);
    }
    function handlePopoverEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      setIsMetadataMenuOpen(false);
      setIsSettingsMenuOpen(false);
    }
    document.addEventListener("mousedown", handlePopoverOutside);
    document.addEventListener("touchstart", handlePopoverOutside);
    document.addEventListener("keydown", handlePopoverEscape);
    return () => {
      document.removeEventListener("mousedown", handlePopoverOutside);
      document.removeEventListener("touchstart", handlePopoverOutside);
      document.removeEventListener("keydown", handlePopoverEscape);
    };
  }, [isMetadataMenuOpen, isSettingsMenuOpen]);

  useEffect(() => {
    if (!isSourceMenuOpen) {
      return;
    }
    function handleDocumentMouseDown(event: MouseEvent | TouchEvent) {
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
    document.addEventListener("touchstart", handleDocumentMouseDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleDocumentMouseDown);
      document.removeEventListener("touchstart", handleDocumentMouseDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isSourceMenuOpen]);

  const filteredFiles = useMemo(() => {
    const query = search.trim().toLowerCase();
    return files.filter((file) => {
      const isOutsideSelectedSource = sourceChatId
        && file.chatId !== sourceChatId;
      if (!matchesStorageFilter(file, filter) || isOutsideSelectedSource) {
        return false;
      }
      return (
        !query ||
        `${file.originalName} ${file.mimeType} ${chatFolderLabel(file, strings)}`.toLowerCase().includes(query)
      );
    });
  }, [files, filter, search, sourceChatId]);

  const collectionPickerFiles = useMemo(() => collectionPicker ? filteredFiles.filter((file) => collectionPicker.allowedFileIds.includes(file.id) || collectionPicker.lockedFileIds.includes(file.id)) : filteredFiles, [collectionPicker, filteredFiles]);

  const selectedFile = filteredFiles.find((file) => file.id === selectedFileId) ?? null;
  const selectedFilePreviewUrl = useFilePreviewUrl(accessToken, selectedFile);
  const selectedDocumentKind = selectedFile ? detectDocumentPreviewKind(selectedFile) : "unsupported";

  const groupedFiles = useMemo(() => {
    return filteredFiles.reduce<
      Array<{ id: string; label: string; access: string; items: FamilyFile[] }>
    >((groups, file) => {
      const id = file.chatId ?? "workspace";
      const label = chatFolderLabel(file, strings);
      const existing = groups.find((group) => group.id === id);
      if (existing) {
        existing.items.push(file);
      } else {
        groups.push({ id, label, access: accessLabel(file, strings.files.familyStorage), items: [file] });
      }
      return groups;
    }, []);
  }, [filteredFiles, strings]);
  const resolvedLanguage = useResolvedLanguage();
  const renderStorageTile = (file: FamilyFile) => (
    <StorageTile
      accessToken={accessToken}
      file={file}
      favoriteLabel={strings.files.favorite}
      isSelected={collectionPicker ? collectionPicker.lockedFileIds.includes(file.id) || collectionPickedIds.includes(file.id) : selectedFile?.id === file.id}
      selectionLocked={Boolean(collectionPicker?.lockedFileIds.includes(file.id))}
      suppressPreview={Boolean(collectionPicker)}
      key={file.id}
      onOpenImage={(imageFile, previewUrl) => setFullViewImage({ file: imageFile, previewUrl })}
      onSelect={() => collectionPicker ? setCollectionPickedIds((ids) => ids.includes(file.id) ? ids.filter((id) => id !== file.id) : [...ids, file.id]) : dispatchSelection(storageTileSelectionAction(window.matchMedia("(max-width: 1024px)").matches, file.id))}
    />
  );
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
        uploadedFiles.push(await uploadFile(accessToken, file, undefined, undefined, currentUser?.id));
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
    <main className={`app-shell app-frame storage-page${family?.minimizedChatLayout ? " storage-page--minimized-layout" : ""}${selectedFile && !collectionPicker ? " has-storage-selection" : ""}${collectionPicker ? " is-collection-picking" : ""}`}>
      <AppNav />
      <section className={`page-surface storage-layout${isSourceSidebarCollapsed ? " storage-layout--source-collapsed" : ""}`} aria-busy={isLoading || isUploading}>
        <aside className="storage-source-sidebar" aria-label={strings.files.storageSource}>
          <SidebarCollapseButton
            expanded={!isSourceSidebarCollapsed}
            expandLabel={strings.auditUi.expandStorageSources}
            collapseLabel={strings.auditUi.collapseStorageSources}
            onToggle={() => setIsSourceSidebarCollapsed((collapsed) => !collapsed)}
            className="storage-source-collapse"
          />
          <div className="storage-source-scroll">
          <div className="storage-mobile-source-picker" ref={sourceMenuRef}>
            <button
              type="button"
              className="storage-mobile-source-trigger"
              aria-expanded={isSourceMenuOpen}
              aria-haspopup="listbox"
              onClick={() => setIsSourceMenuOpen((isOpen) => !isOpen)}
            >
              <span className="storage-mobile-source-copy">
                <strong>{selectedSource?.label ?? strings.files.allChats}</strong>
                <small>{selectedSource?.fileCount ?? files.length} files</small>
              </span>
              <ChevronDown aria-hidden="true" size={20} />
            </button>
            {isSourceMenuOpen && (
              <div className="storage-mobile-source-menu" role="listbox" aria-label={strings.files.storageSource}>
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
                  <span><strong>{strings.files.allChats}</strong><small>{files.length} files</small></span>
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
                            file={source.avatarFile as FamilyFile | null}
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
            <span className="storage-source-copy"><strong>{strings.files.allChats}</strong><small>{files.length} files</small></span>
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
                      file={source.avatarFile as FamilyFile | null}
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
          </div>
        </aside>
        <div className="storage-main">
          <header className="section-header">
            <div aria-hidden="true" />
          </header>
          {error && <p className="error-text">{error}</p>}
          {notice && <p className="success-text">{notice}</p>}

          <div className="storage-main-header">
            <div className="storage-search-tools">
              <label className="search-field storage-search">
                <Search aria-hidden="true" size={18} />
                <input
                  placeholder={strings.files.searchPlaceholder}
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </label>
              <div className="storage-popover-anchor">
                <button
                  type="button"
                  className="storage-search-settings"
                  aria-label={strings.files.storageSettings}
                  aria-expanded={isSettingsMenuOpen}
                  onClick={() => setIsSettingsMenuOpen((open) => !open)}
                >
                  <Settings2 aria-hidden="true" size={18} />
                </button>
                {isSettingsMenuOpen && (
                  <div className="storage-settings-menu" role="group" aria-label={strings.files.storageSettings}>
                    <h3>{strings.files.storageSettings}</h3>
                    <button type="button" className="storage-setting-option" aria-label={strings.files.fileGroups} aria-pressed={groupFilesByChat} disabled>
                      <span><strong>{strings.files.fileGroups}</strong><small>{strings.files.groupFilesByChat}</small></span>
                      <span className="storage-setting-option-meta"><small className="premium-badge">{strings.files.premium}</small><span className={groupFilesByChat ? "storage-setting-switch is-on" : "storage-setting-switch"} aria-hidden="true" /></span>
                    </button>
                    <button type="button" className="storage-setting-option" aria-label={strings.files.folderGroups} aria-pressed={groupFoldersByChat} disabled>
                      <span><strong>{strings.files.folderGroups}</strong><small>{strings.files.groupFoldersByChat}</small></span>
                      <span className="storage-setting-option-meta"><small className="premium-badge">{strings.files.premium}</small><span className={groupFoldersByChat ? "storage-setting-switch is-on" : "storage-setting-switch"} aria-hidden="true" /></span>
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="filter-chip-row" aria-label={strings.files.storageFilters}>
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
          </div>

          <div className="storage-content-area">
            {!collectionPicker && filter !== "canvases" && filter !== "checklists" && <StorageCollections accessToken={accessToken} files={files} filter={filter} currentUserId={currentUser?.id} groupByChat={groupFoldersByChat} groupFallbackLabel={strings.files.sharedFolderGroup} onFilesChanged={() => void load(true)} onSelectFromStorage={(request) => { setFilter("all"); setSourceChatId(null); setSearch(""); setCollectionPickedIds([]); setCollectionPicker(request); }} />}
            {filter !== "canvases" && filter !== "checklists" && (![".canvas", "*.canvas", "type:canvas", "ext:canvas", ".checklist", "*.checklist", "type:checklist", "ext:checklist"].includes(search.trim().toLowerCase()) || collectionPickerFiles.length > 0) && <>
            <div className="storage-files-heading">
              <div><h2>{collectionPicker ? `Add to ${collectionPicker.collectionTitle}` : strings.files.title}</h2>{collectionPicker && <p className="storage-picker-hint">{strings.files.pickerDescription}</p>}</div>
              {!collectionPicker && <button type="button" className="storage-files-upload" title={strings.files.uploadFiles} aria-label={strings.files.uploadFiles} disabled={isUploading} onClick={() => uploadInputRef.current?.click()}><Upload size={15} /></button>}
              <input ref={uploadInputRef} className="visually-hidden" type="file" multiple onChange={handleUpload} />
            </div>
            {isLoading ? (
              <div className="storage-grid skeleton-grid" aria-hidden="true">
                {Array.from({ length: 10 }).map((_, index) => (
                  <span className="storage-tile skeleton-tile" key={index} />
                ))}
              </div>
            ) : collectionPickerFiles.length === 0 ? (
              <div className="empty-state storage-empty-state">
                <HardDriveIcon />
                <strong>{strings.files.empty}</strong>
              </div>
            ) : (
              groupFilesByChat && !collectionPicker ? (
                <div className="storage-file-groups">
                  {groupedFiles.map((group) => (
                    <section className="storage-file-group" key={group.id}>
                      <h3 className="storage-group-heading">{group.label}</h3>
                      <div className="storage-grid">{group.items.map(renderStorageTile)}</div>
                    </section>
                  ))}
                </div>
              ) : <div className="storage-grid">{collectionPickerFiles.map(renderStorageTile)}</div>
            )}
            </>}
            {!collectionPicker && <StorageCanvases accessToken={accessToken} userId={currentUser?.id} filter={filter} search={search} sourceChatId={sourceChatId} onCanvasesChange={setStorageCanvases} />}
            {!collectionPicker && <StorageChecklists accessToken={accessToken} userId={currentUser?.id} filter={filter} search={search} sourceChatId={sourceChatId} onChecklistsChange={setStorageChecklists} />}
          </div>
        </div>

        {collectionPicker && <div className="storage-selection-bar" role="region" aria-label={strings.files.folderFileSelection}><span>{collectionPickedIds.length ? `${collectionPickedIds.length} file${collectionPickedIds.length === 1 ? "" : "s"} selected` : strings.files.selectFilesToAdd}</span><div><button type="button" onClick={() => { const picker = collectionPicker; setCollectionPicker(null); setCollectionPickedIds([]); navigate(`/app/files?collection=${encodeURIComponent(picker.collectionId)}`); }}>{strings.files.cancelSelection}</button><button type="button" className="primary-button" disabled={!collectionPickedIds.length} onClick={() => { const picker = collectionPicker; const pickedIds = collectionPickedIds; void picker.onConfirm(pickedIds).then(() => { setCollectionPicker(null); setCollectionPickedIds([]); navigate(`/app/files?collection=${encodeURIComponent(picker.collectionId)}`); }); }}>{strings.files.addSelected}</button></div></div>}

        {selectedFile && !collectionPicker && (
          <PopupDialog
            className={`storage-preview-dialog${isPreviewExpanded ? " is-expanded" : ""}`}
            backdropClassName="storage-preview-backdrop"
            ariaLabelledBy="storage-file-details-title"
            onClose={closeMobileDetails}
            closeLabel={strings.files.closeDetails}
            closeOnBackdrop
            closeOnEscape={!isMetadataMenuOpen && !isMetadataInformationOpen}
            size="xl"
          >
            <header className="storage-mobile-detail-header">
              <h2 id="storage-file-details-title" title={selectedFile.originalName}>{selectedFile.originalName}</h2>
            </header>
            <div className="storage-preview storage-preview-frame">
              <div className="storage-preview-media">
                <div className="storage-preview-actions">
                  {accessToken && <button type="button" aria-label={strings.files.download} title={strings.files.download} onClick={() => void saveFileToDisk(accessToken, selectedFile)}><Download aria-hidden="true" size={20} /></button>}
                  <button type="button" aria-label={strings.files.fullScreen} aria-pressed={isPreviewExpanded} title={strings.files.fullScreen} onClick={() => setIsPreviewExpanded((expanded) => !expanded)}>{isPreviewExpanded ? <Minimize2 aria-hidden="true" size={20} /> : <Maximize2 aria-hidden="true" size={20} />}</button>
                  <div className="storage-popover-anchor storage-metadata-anchor">
                    <button type="button" aria-label={strings.files.moreActions} aria-expanded={isMetadataMenuOpen} title={strings.files.moreActions} onClick={() => setIsMetadataMenuOpen((open) => !open)}><MoreVertical aria-hidden="true" size={20} /></button>
                    {isMetadataMenuOpen && (
                      <div className="storage-metadata-menu" role="region" aria-label={strings.files.moreActions}>
                        <button type="button" className="storage-metadata-action" aria-label={strings.files.metadata} onClick={() => { setIsMetadataMenuOpen(false); setIsMetadataInformationOpen(true); }}><Info aria-hidden="true" size={17} />{strings.files.metadata}</button>
                        {selectedFile.chatId && selectedFile.originMessageId && <button type="button" className="storage-metadata-action" aria-label={strings.files.openInChat} onClick={() => { setIsMetadataMenuOpen(false); navigate(`/app/chats/${selectedFile.chatId}?message=${selectedFile.originMessageId}`); }}><MessageCircle aria-hidden="true" size={17} />{strings.files.openInChat}</button>}
                        <button type="button" className="storage-metadata-action" aria-label={selectedFile.isFavorite ? strings.files.removeFavorite : strings.files.favorite} aria-pressed={selectedFile.isFavorite} onClick={() => void handleFavoriteToggle(selectedFile)}><Heart aria-hidden="true" size={17} />{selectedFile.isFavorite ? strings.files.removeFavorite : strings.files.favorite}</button>
                        {canDeleteFile(selectedFile, currentUser?.id, currentUser?.role) && <button type="button" className="storage-metadata-action storage-delete-icon" aria-label={strings.files.delete} onClick={() => void handleDelete(selectedFile.id)}><Trash2 aria-hidden="true" size={17} />{strings.files.delete}</button>}
                      </div>
                    )}
                  </div>
                </div>
                {fileKind(selectedFile) === "audio" && accessToken ? (
                  <AudioPlayer descriptor={{ identity: { chatId: selectedFile.chatId ?? "storage", messageId: selectedFile.originMessageId ?? selectedFile.id, fileId: selectedFile.id }, title: selectedFile.originalName, mimeType: selectedFile.mimeType }} sourceFactory={buildAudioSourceFactory(accessToken)} hideTitle accessToken={accessToken} />
                ) : fileKind(selectedFile) === "videos" && accessToken ? (
                  <VideoPlayer file={selectedFile} accessToken={accessToken} identity={{ chatId: selectedFile.chatId ?? "storage", messageId: selectedFile.originMessageId ?? selectedFile.id, fileId: selectedFile.id }} autoplay={false} previewExpanded={isPreviewExpanded} />
                ) : selectedDocumentKind !== "unsupported" && accessToken ? (
                  <DocumentAttachmentPreview accessToken={accessToken} file={selectedFile} inlinePreview hideActions />
                ) : selectedFilePreviewUrl ? (
                  <img key={selectedFile.id} src={selectedFilePreviewUrl} alt={selectedFile.originalName}
                    style={storagePreviewVideoStyle(previewImageSize.fileId === selectedFile.id ? previewImageSize.width : 16, previewImageSize.fileId === selectedFile.id ? previewImageSize.height : 9, window.innerWidth, window.innerHeight, isPreviewExpanded)}
                    onLoad={(event) => setPreviewImageSize({ fileId: selectedFile.id, width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })} />
                ) : (
                  (() => {
                    const Icon = fileIcon(selectedFile);
                    return <Icon aria-hidden="true" size={42} />;
                  })()
                )}
              </div>
            </div>
          </PopupDialog>
        )}

        {selectedFile && isMetadataInformationOpen && (
          <PopupDialog
            className="storage-metadata-information-dialog"
            ariaLabel={strings.files.metadata}
            onClose={() => setIsMetadataInformationOpen(false)}
            closeLabel={strings.files.closeMetadata}
            closeOnBackdrop
            closeOnEscape
            size="sm"
          >
            <h2>{strings.files.metadata}</h2>
            <dl className="file-detail-list">
              <div><dt>{strings.files.size}</dt><dd>{formatFileSize(selectedFile.sizeBytes)}</dd></div>
              <div><dt>{strings.files.saved}</dt><dd>{groupLabel(selectedFile.createdAt, resolvedLanguage)}</dd></div>
              <div><dt>{strings.files.source}</dt><dd>{chatFolderLabel(selectedFile, strings)} / {accessLabel(selectedFile, strings.files.familyStorage)}</dd></div>
            </dl>
          </PopupDialog>
        )}

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
