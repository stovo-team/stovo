import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError, getApiUrl } from "./client";
import {
  completeDirectFileUpload,
  createDirectFileAccess,
  createMediaPlaybackToken,
  getDirectFileUpload,
  getMediaPlaybackUrl,
  reserveDirectFileUpload,
  uploadFile,
} from "./files";

describe("media playback file API", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("requests a scoped playback token with an authenticated POST", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ token: "scoped-token", expiresAt: "2026-07-24T08:00:00Z" }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      })
    );

    await expect(createMediaPlaybackToken("access-token", "file/with%opaque value")).resolves.toEqual({
      token: "scoped-token",
      expiresAt: "2026-07-24T08:00:00Z"
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [target, init] = fetchMock.mock.calls[0];
    expect(target).toBe(`${getApiUrl()}/api/files/file%2Fwith%25opaque%20value/playback-token`);
    expect(init?.method).toBe("POST");
    expect(init?.credentials).toBe("include");
    const headers = new Headers(init?.headers);
    expect(headers.get("Authorization")).toBe("Bearer access-token");
    expect(headers.get("Accept")).toBe("application/json");
  });

  it.each([
    "file/part",
    "file%2Fpart",
    " file name ",
    "музыка/一",
    "file?token=must-not-be-query"
  ])("constructs one credential-free encoded media segment for %s", (fileId) => {
    const target = getMediaPlaybackUrl(fileId);
    expect(target).toBe(`${getApiUrl()}/api/media/${encodeURIComponent(fileId)}`);
    const parsed = new URL(target);
    expect(parsed.search).toBe("");
    expect(parsed.pathname).toBe(`/api/media/${encodeURIComponent(fileId)}`);
  });

  it("preserves shared ApiError behavior without putting credentials in the URL", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ detail: "File not found" }), {
        status: 404,
        statusText: "Not Found",
        headers: { "Content-Type": "application/json" }
      })
    );

    const error = await createMediaPlaybackToken("access-secret", "file?playback=secret").catch(
      (reason: unknown) => reason
    );
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 404,
      detail: "File not found"
    });

    const [target] = fetchMock.mock.calls[0];
    expect(String(target)).toBe(`${getApiUrl()}/api/files/file%3Fplayback%3Dsecret/playback-token`);
    expect(String(target)).not.toContain("access-secret");
    expect(new URL(String(target)).search).toBe("");
  });
});

describe("direct media file API", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reserves an upload with a stable idempotency key", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({
        uploadId: "upload-1",
        fileId: "file-1",
        state: "reserved",
        uploadUrl: "https://media.example/upload",
        expectedMimeType: "image/jpeg",
        expectedSizeBytes: 123,
      }), { status: 200, headers: { "Content-Type": "application/json" } }),
    );

    await reserveDirectFileUpload("access-token", {
      originalName: "photo.jpg",
      mimeType: "image/jpeg",
      sizeBytes: 123,
      checksum: "a".repeat(64),
      chatId: "chat-1",
    }, "operation-1");

    const [target, init] = fetchMock.mock.calls[0];
    expect(target).toBe(`${getApiUrl()}/api/files/uploads`);
    expect(init?.method).toBe("POST");
    const headers = new Headers(init?.headers);
    expect(headers.get("Authorization")).toBe("Bearer access-token");
    expect(headers.get("Idempotency-Key")).toBe("operation-1");
    expect(JSON.parse(String(init?.body))).toMatchObject({ originalName: "photo.jpg", chatId: "chat-1" });
  });

  it("encodes complete/access IDs and keeps credentials out of URLs", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({
        uploadId: "upload/one",
        fileId: "file-1",
        state: "validating",
        expectedMimeType: "audio/mpeg",
        expectedSizeBytes: 3,
      }), { status: 202, headers: { "Content-Type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        fileId: "file/one",
        url: "https://media.example/signed",
        expiresAt: "2026-08-25T00:00:00Z",
        mimeType: "audio/mpeg",
        sizeBytes: 3,
      }), { status: 200, headers: { "Content-Type": "application/json" } }));

    await completeDirectFileUpload("access-secret", "upload/one", "complete-1");
    await createDirectFileAccess("access-secret", "file/one");

    expect(fetchMock.mock.calls[0][0]).toBe(`${getApiUrl()}/api/files/uploads/upload%2Fone/complete`);
    expect(new Headers(fetchMock.mock.calls[0][1]?.headers).get("Idempotency-Key")).toBe("complete-1");
    expect(fetchMock.mock.calls[1][0]).toBe(`${getApiUrl()}/api/files/file%2Fone/access`);
    expect(String(fetchMock.mock.calls[0][0])).not.toContain("access-secret");
    expect(String(fetchMock.mock.calls[1][0])).not.toContain("access-secret");
  });

  it("reads the authoritative direct-upload lifecycle state", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({
      uploadId: "upload-1", fileId: "file-1", state: "ready", expectedMimeType: "image/png", expectedSizeBytes: 12,
    }), { status: 200, headers: { "Content-Type": "application/json" } }));

    await expect(getDirectFileUpload("access-token", "upload/one")).resolves.toMatchObject({ state: "ready" });

    expect(fetchMock.mock.calls[0][0]).toBe(`${getApiUrl()}/api/files/uploads/upload%2Fone`);
    expect(new Headers(fetchMock.mock.calls[0][1]?.headers).get("Authorization")).toBe("Bearer access-token");
  });

  it("uses the stable operation key through direct transfer and validation", async () => {
    const uploaded = {
      id: "file-1", familyId: "family-1", uploadedBy: "user-1", chatId: "chat-1", chatTitle: null,
      chatType: "group", originMessageId: null, accessScope: "chat", storageProvider: "minio",
      originalName: "photo.jpg", mimeType: "image/jpeg", sizeBytes: 3, checksum: null,
      createdAt: "2026-08-26T00:00:00Z", deletedAt: null, isFavorite: false,
    };
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({
        uploadId: "upload-1", fileId: "file-1", state: "reserved", uploadUrl: "https://media.example/upload",
        expectedMimeType: "image/jpeg", expectedSizeBytes: 3,
      }), { status: 200, headers: { "Content-Type": "application/json" } }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        uploadId: "upload-1", fileId: "file-1", state: "ready", expectedMimeType: "image/jpeg", expectedSizeBytes: 3,
      }), { status: 202, headers: { "Content-Type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify(uploaded), { status: 200, headers: { "Content-Type": "application/json" } }));

    await expect(uploadFile("access-token", new File(["abc"], "photo.jpg", { type: "image/jpeg" }), "chat-1", "operation-1"))
      .resolves.toMatchObject({ id: "file-1" });

    expect(fetchMock.mock.calls[0][0]).toBe(`${getApiUrl()}/api/files/uploads`);
    expect(new Headers(fetchMock.mock.calls[0][1]?.headers).get("Idempotency-Key")).toBe("operation-1");
    expect(fetchMock.mock.calls[1][0]).toBe("https://media.example/upload");
    expect(fetchMock.mock.calls[1][1]?.method).toBe("PUT");
    expect(fetchMock.mock.calls[2][0]).toBe(`${getApiUrl()}/api/files/uploads/upload-1/complete`);
    expect(new Headers(fetchMock.mock.calls[2][1]?.headers).get("Idempotency-Key")).toBe("operation-1");
    expect(fetchMock.mock.calls[3][0]).toBe(`${getApiUrl()}/api/files/file-1`);
  });
});
