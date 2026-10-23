import type { Message } from "../../../api/chats";
import { mergeMessageLists } from "../shared/messageState";

/** Disk snapshots may finish after a local send or a fresh root-count update. */
export function mergeHydratedMessageHistory(current: Message[], cached: Message[]): Message[] {
  const liveIds = new Set(current.map((message) => message.id));
  return mergeMessageLists(current, cached.filter((message) => !liveIds.has(message.id)));
}
