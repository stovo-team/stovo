import { beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_SHORTCUT_BINDINGS,
  SHORTCUT_DEFINITIONS,
  checkShortcutConflict,
  formatKeyComboForDisplay,
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
  it("defines default shortcut definitions and bindings", () => {
    expect(SHORTCUT_DEFINITIONS.length).toBeGreaterThan(10);
    expect(DEFAULT_SHORTCUT_BINDINGS.quick_switcher).toBe("Mod+K");
    expect(DEFAULT_SHORTCUT_BINDINGS.shortcuts_help).toBe("Mod+/");
    expect(DEFAULT_SHORTCUT_BINDINGS.nav_chats).toBe("Alt+1");
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
  });
});
