import { DEFAULT_SHORTCUT_BINDINGS } from "./registry";
import type { ShortcutActionId, ShortcutBindings } from "./types";

export const KEYBOARD_SHORTCUTS_STORAGE_KEY = "familyMessenger.keyboardShortcuts";

export function loadShortcutBindings(): ShortcutBindings {
  if (typeof window === "undefined") {
    return { ...DEFAULT_SHORTCUT_BINDINGS };
  }
  try {
    const raw = window.localStorage.getItem(KEYBOARD_SHORTCUTS_STORAGE_KEY);
    if (!raw) {
      return { ...DEFAULT_SHORTCUT_BINDINGS };
    }
    const parsed = JSON.parse(raw) as Partial<ShortcutBindings>;
    return {
      ...DEFAULT_SHORTCUT_BINDINGS,
      ...parsed
    };
  } catch {
    return { ...DEFAULT_SHORTCUT_BINDINGS };
  }
}

export function saveShortcutBinding(
  actionId: ShortcutActionId,
  combo: string
): ShortcutBindings {
  const current = loadShortcutBindings();
  const updated: ShortcutBindings = {
    ...current,
    [actionId]: combo
  };
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(
        KEYBOARD_SHORTCUTS_STORAGE_KEY,
        JSON.stringify(updated)
      );
      window.dispatchEvent(new CustomEvent("stovo:shortcuts-changed", { detail: updated }));
    } catch {
      // Non-fatal
    }
  }
  return updated;
}

export function resetShortcutBinding(actionId: ShortcutActionId): ShortcutBindings {
  const current = loadShortcutBindings();
  const updated: ShortcutBindings = {
    ...current,
    [actionId]: DEFAULT_SHORTCUT_BINDINGS[actionId]
  };
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(
        KEYBOARD_SHORTCUTS_STORAGE_KEY,
        JSON.stringify(updated)
      );
      window.dispatchEvent(new CustomEvent("stovo:shortcuts-changed", { detail: updated }));
    } catch {
      // Non-fatal
    }
  }
  return updated;
}

export function resetAllShortcutBindings(): ShortcutBindings {
  const updated = { ...DEFAULT_SHORTCUT_BINDINGS };
  if (typeof window !== "undefined") {
    try {
      window.localStorage.removeItem(KEYBOARD_SHORTCUTS_STORAGE_KEY);
      window.dispatchEvent(new CustomEvent("stovo:shortcuts-changed", { detail: updated }));
    } catch {
      // Non-fatal
    }
  }
  return updated;
}
