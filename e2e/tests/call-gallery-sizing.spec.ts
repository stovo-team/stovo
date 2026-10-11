import { expect, test } from "@playwright/test";

for (const mobile of [true, false]) {
  test(`fills the available ${mobile ? "mobile gallery" : "desktop group popup"} space`, async ({ page }) => {
    await page.setViewportSize(mobile ? { width: 640, height: 850 } : { width: 1280, height: 720 });
    await page.goto("/app/chats/chat-planning-team?mockUser=user-stovo-demo");
    const peer = await page.context().newPage();
    await peer.goto("/app/chats/chat-planning-team?mockUser=user-alex-rivera");
    await expect(peer.locator(".app-nav")).toBeVisible();
    await page.getByRole("button", { name: mobile ? "Video call" : "Audio call", exact: true }).click();
    await peer.getByRole("button", { name: "Accept call" }).click();
    if (mobile) {
      await expect.poll(() => page.locator(".call-grid:visible").evaluate((grid) => {
        const rect = grid.getBoundingClientRect();
        const controls = document.querySelector(".mobile-active-controls")!.getBoundingClientRect();
        const expectedWidth = Math.min(window.innerWidth - 24, (window.innerHeight - 158) * 8 / 9);
        const tiles = Array.from(grid.querySelectorAll(".call-grid__tile"));
        return Math.abs(rect.width - expectedWidth) < 2 && rect.bottom <= controls.top
          && tiles.every((tile) => {
            const box = tile.getBoundingClientRect();
            return Math.abs(box.width / box.height - 16 / 9) < 0.04;
          });
      })).toBe(true);
    } else {
      await expect.poll(() => page.locator(".call-popup-group-call").evaluate((popup) => {
        const rect = popup.getBoundingClientRect();
        return rect.height >= Math.min(640, window.innerHeight - 40) - 1
          && rect.width >= Math.min(960, window.innerWidth - 40) - 1;
      })).toBe(true);
    }
    await page.getByRole("button", { name: "End call", exact: true }).click();
    await peer.close();
  });
}
