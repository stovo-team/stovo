import { beforeEach, describe, expect, it, vi } from "vitest";
import { redeemAndroidQRLogin } from "../api/auth";
import { parseAndroidLoginQR } from "./androidQrLogin";
import { isAndroidQrCameraUnavailable, scanAndroidLoginQR } from "./androidQrScanner";
import { apiRequest, getApiUrl, setApiUrlOverride } from "../api/client";
import { getActiveServer, upsertServer } from "../api/serverRegistry";
import { clearApiResponseCache, peekApiResponseCache, saveApiResponseCache } from "../api/apiResponseCache";
const code = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnop0";
const payload = (apiUrl = "https://space.example/s/family/") => `stovo://auth/android-login?version=1&apiUrl=${encodeURIComponent(apiUrl)}&code=${code}`;
describe("Android QR parser", () => {
    it.each([["https://space.example/s/family/", "https://space.example/s/family"], ["http://localhost:8000/", "http://localhost:8000"], ["http://127.0.0.1:8000", "http://127.0.0.1:8000"], ["http://[::1]:8000", "http://[::1]:8000"]])("normalizes %s", (input, expected) => {
        expect(parseAndroidLoginQR).toBeTypeOf("function");
        expect(parseAndroidLoginQR(payload(input))).toEqual({ apiUrl: expected, requestId: code });
    });
    it.each([payload().replace("stovo:", "https:"), payload().replace("auth/", "other/"), payload().replace("android-login?", "qr?"), payload().replace("version=1", "version=2"), payload().replace(code, "bad-code"), payload().replace(code, "a".repeat(44)), payload("http://space.example"), payload("file:///tmp/login"), payload("ftp://space.example"), payload("https://user:password@space.example"), payload("http://localhost.example"), payload() + "&code=" + code, payload() + "#fragment"])("rejects %s", value => {
        expect(parseAndroidLoginQR).toBeTypeOf("function");
        expect(() => parseAndroidLoginQR(value)).toThrow();
    });
});
describe("explicit API server", () => {
    beforeEach(() => { localStorage.clear(); vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ accessToken: "access" }), { status: 200 }))); });
    it("uses normalized per-call base without adopting it or forwarding it to fetch", async () => {
        const selected = getApiUrl();
        await apiRequest("/api/probe", { apiBaseUrl: "https://scanned.example/s/family/", method: "POST" });
        expect(fetch).toHaveBeenCalledWith("https://scanned.example/s/family/api/probe", expect.not.objectContaining({ apiBaseUrl: expect.anything() }));
        expect(getApiUrl()).toBe(selected);
    });
    it("redeems on the scanned server without adopting it", async () => {
        const selected = getApiUrl();
        expect(redeemAndroidQRLogin).toBeTypeOf("function");
        expect(await redeemAndroidQRLogin("https://scanned.example", code)).toEqual({ accessToken: "access" });
        expect(fetch).toHaveBeenCalledWith(`https://scanned.example/api/auth/android-qr-login/${code}/redeem`, expect.objectContaining({ method: "POST" }));
        expect(getApiUrl()).toBe(selected);
    });
});
const scannerMocks = vi.hoisted(() => ({ scan: vi.fn(), available: vi.fn(), install: vi.fn(), platform: "android" }));
vi.mock("@capacitor/core", async (importOriginal) => ({ ...await importOriginal<typeof import("@capacitor/core")>(), Capacitor: { isNativePlatform: () => true, getPlatform: () => scannerMocks.platform } }));
vi.mock("@capacitor-mlkit/barcode-scanning", async (importOriginal) => ({ ...await importOriginal<typeof import("@capacitor-mlkit/barcode-scanning")>(), BarcodeScanner: { scan: scannerMocks.scan, isGoogleBarcodeScannerModuleAvailable: scannerMocks.available, installGoogleBarcodeScannerModule: scannerMocks.install } }));
describe("Android scanner boundary", () => {
    beforeEach(() => { scannerMocks.platform = "android"; scannerMocks.available.mockReset().mockResolvedValue({ available: true }); scannerMocks.scan.mockReset().mockResolvedValue({ barcodes: [{ rawValue: payload() }] }); scannerMocks.install.mockReset().mockResolvedValue(undefined); });
    it("scans a single QR code with the native scanner", async () => {
        expect(scanAndroidLoginQR).toBeTypeOf("function");
        expect(await scanAndroidLoginQR()).toBe(payload());
        expect(scannerMocks.scan).toHaveBeenCalledWith({ formats: ["QR_CODE"] });
    });
    it("returns null for native scanner cancellation", async () => {
        expect(scanAndroidLoginQR).toBeTypeOf("function");
        scannerMocks.scan.mockRejectedValueOnce(new Error("scan canceled."));
        expect(await scanAndroidLoginQR()).toBeNull();
    });
    it("propagates real scanner failures", async () => {
        expect(scanAndroidLoginQR).toBeTypeOf("function");
        scannerMocks.scan.mockRejectedValueOnce(new Error("camera error"));
        await expect(scanAndroidLoginQR()).rejects.toThrow("camera error");
    });
    it("recognizes camera access failures without changing scanner permissions", () => {
        expect(isAndroidQrCameraUnavailable(new Error("Camera permission denied"))).toBe(true);
        expect(isAndroidQrCameraUnavailable(new Error("network unavailable"))).toBe(false);
    });
    it("requests the missing Google scanner module and asks for a retry", async () => {
        expect(scanAndroidLoginQR).toBeTypeOf("function");
        scannerMocks.available.mockResolvedValueOnce({ available: false });
        await expect(scanAndroidLoginQR()).rejects.toThrow();
        expect(scannerMocks.install).toHaveBeenCalledOnce();
        expect(scannerMocks.scan).not.toHaveBeenCalled();
    });
    it("does not invoke scanning on iOS", async () => {
        expect(scanAndroidLoginQR).toBeTypeOf("function");
        scannerMocks.platform = "ios";
        expect(await scanAndroidLoginQR()).toBeNull();
        expect(scannerMocks.scan).not.toHaveBeenCalled();
    });
});


