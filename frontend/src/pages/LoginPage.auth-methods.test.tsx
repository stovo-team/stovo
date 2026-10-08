import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
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
    expect(container.textContent).toContain("Log in");
    expect(container.textContent).toContain("Passkey");
    expect(container.textContent).toContain("QR code");
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
    expect(container.querySelector('input[autocomplete="current-password"]')).not.toBeNull();
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

});
