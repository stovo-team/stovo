import { apiRequest } from "./client";

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

export function createCanvas(accessToken: string, chatId: string, title = "Untitled canvas") {
  return apiRequest<Canvas>(`${root}/canvases`, { method: "POST", accessToken, body: { chatId, title } });
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
