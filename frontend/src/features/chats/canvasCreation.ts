import type { NavigateFunction } from "react-router-dom";
import type { Chat } from "../../api/chats";
import { createCanvasDraft } from "./canvasDrafts";
import { getClusterPrefix } from "../../api/client";

/** Create a Canvas from the chat attachment menu. */
export function createCanvasAndOpen(accessToken: string, chat: Pick<Chat, "id" | "familyId">, ownerId: string, navigate: NavigateFunction) {
  const draft = createCanvasDraft(accessToken, chat, ownerId);
  navigate(`${getClusterPrefix()}/app/canvas/${encodeURIComponent(draft.canvas.id)}`);
}
