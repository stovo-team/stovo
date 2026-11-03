import { ChangeEvent, RefObject, useState } from "react";
import { Palette } from "lucide-react";
import { DESIGN_COLOR_VALUES } from "../../design-system/palette";
import {
  AppearanceSettings, BUBBLE_SHAPE_OPTIONS, BubbleShapeChoice,
  MESSAGE_FONT_OPTIONS, MessageFontChoice, PRESET_ACCENT_OPTIONS,
  THEME_MODE_OPTIONS, ThemeMode, WallpaperChoice
} from "../../appearance/AppearanceContext";
import type { AppStrings } from "../../config/strings";

const wallpaperTiles: Array<{ value: WallpaperChoice; thumbClass: string }> = [
  { value: "dots", thumbClass: "appearance-wallpaper-thumb--dots" }, { value: "paper", thumbClass: "appearance-wallpaper-thumb--paper" },
  { value: "aurora", thumbClass: "appearance-wallpaper-thumb--aurora" }, { value: "plain", thumbClass: "appearance-wallpaper-thumb--plain" }, { value: "custom", thumbClass: "appearance-wallpaper-thumb--custom" }
];

type Update = (patch: Partial<AppearanceSettings>) => void;
type Props = { appearance: AppearanceSettings; strings: AppStrings; updateAppearance: Update };

export interface ThemePreset {
  id: "sunset" | "aurora" | "cyber" | "ocean" | "rose";
  name: string;
  themeMode: "light" | "dark" | "amoled";
  presetTone: "amber" | "green" | "purple" | "blue" | "rose";
  messageFont: "rounded" | "sans" | "mono" | "serif" | "system";
  bubbleShape: "rounded" | "soft" | "square";
  bubbleRadius: number;
  wallpaper: "dots" | "aurora" | "paper" | "plain";
}

export const THEME_PRESETS: ThemePreset[] = [
  { id: "sunset", name: "Sunset Glow", themeMode: "dark", presetTone: "amber", messageFont: "rounded", bubbleShape: "rounded", bubbleRadius: 18, wallpaper: "dots" },
  { id: "aurora", name: "Northern Aurora", themeMode: "dark", presetTone: "green", messageFont: "sans", bubbleShape: "rounded", bubbleRadius: 20, wallpaper: "aurora" },
  { id: "cyber", name: "Cyber Violet", themeMode: "amoled", presetTone: "purple", messageFont: "mono", bubbleShape: "square", bubbleRadius: 8, wallpaper: "plain" },
  { id: "ocean", name: "Ocean Breeze", themeMode: "light", presetTone: "blue", messageFont: "sans", bubbleShape: "rounded", bubbleRadius: 18, wallpaper: "dots" },
  { id: "rose", name: "Warm Rose", themeMode: "light", presetTone: "rose", messageFont: "serif", bubbleShape: "soft", bubbleRadius: 16, wallpaper: "paper" }
];

