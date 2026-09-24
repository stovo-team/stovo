// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authRequest: vi.fn(),
  getServerRoles: vi.fn(),
  getMemberAdminDetails: vi.fn(),
  banMemberIP: vi.fn(),
  unbanMemberIP: vi.fn()
}));

vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({
    accessToken: "access-token",
    currentUser: { id: "admin", role: "owner", permissions: [], displayName: "Admin", username: "admin" },
    authRequest: mocks.authRequest
  })
}));
vi.mock("../api/family", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../api/family")>()),
  getServerRoles: mocks.getServerRoles,
  getMemberAdminDetails: mocks.getMemberAdminDetails,
  banMemberIP: mocks.banMemberIP,
  unbanMemberIP: mocks.unbanMemberIP
}));
vi.mock("../hooks/useFilePreviewUrl", () => ({ default: () => null }));
vi.mock("./AppNav", () => ({ default: () => <div /> }));
vi.mock("../components/BackButton", () => ({ BackButton: () => <button type="button">Back</button> }));

import AdminMembersPage from "./AdminMembersPage";

const member = {
  id: "member-1",
  familyId: "family-1",
  username: "member",
  displayName: "Member One",
  role: "member",
  roleId: "member-role",
  isActive: true,
  profilePhoto: null,
  createdAt: "2026-09-01T00:00:00Z",
  lastSeenAt: "2026-09-24T11:30:00Z",
  lastSeenVisibility: "family"
} as never;

let root: Root;
let container: HTMLDivElement;

async function flush() {
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
}

async function click(element: Element | null) {
  if (!element) throw new Error("Expected button was not found");
  await act(async () => { element.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
}

function button(name: string) {
  return Array.from(container.querySelectorAll("button")).find((item) => item.textContent?.includes(name) || item.getAttribute("aria-label") === name) ?? null;
}

beforeEach(async () => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.append(container);
  mocks.authRequest.mockResolvedValue([member]);
  mocks.getServerRoles.mockResolvedValue([]);
  mocks.getMemberAdminDetails.mockResolvedValue({
    id: "member-1", isActive: true, isOnline: false, joinedAt: "2026-09-01T00:00:00Z",
    lastSeenAt: "2026-09-24T11:30:00Z", candidateIp: "192.0.2.4", candidateIpBanned: false, bannedIp: null
  });
  mocks.banMemberIP.mockResolvedValue(undefined);
  mocks.unbanMemberIP.mockResolvedValue(undefined);
  root = createRoot(container);
  await act(async () => { root.render(<AdminMembersPage />); });
  await flush();
});

afterEach(async () => {
  await act(async () => { root.unmount(); });
  container.remove();
  vi.clearAllMocks();
});

describe("AdminMembersPage member context menu", () => {
  it("opens the activity action and closes the menu with Escape", async () => {
    await click(button("More actions for Member One"));
    expect(container.querySelector('[role="menu"]')).not.toBeNull();
    await act(async () => { document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); });
    expect(container.querySelector('[role="menu"]')).toBeNull();
    await click(button("More actions for Member One"));
    await act(async () => { document.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true })); });
    expect(container.querySelector('[role="menu"]')).toBeNull();
    await click(button("More actions for Member One"));
    await click(button("Activity and safety"));
    await flush();
    expect(document.activeElement).toBe(button("Block this IP"));
    await act(async () => { document.activeElement?.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true })); });
    expect(document.activeElement).toBe(button("Close"));
    await act(async () => { document.activeElement?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); });
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(button("More actions for Member One"));
  });

  it("keeps the candidate IP hidden until confirmation and lets the admin cancel", async () => {
    await click(button("More actions for Member One"));
    await click(button("Activity and safety"));
    await flush();
    expect(document.activeElement).toBe(button("Block this IP"));
    expect(container.textContent).not.toContain("192.0.2.4");
    await click(button("Block this IP"));
    expect(container.querySelector('[role="alertdialog"]')).not.toBeNull();
    expect(container.textContent).toContain("192.0.2.4");
    expect(document.activeElement).toBe(button("Confirm block"));
    await act(async () => { document.activeElement?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); });
    expect(container.querySelector('[role="alertdialog"]')).toBeNull();
    expect(document.activeElement).toBe(button("Block this IP"));
    await click(button("Block this IP"));
    await click(button("Cancel"));
    expect(container.querySelector('[role="alertdialog"]')).toBeNull();
    expect(mocks.banMemberIP).not.toHaveBeenCalled();
  });

  it("keeps the confirmation open and reports an API error when a block fails", async () => {
    mocks.banMemberIP.mockRejectedValueOnce(new Error("blocked by server"));
    await click(button("More actions for Member One"));
    await click(button("Activity and safety"));
    await flush();
    await click(button("Block this IP"));
    await click(button("Confirm block"));
    await flush();
    expect(container.querySelector('[role="alertdialog"]')).not.toBeNull();
    expect(container.textContent).toContain("Could not update IP block");
  });

  it("offers the stored old IP for lifting a block after the candidate IP changes", async () => {
    mocks.getMemberAdminDetails.mockResolvedValueOnce({
      id: "member-1", isActive: true, isOnline: false, joinedAt: "2026-09-01T00:00:00Z",
      lastSeenAt: null, candidateIp: "198.51.100.9", candidateIpBanned: false, bannedIp: "192.0.2.4"
    });
    await click(button("More actions for Member One"));
    await click(button("Activity and safety"));
    await flush();
    await click(button("Lift IP block"));
    expect(container.textContent).toContain("192.0.2.4");
    await click(button("Confirm lift"));
    await flush();
    expect(mocks.unbanMemberIP).toHaveBeenCalledWith("access-token", "member-1");
  });
});
