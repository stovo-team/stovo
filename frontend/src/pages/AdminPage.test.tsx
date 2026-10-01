import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authRequest: vi.fn(),
  currentUser: { role: "member", permissions: ["manage_server"] as string[] }
}));

vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({ accessToken: "test-token", authRequest: mocks.authRequest, currentUser: mocks.currentUser })
}));
vi.mock("./AppNav", () => ({ default: () => null }));
vi.mock("../i18n/LanguageContext", () => ({
  useStrings: () => ({
    adminAccessRequired: "Admin access required",
    title: "Admin",
    admin: {
      adminAccessRequired: "Admin access required",
      title: "Admin",
      hub: {
        categoriesLabel: "Admin sections",
        categories: { overview: "Overview", access: "Access", features: "Features", integrations: "Integrations" },
        memberDefaults: "Member defaults",
        memberDefaultsDesc: "Default member settings",
        serverSettings: "Space Settings",
        serverSettingsDesc: "Server-level settings",
        appearance: "Appearance",
        appearanceDesc: "Server appearance",
        encryption: "Encryption",
        premium: "Premium",
        mcp: "MCP connectors",
        members: "Members"
      },
      encryption: { premium: "Premium" }
    }
  })
}));

import AdminPage from "./AdminPage";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("AdminPage defaults navigation", () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  beforeEach(() => {
    mocks.currentUser = { role: "member", permissions: ["manage_server"] };
    mocks.authRequest.mockResolvedValue({});
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    if (root) act(() => root?.unmount());
    container?.remove();
    container = null;
    root = null;
    document.body.innerHTML = "";
    vi.clearAllMocks();
  });

  async function renderPage() {
    await act(async () => {
      root?.render(<MemoryRouter><AdminPage /></MemoryRouter>);
    });
  }

  it("shows server settings, but not owner-only member defaults, to a member with manage_server", async () => {
    await renderPage();
    expect(container?.querySelector('a[href$="/app/admin/defaults"]')).toBeNull();
    expect(container?.querySelector('a[href$="/app/admin/server-settings"]')).toBeTruthy();
  });

  it("hides member defaults from a member without manage_server", async () => {
    mocks.currentUser = { role: "member", permissions: [] };
    await renderPage();
    expect(container?.querySelector('a[href$="/app/admin/defaults"]')).toBeNull();
    expect(container?.querySelector('a[href$="/app/admin/server-settings"]')).toBeNull();
  });

  it("shows both defaults and server settings to the owner", async () => {
    mocks.currentUser = { role: "owner", permissions: [] };
    await renderPage();
    expect(container?.querySelector('a[href$="/app/admin/defaults"]')).toBeTruthy();
    expect(container?.querySelector('a[href$="/app/admin/server-settings"]')).toBeTruthy();
  });

  it("shows the owner admin tabs in the requested order with Space Settings first", async () => {
    mocks.currentUser = { role: "owner", permissions: [] };
    await renderPage();
    const tabs = [...(container?.querySelectorAll<HTMLElement>(".admin-hub-tab") ?? [])];
    expect(tabs.map((tab) => tab.getAttribute("href") ?? tab.getAttribute("aria-disabled"))).toEqual([
      "/app/admin/server-settings",
      "/app/admin/members",
      "/app/admin/defaults",
      "/app/admin/roles",
      "/app/admin/appearance",
      "/app/admin/mcp",
      "true",
      "/app/admin/plugins"
    ]);
    expect(tabs[0]?.querySelector("strong")?.textContent).toBe("Space Settings");
  });

  it("preserves the requested relative order for permission-filtered members", async () => {
    mocks.currentUser = { role: "member", permissions: ["manage_members", "manage_roles", "manage_integrations"] };
    await renderPage();
    const tabs = [...(container?.querySelectorAll<HTMLAnchorElement>(".admin-hub-tab[href]") ?? [])];
    expect(tabs.map((tab) => tab.getAttribute("href"))).toEqual([
      "/app/admin/members",
      "/app/admin/roles",
      "/app/admin/mcp"
    ]);
  });
});