export function AppearanceThemeControls({ appearance, strings, updateAppearance, wallpaperInputRef, isUploadingWallpaper, error, onSelectWallpaper, onUpload }: Props & { wallpaperInputRef: RefObject<HTMLInputElement | null>; isUploadingWallpaper: boolean; error: string | null; onSelectWallpaper: (value: WallpaperChoice) => void; onUpload: (event: ChangeEvent<HTMLInputElement>) => void }) {
  return <>
    <section className="appearance-section-card">
      <div className="appearance-mode-row">
        <span className="appearance-section-label">{strings.appearance.theme}</span>
        <div className="appearance-mode-cards" role="radiogroup" aria-label={strings.appearance.themeModeAria}>
          {THEME_MODE_OPTIONS.map((option) => (
            <button type="button" role="radio" key={option.value} aria-checked={appearance.themeMode === option.value} className={`appearance-mode-card appearance-mode-card--${option.value}${appearance.themeMode === option.value ? " active" : ""}`} onClick={() => updateAppearance({ themeMode: option.value })} title={strings.appearance.themes[option.value] ?? option.label}>
              <span className="appearance-mode-thumbnail">
                <span className="mode-thumb-header" />
                <span className="mode-thumb-lines"><span className="mode-thumb-line" /><span className="mode-thumb-line mode-thumb-line--accent" /></span>
              </span>
              <span className="appearance-mode-caption">{strings.appearance.themes[option.value] ?? option.label}</span>
            </button>
          ))}
        </div>
      </div>
    </section>
    <section className="appearance-section-card">
      <p className="appearance-section-label">{strings.appearance.themePresets}</p>
      <div className="appearance-presets-grid" role="group" aria-label={strings.appearance.themePresets}>
        {THEME_PRESETS.map((preset) => {
          const isActive = appearance.themeMode === preset.themeMode && appearance.accent === preset.presetTone && appearance.wallpaper === preset.wallpaper && appearance.bubbleRadius === preset.bubbleRadius;
          return <button type="button" key={preset.id} className={`appearance-preset-card${isActive ? " is-active" : ""}`} onClick={() => updateAppearance({ themeMode: preset.themeMode, accent: preset.presetTone, messageFont: preset.messageFont, bubbleShape: preset.bubbleShape, bubbleRadius: preset.bubbleRadius, wallpaper: preset.wallpaper })}><span className={`appearance-preset-swatch appearance-preset-swatch--${preset.id}`} /><span className="appearance-preset-name">{strings.appearance.presets?.[preset.id] ?? preset.name}</span></button>;
        })}
        <label className={`appearance-preset-card appearance-preset-card--custom${appearance.accent === "custom" ? " is-active" : ""}`} title={strings.appearance.customColor}>
          <span className="appearance-preset-swatch appearance-preset-swatch--custom" style={{ background: appearance.customAccent }}><Palette size={14} aria-hidden="true" /></span>
          <span className="appearance-preset-name">{strings.appearance.customColor}</span>
          <input type="color" className="visually-hidden" value={appearance.customAccent} aria-label={strings.appearance.customAccentAria} onChange={(e) => updateAppearance({ accent: "custom", customAccent: e.target.value })} />
        </label>
      </div>
    </section>
    <section className="appearance-section-card">
      <p className="appearance-section-label">{strings.appearance.chatBackground}</p>
      <div className="appearance-wallpaper-grid" role="radiogroup" aria-label={strings.appearance.chatBackgroundAria}>{wallpaperTiles.map((tile) => { const label = strings.appearance.wallpapers[tile.value] ?? tile.value; return <button type="button" className={`appearance-wallpaper-tile ${tile.thumbClass}`} role="radio" aria-checked={appearance.wallpaper === tile.value} aria-label={label} title={label} key={tile.value} disabled={isUploadingWallpaper && tile.value === "custom"} onClick={() => onSelectWallpaper(tile.value)}>{tile.value === "custom" ? <span>{appearance.customWallpaperFileId ? strings.appearance.photo : strings.appearance.upload}</span> : null}</button>; })}</div>
      <input ref={wallpaperInputRef} accept="image/jpeg,image/png,image/gif,image/webp" className="visually-hidden" type="file" onChange={onUpload} />
      {appearance.customWallpaperFileId && <div className="appearance-wallpaper-upload-row"><button type="button" className="button-secondary" disabled={isUploadingWallpaper} onClick={() => updateAppearance({ wallpaper: appearance.wallpaper === "custom" ? "dots" : appearance.wallpaper, customWallpaperFileId: null })}>{strings.appearance.removeCustom}</button></div>}
      {error && <p className="error-text" role="alert">{error}</p>}
    </section>
  </>;
}

