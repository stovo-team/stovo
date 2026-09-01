export interface ScreenConfig {
  chats: boolean;
  media_gallery: boolean;
  voice_rooms: boolean;
  game_activity: boolean;
  audit_logs: boolean;
  member_invites: boolean;
  sso_management: boolean;
}

export interface FeatureConfig {
  presence_detail_level: "basic" | "rich_game_status" | "working_hours";
  end_to_end_encryption: boolean;
  custom_emojis: boolean;
  file_upload_limit_mb: number;
  default_theme: "family_warm" | "gamer_dark" | "corporate_slate" | string;
  allow_public_invites: boolean;
  require_sso_auth: boolean;
}

export interface ServerManifest {
  profile: "family" | "gamer" | "corporate" | "custom";
  display_name: string;
  screens: ScreenConfig;
  features: FeatureConfig;
  active_plugins: string[];
}

export const defaultManifest: ServerManifest = {
  profile: "family",
  display_name: "Family Solution",
  screens: {
    chats: true,
    media_gallery: true,
    voice_rooms: true,
    game_activity: false,
    audit_logs: false,
    member_invites: true,
    sso_management: false,
  },
  features: {
    presence_detail_level: "basic",
    end_to_end_encryption: true,
    custom_emojis: true,
    file_upload_limit_mb: 100,
    default_theme: "family_warm",
    allow_public_invites: true,
    require_sso_auth: false,
  },
  active_plugins: ["plugin-system-welcome-bot", "plugin-theme-packs"],
};

let currentManifest: ServerManifest = { ...defaultManifest };

export function getActiveManifest(): ServerManifest {
  return currentManifest;
}

export function setActiveManifest(manifest: Partial<ServerManifest>): ServerManifest {
  currentManifest = {
    ...currentManifest,
    ...manifest,
    screens: { ...currentManifest.screens, ...(manifest.screens || {}) },
    features: { ...currentManifest.features, ...(manifest.features || {}) },
  };
  return currentManifest;
}

export async function fetchServerManifest(apiBaseUrl = ""): Promise<ServerManifest> {
  try {
    const res = await fetch(`${apiBaseUrl}/api/v1/config/manifest`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data: ServerManifest = await res.json();
    return setActiveManifest(data);
  } catch {
    return getActiveManifest();
  }
}
