import { beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_SHORTCUT_BINDINGS,
  SHORTCUT_DEFINITIONS,
  checkShortcutConflict,
  formatKeyComboForDisplay,
  getBrowserShortcutConflict,
  matchesKeyCombo,
  normalizeKeyComboFromEvent
} from "./registry";
import {
  KEYBOARD_SHORTCUTS_STORAGE_KEY,
  loadShortcutBindings,
  resetAllShortcutBindings,
  resetShortcutBinding,
  saveShortcutBinding
} from "./shortcutsStore";

describe("Shortcuts Registry and Normalization", () => {
  it("defines default shortcut definitions and bindings without browser conflicts", () => {
    expect(SHORTCUT_DEFINITIONS.length).toBeGreaterThan(10);
    expect(DEFAULT_SHORTCUT_BINDINGS.quick_switcher).toBe("Mod+K");
    expect(DEFAULT_SHORTCUT_BINDINGS.shortcuts_help).toBe("Mod+/");
    expect(DEFAULT_SHORTCUT_BINDINGS.nav_chats).toBe("Alt+1");
    expect(DEFAULT_SHORTCUT_BINDINGS.new_chat).toBe("Alt+N");
    expect(DEFAULT_SHORTCUT_BINDINGS.toggle_theme).toBe("Mod+Alt+T");
    expect(DEFAULT_SHORTCUT_BINDINGS.focus_composer).toBe("Alt+C");
    expect(DEFAULT_SHORTCUT_BINDINGS.search_messages).toBe("Mod+Alt+F");
    expect(DEFAULT_SHORTCUT_BINDINGS.toggle_call).toBe("Mod+Alt+C");
    expect(DEFAULT_SHORTCUT_BINDINGS.toggle_mute).toBe("Mod+Alt+M");

    // Ensure none of the default bindings conflict with browser shortcuts
    for (const [actionId, binding] of Object.entries(DEFAULT_SHORTCUT_BINDINGS)) {
      if (actionId === "quick_switcher") continue; // Mod+K is standard in-app quick switcher
      expect(getBrowserShortcutConflict(binding)).toBeNull();
    }
  });

  it("detects browser-reserved shortcut conflicts", () => {
    expect(getBrowserShortcutConflict("Ctrl+T")).toBe("New tab");
    expect(getBrowserShortcutConflict("Mod+Shift+T")).toBe("Reopen closed tab");
    expect(getBrowserShortcutConflict("Mod+N")).toBe("New browser window");
    expect(getBrowserShortcutConflict("Ctrl+L")).toBe("Focus address bar");
    expect(getBrowserShortcutConflict("Mod+Shift+C")).toBe("Inspect element");
    expect(getBrowserShortcutConflict("Mod+Shift+M")).toBe("Toggle device mode");
    expect(getBrowserShortcutConflict("Alt+D")).toBe("Focus address bar");
    expect(getBrowserShortcutConflict("Ctrl+1")).toBe("Switch to tab 1");

    // Safe Stovo shortcuts do not conflict
    expect(getBrowserShortcutConflict("Alt+N")).toBeNull();
    expect(getBrowserShortcutConflict("Mod+Alt+T")).toBeNull();
    expect(getBrowserShortcutConflict("Alt+C")).toBeNull();
    expect(getBrowserShortcutConflict("Mod+Alt+C")).toBeNull();
  });

  it("normalizes KeyboardEvent into key combination string", () => {
    const event1 = new KeyboardEvent("keydown", { key: "k", ctrlKey: true });
    expect(normalizeKeyComboFromEvent(event1, false)).toBe("Mod+K");

    const eventMac = new KeyboardEvent("keydown", { key: "k", metaKey: true });
    expect(normalizeKeyComboFromEvent(eventMac, true)).toBe("Mod+K");

    const eventAltDown = new KeyboardEvent("keydown", { key: "ArrowDown", altKey: true });
    expect(normalizeKeyComboFromEvent(eventAltDown, false)).toBe("Alt+ArrowDown");

    const eventShiftMod = new KeyboardEvent("keydown", { key: "t", ctrlKey: true, shiftKey: true });
    expect(normalizeKeyComboFromEvent(eventShiftMod, false)).toBe("Mod+Shift+T");
  });

  it("matchesKeyCombo correctly matches events across platforms", () => {
    const eventWin = new KeyboardEvent("keydown", { key: "k", ctrlKey: true });
    expect(matchesKeyCombo("Mod+K", eventWin, false)).toBe(true);
    expect(matchesKeyCombo("Mod+K", eventWin, true)).toBe(false);

    const eventMac = new KeyboardEvent("keydown", { key: "k", metaKey: true });
    expect(matchesKeyCombo("Mod+K", eventMac, true)).toBe(true);

    const eventAlt1 = new KeyboardEvent("keydown", { key: "1", altKey: true });
    expect(matchesKeyCombo("Alt+1", eventAlt1)).toBe(true);
    expect(matchesKeyCombo("Alt+2", eventAlt1)).toBe(false);
  });

  it("formats key combos for display with platform glyphs", () => {
    expect(formatKeyComboForDisplay("Mod+K", false)).toEqual(["Ctrl", "K"]);
    expect(formatKeyComboForDisplay("Mod+K", true)).toEqual(["⌘", "K"]);
    expect(formatKeyComboForDisplay("Alt+ArrowDown", false)).toEqual(["Alt", "↓"]);
    expect(formatKeyComboForDisplay("Alt+ArrowDown", true)).toEqual(["⌥", "↓"]);
  });

  it("detects shortcut conflicts", () => {
    const bindings = { ...DEFAULT_SHORTCUT_BINDINGS };
    // quick_switcher is Mod+K. Setting nav_chats to Mod+K should conflict.
    const conflict = checkShortcutConflict("nav_chats", "Mod+K", bindings);
    expect(conflict).toBe("quick_switcher");

    // Setting quick_switcher to Mod+K should not conflict with itself
    expect(checkShortcutConflict("quick_switcher", "Mod+K", bindings)).toBeNull();

    // Setting to unused combo should not conflict
    expect(checkShortcutConflict("nav_chats", "Alt+Shift+9", bindings)).toBeNull();
  });
});

