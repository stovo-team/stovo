import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ platform: "android", scan: vi.fn(), accept: vi.fn(), login: vi.fn() }));
vi.mock("@capacitor/core", async (importOriginal) => ({ ...await importOriginal<typeof import("@capacitor/core")>(), Capacitor: { isNativePlatform: () => true, getPlatform: () => mocks.platform } }));
vi.mock("../native/androidQrScanner", () => ({ scanAndroidLoginQR: mocks.scan }));
vi.mock("../auth/AuthContext", () => ({ useAuth: () => ({ currentUser: null, login: mocks.login, acceptAuthResponse: mocks.accept }) }));
import LoginPage from "./LoginPage";
import { getApiUrl } from "../api/client";
const code = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnop0";
const scannedUrl = "https://scanned.example/s/family";
const payload = `stovo://auth/android-login?version=1&apiUrl=${encodeURIComponent(scannedUrl)}&code=${code}`;
const response = { accessToken: "access", tokenType: "Bearer", expiresInSeconds: 900, refreshToken: "refresh", user: { id: "user", familyId: "family", username: "sam", displayName: "Sam", role: "member", isActive: true, publicKey: null, profilePhoto: null, profileVisibility: "family", lastSeenVisibility: "family", readReceiptsEnabled: true } };
(globalThis as typeof globalThis & {
    IS_REACT_ACT_ENVIRONMENT: boolean;
}).IS_REACT_ACT_ENVIRONMENT = true;
describe("Android QR login", () => {
    let container: HTMLDivElement;
    let root: Root;
    beforeEach(() => {
        localStorage.clear();
        mocks.platform = "android";
        mocks.scan.mockReset().mockResolvedValue(payload);
        mocks.accept.mockReset().mockImplementation(() => { expect(getApiUrl()).toBe(scannedUrl); });
        vi.stubGlobal("fetch", vi.fn(async (url: string) => new Response(JSON.stringify(url.endsWith("setup-status") ? { setupRequired: false } : response), { status: 200 })));
        container = document.createElement("div");
        document.body.append(container);
        root = createRoot(container);
    });
    afterEach(() => { act(() => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
    async function render() { await act(async () => root.render(<MemoryRouter><LoginPage /></MemoryRouter>)); }
    async function click(text: string) { const button = [...container.querySelectorAll("button")].find(item => item.textContent?.includes(text)); expect(button, `Missing action: ${text}`).toBeTruthy(); await act(async () => button!.click()); }
    function expectPassword() { expect(container.querySelector('input[autocomplete="current-password"]')).not.toBeNull(); }
    function expectNoRedemption() { expect(vi.mocked(fetch).mock.calls.filter(([url]) => String(url).endsWith("/redeem"))).toHaveLength(0); }
    it("shows host and waits for confirmation; rejection retains selection", async () => {
        await render();
        const selected = getApiUrl();
        await click("Scan desktop QR");
        expect(container.textContent).toContain("scanned.example");
        expectNoRedemption();
        expect(getApiUrl()).toBe(selected);
        await click("Cancel");
        expectNoRedemption();
        expect(getApiUrl()).toBe(selected);
        expectPassword();
    });
    it("adopts only after redemption and before accepting auth", async () => {
        await render();
        await click("Scan desktop QR");
        await click("Confirm sign-in");
        expect(fetch).toHaveBeenCalledWith(`${scannedUrl}/api/auth/android-qr-login/${code}/redeem`, expect.objectContaining({ method: "POST" }));
        expect(getApiUrl()).toBe(scannedUrl);
        expect(mocks.accept).toHaveBeenCalledWith(response);
    });
    it("retains selection and password when redemption fails", async () => {
        await render();
        const selected = getApiUrl();
        await click("Scan desktop QR");
        vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ detail: "Expired grant" }), { status: 401 }));
        await click("Confirm sign-in");
        expect(getApiUrl()).toBe(selected);
        expect(mocks.accept).not.toHaveBeenCalled();
        expectPassword();
        expect(container.querySelector('[role="alert"]')).not.toBeNull();
    });
    it.each([null, new Error("Camera unavailable"), "invalid qr"])("recovers scan cancellation or failure: %s", async (result) => {
        if (result instanceof Error)
            mocks.scan.mockRejectedValueOnce(result);
        else
            mocks.scan.mockResolvedValueOnce(result);
        await render();
        const selected = getApiUrl();
        await click("Scan desktop QR");
        expectPassword();
        expectNoRedemption();
        expect(getApiUrl()).toBe(selected);
        expect(mocks.accept).not.toHaveBeenCalled();
        expect(container.querySelector('button[type="submit"]')?.hasAttribute("disabled")).toBe(false);
    });
    it("hides scanner on iOS", async () => { mocks.platform = "ios"; await render(); expect(container.textContent).not.toContain("Scan desktop QR"); expectPassword(); });
});
