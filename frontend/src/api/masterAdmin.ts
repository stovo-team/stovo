export interface NavTabsConfig {
  chats: boolean;
  storage: boolean;
  plans: boolean;
  settings: boolean;
}

export interface ChatTypesConfig {
  direct: boolean;
  group: boolean;
  channel: boolean;
  voice: boolean;
}

export interface TenantAiSettings {
  translationEnabled: boolean;
  callRecordingEnabled: boolean;
  aiNotesEnabled: boolean;
  voiceTranscriptionEnabled: boolean;
}

export interface ServerRecord {
  id: number;
  slug: string;
  name: string;
  created_at: string;
  status: string;
  nav_tabs?: NavTabsConfig;
  chat_types?: ChatTypesConfig;
}

export interface TenantCallQualitySettings {
  screenShareBitrateKbps: number;
}

export interface CreateServerResponse {
  id: number;
  slug: string;
  name: string;
  admin_user?: string;
  admin_password?: string;
  cluster_url?: string;
  invite_url: string;
  nav_tabs?: NavTabsConfig;
}

export function getMasterApiUrl(): string {
  if (typeof import.meta.env.VITE_MASTER_API_URL === "string" && import.meta.env.VITE_MASTER_API_URL.trim()) {
    return import.meta.env.VITE_MASTER_API_URL.trim().replace(/\/$/, "");
  }
  return "";
}

export async function masterLogin(username: string, password: string): Promise<string> {
  const masterUrl = getMasterApiUrl();
  const res = await fetch(`${masterUrl}/api/v1/master/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || err.message || "Login failed");
  }
  const data = await res.json();
  return data.access_token;
}

export async function fetchServers(token: string): Promise<ServerRecord[]> {
  const masterUrl = getMasterApiUrl();
  const res = await fetch(`${masterUrl}/api/v1/master/servers`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || err.message || "Failed to fetch spaces");
  }
  return res.json();
}

export async function fetchServerSettings(token: string, slug: string): Promise<ServerRecord> {
  const masterUrl = getMasterApiUrl();
  const res = await fetch(`${masterUrl}/api/v1/master/servers/${slug}/settings`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || err.message || "Failed to fetch space settings");
  }
  return res.json();
}

export async function updateServerSettings(
  token: string,
  slug: string,
  updates: { name?: string; nav_tabs?: Partial<NavTabsConfig>; chat_types?: ChatTypesConfig }
): Promise<ServerRecord> {
  const masterUrl = getMasterApiUrl();
  const res = await fetch(`${masterUrl}/api/v1/master/servers/${slug}/settings`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(updates),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || err.message || "Failed to update space settings");
  }
  return res.json();
}

export async function createServer(
  token: string,
  slug: string,
  name: string,
  adminUser?: string,
  adminPassword?: string,
  navTabs?: Partial<NavTabsConfig>
): Promise<CreateServerResponse> {
  const masterUrl = getMasterApiUrl();
  const res = await fetch(`${masterUrl}/api/v1/master/servers`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      slug,
      name,
      admin_user: adminUser,
      admin_password: adminPassword,
      nav_tabs: navTabs,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || err.message || "Failed to create space");
  }
  return res.json();
}

export async function deleteServer(token: string, slug: string): Promise<void> {
  const masterUrl = getMasterApiUrl();
  const res = await fetch(`${masterUrl}/api/v1/master/servers/${slug}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || err.message || "Failed to delete space");
  }
}

export async function getGhostToken(token: string, slug: string): Promise<string> {
  const masterUrl = getMasterApiUrl();
  const res = await fetch(`${masterUrl}/api/v1/master/servers/${slug}/ghost-token`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || err.message || "Failed to generate Ghost Token");
  }
  const data = await res.json();
  return data.ghost_token;
}

function tenantApiPath(slug: string) {
  return `${window.location.origin}/s/${encodeURIComponent(slug)}/api/family`;
}

export async function fetchTenantAiSettings(token: string, slug: string): Promise<TenantAiSettings> {
  const ghostToken = await getGhostToken(token, slug);
  const res = await fetch(tenantApiPath(slug), { headers: { Authorization: `Bearer ${ghostToken}` } });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || err.error || err.message || "Failed to fetch AI settings");
  }
  return res.json();
}

export async function updateTenantAiSettings(token: string, slug: string, settings: TenantAiSettings): Promise<TenantAiSettings> {
  const ghostToken = await getGhostToken(token, slug);
  const res = await fetch(tenantApiPath(slug), {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${ghostToken}` },
    body: JSON.stringify(settings),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || err.error || err.message || "Failed to save AI settings");
  }
  return res.json();
}

export async function fetchTenantCallQuality(token: string, slug: string): Promise<TenantCallQualitySettings> {
  const ghostToken = await getGhostToken(token, slug);
  const res = await fetch(tenantApiPath(slug), { headers: { Authorization: `Bearer ${ghostToken}` } });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || err.error || err.message || "Failed to fetch guest meeting quality settings");
  }
  return res.json();
}

export async function updateTenantCallQuality(token: string, slug: string, screenShareBitrateKbps: number): Promise<TenantCallQualitySettings> {
  const ghostToken = await getGhostToken(token, slug);
  const res = await fetch(tenantApiPath(slug), {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${ghostToken}` },
    body: JSON.stringify({ screenShareBitrateKbps }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || err.error || err.message || "Failed to save guest meeting quality settings");
  }
  return res.json();
}

export async function createInviteLink(token: string, slug: string): Promise<string> {
  const masterUrl = getMasterApiUrl();
  const res = await fetch(`${masterUrl}/api/v1/master/servers/${slug}/invite`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || err.message || "Failed to generate invite link");
  }
  const data = await res.json();
  return data.invite_url;
}
