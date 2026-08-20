import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import AppNav from "./AppNav";
import { getDefaultAppPath } from "./RootRedirect";

// Mock LanguageContext and AuthContext
vi.mock("../i18n/LanguageContext", () => ({
  useStrings: () => ({
    nav: {
      ariaLabel: "App navigation",
      chats: "Chats",
      storage: "Storage",
      plans: "Plans",
      settings: "Settings",
      admin: "Admin",
      logOut: "Log out",
      unreadMessages: (count: number) => `${count} unread messages`,
    },
  }),
}));

vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({
    currentUser: { id: "u1", role: "member" },
    authRequest: vi.fn().mockResolvedValue([]),
    logout: vi.fn(),
  }),
}));

vi.mock("../hooks/useReducedMotion", () => ({
  useReducedMotion: () => false,
}));

describe("AppNav tab visibility configuration", () => {
  it("renders all navigation tabs when all are enabled", () => {
    const markup = renderToStaticMarkup(
      <MemoryRouter>
        <AppNav
          navTabsOverride={{
            chats: true,
            storage: true,
            plans: true,
            settings: true,
          }}
        />
      </MemoryRouter>
    );

    expect(markup).toContain('href="/app/chats"');
    expect(markup).toContain('href="/app/files"');
    expect(markup).toContain('href="/app/plans"');
    expect(markup).toContain('href="/app/settings"');
  });

  it("hides storage and plans when disabled", () => {
    const markup = renderToStaticMarkup(
      <MemoryRouter>
        <AppNav
          navTabsOverride={{
            chats: true,
            storage: false,
            plans: false,
            settings: true,
          }}
        />
      </MemoryRouter>
    );

    expect(markup).toContain('href="/app/chats"');
    expect(markup).not.toContain('href="/app/files"');
    expect(markup).not.toContain('href="/app/plans"');
    expect(markup).toContain('href="/app/settings"');
  });

  it("hides chats when disabled", () => {
    const markup = renderToStaticMarkup(
      <MemoryRouter>
        <AppNav
          navTabsOverride={{
            chats: false,
            storage: true,
            plans: true,
            settings: true,
          }}
        />
      </MemoryRouter>
    );

    expect(markup).not.toContain('href="/app/chats"');
    expect(markup).toContain('href="/app/files"');
    expect(markup).toContain('href="/app/plans"');
    expect(markup).toContain('href="/app/settings"');
  });
});

describe("getDefaultAppPath", () => {
  it("returns /app/chats by default", () => {
    expect(getDefaultAppPath("")).toBe("/app/chats");
    expect(getDefaultAppPath("/s/abc12345")).toBe("/s/abc12345/app/chats");
  });

  it("falls back to storage when chats is disabled", () => {
    expect(getDefaultAppPath("/s/abc", { chats: false, storage: true })).toBe("/s/abc/app/files");
  });

  it("falls back to plans when chats and storage are disabled", () => {
    expect(getDefaultAppPath("/s/abc", { chats: false, storage: false, plans: true })).toBe("/s/abc/app/plans");
  });

  it("falls back to settings when only settings is enabled", () => {
    expect(getDefaultAppPath("/s/abc", { chats: false, storage: false, plans: false, settings: true })).toBe("/s/abc/app/settings");
  });
});
