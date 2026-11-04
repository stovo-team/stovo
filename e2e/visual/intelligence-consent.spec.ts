import { expect, test } from "./fixtures";
import { shellScenarios, screenshot, type Scenario } from "./scenarios";

const requestParameters = {
  response_type: "code",
  client_id: "intelligence-client-with-a-long-registered-name-for-narrow-screen-wrapping",
  redirect_uri: "https://intelligence.example/callback/with/a/long/path?tenant=one&region=north",
  state: "opaque-oidc-state",
  nonce: "opaque-oidc-nonce",
  code_challenge: "BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB",
  code_challenge_method: "S256",
};
const consentURL = `/intelligence/consent?${new URLSearchParams({ flow: "oidc", ...requestParameters }).toString()}`;

async function prepareConsent(page: import("@playwright/test").Page, scenario: Scenario, redesigned = true) {
  await page.setViewportSize(scenario.viewport);
  await page.emulateMedia({ colorScheme: scenario.theme });
  await page.addInitScript(({ theme, locale }) => {
    localStorage.setItem("familyMessenger.appearance", JSON.stringify({ themeMode: theme }));
    localStorage.setItem("familyMessenger.devicePreferences", JSON.stringify({ language: locale }));
  }, { theme: scenario.theme, locale: scenario.locale });
  await page.goto(consentURL);
  await expect(page.locator(redesigned ? ".intelligence-identity-panel" : ".auth-panel")).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await page.addStyleTag({ content: "*,*::before,*::after{animation-duration:0s!important;transition-duration:0s!important;caret-color:transparent!important}" });
}

for (const baseScenario of shellScenarios) {
  const scenario = { ...baseScenario, id: `OIDC-${baseScenario.id}` };
  test(`OIDC identity confirmation ${scenario.id} ${scenario.viewport.width}px ${scenario.theme} ${scenario.locale}`, async ({ page }, info) => {
    await prepareConsent(page, scenario);

    const heading = scenario.locale === "ru"
      ? "Войдите, чтобы связать аккаунт Messenger"
      : "Sign in to link your Messenger account";
    const continueLabel = scenario.locale === "ru" ? "Продолжить" : "Continue";
    await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
    await expect(page.locator(".intelligence-identity-details code")).toHaveText([
      requestParameters.client_id,
      requestParameters.redirect_uri,
    ]);
    const continueButton = page.getByRole("button", { name: continueLabel });
    await expect(continueButton).toBeVisible();
    await expect(page.getByRole("button", { name: scenario.locale === "ru" ? "Отмена" : "Cancel" })).toBeVisible();
    const defaultContinueStyle = await continueButton.evaluate((button) => {
      const style = getComputedStyle(button);
      return { backgroundImage: style.backgroundImage, borderColor: style.borderColor };
    });
    await continueButton.hover();
    await expect.poll(() => continueButton.evaluate((button) => {
      const style = getComputedStyle(button);
      return { backgroundImage: style.backgroundImage, borderColor: style.borderColor };
    })).toEqual(defaultContinueStyle);
    await page.mouse.move(0, 0);
    const overflowingConsentElements = await page.locator(
      ".intelligence-identity-panel, .intelligence-identity-details, .intelligence-identity-details dd, .intelligence-identity-details code",
    ).evaluateAll((elements) => elements
      .filter((element) => element.scrollWidth > element.clientWidth)
      .map((element) => element.className || element.tagName));
    expect(overflowingConsentElements).toEqual([]);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await screenshot(page, info, scenario);
  });
}

test("OIDC consent baseline comparison state", async ({ page }, info) => {
  const scenario: Scenario = { id: "OIDC-before-after-desktop-dark-en", viewport: { width: 1440, height: 900 }, theme: "dark", locale: "en" };
  await prepareConsent(page, scenario, false);
  await expect(page.locator(".auth-panel")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1, name: "Sign in to link your Messenger account" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue" })).toBeVisible();

  if (await page.locator(".intelligence-identity-panel").count()) {
    await screenshot(page, info, scenario);
    return;
  }

  const file = info.outputPath(`${scenario.id}.png`);
  await page.screenshot({ path: file, animations: "disabled" });
  await info.attach(scenario.id, { path: file, contentType: "image/png" });
  info.annotations.push({ type: "scenario", description: JSON.stringify({ ...scenario, timezone: "UTC" }) });
});

test("OIDC continuation creates a browser session and redirects with the original request", async ({ page }) => {
  const scenario: Scenario = { id: "OIDC-redirect", viewport: { width: 1440, height: 900 }, theme: "light", locale: "en" };
  await page.route(/\/oauth2\/authorize(?:\?.*)?$/, (route) => route.fulfill({
    status: 200,
    contentType: "text/html",
    body: "<!doctype html><title>Mock authorization endpoint</title>",
  }));
  await prepareConsent(page, scenario);
  await page.evaluate(() => {
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const requestURL = new URL(input instanceof Request ? input.url : String(input), window.location.origin);
      if (requestURL.pathname === "/api/v2/intelligence/authorize-session") {
        window.sessionStorage.setItem("oidc-session-body", String(init?.body ?? ""));
        return new Response(JSON.stringify({ expires_in: 120 }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return originalFetch(input, init);
    };
  });

  await page.getByRole("button", { name: "Continue" }).click();
  await page.waitForURL((url) => url.pathname === "/oauth2/authorize", { waitUntil: "commit" });

  const sessionBody = await page.evaluate(() => window.sessionStorage.getItem("oidc-session-body"));
  expect(JSON.parse(sessionBody ?? "null")).toEqual({ flow: "oidc", ...requestParameters });
  const authorizeURL = new URL(page.url());
  expect(Object.fromEntries(authorizeURL.searchParams)).toEqual(requestParameters);
});
