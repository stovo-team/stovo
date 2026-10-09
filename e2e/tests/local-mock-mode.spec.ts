import { expect, test } from "@playwright/test";

const initialMessage = "Kickoff notes are ready for review.";

test("renders the real chats route with mock data, sends locally, and resets on reload", async ({ page }) => {
  await page.goto("/app/chats");

  await expect(page.locator(".app-nav")).toBeVisible();
  await expect(page.locator(".server-switcher-name")).toHaveText("Stovo Demo");

  const planningTeam = page.locator('.chat-list-item[data-chat-id="chat-planning-team"]');
  await expect(planningTeam).toContainText("Planning Team");
  await planningTeam.click();
  await expect(page.getByText(initialMessage, { exact: true })).toBeVisible();

  const sentText = "This message exists only until the next reload.";
  await page.locator(".message-composer textarea").fill(sentText);
  await page.locator('.message-composer button[type="submit"]').click();
  await expect(page.getByText(sentText, { exact: true })).toBeVisible();

  await page.reload();
  await expect(page.locator(".server-switcher-name")).toHaveText("Stovo Demo");
  await expect(page.getByText(initialMessage, { exact: true })).toBeVisible();
  await expect(page.getByText(sentText, { exact: true })).toHaveCount(0);
});
