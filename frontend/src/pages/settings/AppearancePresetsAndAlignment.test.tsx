import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_APPEARANCE, AppearanceProvider } from "../../appearance/AppearanceContext";
import { englishStrings } from "../../config/strings";
import { AppearanceThemeControls, THEME_PRESETS } from "./AppearanceControls";
import { AppearanceEditor } from "./AppearanceEditor";
import { MemoryRouter } from "react-router-dom";
import { createRef } from "react";

describe("Appearance Presets and Alignment", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("defines comprehensive theme presets bundling mode, accent, font, bubbles and wallpaper", () => {
    expect(THEME_PRESETS.length).toBe(6);
    const presetIds = THEME_PRESETS.map((p) => p.id);
    expect(presetIds).toEqual(["sunset", "aurora", "cyber", "ocean", "rose", "midnight"]);

    for (const preset of THEME_PRESETS) {
      expect(preset.name).toBeTruthy();
      expect(["light", "dark", "amoled"]).toContain(preset.themeMode);
      expect(["amber", "green", "purple", "blue", "rose"]).toContain(preset.presetTone);
      expect(["rounded", "sans", "mono", "serif", "system"]).toContain(preset.messageFont);
      expect(["rounded", "soft", "square"]).toContain(preset.bubbleShape);
      expect(preset.bubbleRadius).toBeGreaterThan(0);
      expect(["dots", "aurora", "paper", "plain"]).toContain(preset.wallpaper);
    }
  });

  it("exposes Light, Dark, and AMOLED theme modes without filtering out Light", () => {
    const updateAppearance = vi.fn();
    act(() => {
      root.render(
        <AppearanceThemeControls
          appearance={DEFAULT_APPEARANCE}
          strings={englishStrings}
          updateAppearance={updateAppearance}
          wallpaperInputRef={createRef()}
          isUploadingWallpaper={false}
          error={null}
          onSelectWallpaper={vi.fn()}
          onUpload={vi.fn()}
        />
      );
    });

    const buttons = Array.from(container.querySelectorAll('button[role="tab"]'));
    const labels = buttons.map((b) => b.textContent?.trim());
    expect(labels).toContain("Light");
    expect(labels).toContain("Dark");
    expect(labels).toContain("AMOLED");
  });

  it("applies complete preset bundle upon clicking a preset", () => {
    const updateAppearance = vi.fn();
    act(() => {
      root.render(
        <AppearanceThemeControls
          appearance={DEFAULT_APPEARANCE}
          strings={englishStrings}
          updateAppearance={updateAppearance}
          wallpaperInputRef={createRef()}
          isUploadingWallpaper={false}
          error={null}
          onSelectWallpaper={vi.fn()}
          onUpload={vi.fn()}
        />
      );
    });

    const auroraBtn = Array.from(container.querySelectorAll(".appearance-preset-card")).find(
      (b) => b.textContent?.includes("Northern Aurora")
    ) as HTMLButtonElement | undefined;
    expect(auroraBtn).toBeTruthy();

    act(() => {
      auroraBtn?.click();
    });

    expect(updateAppearance).toHaveBeenCalledWith({
      themeMode: "dark",
      accent: "green",
      messageFont: "sans",
      bubbleShape: "rounded",
      bubbleRadius: 20,
      wallpaper: "aurora",
    });
  });

  it("uses unified section-title-row with standard mobile-back-button and h2 in AppearanceEditor", () => {
    const onBack = vi.fn();
    const backButtonRef = createRef<HTMLButtonElement>();

    act(() => {
      root.render(
        <AppearanceProvider>
          <MemoryRouter>
            <AppearanceEditor
              accessToken="mock-token"
              displayName="Stovo User"
              onBack={onBack}
              backButtonRef={backButtonRef}
            />
          </MemoryRouter>
        </AppearanceProvider>
      );
    });

    const header = container.querySelector(".section-title-row");
    expect(header).toBeTruthy();

    const backButton = header?.querySelector(".mobile-back-button");
    expect(backButton).toBeTruthy();
    expect(backButton?.classList.contains("appearance-editor-back")).toBe(false);

    const title = header?.querySelector("h2");
    expect(title).toBeTruthy();
    expect(title?.classList.contains("appearance-editor-title")).toBe(false);
    expect(title?.textContent).toBe("Appearance");
  });
});
