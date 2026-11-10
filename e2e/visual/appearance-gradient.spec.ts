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
