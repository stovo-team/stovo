import { test, expect, ready } from "./fixtures";

test("chat list context menu closes when its scroll view moves", async ({ page }, testInfo) => {
  testInfo.annotations.push({
    type: "evidence",
    description: JSON.stringify({ viewport: "1440x900", theme: "light", locale: "en-US", interaction: "right-click chat, scroll list" })
  });
  await page.goto("/app/chats/chat-planning-team");
  await ready(page);

  const chatRow = page.locator('[data-chat-id="chat-planning-team"]');
  await expect(chatRow).toBeVisible();
  await chatRow.click({ button: "right" });

  const menu = page.locator(".chat-context-menu");
  await expect(menu).toBeVisible();
  await testInfo.attach("chat-context-menu-before-scroll", {
    body: await page.screenshot({ animations: "disabled" }),
    contentType: "image/png"
  });

  await page.locator(".chat-list").evaluate((element) => {
    const scrollView = element as HTMLElement;
    scrollView.scrollTop += 1;
    scrollView.dispatchEvent(new Event("scroll"));
  });
  await expect(menu).toBeHidden();
  await testInfo.attach("chat-context-menu-after-scroll", {
    body: await page.screenshot({ animations: "disabled" }),
    contentType: "image/png"
  });
});

test("message context menu stays usable internally and closes when its viewport moves", async ({ page }, testInfo) => {
  testInfo.annotations.push({
    type: "evidence",
    description: JSON.stringify({ viewport: "1440x900", theme: "light", locale: "en-US", interaction: "right-click message, scroll menu then conversation" })
  });
  await page.goto("/app/chats/chat-planning-team");
  await ready(page);

  await page.locator("#msg-planning-kickoff .message-body").click({ button: "right" });
  const menu = page.locator(".message-context-menu");
  await expect(menu).toBeVisible();
  await menu.locator(".message-context-reactions-expand").click();
  const reactionScroller = menu.locator(".message-context-reactions--expanded");
  await reactionScroller.dispatchEvent("scroll");
  await expect(menu).toBeVisible();
  await testInfo.attach("message-context-menu-before-scroll", {
    body: await page.screenshot({ animations: "disabled" }),
    contentType: "image/png"
  });

  await page.locator(".messages-panel").evaluate((element) => {
    const scrollView = element as HTMLElement;
    scrollView.scrollTop = scrollView.scrollTop === 0 ? 1 : 0;
    scrollView.dispatchEvent(new Event("scroll"));
  });
  await expect(menu).toBeHidden();
  await testInfo.attach("message-context-menu-after-scroll", {
    body: await page.screenshot({ animations: "disabled" }),
    contentType: "image/png"
  });
});
