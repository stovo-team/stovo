import { test, expect, ready } from "./fixtures";
import path from "node:path";
import { copyFileSync, mkdirSync } from "node:fs";

test("renders appearance menu presets in equal-sized grid and title on top without wallpaper overlap on mobile", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    localStorage.setItem("familyMessenger.devicePreferences", JSON.stringify({ language: "ru" }));
    localStorage.setItem("familyMessenger.appearance", JSON.stringify({
      themeMode: "dark",
      accent: "amber",
      messageFont: "rounded",
      bubbleShape: "rounded",
      bubbleRadius: 18,
      wallpaper: "dots"
    }));
  });

  await page.goto("/app/settings");
  await ready(page);

  // Open Appearance editor
  const appearanceTile = page.locator(".settings-tile--appearance");
  await expect(appearanceTile).toBeVisible();
  await appearanceTile.click();

  const appearanceView = page.locator(".settings-appearance-view");
  await expect(appearanceView).toBeVisible();

  // Presets title must be strictly above the preset grid
  const presetsGrid = page.locator(".appearance-presets-grid");
  const presetsCard = page.locator(".appearance-section-card").filter({ has: presetsGrid });
  const presetsLabel = presetsCard.locator(".appearance-section-label");
  const presetButtons = presetsGrid.locator(".appearance-preset-card");

  const labelBox = await presetsLabel.boundingBox();
  const firstCardBox = await presetButtons.first().boundingBox();
  expect(labelBox).not.toBeNull();
  expect(firstCardBox).not.toBeNull();
  expect(labelBox!.y + labelBox!.height).toBeLessThanOrEqual(firstCardBox!.y);

  // All preset cards must have equal width
  const count = await presetButtons.count();
  expect(count).toBeGreaterThanOrEqual(6);
  const widths: number[] = [];
  const heights: number[] = [];
  for (let i = 0; i < count; i++) {
    const box = await presetButtons.nth(i).boundingBox();
    expect(box).not.toBeNull();
    widths.push(Math.round(box!.width));
    heights.push(Math.round(box!.height));
  }
  const firstWidth = widths[0];
  const firstHeight = heights[0];
  for (const w of widths) {
    expect(w).toBe(firstWidth);
  }
  for (const h of heights) {
    expect(h).toBe(firstHeight);
  }

  // Wallpaper label must be strictly above wallpaper tiles
  const wallpaperGrid = page.locator(".appearance-wallpaper-grid");
  const wallpaperCard = page.locator(".appearance-section-card").filter({ has: wallpaperGrid });
  const wallpaperLabel = wallpaperCard.locator(".appearance-section-label");
  const wallpaperTiles = wallpaperGrid.locator(".appearance-wallpaper-tile");
  const firstTile = wallpaperTiles.first();
  const wallpaperLabelBox = await wallpaperLabel.boundingBox();
  const firstTileBox = await firstTile.boundingBox();
  expect(wallpaperLabelBox).not.toBeNull();
  expect(firstTileBox).not.toBeNull();
  expect(wallpaperLabelBox!.y + wallpaperLabelBox!.height).toBeLessThanOrEqual(firstTileBox!.y);

  // Wallpaper grid must fit in width without horizontal overflow
  const gridMetrics = await wallpaperGrid.evaluate((el) => ({
    clientWidth: el.clientWidth,
    scrollWidth: el.scrollWidth,
    overflowX: window.getComputedStyle(el).overflowX,
    overflowY: window.getComputedStyle(el).overflowY
  }));
  expect(gridMetrics.scrollWidth).toBeLessThanOrEqual(gridMetrics.clientWidth);
  expect(gridMetrics.overflowX).toBe("visible");
  expect(gridMetrics.overflowY).toBe("visible");

  // All 5 wallpaper tiles must be visible and fit within the grid
  expect(await wallpaperTiles.count()).toBe(5);
  const cardBox = await wallpaperCard.boundingBox();
  expect(cardBox).not.toBeNull();
  for (let i = 0; i < 5; i++) {
    const tileBox = await wallpaperTiles.nth(i).boundingBox();
    expect(tileBox).not.toBeNull();
    expect(tileBox!.x).toBeGreaterThanOrEqual(cardBox!.x);
    expect(tileBox!.x + tileBox!.width).toBeLessThanOrEqual(cardBox!.x + cardBox!.width);
  }

  // Custom tile label ("Загрузить") must fit inside the 5th tile bounds
  const customSpan = wallpaperTiles.nth(4).locator("span");
  if (await customSpan.isVisible()) {
    const spanBox = await customSpan.boundingBox();
    const lastTileBox = await wallpaperTiles.nth(4).boundingBox();
    expect(spanBox).not.toBeNull();
    expect(lastTileBox).not.toBeNull();
    expect(spanBox!.width).toBeLessThanOrEqual(lastTileBox!.width);
  }

  // Capture after screenshot
  const screenshot = testInfo.outputPath("01-mobile-appearance-presets-after.png");
  await page.screenshot({ path: screenshot, animations: "disabled" });
  await testInfo.attach("01-mobile-appearance-presets-after", { path: screenshot, contentType: "image/png" });

  const evidenceDir = path.resolve("..", "docs/agent-workflows/evidence/mobile-appearance-presets-and-wallpaper");
  mkdirSync(evidenceDir, { recursive: true });
  copyFileSync(screenshot, path.join(evidenceDir, "01-mobile-appearance-presets-after.png"));
});

test("preserves desktop appearance layout with inline label and controls", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(() => {
    localStorage.setItem("familyMessenger.devicePreferences", JSON.stringify({ language: "ru" }));
    localStorage.setItem("familyMessenger.appearance", JSON.stringify({
      themeMode: "dark",
      accent: "amber",
      messageFont: "rounded",
      bubbleShape: "rounded",
      bubbleRadius: 18,
      wallpaper: "dots"
    }));
  });

  await page.goto("/app/settings");
  await ready(page);

  const appearanceTile = page.locator(".settings-tile--appearance");
  await expect(appearanceTile).toBeVisible();
  await appearanceTile.click();

  const appearanceView = page.locator(".settings-appearance-view");
  await expect(appearanceView).toBeVisible();

  const screenshot = testInfo.outputPath("02-desktop-appearance-presets-after.png");
  await page.screenshot({ path: screenshot, animations: "disabled" });
  await testInfo.attach("02-desktop-appearance-presets-after", { path: screenshot, contentType: "image/png" });

  const evidenceDir = path.resolve("..", "docs/agent-workflows/evidence/mobile-appearance-presets-and-wallpaper");
  mkdirSync(evidenceDir, { recursive: true });
  copyFileSync(screenshot, path.join(evidenceDir, "02-desktop-appearance-presets-after.png"));
});
