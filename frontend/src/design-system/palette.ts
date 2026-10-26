/**
 * Static colors used as application data (canvas tools, QR rendering, and
 * persisted color choices). CSS-only colors live in tokens.css; each value
 * here has a corresponding canonical entry in that CSS palette.
 */
export const DESIGN_COLOR_VALUES = {
  avatarPalette: {
    red: "#ef4444",
    orange: "#f59e0b",
    green: "#10b981",
    blue: "#3b82f6",
    purple: "#8b5cf6",
    pink: "#ec4899",
    teal: "#0d9488",
    sky: "#0ea5e9",
  },
  appearance: {
    defaultAccent: "#d97706",
    avatar: "#0ea5e9",
    darkBlendBackground: "#0f172a",
  },
  inviteQr: {
    dark: "#111827",
    light: "#ffffff",
  },
  imageEditor: {
    presetColors: ["#ffffff", "#ef4444", "#f59e0b", "#10b981", "#3b82f6", "#8b5cf6", "#ec4899", "#000000"],
    defaultStroke: "#ef4444",
  },
  storageCollections: {
    defaultCover: "#24364b",
    coverColors: ["#24364b", "#315f9a", "#5b4a92", "#9a4d62", "#9a6735", "#347364"],
  },
  wallpaperEditor: {
    canvasBackground: "#111827",
  },
  canvasPreview: {
    defaultStroke: "#818cf8",
    lightStroke: "#f1f5f9",
    defaultFill: "rgba(129, 140, 248, 0.16)",
    lightFill: "rgba(241, 245, 249, 0.14)",
  },
  native: {
    screenCaptureBackground: "#000000",
    meetingRecordingBackground: "#080c13",
    meetingRecordingForeground: "#e7edf8",
  },
  demo: {
    channelAvatars: ["#3b82f6", "#6366f1", "#8b5cf6", "#10b981", "#0d9488", "#f59e0b"],
    collectionCovers: ["#24364b", "#315f9a", "#5b4a92"],
    fileBadges: ["#ef4444", "#8b5cf6", "#3b82f6", "#10b981"],
  },
} as const;
