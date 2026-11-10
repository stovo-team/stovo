import type { AppearanceSettings, ResolvedThemeMode } from "./AppearanceContext";
import { DESIGN_COLOR_VALUES } from "../design-system/palette";

const BRAND_GRADIENT_STORAGE_KEY = "familyMessenger.brandGradient";
const BRAND_GRADIENT_PATTERN = /^linear-gradient\(\s*(\d{1,3})deg\s*,\s*(#[\da-f]{6})\s*,\s*(#[\da-f]{6})\s*\)$/i;

export function applyAppearanceToDocument(
  appearance: AppearanceSettings,
  resolvedThemeMode: ResolvedThemeMode,
  messageFontFamily: string
) {
  const root = document.documentElement;
  root.dataset.themeMode = resolvedThemeMode;
  root.dataset.accent = appearance.accent;
  root.dataset.density = appearance.density;
  root.dataset.wallpaper = appearance.wallpaper;
  root.dataset.bubbleShape = appearance.bubbleShape;
  root.dataset.messageFont = appearance.messageFont;
  root.style.setProperty("--message-scale", String(appearance.messageScale));
  root.style.setProperty("--radius-bubble", `${appearance.bubbleRadius}px`);
  root.style.setProperty("--float-radius-bubble", `${appearance.bubbleRadius}px`);
  root.style.setProperty("--message-font-family", messageFontFamily);
  root.style.setProperty("--avatar-custom-bg", appearance.avatarColor);
  applySavedBrandGradient(root);
  if (appearance.wallpaper !== "custom") root.style.removeProperty("--wallpaper-custom-image");
  if (appearance.accent === "custom") applyCustomAccent(root, appearance.customAccent);
  return () => resetAppearanceDocument(root);
}

function applySavedBrandGradient(root: HTMLElement) {
  if (typeof window === "undefined") return;
  try {
    const value = window.localStorage.getItem(BRAND_GRADIENT_STORAGE_KEY);
    const match = value?.match(BRAND_GRADIENT_PATTERN);
    const angle = match ? Number(match[1]) : -1;
    if (!match || angle < 0 || angle > 360) {
      root.style.removeProperty("--color-brand-gradient");
      return;
    }
    root.style.setProperty("--color-brand-gradient", `linear-gradient(${angle}deg, ${match[2]}, ${match[3]})`);
  } catch {
    root.style.removeProperty("--color-brand-gradient");
  }
}

function applyCustomAccent(root: HTMLElement, accent: string) {
  root.style.setProperty("--accent-primary-light", accent);
  root.style.setProperty("--accent-primary-hover-light", accent);
  root.style.setProperty("--accent-soft-light", `color-mix(in srgb, ${accent} 14%, white)`);
  root.style.setProperty("--accent-border-soft-light", accent);
  root.style.setProperty("--focus-ring-light", `${accent}55`);
  root.style.setProperty("--accent-ring-light", `${accent}40`);
  root.style.setProperty("--accent-primary-dark", accent);
  root.style.setProperty("--accent-primary-hover-dark", accent);
    root.style.setProperty("--accent-soft-dark", `color-mix(in srgb, ${accent} 24%, ${DESIGN_COLOR_VALUES.appearance.darkBlendBackground})`);
  root.style.setProperty("--accent-border-soft-dark", accent);
  root.style.setProperty("--focus-ring-dark", `${accent}66`);
  root.style.setProperty("--accent-ring-dark", `${accent}55`);
}

function resetAppearanceDocument(root: HTMLElement) {
  for (const property of [
    "themeMode", "accent", "density", "wallpaper", "bubbleShape", "messageFont"
  ]) delete root.dataset[property];
  for (const property of [
    "--message-scale", "--radius-bubble", "--float-radius-bubble", "--message-font-family",
    "--avatar-custom-bg", "--wallpaper-custom-image", "--accent-primary-light",
    "--accent-primary-hover-light", "--accent-soft-light", "--accent-border-soft-light",
    "--focus-ring-light", "--accent-ring-light", "--accent-primary-dark",
    "--accent-primary-hover-dark", "--accent-soft-dark", "--accent-border-soft-dark",
    "--focus-ring-dark", "--accent-ring-dark"
  ]) root.style.removeProperty(property);
}
