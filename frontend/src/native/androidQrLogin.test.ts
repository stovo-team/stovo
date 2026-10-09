import { beforeEach, describe, expect, it, vi } from "vitest";
import { redeemAndroidQRLogin } from "../api/auth";
import { parseAndroidLoginQR } from "./androidQrLogin";
import { scanAndroidLoginQR } from "./androidQrScanner";
import { apiRequest, getApiUrl } from "../api/client";
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
