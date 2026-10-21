import * as Y from "yjs";
import { appendCanvasDocumentUpdate, createCanvas, type Canvas } from "../../api/canvas";
import type { Chat } from "../../api/chats";
import { getApiUrl } from "../../api/client";
import { createClientMessageId } from "./shared/messageState";

type StoredDraft = { canvas: Canvas; ownerId: string; update: string; serverCanvas: Canvas | null };
export type CanvasDraft = {
  canvas: Canvas; ownerId: string; document: Y.Doc; serverCanvas: Canvas | null;
  error: string | null; creating: boolean; released: boolean; apiBaseUrl: string; listeners: Set<() => void>; storageKey: string;
};
const drafts = new Map<string, CanvasDraft>();
const serverDrafts = new Map<string, CanvasDraft>();
const prefix = (ownerId: string) => `stovo:canvas-draft:${encodeURIComponent(getApiUrl())}:${encodeURIComponent(ownerId)}:`;
const keyFor = (id: string, ownerId: string) => `${prefix(ownerId)}${id}`;
export function encodeCanvasDraft(document: Y.Doc) {
  return btoa(Array.from(Y.encodeStateAsUpdate(document), (byte) => String.fromCharCode(byte)).join(""));
}
function persist(draft: CanvasDraft) {
  if (draft.released) return;
  try {
    sessionStorage.setItem(draft.storageKey, JSON.stringify({ canvas: draft.canvas, ownerId: draft.ownerId, update: encodeCanvasDraft(draft.document), serverCanvas: draft.serverCanvas } satisfies StoredDraft));
  } catch { /* The in-memory draft remains usable when browser storage is unavailable. */ }
}
function notify(draft: CanvasDraft) {
  persist(draft);
  draft.listeners.forEach((listener) => listener());
}
function register(stored: StoredDraft): CanvasDraft {
  const document = new Y.Doc();
  Y.applyUpdate(document, Uint8Array.from(atob(stored.update), (char) => char.charCodeAt(0)));
  const draft: CanvasDraft = { ...stored, document, error: null, creating: false, released: false, apiBaseUrl: getApiUrl(), listeners: new Set(), storageKey: keyFor(stored.canvas.id, stored.ownerId) };
  document.on("update", () => persist(draft));
  drafts.set(draft.storageKey, draft);
  if (draft.serverCanvas) serverDrafts.set(keyFor(draft.serverCanvas.id, draft.ownerId), draft);
  return draft;
}
export function getCanvasDraft(id: string, ownerId: string): CanvasDraft | undefined {
  if (!id.startsWith("draft-")) return undefined;
  const key = keyFor(id, ownerId);
  const existing = drafts.get(key);
  if (existing) return existing;
  try {
    const stored = JSON.parse(sessionStorage.getItem(key) ?? "null") as StoredDraft | null;
    if (!stored || stored.ownerId !== ownerId || stored.canvas.id !== id) return undefined;
    const restored = register(stored);
    if (!restored.serverCanvas) restored.error = "Canvas creation was interrupted. Retry to save this draft.";
    return restored;
  } catch { return undefined; }
}
export function subscribeCanvasDraft(draft: CanvasDraft, listener: () => void) {
  draft.listeners.add(listener);
  return () => { draft.listeners.delete(listener); };
}
export function retryCanvasDraft(draft: CanvasDraft, accessToken: string) {
  if (draft.creating || draft.serverCanvas) return;
  draft.creating = true;
  draft.error = null;
  notify(draft);
  void createCanvas(accessToken, draft.canvas.originChatId, draft.canvas.title, encodeCanvasDraft(draft.document), draft.canvas.id.slice("draft-".length), draft.apiBaseUrl).then(async (serverCanvas) => {
    draft.serverCanvas = serverCanvas;
    serverDrafts.set(`${draft.storageKey.slice(0, -draft.canvas.id.length)}${serverCanvas.id}`, draft);
    // Edits made while POST was pending are saved independently of the page lifecycle.
    const update = encodeCanvasDraft(draft.document);
    notify(draft);
    try { await appendCanvasDocumentUpdate(accessToken, serverCanvas.id, update, draft.apiBaseUrl); }
    catch (cause) { draft.error = cause instanceof Error ? cause.message : "Could not save Canvas changes"; }
  }).catch((cause: unknown) => {
    draft.error = cause instanceof Error ? cause.message : "Could not create Canvas";
  }).finally(() => { draft.creating = false; notify(draft); });
}
export function createCanvasDraft(accessToken: string, chat: Pick<Chat, "id" | "familyId">, ownerId: string) {
  const id = `draft-${createClientMessageId()}`;
  const document = new Y.Doc();
  const block = new Y.Map<unknown>();
  block.set("id", createClientMessageId()); block.set("kind", "markdown"); block.set("content", new Y.Text("# Untitled canvas\n\n"));
  document.getArray("blocks").push([block]);
  const now = new Date().toISOString();
  const draft = register({ ownerId, canvas: { id, familyId: chat.familyId, originChatId: chat.id, createdBy: ownerId, title: "Untitled canvas", linkedChatIds: [chat.id], canManage: false, createdAt: now, updatedAt: now }, update: encodeCanvasDraft(document), serverCanvas: null });
  document.destroy();
  retryCanvasDraft(draft, accessToken);
  return draft;
}
/** Transfer the latest local state into the canonical route without waiting for its GETs. */
export function consumeCanvasDraft(id: string, ownerId: string) {
  let draft = serverDrafts.get(keyFor(id, ownerId));
  if (!draft) {
    try {
      for (const key of Object.keys(sessionStorage)) {
        if (!key.startsWith(prefix(ownerId))) continue;
        const stored = JSON.parse(sessionStorage.getItem(key) ?? "null") as StoredDraft | null;
        if (stored?.serverCanvas?.id === id) { draft = register(stored); break; }
      }
    } catch { /* Browser storage can be unavailable. */ }
  }
  if (!draft?.serverCanvas) return null;
  const update = encodeCanvasDraft(draft.document);
  const metadata = draft.serverCanvas;
  const storageKey = draft.storageKey;
  drafts.delete(storageKey); serverDrafts.delete(keyFor(id, ownerId));
  // Keep a recovery snapshot until the canonical editor confirms persistence.
  persist(draft);
  draft.released = true;
  draft.document.destroy();
  const recovery: StoredDraft = { canvas: draft.canvas, ownerId, serverCanvas: metadata, update };
  return { canvas: metadata, update,
    retain: (document: Y.Doc) => {
      recovery.update = encodeCanvasDraft(document);
      try { sessionStorage.setItem(storageKey, JSON.stringify(recovery)); } catch { /* in-memory editor remains live */ }
    },
    acknowledge: (expected: string) => {
      try {
        const stored = JSON.parse(sessionStorage.getItem(storageKey) ?? "null") as StoredDraft | null;
        if (stored?.update === expected) sessionStorage.removeItem(storageKey);
      } catch { /* best effort */ }
    }
  };
}
