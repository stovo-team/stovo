import { ChangeEvent, RefObject, useState } from "react";
import { Palette } from "lucide-react";
import { ColorPickerPopover } from "../../components/ui/ColorPickerPopover";
import { PopupSelect } from "../../components/ui/PopupSelect";
import { DESIGN_COLOR_VALUES } from "../../design-system/palette";
import {
  AppearanceSettings, BUBBLE_SHAPE_OPTIONS, BubbleShapeChoice,
  MESSAGE_FONT_OPTIONS, MessageFontChoice, messageFontFamily, PRESET_ACCENT_OPTIONS,
  THEME_MODE_OPTIONS, WallpaperChoice
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

interface CustomSavedTheme {
  name: string;
  themeMode: "light" | "dark" | "amoled";
  accent: "blue" | "green" | "purple" | "rose" | "amber" | "custom";
  customAccent: string;
  wallpaper: WallpaperChoice;
  bubbleRadius: number;
  bubbleShape: BubbleShapeChoice;
  messageFont: MessageFontChoice;
  messageScale?: number;
  variants?: Array<"light" | "dark">;
}

function loadSavedThemes(): CustomSavedTheme[] {
  try {
    return JSON.parse(localStorage.getItem("familyMessenger.customThemes") || "[]");
  } catch {
    return [];
  }
}

export function AppearanceThemeControls({ appearance, strings, updateAppearance, wallpaperInputRef, isUploadingWallpaper, error, onSelectWallpaper, onUpload }: Props & { wallpaperInputRef: RefObject<HTMLInputElement | null>; isUploadingWallpaper: boolean; error: string | null; onSelectWallpaper: (value: WallpaperChoice) => void; onUpload: (event: ChangeEvent<HTMLInputElement>) => void }) {
  const savedThemes = loadSavedThemes();
  return <>
    <section className="appearance-section-card">
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
    </section>
    <section className="appearance-section-card appearance-section-card--inline">
      <p className="appearance-section-label">{strings.appearance.themePresets}</p>
      <div className="appearance-presets-grid" role="group" aria-label={strings.appearance.themePresets}>
        {THEME_PRESETS.map((preset) => {
          const isActive = appearance.themeMode === preset.themeMode && appearance.accent === preset.presetTone && appearance.wallpaper === preset.wallpaper && appearance.bubbleRadius === preset.bubbleRadius;
          return <button type="button" key={preset.id} className={`appearance-preset-card${isActive ? " is-active" : ""}`} onClick={() => updateAppearance({ themeMode: preset.themeMode, accent: preset.presetTone, messageFont: preset.messageFont, bubbleShape: preset.bubbleShape, bubbleRadius: preset.bubbleRadius, wallpaper: preset.wallpaper })}><span className={`appearance-preset-swatch appearance-preset-swatch--${preset.id}`} /><span className="appearance-preset-name">{strings.appearance.presets?.[preset.id] ?? preset.name}</span></button>;
        })}
        {savedThemes.filter((saved) => !saved.variants || appearance.themeMode === "system" || saved.variants.includes(appearance.themeMode === "light" ? "light" : "dark")).map((saved, idx) => {
          const isActive = appearance.themeMode === saved.themeMode && appearance.accent === saved.accent && appearance.wallpaper === saved.wallpaper && appearance.bubbleRadius === saved.bubbleRadius;
          return <button type="button" key={`custom-${idx}`} className={`appearance-preset-card${isActive ? " is-active" : ""}`} onClick={() => updateAppearance({ themeMode: saved.themeMode, accent: saved.accent, customAccent: saved.customAccent, wallpaper: saved.wallpaper, bubbleRadius: saved.bubbleRadius, bubbleShape: saved.bubbleShape, messageFont: saved.messageFont, messageScale: saved.messageScale })}><span className="appearance-preset-swatch appearance-preset-swatch--custom" style={{ background: saved.customAccent || "var(--color-brand-gradient)" }} /><span className="appearance-preset-name">{saved.name}</span></button>;
        })}
        <ColorPickerPopover value={appearance.customAccent} label={strings.appearance.customAccentAria} className={`appearance-preset-card appearance-preset-card--custom${appearance.accent === "custom" ? " is-active" : ""}`} onChange={(hex) => updateAppearance({ accent: "custom", customAccent: hex })}>
          <span className="appearance-preset-swatch appearance-preset-swatch--custom" style={{ background: appearance.customAccent }}><Palette size={14} aria-hidden="true" /></span>
          <span className="appearance-preset-name">{strings.appearance.customColor}</span>
        </ColorPickerPopover>
      </div>
    </section>
    <section className="appearance-section-card appearance-section-card--inline">
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
    <label className="range-field"><span className="appearance-row-label"><span>{strings.appearance.curvature}</span><strong>{appearance.bubbleRadius}px</strong></span><input type="range" min="4" max="24" step="1" value={appearance.bubbleRadius} aria-label={strings.appearance.bubbleCurvatureAria} onChange={(event) => updateAppearance({ bubbleRadius: Number(event.target.value) })} /></label>
    <div className="appearance-control-row">
      <span className="appearance-row-label">{strings.appearance.bubbleShapeLabel ?? strings.appearance.curvature}</span>
      <PopupSelect className="appearance-popup-select" value={appearance.bubbleShape} onChange={(val) => updateAppearance({ bubbleShape: val as BubbleShapeChoice })} ariaLabel={strings.appearance.bubbleShapePresetsAria} options={BUBBLE_SHAPE_OPTIONS.map((opt) => ({ value: opt.value, label: strings.appearance.bubbleShapes[opt.value] ?? opt.label }))} />
    </div>
    <div className="appearance-control-row">
      <span className="appearance-row-label">{strings.appearance.font}</span>
      <PopupSelect className="appearance-popup-select" value={appearance.messageFont} onChange={(val) => updateAppearance({ messageFont: val as MessageFontChoice })} ariaLabel={strings.appearance.messageFontAria} options={MESSAGE_FONT_OPTIONS.map((opt) => ({ value: opt.value, label: strings.appearance.messageFonts[opt.value] ?? opt.label }))} renderOption={(option) => <span style={{ fontFamily: messageFontFamily(option.value as MessageFontChoice) }}>{option.label}</span>} />
    </div>
    <label className="range-field"><span className="appearance-row-label"><span>{strings.appearance.messageSize}</span><strong>{Math.round(appearance.messageScale * 100)}%</strong></span><input type="range" min="0.9" max="1.18" step="0.02" value={appearance.messageScale} onChange={(event) => updateAppearance({ messageScale: Number(event.target.value) })} /></label>
  </section>;
}

export function AppearanceAdvancedControls({ appearance, strings, updateAppearance, wallpaperInputRef, isUploadingWallpaper, error, onSelectWallpaper, onUpload }: Props & { wallpaperInputRef: RefObject<HTMLInputElement | null>; isUploadingWallpaper: boolean; error: string | null; onSelectWallpaper: (value: WallpaperChoice) => void; onUpload: (event: ChangeEvent<HTMLInputElement>) => void }) {
  const [gradientStart, setGradientStart] = useState<string>(DESIGN_COLOR_VALUES.avatarPalette.orange);
  const [gradientEnd, setGradientEnd] = useState<string>(DESIGN_COLOR_VALUES.avatarPalette.red);
  const [gradientAngle, setGradientAngle] = useState(135);
  const [gradientNotice, setGradientNotice] = useState<string | null>(null);
  const [customThemeName, setCustomThemeName] = useState("");
  const [themeSaveNotice, setThemeSaveNotice] = useState<string | null>(null);
  const [themeVariants, setThemeVariants] = useState<Array<"light" | "dark">>(["light", "dark"]);

  const gradientPreviewCss = `linear-gradient(${gradientAngle}deg, ${gradientStart}, ${gradientEnd})`;

  function applyGradient(start = gradientStart, end = gradientEnd, angle = gradientAngle) {
    const css = `linear-gradient(${angle}deg, ${start}, ${end})`;
    updateAppearance({ accent: "custom", customAccent: start });
    document.documentElement.style.setProperty("--color-brand-gradient", css);
    document.documentElement.dataset.brandGradient = "custom";
    try {
      localStorage.setItem("familyMessenger.brandGradient", css);
    } catch {
      // ignore
    }
  }

  function handleSaveTheme() {
    const savedName = customThemeName.trim() || `${strings.appearance.customColor} Theme`;
    try {
      const savedThemes = JSON.parse(localStorage.getItem("familyMessenger.customThemes") || "[]");
      savedThemes.push({
        name: savedName,
        themeMode: appearance.themeMode,
        accent: appearance.accent,
        customAccent: appearance.customAccent,
        wallpaper: appearance.wallpaper,
        bubbleRadius: appearance.bubbleRadius,
        bubbleShape: appearance.bubbleShape,
        messageFont: appearance.messageFont,
        messageScale: appearance.messageScale,
        variants: themeVariants
      });
      localStorage.setItem("familyMessenger.customThemes", JSON.stringify(savedThemes));
    } catch {
      // ignore storage failure
    }
    setThemeSaveNotice(strings.appearance.themeSaved ?? "Saved to presets!");
    setTimeout(() => setThemeSaveNotice(null), 3000);
  }

  return <>
    <section className="appearance-section-card appearance-section-card--stack">
      <p className="appearance-section-label">{strings.appearance.accentColour}</p>
      <div className="appearance-swatch-row" role="group" aria-label={strings.appearance.accentColourAria}>
        {PRESET_ACCENT_OPTIONS.map((accent) => {
          const label = strings.appearance.accents[accent.value] ?? accent.label;
          return <button type="button" className={`color-swatch ${accent.swatchClassName} ${appearance.accent === accent.value ? "active" : ""}`} aria-label={strings.appearance.accentOptionLabel(label)} aria-pressed={appearance.accent === accent.value} title={strings.appearance.accentOptionLabel(label)} key={accent.value} onClick={() => updateAppearance({ accent: accent.value })} />;
        })}
        <ColorPickerPopover value={appearance.customAccent} label={strings.appearance.customAccentAria} className={`color-swatch custom appearance-custom-swatch${appearance.accent === "custom" ? " active" : ""}`} style={{ background: appearance.customAccent }} onChange={(hex) => { updateAppearance({ accent: "custom", customAccent: hex }); applyGradient(hex, gradientEnd, gradientAngle); }}>
          <Palette aria-hidden="true" size={15} strokeWidth={2.25} />
        </ColorPickerPopover>
      </div>

      <div className="appearance-gradient-box">
        <span className="appearance-row-label">{strings.appearance.gradientConstructor}</span>
        <div className="gradient-constructor-preview" style={{ backgroundImage: gradientPreviewCss }} />
        <div className="gradient-constructor-controls">
          <ColorPickerPopover value={gradientStart} label={strings.appearance.colorStart} className="gradient-color-swatch-btn" style={{ background: gradientStart }} onChange={(hex) => { setGradientStart(hex); applyGradient(hex, gradientEnd, gradientAngle); }} />
          <ColorPickerPopover value={gradientEnd} label={strings.appearance.colorEnd} className="gradient-color-swatch-btn" style={{ background: gradientEnd }} onChange={(hex) => { setGradientEnd(hex); applyGradient(gradientStart, hex, gradientAngle); }} />
          <div className="gradient-angle-buttons">
            {[45, 90, 135, 180].map((deg) => (
              <button key={deg} type="button" className={`gradient-angle-pill${gradientAngle === deg ? " active" : ""}`} onClick={() => { setGradientAngle(deg); applyGradient(gradientStart, gradientEnd, deg); }}>{deg}°</button>
            ))}
          </div>
          <button type="button" className="secondary-button gradient-apply-btn" onClick={() => { applyGradient(); setGradientNotice(strings.appearance.gradientApplied); setTimeout(() => setGradientNotice(null), 2000); }}>
            {strings.appearance.applyGradient}
          </button>
        </div>
        {gradientNotice && <span className="appearance-notice-badge">{gradientNotice}</span>}
      </div>
    </section>

    <section className="appearance-section-card appearance-section-card--inline">
      <p className="appearance-section-label">{strings.appearance.chatBackground}</p>
      <div className="appearance-wallpaper-grid" role="radiogroup" aria-label={strings.appearance.chatBackgroundAria}>{wallpaperTiles.map((tile) => { const label = strings.appearance.wallpapers[tile.value] ?? tile.value; return <button type="button" className={`appearance-wallpaper-tile ${tile.thumbClass}`} role="radio" aria-checked={appearance.wallpaper === tile.value} aria-label={label} title={label} key={tile.value} disabled={isUploadingWallpaper && tile.value === "custom"} onClick={() => onSelectWallpaper(tile.value)}>{tile.value === "custom" ? <span>{appearance.customWallpaperFileId ? strings.appearance.photo : strings.appearance.upload}</span> : null}</button>; })}</div>
      <input ref={wallpaperInputRef} accept="image/jpeg,image/png,image/gif,image/webp" className="visually-hidden" type="file" onChange={onUpload} />
      {appearance.customWallpaperFileId && <div className="appearance-wallpaper-upload-row"><button type="button" className="button-secondary" disabled={isUploadingWallpaper} onClick={() => updateAppearance({ wallpaper: appearance.wallpaper === "custom" ? "dots" : appearance.wallpaper, customWallpaperFileId: null })}>{strings.appearance.removeCustom}</button></div>}
      {error && <p className="error-text" role="alert">{error}</p>}
    </section>

    <section className="appearance-section-card appearance-section-card--stack">
      <p className="appearance-section-label">{strings.appearance.saveCurrentTheme}</p>
      <div className="custom-theme-builder-row">
        <div className="custom-theme-builder-fields">
          <input type="text" className="settings-text-input" placeholder={strings.appearance.themeName} value={customThemeName} onChange={(e) => setCustomThemeName(e.target.value)} />
          <div className="custom-theme-variants" role="group">
            {(["light", "dark"] as const).map((variant) => (
              <label key={variant} className="custom-theme-variant"><input type="checkbox" checked={themeVariants.includes(variant)} onChange={(e) => setThemeVariants((prev) => e.target.checked ? [...prev, variant] : prev.filter((v) => v !== variant))} /><span>{strings.appearance.themes[variant]}</span></label>
            ))}
          </div>
        </div>
        <button type="button" className="secondary-button custom-theme-save-btn" disabled={themeVariants.length === 0} onClick={handleSaveTheme}>{strings.appearance.saveCurrentTheme}</button>
      </div>
      {themeSaveNotice && <span className="appearance-notice-badge">{themeSaveNotice}</span>}
    </section>
  </>;
}
