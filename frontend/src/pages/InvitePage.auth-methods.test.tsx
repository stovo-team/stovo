import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  currentUser: null as null | { id: string },
  acceptAuthResponse: vi.fn(),
  acceptInvite: vi.fn(),
  previewInvite: vi.fn(),
}));

vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({ currentUser: mocks.currentUser, acceptAuthResponse: mocks.acceptAuthResponse }),
}));
vi.mock("../api/family", () => ({
  acceptInvite: mocks.acceptInvite,
  previewInvite: mocks.previewInvite,
}));

import InvitePage from "./InvitePage";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("InvitePage authentication method choice", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    mocks.currentUser = null;
    mocks.acceptAuthResponse.mockReset();
    mocks.acceptInvite.mockReset().mockResolvedValue({ accessToken: "access" });
    mocks.previewInvite.mockReset().mockResolvedValue({
      familyName: "Test space", role: "member", expiresAt: "2030-01-01T00:00:00Z", usesRemaining: 1,
    });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    document.body.innerHTML = "";
  });

  async function renderPage() {
    await act(async () => {
      root.render(<MemoryRouter initialEntries={["/invite/invite-token"]}><Routes><Route path="/invite/:token" element={<InvitePage />} /></Routes></MemoryRouter>);
    });
  }

  it("requires the invitee to choose password or passkey and never offers QR sign-in", async () => {
    await renderPage();

    expect(container.textContent).toContain("Create a password");
    expect(container.textContent).toContain("Create a passkey");
    expect(container.textContent).not.toContain("QR code");
  });

  it("does not require or submit a password when the invitee chooses passkey", async () => {
    await renderPage();

    const passkeyChoice = [...container.querySelectorAll("button")].find((button) => button.textContent?.includes("Create a passkey"));
    expect(passkeyChoice).toBeTruthy();
    await act(async () => passkeyChoice?.click());

    const password = container.querySelector<HTMLInputElement>('input[autocomplete="new-password"]');
    expect(password).toBeNull();
    expect(container.querySelector('[data-auth-method="passkey-registration"]')).not.toBeNull();
  });

  it("requires a password only when password registration is selected", async () => {
    await renderPage();

    const passwordChoice = [...container.querySelectorAll("button")].find((button) => button.textContent?.includes("Create a password"));
    expect(passwordChoice).toBeTruthy();
    await act(async () => passwordChoice?.click());

    const password = container.querySelector<HTMLInputElement>('input[autocomplete="new-password"]');
    expect(password).not.toBeNull();
    expect(password?.required).toBe(true);
    expect(password?.minLength).toBe(8);
  });
});
