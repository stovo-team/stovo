import { test, expect } from "./fixtures";

const approvalUrl = `stovo://auth/qr-approve/${"a".repeat(48)}`;

async function capture(page: import("@playwright/test").Page, testInfo: import("@playwright/test").TestInfo, id: string, locale: "en" | "ru", state: string) {
  const viewport = { width: 390, height: 844 };
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const file = testInfo.outputPath(`${id}.png`);
  await page.screenshot({ path: file, animations: "disabled" });
  await testInfo.attach(id, { path: file, contentType: "image/png" });
  testInfo.annotations.push({ type: "scenario", description: JSON.stringify({ id, viewport, theme: "dark", locale, state, timezone: "UTC" }) });
}

async function openMobileLogin(page: import("@playwright/test").Page, locale: "en" | "ru") {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.addInitScript(({ locale }) => {
    Object.defineProperty(navigator, "userAgent", { configurable: true, value: "Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 Chrome/131.0.0.0 Mobile Safari/537.36" });
    localStorage.setItem("familyMessenger.appearance", JSON.stringify({ themeMode: "dark" }));
    localStorage.setItem("familyMessenger.devicePreferences", JSON.stringify({ language: locale }));
    // Keep the handoff visible in a deterministic screenshot instead of asking
    // the host OS to open an app during the visual run.
    const click = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function() {
      if (this.href.startsWith("stovo:")) {
        sessionStorage.setItem("visualAppLaunchUrl", this.href);
        return;
      }
      click.call(this);
    };
  }, { locale });
  await page.goto("/login?mockSignedOut=1");
  await expect(page.locator(".auth-panel")).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await page.addStyleTag({ content: "*,*::before,*::after{animation-duration:0s!important;transition-duration:0s!important;caret-color:transparent!important}" });
}

test("mobile web login uses short auth labels in English", async ({ page }, testInfo) => {
  await openMobileLogin(page, "en");
  await expect(page.locator('[data-auth-method="passkey"]')).toHaveText("Passkey");
  await expect(page.locator('[data-auth-method="qr"]')).toHaveText("QR code");
  await capture(page, testInfo, "mobile-login-en", "en", "Login page; Android browser; dark theme; 390x844");
});

test("mobile QR sign-in automatically opens Stovo without a manual fallback in Russian", async ({ page }, testInfo) => {
  await openMobileLogin(page, "ru");
  await expect(page.locator('[data-auth-method="passkey"]')).toHaveText("Ключ доступа");
  await expect(page.locator('[data-auth-method="qr"]')).toHaveText("QR-код");
  await page.locator('[data-auth-method="qr"]').click();
  await expect.poll(() => page.evaluate(() => sessionStorage.getItem("visualAppLaunchUrl"))).toBe(approvalUrl);
  await expect(page.locator('[data-auth-method="open-app"]')).toHaveCount(0);
  await expect(page.getByText("Открыть в Stovo")).toHaveCount(0);
  await capture(page, testInfo, "mobile-login-auto-app-ru", "ru", "QR sign-in after automatic app handoff; no manual app-open prompt; Android browser; dark theme; 390x844");
});
