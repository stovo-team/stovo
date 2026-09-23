import { apiRequest } from "./client";

export interface UnfurlData {
  url: string;
  title?: string;
  description?: string;
  image?: string;
  siteName?: string;
  favicon?: string;
  mediaType?: string;
}

export async function fetchUnfurlData(
  targetUrl: string,
  accessToken: string | null,
  signal?: AbortSignal
): Promise<UnfurlData> {
  const endpoint = `/api/unfurl?url=${encodeURIComponent(targetUrl)}`;
  return apiRequest<UnfurlData>(endpoint, { accessToken, signal });
}
