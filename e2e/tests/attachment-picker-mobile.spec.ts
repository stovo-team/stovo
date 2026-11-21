import { expect, test } from "@playwright/test";

test("native attachment composer remains distinct and rounded above the navigation", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.addInitScript(() => {
    (window as any).Capacitor = { PluginHeaders: [], nativePromise: async () => ({}) };
    (window as any).CapacitorCustomPlatform = { name: "web", plugins: {} };
    localStorage.setItem("familyMessenger.appearance", JSON.stringify({ themeMode: "dark" }));
    localStorage.setItem("familyMessenger.devicePreferences", JSON.stringify({ language: "ru" }));
  });
  await page.goto("/app/chats/chat-planning-team?mockUser=user-stovo-demo");
  await expect(page.locator(".file-picker").first()).toBeVisible();
  // Seed the mock session as web, then exercise the Android attachment sheet.
  await page.evaluate(() => {
    (window as any).CapacitorCustomPlatform.name = "android";
    document.documentElement.dataset.platform = "native";
  });
  await page.locator(".file-picker").first().click();
  const sheet = page.locator(".attachment-picker-sheet");
  const composer = sheet.locator(".attachment-picker-message-box");
  const row = composer.locator(".message-composer-row");
  await expect(row).toBeVisible();
  const geometry = await row.evaluate((element) => {
    const rowStyle = getComputedStyle(element);
    const container = element.parentElement!;
    const sheet = element.closest(".attachment-picker-sheet")!;
    const body = sheet.querySelector(".attachment-picker-body")!;
    return {
      inset: element.getBoundingClientRect().left - sheet.getBoundingClientRect().left,
      bottomPadding: parseFloat(getComputedStyle(container).paddingBottom),
      radius: parseFloat(rowStyle.borderTopLeftRadius),
      rowHeight: element.getBoundingClientRect().height,
      rowBackground: rowStyle.backgroundColor,
      sheetBackground: getComputedStyle(sheet).backgroundColor,
      bodyBottom: body.getBoundingClientRect().bottom,
      composerTop: container.getBoundingClientRect().top,
    };
  });
  expect(geometry.inset).toBeGreaterThanOrEqual(12);
  expect(geometry.bottomPadding).toBeGreaterThanOrEqual(16);
  expect(geometry.radius).toBeGreaterThanOrEqual(geometry.rowHeight / 2);
  expect(geometry.rowBackground).not.toBe(geometry.sheetBackground);
  expect(geometry.bodyBottom).toBeGreaterThanOrEqual(geometry.composerTop);
  await expect(composer.locator(".file-picker")).toHaveCount(0);
  await expect(sheet.locator(".attachment-picker-message-send .composer-send-icon")).toBeVisible();
});
