import {
  createContext,
  Dispatch,
  ReactNode,
  SetStateAction,
  useContext,
  useEffect,
  useMemo,
  useState
} from "react";
import { DESIGN_COLOR_VALUES } from "../design-system/palette";
import { applyAppearanceToDocument } from "./appearanceDom";

export type ThemeMode = "system" | "light" | "dark" | "amoled";
export type ResolvedThemeMode = "light" | "dark" | "amoled";
export type AccentChoice = "blue" | "green" | "purple" | "rose" | "amber" | "custom";
export type DensityChoice = "comfortable" | "compact";
export type WallpaperChoice = "dots" | "paper" | "aurora" | "plain" | "custom";
export type BubbleShapeChoice = "rounded" | "soft" | "square";
export type MessageFontChoice = "system" | "sans" | "serif" | "rounded" | "mono";

export interface AppearanceSettings {
  themeMode: ThemeMode;
  accent: AccentChoice;
  customAccent: string;
  density: DensityChoice;
  wallpaper: WallpaperChoice;
  /** Uploaded image file id used when wallpaper is "custom". */
  customWallpaperFileId: string | null;
  bubbleShape: BubbleShapeChoice;
  /** Corner radius for chat bubbles, in px (4–24). */
  bubbleRadius: number;
  messageFont: MessageFontChoice;
  messageScale: number;
  avatarColor: string;
  /** Muted inline video autoplay in chat (Telegram-style). */
  videoAutoplay: boolean;
  /** Pre-cache eligible chat attachments for offline viewing. */
  autoDownloadMedia: boolean;
  /** Maximum attachment size automatically cached, in MiB. */
  autoDownloadLimitMB: number;
  /** Require a connection that is not reported as cellular/metered. */
  autoDownloadWiFiOnly: boolean;
  /** Render message markdown instead of plain text. */
  renderMarkdown: boolean;
  /** When true, Enter sends; when false, Enter inserts a newline (Ctrl/Cmd+Enter sends). */
  sendOnEnter: boolean;
}

interface AppearanceContextValue {
  appearance: AppearanceSettings;
  resolvedThemeMode: ResolvedThemeMode;
  setAppearance: Dispatch<SetStateAction<AppearanceSettings>>;
  updateAppearance: (patch: Partial<AppearanceSettings>) => void;
}

export const APPEARANCE_STORAGE_KEY = "familyMessenger.appearance";
/** One-time migration: legacy default was Enter=newline; web default is now Enter=send. */
const SEND_ON_ENTER_DEFAULT_V2_KEY = "familyMessenger.appearance.sendOnEnterDefaultV2";

export const THEME_MODE_OPTIONS: Array<{ label: string; value: ThemeMode }> = [
  { label: "System", value: "system" },
  { label: "Light", value: "light" },
  { label: "Dark", value: "dark" },
  { label: "AMOLED", value: "amoled" }
];

export const ACCENT_OPTIONS: Array<{
  label: string;
  value: AccentChoice;
  swatchClassName: string;
}> = [
  { label: "Blue", value: "blue", swatchClassName: "blue" },
  { label: "Green", value: "green", swatchClassName: "green" },
  { label: "Purple", value: "purple", swatchClassName: "purple" },
  { label: "Rose", value: "rose", swatchClassName: "rose" },
  { label: "Amber", value: "amber", swatchClassName: "amber" },
  { label: "Custom", value: "custom", swatchClassName: "custom" }
];

export const PRESET_ACCENT_OPTIONS = ACCENT_OPTIONS.filter((option) => option.value !== "custom");

export const DENSITY_OPTIONS: Array<{ label: string; value: DensityChoice }> = [
  { label: "Comfortable", value: "comfortable" },
  { label: "Compact", value: "compact" }
];

export const DEFAULT_APPEARANCE: AppearanceSettings = {
  themeMode: "system",
  accent: "rose",
  customAccent: DESIGN_COLOR_VALUES.appearance.defaultAccent,
  density: "comfortable",
  wallpaper: "dots",
  customWallpaperFileId: null,
  bubbleShape: "rounded",
  bubbleRadius: 18,
  messageFont: "system",
  messageScale: 1,
  avatarColor: DESIGN_COLOR_VALUES.appearance.avatar,
  videoAutoplay: true,
  autoDownloadMedia: true,
  autoDownloadLimitMB: 10,
  autoDownloadWiFiOnly: false,
  renderMarkdown: true,
  sendOnEnter: true
};

