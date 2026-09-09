import { DEFAULT_SHORTCUT_BINDINGS } from "./registry";
import type { ShortcutActionId, ShortcutBindings } from "./types";

export const KEYBOARD_SHORTCUTS_STORAGE_KEY = "familyMessenger.keyboardShortcuts";

const LEGACY_DEFAULT_SHORTCUTS: Record<string, string> = {
  quick_switcher: "Mod+K",
  new_chat: "Mod+N",
  toggle_theme: "Mod+Shift+T",
  focus_composer: "Mod+L",
  search_messages: "Mod+F",
  toggle_details: "Mod+I",
  attach_file: "Mod+Shift+U",
  toggle_call: "Mod+Shift+C",
  toggle_mute: "Mod+Shift+M"
};

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
    const migrated: Partial<ShortcutBindings> = { ...parsed };
    let didMigrate = false;
    for (const [actionKey, legacyCombo] of Object.entries(LEGACY_DEFAULT_SHORTCUTS)) {
      const actionId = actionKey as ShortcutActionId;
      if (migrated[actionId] && migrated[actionId]?.toLowerCase() === legacyCombo.toLowerCase()) {
        migrated[actionId] = DEFAULT_SHORTCUT_BINDINGS[actionId];
        didMigrate = true;
      }
    }
    const result: ShortcutBindings = {
      ...DEFAULT_SHORTCUT_BINDINGS,
      ...migrated
    };
    if (didMigrate) {
      try {
        window.localStorage.setItem(KEYBOARD_SHORTCUTS_STORAGE_KEY, JSON.stringify(result));
      } catch {
        // Non-fatal
      }
    }
    return result;
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
      window.dispatchEvent(
        new CustomEvent("stovo:shortcuts-changed", {
          detail: { ...updated, isResetAll: true }
        })
      );
    } catch {
      // Non-fatal
    }
  }
  return updated;
}
