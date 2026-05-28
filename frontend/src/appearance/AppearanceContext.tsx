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

export type ThemeMode = "system" | "light" | "dark" | "amoled";
export type ResolvedThemeMode = "light" | "dark" | "amoled";
export type AccentChoice = "blue" | "green" | "purple" | "rose" | "amber" | "custom";
export type DensityChoice = "comfortable" | "compact";
export type WallpaperChoice = "dots" | "paper" | "aurora" | "plain";
export type BubbleShapeChoice = "rounded" | "soft" | "square";

export interface AppearanceSettings {
  themeMode: ThemeMode;
  accent: AccentChoice;
  customAccent: string;
  density: DensityChoice;
  wallpaper: WallpaperChoice;
  bubbleShape: BubbleShapeChoice;
  messageScale: number;
  avatarColor: string;
}

interface AppearanceContextValue {
  appearance: AppearanceSettings;
  resolvedThemeMode: ResolvedThemeMode;
  setAppearance: Dispatch<SetStateAction<AppearanceSettings>>;
  updateAppearance: (patch: Partial<AppearanceSettings>) => void;
}

export const APPEARANCE_STORAGE_KEY = "familyMessenger.appearance";

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

export const DENSITY_OPTIONS: Array<{ label: string; value: DensityChoice }> = [
  { label: "Comfortable", value: "comfortable" },
  { label: "Compact", value: "compact" }
];

export const DEFAULT_APPEARANCE: AppearanceSettings = {
  themeMode: "system",
  accent: "blue",
  customAccent: "#2aabee",
  density: "comfortable",
  wallpaper: "dots",
  bubbleShape: "rounded",
  messageScale: 1,
  avatarColor: "#0ea5e9"
};

export const WALLPAPER_OPTIONS: Array<{ label: string; value: WallpaperChoice }> = [
  { label: "Dots", value: "dots" },
  { label: "Paper", value: "paper" },
  { label: "Aurora", value: "aurora" },
  { label: "Plain", value: "plain" }
];

export const BUBBLE_SHAPE_OPTIONS: Array<{ label: string; value: BubbleShapeChoice }> = [
  { label: "Rounded", value: "rounded" },
  { label: "Soft", value: "soft" },
  { label: "Square", value: "square" }
];

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
      parsed.wallpaper === "plain"
        ? parsed.wallpaper
        : "dots";
    const bubbleShape =
      parsed.bubbleShape === "soft" || parsed.bubbleShape === "square"
        ? parsed.bubbleShape
        : "rounded";
    const messageScale =
      typeof parsed.messageScale === "number"
        ? Math.min(1.18, Math.max(0.9, parsed.messageScale))
        : DEFAULT_APPEARANCE.messageScale;
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
      wallpaper,
      bubbleShape,
      messageScale,
      avatarColor:
        typeof parsed.avatarColor === "string" && /^#[0-9a-f]{6}$/i.test(parsed.avatarColor)
          ? parsed.avatarColor
          : DEFAULT_APPEARANCE.avatarColor
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
    const root = document.documentElement;
    root.dataset.themeMode = resolvedThemeMode;
    root.dataset.accent = appearance.accent;
    root.dataset.density = appearance.density;
    root.dataset.wallpaper = appearance.wallpaper;
    root.dataset.bubbleShape = appearance.bubbleShape;
    root.style.setProperty("--message-scale", String(appearance.messageScale));
    root.style.setProperty("--avatar-custom-bg", appearance.avatarColor);
    if (appearance.accent === "custom") {
      root.style.setProperty("--accent-primary-light", appearance.customAccent);
      root.style.setProperty("--accent-primary-hover-light", appearance.customAccent);
      root.style.setProperty(
        "--accent-soft-light",
        `color-mix(in srgb, ${appearance.customAccent} 14%, white)`
      );
      root.style.setProperty("--accent-border-soft-light", appearance.customAccent);
      root.style.setProperty("--focus-ring-light", `${appearance.customAccent}55`);
      root.style.setProperty("--accent-ring-light", `${appearance.customAccent}40`);
      root.style.setProperty("--accent-primary-dark", appearance.customAccent);
      root.style.setProperty("--accent-primary-hover-dark", appearance.customAccent);
      root.style.setProperty(
        "--accent-soft-dark",
        `color-mix(in srgb, ${appearance.customAccent} 24%, #0f172a)`
      );
      root.style.setProperty("--accent-border-soft-dark", appearance.customAccent);
      root.style.setProperty("--focus-ring-dark", `${appearance.customAccent}66`);
      root.style.setProperty("--accent-ring-dark", `${appearance.customAccent}55`);
    }
    return () => {
      delete root.dataset.themeMode;
      delete root.dataset.accent;
      delete root.dataset.density;
      delete root.dataset.wallpaper;
      delete root.dataset.bubbleShape;
      root.style.removeProperty("--message-scale");
      root.style.removeProperty("--avatar-custom-bg");
      root.style.removeProperty("--accent-primary-light");
      root.style.removeProperty("--accent-primary-hover-light");
      root.style.removeProperty("--accent-soft-light");
      root.style.removeProperty("--accent-border-soft-light");
      root.style.removeProperty("--focus-ring-light");
      root.style.removeProperty("--accent-ring-light");
      root.style.removeProperty("--accent-primary-dark");
      root.style.removeProperty("--accent-primary-hover-dark");
      root.style.removeProperty("--accent-soft-dark");
      root.style.removeProperty("--accent-border-soft-dark");
      root.style.removeProperty("--focus-ring-dark");
      root.style.removeProperty("--accent-ring-dark");
    };
  }, [appearance, resolvedThemeMode]);

  const value = useMemo<AppearanceContextValue>(
    () => ({
      appearance,
      resolvedThemeMode,
      setAppearance,
      updateAppearance(patch) {
        setAppearance((current) => ({ ...current, ...patch }));
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
