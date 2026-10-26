import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  platform: "android",
  acceptAuthResponse: vi.fn(),
  beginPasskeyAuthentication: vi.fn(),
  finishPasskeyAuthentication: vi.fn(),
  startAuthentication: vi.fn(),
  scan: vi.fn(),
  redeemAndroidQRLogin: vi.fn(),
}));

vi.mock("@capacitor/core", async (importOriginal) => ({
  ...await importOriginal<typeof import("@capacitor/core")>(),
  Capacitor: { isNativePlatform: () => mocks.platform !== "web", getPlatform: () => mocks.platform },
}));
vi.mock("../auth/AuthContext", () => ({ useAuth: () => ({ acceptAuthResponse: mocks.acceptAuthResponse }) }));
vi.mock("../api/auth", async (importOriginal) => ({
  ...await importOriginal<typeof import("../api/auth")>(),
  beginPasskeyAuthentication: mocks.beginPasskeyAuthentication,
  finishPasskeyAuthentication: mocks.finishPasskeyAuthentication,
  redeemAndroidQRLogin: mocks.redeemAndroidQRLogin,
}));
vi.mock("../native/androidQrScanner", async (importOriginal) => ({
  ...await importOriginal<typeof import("../native/androidQrScanner")>(),
  scanAndroidLoginQR: mocks.scan,
}));
vi.mock("@simplewebauthn/browser", () => ({ startAuthentication: mocks.startAuthentication }));

import { getApiUrl } from "../api/client";
import ServerSetupPage from "./ServerSetupPage";

const qrCode = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnop0";
const qrApiUrl = "https://scanned.example/s/family";
const qrPayload = `stovo://auth/android-login?version=1&apiUrl=${encodeURIComponent(qrApiUrl)}&code=${qrCode}`;
const authResponse = {
  accessToken: "access",
  tokenType: "Bearer",
  expiresInSeconds: 900,
  refreshToken: "refresh",
  user: { id: "user", familyId: "family", username: "sam", displayName: "Sam", role: "member", isActive: true, publicKey: null, profilePhoto: null, profileVisibility: "family", lastSeenVisibility: "family", readReceiptsEnabled: true },
};

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function CurrentPath() {
  return <output data-testid="current-path">{useLocation().pathname}</output>;
}

