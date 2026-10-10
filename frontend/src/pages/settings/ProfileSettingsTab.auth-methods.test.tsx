import { act, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Capacitor } from "@capacitor/core";
import QRCode from "qrcode";
import * as client from "../../api/client";
import { strings } from "../../config/strings";
import { ProfileSettingsTab } from "./ProfileSettingsTab";

vi.mock("qrcode", () => ({ default: { toDataURL: vi.fn() } }));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const expiresAt = "2026-10-09T12:02:00Z";
const apiUrl = "https://example.test/s/family?route=a&name=two words";
const code = "grant/+?=&";

describe("Profile Settings Android sign-in", () => {
  let container: HTMLDivElement;
  let root: Root;
  let fetchMock: ReturnType<typeof vi.fn>;
  let props: ComponentProps<typeof ProfileSettingsTab>;

  beforeEach(() => {
    vi.spyOn(Capacitor, "isNativePlatform").mockReturnValue(false);
    vi.spyOn(client, "getApiUrl").mockReturnValue(apiUrl);
    vi.mocked(QRCode.toDataURL).mockReset().mockResolvedValue("data:image/png;base64,cXJjb2Rl");
    fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ requestId: code, expiresAt }), {
      status: 200, headers: { "Content-Type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchMock);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    props = {
      strings, profileForm: { displayName: "Alice", email: "", bio: "", timezone: "UTC" },
      passwordForm: { currentPassword: "", newPassword: "", confirmation: "" },
      setProfileForm: vi.fn(), setPasswordForm: vi.fn(), isSaving: false,
      accessToken: "secret-access-token", currentServerUrl: "https://stale.test", connectionLink: "", profilePhotoControl: null,
      notificationPreferences: { quietHoursEnabled: false, quietHoursStart: "22:00", quietHoursEnd: "07:00" },
      onProfileSubmit: vi.fn(), onPasswordSubmit: vi.fn(), onCopyConnection: vi.fn(), onNotificationPreferencesUpdate: vi.fn(),
    };
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  async function render() { await act(async () => root.render(<ProfileSettingsTab {...props} />)); }
  async function create(label = "Create Android sign-in QR") {
    const button = Array.from(container.querySelectorAll("button")).find((item) => item.textContent === label);
    expect(button, `Expected ${label} button`).toBeDefined();
    await act(async () => button!.click());
  }

  it("offers explicit creation with no initial QR or request", async () => {
    await render();
    expect(container.textContent).toContain("Create Android sign-in QR");
    expect(container.querySelector('img[alt="Android sign-in QR code"]')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("creates an authenticated grant and displays the encoded current-server QR and expiry", async () => {
    await render();
    await create();
    expect(fetchMock).toHaveBeenCalledWith("http://localhost:3000/api/auth/android-qr-login", expect.objectContaining({ method: "POST" }));
    const request = fetchMock.mock.calls[0][1] as RequestInit;
    expect(new Headers(request.headers).get("Authorization")).toBe("Bearer secret-access-token");
    const payload = String(vi.mocked(QRCode.toDataURL).mock.calls[0][0]);
    expect(payload).toBe("stovo://auth/android-login?version=1&apiUrl=https%3A%2F%2Fexample.test%2Fs%2Ffamily%3Froute%3Da%26name%3Dtwo%20words&code=grant%2F%2B%3F%3D%26");
    expect([...new URL(payload).searchParams.keys()]).toEqual(["version", "apiUrl", "code"]);
    expect(payload).not.toContain("secret-access-token");
    expect(container.querySelector('img[alt="Android sign-in QR code"]')?.getAttribute("src")).toBe("data:image/png;base64,cXJjb2Rl");
    expect(container.querySelector("time")?.dateTime).toBe(expiresAt);
    expect(container.querySelector("time")?.textContent).toBe(new Date(expiresAt).toLocaleString());
    expect(localStorage.length).toBe(0);
  });

  it("regenerates only on explicit action and replaces the displayed grant", async () => {
    await render();
    await create();
    await render();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ requestId: "second-code", expiresAt: "2026-10-09T12:04:00Z" }), {
      status: 200, headers: { "Content-Type": "application/json" },
    }));
    vi.mocked(QRCode.toDataURL).mockResolvedValueOnce("data:image/png;base64,c2Vjb25k");
    await create("Regenerate Android sign-in QR");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(new URL(String(vi.mocked(QRCode.toDataURL).mock.calls[1][0])).searchParams.get("code")).toBe("second-code");
    expect(container.querySelector("time")?.dateTime).toBe("2026-10-09T12:04:00Z");
    expect(container.querySelector('img[alt="Android sign-in QR code"]')?.getAttribute("src")).toBe("data:image/png;base64,c2Vjb25k");
  });

  it("reports API failure and allows retry without displaying a QR", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ detail: "Grant creation unavailable" }), {
      status: 503, headers: { "Content-Type": "application/json" },
    }));
    await render();
    await create();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("Grant creation unavailable");
    expect(container.querySelector('img[alt="Android sign-in QR code"]')).toBeNull();
    await create();
    expect(container.querySelector('img[alt="Android sign-in QR code"]')).not.toBeNull();
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  it("prevents duplicate requests while creation is pending", async () => {
    let resolve!: (response: Response) => void;
    fetchMock.mockReturnValueOnce(new Promise<Response>((done) => { resolve = done; }));
    await render();
    await create();
    const button = Array.from(container.querySelectorAll("button")).find((item) => item.textContent === "Creating…");
    expect(button?.disabled).toBe(true);
    await act(async () => button!.click());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async () => resolve(new Response(JSON.stringify({ requestId: code, expiresAt }), {
      status: 200, headers: { "Content-Type": "application/json" },
    })));
    expect(container.querySelector('img[alt="Android sign-in QR code"]')).not.toBeNull();
  });

  it("reports QR renderer failure without exposing the raw grant", async () => {
    vi.mocked(QRCode.toDataURL).mockRejectedValueOnce(new Error("Render failed"));
    await render();
    await create();
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
    expect(container.querySelector('img[alt="Android sign-in QR code"]')).toBeNull();
    expect(container.textContent).not.toContain(code);
  });

  it("hides the sign-in panel in a native app", async () => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
    await render();
    expect(container.textContent).not.toContain("Android sign-in QR");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("disables creation when there is no authenticated session", async () => {
    props.accessToken = null;
    await render();
    const button = Array.from(container.querySelectorAll("button")).find((item) => item.textContent === "Create Android sign-in QR");
    expect(button).toBeDefined();
    expect(button?.disabled).toBe(true);
  });
});
