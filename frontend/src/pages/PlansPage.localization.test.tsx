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

  it("replaces the event-list close button with an accessible resize divider", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    roots.push(root);

    await act(async () => {
      root.render(<PlansPage />);
      await Promise.resolve();
    });

    expect(host.querySelector(".plans-sidebar-collapse")).toBeNull();
    const divider = host.querySelector<HTMLDivElement>('[role="separator"]');
    expect(divider).not.toBeNull();
    expect(divider?.getAttribute("aria-orientation")).toBe("vertical");
    expect(divider?.getAttribute("aria-valuemin")).toBe("220");
    expect(divider?.getAttribute("aria-valuemax")).toBe("560");
    expect(divider?.getAttribute("aria-valuenow")).toBe("300");
    expect(divider?.getAttribute("tabindex")).toBe("0");
  });

  it("resizes the event list by dragging the divider", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    roots.push(root);

    await act(async () => {
      root.render(<PlansPage />);
      await Promise.resolve();
    });

    const divider = host.querySelector<HTMLDivElement>('[role="separator"]');
    expect(divider).not.toBeNull();
    await act(async () => {
      divider?.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, button: 0, clientX: 200 }));
      divider?.dispatchEvent(new MouseEvent("pointermove", { bubbles: true, clientX: 260 }));
    });

    expect(divider?.getAttribute("aria-valuenow")).toBe("360");
    expect(host.querySelector(".plans-layout")?.getAttribute("style")).toContain("--plans-sidebar-width: 360px");
  });

  it("caps expanded width and collapses when dragging below its minimum", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    roots.push(root);

    await act(async () => {
      root.render(<PlansPage />);
      await Promise.resolve();
    });

    const divider = host.querySelector<HTMLDivElement>('[role="separator"]');
    expect(divider).not.toBeNull();
    await act(async () => {
      divider?.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, button: 0, clientX: 200 }));
      divider?.dispatchEvent(new MouseEvent("pointermove", { bubbles: true, clientX: 1000 }));
    });
    expect(divider?.getAttribute("aria-valuenow")).toBe("560");

    await act(async () => {
      divider?.dispatchEvent(new MouseEvent("pointerup", { bubbles: true }));
      divider?.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, button: 0, clientX: 1000 }));
      divider?.dispatchEvent(new MouseEvent("pointermove", { bubbles: true, clientX: 0 }));
    });
    expect(host.querySelector(".plans-layout")?.classList.contains("plans-layout--sidebar-collapsed")).toBe(true);
    expect(host.querySelector(".plans-sidebar-collapse")).not.toBeNull();
  });

  it("collapses the event list when dragged past its minimum and restores its previous width", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    roots.push(root);

    await act(async () => {
      root.render(<PlansPage />);
      await Promise.resolve();
    });

    const divider = host.querySelector<HTMLDivElement>('[role="separator"]');
    expect(divider).not.toBeNull();
    await act(async () => {
      divider?.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, button: 0, clientX: 300 }));
      divider?.dispatchEvent(new MouseEvent("pointermove", { bubbles: true, clientX: 210 }));
    });

    const layout = host.querySelector(".plans-layout");
    expect(layout?.classList.contains("plans-layout--sidebar-collapsed")).toBe(true);
    const expandButton = host.querySelector<HTMLButtonElement>(".plans-sidebar-collapse");
    expect(expandButton?.getAttribute("aria-expanded")).toBe("false");

    await act(async () => expandButton?.click());

    expect(layout?.classList.contains("plans-layout--sidebar-collapsed")).toBe(false);
    expect(host.querySelector(".plans-sidebar-collapse")).toBeNull();
    expect(host.querySelector('[role="separator"]')?.getAttribute("aria-valuenow")).toBe("300");
  });

  it("resizes the event list with the keyboard", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    roots.push(root);

    await act(async () => {
      root.render(<PlansPage />);
      await Promise.resolve();
    });

    const divider = host.querySelector<HTMLDivElement>('[role="separator"]');
    expect(divider).not.toBeNull();
    await act(async () => divider?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })));

    expect(divider?.getAttribute("aria-valuenow")).toBe("316");
  });
});
