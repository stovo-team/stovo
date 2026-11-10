import { test, expect } from "./fixtures";

const qrApiUrl = "https://staknov-family-workspace.example.com/s/household-2026";
const qrCode = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnop0";
const qrPayload = `stovo://auth/android-login?version=1&apiUrl=${encodeURIComponent(qrApiUrl)}&code=${qrCode}`;

async function setAndroidPlatform(page: import("@playwright/test").Page) {
  await page.addInitScript((payload) => {
    (window as Window & { Capacitor?: unknown }).Capacitor = {
      PluginHeaders: [{ name: "BarcodeScanner", methods: ["isGoogleBarcodeScannerModuleAvailable", "installGoogleBarcodeScannerModule", "scan"].map((name) => ({ name, rtype: "promise" })) }],
      nativePromise: async (_plugin: string, method: string) => {
        if (method === "isGoogleBarcodeScannerModuleAvailable") return { available: true };
        if (method === "scan") return { barcodes: [{ rawValue: payload }] };
        return {};
      },
    };
    (window as Window & { CapacitorCustomPlatform?: unknown }).CapacitorCustomPlatform = { name: "android", plugins: {} };
  }, qrPayload);
}

async function openAndroidPage(page: import("@playwright/test").Page, route: string, theme: "light" | "dark", locale: "en" | "ru") {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: theme });
  await setAndroidPlatform(page);
  await page.addInitScript(({ theme, locale }) => {
    localStorage.setItem("familyMessenger.appearance", JSON.stringify({ themeMode: theme }));
    localStorage.setItem("familyMessenger.devicePreferences", JSON.stringify({ language: locale }));
  }, { theme, locale });
  await page.goto(route);
  await readyAuth(page);
}

async function capture(page: import("@playwright/test").Page, testInfo: import("@playwright/test").TestInfo, id: string, state: string, theme: "light" | "dark", locale: "en" | "ru") {
  const viewport = { width: 390, height: 844 };
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const file = testInfo.outputPath(`${id}.png`);
  await page.screenshot({ path: file, animations: "disabled" });
  await testInfo.attach(id, { path: file, contentType: "image/png" });
  testInfo.annotations.push({ type: "scenario", description: JSON.stringify({ id, viewport, theme, locale, state, timezone: "UTC" }) });
}

async function readyAuth(page: import("@playwright/test").Page) {
  await expect(page.locator(".auth-panel")).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await page.addStyleTag({ content: "*,*::before,*::after{animation-duration:0s!important;transition-duration:0s!important;caret-color:transparent!important}" });
}

test("Android login actions are compact and localized", async ({ page }, testInfo) => {
  await openAndroidPage(page, "/login", "dark", "ru");
  await expect(page.locator('[data-auth-method="passkey"]')).toHaveText("Ключ доступа");
  await expect(page.locator('[data-auth-method="scan-qr"]')).toHaveText("Сканировать QR");
  await expect(page.getByText("На компьютере откройте Stovo → Настройки → Профиль", { exact: false })).toBeVisible();
  await capture(page, testInfo, "android-login", "Login page; Android; 390x844", "dark", "ru");
});

test("Android QR opens a separate confirmation with one-row actions", async ({ page }, testInfo) => {
  await openAndroidPage(page, "/login", "dark", "ru");
  await page.locator('[data-auth-method="scan-qr"]').click();
  await expect(page.getByRole("region", { name: "Подтвердите сервер из QR-кода" })).toBeVisible();
  await expect(page.locator(".auth-action-row button")).toHaveCount(2);
  await capture(page, testInfo, "android-qr-confirmation", "Scanned QR confirmation; Android; 390x844", "dark", "ru");
});

test("Android setup offers Passkey and QR with domain and IP guidance", async ({ page }, testInfo) => {
  await openAndroidPage(page, "/server-setup", "light", "en");
  await expect(page.locator('[data-auth-method="passkey"]')).toHaveText("Passkey");
  await expect(page.locator('[data-auth-method="scan-qr"]')).toBeVisible();
  await expect(page.getByText("for domain names or IP addresses.")).toBeVisible();
  await expect(page.getByText("For local network:")).toHaveCount(0);
  await capture(page, testInfo, "android-server-setup", "Setup page with Passkey and QR; Android; 390x844", "light", "en");
});