export const WALLPAPER_OPTIONS: Array<{ label: string; value: WallpaperChoice }> = [
  { label: "Dots", value: "dots" },
  { label: "Paper", value: "paper" },
  { label: "Aurora", value: "aurora" },
  { label: "Plain", value: "plain" },
  { label: "Custom", value: "custom" }
];

export const BUBBLE_SHAPE_OPTIONS: Array<{ label: string; value: BubbleShapeChoice }> = [
  { label: "Rounded", value: "rounded" },
  { label: "Soft", value: "soft" },
  { label: "Square", value: "square" }
];

export const MESSAGE_FONT_OPTIONS: Array<{
  label: string;
  value: MessageFontChoice;
  family: string;
}> = [
  {
    label: "System",
    value: "system",
    family: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
  },
  {
    label: "Sans",
    value: "sans",
    family: "Inter, ui-sans-serif, system-ui, sans-serif"
  },
  {
    label: "Serif",
    value: "serif",
    family: 'Georgia, "Times New Roman", serif'
  },
  {
    label: "Rounded",
    value: "rounded",
    family: '"Nunito", "Segoe UI Rounded", "SF Pro Rounded", system-ui, sans-serif'
  },
  {
    label: "Mono",
    value: "mono",
    family: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
  }
];

export function bubbleRadiusFromShape(shape: BubbleShapeChoice) {
  if (shape === "square") {
    return 6;
  }
  if (shape === "soft") {
    return 12;
  }
  return 18;
}

export function bubbleShapeFromRadius(radius: number): BubbleShapeChoice {
  if (radius <= 8) {
    return "square";
  }
  if (radius <= 14) {
    return "soft";
  }
  return "rounded";
}

export function messageFontFamily(font: MessageFontChoice) {
  return (
    MESSAGE_FONT_OPTIONS.find((option) => option.value === font)?.family ??
    MESSAGE_FONT_OPTIONS[0].family
  );
}

const AppearanceContext = createContext<AppearanceContextValue | null>(null);

function readAppearanceSettings(): AppearanceSettings {
  if (typeof window === "undefined") {
    return DEFAULT_APPEARANCE;
  }
  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(APPEARANCE_STORAGE_KEY) ?? "{}"
    ) as Partial<AppearanceSettings>;
    const accent =
      parsed.accent === "green" ||
      parsed.accent === "purple" ||
      parsed.accent === "rose" ||
      parsed.accent === "amber" ||
      parsed.accent === "custom"
        ? parsed.accent
        : "blue";
    const wallpaper =
      parsed.wallpaper === "paper" ||
      parsed.wallpaper === "aurora" ||
      parsed.wallpaper === "plain" ||
      parsed.wallpaper === "custom"
        ? parsed.wallpaper
        : "dots";
    const customWallpaperFileId =
      typeof parsed.customWallpaperFileId === "string" && parsed.customWallpaperFileId.trim()
        ? parsed.customWallpaperFileId.trim()
        : null;
    const bubbleShape =
      parsed.bubbleShape === "soft" || parsed.bubbleShape === "square"
        ? parsed.bubbleShape
        : "rounded";
    const bubbleRadius =
      typeof parsed.bubbleRadius === "number"
        ? Math.min(24, Math.max(4, Math.round(parsed.bubbleRadius)))
        : bubbleRadiusFromShape(bubbleShape);
    const messageFont =
      parsed.messageFont === "sans" ||
      parsed.messageFont === "serif" ||
      parsed.messageFont === "rounded" ||
      parsed.messageFont === "mono"
        ? parsed.messageFont
        : "system";
    const messageScale =
      typeof parsed.messageScale === "number"
        ? Math.min(1.18, Math.max(0.9, parsed.messageScale))
        : DEFAULT_APPEARANCE.messageScale;
    let sendOnEnter =
      typeof parsed.sendOnEnter === "boolean"
        ? parsed.sendOnEnter
        : DEFAULT_APPEARANCE.sendOnEnter;
    // Promote legacy default (false) to Enter-to-send once, then respect user choice.
    if (!window.localStorage.getItem(SEND_ON_ENTER_DEFAULT_V2_KEY)) {
      window.localStorage.setItem(SEND_ON_ENTER_DEFAULT_V2_KEY, "1");
      if (parsed.sendOnEnter !== true) {
        sendOnEnter = true;
      }
    }
    return {
      themeMode:
        parsed.themeMode === "light" ||
        parsed.themeMode === "dark" ||
        parsed.themeMode === "amoled"
          ? parsed.themeMode
          : "system",
      accent,
      customAccent:
        typeof parsed.customAccent === "string" && /^#[0-9a-f]{6}$/i.test(parsed.customAccent)
          ? parsed.customAccent
          : DEFAULT_APPEARANCE.customAccent,
      density: parsed.density === "compact" ? "compact" : "comfortable",
      wallpaper: wallpaper === "custom" && !customWallpaperFileId ? "dots" : wallpaper,
      customWallpaperFileId,
      bubbleShape: typeof parsed.bubbleRadius === "number" ? bubbleShapeFromRadius(bubbleRadius) : bubbleShape,
      bubbleRadius,
      messageFont,
      messageScale,
      avatarColor:
        typeof parsed.avatarColor === "string" && /^#[0-9a-f]{6}$/i.test(parsed.avatarColor)
          ? parsed.avatarColor
          : DEFAULT_APPEARANCE.avatarColor,
      videoAutoplay:
        typeof parsed.videoAutoplay === "boolean"
          ? parsed.videoAutoplay
          : DEFAULT_APPEARANCE.videoAutoplay,
      autoDownloadMedia:
        typeof parsed.autoDownloadMedia === "boolean"
          ? parsed.autoDownloadMedia
          : DEFAULT_APPEARANCE.autoDownloadMedia,
      autoDownloadLimitMB:
        typeof parsed.autoDownloadLimitMB === "number" && [1, 5, 10, 25, 50].includes(parsed.autoDownloadLimitMB)
          ? parsed.autoDownloadLimitMB
          : DEFAULT_APPEARANCE.autoDownloadLimitMB,
      autoDownloadWiFiOnly:
        typeof parsed.autoDownloadWiFiOnly === "boolean"
          ? parsed.autoDownloadWiFiOnly
          : DEFAULT_APPEARANCE.autoDownloadWiFiOnly,
      renderMarkdown:
        typeof parsed.renderMarkdown === "boolean"
          ? parsed.renderMarkdown
          : DEFAULT_APPEARANCE.renderMarkdown,
      sendOnEnter
    };
  } catch {
    return DEFAULT_APPEARANCE;
  }
}

