import { DESIGN_COLOR_VALUES } from "../design-system/palette";

export type AvatarEntityKind = "person" | "family" | "group" | "archive" | "voice" | "channel" | "folder";
export const AVATAR_SYMBOL_IDS = [
  "initials", "user-round", "users", "home", "archive", "audio-lines", "megaphone", "folder",
  "heart", "star", "music", "book-open", "camera", "shield", "sparkles", "bell"
] as const;
export type AvatarSymbolId = typeof AVATAR_SYMBOL_IDS[number];

export const AVATAR_COLOR_IDS = Object.keys(DESIGN_COLOR_VALUES.avatarPalette) as Array<keyof typeof DESIGN_COLOR_VALUES.avatarPalette>;
export type AvatarColorId = typeof AVATAR_COLOR_IDS[number];

const defaultSymbols: Record<AvatarEntityKind, AvatarSymbolId> = {
  person: "initials", family: "home", group: "users", archive: "archive",
  voice: "audio-lines", channel: "megaphone", folder: "folder"
};

export function defaultAvatarSymbol(kind: AvatarEntityKind): AvatarSymbolId {
  return defaultSymbols[kind];
}

export function isKnownAvatarSymbolId(value: unknown): value is AvatarSymbolId {
  return typeof value === "string" && (AVATAR_SYMBOL_IDS as readonly string[]).includes(value);
}

export function isKnownAvatarColorId(value: unknown): value is AvatarColorId {
  return typeof value === "string" && (AVATAR_COLOR_IDS as readonly string[]).includes(value);
}

export function colorForAvatarId(id: string): AvatarColorId {
  let hash = 2166136261;
  for (let index = 0; index < id.length; index += 1) {
    hash ^= id.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return AVATAR_COLOR_IDS[(hash >>> 0) % AVATAR_COLOR_IDS.length];
}
