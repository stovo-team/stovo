import { test, expect, ready } from "./fixtures";

const gradient = "linear-gradient(135deg, #123456, #abcdef)";

for (const scenario of [
  { name: "web", viewport: { width: 1440, height: 900 } },
  { name: "mobile web", viewport: { width: 390, height: 844 } },
]) {
  test(`restores saved gradient and its solid accent on ${scenario.name}`, async ({ page }, testInfo) => {
    await page.setViewportSize(scenario.viewport);
    await page.addInitScript(({ savedGradient }) => {
      localStorage.setItem("familyMessenger.brandGradient", savedGradient);
      localStorage.setItem("familyMessenger.appearance", JSON.stringify({ accent: "custom", customAccent: "#123456" }));
    }, { savedGradient: gradient });

    await page.goto("/app/chats/chat-planning-team");
    await ready(page);
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.platform)).toBe("web");
    await expect.poll(() => page.evaluate(() => document.documentElement.style.getPropertyValue("--color-brand-gradient"))).toBe(gradient);
    await expect.poll(() => page.evaluate(() => document.documentElement.style.getPropertyValue("--accent-primary-light"))).toBe("#123456");
    await expect(page.locator(".chat-folder-name").filter({ hasText: /^Groups$/ })).toHaveAttribute("style", /--folder-color:\s*var\(--text-secondary\)/);
    await expect.poll(() => page.locator(".message-bubble.mine").first().evaluate((element) => getComputedStyle(element).backgroundImage)).toContain("linear-gradient");

    const screenshot = testInfo.outputPath(`${scenario.name.replaceAll(" ", "-")}-gradient.png`);
    await page.screenshot({ path: screenshot, animations: "disabled" });
    await testInfo.attach(`${scenario.name}-gradient`, { path: screenshot, contentType: "image/png" });
  });
}

test("keeps filled primary popup buttons gradiental when the gradient theme is selected", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(() => {
    localStorage.setItem("familyMessenger.brandGradient", "linear-gradient(135deg, #f97316, #e11d48)");
    localStorage.setItem("familyMessenger.appearance", JSON.stringify({ themeMode: "dark", accent: "custom", customAccent: "#f97316" }));
  });

  await page.goto("/app/chats/chat-planning-team");
  await ready(page);

  await page.getByRole("button", { name: /new folder|create folder|новая папка/i }).first().click();
  const chatFolderDialog = page.locator(".chat-folder-layout");
  await expect(chatFolderDialog).toBeVisible();
  await chatFolderDialog.locator("input").first().fill("Design");
  const chatFolderPrimary = chatFolderDialog.locator(".popup-button--primary");
  await expect.poll(() => chatFolderPrimary.evaluate((el) => getComputedStyle(el).backgroundImage)).toContain("linear-gradient");
  await chatFolderPrimary.hover();
  await expect.poll(() => chatFolderPrimary.evaluate((el) => getComputedStyle(el).backgroundImage)).toContain("linear-gradient");

  const chatFolderShot = testInfo.outputPath("chat-folder-gradient-button.png");
  await page.screenshot({ path: chatFolderShot, animations: "disabled" });
  await testInfo.attach("chat-folder-gradient-button", { path: chatFolderShot, contentType: "image/png" });

  await page.goto("/app/files");
  await ready(page);
  await page.locator(".storage-collection-new").click();
  const storageDialog = page.locator(".storage-collection-create");
  await expect(storageDialog).toBeVisible();
  const storagePrimary = storageDialog.locator(".popup-button--primary");
  await expect.poll(() => storagePrimary.evaluate((el) => getComputedStyle(el).backgroundImage)).toContain("linear-gradient");
  await storageDialog.locator("input").first().fill("Assets");
  await storagePrimary.hover();
  await expect.poll(() => storagePrimary.evaluate((el) => getComputedStyle(el).backgroundImage)).toContain("linear-gradient");

  const storageShot = testInfo.outputPath("storage-folder-gradient-button.png");
  await page.screenshot({ path: storageShot, animations: "disabled" });
  await testInfo.attach("storage-folder-gradient-button", { path: storageShot, contentType: "image/png" });
});
