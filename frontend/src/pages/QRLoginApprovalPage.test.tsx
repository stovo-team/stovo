import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  accessToken: "access-token",
  activeServer: { url: "https://space.example/s/team" },
  currentUser: {
    id: "user-1",
    displayName: "Sam Example",
    profilePhoto: { id: "photo-1" },
    avatarMode: "photo",
    avatarSymbolId: null,
    avatarColorId: null,
  },
  isLoading: false,
  respond: vi.fn(),
}));

vi.mock("../api/auth", () => ({ respondToBrowserQRLogin: mocks.respond }));
vi.mock("../auth/AuthContext", () => ({ useAuth: () => mocks }));
vi.mock("../features/chats/sidebar/RealAvatar", () => ({
  RealAvatar: (props: { className: string; file: { id: string }; label: string }) => (
    <span className={props.className} data-file-id={props.file.id} data-label={props.label} />
  ),
}));

import QRLoginApprovalPage from "./QRLoginApprovalPage";

describe("QRLoginApprovalPage", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    mocks.respond.mockReset().mockResolvedValue({ status: "approved" });
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  async function render() {
    await act(async () => root.render(<MemoryRouter initialEntries={["/app/qr-login/request-1"]}><Routes><Route path="/app/qr-login/:requestId" element={<QRLoginApprovalPage />} /></Routes></MemoryRouter>));
  }

  it("asks the user to verify the account and space before login", async () => {
    await render();

    expect(container.textContent).toContain("Check that this is the account you want to use to sign in on your computer.");
    expect(container.textContent).toContain("Sam Example");
    expect(container.querySelector('[data-file-id="photo-1"]')?.getAttribute("data-label")).toBe("Sam Example");
    const spaceLink = container.querySelector<HTMLAnchorElement>(".qr-approval-space-link");
    expect(spaceLink?.href).toBe("https://space.example/s/team");
    expect(container.querySelector(".qr-approval-instruction")?.classList.contains("qr-approval-instruction")).toBe(true);
    expect(container.querySelector(".qr-approval-panel .auth-actions button")?.textContent).toBe("Login");
    expect(container.querySelectorAll(".qr-approval-panel .auth-actions button")).toHaveLength(2);
  });

  it("approves the scanned sign-in only after Login is selected", async () => {
    await render();
    const login = container.querySelector<HTMLButtonElement>(".qr-approval-panel .auth-actions button");
    expect(login).not.toBeNull();

    await act(async () => login!.click());

    expect(mocks.respond).toHaveBeenCalledWith("request-1", "approve", "access-token");
    expect(container.textContent).toContain("Request handled. You can return to your computer.");
  });
});
