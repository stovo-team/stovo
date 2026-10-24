import { expect, test } from "@playwright/test";

const fixture = "/test-fixtures/call-ui.html";
test("group audio controls are visible without pointer activity", async ({ page }) => {
  await page.goto(`${fixture}?controls-visible`);
  const end = page.getByRole("button", { name: "End call", exact: true });
  await expect(end).toBeVisible();
  await expect(end).toHaveCSS("background-color", "rgb(220, 38, 38)");
  await expect.poll(() => end.evaluate((button) => {
    const panel = button.closest(".shared-call-control-panel")!;
    return getComputedStyle(panel).opacity;
  })).toBe("1");
});
test("group sharing stays above chat and fills the fullscreen surface", async ({ page }) => {
  await page.goto(`${fixture}?sharing`);
  const popup = page.getByRole("dialog", { name: "Active call" });
  await expect.poll(() => popup.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const screen = element.querySelector<HTMLElement>(".call-grid__tile--screen")!;
    const bounds = screen.getBoundingClientRect();
    return getComputedStyle(element).position === "fixed"
      && rect.top === 0 && rect.height >= innerHeight - 1
      && bounds.width > 800 && bounds.top >= 0 && bounds.bottom <= innerHeight + 1
      && screen.contains(document.elementFromPoint(bounds.left + 40, bounds.top + 100));
  })).toBe(true);
});
test("camera stays inside its landscape tile and clicking self does nothing", async ({ page }) => {
  await page.goto(`${fixture}?camera`);
  const tile = page.locator(".call-grid__tile--local");
  await expect(tile).toBeVisible();
  await expect.poll(() => tile.evaluate((element) => {
    const rect = element.getBoundingClientRect(), parent = element.closest(".call-popup-video-area")!.getBoundingClientRect();
    return rect.top >= parent.top - 1 && rect.bottom <= parent.bottom + 1 && Math.abs(rect.width / rect.height - 16 / 9) < .03;
  })).toBe(true);
  await tile.click();
  await expect(page.locator(".call-participant-focus-stage")).toHaveCount(0);
  await expect(tile).toBeVisible();
});
test("settings tabs receive clicks above live video and stay left aligned", async ({ page }) => {
  await page.goto(`${fixture}?camera`);
  await page.locator(".call-popup-video-area").hover();
  await page.getByRole("button", { name: "Audio settings", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Call settings" });
  const height = (await dialog.boundingBox())!.height;
  for (const name of ["Audio", "Camera", "General"]) {
    const tab = dialog.getByRole("tab", { name, exact: true });
    await tab.click();
    await expect(dialog).toBeVisible();
    await expect(tab).toHaveAttribute("aria-selected", "true");
    expect((await dialog.boundingBox())!.height).toBe(height);
    expect(await tab.evaluate((element) => getComputedStyle(element).justifyContent)).toBe("flex-start");
  }
  await expect(dialog.getByRole("checkbox", { name: "Hide call controls automatically" })).toBeChecked();
});
test("selecting a microphone in call settings keeps the settings dialog open", async ({ page }) => {
  await page.goto(`${fixture}?camera&devices`);
  await page.locator(".call-popup-video-area").hover();
  await page.getByRole("button", { name: "Audio settings", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Call settings" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("tab", { name: "Audio", exact: true }).click();
  await dialog.getByRole("button", { name: "Select Microphone" }).click();
  await page.getByRole("option", { name: "Desk microphone" }).click();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Select Microphone" })).toContainText("Desk microphone");
});
test("compact voice sharing places participants above screen, expansion fills the stage", async ({ page }) => {
  await page.goto(`${fixture}?kind=voice&sharing`);
  const screen = page.locator(".call-grid__tile--screen");
  await expect.poll(() => screen.evaluate((element) => {
    const tile = element.getBoundingClientRect();
    const participant = document.querySelector(".call-grid__tile--local")!.getBoundingClientRect();
    return participant.bottom <= tile.top + 1 && tile.width > 550;
  })).toBe(true);
  await page.getByRole("button", { name: "Expand Voice Channel" }).click();
  await expect.poll(() => screen.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const stage = element.closest(".voice-room-stage")!.getBoundingClientRect();
    const participant = document.querySelector(".call-grid__tile--local")!.getBoundingClientRect();
    return rect.width > 900 && Math.abs(rect.width / participant.width - 5) < .08
      && rect.height > stage.height * .7 && rect.bottom <= stage.bottom + 1;
  })).toBe(true);
});

test("mobile group controls stay visible by default and sharing has participants above", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${fixture}?mobile&sharing`);
  const end = page.getByRole("button", { name: "End call", exact: true });
  await expect(end).toBeVisible();
  await expect(end).toHaveCSS("background-color", "rgb(220, 38, 38)");
  await expect.poll(() => page.locator(".mobile-active-video-stage .call-grid__tile--screen").evaluate((element) => {
    const screen = element.getBoundingClientRect();
    const participant = element.closest(".call-grid")!.querySelector(".call-grid__tile--local")!.getBoundingClientRect();
    return participant.bottom <= screen.top + 1 && screen.width > 350 && screen.right <= innerWidth + 1;
  })).toBe(true);
  const controls = page.locator(".mobile-active-controls");
  for (const button of await controls.locator("button").all()) {
    const rect = (await button.boundingBox())!;
    expect(rect.x).toBeGreaterThanOrEqual(0);
    expect(rect.x + rect.width).toBeLessThanOrEqual(390);
    expect(Math.abs(rect.width - rect.height)).toBeLessThan(1);
    if (await button.getAttribute("aria-label") !== "End call") await expect(button).toHaveCSS("background-color", "rgb(41, 42, 45)");
  }
  await page.screenshot({ path: "/tmp/call-mobile-fixed.png" });
});
