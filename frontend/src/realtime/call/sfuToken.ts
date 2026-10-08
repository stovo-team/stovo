import { getApiUrl } from "../../api/client";

export async function getSfuToken(roomId: string, accessToken: string) {
  const response = await fetch(`${getApiUrl()}/api/calls/${roomId}/sfu-token`, {
    method: "POST",
    headers: { Accept: "application/json", Authorization: `Bearer ${accessToken}` },
    credentials: "include",
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(detail || `SFU token request failed (${response.status})`);
  }
  const payload = await response.json() as { url?: string; token?: string };
  if (!payload.url || !payload.token) throw new Error("SFU token response missing url/token");
  return { url: payload.url, token: payload.token };
}
