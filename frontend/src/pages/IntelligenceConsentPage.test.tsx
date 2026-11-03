import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { IntelligenceConsentPage } from "./IntelligenceConsentPage";
import { englishStrings } from "../config/strings";

const mocks = vi.hoisted(() => ({ authRequest: vi.fn() }));

vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({
    currentUser: { id: "user-1", displayName: "Alex" },
    authRequest: mocks.authRequest,
  }),
}));

const offer = {
  client_id: "intelligence-client",
  redirect_uri: "https://intelligence.example/callback?tenant=one",
  state: "opaque-state",
  chats: [
    { id: "chat-a", title: "Project Alpha" },
    { id: "chat-b", title: "Family archive" },
  ],
  grants: { read: false, process: false, external_transfer: false, export: false },
};

const consentQuery = "?flow=source_v2&response_type=code&client_id=intelligence-client&redirect_uri=https%3A%2F%2Fintelligence.example%2Fcallback%3Ftenant%3Done&state=opaque-state&code_challenge=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA&code_challenge_method=S256";
const oidcParameters = {
  response_type: "code",
  client_id: "intelligence-client-with-a-long-registered-name-for-narrow-screen-wrapping",
  redirect_uri: "https://intelligence.example/callback/with/a/long/path?tenant=one&region=north",
  state: "opaque-oidc-state",
  nonce: "opaque-oidc-nonce",
  code_challenge: "BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB",
  code_challenge_method: "S256",
};
const oidcConsentQuery = `?${new URLSearchParams({ flow: "oidc", ...oidcParameters }).toString()}`;

const mountedRoots: Root[] = [];
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  while (mountedRoots.length > 0) act(() => mountedRoots.pop()?.unmount());
  document.body.innerHTML = "";
  vi.clearAllMocks();
});

function setOfferResponse(response: unknown) {
  mocks.authRequest.mockImplementation(async (endpoint: string) => {
    if (endpoint.startsWith("/api/v2/intelligence/authorize?")) {
      if (response instanceof Error) throw response;
      return response;
    }
    return { expires_in: 120 };
  });
}

async function renderConsent(entry = `/intelligence/consent${consentQuery}`) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  mountedRoots.push(root);
  await act(async () => {
    root.render(<MemoryRouter initialEntries={[entry]}><IntelligenceConsentPage strings={englishStrings} /></MemoryRouter>);
  });
  return container;
}

describe("IntelligenceConsentPage", () => {
  it("shows OIDC request details as labeled values and exposes Continue as a button", async () => {
    const container = await renderConsent(`/intelligence/consent${oidcConsentQuery}`);
    const details = container.querySelector("dl");

    expect(details).not.toBeNull();
    expect(Array.from(details!.querySelectorAll("dt"), (term) => term.textContent)).toEqual([
      englishStrings.intelligence.consentClient,
      englishStrings.intelligence.consentCallback,
    ]);
    expect(Array.from(details!.querySelectorAll("dd code"), (value) => value.textContent)).toEqual([
      oidcParameters.client_id,
      oidcParameters.redirect_uri,
    ]);
    const continueButton = container.querySelector<HTMLButtonElement>("button");
    expect(continueButton?.getAttribute("aria-label")).toBeNull();
    expect(continueButton?.getAttribute("aria-labelledby")).toBeNull();
    expect(continueButton?.textContent?.trim()).toBe(englishStrings.intelligence.continueToIntelligence);
  });

  it("sends the unchanged OIDC request parameters when creating a browser session", async () => {
    mocks.authRequest.mockRejectedValue(new Error("unavailable"));
    const container = await renderConsent(`/intelligence/consent${oidcConsentQuery}`);

    await act(async () => {
      container.querySelector<HTMLButtonElement>("button")!.click();
    });

    expect(mocks.authRequest).toHaveBeenCalledWith("/api/v2/intelligence/authorize-session", {
      method: "POST",
      body: { flow: "oidc", ...oidcParameters },
    });
    expect(container.querySelector('[role="alert"]')?.textContent).toBe(englishStrings.intelligence.consentUnavailable);
  });

  it("disables Continue while the OIDC browser session is pending and shows a safe failure", async () => {
    let rejectSession: (reason: unknown) => void = () => undefined;
    mocks.authRequest.mockReturnValue(new Promise((_resolve, reject) => { rejectSession = reject; }));
    const container = await renderConsent(`/intelligence/consent${oidcConsentQuery}`);
    const button = container.querySelector<HTMLButtonElement>("button")!;

    await act(async () => { button.click(); });
    expect(button.disabled).toBe(true);

    await act(async () => { rejectSession(new Error("untrusted server detail")); });
    expect(button.disabled).toBe(false);
    expect(container.querySelector('[role="alert"]')?.textContent).toBe(englishStrings.intelligence.consentUnavailable);
    expect(container.textContent).not.toContain("untrusted server detail");
  });

  it("shows the exact client and callback, one-chat choices, and four grants denied by default", async () => {
    setOfferResponse(offer);

    const container = await renderConsent();

    expect(container.textContent).toContain("intelligence-client");
    expect(container.textContent).toContain("https://intelligence.example/callback?tenant=one");
    expect(container.querySelectorAll("[name=chat_id]")).toHaveLength(2);
    const grants = Array.from(container.querySelectorAll<HTMLInputElement>("input[type=checkbox]"));
    expect(grants).toHaveLength(4);
    expect(grants.every((checkbox) => !checkbox.checked)).toBe(true);
  });

  it("creates the browser session for only the selected chat and selected grants", async () => {
    setOfferResponse(offer);
    const submit = vi.spyOn(HTMLFormElement.prototype, "submit").mockImplementation(() => undefined);

    const container = await renderConsent();
    const chat = container.querySelector<HTMLInputElement>('input[name="chat_id"][value="chat-b"]')!;
    const grants = Array.from(container.querySelectorAll<HTMLInputElement>("input[type=checkbox]"));
    await act(async () => {
      chat.click();
      grants[0].click();
      grants[2].click();
      container.querySelector<HTMLButtonElement>("button[type=submit]")!.click();
    });

    expect(mocks.authRequest).toHaveBeenCalledWith("/api/v2/intelligence/authorize-session", expect.objectContaining({
      method: "POST",
      body: expect.objectContaining({
        flow: "source_v2",
        client_id: "intelligence-client",
        redirect_uri: "https://intelligence.example/callback?tenant=one",
        state: "opaque-state",
        chat_id: "chat-b",
        grants: { read: true, process: false, external_transfer: true, export: false },
      }),
    }));
    expect(submit).toHaveBeenCalledOnce();
    const form = container.querySelector<HTMLFormElement>("form")!;
    expect(form.method.toLowerCase()).toBe("post");
    expect(form.action).toContain("/api/v2/intelligence/authorize");
    expect(form.querySelector<HTMLInputElement>('input[name="chat_id"]:checked')?.value).toBe("chat-b");
  });

  it("renders a safe error when callback parameters or the server offer are invalid", async () => {
    setOfferResponse(new Error("unavailable"));
    const container = await renderConsent();
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
    expect(container.querySelector("form")).toBeNull();
  });

  it("rejects an untrusted callback before requesting or rendering a consent offer", async () => {
    const invalidCallback = consentQuery.replace("https%3A%2F%2Fintelligence.example", "http%3A%2F%2Fattacker.example");
    const container = await renderConsent(`/intelligence/consent${invalidCallback}`);

    expect(container.textContent).toContain(englishStrings.intelligence.invalidConsentRequest);
    expect(mocks.authRequest).not.toHaveBeenCalled();
    expect(container.querySelector("form")).toBeNull();
  });
});
