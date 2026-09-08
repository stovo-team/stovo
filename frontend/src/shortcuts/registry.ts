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
    defaultBinding: "Mod+Alt+K",
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
    defaultBinding: "Mod+Alt+T",
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
    defaultBinding: "Alt+N",
    scope: "global"
  },
  {
    id: "search_messages",
    category: "chats",
    defaultBinding: "Mod+Alt+F",
    scope: "global"
  },
  // Conversation & Composer
  {
    id: "focus_composer",
    category: "composer",
    defaultBinding: "Alt+C",
    scope: "global"
  },
  {
    id: "toggle_details",
    category: "chats",
    defaultBinding: "Mod+Alt+I",
    scope: "global"
  },
  {
    id: "attach_file",
    category: "composer",
    defaultBinding: "Mod+Alt+U",
    scope: "global"
  },
  // Calling
  {
    id: "toggle_call",
    category: "calls",
    defaultBinding: "Mod+Alt+C",
    scope: "global"
  },
  {
    id: "toggle_mute",
    category: "calls",
    defaultBinding: "Mod+Alt+M",
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

/**
 * Standard browser shortcuts that interfere with browser behavior or cannot be
 * reliably overridden across Chrome, Firefox, Edge, and Safari.
 */
const BROWSER_RESERVED_SHORTCUTS: Record<string, string> = {
  "mod+t": "New tab",
  "ctrl+t": "New tab",
  "meta+t": "New tab",
  "mod+w": "Close tab",
  "ctrl+w": "Close tab",
  "meta+w": "Close tab",
  "mod+shift+t": "Reopen closed tab",
  "ctrl+shift+t": "Reopen closed tab",
  "meta+shift+t": "Reopen closed tab",
  "mod+shift+w": "Close window",
  "ctrl+shift+w": "Close window",
  "meta+shift+w": "Close window",
  "mod+n": "New browser window",
  "ctrl+n": "New browser window",
  "meta+n": "New browser window",
  "mod+shift+n": "New incognito window",
  "ctrl+shift+n": "New incognito window",
  "meta+shift+n": "New incognito window",
  "mod+l": "Focus address bar",
  "ctrl+l": "Focus address bar",
  "meta+l": "Focus address bar",
  "mod+k": "Search address bar",
  "ctrl+k": "Search address bar",
  "meta+k": "Search address bar",
  "mod+e": "Search address bar",
  "ctrl+e": "Search address bar",
  "alt+d": "Focus address bar",
  "mod+r": "Reload page",
  "ctrl+r": "Reload page",
  "meta+r": "Reload page",
  "mod+shift+r": "Hard reload page",
  "ctrl+shift+r": "Hard reload page",
  "meta+shift+r": "Hard reload page",
  "mod+p": "Print",
  "ctrl+p": "Print",
  "meta+p": "Print",
  "mod+s": "Save page",
  "ctrl+s": "Save page",
  "meta+s": "Save page",
  "mod+o": "Open file",
  "ctrl+o": "Open file",
  "meta+o": "Open file",
  "mod+u": "View page source",
  "ctrl+u": "View page source",
  "meta+u": "View page source",
  "mod+shift+u": "Read aloud",
  "ctrl+shift+u": "Read aloud",
  "meta+shift+u": "Read aloud",
  "mod+d": "Bookmark page",
  "ctrl+d": "Bookmark page",
  "meta+d": "Bookmark page",
  "mod+shift+d": "Bookmark all tabs",
  "ctrl+shift+d": "Bookmark all tabs",
  "meta+shift+d": "Bookmark all tabs",
  "mod+shift+b": "Toggle bookmarks bar",
  "ctrl+shift+b": "Toggle bookmarks bar",
  "meta+shift+b": "Toggle bookmarks bar",
  "mod+shift+o": "Bookmark manager",
  "ctrl+shift+o": "Bookmark manager",
  "meta+shift+o": "Bookmark manager",
  "mod+shift+c": "Inspect element",
  "ctrl+shift+c": "Inspect element",
  "meta+shift+c": "Inspect element",
  "mod+shift+i": "Developer tools",
  "ctrl+shift+i": "Developer tools",
  "meta+shift+i": "Developer tools",
  "mod+shift+j": "Developer console",
  "ctrl+shift+j": "Developer console",
  "meta+shift+j": "Developer console",
  "mod+shift+m": "Toggle device mode",
  "ctrl+shift+m": "Toggle device mode",
  "meta+shift+m": "Toggle device mode",
  "mod+shift+a": "Search tabs",
  "ctrl+shift+a": "Search tabs",
  "meta+shift+a": "Search tabs",
  "mod+h": "Browser history",
  "ctrl+h": "Browser history",
  "mod+j": "Downloads",
  "ctrl+j": "Downloads",
  "mod+f": "Find in page",
  "ctrl+f": "Find in page",
  "meta+f": "Find in page",
  "mod+g": "Find next",
  "ctrl+g": "Find next",
  "meta+g": "Find next",
  "mod+shift+g": "Find previous",
  "ctrl+shift+g": "Find previous",
  "meta+shift+g": "Find previous",
  "alt+arrowleft": "History back",
  "alt+left": "History back",
  "alt+arrowright": "History forward",
  "alt+right": "History forward",
  "alt+home": "Browser homepage"
};

for (let i = 1; i <= 9; i++) {
  BROWSER_RESERVED_SHORTCUTS[`ctrl+${i}`] = `Switch to tab ${i}`;
  BROWSER_RESERVED_SHORTCUTS[`meta+${i}`] = `Switch to tab ${i}`;
  BROWSER_RESERVED_SHORTCUTS[`mod+${i}`] = `Switch to tab ${i}`;
}

/**
 * Checks if a key combination collides with a standard browser shortcut.
 * Returns human-readable description of browser action if conflict exists, or null.
 */
export function getBrowserShortcutConflict(combo: string): string | null {
  if (!combo) return null;
  const normalized = combo.trim().toLowerCase();
  return BROWSER_RESERVED_SHORTCUTS[normalized] || null;
}
