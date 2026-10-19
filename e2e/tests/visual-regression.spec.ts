import { expect, test, type Page } from "@playwright/test";

const MOBILE = { width: 390, height: 844 };
const DESKTOP = { width: 1280, height: 720 };

async function stabilizeScreenshot(page: Page) {
  await page.evaluate(() => document.fonts.ready);
  await page.addStyleTag({
    content: `
      *, *::before, *::after {
        animation-duration: 0s !important;
        animation-delay: 0s !important;
        transition-duration: 0s !important;
        scroll-behavior: auto !important;
        caret-color: transparent !important;
      }
    `,
  });
}

test("chat conversation visual baseline on desktop", async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await page.goto("/app/chats/chat-planning-team?mockUser=user-stovo-demo");
  await expect(page.locator(".app-nav")).toBeVisible();
  await expect(page.locator("#msg-planning-kickoff .message-body")).toBeVisible();
  await expect(page.locator(".message-composer textarea")).toBeVisible();
  await stabilizeScreenshot(page);

  await expect(page).toHaveScreenshot("chat-desktop.png");
});

test("chat conversation visual baseline on mobile", async ({ page }) => {
  await page.setViewportSize(MOBILE);
  await page.goto("/app/chats/chat-planning-team?mockUser=user-stovo-demo");
  await expect(page.locator(".app-nav")).toHaveCount(1);
  await expect(page.locator("#msg-planning-kickoff .message-body")).toBeVisible();
  await expect(page.locator(".message-composer textarea")).toBeVisible();
  await stabilizeScreenshot(page);

  await expect(page).toHaveScreenshot("chat-mobile.png");
});

test("storage file preview visual baseline", async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await page.goto("/app/files?mockUser=user-stovo-demo");
  await expect(page.locator(".app-nav")).toBeVisible();
  const fileTile = page.locator(".storage-tile").filter({ hasText: "Storage preview photo.svg" });
  await expect(fileTile).toBeVisible();
  await fileTile.click();
  const preview = page.locator(".storage-preview-dialog");
  await expect(preview).toBeVisible();
  await expect(preview.getByRole("heading", { name: "Storage preview photo.svg" })).toBeVisible();
  await expect(preview.locator("img[alt='Storage preview photo.svg']")).toBeVisible();
  await stabilizeScreenshot(page);

  await expect(page).toHaveScreenshot("storage-file-preview.png");
});

test("canvas with a whiteboard visual baseline", async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await page.goto("/app/canvas/mock-canvas-planning?mockUser=user-stovo-demo");
  await expect(page.locator(".canvas-page-header").getByRole("heading", { name: "Planning Notes" })).toBeVisible();
  await page.getByRole("button", { name: "Insert into canvas" }).click();
  await page.getByRole("menuitem", { name: /Whiteboard/ }).click();
  await expect(page.locator(".canvas-whiteboard-block")).toBeVisible();
  await expect.poll(() => page.evaluate(async () => {
    const response = await fetch("/api/v1/plugins/canvas/canvases/mock-canvas-planning/document");
    const document = await response.json() as { updates?: Array<{ update: string }> };
    return document.updates?.some(({ update }) => atob(update).includes("whiteboard")) ?? false;
  })).toBe(true);
  await stabilizeScreenshot(page);

  await expect(page).toHaveScreenshot("canvas-whiteboard.png");
});
