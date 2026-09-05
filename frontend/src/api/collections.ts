import { apiRequest } from "./client";
import type { FamilyFile } from "./files";

export type CollectionKind = "folder" | "album" | "music-album";
export type CollectionContentType = "mixed" | "media" | "audio" | "documents" | "custom";
export type CollectionAccessLevel = "viewer" | "editor";

export interface StorageCollection {
  id: string;
  familyId: string;
  ownerId: string;
  title: string;
  displayKind: CollectionKind;
  contentType: CollectionContentType;
  customFileTypes: string;
  coverFileId: string | null;
  itemCount: number;
  accessLevel: CollectionAccessLevel;
  createdAt: string;
  updatedAt: string;
}

export interface CollectionGrant {
  principalType: "user" | "role";
  principalId: string;
  accessLevel: CollectionAccessLevel;
}

export function getCollections(accessToken: string) {
  return apiRequest<StorageCollection[]>("/api/collections", { accessToken });
}
export function createCollection(accessToken: string, payload: Pick<StorageCollection, "title" | "displayKind" | "contentType"> & { customFileTypes?: string; coverFileId?: string | null }) {
  return apiRequest<StorageCollection>("/api/collections", { method: "POST", accessToken, body: payload });
}
export function updateCollection(accessToken: string, id: string, payload: Partial<Pick<StorageCollection, "title" | "displayKind" | "contentType" | "customFileTypes" | "coverFileId">>) {
  return apiRequest<StorageCollection>(`/api/collections/${encodeURIComponent(id)}`, { method: "PATCH", accessToken, body: payload });
}
export function deleteCollection(accessToken: string, id: string) {
  return apiRequest<void>(`/api/collections/${encodeURIComponent(id)}`, { method: "DELETE", accessToken });
}
export function getCollectionItems(accessToken: string, id: string) {
  return apiRequest<FamilyFile[]>(`/api/collections/${encodeURIComponent(id)}/items`, { accessToken });
}
export function addCollectionItem(accessToken: string, id: string, fileId: string, makePrivate = false) {
  return apiRequest<FamilyFile>(`/api/collections/${encodeURIComponent(id)}/items`, { method: "POST", accessToken, body: { fileId, makePrivate } });
}
export function removeCollectionItem(accessToken: string, id: string, fileId: string) {
  return apiRequest<void>(`/api/collections/${encodeURIComponent(id)}/items/${encodeURIComponent(fileId)}`, { method: "DELETE", accessToken });
}
export function getCollectionGrants(accessToken: string, id: string) {
  return apiRequest<CollectionGrant[]>(`/api/collections/${encodeURIComponent(id)}/grants`, { accessToken });
}
export function saveCollectionGrant(accessToken: string, id: string, grant: CollectionGrant) {
  return apiRequest<CollectionGrant>(`/api/collections/${encodeURIComponent(id)}/grants`, { method: "PUT", accessToken, body: grant });
}
export function deleteCollectionGrant(accessToken: string, id: string, grant: Pick<CollectionGrant, "principalType" | "principalId">) {
  return apiRequest<void>(`/api/collections/${encodeURIComponent(id)}/grants/${grant.principalType}/${encodeURIComponent(grant.principalId)}`, { method: "DELETE", accessToken });
}
