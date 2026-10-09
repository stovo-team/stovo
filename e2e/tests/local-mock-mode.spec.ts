import { expect, test } from "@playwright/test";


test("renders the real chats route with mock data, sends locally, and resets on reload", async ({ page }) => {
  const socketRequests: string[] = [];
  const hookOrderWarnings: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/socket.io")) socketRequests.push(request.url());
  });
  page.on("console", (message) => {
    if (message.type() === "error" && message.text().includes("change in the order of Hooks")) {
      hookOrderWarnings.push(message.text());
    }
  });

  await page.goto("/app/chats");

  await expect(page.locator(".app-nav")).toBeVisible();
  await expect(page.locator(".server-switcher-name")).toHaveText("Stovo Demo");

  const planningTeam = page.locator('.chat-list-item[data-chat-id="chat-planning-team"]');
  await expect(planningTeam).toContainText("Planning Team");
  await planningTeam.click();
  await expect(page.locator("#msg-planning-kickoff .message-body")).toBeVisible();

  const sentText = "This message exists only until the next reload.";
  await page.locator(".message-composer textarea").fill(sentText);
  await page.locator('.message-composer button[type="submit"]').click();
  await expect(page.getByText(sentText, { exact: true })).toBeVisible();

  await page.reload();
  await expect(page.locator(".server-switcher-name")).toHaveText("Stovo Demo");
  await expect(page.locator("#msg-planning-kickoff .message-body")).toBeVisible();
  await expect(page.getByText(sentText, { exact: true })).toHaveCount(0);
  expect(hookOrderWarnings).toEqual([]);
  expect(socketRequests).toEqual([]);
});
