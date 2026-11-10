import { test, expect } from "./fixtures";

for (const locale of ["en", "ru"] as const) {
test(`QR approval makes the account and space easy to verify on a narrow screen (${locale})`, async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.addInitScript((language) => {
    localStorage.setItem("familyMessenger.appearance", JSON.stringify({ themeMode: "dark" }));
    localStorage.setItem("familyMessenger.devicePreferences", JSON.stringify({ language }));
  }, locale);
  await page.goto("/app/qr-login/visual-request");
  await expect(page.locator(".qr-approval-panel")).toBeVisible();
  await expect(page.locator(".qr-approval-instruction")).toHaveText(locale === "en"
    ? "Check that this is the account you want to use to sign in on your computer."
    : "Убедитесь, что это аккаунт, с которым вы хотите войти на компьютере.");
  await expect(page.locator(".qr-approval-account-name")).toHaveText("Stovo Demo");
  await expect(page.locator(".qr-approval-space-link")).toBeVisible();
  await expect(page.locator(".qr-approval-panel .auth-actions button").first()).toHaveText(locale === "en" ? "Login" : "Войти");
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.evaluate(() => document.fonts.ready);
  await page.addStyleTag({ content: "*,*::before,*::after{animation-duration:0s!important;transition-duration:0s!important;caret-color:transparent!important}" });
  const screenshot = testInfo.outputPath("qr-login-approval-mobile.png");
  await page.screenshot({ path: screenshot, animations: "disabled" });
  await testInfo.attach("qr-login-approval-mobile", { path: screenshot, contentType: "image/png" });
  testInfo.annotations.push({ type: "scenario", description: JSON.stringify({ id: `qr-login-approval-mobile-${locale}`, viewport: { width: 390, height: 844 }, theme: "dark", locale, state: "QR approval account confirmation", timezone: "UTC" }) });
});
}