describe("Android space setup authentication", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    localStorage.clear();
    mocks.platform = "android";
    mocks.acceptAuthResponse.mockReset();
    mocks.beginPasskeyAuthentication.mockReset().mockResolvedValue({ ceremonyId: "ceremony-1", publicKey: { challenge: "challenge" } });
    mocks.finishPasskeyAuthentication.mockReset().mockResolvedValue(authResponse);
    mocks.startAuthentication.mockReset().mockResolvedValue({ id: "credential-1", response: {} });
    mocks.scan.mockReset().mockResolvedValue(qrPayload);
    mocks.redeemAndroidQRLogin.mockReset().mockResolvedValue(authResponse);
    Object.defineProperty(window, "isSecureContext", { configurable: true, value: true });
    Object.defineProperty(window, "PublicKeyCredential", { configurable: true, value: class PublicKeyCredential {} });
    Object.defineProperty(navigator, "language", { configurable: true, value: "en-US" });
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
    delete (window as Window & { isSecureContext?: boolean }).isSecureContext;
    delete (window as Window & { PublicKeyCredential?: unknown }).PublicKeyCredential;
  });

  async function render() {
    await act(async () => root.render(
      <MemoryRouter initialEntries={["/server-setup"]}>
        <Routes>
          <Route path="/server-setup" element={<ServerSetupPage />} />
          <Route path="/app/chats" element={<p>Chats</p>} />
        </Routes>
        <CurrentPath />
      </MemoryRouter>,
    ));
  }

  async function setUrl(value: string) {
    const input = container.querySelector<HTMLInputElement>('input[autocomplete="url"]');
    expect(input).not.toBeNull();
    await act(async () => {
      const setNativeValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setNativeValue?.call(input, value);
      input?.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }

  async function click(selector: string) {
    const button = container.querySelector<HTMLButtonElement>(selector);
    expect(button, `Missing action: ${selector}`).toBeTruthy();
    await act(async () => button!.click());
  }

  it("starts Passkey on the normalized entered server and navigates after sign-in", async () => {
    mocks.beginPasskeyAuthentication.mockImplementation(async () => {
      expect(getApiUrl()).toBe("https://tenant.example.com");
      return { ceremonyId: "ceremony-1", publicKey: { challenge: "challenge" } };
    });
    await render();
    await setUrl(" https://tenant.example.com/ ");

    await click('[data-auth-method="passkey"]');

    expect(mocks.beginPasskeyAuthentication).toHaveBeenCalledOnce();
    expect(mocks.startAuthentication).toHaveBeenCalledOnce();
    expect(mocks.finishPasskeyAuthentication).toHaveBeenCalledWith("ceremony-1", { id: "credential-1", response: {} });
    expect(mocks.acceptAuthResponse).toHaveBeenCalledWith(authResponse);
    expect(container.querySelector('[data-testid="current-path"]')?.textContent).toBe("/app/chats");
  });

  it.each(["", "not a URL"]) ("does not start Passkey for invalid URL %s", async (url) => {
    await render();
    await setUrl(url);
    await click('[data-auth-method="passkey"]');
    expect(mocks.beginPasskeyAuthentication).not.toHaveBeenCalled();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("Enter a valid URL");
  });

  it("keeps Connect and QR available when WebAuthn is unsupported", async () => {
    Object.defineProperty(window, "PublicKeyCredential", { configurable: true, value: undefined });
    await render();
    expect(container.querySelector('[data-auth-method="passkey"]')?.disabled).toBe(true);
    expect(container.querySelector('[data-auth-method="scan-qr"]')).not.toBeNull();
    expect(container.querySelector('button[type="submit"]')?.textContent).toBe("Connect");
    expect(container.textContent).toContain("supported Android WebView");
  });

  it("explains HTTPS when Passkey is unavailable in an insecure context", async () => {
    Object.defineProperty(window, "isSecureContext", { configurable: true, value: false });
    await render();
    expect(container.querySelector('[data-auth-method="passkey"]')?.disabled).toBe(true);
    expect(container.textContent).toContain("Passkeys require a secure connection (HTTPS).");
    expect(container.textContent).not.toContain("supported Android WebView");
  });

  it("keeps the setup screen usable when Passkey is cancelled", async () => {
    mocks.startAuthentication.mockRejectedValueOnce(new DOMException("cancelled", "NotAllowedError"));
    await render();
    await setUrl("https://tenant.example.com");
    await click('[data-auth-method="passkey"]');
    expect(mocks.acceptAuthResponse).not.toHaveBeenCalled();
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(container.querySelector('input[autocomplete="url"]')).not.toBeNull();
    expect(container.querySelector('[data-auth-method="scan-qr"]')).not.toBeNull();
  });

  it("disables Connect and URL editing while Passkey is running", async () => {
    mocks.beginPasskeyAuthentication.mockReturnValue(new Promise(() => {}));
    await render();
    await setUrl("https://tenant.example.com");
    await click('[data-auth-method="passkey"]');
    expect(container.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(true);
    expect(container.querySelector<HTMLInputElement>('input[autocomplete="url"]')?.disabled).toBe(true);
  });

  it("disables auth actions and URL editing while Connect is testing the server", async () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    await render();
    await setUrl("https://tenant.example.com");
    await click('button[type="submit"]');
    expect(container.querySelector<HTMLButtonElement>('[data-auth-method="passkey"]')?.disabled).toBe(true);
    expect(container.querySelector<HTMLButtonElement>('[data-auth-method="scan-qr"]')?.disabled).toBe(true);
    expect(container.querySelector<HTMLInputElement>('input[autocomplete="url"]')?.disabled).toBe(true);
  });

  it("scans and confirms the QR server without using the typed address", async () => {
    await render();
    const originalServer = getApiUrl();
    await click('[data-auth-method="scan-qr"]');
    expect(mocks.scan).toHaveBeenCalledOnce();
    expect(container.querySelector('[role="region"][aria-label="Confirm scanned server"]')?.textContent).toContain(qrApiUrl);
    expect(container.querySelector('input[autocomplete="url"]')).toBeNull();
    expect(container.querySelector('[data-auth-method="passkey"]')).toBeNull();
    expect(container.querySelector('[data-testid="current-path"]')?.textContent).toBe("/server-setup");
    expect(getApiUrl()).toBe(originalServer);
    expect(mocks.redeemAndroidQRLogin).not.toHaveBeenCalled();

    await click(".auth-action-row button");

    expect(mocks.redeemAndroidQRLogin).toHaveBeenCalledWith(qrApiUrl, qrCode);
    expect(getApiUrl()).toBe(qrApiUrl);
    expect(mocks.acceptAuthResponse).toHaveBeenCalledWith(authResponse);
    expect(container.querySelector('[data-testid="current-path"]')?.textContent).toBe("/app/chats");
  });

  it("cancels QR confirmation without changing the active server", async () => {
    await render();
    const originalServer = getApiUrl();
    await click('[data-auth-method="scan-qr"]');
    await click(".auth-action-row button:last-child");
    expect(getApiUrl()).toBe(originalServer);
    expect(mocks.redeemAndroidQRLogin).not.toHaveBeenCalled();
    expect(mocks.acceptAuthResponse).not.toHaveBeenCalled();
    expect(container.querySelector('input[autocomplete="url"]')).not.toBeNull();
  });

  it("returns to setup when the Android QR scanner is cancelled", async () => {
    mocks.scan.mockResolvedValueOnce(null);
    await render();
    await click('[data-auth-method="scan-qr"]');
    expect(container.querySelector('input[autocomplete="url"]')).not.toBeNull();
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(mocks.redeemAndroidQRLogin).not.toHaveBeenCalled();
  });

  it("shows a recoverable error when the scanned QR payload is invalid", async () => {
    mocks.scan.mockResolvedValueOnce("https://untrusted.example/");
    await render();
    await click('[data-auth-method="scan-qr"]');
    expect(container.querySelector('input[autocomplete="url"]')).not.toBeNull();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("QR code");
    expect(mocks.redeemAndroidQRLogin).not.toHaveBeenCalled();
  });

  it("keeps the active server when QR redemption fails", async () => {
    mocks.redeemAndroidQRLogin.mockRejectedValueOnce(new Error("Expired grant"));
    await render();
    const originalServer = getApiUrl();
    await click('[data-auth-method="scan-qr"]');
    await click(".auth-action-row button:first-child");
    expect(mocks.redeemAndroidQRLogin).toHaveBeenCalledWith(qrApiUrl, qrCode);
    expect(getApiUrl()).toBe(originalServer);
    expect(mocks.acceptAuthResponse).not.toHaveBeenCalled();
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
    expect(container.querySelector('input[autocomplete="url"]')).not.toBeNull();
  });

  it("describes domain names and IP addresses without a local-network-only hint", async () => {
    await render();
    expect(container.textContent).toContain("for domain names or IP addresses");
    expect(container.textContent).not.toContain("For local network:");
  });
});
