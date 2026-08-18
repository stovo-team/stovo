import { type ReactNode, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import EmojiPicker, { EmojiClickData, Theme } from "emoji-picker-react";
import { AudioLines, Camera, Check, FileText, Image as ImageIcon, Music, Paperclip, Smile } from "lucide-react";
import { Capacitor } from "@capacitor/core";
import { App } from "@capacitor/app";

import {
  isNativeMediaLibraryAvailable,
  getCachedNativeMedia,
  listNativeMedia,
  nativeMediaPreviewUrl,
  fetchNativeMediaFileUrl,
  selectNativeMediaFiles,
  type NativeMediaItem
} from "../native/mediaLibraryPlugin";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { EMOJI_CATEGORY_ICONS } from "../features/chats/composer/Composer";
import ImageLightbox from "./ImageLightbox";
import { MessageEnlargeButton } from "./MessageEnlargeModal";

export type AttachmentPickerOption = "gallery" | "camera" | "audio" | "file";
export type AttachmentPickerTab = "gallery" | "file" | "audio";

type AttachmentPickerSheetProps = {
  open: boolean;
  onClose: () => void;
  onPick: (option: AttachmentPickerOption) => void;
  onSelectFiles?: (files: File[]) => void;
  onSendSelectedFiles?: (files: File[], message: string) => void | Promise<void>;
  composer?: string;
  onComposerChange?: (value: string) => void;
  resolvedThemeMode?: "light" | "dark";
  onEnlargeComposer?: () => void;
  isUploading?: boolean;
  isSendingMessage?: boolean;
  previewMediaItem?: NativeMediaItem | null;
  onPreviewMediaItemChange?: (item: NativeMediaItem | null) => void;
};

function formatDuration(durationMs: number): string | null {
  if (durationMs <= 0) return null;
  const seconds = Math.floor(durationMs / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export default function AttachmentPickerSheet({
  open,
  onClose,
  onPick,
  onSelectFiles,
  onSendSelectedFiles,
  composer,
  onComposerChange,
  resolvedThemeMode = "dark",
  onEnlargeComposer,
  isUploading = false,
  isSendingMessage = false,
  previewMediaItem: propPreviewMediaItem,
  onPreviewMediaItemChange
}: AttachmentPickerSheetProps) {
  const prefersReducedMotion = useReducedMotion();
  const [activeTab, setActiveTab] = useState<AttachmentPickerTab>("gallery");
  const [media, setMedia] = useState<NativeMediaItem[]>([]);
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
  const [galleryState, setGalleryState] = useState<"loading" | "ready" | "empty" | "error">("loading");
  const [internalPreviewMediaItem, setInternalPreviewMediaItem] = useState<NativeMediaItem | null>(null);
  const [fullPreviewUrl, setFullPreviewUrl] = useState<string | null>(null);
  const previewMediaItem = propPreviewMediaItem !== undefined ? propPreviewMediaItem : internalPreviewMediaItem;
  const setPreviewMediaItem = useCallback(
    (item: NativeMediaItem | null) => {
      if (onPreviewMediaItemChange) {
        onPreviewMediaItemChange(item);
      } else {
        setInternalPreviewMediaItem(item);
      }
    },
    [onPreviewMediaItemChange]
  );
  const [isSending, setIsSending] = useState(false);
  const [localDraft, setLocalDraft] = useState("");
  const [isEmojiOpen, setIsEmojiOpen] = useState(false);
  const [lineCount, setLineCount] = useState(1);
  const [isMultiline, setIsMultiline] = useState(false);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [dragTranslateY, setDragTranslateY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [isReady, setIsReady] = useState(prefersReducedMotion);

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const emojiPickerRef = useRef<HTMLDivElement | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const rafIdRef = useRef<number | null>(null);
  const nextTranslateYRef = useRef(0);
  const dragStartRef = useRef<{
    startY: number;
    startIsFullScreen: boolean;
    active: boolean;
    isClickCandidate: boolean;
  } | null>(null);
  const bodyTouchStartRef = useRef<{
    startY: number;
    scrollTop: number;
  } | null>(null);

  const messageText = composer !== undefined ? composer : localDraft;
  const handleMessageChange = (val: string) => {
    if (onComposerChange) {
      onComposerChange(val);
    } else {
      setLocalDraft(val);
    }
  };

  const resetSheetState = () => {
    setActiveTab("gallery");
    setSelectedItemIds([]);
    setPreviewMediaItem(null);
    setIsSending(false);
    setIsEmojiOpen(false);
    setIsFullScreen(false);
    setDragTranslateY(0);
    setIsDragging(false);
  };

  const closeSheet = () => {
    if (isClosing) return;
    if (prefersReducedMotion) {
      resetSheetState();
      onClose();
      return;
    }
    setIsClosing(true);
  };

  useEffect(() => {
    if (!isClosing || prefersReducedMotion) return;
    const timer = window.setTimeout(() => {
      resetSheetState();
      setIsClosing(false);
      onClose();
    }, 300);
    return () => window.clearTimeout(timer);
  }, [isClosing, onClose, prefersReducedMotion]);

  useEffect(() => {
    if (!open || !Capacitor.isNativePlatform()) return undefined;
    let disposed = false;
    let listener: { remove: () => Promise<void> } | null = null;
    void (async () => {
      listener = await App.addListener("backButton", () => {
        if (previewMediaItem) {
          setPreviewMediaItem(null);
          return;
        }
        closeSheet();
      });
      if (disposed) {
        void listener.remove();
      }
    })();
    return () => {
      disposed = true;
      void listener?.remove();
    };
  }, [open, previewMediaItem, closeSheet, setPreviewMediaItem]);

  useEffect(() => {
    if (!open) {
      setIsReady(false);
      setIsClosing(false);
      return;
    }
    if (prefersReducedMotion) {
      setIsReady(true);
      return;
    }
    setIsReady(false);
    const frame = window.requestAnimationFrame(() => {
      setIsReady(true);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [open, prefersReducedMotion]);

  const handleZonePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest("button")) {
      return;
    }
    try {
      (event.currentTarget as HTMLDivElement).setPointerCapture(event.pointerId);
    } catch {
      // Ignore if pointer capture is not supported/needed
    }
    dragStartRef.current = {
      startY: event.clientY,
      startIsFullScreen: isFullScreen,
      active: true,
      isClickCandidate: true
    };
    setIsDragging(true);
  };

  const handleZonePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragStartRef.current?.active) return;
    const deltaY = event.clientY - dragStartRef.current.startY;
    if (Math.abs(deltaY) > 5) {
      dragStartRef.current.isClickCandidate = false;
    }

    let nextY = 0;
    if (!dragStartRef.current.startIsFullScreen) {
      if (deltaY > 0) {
        nextY = deltaY;
      } else {
        nextY = Math.max(deltaY, -120);
      }
    } else {
      if (deltaY > 0) {
        nextY = deltaY;
      } else {
        nextY = Math.max(deltaY * 0.25, -25);
      }
    }

    nextTranslateYRef.current = nextY;
    if (rafIdRef.current === null) {
      rafIdRef.current = window.requestAnimationFrame(() => {
        rafIdRef.current = null;
        setDragTranslateY(nextTranslateYRef.current);
      });
    }
  };

  const handleZonePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragStartRef.current?.active) return;
    try {
      if ((event.currentTarget as HTMLDivElement).hasPointerCapture(event.pointerId)) {
        (event.currentTarget as HTMLDivElement).releasePointerCapture(event.pointerId);
      }
    } catch {
      // Ignore
    }
    if (rafIdRef.current !== null) {
      window.cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
    const deltaY = event.clientY - dragStartRef.current.startY;
    const startIsFullScreen = dragStartRef.current.startIsFullScreen;
    const isClick = dragStartRef.current.isClickCandidate && Math.abs(deltaY) < 6;

    dragStartRef.current = null;
    setIsDragging(false);
    setDragTranslateY(0);

    if (isClick) {
      if ((event.target as HTMLElement).classList.contains("attachment-picker-sheet-handle")) {
        setIsFullScreen((prev) => !prev);
      }
      return;
    }

    if (!startIsFullScreen) {
      if (deltaY < -40) {
        setIsFullScreen(true);
      } else if (deltaY > 60) {
        closeSheet();
      }
    } else {
      if (deltaY > 50) {
        setIsFullScreen(false);
      }
    }
  };

  const handleZonePointerCancel = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragStartRef.current?.active) return;
    try {
      if ((event.currentTarget as HTMLDivElement).hasPointerCapture(event.pointerId)) {
        (event.currentTarget as HTMLDivElement).releasePointerCapture(event.pointerId);
      }
    } catch {
      // Ignore
    }
    dragStartRef.current = null;
    setIsDragging(false);
    setDragTranslateY(0);
  };

  const handleBodyTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
    const target = bodyRef.current;
    if (!target) return;
    bodyTouchStartRef.current = {
      startY: event.touches[0].clientY,
      scrollTop: target.scrollTop
    };
  };

  const handleBodyTouchEnd = (event: React.TouchEvent<HTMLDivElement>) => {
    if (!bodyTouchStartRef.current) return;
    const deltaY = event.changedTouches[0].clientY - bodyTouchStartRef.current.startY;
    const initialScrollTop = bodyTouchStartRef.current.scrollTop;
    bodyTouchStartRef.current = null;

    if (!isFullScreen) {
      if (deltaY < -45) {
        setIsFullScreen(true);
      } else if (deltaY > 70 && initialScrollTop <= 0) {
        closeSheet();
      }
    } else {
      if (deltaY > 60 && initialScrollTop <= 0) {
        setIsFullScreen(false);
      }
    }
  };

  const mediaCategory = (tab: AttachmentPickerTab) => (tab === "file" ? "documents" : tab);

  const loadRecentItems = async (tab: AttachmentPickerTab) => {
    if (!isNativeMediaLibraryAvailable()) {
      setGalleryState("empty");
      return;
    }
    const cached = getCachedNativeMedia(mediaCategory(tab));
    if (cached.length > 0) {
      setMedia(cached);
      setGalleryState("ready");
    } else {
      setGalleryState("loading");
    }
    try {
      const items = await listNativeMedia(mediaCategory(tab));
      setMedia(items);
      setGalleryState(items.length > 0 ? "ready" : "empty");
    } catch {
      setMedia([]);
      setGalleryState("error");
    }
  };

  const adjustTextareaHeight = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    const scrollHeight = textarea.scrollHeight;
    const style = window.getComputedStyle(textarea);
    const fontSize = Number.parseFloat(style.fontSize) || 16;
    const lineHeight = Number.parseFloat(style.lineHeight) || fontSize * 1.4;
    const verticalChrome =
      Number.parseFloat(style.paddingTop) +
      Number.parseFloat(style.paddingBottom) +
      Number.parseFloat(style.borderTopWidth) +
      Number.parseFloat(style.borderBottomWidth);
    const minHeight = Number.parseFloat(style.minHeight) || lineHeight + verticalChrome;
    const maxHeight = lineHeight * 3 + verticalChrome;
    const nextHeight = Math.min(Math.max(scrollHeight, minHeight), maxHeight);
    textarea.style.height = `${nextHeight}px`;
    textarea.style.overflowY = scrollHeight > maxHeight ? "auto" : "hidden";

    const contentHeight = Math.max(0, scrollHeight - verticalChrome);
    const lineCountFromHeight = Math.max(1, Math.round(contentHeight / lineHeight));
    const newlineCount = messageText.split("\n").length;
    const count = Math.max(lineCountFromHeight, newlineCount);
    setLineCount(count);
    setIsMultiline(count > 1);
  }, [messageText]);

  useEffect(() => {
    if (!open) return;
    resetSheetState();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    void loadRecentItems(activeTab);
  }, [open, activeTab]);

  useLayoutEffect(() => {
    if (!open) return;
    adjustTextareaHeight();
  }, [open, messageText, adjustTextareaHeight]);

  useEffect(() => {
    if (!isEmojiOpen) return;
    const handleDocumentPointerDown = (event: PointerEvent) => {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(event.target as Node)) {
        setIsEmojiOpen(false);
      }
    };
    document.addEventListener("pointerdown", handleDocumentPointerDown);
    return () => document.removeEventListener("pointerdown", handleDocumentPointerDown);
  }, [isEmojiOpen]);

  if (!open) return null;

  const toggleGridItemSelection = (id: string) => {
    setSelectedItemIds((previous) =>
      previous.includes(id) ? previous.filter((item) => item !== id) : [...previous, id]
    );
  };

  const handleEmojiPick = (emojiData: EmojiClickData) => {
    const textarea = textareaRef.current;
    const start = textarea?.selectionStart ?? messageText.length;
    const end = textarea?.selectionEnd ?? messageText.length;
    const nextValue = `${messageText.slice(0, start)}${emojiData.emoji}${messageText.slice(end)}`.slice(0, 4000);
    handleMessageChange(nextValue);
    window.setTimeout(() => {
      const cursor = Math.min(start + emojiData.emoji.length, nextValue.length);
      if (textareaRef.current) {
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(cursor, cursor);
      }
    }, 0);
  };

  const handleSendSelected = async () => {
    if (isSending || isSendingMessage) return;
    const hasItems = selectedItemIds.length > 0;
    const hasText = Boolean(messageText.trim());
    if (!hasItems && !hasText) return;

    if (hasItems && !isNativeMediaLibraryAvailable()) {
      onPick(activeTab === "file" ? "file" : activeTab);
      closeSheet();
      return;
    }

    setIsSending(true);
    try {
      if (hasItems) {
        const files = await selectNativeMediaFiles(selectedItemIds);
        if (files.length > 0) {
          await onSendSelectedFiles?.(files, messageText);
        } else if (hasText) {
          await onSendSelectedFiles?.([], messageText);
        }
      } else if (hasText) {
        await onSendSelectedFiles?.([], messageText);
      }
      closeSheet();
    } catch {
      setIsSending(false);
    }
  };

  const selectedCount = selectedItemIds.length;
  const sheetContent = (
    <div
      className={`attachment-picker-backdrop${isReady ? " is-ready" : ""}${isClosing ? " is-closing" : ""}`}
      role="presentation"
      onClick={closeSheet}
    >
      <div
        className={`attachment-picker-sheet tg-style ${isFullScreen ? "is-fullscreen" : ""}${isReady ? " is-ready" : ""}${isClosing ? " is-closing" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label="Attach media and files"
        onClick={(event) => event.stopPropagation()}
        style={{
          transform: dragTranslateY !== 0 ? `translateY(${dragTranslateY}px)` : undefined,
          transition: isDragging ? "none" : undefined
        }}
      >
        <div
          className="attachment-picker-sheet-handle-zone"
          onPointerDown={handleZonePointerDown}
          onPointerMove={handleZonePointerMove}
          onPointerUp={handleZonePointerUp}
          onPointerCancel={handleZonePointerCancel}
        >
          <div className="attachment-picker-sheet-handle" aria-hidden="true" />
          <div className="attachment-picker-header">
            <div className="attachment-picker-header-title">
              {selectedCount > 0 ? (
                <span className="attachment-picker-selected-count">{selectedCount} selected</span>
              ) : (
                <span>Attach</span>
              )}
            </div>
            <button
              type="button"
              className="attachment-picker-close-btn"
              aria-label="Close attachment menu"
              onClick={closeSheet}
            >
              <span aria-hidden="true">×</span>
            </button>
          </div>
        </div>

        <div
          className="attachment-picker-body"
          ref={bodyRef}
          onTouchStart={handleBodyTouchStart}
          onTouchEnd={handleBodyTouchEnd}
        >
          {activeTab === "gallery" && (
            <div className="attachment-picker-gallery-tab">
              <div className="attachment-picker-grid">
                <button
                  type="button"
                  className="attachment-picker-grid-tile camera-tile"
                  onClick={() => {
                    onPick("camera");
                    closeSheet();
                  }}
                  title="Take photo or video"
                >
                  <span className="camera-tile-icon">
                    <Camera size={26} />
                  </span>
                  <span className="camera-tile-label">Camera</span>
                </button>
                {media.map((item) => {
                  const selected = selectedItemIds.includes(item.id);
                  return (
                    <div
                      key={item.id}
                      className={`attachment-picker-grid-tile media-tile ${selected ? "selected" : ""}`}
                    >
                      <button
                        type="button"
                        className="media-tile-thumb-btn"
                        onClick={() => setPreviewMediaItem(item)}
                        aria-label={`Preview ${item.name}`}
                      >
                        <img src={nativeMediaPreviewUrl(item)} alt="" loading="lazy" decoding="async" />
                        {formatDuration(item.durationMs) && (
                          <span className="media-tile-badge">{formatDuration(item.durationMs)}</span>
                        )}
                      </button>
                      <button
                        type="button"
                        className={`media-tile-checkbox ${selected ? "checked" : ""}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          toggleGridItemSelection(item.id);
                        }}
                        aria-label={selected ? `Deselect ${item.name}` : `Select ${item.name}`}
                        aria-pressed={selected}
                      >
                        {selected && <Check size={12} strokeWidth={3} />}
                      </button>
                    </div>
                  );
                })}
              </div>
              {galleryState === "loading" && <p className="attachment-picker-gallery-status">Loading your gallery…</p>}
              {galleryState === "empty" && (
                <div className="attachment-picker-gallery-status">
                  <p>No photos or videos found in the in-app gallery.</p>
                  <button
                    type="button"
                    className="attachment-picker-secondary-btn"
                    onClick={() => {
                      onPick("gallery");
                      closeSheet();
                    }}
                  >
                    <ImageIcon size={18} />
                    Choose photos
                  </button>
                </div>
              )}
              {galleryState === "error" && (
                <div className="attachment-picker-gallery-status">
                  <p>Unable to load the in-app gallery.</p>
                  <button
                    type="button"
                    className="attachment-picker-secondary-btn"
                    onClick={() => {
                      onPick("gallery");
                      closeSheet();
                    }}
                  >
                    <ImageIcon size={18} />
                    Choose photos
                  </button>
                  <button
                    type="button"
                    className="attachment-picker-secondary-btn"
                    onClick={() => void loadRecentItems("gallery")}
                  >
                    Try again
                  </button>
                </div>
              )}
              {!isNativeMediaLibraryAvailable() && (
                <button
                  type="button"
                  className="attachment-picker-secondary-btn"
                  onClick={() => {
                    onPick("gallery");
                    closeSheet();
                  }}
                >
                  <ImageIcon size={18} />
                  Choose photos
                </button>
              )}
            </div>
          )}

          {activeTab === "file" && (
            <RecentFileList
              items={media}
              selectedItemIds={selectedItemIds}
              onToggle={toggleGridItemSelection}
              loading={galleryState === "loading"}
              emptyLabel="No recent documents on this device."
              icon={<FileText size={22} />}
              onChoose={() => {
                onPick("file");
                closeSheet();
              }}
            />
          )}
          {activeTab === "audio" && (
            <RecentFileList
              items={media}
              selectedItemIds={selectedItemIds}
              onToggle={toggleGridItemSelection}
              loading={galleryState === "loading"}
              emptyLabel="No recent audio files on this device."
              icon={<Music size={22} />}
              onChoose={() => {
                onPick("audio");
                closeSheet();
              }}
            />
          )}
        </div>

        <div className="attachment-picker-message-box message-composer">
          <div className={`message-composer-row${isMultiline ? " message-composer-row--multiline" : ""}`}>
            <button
              type="button"
              className="file-picker"
              aria-label="Attach files"
              title="Attach files"
              disabled={isSending || isSendingMessage}
              onClick={() => {
                if (activeTab !== "file") {
                  setActiveTab("file");
                } else {
                  onPick("file");
                  closeSheet();
                }
              }}
            >
              <Paperclip aria-hidden="true" size={22} />
            </button>

            <div className="emoji-picker-shell" ref={emojiPickerRef}>
              <button
                type="button"
                className="emoji-picker-button"
                aria-label="Add emoji"
                aria-expanded={isEmojiOpen}
                title="Add emoji"
                disabled={isSending || isSendingMessage}
                onClick={() => setIsEmojiOpen((prev) => !prev)}
              >
                <Smile aria-hidden="true" size={22} />
              </button>
              {isEmojiOpen && (
                <div className="emoji-picker attachment-picker-emoji-popover" role="menu" aria-label="Choose emoji">
                  <EmojiPicker
                    onEmojiClick={handleEmojiPick}
                    autoFocusSearch={false}
                    lazyLoadEmojis
                    previewConfig={{ showPreview: false }}
                    searchDisabled
                    skinTonesDisabled
                    categoryIcons={EMOJI_CATEGORY_ICONS}
                    theme={resolvedThemeMode === "light" ? Theme.LIGHT : Theme.DARK}
                    width={360}
                    height={320}
                  />
                </div>
              )}
            </div>

            <div className="message-composer-shell">
              <div className="message-composer-input-wrap">
                <textarea
                  ref={textareaRef}
                  aria-label="Message with attachments"
                  placeholder="Message"
                  value={messageText}
                  maxLength={4000}
                  rows={1}
                  onChange={(event) => handleMessageChange(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                      event.preventDefault();
                      void handleSendSelected();
                    }
                  }}
                />
              </div>
            </div>

            <div className="message-composer-actions">
              {(lineCount >= 3 || messageText.split("\n").length >= 3) && onEnlargeComposer && (
                <MessageEnlargeButton onClick={onEnlargeComposer} />
              )}
              <button
                type="button"
                className="attachment-picker-message-send"
                aria-label="Send message"
                aria-busy={isSending || isSendingMessage}
                disabled={isSending || isSendingMessage || (!messageText.trim() && selectedCount === 0)}
                onMouseDown={(event) => {
                  event.preventDefault();
                }}
                onClick={() => void handleSendSelected()}
              >
                <span className="ms-icon ms-icon--20" aria-hidden={true}>
                  send
                </span>
                {(isSending || isSendingMessage) && <span className="visually-hidden">Sending</span>}
              </button>
            </div>
          </div>
        </div>

        <nav className="attachment-picker-bottom-nav" aria-label="Attachment options">
          <button
            type="button"
            className={`attachment-nav-item ${activeTab === "gallery" ? "active" : ""}`}
            onClick={() => setActiveTab("gallery")}
          >
            <span className="nav-item-icon">
              <ImageIcon size={20} />
            </span>
            <span className="nav-item-label">Gallery</span>
          </button>
          <button
            type="button"
            className={`attachment-nav-item ${activeTab === "file" ? "active" : ""}`}
            onClick={() => setActiveTab("file")}
          >
            <span className="nav-item-icon">
              <FileText size={20} />
            </span>
            <span className="nav-item-label">File</span>
          </button>
          <button
            type="button"
            className={`attachment-nav-item ${activeTab === "audio" ? "active" : ""}`}
            onClick={() => setActiveTab("audio")}
          >
            <span className="nav-item-icon">
              <AudioLines size={20} />
            </span>
            <span className="nav-item-label">Audio</span>
          </button>
        </nav>
      </div>
    </div>
  );

  useEffect(() => {
    if (!previewMediaItem) {
      setFullPreviewUrl(null);
      return;
    }
    let cancelled = false;
    void fetchNativeMediaFileUrl(previewMediaItem.id).then((url) => {
      if (!cancelled && url) {
        setFullPreviewUrl(url);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [previewMediaItem]);

  const fullContent = (
    <>
      {sheetContent}
      {previewMediaItem && (
        <ImageLightbox
          imageUrl={fullPreviewUrl || nativeMediaPreviewUrl(previewMediaItem)}
          title={previewMediaItem.name}
          subtitle={previewMediaItem.mimeType}
          onClose={() => setPreviewMediaItem(null)}
        />
      )}
    </>
  );

  return typeof document !== "undefined" ? createPortal(fullContent, document.body) : fullContent;
}

function RecentFileList({
  items,
  selectedItemIds,
  onToggle,
  loading,
  emptyLabel,
  icon,
  onChoose
}: {
  items: NativeMediaItem[];
  selectedItemIds: string[];
  onToggle: (id: string) => void;
  loading: boolean;
  emptyLabel: string;
  icon: ReactNode;
  onChoose: () => void;
}) {
  return (
    <div className="attachment-picker-list-tab">
      <button type="button" className="attachment-picker-sheet-item" onClick={onChoose}>
        <span className="attachment-picker-sheet-icon file-icon">{icon}</span>
        <span className="attachment-picker-sheet-copy">
          <strong>Choose from device</strong>
          <span>{items.length ? "Browse all files" : emptyLabel}</span>
        </span>
      </button>
      {loading && <p className="attachment-picker-gallery-status">Loading recent items…</p>}
      {items.map((item) => {
        const selected = selectedItemIds.includes(item.id);
        return (
          <button
            key={item.id}
            type="button"
            className={`attachment-picker-sheet-item attachment-picker-recent-item ${selected ? "selected" : ""}`}
            onClick={() => onToggle(item.id)}
          >
            <span className="attachment-picker-sheet-icon file-icon">{icon}</span>
            <span className="attachment-picker-sheet-copy">
              <strong>{item.name}</strong>
              <span>{item.mimeType}</span>
            </span>
            <span className={`media-tile-checkbox ${selected ? "checked" : ""}`}>
              {selected && <Check size={12} strokeWidth={3} />}
            </span>
          </button>
        );
      })}
    </div>
  );
}
