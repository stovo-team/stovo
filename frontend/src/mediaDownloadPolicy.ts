import { APPEARANCE_STORAGE_KEY } from "./appearance/AppearanceContext";

const MIB = 1024 * 1024;
const DEFAULT_LIMIT_MB = 10;
const SUPPORTED_LIMITS = new Set([1, 5, 10, 25, 50]);

type StoredMediaPolicy = {
  autoDownloadMedia?: unknown;
  autoDownloadLimitMB?: unknown;
  autoDownloadWiFiOnly?: unknown;
};

type ResolvedMediaPolicy = {
  autoDownloadMedia: boolean;
  autoDownloadLimitMB: number;
  autoDownloadWiFiOnly: boolean;
};

type ConnectionInfo = {
  saveData?: boolean;
  type?: string;
  effectiveType?: string;
};

function readPolicy(): ResolvedMediaPolicy {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(APPEARANCE_STORAGE_KEY) ?? "{}") as StoredMediaPolicy;
    return {
      autoDownloadMedia: typeof parsed.autoDownloadMedia === "boolean" ? parsed.autoDownloadMedia : true,
      autoDownloadLimitMB: typeof parsed.autoDownloadLimitMB === "number" && SUPPORTED_LIMITS.has(parsed.autoDownloadLimitMB)
        ? parsed.autoDownloadLimitMB
        : DEFAULT_LIMIT_MB,
      autoDownloadWiFiOnly: typeof parsed.autoDownloadWiFiOnly === "boolean" ? parsed.autoDownloadWiFiOnly : false,
    };
  } catch {
    return { autoDownloadMedia: true, autoDownloadLimitMB: DEFAULT_LIMIT_MB, autoDownloadWiFiOnly: false };
  }
}

function isVerifiedUnmeteredConnection(): boolean {
  const connection = (navigator as Navigator & { connection?: ConnectionInfo }).connection;
  if (!connection) return false;
  if (connection.saveData) return false;
  const kind = (connection.type ?? connection.effectiveType ?? "").toLowerCase();
  return kind === "wifi" || kind === "ethernet";
}

/** Returns whether this attachment may be fetched without an explicit user action. */
export function shouldAutoDownloadMedia(file: { sizeBytes: number }): boolean {
  if (typeof navigator !== "undefined" && !navigator.onLine) return false;
  const policy = readPolicy();
  if (!policy.autoDownloadMedia) return false;
  if (!Number.isFinite(file.sizeBytes) || file.sizeBytes < 0 || file.sizeBytes > policy.autoDownloadLimitMB * MIB) return false;
  if (policy.autoDownloadWiFiOnly && !isVerifiedUnmeteredConnection()) return false;
  return true;
}
