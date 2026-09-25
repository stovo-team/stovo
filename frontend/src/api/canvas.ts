import { apiRequest } from "./client";
import * as Y from "yjs";

export type CanvasBlockType = "markdown" | "whiteboard";

export interface Canvas {
  id: string;
  familyId: string;
  originChatId: string;
  createdBy: string;
  title: string;
  linkedChatIds: string[];
  canManage: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CanvasReference {
  id: string;
  title: string;
  available: boolean;
}

export interface CanvasUpdate {
  sequence: number;
  update: string;
  createdBy: string;
  createdAt: string;
}

const root = "/api/v1/plugins/canvas";

function createCanvasBlockId(): string {
  const cryptoApi = globalThis.crypto;
  if (typeof cryptoApi?.randomUUID === "function") return cryptoApi.randomUUID();

  // randomUUID is restricted to secure contexts, but getRandomValues also
  // works on the plain HTTP LAN origins used by some self-hosted deployments.
  const bytes = new Uint8Array(16);
  if (typeof cryptoApi?.getRandomValues === "function") cryptoApi.getRandomValues(bytes);
  else bytes.forEach((_, index) => { bytes[index] = Math.floor(Math.random() * 256); });
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`;
}

export function createCanvas(accessToken: string, chatId: string, title = "Untitled canvas", initialUpdate?: string) {
  return apiRequest<Canvas>(`${root}/canvases`, {
    method: "POST",
    accessToken,
    body: { chatId, title, ...(initialUpdate ? { initialUpdate } : {}) },
  });
}

/** Encode the initial Markdown block in the same Yjs document shape used by CanvasPage. */
export function encodeMarkdownCanvasDocumentUpdate(markdown: string): string {
  const doc = new Y.Doc();
  const block = new Y.Map<unknown>();
  block.set("id", createCanvasBlockId());
  block.set("kind", "markdown");
  block.set("content", new Y.Text(markdown));
  doc.getArray<Y.Map<unknown>>("blocks").push([block]);
  const update = Y.encodeStateAsUpdate(doc);
  let binary = "";
  update.forEach((byte) => { binary += String.fromCharCode(byte); });
  doc.destroy();
  return btoa(binary);
}
export function getStorageCanvases(accessToken: string) {
  return apiRequest<Canvas[]>(`${root}/canvases`, { accessToken });
}
export function getCanvas(accessToken: string, canvasId: string) {
  return apiRequest<Canvas>(`${root}/canvases/${encodeURIComponent(canvasId)}`, { accessToken });
}
export function getCanvasDocument(accessToken: string, canvasId: string) {
  return apiRequest<{ updates: CanvasUpdate[] }>(`${root}/canvases/${encodeURIComponent(canvasId)}/document`, { accessToken });
}
export function appendCanvasDocumentUpdate(accessToken: string, canvasId: string, update: string) {
  return apiRequest<CanvasUpdate>(`${root}/canvases/${encodeURIComponent(canvasId)}/document`, { method: "POST", accessToken, body: { update } });
}
export function renameCanvas(accessToken: string, canvasId: string, title: string) {
  return apiRequest<Canvas>(`${root}/canvases/${encodeURIComponent(canvasId)}`, { method: "PATCH", accessToken, body: { title } });
}
export function deleteCanvas(accessToken: string, canvasId: string) {
  return apiRequest<void>(`${root}/canvases/${encodeURIComponent(canvasId)}`, { method: "DELETE", accessToken });
}
export function linkCanvas(accessToken: string, canvasId: string, chatId: string) {
  return apiRequest<Canvas>(`${root}/canvases/${encodeURIComponent(canvasId)}/links`, { method: "POST", accessToken, body: { chatId } });
}
export function unlinkCanvas(accessToken: string, canvasId: string, chatId: string) {
  return apiRequest<void>(`${root}/canvases/${encodeURIComponent(canvasId)}/links/${encodeURIComponent(chatId)}`, { method: "DELETE", accessToken });
}
