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

test("Android mobile group camera tiles are square, undistorted and keep the handset slash inside its icon", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${fixture}?android&mobile&camera`);
  const tile = page.locator(".mobile-active-video-stage .call-grid__tile--local");
  await expect(tile).toBeVisible();
  expect(await tile.evaluate((element) => getComputedStyle(element).aspectRatio)).toBe("1 / 1");
  await expect(tile.locator("video")).toHaveCSS("object-fit", "cover");
  await expect(tile.locator("video")).toHaveCSS("transform", "matrix(-1, 0, 0, 1, 0, 0)");
  const end = page.getByRole("button", { name: "End call", exact: true });
  await expect(end.locator("svg line")).toHaveCount(0);
  await expect(end.locator("svg path")).not.toHaveCount(0);
  await page.screenshot({ path: "/tmp/call-android-mobile-group.png" });
});

test("desktop group-call participant tiles stay contained with one or two participants", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  for (const participantCount of [1, 2]) {
    await page.goto(`${fixture}?participants=${participantCount}&controls-visible`);
    const grid = page.locator(".call-popup-group-participants");
    await expect(grid).toBeVisible();
    const tiles = grid.locator(".call-popup-group-participant");
    await expect(tiles).toHaveCount(participantCount);
    await expect.poll(() => grid.evaluate((element) => {
      const stage = element.closest(".call-popup-audio-stage")!.getBoundingClientRect();
      const gridBounds = element.getBoundingClientRect();
      const tileBounds = element.querySelector(".call-popup-group-participant")!.getBoundingClientRect();
      return gridBounds.width <= 721 && Math.abs(gridBounds.left + gridBounds.width / 2 - (stage.left + stage.width / 2)) < 2
        && gridBounds.left >= stage.left && gridBounds.right <= stage.right
        && Math.abs(tileBounds.width / tileBounds.height - 16 / 9) < 0.05;
    })).toBe(true);
    await expect.poll(() => tiles.first().evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight;
    })).toBe(true);
    await page.screenshot({ path: `/tmp/call-desktop-group-${participantCount}.png` });
  }
});

test("tablet call tiles and header SVGs retain desktop proportions", async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 800 });
  await page.goto(`${fixture}?android&participants=2&controls-visible`);
  const tiles = page.locator(".call-popup-group-participant");
  await expect(tiles).toHaveCount(2);
  await expect.poll(() => tiles.first().locator(".voice-avatar-wrapper--md").evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return rect.width === 68 && rect.height === 68;
  })).toBe(true);
  await expect(page.locator(".call-popup-minimize-btn svg")).toHaveCSS("width", "24px");
  await expect(page.locator(".call-popup-header-invite svg")).toHaveCSS("width", "28px");
  const grid = page.locator(".call-popup-group-participants");
  await expect.poll(() => grid.evaluate((element) => element.getBoundingClientRect().width)).toBeLessThanOrEqual(721);
  await page.screenshot({ path: "/tmp/call-android-tablet-group.png" });
});

test("Android call settings fill a small screen and keep accessible top tabs", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${fixture}?android&camera`);
  await page.locator(".call-popup-video-area").hover();
  await page.getByRole("button", { name: "Audio settings", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Call settings" });
  await expect(dialog).toHaveClass(/call-settings-dialog--android/);
  const bounds = await dialog.boundingBox();
  expect(bounds?.width).toBe(390);
  expect(bounds?.height).toBe(844);
  const tabs = dialog.getByRole("tablist");
  await expect(tabs).toBeVisible();
  const tabStrip = await tabs.evaluate((element) => getComputedStyle(element).flexDirection);
  expect(tabStrip).toBe("row");
  await dialog.getByRole("tab", { name: "Camera", exact: true }).click();
  await expect(dialog.getByRole("tab", { name: "Camera", exact: true })).toHaveAttribute("aria-selected", "true");
  await page.screenshot({ path: "/tmp/call-android-settings.png" });
});

test("web call settings keep the desktop layout without header or column dividers", async ({ page }) => {
  await page.goto(`${fixture}?camera`);
  await page.locator(".call-popup-video-area").hover();
  await page.getByRole("button", { name: "Audio settings", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Call settings" });
  await expect(dialog).not.toHaveClass(/call-settings-dialog--android/);
  expect(await dialog.locator(".call-settings-dialog-header").evaluate((element) => getComputedStyle(element).borderBottomWidth)).toBe("0px");
  expect(await dialog.locator(".call-settings-tabs").evaluate((element) => getComputedStyle(element).borderRightWidth)).toBe("0px");
  await page.screenshot({ path: "/tmp/call-web-settings.png" });
});

test("desktop group calls show a slightly smaller local avatar", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(fixture);
  const selfAvatar = page.locator(".call-popup-audio-stage .call-popup-group-participant.is-self .voice-avatar-wrapper--md");
  await expect(selfAvatar).toBeVisible();
  await expect(selfAvatar).toHaveCSS("width", "68px");
  await expect(selfAvatar).toHaveCSS("height", "68px");
});

test("desktop call device dropdowns have no hover effect and keep focus and menu states", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`${fixture}?camera&devices`);
  await page.locator(".call-popup-video-area").hover();
  const controls = page.locator(".guest-call-controls .guest-device-menu-trigger");
  const toggles = page.locator(".guest-call-controls .guest-device-control > .call-ctrl-btn");
  await expect(controls).toHaveCount(3);
  await expect(toggles).toHaveCount(3);

  for (const [index, label] of ["Microphone", "Speaker", "Camera"].entries()) {
    const toggle = toggles.nth(index);
    const idleToggleStyle = await toggle.evaluate((element) => {
      const style = getComputedStyle(element);
      return [style.opacity, style.backgroundColor, style.color, style.borderColor, style.boxShadow, style.transform];
    });
    await toggle.hover();
    await expect.poll(() => toggle.evaluate((element) => {
      const style = getComputedStyle(element);
      return [style.opacity, style.backgroundColor, style.color, style.borderColor, style.boxShadow, style.transform];
    })).toEqual(idleToggleStyle);

    const control = controls.nth(index);
    const idleStyle = await control.evaluate((element) => {
      const style = getComputedStyle(element);
      return [style.backgroundColor, style.color, style.borderColor, style.boxShadow, style.transform];
    });
    await control.hover();
    await expect.poll(() => control.evaluate((element) => {
      const style = getComputedStyle(element);
      return [style.backgroundColor, style.color, style.borderColor, style.boxShadow, style.transform];
    })).toEqual(idleStyle);

    await control.focus();
    await page.keyboard.press("Tab");
    await page.keyboard.press("Shift+Tab");
    await expect.poll(() => control.evaluate((element) => getComputedStyle(element).outlineWidth)).toBe("2px");

    await control.click();
    await expect(control).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByRole("listbox", { name: `${label} device` })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(control).toHaveAttribute("aria-expanded", "false");
  }
});
