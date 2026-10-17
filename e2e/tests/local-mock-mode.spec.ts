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

  const scheduledText = "This scheduled message should reset with the demo.";
  await page.evaluate((content) => {
    localStorage.setItem("stovo_outbox_queue_user-stovo-demo", JSON.stringify([{
      id: "scheduled-preview-reset",
      clientMessageId: "scheduled-preview-reset",
      chatId: "chat-planning-team",
      userId: "user-stovo-demo",
      content,
      replyToMessageId: null,
      threadRootMessageId: null,
      mentionedUserIds: [],
      attachments: [],
      createdAt: new Date().toISOString(),
      status: "scheduled",
      attemptCount: 0,
      scheduledFor: "2099-01-01T09:00:00.000Z",
    }]));
  }, scheduledText);

  await page.reload();
  await expect(page.locator(".server-switcher-name")).toHaveText("Stovo Demo");
  await expect(page.locator("#msg-planning-kickoff .message-body")).toBeVisible();
  await expect(page.getByText(sentText, { exact: true })).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => localStorage.getItem("stovo_outbox_queue_user-stovo-demo"))).toBeNull();
  await expect(page.getByText(scheduledText, { exact: true })).toHaveCount(0);
  expect(hookOrderWarnings).toEqual([]);
  expect(socketRequests).toEqual([]);
});

test("simulates a video call between two demo users in separate tabs without media devices", async ({ page }) => {
  const socketRequests: string[] = [];
  const installMediaGuard = async (targetPage: typeof page) => {
    await targetPage.addInitScript(() => {
      localStorage.setItem("stovo.call-ui-preferences", JSON.stringify({ autoHideControls: false, cameraFit: "fit" }));
      const mockWindow = window as Window & {
        __mockMediaCalls?: number;
        __mockRtcConnections?: number;
        __mockAudioContexts?: number;
        __mockAudioPlays?: number;
      };
      mockWindow.__mockMediaCalls = 0;
      mockWindow.__mockRtcConnections = 0;
      mockWindow.__mockAudioContexts = 0;
      mockWindow.__mockAudioPlays = 0;
      Object.defineProperty(HTMLAudioElement.prototype, "play", {
        configurable: true,
        value: () => {
          mockWindow.__mockAudioPlays += 1;
          return Promise.resolve();
        },
      });
      const devices = navigator.mediaDevices ?? ({} as MediaDevices);
      Object.defineProperty(navigator, "mediaDevices", {
        configurable: true,
        value: {
          ...devices,
          getUserMedia: async () => {
            mockWindow.__mockMediaCalls += 1;
            return new MediaStream();
          },
          getDisplayMedia: async () => {
            mockWindow.__mockMediaCalls += 1;
            return new MediaStream();
          },
        },
      });
      const PeerConnection = window.RTCPeerConnection;
      if (PeerConnection) {
        Object.defineProperty(window, "RTCPeerConnection", {
          configurable: true,
          value: new Proxy(PeerConnection, {
            construct(target, argumentsList) {
              mockWindow.__mockRtcConnections += 1;
              return Reflect.construct(target, argumentsList);
            },
          }),
        });
      }
      const BrowserAudioContext = window.AudioContext;
      if (BrowserAudioContext) {
        Object.defineProperty(window, "AudioContext", {
          configurable: true,
          value: new Proxy(BrowserAudioContext, {
            construct(target, argumentsList) {
              mockWindow.__mockAudioContexts += 1;
              return Reflect.construct(target, argumentsList);
            },
          }),
        });
      }
    });
    targetPage.on("request", (request) => {
      if (new URL(request.url()).pathname.startsWith("/socket.io")) socketRequests.push(request.url());
    });
  };

  await installMediaGuard(page);
  await page.goto("/app/chats/chat-planning-team?mockUser=user-stovo-demo");
  await expect(page.locator(".app-nav")).toBeVisible();
  await expect(page.locator("#msg-planning-kickoff .message-body")).toBeVisible();

  const secondPage = await page.context().newPage();
  await installMediaGuard(secondPage);
  await secondPage.goto("/app/chats/chat-planning-team?mockUser=user-alex-rivera");
  await expect(secondPage.locator(".app-nav")).toBeVisible();
  await expect(secondPage.locator("#msg-planning-kickoff .message-body")).toBeVisible();
  await expect.poll(() => secondPage.evaluate(() => sessionStorage.getItem("stovo.localMockUserId"))).toBe("user-alex-rivera");

  const thirdPage = await page.context().newPage();
  await installMediaGuard(thirdPage);
  await thirdPage.goto("/app/chats/chat-planning-team?mockUser=user-maya-chen");
  await expect(thirdPage.locator(".app-nav")).toBeVisible();
  await expect.poll(() => thirdPage.evaluate(() => sessionStorage.getItem("stovo.localMockUserId"))).toBe("user-maya-chen");

  const declinedPage = await page.context().newPage();
  await installMediaGuard(declinedPage);
  await declinedPage.goto("/app/chats/chat-planning-team?mockUser=user-sam-patel");
  await expect(declinedPage.locator(".app-nav")).toBeVisible();

  await page.getByRole("button", { name: "Video call" }).click();
  await expect(page.getByRole("dialog", { name: "Outgoing call" })).toBeVisible();
  await expect(secondPage.getByRole("dialog", { name: "Incoming call" })).toBeVisible();
  await expect(thirdPage.getByRole("dialog", { name: "Incoming call" })).toBeVisible();
  await expect(declinedPage.getByRole("dialog", { name: "Incoming call" })).toBeVisible();
  await secondPage.getByRole("button", { name: "Accept call" }).click();
  await thirdPage.getByRole("button", { name: "Accept call" }).click();
  await declinedPage.getByRole("button", { name: "Decline call" }).click();
  await expect(declinedPage.locator(".call-popup")).toHaveCount(0);

  await expect(page.getByRole("dialog", { name: "Active call" })).toBeVisible();
  await expect(secondPage.getByRole("dialog", { name: "Active call" })).toBeVisible();
  await expect(thirdPage.getByRole("dialog", { name: "Active call" })).toBeVisible();
  await expect(page.locator(".call-grid__tile--remote")).toHaveCount(2);
  await expect(secondPage.locator(".call-grid__tile--remote")).toHaveCount(2);
  await expect(thirdPage.locator(".call-grid__tile--remote")).toHaveCount(2);
  await expect(page.locator(".call-grid__tile")).toHaveCount(3);
  await expect(secondPage.locator(".call-grid__tile")).toHaveCount(3);
  const sharedScreen = page.getByRole("img", { name: "Stovo Demo's shared screen" });
  await page.getByRole("button", { name: "Share screen" }).click();
  await expect(sharedScreen).toBeVisible();
  await expect(secondPage.getByRole("img", { name: "Stovo Demo's shared screen" })).toBeVisible();
  await expect(page.locator(".call-grid__tile--screen")).toHaveAttribute("style", /aspect-ratio: 16 \/ 9/);
  await expect(secondPage.locator(".call-grid__tile--screen")).toHaveAttribute("style", /aspect-ratio: 16 \/ 9/);
  await page.getByRole("button", { name: "Stop sharing screen" }).click();
  await expect(page.getByRole("img", { name: "Stovo Demo's shared screen" })).toHaveCount(0);
  await expect(secondPage.getByRole("img", { name: "Stovo Demo's shared screen" })).toHaveCount(0);
  await page.getByRole("button", { name: "Share screen" }).click();
  await expect(page.getByRole("img", { name: "Stovo Demo's shared screen" })).toBeVisible();
  await expect(secondPage.getByRole("img", { name: "Stovo Demo's shared screen" })).toBeVisible();
  const microphoneButton = page.getByRole("button", { name: "Toggle Microphone" });
  await microphoneButton.click();
  await expect(microphoneButton).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Toggle Camera" }).click();
  expect(await page.evaluate(() => (window as Window & { __mockMediaCalls?: number }).__mockMediaCalls)).toBe(0);
  expect(await secondPage.evaluate(() => (window as Window & { __mockMediaCalls?: number }).__mockMediaCalls)).toBe(0);
  expect(await thirdPage.evaluate(() => (window as Window & { __mockMediaCalls?: number }).__mockMediaCalls)).toBe(0);
  expect(await declinedPage.evaluate(() => (window as Window & { __mockMediaCalls?: number }).__mockMediaCalls)).toBe(0);
  for (const targetPage of [page, secondPage, thirdPage, declinedPage]) {
    expect(await targetPage.evaluate(() => (window as Window & { __mockRtcConnections?: number }).__mockRtcConnections)).toBe(0);
    expect(await targetPage.evaluate(() => (window as Window & { __mockAudioContexts?: number }).__mockAudioContexts)).toBe(0);
    expect(await targetPage.evaluate(() => (window as Window & { __mockAudioPlays?: number }).__mockAudioPlays)).toBe(0);
    expect(await targetPage.evaluate(() => (window as Window & { __mockMediaCalls?: number }).__mockMediaCalls)).toBe(0);
  }

  await page.close();
  await expect(secondPage.getByRole("img", { name: "Stovo Demo's shared screen" })).toHaveCount(0);
  await expect(thirdPage.getByRole("img", { name: "Stovo Demo's shared screen" })).toHaveCount(0);
  await expect(secondPage.getByRole("dialog", { name: "Active call" })).toBeVisible();
  await expect(thirdPage.getByRole("dialog", { name: "Active call" })).toBeVisible();
  await secondPage.getByRole("button", { name: "End call" }).click();
  await expect(secondPage.locator(".call-popup")).toHaveCount(0);
  await expect(thirdPage.locator(".call-popup")).toHaveCount(0);
  await expect(declinedPage.locator(".call-popup")).toHaveCount(0);
  expect(socketRequests).toEqual([]);
  await thirdPage.close();
  await declinedPage.close();
});

