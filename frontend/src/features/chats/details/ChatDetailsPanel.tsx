import { ChangeEvent, FormEvent, RefObject, useEffect, useRef, useState } from "react";
import { Archive, BarChart2, Bell, BellOff, Check, ChevronDown, Clock3, FileCode, FileImage, FileSpreadsheet, FileText, Image, Mail, MessageSquare, MoreVertical, Music, Pencil, Settings, Star, UserPlus, Video } from "lucide-react";
import { useAuth } from "../../../auth/AuthContext";
import { ChatStats } from "../../../api/stats";
import ChatStatsDrawer from "../../../components/ChatStatsDrawer";
import { BackButton } from "../../../components/BackButton";
import { PopupField } from "../../../components/ui/PopupField";

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
import { ChatWallpaperEditorModal } from "../../../components/ChatWallpaperEditorModal";
import { LinkUnfurlCard } from "../../../components/LinkUnfurlCard";
import { ChatTransferSettingsActions } from "../transfer/ChatTransferSettingsActions";

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
  const previewUrl = useFilePreviewUrl(accessToken, file, isImage || isVideo, isVideo);
  const [videoPreviewFailed, setVideoPreviewFailed] = useState(false);

  useEffect(() => setVideoPreviewFailed(false), [previewUrl]);

  if (!isImage) {
    return (
      <button
        type="button"
        className={`media-thumb${isVideo && previewUrl && !videoPreviewFailed ? " is-video" : ""}`}
        title={`Open the message containing ${file.originalName}`}
        aria-label={`Open the message containing ${file.originalName}`}
        onClick={onFocusMessage}
      >
        {isVideo && previewUrl && !videoPreviewFailed ? (
          <video
            src={previewUrl}
            aria-hidden="true"
            muted
            playsInline
            preload="metadata"
            onError={() => setVideoPreviewFailed(true)}
          />
        ) : isVideo ? <Video aria-hidden="true" size={20} /> : isAudio ? <Music aria-hidden="true" size={20} /> : <FileText aria-hidden="true" size={20} />}
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

function SharedFileTypeIcon({ mimeType, fileName }: { mimeType: string; fileName: string }) {
  const normalizedMimeType = mimeType.toLowerCase();
  const extension = fileName.split(".").pop()?.toLowerCase() ?? "";
  if (normalizedMimeType.includes("zip") || normalizedMimeType.includes("compressed") || ["zip", "rar", "7z", "tar", "gz"].includes(extension)) {
    return <Archive aria-hidden="true" size={20} />;
  }
  if (normalizedMimeType.includes("spreadsheet") || normalizedMimeType.includes("excel") || ["xls", "xlsx", "csv", "ods"].includes(extension)) {
    return <FileSpreadsheet aria-hidden="true" size={20} />;
  }
  if (normalizedMimeType.includes("image/") || ["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(extension)) {
    return <FileImage aria-hidden="true" size={20} />;
  }
  if (normalizedMimeType.includes("json") || normalizedMimeType.includes("xml") || normalizedMimeType.includes("javascript") || normalizedMimeType.includes("typescript") || ["js", "ts", "tsx", "jsx", "html", "css", "py", "go", "rs"].includes(extension)) {
    return <FileCode aria-hidden="true" size={20} />;
  }
  return <FileText aria-hidden="true" size={20} />;
}

function sharedFileTypeLabel(mimeType: string, fileName: string) {
  const extension = fileName.split(".").pop()?.trim();
  if (extension && extension !== fileName && extension.length <= 8) return extension.toUpperCase();
  const subtype = mimeType.split("/").pop()?.split(";")[0]?.replace(/^vnd\./i, "");
  return subtype?.split(/[.+-]/).pop()?.toUpperCase() || "FILE";
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
  onOpenAddPeople,
  onPinPermissionChange,
  onMessageDelayChange,
  pendingMessageDelay,
  messageDelayStatus,
  onPreferenceChange,
  onTitleDraftChange, onDescriptionChange, onImported,
  editingChatPhotoFile,
  onCloseEditChatPhoto,
  onSaveCroppedChatPhoto,
  editingChatWallpaperFile,
  onCloseEditChatWallpaper,
  onSaveEditedChatWallpaper,
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
  editingChatPhotoFile?: File | null;
  onCloseEditChatPhoto?: () => void;
  onSaveCroppedChatPhoto?: (croppedFile: File) => void | Promise<void>;
  editingChatWallpaperFile?: File | null;
  onCloseEditChatWallpaper?: () => void;
  onSaveEditedChatWallpaper?: (wallpaperFile: File) => void | Promise<void>;
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
  onOpenAddPeople: () => void;
  onPinPermissionChange: (permission: "everyone" | "admins_only") => void;
  onMessageDelayChange: (delaySeconds: number) => Promise<boolean>;
  pendingMessageDelay: number | null;
  messageDelayStatus: { state: "saving" | "error"; message: string } | null;
  onPreferenceChange: (
    payload: {
      isMuted?: boolean;
      mutedUntil?: string | null;
      clearMutedUntil?: boolean;
      quietHoursEnabled?: boolean;
      quietHoursStart?: string | null;
      quietHoursEnd?: string | null;
      notificationMode?: "all" | "mentions_only" | "specific_senders";
      notifySenderIds?: string[];
      alwaysNotifyMentions?: boolean;
      isPinned?: boolean;
      isFavorite?: boolean;
      wallpaperFileId?: string | null;
    },
    notice: string
  ) => void;
  onTitleDraftChange: (value: string) => void;
  onDescriptionChange?: (description: string) => Promise<boolean>; onImported?: (chat: Chat) => void;
}) {
  const strings = useStrings();
  const { authRequest } = useAuth();
  const [isStatsOpen, setIsStatsOpen] = useState(false);
  const [chatStats, setChatStats] = useState<ChatStats | null>(null);
  const [isStatsLoading, setIsStatsLoading] = useState(false);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [isChatMenuOpen, setIsChatMenuOpen] = useState(false);
  const [isMuteMenuOpen, setIsMuteMenuOpen] = useState(false);
  const muteMenuRef = useRef<HTMLDivElement>(null);
  const [statsPluginEnabled, setStatsPluginEnabled] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void authRequest<{ active_plugins?: string[] }>("/api/v1/config/manifest")
      .then((manifest) => {
        if (!cancelled) setStatsPluginEnabled(manifest.active_plugins?.includes("plugin-rich-stats") ?? false);
      })
      .catch(() => {
        if (!cancelled) setStatsPluginEnabled(false);
      });
    return () => { cancelled = true; };
  }, [authRequest]);

  useEffect(() => {
    if (!isMuteMenuOpen) return;
    const closeOnOutsidePress = (event: MouseEvent) => {
      if (!muteMenuRef.current?.contains(event.target as Node)) setIsMuteMenuOpen(false);
    };
    document.addEventListener("mousedown", closeOnOutsidePress);
    return () => document.removeEventListener("mousedown", closeOnOutsidePress);
  }, [isMuteMenuOpen]);

  const handleOpenStats = async () => {
    if (!statsPluginEnabled) return;
    setIsStatsOpen(true);
    setIsStatsLoading(true);
    setStatsError(null);
    setChatStats(null);
    try {
      const data = await authRequest<ChatStats>(`/api/v1/plugins/stats/chats/${chat.id}`);
      setChatStats(data);
    } catch {
      setStatsError("Statistics could not be loaded. Please try again.");
    } finally { setIsStatsLoading(false); }
  };

  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const [descriptionDraft, setDescriptionDraft] = useState(chat.description ?? "");
  const [isSavingDescription, setIsSavingDescription] = useState(false);

  useEffect(() => {
    setDescriptionDraft(chat.description ?? "");
    setIsEditingDescription(false);
  }, [chat.id, chat.description]);

  async function handleSaveDescription(e?: FormEvent) {
    e?.preventDefault();
    if (!onDescriptionChange || isSavingDescription) return;
    setIsSavingDescription(true);
    const success = await onDescriptionChange(descriptionDraft);
    setIsSavingDescription(false);
    if (success) {
      setIsEditingDescription(false);
    }
  }

  const chatName = displayChatName(chat, currentUserId, strings);
  const [activeControl, setActiveControl] = useState<ChatInfoControl>(null);
  const [tabDirection, setTabDirection] = useState<"forward" | "backward">("forward");
  const canAddPeople = canManageChat && (chat.type === "group" || chat.type === "channel" || chat.type === "voice");
  const { nameEditor, settings } = chatInfoControlVisibility(activeControl);
  const canRename =
    canManageChat && chat.type !== "direct" && chatTitleDraft.trim() !== chatName.trim();

  const hasFamilyStorageSetting = chat.type !== "family";
  const hasCommentsSetting = chat.type === "channel";
  const hasPinPermissionSetting = canManageChat && chat.type !== "direct";
  const hasMessageDelaySetting = canManageChat && chat.type !== "direct";
  const sharedContentTabs = ["media", "audio", "files", "links"] as const;

  const [memberSearchDraft, setMemberSearchDraft] = useState("");

  const currentMessageDelay = chat.messageDelaySeconds ?? 0;
  const displayedMessageDelay = pendingMessageDelay ?? currentMessageDelay;
  const isDelayOn = displayedMessageDelay > 0;
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

  async function changeMessageDelay(delaySeconds: number) {
    await onMessageDelayChange(delaySeconds);
  }

  function handleDelayOff(event: ChangeEvent<HTMLInputElement>) {
    // Some mobile WebViews report a change for the radio that has just been
    // unchecked as well as the newly checked one. Only the selected control
    // is allowed to persist a delay value.
    if (!event.currentTarget.checked) {
      return;
    }
    void changeMessageDelay(0);
  }

  function handleDelayOn(event: ChangeEvent<HTMLInputElement>) {
    if (!event.currentTarget.checked) {
      return;
    }
    if (selectedDelayMode === "custom") {
      const parsed = parseInt(customDelayDraft, 10);
      void changeMessageDelay(parsed > 0 ? parsed : 10);
    } else {
      void changeMessageDelay(Number(selectedDelayMode) || 5);
    }
  }

  function handleDelaySelectChange(event: ChangeEvent<HTMLSelectElement>) {
    const mode = event.target.value;
    setSelectedDelayMode(mode);
    if (mode === "custom") {
      const parsed = parseInt(customDelayDraft, 10);
      void changeMessageDelay(parsed > 0 ? parsed : 10);
    } else {
      void changeMessageDelay(Number(mode));
    }
  }

  function handleCustomDelayChange(event: ChangeEvent<HTMLInputElement>) {
    const val = event.target.value;
    setCustomDelayDraft(val);
    const parsed = parseInt(val, 10);
    if (parsed > 0) {
      void changeMessageDelay(parsed);
    }
  }

  function handleDetailsTabChange(tab: SharedContentTab) {
    const currentIndex = sharedContentTabs.indexOf(detailsTab);
    const nextIndex = sharedContentTabs.indexOf(tab);
    setTabDirection(nextIndex > currentIndex ? "forward" : "backward");
    onDetailsTabChange(tab);
  }

  const muteSelection = !chat.isMuted ? "off" : !chat.mutedUntil ? "forever" : "custom";
  const muteOptions = [
    { value: "off", label: strings.chats.details.notificationsMuteOff },
    { value: "1h", label: strings.chats.details.notificationsMute1h },
    { value: "8h", label: strings.chats.details.notificationsMute8h },
    { value: "24h", label: strings.chats.details.notificationsMute24h },
    { value: "7d", label: strings.chats.details.notificationsMute7d },
    { value: "forever", label: strings.chats.details.notificationsMuteForever }
  ];
  const muteTriggerLabel = muteSelection === "custom"
    ? strings.chats.details.notificationsMutedUntil(
        new Date(chat.mutedUntil ?? Date.now()).toLocaleTimeString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
      )
    : muteOptions.find((option) => option.value === muteSelection)?.label ?? strings.chats.details.notificationsMuteOff;

  function setMuteDuration(value: string) {
    setIsMuteMenuOpen(false);
    if (value === "off") {
      void onPreferenceChange(
        { isMuted: false, clearMutedUntil: true },
        strings.chats.details.notificationsMuteOff
      );
    } else if (value === "1h") {
      void onPreferenceChange(
        { isMuted: true, mutedUntil: new Date(Date.now() + 60 * 60 * 1000).toISOString() },
        strings.chats.details.notificationsMute1h
      );
    } else if (value === "8h") {
      void onPreferenceChange(
        { isMuted: true, mutedUntil: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString() },
        strings.chats.details.notificationsMute8h
      );
    } else if (value === "24h") {
      void onPreferenceChange(
        { isMuted: true, mutedUntil: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() },
        strings.chats.details.notificationsMute24h
      );
    } else if (value === "7d") {
      void onPreferenceChange(
        { isMuted: true, mutedUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() },
        strings.chats.details.notificationsMute7d
      );
    } else if (value === "forever") {
      void onPreferenceChange(
        { isMuted: true, clearMutedUntil: true },
        strings.chats.details.notificationsMuteForever
      );
    }
  }

  if (settings) {
    return (
      <>
      <aside
        className="chat-details-panel chat-info-screen chat-info-screen--settings"
        role="dialog"
        aria-modal="true"
        aria-labelledby="chat-settings-title"
      >
        <header className="chat-info-topbar" data-call-header-chat-id={chat.id} data-call-header-kind="details">
          <BackButton
            className="chat-info-back"
            ariaLabel={strings.chats.details.backToChat}
            onClick={() => setActiveControl(null)}
          />
          <h2 id="chat-settings-title" className="chat-info-topbar-title">
            {strings.chats.details.settings}
          </h2>
        </header>

        <div className="chat-info-body">
          <ChatTransferSettingsActions chat={chat} accessToken={accessToken} currentUserId={currentUserId} onImported={onImported} />
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

          <div className="chat-info-section chat-info-section--notifications">
            <p className="chat-info-section-label">{strings.chats.details.notificationsSection}</p>
            <div className="chat-info-island">
              <div className="chat-info-row chat-info-row--mute-select">
                <div className="chat-info-row-copy">
                  <div className="chat-info-mute-title-wrap">
                    {chat.isMuted ? (
                      <BellOff aria-hidden="true" size={18} className="chat-info-mute-icon" />
                    ) : (
                      <Bell aria-hidden="true" size={18} className="chat-info-mute-icon" />
                    )}
                    <strong>{strings.chats.details.notificationsMuteLabel}</strong>
                  </div>
                  {chat.isMuted ? (
                    <small className="chat-info-mute-badge">
                      {chat.mutedUntil
                        ? strings.chats.details.notificationsMutedUntil(
                            new Date(chat.mutedUntil).toLocaleTimeString([], {
                              month: "short",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit"
                            })
                          )
                        : strings.chats.details.notificationsMutedPermanently}
                    </small>
                  ) : (
                    <small>{strings.chats.details.notificationsHelp}</small>
                  )}
                </div>
                <div className="chat-info-mute-actions">
                  <div
                    ref={muteMenuRef}
                    className="chat-info-mute-menu"
                    onKeyDown={(event) => {
                      if (event.key === "Escape") {
                        event.preventDefault();
                        setIsMuteMenuOpen(false);
                      }
                    }}
                  >
                    <button
                      type="button"
                      className="chat-info-mute-menu-trigger"
                      aria-expanded={isMuteMenuOpen}
                      aria-haspopup="menu"
                      aria-label={strings.chats.details.notificationsMuteLabel}
                      onClick={() => setIsMuteMenuOpen((open) => !open)}
                    >
                      <span>{muteTriggerLabel}</span>
                      <ChevronDown aria-hidden="true" size={15} className={isMuteMenuOpen ? "is-open" : undefined} />
                    </button>
                    {isMuteMenuOpen && (
                      <div className="chat-info-mute-menu-options" role="menu">
                        {muteOptions.map((option) => (
                          <button
                            type="button"
                            key={option.value}
                            role="menuitemradio"
                            aria-checked={muteSelection === option.value}
                            className={muteSelection === option.value ? "is-selected" : undefined}
                            onClick={() => setMuteDuration(option.value)}
                          >
                            <span>{option.label}</span>
                            {muteSelection === option.value && <Check aria-hidden="true" size={15} />}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  {chat.isMuted && (
                    <button
                      type="button"
                      className="chat-info-unmute-btn"
                      onClick={() =>
                        void onPreferenceChange(
                          { isMuted: false, clearMutedUntil: true },
                          strings.chats.details.notificationsMuteOff
                        )
                      }
                    >
                      {strings.chats.details.unmute}
                    </button>
                  )}
                </div>
              </div>

              <div className="chat-info-subdivider" />
              <label className="chat-info-row chat-info-row--toggle">
                <span className="chat-info-row-copy">
                  <strong>{strings.chats.details.notificationsQuietHours}</strong>
                  <small>{strings.chats.details.notificationsQuietHoursHelp}</small>
                </span>
                <span className="call-audio-toggle-switch">
                  <input
                    type="checkbox"
                    checked={chat.quietHoursEnabled === true}
                    onChange={(event) =>
                      void onPreferenceChange(
                        { quietHoursEnabled: event.target.checked },
                        strings.chats.details.notificationsQuietHours
                      )
                    }
                  />
                  <span className="call-audio-toggle-slider" aria-hidden={true} />
                </span>
              </label>
              {chat.quietHoursEnabled && (
                <div className="chat-info-quiet-hours-inputs">
                  <div className="chat-info-quiet-time-field">
                    <PopupField
                      label={strings.chats.details.notificationsQuietHoursFrom}
                      type="time"
                      value={chat.quietHoursStart ?? "22:00"}
                      onChange={(event) =>
                        void onPreferenceChange(
                          { quietHoursStart: event.target.value },
                          strings.chats.details.notificationsQuietHours
                        )
                      }
                    />
                  </div>
                  <span className="chat-info-quiet-time-sep">—</span>
                  <div className="chat-info-quiet-time-field">
                    <PopupField
                      label={strings.chats.details.notificationsQuietHoursTo}
                      type="time"
                      value={chat.quietHoursEnd ?? "07:00"}
                      onChange={(event) =>
                        void onPreferenceChange(
                          { quietHoursEnd: event.target.value },
                          strings.chats.details.notificationsQuietHours
                        )
                      }
                    />
                  </div>
                </div>
              )}

              <div className="chat-info-subdivider" />
              <p className="chat-info-island-subtitle">{strings.chats.details.notificationsScope}</p>
              <div className="chat-info-scope-radios" role="radiogroup" aria-label={strings.chats.details.notificationsScope}>
                <label className="chat-info-permission-option chat-info-permission-option--inline">
                  <input
                    type="radio"
                    name="chatNotificationScope"
                    value="all"
                    checked={(chat.notificationMode ?? "all") === "all"}
                    onChange={() =>
                      void onPreferenceChange(
                        { notificationMode: "all" },
                        strings.chats.details.notificationsScopeAll
                      )
                    }
                  />
                  <span>{strings.chats.details.notificationsScopeAll}</span>
                </label>
                <label className="chat-info-permission-option chat-info-permission-option--inline">
                  <input
                    type="radio"
                    name="chatNotificationScope"
                    value="mentions_only"
                    checked={chat.notificationMode === "mentions_only"}
                    onChange={() =>
                      void onPreferenceChange(
                        { notificationMode: "mentions_only" },
                        strings.chats.details.notificationsScopeMentions
                      )
                    }
                  />
                  <span>{strings.chats.details.notificationsScopeMentions}</span>
                </label>
                {chat.members.length > 1 && (
                  <label className="chat-info-permission-option chat-info-permission-option--inline">
                    <input
                      type="radio"
                      name="chatNotificationScope"
                      value="specific_senders"
                      checked={chat.notificationMode === "specific_senders"}
                      onChange={() =>
                        void onPreferenceChange(
                          { notificationMode: "specific_senders" },
                          strings.chats.details.notificationsScopeSpecific
                        )
                      }
                    />
                    <span>{strings.chats.details.notificationsScopeSpecific}</span>
                  </label>
                )}
              </div>

              {chat.notificationMode === "specific_senders" && (
                <div className="chat-info-senders-picker">
                  <p className="chat-info-senders-help">{strings.chats.details.notificationsSpecificMembersHelp}</p>
                  <PopupField
                    label={strings.chats.details.notificationsSearchMembers}
                    type="search"
                    className="chat-info-senders-search"
                    placeholder={strings.chats.details.notificationsSearchMembers}
                    value={memberSearchDraft}
                    onChange={(e) => setMemberSearchDraft(e.target.value)}
                  />
                  <div className="chat-info-senders-actions">
                    <button
                      type="button"
                      className="chat-info-senders-btn"
                      onClick={() => {
                        const allOtherIds = chat.members
                          .filter((m) => m.id !== currentUserId)
                          .map((m) => m.id);
                        void onPreferenceChange(
                          { notifySenderIds: allOtherIds },
                          strings.chats.details.notificationsSelectAll
                        );
                      }}
                    >
                      {strings.chats.details.notificationsSelectAll}
                    </button>
                    <button
                      type="button"
                      className="chat-info-senders-btn"
                      onClick={() =>
                        void onPreferenceChange(
                          { notifySenderIds: [] },
                          strings.chats.details.notificationsDeselectAll
                        )
                      }
                    >
                      {strings.chats.details.notificationsDeselectAll}
                    </button>
                  </div>
                  <ul className="chat-info-senders-list">
                    {chat.members
                      .filter(
                        (m) =>
                          m.id !== currentUserId &&
                          (!memberSearchDraft ||
                            m.displayName.toLowerCase().includes(memberSearchDraft.toLowerCase()) ||
                            m.username.toLowerCase().includes(memberSearchDraft.toLowerCase()))
                      )
                      .map((member) => {
                        const isSelected = (chat.notifySenderIds ?? []).includes(member.id);
                        return (
                          <li key={member.id} className="chat-info-sender-item">
                            <label className="chat-info-sender-label">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={(event) => {
                                  const currentIds = chat.notifySenderIds ?? [];
                                  const nextIds = event.target.checked
                                    ? [...currentIds, member.id]
                                    : currentIds.filter((id) => id !== member.id);
                                  void onPreferenceChange(
                                    { notifySenderIds: nextIds },
                                    member.displayName
                                  );
                                }}
                              />
                              <RealAvatar
                                accessToken={accessToken}
                                className="avatar avatar-sm chat-info-sender-avatar"
                                file={member.profilePhoto}
                                label={member.displayName}
                              />
                              <span className="chat-info-sender-name">
                                <strong>{member.displayName}</strong>
                                <small>@{member.username}</small>
                              </span>
                            </label>
                          </li>
                        );
                      })}
                  </ul>
                </div>
              )}

              <div className="chat-info-subdivider" />
              <label className="chat-info-row chat-info-row--toggle">
                <span className="chat-info-row-copy">
                  <strong>{strings.chats.details.notificationsAlwaysMentions}</strong>
                  <small>{strings.chats.details.notificationsAlwaysMentionsHelp}</small>
                </span>
                <span className="call-audio-toggle-switch">
                  <input
                    type="checkbox"
                    checked={chat.alwaysNotifyMentions !== false}
                    onChange={(event) =>
                      void onPreferenceChange(
                        { alwaysNotifyMentions: event.target.checked },
                        strings.chats.details.notificationsAlwaysMentions
                      )
                    }
                  />
                  <span className="call-audio-toggle-slider" aria-hidden={true} />
                </span>
              </label>
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
                {messageDelayStatus && (
                  <p
                    className={`chat-info-delay-status chat-info-delay-status--${messageDelayStatus.state}`}
                    role={messageDelayStatus.state === "error" ? "alert" : "status"}
                  >
                    {messageDelayStatus.message}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </aside>
      {editingChatWallpaperFile && onCloseEditChatWallpaper && onSaveEditedChatWallpaper && (
        <ChatWallpaperEditorModal
          file={editingChatWallpaperFile}
          onClose={onCloseEditChatWallpaper}
          onSave={onSaveEditedChatWallpaper}
        />
      )}
      </>
    );
  }

  return (
    <aside className="chat-details-panel chat-info-screen" role="dialog" aria-modal="true" aria-labelledby="chat-info-title">
      <header className="chat-info-topbar" data-call-header-chat-id={chat.id} data-call-header-kind="details">
        <BackButton className="chat-info-back" ariaLabel={strings.chats.details.backToChat} onClick={onClose} />
        <h2 id="chat-info-title" className="visually-hidden">
          {chatName}
        </h2>
        <div className="chat-info-overflow">
          <button
            type="button"
            className="chat-info-topbar-action"
            aria-label="Chat options"
            title="Chat options"
            aria-expanded={isChatMenuOpen}
            onClick={() => setIsChatMenuOpen((open) => !open)}
          >
            <MoreVertical aria-hidden="true" size={22} />
          </button>
          {isChatMenuOpen && (
            <div className="chat-info-overflow-menu" role="menu">
              {statsPluginEnabled && (
                <button type="button" role="menuitem" onClick={() => { setIsChatMenuOpen(false); void handleOpenStats(); }}>
                  <BarChart2 aria-hidden="true" size={18} /> Chat statistics
                </button>
              )}
              <button type="button" role="menuitem" onClick={() => { setIsChatMenuOpen(false); setActiveControl("settings"); }}>
                <Settings aria-hidden="true" size={18} /> {strings.chats.details.settings}
              </button>
            </div>
          )}
        </div>
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
                <div className="chat-info-title-inline-actions">
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
                </div>
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
                : chat.description?.trim()
                ? `${strings.chats.types.membersCount(chat.members.length)} · ${chat.description.trim()}`
                : strings.chats.types.membersCount(chat.members.length)}
            </p>
          )}
        </section>


        {chat.type !== "direct" && chat.type !== "archive" && (chat.description || canManageChat) && (
          <div className="chat-info-section chat-info-section--description">
            <div className="chat-info-island">
              {isEditingDescription ? (
                <form className="chat-info-description-editor" onSubmit={handleSaveDescription}>
                  <div className="chat-info-description-header">
                    <small>{strings.chats.details.description}</small>
                  </div>
                  <input
                    id="chat-info-description-input"
                    type="text"
                    className="chat-info-description-input"
                    value={descriptionDraft}
                    onChange={(e) => setDescriptionDraft(e.target.value)}
                    placeholder={strings.chats.details.descriptionPlaceholder}
                    maxLength={120}
                    autoFocus
                  />
                  <div className="chat-info-description-actions">
                    <button
                      type="submit"
                      className="chat-info-title-save chat-info-description-save"
                      disabled={isSavingDescription}
                    >
                      {strings.chats.details.save}
                    </button>
                    <button
                      type="button"
                      className="chat-info-title-cancel chat-info-description-cancel"
                      disabled={isSavingDescription}
                      onClick={() => {
                        setDescriptionDraft(chat.description ?? "");
                        setIsEditingDescription(false);
                      }}
                    >
                      {strings.chats.details.cancel}
                    </button>
                  </div>
                </form>
              ) : chat.description ? (
                <div className="chat-info-row chat-info-row--description">
                  <div className="chat-info-row-copy">
                    <small>{strings.chats.details.description}</small>
                    <strong className="chat-info-description-text">{chat.description}</strong>
                  </div>
                  {canManageChat && (
                    <button
                      type="button"
                      className="chat-info-title-edit chat-info-title-edit--description"
                      aria-label={strings.chats.details.editDescription}
                      title={strings.chats.details.editDescription}
                      onClick={() => {
                        setDescriptionDraft(chat.description ?? "");
                        setIsEditingDescription(true);
                      }}
                    >
                      <Pencil aria-hidden="true" size={18} />
                    </button>
                  )}
                </div>
              ) : canManageChat ? (
                <button
                  type="button"
                  className="chat-info-add-description-btn"
                  onClick={() => setIsEditingDescription(true)}
                >
                  <Pencil aria-hidden="true" size={16} />
                  <span>{strings.chats.details.addDescription}</span>
                </button>
              ) : null}
            </div>
          </div>
        )}

        <section className="chat-info-actions" aria-label="Chat actions">
          <button type="button" className="chat-info-action" onClick={onFocusComposer}>
            <MessageSquare className="chat-info-action-icon" aria-hidden="true" size={24} strokeWidth={1.7} />
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
            {chat.isMuted ? (
              <Bell className="chat-info-action-icon" aria-hidden="true" size={24} strokeWidth={1.7} />
            ) : (
              <BellOff className="chat-info-action-icon" aria-hidden="true" size={24} strokeWidth={1.7} />
            )}
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
            <Star
              className="chat-info-action-icon"
              aria-hidden="true"
              fill={chat.isFavorite ? "currentColor" : "none"}
              size={24}
              strokeWidth={1.7}
            />
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
              <div className={detailsTab === "links" ? "chat-info-link-list" : detailsTab === "files" ? "chat-info-file-list" : "details-media-grid chat-info-media-grid"}>
              {sharedContentItems.map((item) =>
                item.kind === "link" ? (
                  <article
                    className="chat-info-link-card"
                    key={`${item.messageId}-${item.url}`}
                  >
                    <LinkUnfurlCard
                      url={item.url}
                      accessToken={accessToken}
                      fallback={(
                        <a
                          className="chat-info-link-fallback-url"
                          href={item.url}
                          rel="noopener noreferrer"
                          target="_blank"
                          title={item.url}
                        >
                          {item.url}
                        </a>
                      )}
                    />
                    <div className="chat-info-link-actions">
                      <button
                        type="button"
                        className="chat-info-link-message"
                        onClick={() => onFocusMessage(item.messageId)}
                      >
                        {strings.chats.details.openMessage}
                      </button>
                      <a
                        className="chat-info-link-fallback"
                        href={item.url}
                        rel="noopener noreferrer"
                        target="_blank"
                        title={item.url}
                      >
                        {strings.chats.details.openLink}
                      </a>
                    </div>
                  </article>
                ) : (
                  detailsTab === "files" ? (
                    <button
                      type="button"
                      className="chat-info-file-row"
                      data-file-type={item.file.mimeType}
                      key={`${item.messageId}-${item.file.id}`}
                      onClick={() => onFocusMessage(item.messageId)}
                      title={strings.chats.details.openMessage}
                    >
                      <span className="chat-info-file-icon" aria-hidden="true">
                        <SharedFileTypeIcon mimeType={item.file.mimeType} fileName={item.file.originalName} />
                      </span>
                      <span className="chat-info-file-name">{item.file.originalName}</span>
                      <span className="chat-info-file-type">{sharedFileTypeLabel(item.file.mimeType, item.file.originalName)}</span>
                    </button>
                  ) : (
                    <SharedContentThumb
                      accessToken={accessToken}
                      file={item.file}
                      key={`${item.messageId}-${item.file.id}`}
                      onFocusMessage={() => onFocusMessage(item.messageId)}
                      onOpenImage={(file, previewUrl) => onOpenImage(file, previewUrl, item.messageId)}
                    />
                  )
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
            {canAddPeople && (
              <button
                type="button"
                className="chat-info-member-invite"
                onClick={onOpenAddPeople}
              >
                <UserPlus aria-hidden="true" size={20} />
                {strings.chats.details.addPeople}
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
      {editingChatWallpaperFile && onCloseEditChatWallpaper && onSaveEditedChatWallpaper && (
        <ChatWallpaperEditorModal
          file={editingChatWallpaperFile}
          onClose={onCloseEditChatWallpaper}
          onSave={onSaveEditedChatWallpaper}
        />
      )}
      {isStatsOpen && (
        <ChatStatsDrawer
          stats={chatStats}
          chatTitle={chatName}
          isLoading={isStatsLoading}
          error={statsError}
          onClose={() => setIsStatsOpen(false)}
        />
      )}
    </aside>
  );
}
