import type { MockData } from "./mockFixtures";

export function mockChatDetailsResponse(data: MockData, chatId: string, userId: string, method: string, body: Record<string, unknown>): Response {
  const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
  const chat = data.chats.find((item) => item.id === chatId);
  if (!chat) return json({ detail: "Mock chat not found." }, 404);
  if (method === "PATCH") {
    const user = data.users.find((item) => item.id === userId);
    if (chat.type === "direct" || (user?.role !== "owner" && user?.role !== "admin" && chat.createdBy !== userId)) return json({ detail: "Not allowed to manage this chat." }, 403);
    if (body.avatarMode === "photo" || body.avatarMode === "symbol") chat.avatarMode = body.avatarMode;
    if (typeof body.avatarSymbolId === "string") chat.avatarSymbolId = body.avatarSymbolId;
    if (typeof body.avatarColorId === "string") chat.avatarColorId = body.avatarColorId;
    if (typeof body.title === "string") chat.title = body.title;
  }
  return json(chat);
}
