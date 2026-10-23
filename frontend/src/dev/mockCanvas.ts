import { encodeMarkdownCanvasDocumentUpdate, type Canvas } from "../api/canvas";

const canvasId = "canvas-planning-notes";
const initialUpdate = encodeMarkdownCanvasDocumentUpdate("# Planning notes\n\nReview the checklist with the team.\n");

const updates = [initialUpdate];

/** Synthetic Canvas resources for manually inspecting the real editor. */
export function mockCanvasResponse(path: string, method: string, familyId: string, userId: string, body: Record<string, unknown>): Response {
  const canvas: Canvas = {
    id: canvasId, familyId, originChatId: "chat-planning-team", createdBy: userId,
    title: "Planning notes", linkedChatIds: ["chat-planning-team"], canManage: true,
    createdAt: "2026-10-20T10:00:00Z", updatedAt: "2026-10-20T10:00:00Z"
  };
  const root = "/api/v1/plugins/canvas/canvases";
  if (method === "POST" && path === `${root}/${canvasId}/document` && typeof body.update === "string") {
    updates.push(body.update);
    return new Response(JSON.stringify({ sequence: updates.length, update: body.update, createdBy: userId, createdAt: canvas.updatedAt }), { status: 201, headers: { "Content-Type": "application/json" } });
  }
  const payload = path === root ? [canvas] : path === `${root}/${canvasId}` ? canvas : path === `${root}/${canvasId}/document`
    ? { updates: updates.map((update, index) => ({ sequence: index + 1, update, createdBy: userId, createdAt: canvas.createdAt })) } : null;
  return new Response(JSON.stringify(method === "GET" && payload ? payload : { detail: "Unknown mock Canvas resource" }), {
    status: method === "GET" && payload ? 200 : 404,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }
  });
}
