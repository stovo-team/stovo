import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  platform: "web",
  currentUser: null as null | { id: string },
  login: vi.fn(),
  acceptAuthResponse: vi.fn(),
  fetchSetupStatus: vi.fn(),
  beginPasskeyAuthentication: vi.fn(),
  finishPasskeyAuthentication: vi.fn(),
  createBrowserQRLogin: vi.fn(),
  getBrowserQRLoginStatus: vi.fn(),
  qrToDataURL: vi.fn(),
  startAuthentication: vi.fn(),
}));

vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => mocks.platform !== "web", getPlatform: () => mocks.platform }, registerPlugin: vi.fn(() => ({})) }));

vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({ currentUser: mocks.currentUser, login: mocks.login, acceptAuthResponse: mocks.acceptAuthResponse }),
}));
vi.mock("../api/auth", () => ({
  fetchSetupStatus: mocks.fetchSetupStatus,
  beginPasskeyAuthentication: mocks.beginPasskeyAuthentication,
  finishPasskeyAuthentication: mocks.finishPasskeyAuthentication,
  createBrowserQRLogin: mocks.createBrowserQRLogin,
  getBrowserQRLoginStatus: mocks.getBrowserQRLoginStatus,
  requestDeviceLoginCode: vi.fn(),
  verifyDeviceLoginCode: vi.fn(),
}));
vi.mock("qrcode", () => ({ default: { toDataURL: mocks.qrToDataURL } }));
vi.mock("@simplewebauthn/browser", () => ({ startAuthentication: mocks.startAuthentication }));