describe("explicit API server cache isolation", () => {
    const profileId = "cache-isolation-user";
    beforeEach(async () => {
        localStorage.clear();
        await clearApiResponseCache(profileId);
        setApiUrlOverride("https://selected.example");
        upsertServer({ ...getActiveServer()!, user: {
            id: profileId, familyId: "family", username: "sam", displayName: "Sam",
            role: "member", isActive: true, publicKey: null, profilePhoto: null,
            profileVisibility: "family", lastSeenVisibility: "family", readReceiptsEnabled: true,
        } });
        vi.stubGlobal("fetch", vi.fn());
    });
    it("does not return the selected server cache when an explicit-server GET fails", async () => {
        await saveApiResponseCache(profileId, "/api/family", { name: "Selected family" });
        vi.mocked(fetch).mockRejectedValueOnce(new Error("Scanned server offline"));
        await expect(apiRequest("/api/family", { accessToken: "scanned-access", apiBaseUrl: "https://scanned.example" })).rejects.toThrow("Scanned server offline");
    });
    it("does not replace the selected server cache after a successful explicit-server GET", async () => {
        await saveApiResponseCache(profileId, "/api/family", { name: "Selected family" });
        vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ name: "Scanned family" }), { status: 200 }));
        expect(await apiRequest("/api/family", { accessToken: "scanned-access", apiBaseUrl: "https://scanned.example" })).toEqual({ name: "Scanned family" });
        expect(peekApiResponseCache(profileId, "/api/family")).toEqual({ name: "Selected family" });
    });
    it("does not share an in-flight selected-server GET with an explicit-server GET", async () => {
        let resolveSelected!: (response: Response) => void;
        vi.mocked(fetch).mockReturnValueOnce(new Promise<Response>(resolve => { resolveSelected = resolve; }))
            .mockResolvedValueOnce(new Response(JSON.stringify({ name: "Scanned family" }), { status: 200 }));
        const selected = apiRequest("/api/family", { accessToken: "selected-access" });
        const scanned = apiRequest("/api/family", { accessToken: "scanned-access", apiBaseUrl: "https://scanned.example" });
        resolveSelected(new Response(JSON.stringify({ name: "Selected family" }), { status: 200 }));
        expect(await Promise.all([selected, scanned])).toEqual([{ name: "Selected family" }, { name: "Scanned family" }]);
        expect(fetch).toHaveBeenCalledTimes(2);
    });
});
