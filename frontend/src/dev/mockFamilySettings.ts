import type { MockData } from "./mockFixtures";

/** Keep the synthetic appearance preference editable during manual previews. */
export function updateMockFamilySettings(data: MockData, method: string, body: Record<string, unknown>) {
  if (method === "PATCH" && typeof body.minimizedChatLayout === "boolean") {
    data.family = { ...data.family, minimizedChatLayout: body.minimizedChatLayout };
  }
  return data.family;
}
