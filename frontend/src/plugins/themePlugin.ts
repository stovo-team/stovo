export type ThemeName = "family_warm" | "gamer_dark" | "corporate_slate";

export interface ThemeConfig {
  name: ThemeName;
  displayName: string;
  cssVariables: Record<string, string>;
}

export const themePresets: Record<ThemeName, ThemeConfig> = {
  family_warm: {
    name: "family_warm",
    displayName: "Family Warm",
    cssVariables: {
      "--bg-primary": "#fdfbf7",
      "--accent-color": "#e07a5f",
      "--text-color": "#3d405b",
    },
  },
  gamer_dark: {
    name: "gamer_dark",
    displayName: "Gamer Dark",
    cssVariables: {
      "--bg-primary": "#0f111a",
      "--accent-color": "#7289da",
      "--text-color": "#f1f1f1",
    },
  },
  corporate_slate: {
    name: "corporate_slate",
    displayName: "Corporate Slate",
    cssVariables: {
      "--bg-primary": "#f4f6f9",
      "--accent-color": "#0052cc",
      "--text-color": "#172b4d",
    },
  },
};

export function applyTheme(themeName: ThemeName | string): void {
  const theme = themePresets[themeName as ThemeName] || themePresets.family_warm;
  if (typeof document !== "undefined") {
    document.documentElement.setAttribute("data-theme", theme.name);
    Object.entries(theme.cssVariables).forEach(([key, value]) => {
      document.documentElement.style.setProperty(key, value);
    });
  }
}
