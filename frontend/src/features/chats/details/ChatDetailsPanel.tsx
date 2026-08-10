import { ChangeEvent, FormEvent, RefObject, useState } from "react";
import { Clock3, FileText, Image, Mail, Music, Pencil, Settings, Video } from "lucide-react";

import { User } from "../../../api/auth";
import { Chat } from "../../../api/chats";
import { FamilyFile } from "../../../api/files";
import { encryptionProtocolLabel } from "../../../api/messageCrypto";
import useFilePreviewUrl from "../../../hooks/useFilePreviewUrl";
import {
  canUpdateMediaVisibility,
  chatAvatarFallbackKind,
  chatAvatarFile,
  chatAvatarTypeClass,
  chatInfoControlVisibility,
  displayChatName,
  mediaVisibilityToggleChecked
} from "../shared/chatPresentation";
import type { ChatInfoControl, SharedContentItem, SharedContentTab } from "../shared/types";
import { RealAvatar } from "../sidebar/RealAvatar";

export function SharedContentThumb({
  accessToken,
  file,
  onFocusMessage,
  onOpenImage
}: {
  accessToken: string | null;
  file: FamilyFile;
  onFocusMessage: () => void;
  onOpenImage: (file: FamilyFile, previewUrl: string, messageId?: string) => void;
}) {
  const isImage = file.mimeType.startsWith("image/");
  const isVideo = file.mimeType.startsWith("video/");
  const isAudio = file.mimeType.startsWith("audio/");
  const previewUrl = useFilePreviewUrl(accessToken, file, isImage);

  if (!isImage) {
    return (
      <button
        type="button"
        className="media-thumb"
        title={`Open the message containing ${file.originalName}`}
        aria-label={`Open the message containing ${file.originalName}`}
        onClick={onFocusMessage}
      >
        {isVideo ? <Video aria-hidden="true" size={20} /> : isAudio ? <Music aria-hidden="true" size={20} /> : <FileText aria-hidden="true" size={20} />}
      </button>
    );
  }

  return (
    <button
      type="button"
      className="media-thumb is-image"
      aria-label={`Open ${file.originalName} full view`}
      title={file.originalName}
      disabled={!previewUrl}
      onClick={() => {
        if (previewUrl) {
          onOpenImage(file, previewUrl);
        }
      }}
    >
      {previewUrl ? <img src={previewUrl} alt={file.originalName} /> : <Image aria-hidden="true" size={20} />}
    </button>
  );
}

