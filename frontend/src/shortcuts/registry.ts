import type {
  ShortcutActionId,
  ShortcutBindings,
  ShortcutDefinition
} from "./types";

export const SHORTCUT_DEFINITIONS: ShortcutDefinition[] = [
  // General
  {
    id: "quick_switcher",
    category: "general",
    defaultBinding: "Mod+K",
    scope: "global"
  },
  {
    id: "shortcuts_help",
    category: "general",
    defaultBinding: "Mod+/",
    scope: "global"
  },
  {
    id: "toggle_theme",
    category: "general",
    defaultBinding: "Mod+Shift+T",
    scope: "global"
  },
  // Navigation
  {
    id: "nav_chats",
    category: "navigation",
    defaultBinding: "Alt+1",
    scope: "global"
  },
  {
    id: "nav_files",
    category: "navigation",
    defaultBinding: "Alt+2",
    scope: "global"
  },
  {
    id: "nav_plans",
    category: "navigation",
    defaultBinding: "Alt+3",
    scope: "global"
  },
  {
    id: "nav_settings",
    category: "navigation",
    defaultBinding: "Alt+4",
    scope: "global"
  },
  // Chats & Sidebar
  {
    id: "next_chat",
    category: "chats",
    defaultBinding: "Alt+ArrowDown",
    scope: "global"
  },
  {
    id: "prev_chat",
    category: "chats",
    defaultBinding: "Alt+ArrowUp",
    scope: "global"
  },
  {
    id: "new_chat",
    category: "chats",
    defaultBinding: "Mod+N",
    scope: "global"
  },
  {
    id: "search_messages",
    category: "chats",
    defaultBinding: "Mod+F",
    scope: "global"
  },
  // Conversation & Composer
  {
    id: "focus_composer",
    category: "composer",
    defaultBinding: "Mod+L",
    scope: "global"
  },
  {
    id: "toggle_details",
    category: "chats",
    defaultBinding: "Mod+I",
    scope: "global"
  },
  {
    id: "attach_file",
    category: "composer",
    defaultBinding: "Mod+Shift+U",
    scope: "global"
  },
  // Calling
  {
    id: "toggle_call",
    category: "calls",
    defaultBinding: "Mod+Shift+C",
    scope: "global"
  },
  {
    id: "toggle_mute",
    category: "calls",
    defaultBinding: "Mod+Shift+M",
    scope: "global"
  }
];

export const DEFAULT_SHORTCUT_BINDINGS: ShortcutBindings = Object.fromEntries(
  SHORTCUT_DEFINITIONS.map((def) => [def.id, def.defaultBinding])
) as ShortcutBindings;

export function isMacPlatform(): boolean {
  if (typeof navigator === "undefined") return false;
  const platform = (navigator as { userAgentData?: { platform?: string } }).userAgentData?.platform || navigator.platform || navigator.userAgent;
  return /Mac|iPhone|iPod|iPad/i.test(platform);
}

/**
 * Normalizes a KeyboardEvent into a canonical combination string.
 * Example: Mod+K, Alt+ArrowDown, Mod+Shift+T
 */
export function normalizeKeyComboFromEvent(
  event: KeyboardEvent,
  isMac = isMacPlatform()
): string | null {
  const rawKey = event.key;
  if (["Control", "Shift", "Alt", "Meta"].includes(rawKey)) {
    return null;
  }

  const parts: string[] = [];

  const usesMod = isMac ? event.metaKey : event.ctrlKey;
  if (usesMod) {
    parts.push("Mod");
  } else {
    if (event.ctrlKey) parts.push("Ctrl");
    if (event.metaKey) parts.push("Meta");
  }

  if (event.altKey) parts.push("Alt");
  if (event.shiftKey) parts.push("Shift");

  // Normalize key name
  let key = rawKey;
  if (key === " ") key = "Space";
  else if (key.length === 1) key = key.toUpperCase();

  parts.push(key);
  return parts.join("+");
}

/**
 * Checks whether a given KeyboardEvent matches a canonical combo string.
 */
export function matchesKeyCombo(
  combo: string,
  event: KeyboardEvent,
  isMac = isMacPlatform()
): boolean {
  if (!combo) return false;
  const tokens = combo.split("+");
  const requiredKey = tokens[tokens.length - 1];
  const requiredMod = tokens.includes("Mod");
  const requiredCtrl = tokens.includes("Ctrl");
  const requiredMeta = tokens.includes("Meta");
  const requiredAlt = tokens.includes("Alt");
  const requiredShift = tokens.includes("Shift");

  const hasMod = isMac ? event.metaKey : event.ctrlKey;
  if (requiredMod !== hasMod) return false;
  if (!requiredMod) {
    if (requiredCtrl !== event.ctrlKey) return false;
    if (requiredMeta !== event.metaKey) return false;
  }

  if (requiredAlt !== event.altKey) return false;
  if (requiredShift !== event.shiftKey) return false;

  const eventKey = event.key.length === 1 ? event.key.toUpperCase() : event.key === " " ? "Space" : event.key;
  return eventKey.toLowerCase() === requiredKey.toLowerCase();
}

/**
 * Formats a canonical combo (e.g. Mod+K, Alt+ArrowDown) into human-friendly key segments.
 */
export function formatKeyComboForDisplay(
  combo: string,
  isMac = isMacPlatform()
): string[] {
  if (!combo) return [];
  const tokens = combo.split("+");
  return tokens.map((token) => {
    if (token === "Mod") return isMac ? "⌘" : "Ctrl";
    if (token === "Ctrl") return isMac ? "⌃" : "Ctrl";
    if (token === "Alt") return isMac ? "⌥" : "Alt";
    if (token === "Shift") return isMac ? "⇧" : "Shift";
    if (token === "Meta") return isMac ? "⌘" : "Win";
    if (token === "ArrowDown") return "↓";
    if (token === "ArrowUp") return "↑";
    if (token === "ArrowLeft") return "←";
    if (token === "ArrowRight") return "→";
    if (token === "Enter") return "↵";
    if (token === "Escape") return "Esc";
    return token;
  });
}

/**
 * Checks if a combo collides with any other configured shortcut.
 */
export function checkShortcutConflict(
  actionId: ShortcutActionId,
  combo: string,
  currentBindings: ShortcutBindings
): ShortcutActionId | null {
  for (const [id, boundCombo] of Object.entries(currentBindings)) {
    if (id !== actionId && boundCombo.toLowerCase() === combo.toLowerCase()) {
      return id as ShortcutActionId;
    }
  }
  return null;
}
