import type { Canvas, CanvasUpdate } from "../api/canvas";
import type { Chat } from "../api/chats";

let mockCanvases: Canvas[] = [];
let mockCanvasDocuments: Record<string, CanvasUpdate[]> = {};
let nextLocalCanvasId = 1;
const MOCK_CANVAS_STORAGE_KEY = "stovo.localMockCanvases";

export function persistMockCanvases(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      MOCK_CANVAS_STORAGE_KEY,
      JSON.stringify({ canvases: mockCanvases, documents: mockCanvasDocuments })
    );
  } catch {
    /* Canvas mock remains usable when browser storage is unavailable. */
  }
}

export function resetMockCanvases(familyId: string, createdBy: string, restorePersisted = true): void {
  const seededCanvases: Canvas[] = [
    {
      id: "mock-canvas-planning",
      familyId,
      originChatId: "chat-planning-team",
      createdBy,
      title: "Planning Notes",
      linkedChatIds: [],
      canManage: true,
      createdAt: "2026-10-10T09:00:00.000Z",
      updatedAt: "2026-10-10T09:00:00.000Z",
    },
  ];
  mockCanvases = seededCanvases;
  mockCanvasDocuments = { "mock-canvas-planning": [] };
  if (restorePersisted && typeof window !== "undefined") {
    try {
      const saved = window.localStorage.getItem(MOCK_CANVAS_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as { canvases?: unknown; documents?: unknown };
        if (
          Array.isArray(parsed.canvases) &&
          parsed.documents &&
          typeof parsed.documents === "object" &&
          !Array.isArray(parsed.documents)
        ) {
          mockCanvases = parsed.canvases as Canvas[];
          mockCanvasDocuments = parsed.documents as Record<string, CanvasUpdate[]>;
        }
      }
    } catch {
      /* Reset to the seeded canvas if local mock state is stale. */
    }
  }
  nextLocalCanvasId = mockCanvases.reduce((next, canvas) => {
    const match = /^mock-canvas-local-(\d+)$/u.exec(canvas.id);
    return match ? Math.max(next, Number(match[1]) + 1) : next;
  }, 1);
  persistMockCanvases();
}

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

function errorResponse(status: number, detail: string): Response {
  return jsonResponse({ detail }, status);
}

export async function handleMockCanvasRequest(
  path: string,
  method: string,
  getBody: () => Promise<Record<string, unknown>>,
  context: {
    chats: Chat[];
    familyId: string;
    userId: string;
  }
): Promise<Response | null> {
  const canvasRoot = "/api/v1/plugins/canvas/canvases";
  if (method === "GET" && path === canvasRoot) return jsonResponse(mockCanvases);
  if (method === "POST" && path === canvasRoot) {
    const body = await getBody();
    const chatId = typeof body.chatId === "string" ? body.chatId : "";
    const chat = context.chats.find((item) => item.id === chatId);
    if (!chat) return errorResponse(404, "Mock chat not found.");
    const now = new Date().toISOString();
    const id = `mock-canvas-local-${nextLocalCanvasId++}`;
    const canvas: Canvas = {
      id,
      familyId: context.familyId,
      originChatId: chatId,
      createdBy: context.userId,
      title: typeof body.title === "string" && body.title.trim() ? body.title.trim() : "Untitled canvas",
      linkedChatIds: [],
      canManage: true,
      createdAt: now,
      updatedAt: now,
    };
    const updates: CanvasUpdate[] =
      typeof body.initialUpdate === "string" && body.initialUpdate
        ? [{ sequence: 1, update: body.initialUpdate, createdBy: context.userId, createdAt: now }]
        : [];
    mockCanvases = [...mockCanvases, canvas];
    mockCanvasDocuments[id] = updates;
    persistMockCanvases();
    return jsonResponse(canvas, 201);
  }

  const canvasDocumentMatch = path.match(/^\/api\/v1\/plugins\/canvas\/canvases\/([^/]+)\/document$/);
  if (canvasDocumentMatch) {
    const canvasId = canvasDocumentMatch[1];
    if (!mockCanvases.some((item) => item.id === canvasId)) return errorResponse(404, "Mock canvas not found.");
    const updates = mockCanvasDocuments[canvasId] ?? [];
    if (method === "GET") return jsonResponse({ updates });
    if (method === "POST") {
      const body = await getBody();
      if (typeof body.update !== "string" || !body.update) return errorResponse(422, "Canvas update is required.");
      const update: CanvasUpdate = {
        sequence: updates.length + 1,
        update: body.update,
        createdBy: context.userId,
        createdAt: new Date().toISOString(),
      };
      mockCanvasDocuments[canvasId] = [...updates, update];
      mockCanvases = mockCanvases.map((canvas) =>
        canvas.id === canvasId ? { ...canvas, updatedAt: update.createdAt } : canvas
      );
      persistMockCanvases();
      return jsonResponse(update, 201);
    }
  }

  const canvasMatch = path.match(/^\/api\/v1\/plugins\/canvas\/canvases\/([^/]+)$/);
  if (canvasMatch) {
    const canvasId = canvasMatch[1];
    const canvas = mockCanvases.find((item) => item.id === canvasId);
    if (!canvas) return errorResponse(404, "Mock canvas not found.");
    if (method === "GET") return jsonResponse(canvas);
    if (method === "PATCH") {
      const body = await getBody();
      if (typeof body.title !== "string" || !body.title.trim()) return errorResponse(422, "Canvas title is required.");
      const renamed = { ...canvas, title: body.title.trim(), updatedAt: new Date().toISOString() };
      mockCanvases = mockCanvases.map((item) => (item.id === canvasId ? renamed : item));
      persistMockCanvases();
      return jsonResponse(renamed);
    }
  }

  return null;
}