function getSystemDarkPreference() {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function resolveThemeMode(
  themeMode: ThemeMode,
  prefersDark: boolean
): ResolvedThemeMode {
  if (themeMode === "system") {
    return prefersDark ? "dark" : "light";
  }
  return themeMode;
}

export function AppearanceProvider({ children }: { children: ReactNode }) {
  const [appearance, setAppearance] = useState<AppearanceSettings>(() =>
    readAppearanceSettings()
  );
  const [prefersDark, setPrefersDark] = useState(() => getSystemDarkPreference());

  const resolvedThemeMode = useMemo(
    () => resolveThemeMode(appearance.themeMode, prefersDark),
    [appearance.themeMode, prefersDark]
  );

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return undefined;
    }

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    function handleChange(event: MediaQueryListEvent) {
      setPrefersDark(event.matches);
    }

    setPrefersDark(mediaQuery.matches);
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem(APPEARANCE_STORAGE_KEY, JSON.stringify(appearance));
  }, [appearance]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    function handleToggleTheme() {
      setAppearance((current) => {
        const isDark = resolvedThemeMode === "dark" || resolvedThemeMode === "amoled";
        return {
          ...current,
          themeMode: isDark ? "light" : "dark"
        };
      });
    }

    window.addEventListener("stovo:toggle-theme", handleToggleTheme);
    return () => window.removeEventListener("stovo:toggle-theme", handleToggleTheme);
  }, [resolvedThemeMode]);

  useEffect(() => {
    return applyAppearanceToDocument(
      appearance,
      resolvedThemeMode,
      messageFontFamily(appearance.messageFont)
    );
  }, [appearance, resolvedThemeMode]);

  const value = useMemo<AppearanceContextValue>(
    () => ({
      appearance,
      resolvedThemeMode,
      setAppearance,
      updateAppearance(patch) {
        setAppearance((current) => {
          const next = { ...current, ...patch };
          if (typeof patch.bubbleRadius === "number" && patch.bubbleShape === undefined) {
            next.bubbleShape = bubbleShapeFromRadius(patch.bubbleRadius);
          }
          if (patch.bubbleShape !== undefined && patch.bubbleRadius === undefined) {
            next.bubbleRadius = bubbleRadiusFromShape(patch.bubbleShape);
          }
          return next;
        });
      }
    }),
    [appearance, resolvedThemeMode]
  );

  return (
    <AppearanceContext.Provider value={value}>{children}</AppearanceContext.Provider>
  );
}

export function useAppearance() {
  const context = useContext(AppearanceContext);
  if (!context) {
    throw new Error("useAppearance must be used within AppearanceProvider");
  }
  return context;
}
