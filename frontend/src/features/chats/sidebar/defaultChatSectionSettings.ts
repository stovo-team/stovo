import type { ChatSectionKey } from "../shared/types";

export type DefaultChatSectionNames = Partial<Record<ChatSectionKey, string>>;

const sectionKeys: ChatSectionKey[] = ["archive", "groups", "dms", "channels", "voice"];

function storageKey(familyId: string) {
  return `stovo:default-chat-section-names:${familyId}`;
}

export function loadDefaultChatSectionNames(familyId: string): DefaultChatSectionNames {
  if (typeof window === "undefined" || !familyId) return {};
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(storageKey(familyId)) ?? "{}");
    if (!value || typeof value !== "object") return {};
    return sectionKeys.reduce<DefaultChatSectionNames>((names, key) => {
      const name = (value as Record<string, unknown>)[key];
      if (typeof name === "string" && name.trim()) names[key] = name.trim();
      return names;
    }, {});
  } catch {
    return {};
  }
}

export function saveDefaultChatSectionNames(familyId: string, names: DefaultChatSectionNames) {
  if (typeof window === "undefined" || !familyId) return;
  window.localStorage.setItem(storageKey(familyId), JSON.stringify(names));
}
