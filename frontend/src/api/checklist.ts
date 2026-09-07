import { apiRequest } from "./client";

export interface ChecklistItem {
  id: string;
  checklistId: string;
  text: string;
  completed: boolean;
  position: number;
  section?: string;
  createdBy: string;
  completedBy?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export interface ChecklistCard {
  id: string;
  title: string;
  category: "grocery" | "errand" | "general" | string;
  available: boolean;
  items: ChecklistItem[];
  totalItems: number;
  completedItems: number;
  canManage: boolean;
}

export interface Checklist {
  id: string;
  familyId: string;
  originChatId: string;
  createdBy: string;
  title: string;
  category: "grocery" | "errand" | "general" | string;
  linkedChatIds: string[];
  canManage: boolean;
  items: ChecklistItem[];
  totalItems: number;
  completedItems: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateChecklistItemPayload {
  text: string;
  section?: string;
}

export interface CreateChecklistPayload {
  chatId: string;
  title?: string;
  category?: "grocery" | "errand" | "general" | string;
  items?: CreateChecklistItemPayload[];
}

export interface BatchChecklistItemInput {
  id?: string;
  text: string;
  completed: boolean;
  position: number;
  section?: string;
}

const root = "/api/v1/plugins/checklist";

export function createChecklist(accessToken: string, payload: CreateChecklistPayload) {
  return apiRequest<Checklist>(`${root}/checklists`, {
    method: "POST",
    accessToken,
    body: payload
  });
}

export function getChecklistsForChat(accessToken: string, chatId: string) {
  return apiRequest<Checklist[]>(`${root}/chats/${encodeURIComponent(chatId)}`, { accessToken });
}

export function getStorageChecklists(accessToken: string) {
  return apiRequest<Checklist[]>(`${root}/checklists`, { accessToken });
}

export function getChecklist(accessToken: string, checklistId: string) {
  return apiRequest<Checklist>(`${root}/checklists/${encodeURIComponent(checklistId)}`, { accessToken });
}

export function renameChecklist(accessToken: string, checklistId: string, title: string, category?: string) {
  return apiRequest<Checklist>(`${root}/checklists/${encodeURIComponent(checklistId)}`, {
    method: "PATCH",
    accessToken,
    body: { title, category }
  });
}

export function deleteChecklist(accessToken: string, checklistId: string) {
  return apiRequest<void>(`${root}/checklists/${encodeURIComponent(checklistId)}`, {
    method: "DELETE",
    accessToken
  });
}

export function addChecklistItem(accessToken: string, checklistId: string, item: CreateChecklistItemPayload) {
  return apiRequest<ChecklistItem>(`${root}/checklists/${encodeURIComponent(checklistId)}/items`, {
    method: "POST",
    accessToken,
    body: item
  });
}

export function toggleChecklistItem(accessToken: string, checklistId: string, itemId: string) {
  return apiRequest<ChecklistItem>(`${root}/checklists/${encodeURIComponent(checklistId)}/items/${encodeURIComponent(itemId)}/toggle`, {
    method: "POST",
    accessToken
  });
}

export function updateChecklistItem(
  accessToken: string,
  checklistId: string,
  itemId: string,
  update: { text?: string; completed?: boolean; section?: string; position?: number }
) {
  return apiRequest<ChecklistItem>(`${root}/checklists/${encodeURIComponent(checklistId)}/items/${encodeURIComponent(itemId)}`, {
    method: "PATCH",
    accessToken,
    body: update
  });
}

export function deleteChecklistItem(accessToken: string, checklistId: string, itemId: string) {
  return apiRequest<void>(`${root}/checklists/${encodeURIComponent(checklistId)}/items/${encodeURIComponent(itemId)}`, {
    method: "DELETE",
    accessToken
  });
}

export function batchSyncChecklistItems(accessToken: string, checklistId: string, items: BatchChecklistItemInput[]) {
  return apiRequest<Checklist>(`${root}/checklists/${encodeURIComponent(checklistId)}/items`, {
    method: "PUT",
    accessToken,
    body: { items }
  });
}

export function linkChecklist(accessToken: string, checklistId: string, chatId: string) {
  return apiRequest<Checklist>(`${root}/checklists/${encodeURIComponent(checklistId)}/links`, {
    method: "POST",
    accessToken,
    body: { chatId }
  });
}

export function unlinkChecklist(accessToken: string, checklistId: string, chatId: string) {
  return apiRequest<void>(`${root}/checklists/${encodeURIComponent(checklistId)}/links/${encodeURIComponent(chatId)}`, {
    method: "DELETE",
    accessToken
  });
}
