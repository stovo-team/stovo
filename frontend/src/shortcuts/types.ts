export type ShortcutActionId =
  // Global & Palette
  | "quick_switcher"
  | "shortcuts_help"
  | "toggle_theme"
  // Navigation
  | "nav_chats"
  | "nav_files"
  | "nav_plans"
  | "nav_settings"
  // Chat Navigation & Management
  | "next_chat"
  | "prev_chat"
  | "new_chat"
  | "search_messages"
  // Conversation & Composer
  | "focus_composer"
  | "toggle_details"
  | "attach_file"
  // Calling
  | "toggle_call"
  | "toggle_mute";

export type ShortcutCategory =
  | "general"
  | "navigation"
  | "chats"
  | "composer"
  | "calls";

export type ShortcutScope = "global" | "chat" | "composer";

export interface ShortcutDefinition {
  id: ShortcutActionId;
  category: ShortcutCategory;
  defaultBinding: string;
  scope: ShortcutScope;
}

export type ShortcutBindings = Record<ShortcutActionId, string>;

export interface CustomShortcutConflict {
  actionId: ShortcutActionId;
  conflictingActionId: ShortcutActionId;
  combo: string;
}
