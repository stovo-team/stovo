import { expect, test } from "@playwright/test";

test.describe("chat visual regressions in mock mode", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/app/chats/chat-planning-team?mockUser=user-stovo-demo");
    await expect(page.locator(".app-nav")).toBeVisible();
    await expect(page.locator("#msg-planning-kickoff .message-body")).toBeVisible();
  });

  test("anchors both desktop pickers above their composer buttons and removes emoji trailing padding", async ({ page }) => {
    const filePicker = page.locator(".message-composer .file-picker");
    await filePicker.click();
    const attachmentMenu = page.locator(".attachment-picker-web-menu");
    await expect(attachmentMenu).toBeVisible();

    const attachmentGeometry = await attachmentMenu.evaluate((menu) => {
      const menuRect = menu.getBoundingClientRect();
      const triggerRect = document.querySelector(".message-composer .file-picker")!.getBoundingClientRect();
      return {
        menuLeft: menuRect.left,
        menuBottom: menuRect.bottom,
        menuRight: menuRect.right,
        triggerLeft: triggerRect.left,
        triggerTop: triggerRect.top,
        triggerRight: triggerRect.right,
      };
    });
    expect(Math.abs(attachmentGeometry.menuLeft - attachmentGeometry.triggerLeft)).toBeLessThanOrEqual(1);
    expect(attachmentGeometry.menuBottom).toBeLessThan(attachmentGeometry.triggerTop);
    expect(attachmentGeometry.menuRight).toBeGreaterThan(attachmentGeometry.triggerRight);

    await page.keyboard.press("Escape");
    await expect(attachmentMenu).toHaveCount(0);

    const emojiButton = page.locator(".message-composer .emoji-picker-button");
    await emojiButton.click();
    const emojiPicker = page.locator(".message-composer .emoji-picker").first();
    await expect(emojiPicker).toBeVisible();

    const emojiGeometry = await emojiPicker.evaluate((picker) => {
      const pickerRect = picker.getBoundingClientRect();
      const triggerRect = document.querySelector(".message-composer .emoji-picker-button")!.getBoundingClientRect();
      const category = picker.querySelector(".epr-emoji-category-content");
      return {
        pickerLeft: pickerRect.left,
        pickerBottom: pickerRect.bottom,
        triggerLeft: triggerRect.left,
        triggerTop: triggerRect.top,
        lastEmojiMarginRight: category ? getComputedStyle(category).marginRight : null,
      };
    });
    expect(Math.abs(emojiGeometry.pickerLeft - emojiGeometry.triggerLeft)).toBeLessThanOrEqual(1);
    expect(emojiGeometry.pickerBottom).toBeLessThan(emojiGeometry.triggerTop);
    expect(emojiGeometry.lastEmojiMarginRight).toBe("0px");
  });

  test("keeps chat details actions rounded and uses the same avatar initials across chat screens", async ({ page }) => {
    const headerAvatar = page.locator(".chat-title-group .chat-avatar");
    await expect(headerAvatar).toBeVisible();
    const headerInitials = (await headerAvatar.innerText()).trim();

    await page.locator(".chat-title-group").click();
    const details = page.locator(".chat-info-screen");
    await expect(details).toBeVisible();

    const detailsAvatar = details.locator(".chat-info-avatar-wrap .chat-avatar");
    await expect(detailsAvatar).toBeVisible();
    await expect(detailsAvatar).toHaveText(headerInitials);

    const actions = details.locator(".chat-info-action");
    await expect(actions).toHaveCount(3);
    const radii = await actions.evaluateAll((buttons) => buttons.map((button) =>
      Number.parseFloat(getComputedStyle(button).borderTopLeftRadius)
    ));
    expect(radii.every((radius) => radius >= 16)).toBe(true);
  });
});
