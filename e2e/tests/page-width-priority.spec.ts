import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";

const repoRoot = resolve(process.cwd(), "..");
const evidenceSide = process.env.PAGE_WIDTH_EVIDENCE_SIDE ?? "after";
const evidenceDir = resolve(repoRoot, "artifacts/agent-workflows/page-width-priority", evidenceSide);
const mockChatUrl = "/app/chats/chat-planning-team?mockUser=user-stovo-demo";

async function captureEvidence(page: Page, name: string, interaction: string) {
  mkdirSync(evidenceDir, { recursive: true });
  const environment = await page.evaluate(() => ({
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    theme: document.documentElement.dataset.themeMode ?? "light",
    locale: document.documentElement.lang || navigator.language,
  }));
  await page.screenshot({ path: resolve(evidenceDir, `${name}.png`), fullPage: true });
  writeFileSync(
    resolve(evidenceDir, `${name}.json`),
    `${JSON.stringify({ ...environment, browser: "Playwright Chromium", os: process.platform, interaction }, null, 2)}\n`,
  );
}

test("Plans week calendar fills the available pane at 2200px", async ({ page }) => {
  await page.setViewportSize({ width: 2200, height: 1100 });
  await page.goto("/app/plans?mockUser=user-stovo-demo");
  await page.getByRole("button", { name: "Week", exact: true }).click();
  const calendar = page.locator(".plans-calendar--7");
  await expect(calendar).toBeVisible();
  await captureEvidence(page, "plans-week-2200x1100", "Open Plans and select Week");

  const geometry = await page.evaluate(() => {
    const layout = document.querySelector<HTMLElement>(".plans-layout")!;
    const content = document.querySelector<HTMLElement>(".plans-content")!;
    const calendar = document.querySelector<HTMLElement>(".plans-calendar--7")!;
    const layoutRect = layout.getBoundingClientRect();
    const contentRect = content.getBoundingClientRect();
    return {
      contentWidth: contentRect.width,
      calendarWidth: calendar.getBoundingClientRect().width,
      rightInset: layoutRect.right - contentRect.right,
    };
  });

  expect(geometry.contentWidth).toBeGreaterThan(1200);
  expect(geometry.calendarWidth).toBeGreaterThan(1200);
  expect(geometry.rightInset).toBeLessThanOrEqual(14);
});

test("active chat is capped at 1400px and the chat list gets remaining desktop width", async ({ page }) => {
  await page.setViewportSize({ width: 2200, height: 1100 });
  await page.goto(mockChatUrl);
  await expect(page.locator("#msg-planning-kickoff .message-body")).toBeVisible();
  await captureEvidence(page, "active-chat-2200x1100", "Open the populated planning chat");

  const wide = await page.evaluate(() => {
    const layout = document.querySelector<HTMLElement>(".chat-layout")!;
    const sidebar = document.querySelector<HTMLElement>(".chat-sidebar")!;
    const detail = document.querySelector<HTMLElement>(".chat-detail")!;
    const layoutRect = layout.getBoundingClientRect();
    const detailRect = detail.getBoundingClientRect();
    return {
      layoutWidth: layoutRect.width,
      sidebarWidth: sidebar.getBoundingClientRect().width,
      detailWidth: detailRect.width,
      rightInset: layoutRect.right - detailRect.right,
    };
  });

  expect(wide.detailWidth).toBeCloseTo(1400, 0);
  expect(wide.sidebarWidth).toBeGreaterThan(320);
  expect(wide.rightInset).toBeLessThanOrEqual(1);
  expect(wide.layoutWidth).toBeCloseTo(wide.sidebarWidth + wide.detailWidth + 16, 0);

  await page.setViewportSize({ width: 1440, height: 900 });
  const narrower = await page.evaluate(() => ({
    detailWidth: document.querySelector<HTMLElement>(".chat-detail")!.getBoundingClientRect().width,
    layoutWidth: document.querySelector<HTMLElement>(".chat-layout")!.getBoundingClientRect().width,
  }));
  expect(narrower.detailWidth).toBeGreaterThan(0);
  expect(narrower.detailWidth).toBeLessThan(1400);
  expect(narrower.layoutWidth).toBeGreaterThan(narrower.detailWidth);
});

test("narrow calendar scrolling and mobile chat width stay unchanged", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/app/plans?mockUser=user-stovo-demo");
  await page.getByRole("button", { name: "Week", exact: true }).click();
  const calendar = page.locator(".plans-calendar--7");
  await expect(calendar).toBeVisible();
  const calendarWidths = await page.evaluate(() => {
    const agenda = document.querySelector<HTMLElement>(".plans-agenda")!;
    const calendar = document.querySelector<HTMLElement>(".plans-calendar--7")!;
    return {
      minWidth: getComputedStyle(calendar).minWidth,
      clientWidth: agenda.clientWidth,
      scrollWidth: agenda.scrollWidth,
    };
  });
  expect(calendarWidths.minWidth).toBe("1200px");
  expect(calendarWidths.scrollWidth).toBeGreaterThan(calendarWidths.clientWidth);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(mockChatUrl);
  await expect(page.locator("#msg-planning-kickoff .message-body")).toBeVisible();
  const mobileWidths = await page.evaluate(() => ({
    chatWidth: document.querySelector<HTMLElement>(".chat-detail")!.getBoundingClientRect().width,
    viewportWidth: window.innerWidth,
    documentWidth: document.documentElement.scrollWidth,
  }));
  expect(mobileWidths.chatWidth).toBeLessThanOrEqual(mobileWidths.viewportWidth);
  expect(mobileWidths.documentWidth).toBeLessThanOrEqual(mobileWidths.viewportWidth + 1);
});
