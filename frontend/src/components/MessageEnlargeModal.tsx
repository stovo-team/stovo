import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import CspSafeEmojiPicker, { EmojiClickData, Theme } from "./CspSafeEmojiPicker";
import {
  Bold,
  Check,
  Code,
  EyeOff,
  Heading,
  Italic,
  Link,
  List,
  ListOrdered,
  ListTodo,
  Maximize2,
  Paperclip,
  Quote,
  Send,
  Smile,
  Strikethrough,
  Trash2,
  Underline,
  X,
} from "lucide-react";

import { MessageMarkdown } from "../messageMarkdown";
import { formatComposerSelection, type FormattingKind } from "../composerFormatting";
import { ImageEditorModal } from "./ImageEditorModal";
import { PendingAttachmentCard } from "../features/chats/composer/PendingAttachmentCard";
import { PopupBackdrop, PopupCloseButton } from "./ui/Popup";
import type { PendingLocalAttachment } from "../features/chats/shared/types";
import { useStrings } from "../i18n/LanguageContext";

export function MessageEnlargeModal({
  content,
  renderMarkdown,
  editable = false,
  pendingAttachments = [],
  onClose,
  onChange,
  onRemovePendingAttachment,
  onUpdatePendingAttachment,
  onAddAttachments,
  onSend
}: {
  content: string;
  renderMarkdown: boolean;
  editable?: boolean;
  pendingAttachments?: PendingLocalAttachment[];
  onClose: () => void;
  onChange?: (value: string) => void;
  onRemovePendingAttachment?: (localId: string) => void;
  onUpdatePendingAttachment?: (localId: string, updatedFile: File) => void;
  onAddAttachments?: (files: File[]) => void;
  onSend?: () => void;
}) {
  const copy = useStrings().chats.composer.expanded;
  const composerCopy = useStrings().chats.composer;
  const [draft, setDraft] = useState(content);
  const [editingAttachment, setEditingAttachment] = useState<PendingLocalAttachment | null>(null);
  const [isEmojiPickerOpen, setIsEmojiPickerOpen] = useState(false);
  const [showHeadingMenu, setShowHeadingMenu] = useState(false);
  const [showListMenu, setShowListMenu] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setDraft(content);
  }, [content]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !editingAttachment) {
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, editingAttachment]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest(".toolbar-dropdown-wrap")) {
        setShowHeadingMenu(false);
        setShowListMenu(false);
      }
    };
    window.addEventListener("click", handleClickOutside);
    return () => window.removeEventListener("click", handleClickOutside);
  }, []);

  const handleTextChange = (nextValue: string) => {
    setDraft(nextValue);
    onChange?.(nextValue);
  };

  const applyFormat = (kind: FormattingKind) => {
    if (!textareaRef.current) return;
    const textarea = textareaRef.current;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const edit = formatComposerSelection(draft, { start, end }, kind);
    handleTextChange(edit.value);

    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(edit.selectionStart, edit.selectionEnd);
      }
    }, 0);
  };

  const insertTextAtCursor = (textToInsert: string) => {
    if (!textareaRef.current) {
      handleTextChange(draft + textToInsert);
      return;
    }
    const textarea = textareaRef.current;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const nextValue = draft.slice(0, start) + textToInsert + draft.slice(end);
    handleTextChange(nextValue);

    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        const cursor = start + textToInsert.length;
        textareaRef.current.setSelectionRange(cursor, cursor);
      }
    }, 0);
  };

  const handleEmojiClick = (emojiData: EmojiClickData) => {
    insertTextAtCursor(emojiData.emoji);
    setIsEmojiPickerOpen(false);
  };

type DraftSegment =
  | { type: "text"; content: string; key: string }
  | { type: "media"; fullMatch: string; alt: string; url: string; key: string };

