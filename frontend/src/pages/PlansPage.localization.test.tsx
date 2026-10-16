import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import PlansPage from "./PlansPage";

vi.mock("../auth/AuthContext", () => {
  const authUser = { id: "user-1", role: "admin", displayName: "Ivan" };
  return { useAuth: () => ({ accessToken: "test-token", currentUser: authUser }) };
});
vi.mock("../api/plans", () => {
  const startsAt = new Date();
  const plan = { id: "plan-1", familyId: "family-1", title: "Selected event", startsAt: startsAt.toISOString(), endsAt: new Date(startsAt.getTime() + 60 * 60 * 1000).toISOString(), allDay: false, timeZone: "UTC", createdBy: "user-1", revision: 1, createdAt: startsAt.toISOString(), updatedAt: startsAt.toISOString(), attendees: [] };
  return { getPlans: vi.fn(async () => [plan]), createPlan: vi.fn(), rsvpPlan: vi.fn() };
});
vi.mock("../api/family", () => ({ getMembers: vi.fn(async () => []) }));
vi.mock("../i18n/LanguageContext", async () => {
  const { getAppStrings } = await import("../config/strings");
  return { useStrings: () => getAppStrings("ru"), useLanguage: () => ({ resolvedLanguage: "ru" }) };
});
vi.mock("./AppNav", () => ({ default: () => null }));
vi.mock("../features/chats/sidebar/RealAvatar", () => ({ RealAvatar: () => null }));

const roots: Root[] = [];
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  while (roots.length) act(() => roots.pop()?.unmount());
  document.body.innerHTML = "";
});

describe("PlansPage date localization", () => {
  it("formats the selected weekday and month in Stovo's Russian language", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    roots.push(root);

    await act(async () => {
      root.render(<PlansPage />);
      await Promise.resolve();
    });

    const expected = new Intl.DateTimeFormat("ru-RU", { weekday: "long", month: "long", day: "numeric" }).format(new Date());
    expect(host.querySelector(".plans-header h2")?.textContent).toBe(expected);
  });

  it("moves the view filters into the date header when the event list is collapsed", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    roots.push(root);

    await act(async () => {
      root.render(<PlansPage />);
      await Promise.resolve();
    });

    const event = host.querySelector<HTMLButtonElement>(".plans-sidebar-row");
    expect(event?.textContent).toContain("Selected event");
    await act(async () => event?.click());
    const collapse = host.querySelector<HTMLButtonElement>('[aria-label="Скрыть список событий"]');
    expect(collapse).not.toBeNull();
    await act(async () => collapse?.click());

    expect(host.querySelector(".plans-layout")?.classList.contains("plans-layout--sidebar-collapsed")).toBe(true);
    expect(host.querySelector(".plans-header .plans-mobile-tabs")).not.toBeNull();
    expect(host.querySelector(".plans-sidebar-row")?.getAttribute("aria-current")).toBe("true");
    expect(host.querySelector<HTMLButtonElement>(".plans-sidebar-collapse")?.getAttribute("aria-expanded")).toBe("false");
  });
});
