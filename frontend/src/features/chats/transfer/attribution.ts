import type { ChatArchiveMessage } from "./archive";

export function importedSourceKind(metadata: unknown): string | undefined {
  if (typeof metadata !== "object" || metadata === null || Array.isArray(metadata)) return undefined;
  const kind = (metadata as Record<string, unknown>).sourceKind;
  return typeof kind === "string" && kind.trim() ? kind : undefined;
}

export function importedSourceReactions(value: unknown): ChatArchiveMessage["reactions"] {
  if (!Array.isArray(value)) return undefined;
  const reactions = value.flatMap((item) => {
    if (typeof item !== "object" || item === null || Array.isArray(item)) return [];
    const reaction = item as Record<string, unknown>;
    if (typeof reaction.emoji !== "string" || !reaction.emoji.trim()) return [];
    return [{
      emoji: reaction.emoji,
      participantIds: Array.isArray(reaction.participantIds) ? reaction.participantIds.filter((id): id is string => typeof id === "string") : []
    }];
  });
  return reactions.length ? reactions : undefined;
}
