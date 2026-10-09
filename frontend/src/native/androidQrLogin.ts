export interface AndroidLoginQR {
  apiUrl: string;
  requestId: string;
}

export function parseAndroidLoginQR(value: string): AndroidLoginQR {
  const invalid = () => new Error("Invalid desktop sign-in QR code");
  let qr: URL;
  try { qr = new URL(value); } catch { throw invalid(); }
  if (qr.protocol !== "stovo:" || qr.host !== "auth" || qr.pathname !== "/android-login" ||
      qr.username || qr.password || qr.hash || qr.searchParams.get("version") !== "1" ||
      ["version", "apiUrl", "code"].some(key => qr.searchParams.getAll(key).length !== 1) ||
      [...qr.searchParams.keys()].some(key => !["version", "apiUrl", "code"].includes(key))) {
    throw invalid();
  }
  const requestId = qr.searchParams.get("code")!;
  // The server emits 32 random bytes encoded as unpadded base64url.
  if (!/^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/.test(requestId)) throw invalid();
  let api: URL;
  try { api = new URL(qr.searchParams.get("apiUrl")!); } catch { throw invalid(); }
  const localhost = ["localhost", "127.0.0.1", "[::1]"].includes(api.hostname);
  if (api.username || api.password || (api.protocol !== "https:" && !(api.protocol === "http:" && localhost))) {
    throw invalid();
  }
  api.hash = "";
  api.search = "";
  return { apiUrl: api.toString().replace(/\/$/, ""), requestId };
}