import LoginPage from "./LoginPage";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("LoginPage authentication methods", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    mocks.platform = "web";
    mocks.currentUser = null;
    mocks.login.mockReset();
    mocks.acceptAuthResponse.mockReset();
    mocks.fetchSetupStatus.mockResolvedValue({ setupRequired: false });
    mocks.beginPasskeyAuthentication.mockReset().mockResolvedValue({ ceremonyId: "ceremony-1", publicKey: { challenge: "challenge" } });
    mocks.finishPasskeyAuthentication.mockReset().mockResolvedValue({ accessToken: "access" });
    mocks.createBrowserQRLogin.mockReset().mockResolvedValue({ requestId: "request-1", scanUrl: "stovo://auth/qr/request-1", expiresAt: "2030-01-01T00:00:00Z" });
    mocks.getBrowserQRLoginStatus.mockReset().mockResolvedValue({ status: "pending" });
    mocks.qrToDataURL.mockReset().mockResolvedValue("data:image/png;base64,ZmFrZQ==");
    mocks.startAuthentication.mockReset().mockResolvedValue({ id: "credential-1", response: {} });
    Object.defineProperty(window, "isSecureContext", { configurable: true, value: true });
    Object.defineProperty(window, "PublicKeyCredential", { configurable: true, value: class PublicKeyCredential {} });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    document.body.innerHTML = "";
    delete (window as Window & { isSecureContext?: boolean }).isSecureContext;
    delete (window as Window & { PublicKeyCredential?: unknown }).PublicKeyCredential;
  });

  async function renderPage() {
    await act(async () => {
      root.render(<MemoryRouter initialEntries={["/login"]}><LoginPage /></MemoryRouter>);
    });
  }

  it("keeps username and password as the default and offers passkey and QR as secondary methods", async () => {
    await renderPage();

    expect(container.querySelector('input[autocomplete="username"]')).not.toBeNull();
    expect(container.querySelector('input[autocomplete="current-password"]')).not.toBeNull();
    expect(container.textContent).toContain("Sign In");
    expect(container.textContent).toContain("Passkey");
    expect(container.textContent).toContain("QR code");
  });

  it("shows QR sign-in without login fields and offers passkey or password", async () => {
    await renderPage();

    const qrAction = [...container.querySelectorAll("button")].find((button) => button.textContent?.includes("QR code"));
    await act(async () => qrAction?.click());

    expect(container.querySelector('input[autocomplete="username"]')).toBeNull();
    expect(container.querySelector('input[autocomplete="current-password"]')).toBeNull();
    expect(container.querySelector('.qr-login-panel img[alt="QR code to approve this browser sign-in with Stovo"]')).not.toBeNull();
    expect(container.textContent).toContain("Sign in with Passkey");

    const passwordAction = [...container.querySelectorAll("button")].find((button) => button.textContent?.includes("Sign in with Password"));
    await act(async () => passwordAction?.click());

    expect(container.querySelector('input[autocomplete="username"]')).not.toBeNull();
    expect(container.querySelector('input[autocomplete="current-password"]')).not.toBeNull();
  });

  it("groups passkey and QR actions into two columns below a centered separator", async () => {
    await renderPage();

    const separator = container.querySelector('.auth-divider[role="separator"]');
    const methodGrid = container.querySelector(".auth-method-grid");
    const passkeyAction = container.querySelector('[data-auth-method="passkey"]');
    const qrAction = container.querySelector('[data-auth-method="qr"]');

    expect(separator?.textContent?.trim()).toBe("or");
    expect(methodGrid).not.toBeNull();
    expect(methodGrid?.contains(passkeyAction)).toBe(true);
    expect(methodGrid?.contains(qrAction)).toBe(true);
  });

  it("keeps the password form usable when the browser is not in a secure context", async () => {
    Object.defineProperty(window, "isSecureContext", { configurable: true, value: false });
    await renderPage();

    expect(container.querySelector('input[autocomplete="current-password"]')).not.toBeNull();
    expect(container.textContent).toContain("Passkeys require a secure connection");
    expect(container.textContent).toContain("QR code");
  });

  it("starts QR sign-in without asking for the phone account password", async () => {
    await renderPage();

    const qrAction = [...container.querySelectorAll("button")].find((button) => button.textContent?.includes("QR code"));
    expect(qrAction).toBeTruthy();
    await act(async () => qrAction?.click());

    expect(container.textContent).toContain("Scan this code with Stovo");
    expect(container.textContent).toContain("Waiting for approval");
    expect(container.querySelector('input[autocomplete="current-password"]')).toBeNull();
  });

  it("completes a passkey assertion and accepts the normal Stovo auth response", async () => {
    await renderPage();
    const passkeyAction = [...container.querySelectorAll("button")].find((button) => button.textContent?.includes("Passkey"));

    await act(async () => passkeyAction?.click());

    expect(mocks.beginPasskeyAuthentication).toHaveBeenCalledOnce();
    expect(mocks.startAuthentication).toHaveBeenCalledOnce();
    expect(mocks.finishPasskeyAuthentication).toHaveBeenCalledWith("ceremony-1", { id: "credential-1", response: {} });
    expect(mocks.acceptAuthResponse).toHaveBeenCalledWith({ accessToken: "access" });
  });

  it("authenticates in a supported Android WebView", async () => {
    mocks.platform = "android";
    await renderPage();
    const button = container.querySelector<HTMLButtonElement>('[data-auth-method="passkey"]');
    expect(button).not.toBeNull();
    expect(button?.disabled).toBe(false);
    await act(async () => button?.click());
    expect(mocks.finishPasskeyAuthentication).toHaveBeenCalledWith("ceremony-1", { id: "credential-1", response: {} });
    expect(mocks.acceptAuthResponse).toHaveBeenCalledWith({ accessToken: "access" });
  });
  it.each(["missing API", "insecure context"])("retains Android fallback with %s", async (reason) => {
    mocks.platform = "android";
    Object.defineProperty(window, reason === "missing API" ? "PublicKeyCredential" : "isSecureContext", { configurable: true, value: reason === "missing API" ? undefined : false });
    await renderPage();
    expect(container.querySelector<HTMLButtonElement>('[data-auth-method="passkey"]')?.disabled).toBe(true);
    expect(container.textContent).toContain(reason === "missing API" ? "supported Android WebView" : "secure connection");
    expect(container.querySelector('input[autocomplete="current-password"]')).not.toBeNull();
    expect(container.textContent).toContain("Scan desktop QR");
  });
  it.each(["NotAllowedError", "AbortError", "UnknownError"])("allows Android retry after %s", async (name) => {
    mocks.platform = "android";
    mocks.startAuthentication.mockRejectedValueOnce(new DOMException("provider error", name));
    await renderPage();
    const button = container.querySelector<HTMLButtonElement>('[data-auth-method="passkey"]');
    expect(button).not.toBeNull();
    await act(async () => button?.click());
    expect(container.querySelector('[role="alert"]')?.textContent ?? "").toBe(name === "UnknownError" ? "Passkey sign-in failed. Try again or use your password." : "");
    expect(button?.disabled).toBe(false);
    expect(mocks.finishPasskeyAuthentication).not.toHaveBeenCalled();
    expect(container.querySelector('input[autocomplete="current-password"]')).not.toBeNull();
    expect(container.textContent).toContain("Scan desktop QR");
    await act(async () => button?.click());
    expect(mocks.acceptAuthResponse).toHaveBeenCalledOnce();
  });
  it("keeps native iOS passkey login unavailable", async () => {
    mocks.platform = "ios";
    await renderPage();
    expect(container.querySelector('[data-auth-method="passkey"]')).toBeNull();
    expect(container.querySelector('input[autocomplete="current-password"]')).not.toBeNull();
  });

});