export function GeneralChatControls({ appearance, strings, updateAppearance }: Props) {
  return <>
    <label className="appearance-toggle-row"><span><strong>{strings.appearance.autoDownloadMedia}</strong><span className="appearance-toggle-help">{strings.appearance.autoDownloadMediaHelp}</span></span><input type="checkbox" checked={appearance.autoDownloadMedia} onChange={(event) => updateAppearance({ autoDownloadMedia: event.target.checked })} /></label>
    <label className="appearance-toggle-row"><span><strong>{strings.appearance.autoDownloadWiFiOnly}</strong><span className="appearance-toggle-help">{strings.appearance.autoDownloadWiFiOnlyHelp}</span></span><input type="checkbox" disabled={!appearance.autoDownloadMedia} checked={appearance.autoDownloadWiFiOnly} onChange={(event) => updateAppearance({ autoDownloadWiFiOnly: event.target.checked })} /></label>
    <label className="appearance-toggle-row media-download-limit"><span><strong>{strings.appearance.autoDownloadLimit}</strong><span className="appearance-toggle-help">{strings.appearance.autoDownloadLimitHelp}</span></span><select value={appearance.autoDownloadLimitMB} disabled={!appearance.autoDownloadMedia} aria-label={strings.appearance.autoDownloadLimit} onChange={(event) => updateAppearance({ autoDownloadLimitMB: Number(event.target.value) })}>{[1, 5, 10, 25, 50].map((value) => <option key={value} value={value}>{value} MB</option>)}</select></label>
    {["videoAutoplay", "renderMarkdown", "enterToSend"].map((key) => <label key={key} className="appearance-toggle-row"><span><strong>{strings.appearance[key as keyof typeof strings.appearance] as string}</strong><span className="appearance-toggle-help">{strings.appearance[`${key}Help` as keyof typeof strings.appearance] as string}</span></span><input type="checkbox" checked={appearance[key as keyof AppearanceSettings] as boolean} aria-label={strings.appearance[key as keyof typeof strings.appearance] as string} onChange={(event) => updateAppearance({ [key]: event.target.checked })} /></label>)}
  </>;
}

export function AppearanceMessageControls({ appearance, strings, updateAppearance }: Props) {
  return <section className="appearance-section-card appearance-section-card--stack">
    <p className="appearance-section-label">{strings.appearance.messageStyle}</p>
    <label className="range-field"><span className="appearance-inline-row">{strings.appearance.curvature}<strong>{appearance.bubbleRadius}px</strong></span><input type="range" min="4" max="24" step="1" value={appearance.bubbleRadius} aria-label={strings.appearance.bubbleCurvatureAria} onChange={(event) => updateAppearance({ bubbleRadius: Number(event.target.value) })} /></label>
    <div className="appearance-dropdown-row">
      <label htmlFor="bubble-shape-select" className="appearance-dropdown-label">{strings.appearance.bubbleShapeLabel ?? strings.appearance.curvature}</label>
      <select id="bubble-shape-select" className="appearance-dropdown-select" value={appearance.bubbleShape} aria-label={strings.appearance.bubbleShapePresetsAria} onChange={(e) => updateAppearance({ bubbleShape: e.target.value as BubbleShapeChoice })}>{BUBBLE_SHAPE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{strings.appearance.bubbleShapes[option.value] ?? option.label}</option>)}</select>
    </div>
    <div className="appearance-dropdown-row">
      <label htmlFor="message-font-select" className="appearance-dropdown-label">{strings.appearance.font}</label>
      <select id="message-font-select" className="appearance-dropdown-select" value={appearance.messageFont} aria-label={strings.appearance.messageFontAria} onChange={(e) => updateAppearance({ messageFont: e.target.value as MessageFontChoice })}>{MESSAGE_FONT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{strings.appearance.messageFonts[option.value] ?? option.label}</option>)}</select>
    </div>
    <label className="range-field"><span className="appearance-inline-row">{strings.appearance.messageSize}<strong>{Math.round(appearance.messageScale * 100)}%</strong></span><input type="range" min="0.9" max="1.18" step="0.02" value={appearance.messageScale} onChange={(event) => updateAppearance({ messageScale: Number(event.target.value) })} /></label>
  </section>;
}

