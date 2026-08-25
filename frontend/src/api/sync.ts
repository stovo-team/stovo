import { apiRequest } from "./client";

export type SyncEvent = {
  sequence: number;
  eventId: string;
  type: string;
  version: number;
  aggregateType: string;
  aggregateId: string;
  occurredAt: string;
  payload: unknown;
};

export type SyncPage = {
  events: SyncEvent[];
  nextCursor: string | null;
  hasMore: boolean;
};

export type GetSyncPageOptions = {
  cursor?: string | null;
  limit?: number;
};

const DEFAULT_SYNC_LIMIT = 200;
const MAX_SYNC_LIMIT = 500;

function normalizeLimit(limit: number | undefined): number {
  if (!Number.isFinite(limit)) return DEFAULT_SYNC_LIMIT;
  return Math.min(MAX_SYNC_LIMIT, Math.max(1, Math.trunc(limit as number)));
}

/** Fetches one ordered delta page. It is intentionally not wired into UI yet. */
export function getSyncPage(accessToken: string, options: GetSyncPageOptions = {}): Promise<SyncPage> {
  const params = new URLSearchParams({ limit: String(normalizeLimit(options.limit)) });
  const cursor = options.cursor?.trim();
  if (cursor) {
    params.set("cursor", cursor);
  }
  return apiRequest<SyncPage>(`/api/sync?${params.toString()}`, { accessToken });
}
