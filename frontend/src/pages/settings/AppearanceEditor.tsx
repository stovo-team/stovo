import { ChangeEvent, RefObject, useEffect, useRef, useState } from "react";
import { RotateCcw } from "lucide-react";
import { useStrings } from "../../i18n/LanguageContext";
import { ApiError } from "../../api/client";
import { uploadFile } from "../../api/files";
import { avatarInitials } from "../../utils/avatarInitials";
import { DEFAULT_APPEARANCE, WallpaperChoice, useAppearance } from "../../appearance/AppearanceContext";
import { AppearanceAdvancedControls, AppearanceMessageControls, AppearanceThemeControls } from "./AppearanceControls";
import { BackButton } from "../../components/BackButton";
import { PopupDialog } from "../../components/ui/Popup";
import { PopupButton } from "../../components/ui/PopupButton";

export function AppearanceEditor({
  accessToken,
  displayName,
  onBack,
  backButtonRef
}: {
  accessToken: string | null;
  displayName: string;
  onBack: () => void;
  backButtonRef: RefObject<HTMLButtonElement | null>;
}) {
  const strings = useStrings();
  const { appearance, setAppearance, updateAppearance } = useAppearance();
  const [activeTab, setActiveTab] = useState<"simple" | "advanced">("simple");
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [wallpaperUploadError, setWallpaperUploadError] = useState<string | null>(null);
  const [isUploadingWallpaper, setIsUploadingWallpaper] = useState(false);
  const wallpaperInputRef = useRef<HTMLInputElement | null>(null);
  const baselineRef = useRef(appearance);
  const committedRef = useRef(false);

  useEffect(() => {
    backButtonRef.current?.focus();
  }, [backButtonRef]);

  function discardAndClose() {
    if (!committedRef.current) {
      setAppearance(baselineRef.current);
    }
    onBack();
  }

  function commitAndClose() {
    committedRef.current = true;
    onBack();
  }

  function handleResetConfirm() {
    updateAppearance(DEFAULT_APPEARANCE);
    setResetConfirmOpen(false);
  }

  async function handleCustomWallpaperSelect(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    event.target.value = "";
    if (!accessToken || !file) {
      return;
    }
    if (!file.type.startsWith("image/")) {
      setWallpaperUploadError(strings.errors.wallpaperMustBeImage);
      return;
    }
    setIsUploadingWallpaper(true);
    setWallpaperUploadError(null);
    try {
      const uploaded = await uploadFile(accessToken, file);
      updateAppearance({
        wallpaper: "custom",
        customWallpaperFileId: uploaded.id
      });
    } catch (err) {
      setWallpaperUploadError(
        err instanceof ApiError ? String(err.message) : strings.errors.couldNotUploadWallpaper
      );
    } finally {
      setIsUploadingWallpaper(false);
    }
  }

  function selectWallpaper(value: WallpaperChoice) {
    if (value === "custom") {
      if (appearance.customWallpaperFileId) {
        updateAppearance({ wallpaper: "custom" });
        return;
      }
      wallpaperInputRef.current?.click();
      return;
    }
    updateAppearance({ wallpaper: value });
  }

  const previewHero = (
    <div
      className="appearance-preview-hero"
      role="img"
      aria-label={strings.appearance.themePreviewAria}
      data-wallpaper={appearance.wallpaper}
    >
      <span className="preview-avatar" aria-hidden="true">
        {avatarInitials(displayName)}
      </span>
      <div className="preview-thread">
        <span className="preview-bubble">{strings.appearance.previewBubble1}</span>
        <span className="preview-bubble mine">{strings.appearance.previewBubble2}</span>
      </div>
    </div>
  );

  return (
    <>
      <div className="appearance-editor appearance-editor-enter">
        <div className="section-title-row appearance-editor-header">
          <BackButton
            buttonRef={backButtonRef}
            className="mobile-back-button"
            ariaLabel={strings.appearance.backToSettings}
            onClick={discardAndClose}
          />
          <h2>{strings.appearance.title}</h2>
        </div>


        <div className="appearance-editor-preview-column">{previewHero}</div>

        <div className="appearance-editor-controls">
          <div className="appearance-segment appearance-segment--bar appearance-segment--2 appearance-editor-nav" role="tablist" aria-label={strings.appearance.title}>
            <button type="button" role="tab" aria-selected={activeTab === "simple"} className={activeTab === "simple" ? "active" : ""} onClick={() => setActiveTab("simple")}>{strings.appearance.simpleTab}</button>
            <button type="button" role="tab" aria-selected={activeTab === "advanced"} className={activeTab === "advanced" ? "active" : ""} onClick={() => setActiveTab("advanced")}>{strings.appearance.advancedTab}</button>
          </div>

          {activeTab === "simple" ? (
            <AppearanceThemeControls appearance={appearance} strings={strings} updateAppearance={updateAppearance} wallpaperInputRef={wallpaperInputRef} isUploadingWallpaper={isUploadingWallpaper} error={wallpaperUploadError} onSelectWallpaper={selectWallpaper} onUpload={(event) => void handleCustomWallpaperSelect(event)} />
          ) : (
            <>
              <AppearanceMessageControls appearance={appearance} strings={strings} updateAppearance={updateAppearance} />
              <AppearanceAdvancedControls appearance={appearance} strings={strings} updateAppearance={updateAppearance} wallpaperInputRef={wallpaperInputRef} isUploadingWallpaper={isUploadingWallpaper} error={wallpaperUploadError} onSelectWallpaper={selectWallpaper} onUpload={(event) => void handleCustomWallpaperSelect(event)} />
            </>
          )}

          <div className="appearance-footer-actions">
            <button type="button" className="ghost-button appearance-reset-button" onClick={() => setResetConfirmOpen(true)}><RotateCcw aria-hidden="true" size={16} />{strings.appearance.resetAppearance}</button>
            <button type="button" className="appearance-done-button" onClick={commitAndClose}>{strings.appearance.save ?? strings.appearance.done}</button>
          </div>
        </div>
      </div>

      {resetConfirmOpen && (
        <PopupDialog
          ariaLabelledBy="appearance-reset-title"
          onClose={() => setResetConfirmOpen(false)}
          closeOnBackdrop
          closeOnEscape
          showCloseButton={false}
        >
            <div className="modal-header">
              <h2 id="appearance-reset-title">{strings.appearance.resetAllSettings}</h2>
            </div>
            <p className="muted-copy">
              {strings.appearance.resetNote}
            </p>
            <div className="segmented-control">
              <PopupButton variant="secondary" onClick={() => setResetConfirmOpen(false)}>
                {strings.appearance.keepMyTheme}
              </PopupButton>
              <PopupButton variant="danger" onClick={handleResetConfirm}>
                {strings.appearance.reset}
              </PopupButton>
            </div>
        </PopupDialog>
      )}
    </>
  );
}