function parseDraftSegments(text: string): DraftSegment[] {
  const regex = /!\[([^\]]*)\]\(([^)]+)\)/g;
  const segments: DraftSegment[] = [];
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    const textBefore = text.slice(lastIndex, match.index);
    if (textBefore || segments.length === 0) {
      segments.push({
        type: "text",
        content: textBefore,
        key: `text-${lastIndex}`
      });
    }
    segments.push({
      type: "media",
      fullMatch: match[0],
      alt: match[1],
      url: match[2],
      key: `media-${match.index}`
    });
    lastIndex = regex.lastIndex;
  }

  const textAfter = text.slice(lastIndex);
  if (textAfter || segments.length === 0) {
    segments.push({
      type: "text",
      content: textAfter,
      key: `text-${lastIndex}`
    });
  }

  return segments;
}

  const draftSegments = useMemo(() => {
    return parseDraftSegments(draft);
  }, [draft]);

  const hasMediaSegments = useMemo(() => {
    return draftSegments.some((seg) => seg.type === "media");
  }, [draftSegments]);

  const handleSegmentTextChange = (index: number, newText: string) => {
    const updated = draftSegments.map((seg, idx) => {
      if (idx === index && seg.type === "text") {
        return { ...seg, content: newText };
      }
      return seg;
    });

    const nextDraft = updated
      .map((seg) => (seg.type === "text" ? seg.content : seg.fullMatch))
      .join("");

    handleTextChange(nextDraft);
  };

  const handleRemoveMediaSegment = (fullMatch: string) => {
    const nextDraft = draft.replace(fullMatch, "").replace(/\n\n+/g, "\n");
    handleTextChange(nextDraft.trim());
  };

  const handleUnifiedFileSelect = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const filesArray = Array.from(e.target.files);
      const mediaFiles: File[] = [];
      const docFiles: File[] = [];

      filesArray.forEach((file) => {
        if (file.type.startsWith("image/") || file.type.startsWith("video/")) {
          mediaFiles.push(file);
        } else {
          docFiles.push(file);
        }
      });

      if (mediaFiles.length > 0) {
        const inlineSnippets = mediaFiles.map((file) => {
          const previewUrl = URL.createObjectURL(file);
          return `![${file.name}](${previewUrl})`;
        });
        const prefix = draft && !draft.endsWith("\n") ? "\n" : "";
        insertTextAtCursor(prefix + inlineSnippets.join("\n") + "\n");
      }

      if (docFiles.length > 0 && onAddAttachments) {
        onAddAttachments(docFiles);
      }

      e.target.value = "";
    }
  };

  return createPortal(
    <PopupBackdrop className="message-enlarge-backdrop" onClick={onClose}>
      <div
        className="message-enlarge-modal message-enlarge-modal--fullscreen"
        role="dialog"
        aria-modal="true"
        aria-label={copy.composeMessage}
        onClick={(event) => event.stopPropagation()}
      >
        {/* Modal Header */}
        <header className="message-enlarge-header">
          {editable ? (
            <div className="message-enlarge-toolbar" role="toolbar" aria-label={copy.formattingControls}>
              <div className="toolbar-section toolbar-section--formatting">
                <button
                  type="button"
                  className="toolbar-btn"
                  onClick={() => applyFormat("bold")}
                  title={copy.bold}
                >
                  <Bold size={16} />
                </button>
                <button
                  type="button"
                  className="toolbar-btn"
                  onClick={() => applyFormat("italic")}
                  title={copy.italic}
                >
                  <Italic size={16} />
                </button>
                <button
                  type="button"
                  className="toolbar-btn"
                  onClick={() => applyFormat("underline")}
                  title={copy.underline}
                >
                  <Underline size={16} />
                </button>
                <button
                  type="button"
                  className="toolbar-btn"
                  onClick={() => applyFormat("strikethrough")}
                  title={copy.strikethrough}
                >
                  <Strikethrough size={16} />
                </button>
                <button
                  type="button"
                  className="toolbar-btn"
                  onClick={() => applyFormat("code")}
                  title={copy.code}
                >
                  <Code size={16} />
                </button>
                <button
                  type="button"
                  className="toolbar-btn"
                  onClick={() => applyFormat("spoiler")}
                  title={copy.spoiler}
                >
                  <EyeOff size={16} />
                </button>
                <button
                  type="button"
                  className="toolbar-btn"
                  onClick={() => applyFormat("quote")}
                  title={copy.quote}
                >
                  <Quote size={16} />
                </button>

                {/* List Dropdown */}
                <div className="toolbar-dropdown-wrap">
                  <button
                    type="button"
                    className={`toolbar-btn${showListMenu ? " is-active" : ""}`}
                    onClick={() => {
                      setShowListMenu(!showListMenu);
                      setShowHeadingMenu(false);
                    }}
                    title={copy.lists}
                  >
                    <List size={16} />
                  </button>
                  {showListMenu && (
                    <div className="toolbar-dropdown-menu">
                      <button
                        type="button"
                        title={copy.bulletList}
                        onClick={() => {
                          insertTextAtCursor("- ");
                          setShowListMenu(false);
                        }}
                      >
                        <List size={16} />
                      </button>
                      <button
                        type="button"
                        title={copy.numberedList}
                        onClick={() => {
                          insertTextAtCursor("1. ");
                          setShowListMenu(false);
                        }}
                      >
                        <ListOrdered size={16} />
                      </button>
                      <button
                        type="button"
                        title={copy.checklist}
                        onClick={() => {
                          insertTextAtCursor("- [ ] ");
                          setShowListMenu(false);
                        }}
                      >
                        <ListTodo size={16} />
                      </button>
                    </div>
                  )}
                </div>

                {/* Heading Dropdown */}
                <div className="toolbar-dropdown-wrap">
                  <button
                    type="button"
                    className={`toolbar-btn${showHeadingMenu ? " is-active" : ""}`}
                    onClick={() => {
                      setShowHeadingMenu(!showHeadingMenu);
                      setShowListMenu(false);
                    }}
                    title={copy.headings}
                  >
                    <Heading size={16} />
                  </button>
                  {showHeadingMenu && (
                    <div className="toolbar-dropdown-menu">
                      <button
                        type="button"
                        title={copy.heading(1, "#")}
                        onClick={() => {
                          insertTextAtCursor("# ");
                          setShowHeadingMenu(false);
                        }}
                      >
                        H1
                      </button>
                      <button
                        type="button"
                        title={copy.heading(2, "##")}
                        onClick={() => {
                          insertTextAtCursor("## ");
                          setShowHeadingMenu(false);
                        }}
                      >
                        H2
                      </button>
                      <button
                        type="button"
                        title={copy.heading(3, "###")}
                        onClick={() => {
                          insertTextAtCursor("### ");
                          setShowHeadingMenu(false);
                        }}
                      >
                        H3
                      </button>
                      <button
                        type="button"
                        title={copy.heading(4, "####")}
                        onClick={() => {
                          insertTextAtCursor("#### ");
                          setShowHeadingMenu(false);
                        }}
                      >
                        H4
                      </button>
                      <button
                        type="button"
                        title={copy.heading(5, "#####")}
                        onClick={() => {
                          insertTextAtCursor("##### ");
                          setShowHeadingMenu(false);
                        }}
                      >
                        H5
                      </button>
                      <button
                        type="button"
                        title={copy.heading(6, "######")}
                        onClick={() => {
                          insertTextAtCursor("###### ");
                          setShowHeadingMenu(false);
                        }}
                      >
                        H6
                      </button>
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  className="toolbar-btn"
                  onClick={() => insertTextAtCursor("[text](url)")}
                  title={copy.insertLink}
                >
                  <Link size={16} />
                </button>
              </div>
            </div>
          ) : (
            <div className="message-enlarge-title-group">
              <h2 className="message-enlarge-title">{copy.messagePreview}</h2>
            </div>
          )}

          <div className="message-enlarge-actions">
            <PopupCloseButton className="message-enlarge-circle-btn" ariaLabel={copy.shrinkAria} title={copy.shrinkTitle} onClick={onClose} />
          </div>
        </header>

        {/* Modal Body Workspace */}
        <div className="message-enlarge-body">
          {editable ? (
            <div className="message-enlarge-editor-workspace">
              {/* Pending Attachments Strip (Documents & Non-media Files) */}
              {pendingAttachments.length > 0 && (
                <div className="compose-modal-attachments">
                  <div className="compose-modal-attachments-header">
                    <span>{copy.attachedDocuments(pendingAttachments.length)}</span>
                  </div>
                  <div className="pending-attachments">
                    {pendingAttachments.map((pending) => (
                      <PendingAttachmentCard
                        key={pending.localId}
                        pending={pending}
                        onRemove={() => onRemovePendingAttachment?.(pending.localId)}
                        onEdit={() => setEditingAttachment(pending)}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Live Prerendered Workspace */}
              {hasMediaSegments ? (
                <div className="inline-live-editor-container">
                  {draftSegments.map((segment, idx) => {
                    if (segment.type === "media") {
                      return (
                        <div key={segment.key} className="inline-media-prerender-card">
                          <img src={segment.url} alt={segment.alt || copy.inlineMedia} />
                          <button
                            type="button"
                            className="inline-media-prerender-remove"
                            title={copy.removeMedia(segment.alt)}
                            aria-label={copy.removeMedia(segment.alt)}
                            onClick={() => handleRemoveMediaSegment(segment.fullMatch)}
                          >
                            <X size={14} />
                          </button>
                        </div>
                      );
                    }
                    return (
                      <textarea
                        key={segment.key}
                        className="message-enlarge-editor message-enlarge-editor--segment"
                        value={segment.content}
                        placeholder={idx === 0 ? copy.placeholder : ""}
                        onChange={(e) => handleSegmentTextChange(idx, e.target.value)}
                      />
                    );
                  })}
                </div>
              ) : (
                <textarea
                  ref={textareaRef}
                  className="message-enlarge-editor"
                  value={draft}
                  placeholder={copy.placeholder}
                  autoFocus
                  onChange={(event) => handleTextChange(event.target.value)}
                />
              )}

              {/* Emoji Picker Popover */}
              {isEmojiPickerOpen && (
                <div className="compose-modal-emoji-picker" role="menu">
                  <CspSafeEmojiPicker
                    onEmojiClick={handleEmojiClick}
                    autoFocusSearch={false}
                    lazyLoadEmojis
                    previewConfig={{ showPreview: false }}
                    searchDisabled
                    skinTonesDisabled
                    theme={Theme.DARK}
                    width={360}
                    height={360}
                  />
                </div>
              )}

              {/* Bottom Toolbar */}
              <footer className="message-enlarge-bottom-bar">
                <div className="message-enlarge-bottom-left">
                  {/* Unified File Picker SVG Button */}
                  <button
                    type="button"
                    className="message-enlarge-circle-btn message-enlarge-circle-btn--action"
                    onClick={() => fileInputRef.current?.click()}
                    title={copy.attachInline}
                    aria-label={copy.filePicker}
                  >
                    <Paperclip size={18} />
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    className="visually-hidden"
                    onChange={handleUnifiedFileSelect}
                  />

                  {/* Emoji Picker Button */}
                  <button
                    type="button"
                    className={`message-enlarge-circle-btn message-enlarge-circle-btn--action${isEmojiPickerOpen ? " is-active" : ""}`}
                    onClick={() => setIsEmojiPickerOpen(!isEmojiPickerOpen)}
                    title={copy.addEmoji}
                    aria-label={copy.addEmoji}
                  >
                    <Smile size={18} />
                  </button>

                  {/* Clear Button (circled SVG without words) */}
                  {draft.length > 0 && (
                    <button
                      type="button"
                      className="message-enlarge-circle-btn message-enlarge-circle-btn--danger"
                      onClick={() => handleTextChange("")}
                      title={copy.clearText}
                      aria-label={copy.clearText}
                    >
                      <Trash2 size={18} />
                    </button>
                  )}
                </div>

                <div className="message-enlarge-bottom-right">
                  {/* Send / Done Button (circled SVG without words) */}
                  {onSend ? (
                    <button
                      type="button"
                      className="message-enlarge-circle-btn message-enlarge-circle-btn--send"
                      disabled={!draft.trim() && pendingAttachments.length === 0}
                      onClick={() => {
                        onSend();
                        onClose();
                      }}
                      title={composerCopy.sendMessageAria}
                      aria-label={composerCopy.sendMessageAria}
                    >
                      <Send size={18} />
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="message-enlarge-circle-btn message-enlarge-circle-btn--send"
                      onClick={onClose}
                      title={copy.doneEditing}
                      aria-label={copy.doneEditing}
                    >
                      <Check size={18} />
                    </button>
                  )}
                </div>
              </footer>
            </div>
          ) : renderMarkdown ? (
            <MessageMarkdown source={content} />
          ) : (
            content
          )}
        </div>

        {/* Render Image Editor Modal if an attached image is selected for editing */}
        {editingAttachment && (
          <ImageEditorModal
            pending={editingAttachment}
            onClose={() => setEditingAttachment(null)}
            onSave={(updatedFile) => {
              onUpdatePendingAttachment?.(editingAttachment.localId, updatedFile);
              setEditingAttachment(null);
            }}
          />
        )}
      </div>
    </PopupBackdrop>,
    document.body
  );
}

export function MessageEnlargeButton({ onClick }: { onClick: () => void }) {
  const copy = useStrings().chats.composer.expanded;
  return (
    <button
      type="button"
      className="message-enlarge-button"
      aria-label={copy.enlargeAria}
      title={copy.enlargeTitle}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
    >
      <Maximize2 size={16} strokeWidth={2} aria-hidden="true" />
    </button>
  );
}
