import { ChangeEvent, FormEvent, RefObject, useEffect, useState } from "react";
import { Clock3, FileText, Image, Mail, Music, Pencil, Settings, UserPlus, Video } from "lucide-react";

const MESSAGE_DELAY_PRESETS = [
  { label: "5s", value: 5 },
  { label: "10s", value: 10 },
  { label: "15s", value: 15 },
  { label: "30s", value: 30 },
  { label: "1 min", value: 60 },
  { label: "5 min", value: 300 }
] as const;

import { User } from "../../../api/auth";
import { Chat } from "../../../api/chats";
import { FamilyFile } from "../../../api/files";
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
import { useStrings } from "../../../i18n/LanguageContext";
import { AvatarEditorModal } from "../../../components/AvatarEditorModal";

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
  canCreateFamilyInvite,
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
  onOpenFamilyInvite,
  onPinPermissionChange,
  onMessageDelayChange,
  onPreferenceChange,
  onTitleDraftChange,
  editingChatPhotoFile,
  onCloseEditChatPhoto,
  onSaveCroppedChatPhoto,
}: {
  accessToken: string | null;
  chat: Chat;
  chatPhotoInputRef: RefObject<HTMLInputElement | null>;
  chatWallpaperInputRef: RefObject<HTMLInputElement | null>;
  chatTitleDraft: string;
  canCreateFamilyInvite: boolean;
  canManageChat: boolean;
  currentUser: User | null;
  currentUserId: string | undefined;
  detailsTab: SharedContentTab;
  isUploading: boolean;
  sharedContentItems: SharedContentItem[];
  wallpaperPreviewUrl: string | null;
  editingChatPhotoFile?: File | null;
  onCloseEditChatPhoto?: () => void;
  onSaveCroppedChatPhoto?: (croppedFile: File) => void | Promise<void>;
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
  onOpenFamilyInvite: () => void;
  onPinPermissionChange: (permission: "everyone" | "admins_only") => void;
  onMessageDelayChange: (delaySeconds: number) => void;
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
  const strings = useStrings();
  const chatName = displayChatName(chat, currentUserId, strings);
  const [activeControl, setActiveControl] = useState<ChatInfoControl>(null);
  const [tabDirection, setTabDirection] = useState<"forward" | "backward">("forward");
  const { nameEditor, settings } = chatInfoControlVisibility(activeControl);
  const canRename =
    canManageChat && chat.type !== "direct" && chatTitleDraft.trim() !== chatName.trim();

  const hasFamilyStorageSetting = chat.type !== "family";
  const hasCommentsSetting = chat.type === "channel";
  const hasPinPermissionSetting = canManageChat && chat.type !== "direct";
  const hasMessageDelaySetting = canManageChat && chat.type !== "direct";
  const sharedContentTabs = ["media", "audio", "files", "links"] as const;

  const currentMessageDelay = chat.messageDelaySeconds ?? 0;
  const isDelayOn = currentMessageDelay > 0;
  const isPresetDelay = (val: number) => MESSAGE_DELAY_PRESETS.some((p) => p.value === val);

  const [selectedDelayMode, setSelectedDelayMode] = useState<string>(() => {
    if (currentMessageDelay > 0) {
      return isPresetDelay(currentMessageDelay) ? String(currentMessageDelay) : "custom";
    }
    return "5";
  });

  const [customDelayDraft, setCustomDelayDraft] = useState<string>(() => {
    if (currentMessageDelay > 0 && !isPresetDelay(currentMessageDelay)) {
      return String(currentMessageDelay);
    }
    return "10";
  });

  useEffect(() => {
    if (currentMessageDelay > 0) {
      if (isPresetDelay(currentMessageDelay)) {
        setSelectedDelayMode(String(currentMessageDelay));
      } else {
        setSelectedDelayMode("custom");
        setCustomDelayDraft(String(currentMessageDelay));
      }
    }
  }, [currentMessageDelay]);

  function handleDelayOff() {
    void onMessageDelayChange(0);
  }

  function handleDelayOn() {
    if (selectedDelayMode === "custom") {
      const parsed = parseInt(customDelayDraft, 10);
      void onMessageDelayChange(parsed > 0 ? parsed : 10);
    } else {
      void onMessageDelayChange(Number(selectedDelayMode) || 5);
    }
  }

  function handleDelaySelectChange(event: ChangeEvent<HTMLSelectElement>) {
    const mode = event.target.value;
    setSelectedDelayMode(mode);
    if (mode === "custom") {
      const parsed = parseInt(customDelayDraft, 10);
      void onMessageDelayChange(parsed > 0 ? parsed : 10);
    } else {
      void onMessageDelayChange(Number(mode));
    }
  }

  function handleCustomDelayChange(event: ChangeEvent<HTMLInputElement>) {
    const val = event.target.value;
    setCustomDelayDraft(val);
    const parsed = parseInt(val, 10);
    if (parsed > 0) {
      void onMessageDelayChange(parsed);
    }
  }

  function handleDetailsTabChange(tab: SharedContentTab) {
    const currentIndex = sharedContentTabs.indexOf(detailsTab);
    const nextIndex = sharedContentTabs.indexOf(tab);
    setTabDirection(nextIndex > currentIndex ? "forward" : "backward");
    onDetailsTabChange(tab);
  }

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
            aria-label={strings.chats.details.backToChat}
            onClick={() => setActiveControl(null)}
          >
            <span className="ms-icon ms-icon--24" aria-hidden={true}>
              arrow_back
            </span>
          </button>
          <h2 id="chat-settings-title" className="chat-info-topbar-title">
            {strings.chats.details.settings}
          </h2>
        </header>

        <div className="chat-info-body">
          <div className="chat-info-section">
            <div className="chat-info-island chat-info-wallpaper">
              <div className="chat-info-wallpaper-copy">
                <strong>{strings.chats.details.wallpaper}</strong>
                <small>{strings.appearance.chatBackground}</small>
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
                  {isUploading ? strings.appearance.uploading : chat.wallpaper ? strings.chats.details.changePhoto : strings.chats.details.uploadPhoto}
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
                    {strings.chats.details.remove}
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
                      <strong>{strings.chats.details.familyStorage}</strong>
                      <small>{strings.chats.details.familyStorageHelp}</small>
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
                    <strong>{strings.chats.details.comments}</strong>
                    <small>{strings.chats.details.commentsHelp}</small>
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
              <p className="chat-info-section-label">{strings.chats.details.whoCanPin}</p>
              <div className="chat-info-island" role="radiogroup" aria-label={strings.chats.details.whoCanPin}>
                <label className="chat-info-permission-option chat-info-permission-option--inline">
                  <input
                    type="radio"
                    name="pinPermission"
                    value="everyone"
                    checked={(chat.pinPermission ?? "everyone") === "everyone"}
                    onChange={() => void onPinPermissionChange("everyone")}
                  />
                  <span>{strings.chats.details.everyone}</span>
                </label>
                <label className="chat-info-permission-option chat-info-permission-option--inline">
                  <input
                    type="radio"
                    name="pinPermission"
                    value="admins_only"
                    checked={(chat.pinPermission ?? "everyone") === "admins_only"}
                    onChange={() => void onPinPermissionChange("admins_only")}
                  />
                  <span>{strings.chats.details.adminsOnly}</span>
                </label>
              </div>
            </div>
          )}

          {hasMessageDelaySetting && (
            <div className="chat-info-section">
              <p className="chat-info-section-label">{strings.chats.details.messageDelay}</p>
              <div className="chat-info-island" role="radiogroup" aria-label={strings.chats.details.messageDelay}>
                <label className="chat-info-permission-option chat-info-permission-option--inline">
                  <input
                    type="radio"
                    name="messageDelay"
                    value="off"
                    checked={!isDelayOn}
                    onChange={handleDelayOff}
                  />
                  <span>{strings.chats.details.off}</span>
                </label>
                <label className="chat-info-permission-option chat-info-permission-option--inline">
                  <input
                    type="radio"
                    name="messageDelay"
                    value="on"
                    checked={isDelayOn}
                    onChange={handleDelayOn}
                  />
                  <span>{strings.chats.details.on ?? "On"}</span>
                </label>

                {isDelayOn && (
                  <div className="chat-info-delay-controls">
                    <div className="chat-info-delay-select-wrap">
                      <select
                        className="chat-info-delay-select"
                        aria-label={strings.chats.details.messageDelay}
                        value={selectedDelayMode}
                        onChange={handleDelaySelectChange}
                      >
                        {MESSAGE_DELAY_PRESETS.map((preset) => (
                          <option key={preset.value} value={String(preset.value)}>
                            {preset.label}
                          </option>
                        ))}
                        <option value="custom">{strings.chats.details.custom ?? "Custom"}</option>
                      </select>
                    </div>
                    {selectedDelayMode === "custom" && (
                      <div className="chat-info-delay-custom-wrap">
                        <input
                          type="number"
                          min="1"
                          max="86400"
                          className="chat-info-delay-custom-input"
                          aria-label="Custom delay seconds"
                          placeholder="Seconds"
                          value={customDelayDraft}
                          onChange={handleCustomDelayChange}
                        />
                        <span className="chat-info-delay-custom-unit">
                          {strings.chats.details.seconds ?? "seconds"}
                        </span>
                      </div>
                    )}
                  </div>
                )}
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
        <button type="button" className="chat-info-back" aria-label={strings.chats.details.backToChat} onClick={onClose}>
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
          aria-label={strings.chats.details.settings}
          title={strings.chats.details.settings}
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
                  aria-label={strings.chats.details.changeChatPhoto}
                  title={strings.chats.details.changeChatPhoto}
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
                  aria-label={strings.chats.details.name}
                  autoFocus
                  maxLength={255}
                  value={chatTitleDraft}
                  onChange={(event) => onTitleDraftChange(event.target.value)}
                />
                <button type="submit" className="chat-info-title-save" disabled={!canRename}>
                  {strings.chats.details.save}
                </button>
                <button
                  type="button"
                  className="chat-info-title-cancel"
                  aria-label={strings.chats.details.cancel}
                  onClick={() => setActiveControl(null)}
                >
                  {strings.chats.details.cancel}
                </button>
              </form>
            ) : (
              <div className="chat-info-title-wrap">
                <h3>{chatName}</h3>
                {canManageChat && chat.type !== "direct" && (
                  <button
                    type="button"
                    className="chat-info-title-edit"
                    aria-controls="chat-info-name-editor"
                    aria-expanded={nameEditor}
                    aria-label={strings.chats.details.editChatName}
                    title={strings.chats.details.editChatName}
                    onClick={() => setActiveControl((current) => (current === "name" ? null : "name"))}
                  >
                    <Pencil aria-hidden="true" size={18} />
                  </button>
                )}
              </div>
            )}
          </div>
          {chat.type !== "archive" && (
            <p className="chat-info-subtitle">
              {chat.type === "direct"
                ? strings.chats.types.directMessage
                : strings.chats.types.membersCount(chat.members.length)}
            </p>
          )}
        </section>

        <section className="chat-info-actions" aria-label="Chat actions">
          <button type="button" className="chat-info-action" onClick={onFocusComposer}>
            <span className="ms-icon ms-icon--24" aria-hidden={true}>
              chat
            </span>
            <span>{strings.chats.details.message}</span>
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
            <span>{chat.isMuted ? strings.chats.details.unmute : strings.chats.details.mute}</span>
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
            <span>{chat.isFavorite ? strings.chats.details.saved : strings.chats.details.favorite}</span>
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
                    <span className="chat-info-row-copy"><strong>{strings.chats.details.email}</strong><small>{otherMember.email}</small></span>
                  </div>
                )}
                {otherMember.timezone && (
                  <div className="chat-info-row" style={{ gap: "8px", display: "flex", alignItems: "center" }}>
                    <Clock3 aria-hidden="true" size={16} />
                    <span className="chat-info-row-copy"><strong>{strings.chats.details.timezone}</strong><small>{otherMember.timezone}</small></span>
                  </div>
                )}
              </div>
            </div>
          );
        })()}

        <div className="chat-info-section chat-info-section--media">
          <div className="chat-info-tabs" role="tablist" aria-label="Shared content">
            {sharedContentTabs.map((tab) => (
              <button
                key={tab}
                type="button"
                className={`chat-info-tab${detailsTab === tab ? " active" : ""}`}
                aria-pressed={detailsTab === tab}
                onClick={() => handleDetailsTabChange(tab)}
              >
                {tab === "media"
                  ? strings.chats.details.tabs.media
                  : tab === "audio"
                    ? strings.chats.details.tabs.audio
                    : tab === "files"
                      ? strings.chats.details.tabs.files
                      : strings.chats.details.tabs.links}
              </button>
            ))}
          </div>
          <div key={detailsTab} className={`chat-info-tab-panel chat-info-tab-panel--${tabDirection}`}>
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
                  ? strings.chats.details.empty.links
                  : detailsTab === "media"
                    ? strings.chats.details.empty.media
                    : detailsTab === "audio"
                      ? strings.chats.details.empty.audio
                      : strings.chats.details.empty.files}
              </p>
            )}
          </div>
        </div>

        <div className="chat-info-section">
          <p className="chat-info-section-label">
            {strings.chats.types.membersCount(chat.members.length)}
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
            {canCreateFamilyInvite && chat.members.length > 1 && (
              <button
                type="button"
                className="chat-info-member-invite"
                onClick={onOpenFamilyInvite}
              >
                <UserPlus aria-hidden="true" size={20} />
                {strings.chats.details.inviteMember}
              </button>
            )}
          </div>
        </div>
      </div>
      {editingChatPhotoFile && onCloseEditChatPhoto && onSaveCroppedChatPhoto && (
        <AvatarEditorModal
          file={editingChatPhotoFile}
          title={strings.avatarEditor.chatPhotoTitle}
          applyLabel={strings.avatarEditor.applyGeneric}
          onClose={onCloseEditChatPhoto}
          onSave={onSaveCroppedChatPhoto}
        />
      )}
    </aside>
  );
}

