import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { KeyboardShortcutsSettings } from "./KeyboardShortcutsSettings";
import { ToastViewport } from "../../components/ToastViewport";
import {
  KEYBOARD_SHORTCUTS_STORAGE_KEY,
  loadShortcutBindings,
  resetAllShortcutBindings
} from "../../shortcuts/shortcutsStore";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("KeyboardShortcutsSettings", () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  beforeEach(() => {
    resetAllShortcutBindings();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    if (root) {
      act(() => {
        root?.unmount();
      });
    }
    container?.remove();
    container = null;
    root = null;
    document.body.innerHTML = "";
    resetAllShortcutBindings();
    vi.restoreAllMocks();
  });

  it("renders all categories and default shortcut bindings", async () => {
    await act(async () => {
      root?.render(<KeyboardShortcutsSettings />);
    });

    expect(document.body.textContent).toContain("General & Palette");
    expect(document.body.textContent).toContain("Navigation");
    expect(document.body.textContent).toContain("Chats & Sidebar");
    expect(document.body.textContent).toContain("Conversation & Composer");
    expect(document.body.textContent).toContain("Voice & Calls");

    expect(document.body.textContent).toContain("Quick Switcher");
    expect(document.body.textContent).toContain("Go to Chats");
    expect(document.body.textContent).not.toContain("Customize hotkeys to quickly navigate and control Stovo");
  });

  it("enters recording mode when shortcut badge is clicked, and cancels on Escape", async () => {
    await act(async () => {
      root?.render(<KeyboardShortcutsSettings />);
    });

    const badgeButtons = document.querySelectorAll<HTMLButtonElement>(".shortcut-badge-button");
    expect(badgeButtons.length).toBeGreaterThan(0);

    // Click first badge button (Quick Switcher)
    await act(async () => {
      badgeButtons[0].click();
    });

    expect(document.body.textContent).toContain("Press desired shortcut keys…");

    // Press Escape
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });

    expect(document.body.textContent).not.toContain("Press desired shortcut keys…");
  });

  it("records a new shortcut and allows resetting to default", async () => {
    await act(async () => {
      root?.render(<KeyboardShortcutsSettings />);
    });

    const badgeButtons = document.querySelectorAll<HTMLButtonElement>(".shortcut-badge-button");

    // Enter recording for quick_switcher
    await act(async () => {
      badgeButtons[0].click();
    });

    // Press Alt+Shift+Q
    await act(async () => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "q",
          altKey: true,
          shiftKey: true,
          bubbles: true
        })
      );
    });

    // Check store
    expect(loadShortcutBindings().quick_switcher).toBe("Alt+Shift+Q");

    // Reset button should now be visible for this customized shortcut
    const resetBtn = document.querySelector<HTMLButtonElement>(".shortcut-reset-button");
    expect(resetBtn).not.toBeNull();

    // Click reset button
    await act(async () => {
      resetBtn?.click();
    });

    expect(loadShortcutBindings().quick_switcher).toBe("Mod+Alt+K");
  });

  it("detects conflict when pressing an existing shortcut combo", async () => {
    await act(async () => {
      root?.render(<KeyboardShortcutsSettings />);
    });

    const badgeButtons = document.querySelectorAll<HTMLButtonElement>(".shortcut-badge-button");

    // Click on nav_chats (Alt+1 by default)
    // Find nav_chats badge
    const navChatsButton = Array.from(badgeButtons).find((btn) =>
      btn.getAttribute("aria-label")?.includes("Go to Chats")
    );
    expect(navChatsButton).toBeDefined();

    await act(async () => {
      navChatsButton?.click();
    });

    // Press Mod+Alt+K (which is assigned to quick_switcher)
    await act(async () => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "k",
          ctrlKey: true,
          altKey: true,
          bubbles: true
        })
      );
    });

    // Conflict card should be displayed
    expect(document.querySelector(".shortcuts-conflict-card")).not.toBeNull();
    expect(document.body.textContent).toContain("Already assigned to another action");
  });

  it("detects browser-reserved conflict when pressing a browser shortcut combo", async () => {
    await act(async () => {
      root?.render(<KeyboardShortcutsSettings />);
    });

    const badgeButtons = document.querySelectorAll<HTMLButtonElement>(".shortcut-badge-button");
    // Click quick_switcher badge
    await act(async () => {
      badgeButtons[0].click();
    });

    // Press Ctrl+T (browser new tab)
    await act(async () => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "t",
          ctrlKey: true,
          bubbles: true
        })
      );
    });

    // Conflict card should be displayed
    expect(document.querySelector(".shortcuts-conflict-card")).not.toBeNull();
    expect(document.body.textContent).toContain("Reserved by browser");
    expect(document.body.textContent).toContain("New tab");

    // Click cancel in conflict card
    const cancelBtn = document.querySelector<HTMLButtonElement>(".shortcuts-conflict-actions button");
    await act(async () => {
      cancelBtn?.click();
    });

    expect(document.querySelector(".shortcuts-conflict-card")).toBeNull();
  });

  it("detects browser-reserved conflict when pressing Ctrl+K", async () => {
    await act(async () => {
      root?.render(<KeyboardShortcutsSettings />);
    });

    const badgeButtons = document.querySelectorAll<HTMLButtonElement>(".shortcut-badge-button");
    // Click second shortcut badge
    await act(async () => {
      badgeButtons[1].click();
    });

    // Press Ctrl+K (browser address bar search)
    await act(async () => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "k",
          ctrlKey: true,
          bubbles: true
        })
      );
    });

    // Conflict card should alert browser reservation
    expect(document.querySelector(".shortcuts-conflict-card")).not.toBeNull();
    expect(document.body.textContent).toContain("Reserved by browser");
    expect(document.body.textContent).toContain("Search address bar");
  });

  it("cancels recording mode when close button in grey circle is clicked", async () => {
    await act(async () => {
      root?.render(<KeyboardShortcutsSettings />);
    });

    const badgeButtons = document.querySelectorAll<HTMLButtonElement>(".shortcut-badge-button");
    await act(async () => {
      badgeButtons[0].click();
    });

    const closeBtn = document.querySelector<HTMLButtonElement>(".shortcut-recording-close");
    expect(closeBtn).not.toBeNull();
    expect(closeBtn?.querySelector("svg")).not.toBeNull();

    await act(async () => {
      closeBtn?.click();
    });

    expect(document.body.textContent).not.toContain("Press desired shortcut keys…");
  });

  it("filters shortcuts using the fully rounded search bar", async () => {
    await act(async () => {
      root?.render(<KeyboardShortcutsSettings />);
    });

    const searchInput = document.querySelector<HTMLInputElement>(".shortcuts-search-input");
    expect(searchInput).not.toBeNull();

    await act(async () => {
      if (searchInput) {
        const valueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
        valueSetter?.call(searchInput, "Mute");
        searchInput.dispatchEvent(new Event("input", { bubbles: true }));
      }
    });

    expect(document.body.textContent).toContain("Mute / Unmute Call");
    expect(document.body.textContent).not.toContain("Quick Switcher");
  });

  it("updates shortcuts and announces resetAllShortcutBindings in the toast viewport", async () => {
    await act(async () => {
      root?.render(<><ToastViewport /><KeyboardShortcutsSettings /></>);
    });

    // Enter recording for quick_switcher and assign custom key
    const badgeButtons = document.querySelectorAll<HTMLButtonElement>(".shortcut-badge-button");
    await act(async () => {
      badgeButtons[0].click();
    });
    await act(async () => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "q",
          altKey: true,
          shiftKey: true,
          bubbles: true
        })
      );
    });
    expect(loadShortcutBindings().quick_switcher).toBe("Alt+Shift+Q");

    // Trigger reset all
    await act(async () => {
      resetAllShortcutBindings();
    });

    // Should be reset to default and announced through the shared status toast.
    expect(loadShortcutBindings().quick_switcher).toBe("Mod+Alt+K");
    expect(document.querySelector('.app-toast[role="status"]')?.textContent).toContain("Reset all to defaults");
  });

  it("renders reset button when showResetAll prop is true", async () => {
    await act(async () => {
      root?.render(<KeyboardShortcutsSettings showResetAll={true} />);
    });

    expect(document.querySelector(".shortcuts-reset-all-btn")).not.toBeNull();
  });
});