describe("Shortcuts Store Persistence", () => {
  beforeEach(() => {
    window.localStorage.removeItem(KEYBOARD_SHORTCUTS_STORAGE_KEY);
  });

  it("loads defaults when no localStorage entry exists", () => {
    const loaded = loadShortcutBindings();
    expect(loaded.quick_switcher).toBe("Mod+K");
  });

  it("saves custom shortcut and merges with defaults", () => {
    saveShortcutBinding("quick_switcher", "Ctrl+Space");
    const loaded = loadShortcutBindings();
    expect(loaded.quick_switcher).toBe("Ctrl+Space");
    expect(loaded.nav_chats).toBe(DEFAULT_SHORTCUT_BINDINGS.nav_chats);
  });

  it("resets individual shortcut binding", () => {
    saveShortcutBinding("quick_switcher", "Ctrl+Space");
    expect(loadShortcutBindings().quick_switcher).toBe("Ctrl+Space");

    resetShortcutBinding("quick_switcher");
    expect(loadShortcutBindings().quick_switcher).toBe("Mod+K");
  });

  it("resets all shortcut bindings", () => {
    saveShortcutBinding("quick_switcher", "Ctrl+Space");
    saveShortcutBinding("nav_chats", "Alt+9");

    resetAllShortcutBindings();
    const loaded = loadShortcutBindings();
    expect(loaded.quick_switcher).toBe("Mod+K");
    expect(loaded.nav_chats).toBe("Alt+1");
    expect(loaded.new_chat).toBe("Alt+N");
  });

  it("migrates legacy conflicting default shortcuts to new non-intersecting defaults", () => {
    // Simulate user having old default shortcuts in localStorage
    const legacyStorage = {
      new_chat: "Mod+N",
      toggle_theme: "Mod+Shift+T",
      focus_composer: "Mod+L",
      custom_binding: "Alt+Shift+9"
    };
    window.localStorage.setItem(KEYBOARD_SHORTCUTS_STORAGE_KEY, JSON.stringify(legacyStorage));

    const loaded = loadShortcutBindings();
    expect(loaded.new_chat).toBe("Alt+N");
    expect(loaded.toggle_theme).toBe("Mod+Alt+T");
    expect(loaded.focus_composer).toBe("Alt+C");
  });
});