export function ChatDetailsPanel({
  accessToken,
  chat,
  chatPhotoInputRef,
  chatWallpaperInputRef,
  chatTitleDraft,
  canManageChat,
  currentUser,
  currentUserId,
  detailsTab,
  isUploading,
  sharedContentItems,
  wallpaperPreviewUrl,
  onChatPhotoSelect,
  onChatWallpaperSelect,
  onChatSettingsSubmit,
  onClose,
  onCommentsEnabledChange,
  onDetailsTabChange,
  onFocusComposer,
  onFocusMessage,
  onMediaVisibilityChange,
  onOpenImage,
  onPinPermissionChange,
  onPreferenceChange,
  onTitleDraftChange,
}: {
  accessToken: string | null;
  chat: Chat;
  chatPhotoInputRef: RefObject<HTMLInputElement | null>;
  chatWallpaperInputRef: RefObject<HTMLInputElement | null>;
  chatTitleDraft: string;
  canManageChat: boolean;
  currentUser: User | null;
  currentUserId: string | undefined;
  detailsTab: SharedContentTab;
  isUploading: boolean;
  sharedContentItems: SharedContentItem[];
  wallpaperPreviewUrl: string | null;
  onChatPhotoSelect: (event: ChangeEvent<HTMLInputElement>) => void;
  onChatWallpaperSelect: (event: ChangeEvent<HTMLInputElement>) => void;
  onChatSettingsSubmit: (event: FormEvent) => void;
  onClose: () => void;
  onCommentsEnabledChange: (enabled: boolean) => void;
  onDetailsTabChange: (tab: SharedContentTab) => void;
  onFocusComposer: () => void;
  onFocusMessage: (messageId: string) => void;
  onMediaVisibilityChange: (enabled: boolean) => void;
  onOpenImage: (file: FamilyFile, previewUrl: string, messageId?: string) => void;
  onPinPermissionChange: (permission: "everyone" | "admins_only") => void;
  onPreferenceChange: (
    payload: {
      isMuted?: boolean;
      isPinned?: boolean;
      isFavorite?: boolean;
      wallpaperFileId?: string | null;
    },
    notice: string
  ) => void;
  onTitleDraftChange: (value: string) => void;
}) {
  const chatName = displayChatName(chat, currentUserId);
  const [activeControl, setActiveControl] = useState<ChatInfoControl>(null);
  const { nameEditor, settings } = chatInfoControlVisibility(activeControl);
  const canRename =
    canManageChat && chat.type !== "direct" && chatTitleDraft.trim() !== chatName.trim();

  const hasFamilyStorageSetting = chat.type !== "family";
  const hasCommentsSetting = chat.type === "channel";
  const hasPinPermissionSetting = canManageChat && chat.type !== "direct";

  if (settings) {
    return (
      <aside
        className="chat-details-panel chat-info-screen chat-info-screen--settings"
        role="dialog"
        aria-modal="true"
        aria-labelledby="chat-settings-title"
      >
        <header className="chat-info-topbar">
          <button
            type="button"
            className="chat-info-back"
            aria-label="Back to chat info"
            onClick={() => setActiveControl(null)}
          >
            <span className="ms-icon ms-icon--24" aria-hidden={true}>
              arrow_back
            </span>
          </button>
          <h2 id="chat-settings-title" className="chat-info-topbar-title">
            Chat settings
          </h2>
        </header>

        <div className="chat-info-body">
          <div className="chat-info-section">
            <div className="chat-info-island chat-info-wallpaper">
              <div className="chat-info-wallpaper-copy">
                <strong>Chat wallpaper</strong>
                <small>Only visible to you in this chat</small>
              </div>
              <div
                className="chat-info-wallpaper-preview"
                style={
                  wallpaperPreviewUrl
                    ? {
                        backgroundImage: `url("${wallpaperPreviewUrl}")`,
                        backgroundSize: "cover",
                        backgroundPosition: "center",
                        backgroundRepeat: "no-repeat"
                      }
                    : undefined
                }
                aria-hidden={true}
              />
              <input
                ref={chatWallpaperInputRef}
                accept="image/jpeg,image/png,image/gif,image/webp"
                className="visually-hidden"
                type="file"
                disabled={isUploading}
                onChange={onChatWallpaperSelect}
              />
              <div className="chat-info-wallpaper-actions">
                <button
                  type="button"
                  className="chat-info-wallpaper-upload"
                  disabled={isUploading || !accessToken}
                  onClick={() => chatWallpaperInputRef.current?.click()}
                >
                  {isUploading ? "Uploading…" : chat.wallpaper ? "Change photo" : "Upload photo"}
                </button>
                {chat.wallpaper && (
                  <button
                    type="button"
                    className="chat-info-wallpaper-remove"
                    disabled={isUploading}
                    onClick={() =>
                      void onPreferenceChange(
                        { wallpaperFileId: "" },
                        "Chat wallpaper removed"
                      )
                    }
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>
          </div>

          {(hasFamilyStorageSetting || chat.mediaVisibilityPendingApproval) && (
            <div className="chat-info-section">
              <div className="chat-info-island">
                {hasFamilyStorageSetting && (
                  <label className="chat-info-row chat-info-row--toggle">
                    <span className="chat-info-row-copy">
                      <strong>Family storage</strong>
                      <small>Show media in shared family storage</small>
                    </span>
                    <span className="call-audio-toggle-switch">
                      <input
                        type="checkbox"
                        checked={mediaVisibilityToggleChecked(chat)}
                        disabled={!canUpdateMediaVisibility(chat, currentUser)}
                        onChange={(event) => void onMediaVisibilityChange(event.target.checked)}
                      />
                      <span className="call-audio-toggle-slider" aria-hidden={true} />
                    </span>
                  </label>
                )}
                {chat.mediaVisibilityPendingApproval && (
                  <p className="chat-info-island-note">
                    Approval {chat.mediaVisibilityApprovalCount}/{chat.mediaVisibilityApprovalRequired}
                  </p>
                )}
              </div>
            </div>
          )}

          {hasCommentsSetting && (
            <div className="chat-info-section">
              <div className="chat-info-island">
                <label className="chat-info-row chat-info-row--toggle">
                  <span className="chat-info-row-copy">
                    <strong>Comments</strong>
                    <small>Allow members to comment on posts</small>
                  </span>
                  <span className="call-audio-toggle-switch">
                    <input
                      type="checkbox"
                      checked={chat.commentsEnabled}
                      disabled={!canManageChat}
                      onChange={(event) => void onCommentsEnabledChange(event.target.checked)}
                    />
                    <span className="call-audio-toggle-slider" aria-hidden={true} />
                  </span>
                </label>
              </div>
            </div>
          )}

          {hasPinPermissionSetting && (
            <div className="chat-info-section">
              <p className="chat-info-section-label">Who can pin messages</p>
              <div className="chat-info-island" role="radiogroup" aria-label="Who can pin messages">
                <label className="chat-info-permission-option chat-info-permission-option--inline">
                  <input
                    type="radio"
                    name="pinPermission"
                    value="everyone"
                    checked={(chat.pinPermission ?? "everyone") === "everyone"}
                    onChange={() => void onPinPermissionChange("everyone")}
                  />
                  <span>Everyone</span>
                </label>
                <label className="chat-info-permission-option chat-info-permission-option--inline">
                  <input
                    type="radio"
                    name="pinPermission"
                    value="admins_only"
                    checked={(chat.pinPermission ?? "everyone") === "admins_only"}
                    onChange={() => void onPinPermissionChange("admins_only")}
                  />
                  <span>Admins only</span>
                </label>
              </div>
            </div>
          )}
        </div>
      </aside>
    );
  }

  return (
    <aside className="chat-details-panel chat-info-screen" role="dialog" aria-modal="true" aria-labelledby="chat-info-title">
      <header className="chat-info-topbar">
        <button type="button" className="chat-info-back" aria-label="Back to chat" onClick={onClose}>
          <span className="ms-icon ms-icon--24" aria-hidden={true}>
            arrow_back
          </span>
        </button>
        <h2 id="chat-info-title" className="visually-hidden">
          {chatName}
        </h2>
        <button
          type="button"
          className="chat-info-topbar-action"
          aria-label="Chat settings"
          title="Chat settings"
          onClick={() => setActiveControl("settings")}
        >
          <Settings aria-hidden="true" size={22} />
        </button>
      </header>

      <div className="chat-info-body">
        <section className="chat-info-hero">
          <div className="chat-info-avatar-wrap">
            <RealAvatar
              accessToken={accessToken}
              className={`avatar avatar-xl chat-avatar ${chatAvatarTypeClass(chat)}`}
              fallbackKind={chatAvatarFallbackKind(chat)}
              file={chatAvatarFile(chat, currentUserId)}
              label={chatName}
            />
            {canManageChat && (
              <>
                <button
                  type="button"
                  className="chat-info-avatar-edit"
                  aria-label="Change chat photo"
                  title="Change chat photo"
                  disabled={isUploading}
                  onClick={() => chatPhotoInputRef.current?.click()}
                >
                  <span className="ms-icon ms-icon--24" aria-hidden={true}>
                    add_a_photo
                  </span>
                </button>
                <input
                  ref={chatPhotoInputRef}
                  accept="image/jpeg,image/png,image/gif,image/webp"
                  className="visually-hidden"
                  disabled={isUploading}
                  type="file"
                  onChange={onChatPhotoSelect}
                />
              </>
            )}
          </div>
          <div className="chat-info-title-row">
            {nameEditor ? (
              <form className="chat-info-title-inline-editor" onSubmit={onChatSettingsSubmit}>
                <input
                  id="chat-info-name"
                  className="chat-info-inline-input"
                  aria-label="Chat name"
                  autoFocus
                  maxLength={255}
                  value={chatTitleDraft}
                  onChange={(event) => onTitleDraftChange(event.target.value)}
                />
                <button type="submit" className="chat-info-title-save" disabled={!canRename}>
                  Save
                </button>
                <button
                  type="button"
                  className="chat-info-title-cancel"
                  aria-label="Cancel editing chat name"
                  onClick={() => setActiveControl(null)}
                >
                  Cancel
                </button>
              </form>
            ) : (
              <h3>{chatName}</h3>
            )}
            {!nameEditor && canManageChat && chat.type !== "direct" && (
              <button
                type="button"
                className="chat-info-title-edit"
                aria-controls="chat-info-name-editor"
                aria-expanded={nameEditor}
                aria-label="Edit chat name"
                title="Edit chat name"
                onClick={() => setActiveControl((current) => (current === "name" ? null : "name"))}
              >
                <Pencil aria-hidden="true" size={18} />
              </button>
            )}
          </div>
          <p className="chat-info-subtitle">
            {chat.type === "direct" || chat.type === "archive"
              ? chat.type === "archive"
                ? "Saved messages"
                : "Direct message"
              : `${chat.members.length} member${chat.members.length === 1 ? "" : "s"}`}
          </p>
          <p className="chat-info-meta">{encryptionProtocolLabel(chat.encryptionProtocol)}</p>
        </section>

        <section className="chat-info-actions" aria-label="Chat actions">
          <button type="button" className="chat-info-action" onClick={onFocusComposer}>
            <span className="ms-icon ms-icon--24" aria-hidden={true}>
              chat
            </span>
            <span>Message</span>
          </button>
          <button
            type="button"
            className="chat-info-action"
            aria-pressed={chat.isMuted}
            onClick={() =>
              void onPreferenceChange(
                { isMuted: !chat.isMuted },
                chat.isMuted ? "Notifications enabled" : "Chat muted"
              )
            }
          >
            <span className="ms-icon ms-icon--24" aria-hidden={true}>
              {chat.isMuted ? "notifications" : "notifications_off"}
            </span>
            <span>{chat.isMuted ? "Unmute" : "Mute"}</span>
          </button>
          <button
            type="button"
            className="chat-info-action"
            aria-pressed={chat.isFavorite}
            onClick={() =>
              void onPreferenceChange(
                { isFavorite: !chat.isFavorite },
                chat.isFavorite ? "Removed from favorites" : "Added to favorites"
              )
            }
          >
            <span
              className={`ms-icon ms-icon--24${chat.isFavorite ? " ms-icon--filled" : ""}`}
              aria-hidden={true}
            >
              star
            </span>
            <span>{chat.isFavorite ? "Saved" : "Favorite"}</span>
          </button>
        </section>

        {(() => {
          const otherMember = chat.type === "direct" ? chat.members.find((m) => m.id !== currentUserId) : null;
          if (!otherMember || (!otherMember.bio && !otherMember.email && !otherMember.timezone)) return null;
          return (
            <div className="chat-info-section">
              <div className="chat-info-island">
                {otherMember.bio && <p className="user-bio-quote" style={{ fontStyle: "italic", marginBottom: "8px", opacity: 0.9 }}>“{otherMember.bio}”</p>}
                {otherMember.email && (
                  <div className="chat-info-row" style={{ gap: "8px", display: "flex", alignItems: "center" }}>
                    <Mail aria-hidden="true" size={16} />
                    <span className="chat-info-row-copy"><strong>Email</strong><small>{otherMember.email}</small></span>
                  </div>
                )}
                {otherMember.timezone && (
                  <div className="chat-info-row" style={{ gap: "8px", display: "flex", alignItems: "center" }}>
                    <Clock3 aria-hidden="true" size={16} />
                    <span className="chat-info-row-copy"><strong>Timezone</strong><small>{otherMember.timezone}</small></span>
                  </div>
                )}
              </div>
            </div>
          );
        })()}

        <div className="chat-info-section chat-info-section--media">
          <div className="chat-info-tabs" role="tablist" aria-label="Shared content">
            {(["media", "files", "links"] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                className={`chat-info-tab${detailsTab === tab ? " active" : ""}`}
                aria-pressed={detailsTab === tab}
                onClick={() => onDetailsTabChange(tab)}
              >
                {tab === "media" ? "Media" : tab === "files" ? "Files" : "Links"}
              </button>
            ))}
          </div>
          {sharedContentItems.length > 0 ? (
            <div className={detailsTab === "links" ? "chat-info-link-list" : "details-media-grid chat-info-media-grid"}>
              {sharedContentItems.map((item) =>
                item.kind === "link" ? (
                  <a
                    className="chat-info-link"
                    href={item.url}
                    key={`${item.messageId}-${item.url}`}
                    rel="noreferrer"
                    target="_blank"
                    title={item.url}
                  >
                    {item.url}
                  </a>
                ) : (
                  <SharedContentThumb
                    accessToken={accessToken}
                    file={item.file}
                    key={`${item.messageId}-${item.file.id}`}
                    onFocusMessage={() => onFocusMessage(item.messageId)}
                    onOpenImage={(file, previewUrl) => onOpenImage(file, previewUrl, item.messageId)}
                  />
                )
              )}
            </div>
          ) : (
            <p className="chat-info-empty">
              {detailsTab === "links"
                ? "No links yet"
                : detailsTab === "media"
                  ? "No media yet"
                  : "No files yet"}
            </p>
          )}
        </div>

        <div className="chat-info-section">
          <p className="chat-info-section-label">
            {chat.members.length} member{chat.members.length === 1 ? "" : "s"}
          </p>
          <div className="chat-info-island">
            <ul className="chat-info-member-list">
              {chat.members.map((member) => (
                <li key={member.id}>
                  <article className="chat-info-member-row">
                    <RealAvatar
                      accessToken={accessToken}
                      className="avatar member-avatar"
                      file={member.profilePhoto}
                      label={member.displayName}
                    />
                    <div className="chat-info-member-copy">
                      <strong>{member.displayName}</strong>
                      <span>@{member.username}</span>
                    </div>
                    <small>{member.role}</small>
                  </article>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </aside>
  );
}
