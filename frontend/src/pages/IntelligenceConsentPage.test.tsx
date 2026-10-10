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
