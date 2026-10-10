import { expect, test } from "@playwright/test";

for (const viewport of [
  { width: 1280, height: 720, layout: "side" },
  { width: 800, height: 360, layout: "bottom" },
  { width: 640, height: 850, layout: "mobile-bottom" },
]) {
  test(`keeps presentation participants landscape without horizontal clipping at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/app/chats/chat-planning-team?mockUser=user-stovo-demo");
    const peer = await page.context().newPage();
    await peer.goto("/app/chats/chat-planning-team?mockUser=user-alex-rivera");
    await expect(peer.locator(".app-nav")).toBeVisible();
    await page.getByRole("button", { name: "Video call", exact: true }).click();
    await peer.getByRole("button", { name: "Accept call" }).click();
    await expect(page.getByRole("dialog", { name: "Active call" })).toBeVisible();
    if (viewport.layout === "mobile-bottom") await page.getByRole("button", { name: "More options" }).click();
    await page.getByRole("button", { name: /^(Share screen|Share Screen)$/ }).click();
    await expect(page.getByRole("img", { name: "Stovo Demo's shared screen" })).toBeVisible();
    const grid = page.locator(".call-grid--presenting:visible");
    await expect(grid).toHaveCount(1);
    if (viewport.layout === "side") await expect(grid).not.toHaveClass(/call-grid--screen-share-bottom/);
    if (viewport.layout === "bottom") await expect(grid).toHaveClass(/call-grid--screen-share-bottom/);

    // Actual browser geometry catches min-height and intrinsic grid sizing bugs.
    // An aspect-ratio declaration alone does not ensure the rendered ratio.
    await expect.poll(async () => grid.evaluate((element) => {
      const rail = element.querySelector<HTMLElement>(".call-grid__participant-rail,.call-grid__mobile-participant-row")!;
      const railRect = rail.getBoundingClientRect();
      const tiles = Array.from(rail.querySelectorAll<HTMLElement>(".call-grid__tile"));
      return tiles.length === 2 && tiles.every((tile) => {
        const rect = tile.getBoundingClientRect();
        return Math.abs(rect.width / rect.height - 16 / 9) < 0.04
          && rect.left >= railRect.left - 1 && rect.right <= railRect.right + 1;
      }) && rail.scrollWidth <= rail.clientWidth + 1;
    })).toBe(true);
    if (viewport.layout !== "side") {
      const heights = await grid.locator(".call-grid__tile:not(.call-grid__tile--screen)").evaluateAll((tiles) => tiles.map((tile) => tile.getBoundingClientRect().height));
      expect(Math.max(...heights)).toBeLessThanOrEqual(90);
    }
    if (viewport.layout === "mobile-bottom") {
      const row = grid.locator(".call-grid__mobile-participant-row");
      const geometry = await row.evaluate((element) => {
        const first = element.querySelector(".call-grid__tile")!.getBoundingClientRect();
        return { left: first.left - element.getBoundingClientRect().left, height: first.height };
      });
      expect(Math.abs(geometry.left)).toBeLessThanOrEqual(1);
      expect(geometry.height).toBeGreaterThan(72);
      await page.screenshot({ path: test.info().outputPath("mobile-presentation.png") });
    }
    await page.getByRole("button", { name: "End call", exact: true }).click();
    await peer.close();
  });
}

test("keeps both group audio participants inside the call window above the controls", async ({ page }) => {
  await page.goto("/app/chats/chat-planning-team?mockUser=user-stovo-demo");
  const peer = await page.context().newPage();
  await peer.goto("/app/chats/chat-planning-team?mockUser=user-alex-rivera");
  await expect(peer.locator(".app-nav")).toBeVisible();
  await page.getByRole("button", { name: "Audio call", exact: true }).click();
  await peer.getByRole("button", { name: "Accept call" }).click();
  const participants = page.getByRole("list", { name: "Group call participants" });
  await expect(participants.getByRole("listitem")).toHaveCount(2);
  await expect.poll(() => participants.evaluate((grid) => {
    const popup = grid.closest(".call-popup")!;
    const windowRect = popup.getBoundingClientRect();
    const controls = popup.querySelector(".call-popup-ctrl-row")!.getBoundingClientRect();
    return Array.from(grid.querySelectorAll('[role="listitem"]')).every((tile) => {
      const rect = tile.getBoundingClientRect();
      return rect.top >= windowRect.top && rect.bottom <= windowRect.bottom + 1 && rect.bottom <= controls.top + 1
        && rect.left >= windowRect.left && rect.right <= windowRect.right
        && Math.abs(rect.width / rect.height - 16 / 9) < 0.04;
    });
  })).toBe(true);
  await page.getByRole("button", { name: "End call", exact: true }).click();
  await peer.close();
});

test("stacks two mobile group participants and switches to a grid for three", async ({ page }) => {
  await page.setViewportSize({ width: 640, height: 850 });
  await page.goto("/app/chats/chat-planning-team?mockUser=user-stovo-demo");
  const peer = await page.context().newPage();
  const third = await page.context().newPage();
  await peer.goto("/app/chats/chat-planning-team?mockUser=user-alex-rivera");
  await third.goto("/app/chats/chat-planning-team?mockUser=user-maya-chen");
  await expect(third.locator(".app-nav")).toBeVisible();
  await page.getByRole("button", { name: "Video call", exact: true }).click();
  await peer.getByRole("button", { name: "Accept call" }).click();
  const tiles = page.locator(".call-grid:visible .call-grid__tile");
  await expect(tiles).toHaveCount(2);
  await expect.poll(() => tiles.evaluateAll((elements) => {
    const [first, second] = elements.map((e) => e.getBoundingClientRect());
    const controlsTop = document.querySelector(".mobile-active-controls")!.getBoundingClientRect().top;
    return Math.abs(first.left - second.left) < 1 && second.top >= first.bottom
      && [first, second].every((rect) => Math.abs(rect.width / rect.height - 16 / 9) < 0.04
        && rect.top >= 0 && rect.bottom <= controlsTop);
  })).toBe(true);
  await page.screenshot({ path: test.info().outputPath("two-participants.png") });
  await third.getByRole("button", { name: "Accept call" }).click();
  await expect(tiles).toHaveCount(3);
  await expect.poll(() => tiles.evaluateAll((elements) => {
    const [first, second] = elements.map((e) => e.getBoundingClientRect());
    return Math.abs(first.top - second.top) < 1 && second.left >= first.right;
  })).toBe(true);
  await page.screenshot({ path: test.info().outputPath("three-participants.png") });
  await page.getByRole("button", { name: "End call", exact: true }).click();
  await peer.close();
  await third.close();
});

for (const height of [450, 400]) {
  test(`keeps four mobile presentation participants above controls at 375x${height}`, async ({ page }) => {
    await page.setViewportSize({ width: 375, height });
    await page.goto("/app/chats/chat-planning-team?mockUser=user-stovo-demo");
    const peers = [];
    for (const user of ["user-alex-rivera", "user-maya-chen", "user-sam-patel"]) {
      const peer = await page.context().newPage();
      await peer.goto(`/app/chats/chat-planning-team?mockUser=${user}`);
      await expect(peer.locator(".app-nav")).toBeVisible();
      peers.push(peer);
    }
    await page.getByRole("button", { name: "Video call", exact: true }).click();
    for (const peer of peers) await peer.getByRole("button", { name: "Accept call" }).click();
    await page.getByRole("button", { name: "More options" }).click();
    await page.getByRole("button", { name: /^(Share screen|Share Screen)$/ }).click();
    const row = page.locator(".call-grid--presenting:visible .call-grid__mobile-participant-row");
    await expect(row.locator(".call-grid__tile")).toHaveCount(4);
    await expect.poll(() => row.evaluate((element) => {
      const controls = document.querySelector(".mobile-active-controls")!.getBoundingClientRect();
      return Array.from(element.querySelectorAll(".call-grid__tile")).every((tile) => {
        const rect = tile.getBoundingClientRect();
        return rect.bottom <= controls.top && Math.abs(rect.width / rect.height - 16 / 9) < 0.04;
      });
    })).toBe(true);
    await page.getByRole("button", { name: "End call", exact: true }).click();
    for (const peer of peers) await peer.close();
  });

}

test("replaces group audio avatars with the shared screen on desktop", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/app/chats/chat-planning-team?mockUser=user-stovo-demo");
  const peer = await page.context().newPage();
  await peer.goto("/app/chats/chat-planning-team?mockUser=user-alex-rivera");
  await expect(peer.locator(".app-nav")).toBeVisible();
  await page.getByRole("button", { name: "Audio call", exact: true }).click();
  await peer.getByRole("button", { name: "Accept call" }).click();
  await page.getByRole("button", { name: /^(Share screen|Share Screen)$/ }).click();
  await expect(page.getByRole("img", { name: "Stovo Demo's shared screen" })).toBeVisible();
  await expect(page.getByRole("list", { name: "Group call participants" })).not.toBeVisible();
  await expect(peer.getByRole("list", { name: "Group call participants" })).not.toBeVisible();
  await page.screenshot({ path: test.info().outputPath("desktop-audio-presentation.png") });
  await page.getByRole("button", { name: "Stop sharing screen" }).click();
  await expect(page.getByRole("list", { name: "Group call participants" })).toBeVisible();
  await expect(peer.getByRole("list", { name: "Group call participants" })).toBeVisible();
  await page.getByRole("button", { name: "End call", exact: true }).click();
  await peer.close();
});