test("uploads a local chat attachment and keeps it available to another user after reload", async ({ page }) => {
  const fileName = "planning-checklist.txt";
  await page.goto("/app/chats/chat-planning-team?mockUser=user-stovo-demo");
  await expect(page.locator(".app-nav")).toBeVisible();
  await expect(page.locator("#msg-planning-kickoff .message-body")).toBeVisible();

  await page.locator('input[type="file"]').first().setInputFiles({
    name: fileName,
    mimeType: "text/plain",
    buffer: Buffer.from("Locally stored test attachment."),
  });
  await expect(page.locator(".pending-attachment-card--file")).toContainText(fileName);
  const messageText = "Sharing a local test file.";
  await page.locator(".message-composer textarea").fill(messageText);
  await page.locator('.message-composer button[type="submit"]').click();
  await expect(page.getByText(messageText, { exact: true })).toBeVisible();
  await expect(page.locator(".pending-attachment-card--file")).toHaveCount(0);
  await expect(page.locator(".message-attachments")).toContainText(fileName);

  const secondPage = await page.context().newPage();
  await secondPage.goto("/app/files?mockUser=user-alex-rivera");
  await expect(secondPage.locator(".app-nav")).toBeVisible();
  await expect(secondPage.getByText(fileName, { exact: true })).toBeVisible();
  await secondPage.reload();
  await expect(secondPage.getByText(fileName, { exact: true })).toBeVisible();
  await secondPage.close();
});
