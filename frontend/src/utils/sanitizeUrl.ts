/**
 * Sanitizes URLs intended for HTML href and src attributes to prevent DOM-based XSS.
 * Rejects javascript:, vbscript:, and non-image data: protocols.
 */
export function sanitizeUrl(url: string | null | undefined, fallback: string = ""): string {
  if (!url || typeof url !== "string") {
    return fallback;
  }
  const trimmed = url.trim();
  if (!trimmed) {
    return fallback;
  }

  // Reject dangerous protocols
  if (/^(javascript|vbscript):/i.test(trimmed)) {
    return fallback;
  }

  // Restrict data: to safe raster/vector image formats
  if (/^data:/i.test(trimmed)) {
    if (/^data:image\/(png|jpe?g|gif|webp|svg\+xml);base64,/i.test(trimmed)) {
      return trimmed;
    }
    return fallback;
  }

  // Allow blob: URLs and relative paths
  if (trimmed.startsWith("blob:") || trimmed.startsWith("/") || trimmed.startsWith("./")) {
    return trimmed;
  }

  try {
    const parsed = new URL(trimmed, typeof window !== "undefined" ? window.location?.origin : "http://localhost");
    if (parsed.protocol === "http:" || parsed.protocol === "https:" || parsed.protocol === "blob:") {
      return trimmed;
    }
  } catch {
    return fallback;
  }

  return fallback;
}
