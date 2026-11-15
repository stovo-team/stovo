import { test, expect, ready } from "./fixtures";

const pages = [
  { name: "storage", route: "/app/files", frame: ".storage-page" },
  { name: "plans", route: "/app/plans", frame: ".plans-page" },
  { name: "settings", route: "/app/settings", frame: ".settings-page" },
  { name: "admin", route: "/app/admin", frame: ".admin-page" },
];

for (const viewport of [{ width: 1024, height: 592 }, { width: 390, height: 844 }]) {
  for (const { name, route, frame } of pages) {
    test(`shows the aurora wallpaper on ${name} at ${viewport.width}px`, async ({ page }, testInfo) => {
      await page.setViewportSize(viewport);
      await page.addInitScript(() => {
        localStorage.setItem("familyMessenger.appearance", JSON.stringify({ themeMode: "dark", wallpaper: "aurora" }));
      });
      await page.goto(route);
      await ready(page);

      const root = page.locator(`${frame}.app-frame`);
      await expect(root).toBeVisible();
      await expect.poll(() => root.evaluate((el) => getComputedStyle(el).backgroundImage)).toContain("radial-gradient");

      const screenshot = testInfo.outputPath(`${name}-${viewport.width}-wallpaper.png`);
      await page.screenshot({ path: screenshot, animations: "disabled" });
      await testInfo.attach(`${name}-${viewport.width}-wallpaper`, { path: screenshot, contentType: "image/png" });
    });
  }
}
