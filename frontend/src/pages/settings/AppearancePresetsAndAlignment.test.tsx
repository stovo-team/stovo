import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_APPEARANCE, AppearanceProvider } from "../../appearance/AppearanceContext";
import { englishStrings } from "../../config/strings";
import { AppearanceMessageControls, AppearanceThemeControls, THEME_PRESETS } from "./AppearanceControls";
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
    expect(THEME_PRESETS.length).toBe(5);
    const presetIds = THEME_PRESETS.map((p) => p.id);
    expect(presetIds).toEqual(["sunset", "aurora", "cyber", "ocean", "rose"]);

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

  it("exposes Mode preview cards for System, Light, Dark, and AMOLED", () => {
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

    const modeCards = Array.from(container.querySelectorAll(".appearance-mode-card"));
    expect(modeCards.length).toBe(4);
    const labels = modeCards.map((b) => b.textContent?.trim());
    expect(labels).toContain("System");
    expect(labels).toContain("Light");
    expect(labels).toContain("Dark");
    expect(labels).toContain("AMOLED");

    const amoledCard = modeCards.find((c) => c.classList.contains("appearance-mode-card--amoled")) as HTMLButtonElement | undefined;
    expect(amoledCard).toBeTruthy();
    act(() => {
      amoledCard?.click();
    });
    expect(updateAppearance).toHaveBeenCalledWith({ themeMode: "amoled" });
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

    const customCard = container.querySelector(".appearance-preset-card--custom");
    expect(customCard).toBeTruthy();
    expect(customCard?.querySelector('input[type="color"]')).toBeTruthy();
  });

  it("uses dropdowns for curvature shape and font, slider only for message size without buttons", () => {
    const updateAppearance = vi.fn();
    act(() => {
      root.render(
        <AppearanceMessageControls
          appearance={DEFAULT_APPEARANCE}
          strings={englishStrings}
          updateAppearance={updateAppearance}
        />
      );
    });

    const selects = container.querySelectorAll(".appearance-popup-select");
    expect(selects.length).toBe(2);

    const selectTriggers = container.querySelectorAll(".popup-select__trigger");
    expect(selectTriggers.length).toBe(2);

    const rangeSliders = container.querySelectorAll('input[type="range"]');
    expect(rangeSliders.length).toBe(2);
  });

  it("uses unified section-title-row in AppearanceEditor, footer save button and excludes chat media", () => {
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
    expect(title?.textContent).toBe("Appearance");

    expect(container.textContent).not.toContain("Auto-download media");

    const footer = container.querySelector(".appearance-footer-actions");
    expect(footer).toBeTruthy();
    expect(footer?.querySelector(".appearance-done-button")?.textContent).toBe("Save");
    expect(footer?.querySelector(".appearance-reset-button")).toBeTruthy();
  });
});