export function AppearanceAdvancedControls({ appearance, strings, updateAppearance, wallpaperInputRef, isUploadingWallpaper, error, onSelectWallpaper, onUpload }: Props & { wallpaperInputRef: RefObject<HTMLInputElement | null>; isUploadingWallpaper: boolean; error: string | null; onSelectWallpaper: (value: WallpaperChoice) => void; onUpload: (event: ChangeEvent<HTMLInputElement>) => void }) {
  const [gradientStart, setGradientStart] = useState(DESIGN_COLOR_VALUES.avatarPalette.orange);
  const [gradientEnd, setGradientEnd] = useState(DESIGN_COLOR_VALUES.avatarPalette.red);
  const [gradientAngle, setGradientAngle] = useState(135);
  const [gradientNotice, setGradientNotice] = useState<string | null>(null);
  const [customThemeName, setCustomThemeName] = useState("");
  const [customThemeMode, setCustomThemeMode] = useState<ThemeMode>("dark");
  const [themeSaveNotice, setThemeSaveNotice] = useState<string | null>(null);

  const gradientPreviewCss = `linear-gradient(${gradientAngle}deg, ${gradientStart}, ${gradientEnd})`;

  function handleApplyGradient() {
    updateAppearance({ accent: "custom", customAccent: gradientStart });
    document.documentElement.style.setProperty("--color-brand-gradient", gradientPreviewCss);
    setGradientNotice(strings.appearance.gradientApplied ?? "Applied!");
    setTimeout(() => setGradientNotice(null), 2500);
  }

  function handleSaveTheme() {
    const savedName = customThemeName.trim() || `${strings.appearance.customColor} Theme`;
    try {
      const savedThemes = JSON.parse(localStorage.getItem("familyMessenger.customThemes") || "[]");
      savedThemes.push({
        name: savedName,
        themeMode: customThemeMode,
        accent: appearance.accent,
        customAccent: appearance.customAccent,
        wallpaper: appearance.wallpaper,
        bubbleRadius: appearance.bubbleRadius,
        messageFont: appearance.messageFont
      });
      localStorage.setItem("familyMessenger.customThemes", JSON.stringify(savedThemes));
    } catch {
      // ignore storage failure
    }
    setThemeSaveNotice(strings.appearance.themeSaved ?? "Theme saved successfully");
    setTimeout(() => setThemeSaveNotice(null), 3000);
  }

  return <>
    <section className="appearance-section-card"><p className="appearance-section-label">{strings.appearance.accentColour}</p><div className="appearance-swatch-row" role="group" aria-label={strings.appearance.accentColourAria}>{PRESET_ACCENT_OPTIONS.map((accent) => { const label = strings.appearance.accents[accent.value] ?? accent.label; return <button type="button" className={`color-swatch ${accent.swatchClassName} ${appearance.accent === accent.value ? "active" : ""}`} aria-label={strings.appearance.accentOptionLabel(label)} aria-pressed={appearance.accent === accent.value} title={strings.appearance.accentOptionLabel(label)} key={accent.value} onClick={() => updateAppearance({ accent: accent.value })} />; })}<label className={`color-swatch custom appearance-custom-swatch${appearance.accent === "custom" ? " active" : ""}`} title={strings.appearance.customColor} style={{ background: appearance.customAccent }}><Palette aria-hidden="true" size={15} strokeWidth={2.25} /><span className="visually-hidden">{strings.appearance.customColor}</span><input type="color" value={appearance.customAccent} aria-label={strings.appearance.customAccentAria} onChange={(event) => updateAppearance({ accent: "custom", customAccent: event.target.value })} /></label></div></section>
    <section className="appearance-section-card"><p className="appearance-section-label">{strings.appearance.chatBackground}</p><div className="appearance-wallpaper-grid" role="radiogroup" aria-label={strings.appearance.chatBackgroundAria}>{wallpaperTiles.map((tile) => { const label = strings.appearance.wallpapers[tile.value] ?? tile.value; return <button type="button" className={`appearance-wallpaper-tile ${tile.thumbClass}`} role="radio" aria-checked={appearance.wallpaper === tile.value} aria-label={label} title={label} key={tile.value} disabled={isUploadingWallpaper && tile.value === "custom"} onClick={() => onSelectWallpaper(tile.value)}>{tile.value === "custom" ? <span>{appearance.customWallpaperFileId ? strings.appearance.photo : strings.appearance.upload}</span> : null}</button>; })}</div><input ref={wallpaperInputRef} accept="image/jpeg,image/png,image/gif,image/webp" className="visually-hidden" type="file" onChange={onUpload} />{appearance.customWallpaperFileId && <div className="appearance-wallpaper-upload-row"><button type="button" className="button-secondary" disabled={isUploadingWallpaper} onClick={() => updateAppearance({ wallpaper: appearance.wallpaper === "custom" ? "dots" : appearance.wallpaper, customWallpaperFileId: null })}>{strings.appearance.removeCustom}</button></div>}{error && <p className="error-text" role="alert">{error}</p>}</section>
    <section className="appearance-section-card appearance-section-card--stack">
      <p className="appearance-section-label">{strings.appearance.gradientConstructor ?? "Gradient constructor"}</p>
      <div className="gradient-constructor-preview" style={{ backgroundImage: gradientPreviewCss }}><span>{strings.appearance.gradientPreview ?? "Live preview"}</span></div>
      <div className="gradient-constructor-controls">
        <label className="gradient-color-field"><span>{strings.appearance.colorStart ?? "Start"}</span><input type="color" value={gradientStart} aria-label={strings.appearance.colorStart ?? "Start"} onChange={(e) => setGradientStart(e.target.value)} /></label>
        <label className="gradient-color-field"><span>{strings.appearance.colorEnd ?? "End"}</span><input type="color" value={gradientEnd} aria-label={strings.appearance.colorEnd ?? "End"} onChange={(e) => setGradientEnd(e.target.value)} /></label>
        <label className="gradient-angle-field"><span>{strings.appearance.gradientAngle ?? "Angle"}</span><select value={gradientAngle} className="appearance-dropdown-select" aria-label={strings.appearance.gradientAngle ?? "Angle"} onChange={(e) => setGradientAngle(Number(e.target.value))}><option value={45}>45°</option><option value={90}>90°</option><option value={135}>135°</option><option value={180}>180°</option></select></label>
      </div>
      <div className="appearance-action-row"><button type="button" className="secondary-button" onClick={handleApplyGradient}>{strings.appearance.applyGradient ?? "Apply gradient"}</button>{gradientNotice && <span className="appearance-notice-badge">{gradientNotice}</span>}</div>
    </section>
    <section className="appearance-section-card appearance-section-card--stack">
      <p className="appearance-section-label">{strings.appearance.customThemeConstructor ?? "Custom theme constructor"}</p>
      <div className="custom-theme-builder-row">
        <input type="text" className="settings-text-input" placeholder={strings.appearance.themeName ?? "Theme name"} value={customThemeName} onChange={(e) => setCustomThemeName(e.target.value)} />
        <select className="appearance-dropdown-select" value={customThemeMode} aria-label={strings.appearance.themeModeAria} onChange={(e) => setCustomThemeMode(e.target.value as ThemeMode)}>
          {THEME_MODE_OPTIONS.filter((opt) => opt.value !== "system").map((opt) => <option key={opt.value} value={opt.value}>{strings.appearance.themes[opt.value] ?? opt.label}</option>)}
        </select>
      </div>
      <div className="appearance-action-row"><button type="button" className="secondary-button" onClick={handleSaveTheme}>{strings.appearance.saveTheme ?? "Save theme to server"}</button>{themeSaveNotice && <span className="appearance-notice-badge">{themeSaveNotice}</span>}</div>
    </section>
  </>;
}
