import { test, expect, ready } from "./fixtures";

for (const scenario of [
  { name: "desktop-dark", viewport: { width: 1440, height: 900 }, mode: "dark" },
  { name: "mobile-dark", viewport: { width: 390, height: 844 }, mode: "dark" },
]) {
  test(`renders redesigned role presets on ${scenario.name}`, async ({ page }, testInfo) => {
    await page.setViewportSize(scenario.viewport);
    await page.addInitScript(({ mode }) => {
      localStorage.setItem("familyMessenger.appearance", JSON.stringify({ mode }));
    }, { mode: scenario.mode });

    await page.goto("/app/admin/roles");
    await ready(page);

    const createButton = page.locator(".admin-role-create");
    await createButton.click();

    const presetsFieldset = page.locator(".admin-role-presets");
    await expect(presetsFieldset).toBeVisible();

    const managerButton = presetsFieldset.getByRole("button", { name: "Manager" });
    await managerButton.click();
    await expect(managerButton).toHaveAttribute("aria-pressed", "true");
    await expect(presetsFieldset.getByRole("button", { name: "Team Lead" })).toBeDisabled();

    const screenshot = testInfo.outputPath(`role-presets-${scenario.name}.png`);
    await presetsFieldset.screenshot({ path: screenshot, animations: "disabled" });
    await testInfo.attach(`role-presets-${scenario.name}`, { path: screenshot, contentType: "image/png" });
  });
}
