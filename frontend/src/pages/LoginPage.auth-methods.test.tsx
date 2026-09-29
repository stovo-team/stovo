import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  currentUser: null as null | { id: string },
  login: vi.fn(),
  acceptAuthResponse: vi.fn(),
  fetchSetupStatus: vi.fn(),
}));

vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({ currentUser: mocks.currentUser, login: mocks.login, acceptAuthResponse: mocks.acceptAuthResponse }),
}));
vi.mock("../api/auth", () => ({
  fetchSetupStatus: mocks.fetchSetupStatus,
  requestDeviceLoginCode: vi.fn(),
  verifyDeviceLoginCode: vi.fn(),
}));

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
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    document.body.innerHTML = "";
    delete (window as Window & { isSecureContext?: boolean }).isSecureContext;
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

});
