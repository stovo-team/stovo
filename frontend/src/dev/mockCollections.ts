import type { StorageCollection } from "../api/collections";
import { getMockFile, seedMockPreviewFiles } from "./mockFileStore";

const PREVIEW_FOLDER_ID = "mock-storage-preview-folder";
const PREVIEW_PDF_ID = "mock-storage-preview-report";
let folderHasPdf = true;

function getPreviewFolder(familyId: string, ownerId: string): StorageCollection {
  const timestamp = "2026-09-08T12:00:00.000Z";
  return {
    id: PREVIEW_FOLDER_ID,
    familyId,
    ownerId,
    title: "Storage preview folder",
    displayKind: "folder",
    contentType: "mixed",
    customFileTypes: "",
    coverFileId: folderHasPdf ? PREVIEW_PDF_ID : null,
    itemCount: folderHasPdf ? 1 : 0,
    accessLevel: "editor",
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export async function handleMockCollectionRequest(path: string, method: string, familyId: string, userId: string, scenario?: string): Promise<Response | null> {
  if (method === "GET" && path === "/api/collections") {
    await seedMockPreviewFiles(familyId, userId);
    if (scenario === "storage-empty") return jsonResponse([{ ...getPreviewFolder(familyId, userId), coverFileId: null, itemCount: 0 }]);
    return jsonResponse([getPreviewFolder(familyId, userId)]);
  }

  const itemsMatch = path.match(/^\/api\/collections\/([^/]+)\/items(?:\/([^/]+))?$/);
  if (itemsMatch?.[1] === PREVIEW_FOLDER_ID) {
    if (method === "GET" && !itemsMatch[2]) {
      if (scenario === "storage-empty") return jsonResponse([]);
      await seedMockPreviewFiles(familyId, userId);
      const file = folderHasPdf ? await getMockFile(PREVIEW_PDF_ID) : null;
      return jsonResponse(file ? [file] : []);
    }
    if (method === "DELETE" && itemsMatch[2] === PREVIEW_PDF_ID) {
      folderHasPdf = false;
      return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
    }
  }

  const grantsMatch = path.match(/^\/api\/collections\/([^/]+)\/grants$/);
  if (method === "GET" && grantsMatch?.[1] === PREVIEW_FOLDER_ID) return jsonResponse([]);
  return null;
}

export function resetMockCollections(): void {
  folderHasPdf = true;
}
